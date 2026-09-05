<?php

namespace App\Http\Controllers;

use App\Models\Boleto;
use App\Models\Unidade;
use App\Support\ManagementScope;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class BoletoController extends Controller
{
    private const BARCODE_LENGTH = 44;

    private const DIGITABLE_LINE_LENGTHS = [47, 48];

    public function index(Request $request): Response
    {
        $user = $request->user();
        $this->ensureAccess($user);

        $today = Carbon::now('America/Sao_Paulo')->toDateString();
        $todayUserBoletos = Boleto::with(['unit:tb2_id,tb2_nome'])
            ->where('user_id', $user->id)
            ->whereDate('created_at', $today)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get();
        $filters = [
            'start_date' => $this->normalizeDateInput($request->query('start_date'))?->toDateString() ?? $today,
            'end_date' => $this->normalizeDateInput($request->query('end_date'))?->toDateString() ?? $today,
            'paid' => $this->normalizePaidFilter($request->query('paid')),
            'unit_id' => 'all',
        ];

        $activeUnit = $this->resolveUnit($request);
        $canViewList = $this->canViewList($user);
        $canManageList = $this->canManageList($user);
        $filterUnits = collect();
        $boletos = null;
        $listTotalAmount = 0.0;

        if ($canViewList) {
            $filterUnits = $this->resolveManagedUnits($user);
            $selectedUnitId = $this->resolveSelectedUnitId($request->query('unit_id'), $filterUnits);
            $filters['unit_id'] = $selectedUnitId !== null ? (string) $selectedUnitId : 'all';

            $boletosQuery = Boleto::with(['user:id,name', 'paidBy:id,name', 'unit:tb2_id,tb2_nome'])
                ->withPaidStatus($filters['paid'])
                ->when($filters['start_date'] !== '', function ($query) use ($filters) {
                    $query->whereDate('due_date', '>=', $filters['start_date']);
                })
                ->when($filters['end_date'] !== '', function ($query) use ($filters) {
                    $query->whereDate('due_date', '<=', $filters['end_date']);
                })
                ->when($selectedUnitId !== null, function ($query) use ($selectedUnitId) {
                    $query->where('unit_id', $selectedUnitId);
                }, function ($query) use ($filterUnits) {
                    if ($filterUnits->isEmpty()) {
                        $query->whereRaw('1 = 0');

                        return;
                    }

                    $query->whereIn('unit_id', $filterUnits->pluck('id')->all());
                })
                ->orderBy('due_date')
                ->orderBy('id');

            $listTotalAmount = round((float) (clone $boletosQuery)->sum('amount'), 2);

            $boletos = $boletosQuery
                ->paginate(15)
                ->withQueryString();
        }

        $createUnits = ManagementScope::isMaster($user)
            ? $this->resolveManagedUnits($user)
            : collect();

        return Inertia::render('Finance/BoletoIndex', [
            'activeUnit' => $activeUnit,
            'filters' => $filters,
            'boletos' => $boletos,
            'todayUserBoletos' => $todayUserBoletos,
            'canViewList' => $canViewList,
            'canManageList' => $canManageList,
            'filterUnits' => $filterUnits,
            'listTotalAmount' => $listTotalAmount,
            'canCreateBoletos' => $this->canCreateBoletos($user),
            'canChooseCreateUnit' => ManagementScope::isMaster($user),
            'createUnits' => $createUnits,
            'createUnitId' => $this->resolveCreateUnitId($request, $user, $activeUnit, $createUnits),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $user = $request->user();
        $this->ensureCreator($user);

        $activeUnit = $this->resolveUnit($request);
        $createUnits = ManagementScope::isMaster($user)
            ? $this->resolveManagedUnits($user)
            : collect();
        $targetUnit = $this->resolveTargetUnitForWrite($request, $user, $activeUnit, $createUnits);

        if (! $targetUnit) {
            return back()->with('error', 'Unidade ativa nao definida para registrar o boleto.');
        }

        $data = $this->validateBoletoPayload($request);

        Boleto::create([
            'unit_id' => $targetUnit['id'],
            'user_id' => $user->id,
            ...$data,
        ]);

        return back()->with('success', 'Boleto registrado com sucesso!');
    }

    public function update(Request $request, Boleto $boleto): RedirectResponse
    {
        $user = $request->user();
        $this->ensureManager($user);

        if (! $this->canManageBoleto($user, $boleto)) {
            abort(403);
        }

        $activeUnit = $this->resolveUnit($request);
        $createUnits = ManagementScope::isMaster($user)
            ? $this->resolveManagedUnits($user)
            : collect();
        $targetUnit = $this->resolveTargetUnitForWrite($request, $user, $activeUnit, $createUnits, $boleto);

        if (! $targetUnit) {
            return back()->with('error', 'Nao foi possivel definir a unidade do boleto.');
        }

        $data = $this->validateBoletoPayload($request);

        $boleto->update([
            'unit_id' => $targetUnit['id'],
            ...$data,
        ]);

        return back()->with('success', 'Boleto atualizado com sucesso!');
    }

    public function pay(Request $request, Boleto $boleto): RedirectResponse
    {
        $user = $request->user();
        $this->ensureManager($user);

        if (! $this->canManageBoleto($user, $boleto)) {
            abort(403);
        }

        if ($boleto->is_paid) {
            return back()->with('error', 'Boleto ja esta pago.');
        }

        $boleto->update([
            'is_paid' => true,
            'paid_at' => now(),
            'paid_by' => $user->id,
        ]);

        return back()->with('success', 'Boleto baixado com sucesso!');
    }

    private function ensureAccess($user): void
    {
        if (! $user || ! in_array((int) $user->funcao, [0, 1, 2, 3], true)) {
            abort(403);
        }
    }

    private function ensureCreator($user): void
    {
        if (! $this->canCreateBoletos($user)) {
            abort(403);
        }
    }

    private function ensureManager($user): void
    {
        if (! $user || ! ManagementScope::isAdmin($user)) {
            abort(403);
        }
    }

    private function canManageList($user): bool
    {
        return ManagementScope::isAdmin($user);
    }

    private function canViewList($user): bool
    {
        return ManagementScope::isManagement($user);
    }

    private function canManageBoleto($user, Boleto $boleto): bool
    {
        $unitId = (int) ($boleto->unit_id ?? 0);

        if ($unitId <= 0) {
            return ManagementScope::isMaster($user);
        }

        return ManagementScope::canManageUnit($user, $unitId);
    }

    private function canCreateBoletos($user): bool
    {
        return $user instanceof \App\Models\User
            && in_array((int) $user->funcao, [0, 1, 2, 3], true);
    }

    private function resolveManagedUnits($user): Collection
    {
        return ManagementScope::managedUnits($user, ['tb2_id', 'tb2_nome'])
            ->map(fn (Unidade $unit) => [
                'id' => (int) $unit->tb2_id,
                'name' => $unit->tb2_nome,
            ])
            ->values();
    }

    private function resolveSelectedUnitId(mixed $value, Collection $units): ?int
    {
        if ($value === null || $value === '' || $value === 'all') {
            return null;
        }

        $unitId = (int) $value;

        if ($unitId <= 0) {
            return null;
        }

        return $units->contains(fn (array $unit) => (int) $unit['id'] === $unitId)
            ? $unitId
            : null;
    }

    private function resolveCreateUnitId(Request $request, $user, ?array $activeUnit, Collection $createUnits): ?int
    {
        if (! ManagementScope::isMaster($user)) {
            return $activeUnit['id'] ?? null;
        }

        $selectedUnitId = $this->resolveSelectedUnitId($request->query('unit_id'), $createUnits);
        if ($selectedUnitId !== null) {
            return $selectedUnitId;
        }

        $activeUnitId = (int) ($activeUnit['id'] ?? 0);
        if ($activeUnitId > 0 && $createUnits->contains(fn (array $unit) => (int) $unit['id'] === $activeUnitId)) {
            return $activeUnitId;
        }

        return $createUnits->first()['id'] ?? null;
    }

    private function resolveTargetUnitForWrite(
        Request $request,
        $user,
        ?array $activeUnit,
        Collection $createUnits,
        ?Boleto $boleto = null
    ): ?array {
        if (ManagementScope::isMaster($user)) {
            $selectedUnitId = $this->resolveSelectedUnitId($request->input('unit_id'), $createUnits);
            if ($selectedUnitId !== null) {
                return $createUnits->first(fn (array $unit) => (int) $unit['id'] === $selectedUnitId);
            }
        }

        if ($boleto && (int) ($boleto->unit_id ?? 0) > 0 && $this->canManageBoleto($user, $boleto)) {
            return [
                'id' => (int) $boleto->unit_id,
                'name' => $boleto->unit?->tb2_nome ?? ('Unidade #' . $boleto->unit_id),
            ];
        }

        $activeUnitId = (int) ($activeUnit['id'] ?? 0);
        if ($activeUnitId > 0 && $this->canWriteBoletoToUnit($user, $activeUnitId)) {
            return [
                'id' => $activeUnitId,
                'name' => (string) ($activeUnit['name'] ?? ('Unidade #' . $activeUnitId)),
            ];
        }

        return null;
    }

    private function canWriteBoletoToUnit($user, int $unitId): bool
    {
        if (! $user || $unitId <= 0) {
            return false;
        }

        if (ManagementScope::isAdmin($user)) {
            return ManagementScope::canManageUnit($user, $unitId);
        }

        if (! $this->canCreateBoletos($user)) {
            return false;
        }

        return ManagementScope::targetUserUnitIds($user)->contains($unitId);
    }

    private function validateBoletoPayload(Request $request): array
    {
        $data = $request->validate([
            'description' => ['required', 'string', 'max:255'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'due_date' => ['required', 'string'],
            'barcode' => ['nullable', 'string', 'max:128'],
            'digitable_line' => ['required', 'string', 'max:256'],
            'unit_id' => ['nullable'],
        ]);

        return [
            'description' => trim((string) $data['description']),
            'amount' => round((float) $data['amount'], 2),
            'due_date' => $this->parseDateInput((string) $data['due_date'], 'due_date')->toDateString(),
            'barcode' => $this->normalizeBarcode((string) ($data['barcode'] ?? '')),
            'digitable_line' => $this->normalizeDigitableLine((string) $data['digitable_line']),
        ];
    }

    private function parseDateInput(string $value, string $field): Carbon
    {
        $normalized = trim($value);

        if ($normalized === '') {
            throw ValidationException::withMessages([
                $field => 'Informe a data no formato DD/MM/AA.',
            ]);
        }

        foreach (['d/m/y', 'd/m/Y', 'Y-m-d'] as $format) {
            try {
                $date = Carbon::createFromFormat($format, $normalized);
            } catch (\Throwable $e) {
                continue;
            }

            if ($date && $date->format($format) === $normalized) {
                return $date->startOfDay();
            }
        }

        throw ValidationException::withMessages([
            $field => 'Informe a data no formato DD/MM/AA.',
        ]);
    }

    private function normalizeDateInput(mixed $value): ?Carbon
    {
        $normalized = trim((string) ($value ?? ''));

        if ($normalized === '') {
            return null;
        }

        foreach (['Y-m-d', 'd/m/y', 'd/m/Y'] as $format) {
            try {
                $date = Carbon::createFromFormat($format, $normalized);
            } catch (\Throwable $e) {
                continue;
            }

            if ($date && $date->format($format) === $normalized) {
                return $date->startOfDay();
            }
        }

        return null;
    }

    private function normalizePaidFilter(mixed $value): string
    {
        $status = trim((string) ($value ?? ''));

        return in_array($status, ['all', 'paid', 'unpaid'], true) ? $status : 'unpaid';
    }

    private function normalizeBarcode(string $value): string
    {
        $digits = preg_replace('/\D+/', '', $value) ?? '';

        if ($digits === '') {
            return '';
        }

        if (strlen($digits) !== self::BARCODE_LENGTH) {
            throw ValidationException::withMessages([
                'barcode' => 'O codigo de barras deve ter exatamente 44 digitos.',
            ]);
        }

        return $digits;
    }

    private function normalizeDigitableLine(string $value): string
    {
        $digits = preg_replace('/\D+/', '', $value) ?? '';
        $length = strlen($digits);

        if (! in_array($length, self::DIGITABLE_LINE_LENGTHS, true)) {
            throw ValidationException::withMessages([
                'digitable_line' => 'A linha digitavel deve ter 47 ou 48 digitos.',
            ]);
        }

        return $digits;
    }

    private function resolveUnit(Request $request): ?array
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
            'id' => (int) $unitId,
            'name' => $unit?->tb2_nome ?? ('Unidade #' . $unitId),
        ];
    }
}
