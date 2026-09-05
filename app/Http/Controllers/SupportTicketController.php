<?php

namespace App\Http\Controllers;

use App\Models\SupportTicket;
use App\Models\SupportTicketAttachment;
use App\Models\SupportTicketInteraction;
use App\Models\Unidade;
use App\Support\ManagementScope;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class SupportTicketController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();
        $isMaster = ManagementScope::isMaster($user);

        $ticketsQuery = SupportTicket::with([
            'user:id,name',
            'unit:tb2_id,tb2_nome',
            'interactions' => fn ($query) => $query
                ->with([
                    'user:id,name',
                    'attachments',
                ])
                ->orderBy('id'),
        ])->orderByDesc('id');

        if (! $isMaster) {
            $ticketsQuery->where('user_id', $user->id);
        }

        $tickets = $ticketsQuery
            ->get()
            ->map(fn (SupportTicket $ticket) => $this->mapTicket($ticket))
            ->values();

        return Inertia::render('Support/TicketIndex', [
            'isMaster' => $isMaster,
            'tickets' => $tickets,
            'activeUnit' => $this->resolveActiveUnit($request),
            'maxUploadMb' => $this->maxUploadMegabytes(),
            'maxImageUploadMb' => $this->maxImageUploadMegabytes(),
            'statusOptions' => collect(SupportTicket::STATUS_LABELS)
                ->map(fn (string $label, string $value) => [
                    'value' => $value,
                    'label' => $label,
                ])
                ->values(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $maxUploadKilobytes = $this->maxUploadKilobytes();

        $data = $request->validate([
            'title' => ['required', 'string', 'max:160'],
            'description' => ['nullable', 'string', 'max:2000'],
            'recording_file' => [
                'required',
                'file',
                'mimes:webm,mp4,mkv,mov',
                'max:' . $maxUploadKilobytes,
            ],
        ]);

        $file = $data['recording_file'];
        $path = $file->store('support-tickets', 'local');
        $activeUnit = $this->resolveActiveUnit($request);

        SupportTicket::create([
            'user_id' => $request->user()->id,
            'unit_id' => $activeUnit['id'] ?? null,
            'title' => $data['title'],
            'description' => $data['description'] ?: null,
            'video_path' => $path,
            'video_original_name' => $file->getClientOriginalName(),
            'video_mime_type' => $file->getClientMimeType() ?: 'video/webm',
            'video_size' => (int) $file->getSize(),
            'status' => 'aberto',
        ]);

        return redirect()
            ->route('support.tickets.index')
            ->with('success', 'Chamado enviado com sucesso!');
    }

    public function reply(Request $request, SupportTicket $ticket): RedirectResponse
    {
        $user = $request->user();
        $isMaster = ManagementScope::isMaster($user);

        $this->ensureCanAccessTicket($user, $ticket);

        $validator = Validator::make($request->all(), [
            'message' => ['nullable', 'string', 'max:3000'],
            'images' => $isMaster ? ['nullable', 'array', 'max:6'] : ['prohibited'],
            'images.*' => $isMaster
                ? ['image', 'mimes:jpg,jpeg,png,bmp,gif,webp', 'max:' . $this->maxImageUploadKilobytes()]
                : ['prohibited'],
        ]);

        $validator->after(function ($validator) use ($request) {
            $hasMessage = trim((string) $request->input('message', '')) !== '';
            $hasImages = count($request->file('images', [])) > 0;

            if (! $hasMessage && ! $hasImages) {
                $validator->errors()->add('message', 'Informe uma mensagem ou anexe ao menos uma imagem.');
            }
        });

        $data = $validator->validate();

        DB::transaction(function () use ($ticket, $user, $request, $data) {
            $interaction = SupportTicketInteraction::create([
                'support_ticket_id' => $ticket->id,
                'user_id' => $user->id,
                'author_name' => (string) $user->name,
                'message' => isset($data['message']) && trim((string) $data['message']) !== ''
                    ? trim((string) $data['message'])
                    : null,
            ]);

            foreach ($request->file('images', []) as $image) {
                $path = $image->store('support-ticket-images', 'local');

                $interaction->attachments()->create([
                    'file_path' => $path,
                    'original_name' => $image->getClientOriginalName(),
                    'mime_type' => $image->getClientMimeType() ?: 'image/jpeg',
                    'file_size' => (int) $image->getSize(),
                ]);
            }
        });

        return redirect()
            ->route('support.tickets.index')
            ->with('success', 'Interacao registrada com sucesso!');
    }

    public function updateStatus(Request $request, SupportTicket $ticket): RedirectResponse
    {
        $this->ensureMaster($request->user());

        $data = $request->validate([
            'status' => ['required', 'string', Rule::in(array_keys(SupportTicket::STATUS_LABELS))],
        ]);

        $ticket->update([
            'status' => $data['status'],
        ]);

        return redirect()
            ->route('support.tickets.index')
            ->with('success', 'Status do chamado atualizado com sucesso!');
    }

    public function destroy(Request $request, SupportTicket $ticket): RedirectResponse
    {
        $this->ensureMaster($request->user());

        $ticket->loadMissing('interactions.attachments');

        $paths = collect([$ticket->video_path])
            ->merge(
                $ticket->interactions->flatMap(
                    fn (SupportTicketInteraction $interaction) => $interaction->attachments->pluck('file_path')
                )
            )
            ->filter()
            ->values()
            ->all();

        Storage::disk('local')->delete($paths);
        $ticket->delete();

        return redirect()
            ->route('support.tickets.index')
            ->with('success', 'Chamado removido com sucesso!');
    }

    public function video(Request $request, SupportTicket $ticket): BinaryFileResponse
    {
        $this->ensureCanAccessTicket($request->user(), $ticket);

        return $this->streamPrivateFile(
            $ticket->video_path,
            $ticket->video_mime_type ?: 'video/webm',
            $ticket->video_original_name ?: ('chamado-' . $ticket->id . '.webm')
        );
    }

    public function attachment(Request $request, SupportTicketAttachment $attachment): BinaryFileResponse
    {
        $attachment->loadMissing('interaction.supportTicket');

        $ticket = $attachment->interaction?->supportTicket;
        if (! $ticket) {
            abort(404);
        }

        $this->ensureCanAccessTicket($request->user(), $ticket);

        return $this->streamPrivateFile(
            $attachment->file_path,
            $attachment->mime_type ?: 'image/jpeg',
            $attachment->original_name ?: ('anexo-' . $attachment->id)
        );
    }

    private function streamPrivateFile(string $path, string $mimeType, string $filename): BinaryFileResponse
    {
        $disk = Storage::disk('local');
        if (! $disk->exists($path)) {
            abort(404);
        }

        return response()->file($disk->path($path), [
            'Content-Type' => $mimeType,
            'Content-Disposition' => 'inline; filename="' . basename($filename) . '"',
        ]);
    }

    private function mapTicket(SupportTicket $ticket): array
    {
        return [
            'id' => $ticket->id,
            'title' => $ticket->title,
            'description' => $ticket->description,
            'status' => $ticket->status,
            'status_label' => SupportTicket::STATUS_LABELS[$ticket->status] ?? $ticket->status,
            'video_size' => (int) $ticket->video_size,
            'video_original_name' => $ticket->video_original_name,
            'created_at' => optional($ticket->created_at)->toIso8601String(),
            'user' => $ticket->user
                ? [
                    'id' => $ticket->user->id,
                    'name' => $ticket->user->name,
                ]
                : null,
            'unit' => $ticket->unit
                ? [
                    'id' => $ticket->unit->tb2_id,
                    'name' => $ticket->unit->tb2_nome,
                ]
                : null,
            'video_url' => route('support.tickets.video', $ticket, false),
            'interactions' => $ticket->interactions
                ->map(fn (SupportTicketInteraction $interaction) => $this->mapInteraction($interaction))
                ->values(),
        ];
    }

    private function mapInteraction(SupportTicketInteraction $interaction): array
    {
        return [
            'id' => $interaction->id,
            'message' => $interaction->message,
            'author_name' => $interaction->author_name ?: ($interaction->user?->name ?? '---'),
            'created_at' => optional($interaction->created_at)->toIso8601String(),
            'attachments' => $interaction->attachments
                ->map(fn (SupportTicketAttachment $attachment) => [
                    'id' => $attachment->id,
                    'original_name' => $attachment->original_name,
                    'mime_type' => $attachment->mime_type,
                    'file_size' => (int) $attachment->file_size,
                    'url' => route('support.tickets.attachments.show', $attachment, false),
                ])
                ->values(),
        ];
    }

    private function ensureMaster($user): void
    {
        if (! ManagementScope::isMaster($user)) {
            abort(403);
        }
    }

    private function ensureCanAccessTicket($user, SupportTicket $ticket): void
    {
        if (! $user) {
            abort(403);
        }

        if (ManagementScope::isMaster($user)) {
            return;
        }

        if ((int) $ticket->user_id === (int) $user->id) {
            return;
        }

        abort(403);
    }

    private function resolveActiveUnit(Request $request): ?array
    {
        $sessionUnit = $request->session()->get('active_unit');

        if (is_array($sessionUnit)) {
            $unitId = $sessionUnit['id'] ?? $sessionUnit['tb2_id'] ?? null;
            if ($unitId) {
                return [
                    'id' => (int) $unitId,
                    'name' => (string) ($sessionUnit['name'] ?? $sessionUnit['tb2_nome'] ?? ''),
                ];
            }
        }

        if (is_object($sessionUnit)) {
            $unitId = $sessionUnit->id ?? $sessionUnit->tb2_id ?? null;
            if ($unitId) {
                return [
                    'id' => (int) $unitId,
                    'name' => (string) ($sessionUnit->name ?? $sessionUnit->tb2_nome ?? ''),
                ];
            }
        }

        $user = $request->user();
        $unitId = (int) ($user?->tb2_id ?? 0);
        if ($unitId <= 0) {
            return null;
        }

        $unit = Unidade::find($unitId, ['tb2_id', 'tb2_nome']);

        return [
            'id' => $unitId,
            'name' => $unit?->tb2_nome ?? ('Unidade #' . $unitId),
        ];
    }

    private function maxUploadKilobytes(): int
    {
        $uploadMax = $this->iniSizeToKilobytes((string) ini_get('upload_max_filesize'));
        $postMax = $this->iniSizeToKilobytes((string) ini_get('post_max_size'));

        $limits = array_filter([$uploadMax, $postMax], fn (int $value) => $value > 0);

        return $limits === [] ? 40960 : min($limits);
    }

    private function maxUploadMegabytes(): int
    {
        return max(1, (int) floor($this->maxUploadKilobytes() / 1024));
    }

    private function maxImageUploadKilobytes(): int
    {
        return min($this->maxUploadKilobytes(), 10240);
    }

    private function maxImageUploadMegabytes(): int
    {
        return max(1, (int) floor($this->maxImageUploadKilobytes() / 1024));
    }

    private function iniSizeToKilobytes(string $value): int
    {
        $normalized = trim(strtolower($value));
        if ($normalized === '') {
            return 0;
        }

        $unit = substr($normalized, -1);
        $number = (float) $normalized;

        return match ($unit) {
            'g' => (int) round($number * 1024 * 1024),
            'm' => (int) round($number * 1024),
            'k' => (int) round($number),
            default => (int) round($number / 1024),
        };
    }
}
