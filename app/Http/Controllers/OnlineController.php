<?php

namespace App\Http\Controllers;

use App\Models\AnyDesckCode;
use App\Models\ChatMessage;
use App\Models\OnlineUser;
use App\Models\User;
use App\Support\ManagementScope;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class OnlineController extends Controller
{
    private const ROLE_LABELS = [
        0 => 'MASTER',
        1 => 'GERENTE',
        2 => 'SUB-GERENTE',
        3 => 'CAIXA',
        4 => 'LANCHONETE',
        5 => 'FUNCIONARIO',
        6 => 'CLIENTE',
    ];

    private const ANYDESCK_ROLE_TYPE_MAP = [
        3 => 'Caixa',
        4 => 'Lanchonete',
    ];

    private const ONLINE_WINDOW_MINUTES = 2;
    private const PRESENCE_RETENTION_MINUTES = 30;
    private const MESSAGE_LIMIT = 120;

    public function index(Request $request): Response
    {
        $user = $this->ensureCanAccessOnline($request->user());
        $this->touchPresence($request, $user);

        return Inertia::render('Online/Index', $this->buildSnapshotPayload($request));
    }

    public function snapshot(Request $request): JsonResponse
    {
        $user = $this->ensureCanAccessOnline($request->user());
        $this->touchPresence($request, $user);

        return response()->json(
            $this->buildSnapshotPayload(
                $request,
                $request->filled('selected_user_id') ? (int) $request->query('selected_user_id') : null
            )
        );
    }

    public function heartbeat(Request $request): JsonResponse
    {
        $user = $this->ensureCanAccessOnline($request->user());
        $presence = $this->touchPresence($request, $user);

        return response()->json([
            'ok' => true,
            'last_seen_at' => optional($presence->last_seen_at)->toIso8601String(),
        ]);
    }

    public function summary(Request $request): JsonResponse
    {
        $user = $this->ensureCanAccessOnline($request->user());

        return response()->json($this->buildUnreadSummary((int) $user->id));
    }

    public function anydesck(Request $request): JsonResponse
    {
        $user = $this->ensureCanAccessOnline($request->user());
        $this->touchPresence($request, $user);

        return response()->json(
            $this->buildAnyDesckPayload($request, $user, $this->resolveAnyDesckType($request, $user))
        );
    }

    public function updateAnydesck(Request $request): JsonResponse
    {
        $user = $this->ensureCanAccessOnline($request->user());
        $this->touchPresence($request, $user);

        $type = $this->resolveAnyDesckType($request, $user);
        $unitId = $this->resolveActiveUnitId($request);

        if (! $unitId) {
            throw ValidationException::withMessages([
                'type' => 'Nenhuma loja ativa foi encontrada para este usuario.',
            ]);
        }

        $normalizedCode = $this->normalizeAnyDesckCode((string) $request->input('code'));
        $request->merge([
            'code' => $normalizedCode,
        ]);

        $data = $request->validate([
            'code' => ['required', 'string', 'regex:/^\d \d{3} \d{3} \d{3}$/'],
        ], [
            'code.required' => 'Informe o codigo AnyDesk.',
            'code.regex' => 'Use o formato 1 186 429 402.',
        ]);

        AnyDesckCode::updateOrCreate(
            [
                'unit_id' => $unitId,
                'type' => $type,
            ],
            [
                'code' => $data['code'],
            ]
        );

        return response()->json(
            $this->buildAnyDesckPayload($request, $user, $type)
        );
    }

    public function storeMessage(Request $request): JsonResponse
    {
        $user = $this->ensureCanAccessOnline($request->user());
        $presence = $this->touchPresence($request, $user);

        $data = $request->validate([
            'recipient_user_id' => ['required', 'integer', 'exists:users,id'],
            'message' => ['required', 'string', 'max:2000'],
        ]);

        $recipientId = (int) $data['recipient_user_id'];
        $message = trim((string) $data['message']);

        if ($message === '') {
            throw ValidationException::withMessages([
                'message' => 'Digite uma mensagem antes de enviar.',
            ]);
        }

        $recipient = $this->resolveVisibleContact($request, $user, $recipientId);
        if (! $recipient) {
            throw ValidationException::withMessages([
                'recipient_user_id' => 'O usuario selecionado nao esta on-line ou nao pode ser acessado por este perfil.',
            ]);
        }

        ChatMessage::create([
            'sender_id' => $user->id,
            'recipient_id' => $recipientId,
            'sender_role' => (int) $presence->active_role,
            'sender_unit_id' => $presence->active_unit_id,
            'message' => $message,
        ]);

        return response()->json($this->buildSnapshotPayload($request, $recipientId));
    }

    public function updateMessage(Request $request, ChatMessage $message): JsonResponse
    {
        $user = $this->ensureCanAccessOnline($request->user());
        $this->touchPresence($request, $user);

        if ((int) $message->sender_id !== (int) $user->id) {
            abort(403);
        }

        if ($message->read_at) {
            throw ValidationException::withMessages([
                'message' => 'Mensagens lidas nao podem ser editadas.',
            ]);
        }

        $data = $request->validate([
            'message' => ['required', 'string', 'max:2000'],
        ]);

        $nextMessage = trim((string) $data['message']);

        if ($nextMessage === '') {
            throw ValidationException::withMessages([
                'message' => 'Digite uma mensagem antes de salvar.',
            ]);
        }

        $message->update([
            'message' => $nextMessage,
        ]);

        return response()->json(
            $this->buildSnapshotPayload($request, (int) $message->recipient_id)
        );
    }

    public function destroyMessage(Request $request, ChatMessage $message): JsonResponse
    {
        $user = $this->ensureCanAccessOnline($request->user());
        $this->touchPresence($request, $user);

        if ((int) $message->sender_id !== (int) $user->id) {
            abort(403);
        }

        if ($message->read_at) {
            throw ValidationException::withMessages([
                'message' => 'Mensagens lidas nao podem ser excluidas.',
            ]);
        }

        $recipientId = (int) $message->recipient_id;
        $message->delete();

        return response()->json(
            $this->buildSnapshotPayload($request, $recipientId)
        );
    }

    private function buildSnapshotPayload(Request $request, ?int $selectedUserId = null): array
    {
        $user = $this->ensureCanAccessOnline($request->user());
        $this->purgeExpiredPresence();

        $visibleContacts = $this->buildVisibleContacts($request, $user);
        $onlineUsers = $visibleContacts['online'];
        $offlineUsers = $visibleContacts['offline'];
        $visibleUserIds = collect($onlineUsers)->pluck('id')
            ->merge(collect($offlineUsers)->pluck('id'))
            ->unique()
            ->values();

        if (! $visibleUserIds->contains($selectedUserId)) {
            $selectedUserId = $visibleUserIds->first();
        }

        if ($selectedUserId) {
            $this->markConversationAsRead($user->id, (int) $selectedUserId);
        }

        return [
            'onlineUsers' => $onlineUsers,
            'offlineUsers' => $offlineUsers,
            'selectedUserId' => $selectedUserId ? (int) $selectedUserId : null,
            'messages' => $selectedUserId
                ? $this->buildConversation((int) $user->id, (int) $selectedUserId)
                : [],
            'unreadSummary' => $this->buildUnreadSummary((int) $user->id),
            'currentUser' => [
                'id' => (int) $user->id,
                'name' => (string) $user->name,
                'role' => (int) $user->funcao,
                'role_label' => self::ROLE_LABELS[(int) $user->funcao] ?? '---',
                'original_role' => (int) ($user->funcao_original ?? $user->funcao),
                'original_role_label' => self::ROLE_LABELS[(int) ($user->funcao_original ?? $user->funcao)] ?? '---',
                'unit_id' => $this->resolveActiveUnitId($request),
                'unit_name' => $this->resolveActiveUnitName($request),
            ],
            'presenceWindowSeconds' => self::ONLINE_WINDOW_MINUTES * 60,
        ];
    }

    private function buildVisibleContacts(Request $request, User $viewer): array
    {
        $viewerRole = (int) $viewer->funcao;
        $viewerUnitId = $this->resolveActiveUnitId($request);
        $managedUnitIds = $this->managedUnitIds($viewer);
        $activeSince = now()->subMinutes(self::ONLINE_WINDOW_MINUTES);

        $visiblePresences = OnlineUser::query()
            ->with([
                'user.units:tb2_id,tb2_nome',
                'unit:tb2_id,tb2_nome',
            ])
            ->where('last_seen_at', '>=', $activeSince)
            ->orderByDesc('last_seen_at')
            ->get()
            ->filter(function (?OnlineUser $presence) use ($viewer, $viewerRole, $viewerUnitId, $managedUnitIds) {
                if (! $presence || ! $presence->user) {
                    return false;
                }

                if ((int) $presence->user_id === (int) $viewer->id) {
                    return false;
                }

                return $this->canSeePresence(
                    $viewerRole,
                    $viewerUnitId,
                    $managedUnitIds,
                    (int) $presence->active_role,
                    $presence->active_unit_id ? (int) $presence->active_unit_id : null
                );
            })
            ->groupBy('user_id')
            ->map(fn (Collection $group) => $group->sortByDesc('last_seen_at')->first())
            ->values();

        $onlineUserIds = $visiblePresences->pluck('user_id')->map(fn ($value) => (int) $value)->all();

        $onlineUsers = $visiblePresences
            ->map(function (OnlineUser $presence) {
                return $this->buildContactPayload(
                    target: $presence->user,
                    currentRole: (int) $presence->active_role,
                    unitId: $presence->active_unit_id ? (int) $presence->active_unit_id : null,
                    unitName: $presence->unit?->tb2_nome ?? 'Sem loja ativa',
                    isOnline: true,
                    lastSeenAt: optional($presence->last_seen_at)->toIso8601String(),
                );
            })
            ->sortBy(fn (array $item) => mb_strtolower($item['name'], 'UTF-8'))
            ->values();

        $offlineUsers = User::query()
            ->with(['primaryUnit:tb2_id,tb2_nome', 'units:tb2_id,tb2_nome'])
            ->whereNotIn('id', array_merge($onlineUserIds, [(int) $viewer->id]))
            ->where(function ($query) {
                $query->whereIn('funcao', [0, 1, 2, 3, 4])
                    ->orWhereIn('funcao_original', [0, 1, 2, 3, 4]);
            })
            ->get()
            ->filter(function (User $target) use ($viewerRole, $viewerUnitId, $managedUnitIds) {
                $targetRole = (int) $target->funcao;
                $targetUnitIds = ManagementScope::targetUserUnitIds($target);
                $primaryTargetUnitId = $targetUnitIds->first();

                return $this->canSeeOfflineUser(
                    $viewerRole,
                    $viewerUnitId,
                    $managedUnitIds,
                    $targetRole,
                    $targetUnitIds,
                    $primaryTargetUnitId ? (int) $primaryTargetUnitId : null
                );
            })
            ->map(fn (User $target) => $this->buildOfflineContactPayload($target))
            ->sortBy(fn (array $item) => mb_strtolower($item['name'], 'UTF-8'))
            ->values();

        $existingContactIds = $onlineUsers->pluck('id')
            ->merge($offlineUsers->pluck('id'))
            ->unique()
            ->values()
            ->all();

        $conversationOnlyUsers = User::query()
            ->with(['primaryUnit:tb2_id,tb2_nome', 'units:tb2_id,tb2_nome'])
            ->whereIn('id', $this->conversationContactIds((int) $viewer->id))
            ->whereNotIn('id', array_merge($existingContactIds, [(int) $viewer->id]))
            ->get()
            ->map(fn (User $target) => $this->buildOfflineContactPayload($target))
            ->sortBy(fn (array $item) => mb_strtolower($item['name'], 'UTF-8'))
            ->values();

        if ($conversationOnlyUsers->isNotEmpty()) {
            $offlineUsers = $offlineUsers
                ->concat($conversationOnlyUsers)
                ->unique('id')
                ->values();
        }

        $visibleUserIds = $onlineUsers->pluck('id')
            ->merge($offlineUsers->pluck('id'))
            ->unique()
            ->values()
            ->all();

        $latestMessageMetaByContact = $this->latestMessageMetaByContact((int) $viewer->id, $visibleUserIds);

        $unreadBySender = empty($visibleUserIds)
            ? collect()
            : ChatMessage::query()
                ->selectRaw('sender_id, COUNT(*) as total')
                ->where('recipient_id', $viewer->id)
                ->whereNull('read_at')
                ->whereIn('sender_id', $visibleUserIds)
                ->groupBy('sender_id')
                ->pluck('total', 'sender_id');

        $attachUnread = fn (Collection $contacts) => $contacts
            ->map(function (array $contact) use ($unreadBySender, $latestMessageMetaByContact) {
                $messageMeta = $latestMessageMetaByContact[(int) $contact['id']] ?? null;
                $contact['unread_count'] = (int) ($unreadBySender[(int) $contact['id']] ?? 0);
                $contact['last_message_preview'] = (string) ($messageMeta['preview'] ?? '');
                $contact['last_message_at'] = $messageMeta['sent_at'] ?? null;

                return $contact;
            })
            ->values()
            ->all();

        return [
            'online' => $attachUnread($onlineUsers),
            'offline' => $attachUnread($offlineUsers),
        ];
    }

    private function buildUnreadSummary(int $viewerId): array
    {
        $baseQuery = ChatMessage::query()
            ->where('recipient_id', $viewerId)
            ->whereNull('read_at');

        return [
            'unread_total' => (clone $baseQuery)->count(),
            'unread_sender_ids' => (clone $baseQuery)
                ->select('sender_id')
                ->distinct()
                ->pluck('sender_id')
                ->map(fn ($value) => (int) $value)
                ->values()
                ->all(),
        ];
    }

    private function latestMessageMetaByContact(int $viewerId, array $visibleUserIds): array
    {
        if (empty($visibleUserIds)) {
            return [];
        }

        $messages = ChatMessage::query()
            ->select(['id', 'sender_id', 'recipient_id', 'message', 'created_at'])
            ->where(function ($query) use ($viewerId, $visibleUserIds) {
                $query->where('sender_id', $viewerId)
                    ->whereIn('recipient_id', $visibleUserIds);
            })
            ->orWhere(function ($query) use ($viewerId, $visibleUserIds) {
                $query->where('recipient_id', $viewerId)
                    ->whereIn('sender_id', $visibleUserIds);
            })
            ->orderByDesc('id')
            ->get();

        $messageMeta = [];

        foreach ($messages as $message) {
            $contactId = (int) ((int) $message->sender_id === $viewerId ? $message->recipient_id : $message->sender_id);

            if (isset($messageMeta[$contactId])) {
                continue;
            }

            $messageMeta[$contactId] = [
                'preview' => $this->messagePreview((string) $message->message),
                'sent_at' => optional($message->created_at)->toIso8601String(),
            ];
        }

        return $messageMeta;
    }

    private function messagePreview(string $message): string
    {
        $plainText = preg_replace(
            '/\[color=[^\]]+\]|\[\/color\]|\[b\]|\[\/b\]|\[i\]|\[\/i\]|\[u\]|\[\/u\]|\[link=[^\]]+\]|\[\/link\]/i',
            '',
            $message
        );
        $plainText = preg_replace('/\s+/u', ' ', (string) $plainText);
        $plainText = trim((string) $plainText);

        if ($plainText === '') {
            return '';
        }

        return (string) Str::limit($plainText, 35, '...');
    }

    private function buildConversation(int $viewerId, int $otherUserId): array
    {
        return ChatMessage::query()
            ->with(['sender:id,name,funcao,funcao_original'])
            ->where(function ($query) use ($viewerId, $otherUserId) {
                $query->where('sender_id', $viewerId)
                    ->where('recipient_id', $otherUserId);
            })
            ->orWhere(function ($query) use ($viewerId, $otherUserId) {
                $query->where('sender_id', $otherUserId)
                    ->where('recipient_id', $viewerId);
            })
            ->orderByDesc('id')
            ->limit(self::MESSAGE_LIMIT)
            ->get()
            ->reverse()
            ->values()
            ->map(fn (ChatMessage $message) => [
                'id' => (int) $message->id,
                'sender_id' => (int) $message->sender_id,
                'recipient_id' => (int) $message->recipient_id,
                'message' => (string) $message->message,
                'sender_name' => (string) ($message->sender?->name ?? '---'),
                'sent_at' => optional($message->created_at)->toIso8601String(),
                'read_at' => optional($message->read_at)->toIso8601String(),
                'sender_role' => (int) $message->sender_role,
                'sender_role_label' => self::ROLE_LABELS[(int) $message->sender_role] ?? '---',
                'sender_original_role' => (int) ($message->sender?->funcao_original ?? $message->sender?->funcao ?? $message->sender_role),
                'sender_original_role_label' => self::ROLE_LABELS[(int) ($message->sender?->funcao_original ?? $message->sender?->funcao ?? $message->sender_role)] ?? '---',
                'is_mine' => (int) $message->sender_id === $viewerId,
                'can_manage' => (int) $message->sender_id === $viewerId && $message->read_at === null,
            ])
            ->all();
    }

    private function buildOfflineContactPayload(User $target): array
    {
        $targetUnitIds = ManagementScope::targetUserUnitIds($target);
        $primaryTargetUnitId = $targetUnitIds->first();
        $unitName = $target->primaryUnit?->tb2_nome
            ?? $target->units->firstWhere('tb2_id', $primaryTargetUnitId)?->tb2_nome
            ?? $target->units->first()?->tb2_nome
            ?? 'Sem loja ativa';

        return $this->buildContactPayload(
            target: $target,
            currentRole: (int) $target->funcao,
            unitId: $primaryTargetUnitId ? (int) $primaryTargetUnitId : null,
            unitName: $unitName,
            isOnline: false,
            lastSeenAt: null,
        );
    }

    private function buildContactPayload(
        User $target,
        int $currentRole,
        ?int $unitId,
        ?string $unitName,
        bool $isOnline,
        ?string $lastSeenAt,
    ): array {
        $originalRole = (int) ($target->funcao_original ?? $target->funcao ?? $currentRole);

        return [
            'id' => (int) $target->id,
            'name' => (string) $target->name,
            'role' => $currentRole,
            'role_label' => self::ROLE_LABELS[$currentRole] ?? '---',
            'original_role' => $originalRole,
            'original_role_label' => self::ROLE_LABELS[$originalRole] ?? '---',
            'unit_id' => $unitId,
            'unit_name' => $unitName ?? 'Sem loja ativa',
            'last_seen_at' => $lastSeenAt,
            'is_online' => $isOnline,
        ];
    }

    private function conversationContactIds(int $viewerId): array
    {
        return ChatMessage::query()
            ->select(['sender_id', 'recipient_id'])
            ->where('sender_id', $viewerId)
            ->orWhere('recipient_id', $viewerId)
            ->orderByDesc('id')
            ->get()
            ->flatMap(function (ChatMessage $message) use ($viewerId) {
                return [
                    (int) $message->sender_id === $viewerId ? (int) $message->recipient_id : (int) $message->sender_id,
                ];
            })
            ->filter(fn (int $contactId) => $contactId > 0 && $contactId !== $viewerId)
            ->unique()
            ->values()
            ->all();
    }

    private function buildAnyDesckPayload(Request $request, User $user, string $type): array
    {
        $unitId = $this->resolveActiveUnitId($request);
        $unitName = $this->resolveActiveUnitName($request);

        if (! $unitId) {
            throw ValidationException::withMessages([
                'type' => 'Nenhuma loja ativa foi encontrada para este usuario.',
            ]);
        }

        $record = AnyDesckCode::query()
            ->where('unit_id', $unitId)
            ->where('type', $type)
            ->first();

        return [
            'role' => (int) $user->funcao,
            'role_label' => self::ROLE_LABELS[(int) $user->funcao] ?? '---',
            'unit_id' => $unitId,
            'unit_name' => $unitName ?? ('Loja #' . $unitId),
            'type' => $type,
            'code' => $record?->code,
            'code_record_id' => $record?->id,
        ];
    }

    private function resolveVisibleContact(Request $request, User $viewer, int $recipientId): ?array
    {
        $contacts = $this->buildVisibleContacts($request, $viewer);

        return collect($contacts['online'])
            ->merge($contacts['offline'])
            ->first(fn (array $user) => (int) $user['id'] === $recipientId);
    }

    private function resolveAnyDesckType(Request $request, User $user): string
    {
        $role = (int) $user->funcao;

        if (array_key_exists($role, self::ANYDESCK_ROLE_TYPE_MAP)) {
            return self::ANYDESCK_ROLE_TYPE_MAP[$role];
        }

        $type = trim((string) ($request->query('type', $request->input('type')) ?? ''));

        if (! in_array($type, ['Caixa', 'Lanchonete'], true)) {
            throw ValidationException::withMessages([
                'type' => 'Selecione se voce esta na maquina do Caixa ou da Lanchonete.',
            ]);
        }

        return $type;
    }

    private function touchPresence(Request $request, User $user): OnlineUser
    {
        $sessionId = (string) $request->session()->getId();

        $presence = OnlineUser::updateOrCreate(
            ['session_id' => $sessionId],
            [
                'user_id' => $user->id,
                'active_role' => (int) $user->funcao,
                'active_unit_id' => $this->resolveActiveUnitId($request),
                'last_seen_at' => now(),
            ]
        );

        $this->purgeExpiredPresence();

        return $presence->fresh(['user', 'unit']) ?? $presence;
    }

    private function purgeExpiredPresence(): void
    {
        OnlineUser::query()
            ->where('last_seen_at', '<', now()->subMinutes(self::PRESENCE_RETENTION_MINUTES))
            ->delete();
    }

    private function markConversationAsRead(int $viewerId, int $otherUserId): void
    {
        ChatMessage::query()
            ->where('sender_id', $otherUserId)
            ->where('recipient_id', $viewerId)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);
    }

    private function canSeePresence(
        int $viewerRole,
        ?int $viewerUnitId,
        Collection $managedUnitIds,
        int $targetRole,
        ?int $targetUnitId
    ): bool {
        if (in_array($targetRole, [5, 6], true)) {
            return false;
        }

        if ($viewerRole === 0) {
            return true;
        }

        if ($viewerRole === 1) {
            return $targetUnitId !== null && $managedUnitIds->contains($targetUnitId);
        }

        if (in_array($viewerRole, [2, 3], true)) {
            return $targetRole === 0
                || $targetRole === 1
                || ($viewerUnitId !== null && $targetUnitId === $viewerUnitId);
        }

        if ($viewerRole === 4) {
            return $viewerUnitId !== null
                && $targetUnitId === $viewerUnitId
                && in_array($targetRole, [2, 3], true);
        }

        return false;
    }

    private function canSeeOfflineUser(
        int $viewerRole,
        ?int $viewerUnitId,
        Collection $managedUnitIds,
        int $targetRole,
        Collection $targetUnitIds,
        ?int $primaryTargetUnitId
    ): bool {
        if (in_array($targetRole, [5, 6], true)) {
            return false;
        }

        if ($viewerRole === 0) {
            return true;
        }

        if ($viewerRole === 1) {
            return $targetUnitIds->isNotEmpty()
                && $targetUnitIds->contains(fn (int $unitId) => $managedUnitIds->contains($unitId));
        }

        if (in_array($viewerRole, [2, 3], true)) {
            return $targetRole === 0
                || $targetRole === 1
                || ($viewerUnitId !== null && $targetUnitIds->contains($viewerUnitId));
        }

        if ($viewerRole === 4) {
            return $viewerUnitId !== null
                && $targetUnitIds->contains($viewerUnitId)
                && in_array($targetRole, [2, 3], true);
        }

        return $primaryTargetUnitId !== null
            && $this->canSeePresence($viewerRole, $viewerUnitId, $managedUnitIds, $targetRole, $primaryTargetUnitId);
    }

    private function managedUnitIds(User $user): Collection
    {
        return ManagementScope::managedUnitIds($user);
    }

    private function resolveActiveUnitId(Request $request): ?int
    {
        $unit = $request->session()->get('active_unit');
        $unitId = is_array($unit)
            ? ($unit['id'] ?? $unit['tb2_id'] ?? null)
            : (is_object($unit) ? ($unit->id ?? $unit->tb2_id ?? null) : null);

        return $unitId ? (int) $unitId : null;
    }

    private function resolveActiveUnitName(Request $request): ?string
    {
        $unit = $request->session()->get('active_unit');

        return is_array($unit)
            ? ($unit['name'] ?? $unit['tb2_nome'] ?? null)
            : (is_object($unit) ? ($unit->name ?? $unit->tb2_nome ?? null) : null);
    }

    private function normalizeAnyDesckCode(string $value): string
    {
        $digits = preg_replace('/\D/', '', $value) ?? '';

        if (strlen($digits) !== 10) {
            return trim($value);
        }

        return preg_replace('/(\d)(\d{3})(\d{3})(\d{3})/', '$1 $2 $3 $4', $digits) ?? trim($value);
    }

    private function ensureCanAccessOnline(?User $user): User
    {
        if (! $user || ! in_array((int) $user->funcao, [0, 1, 2, 3, 4], true)) {
            abort(403);
        }

        return $user;
    }
}
