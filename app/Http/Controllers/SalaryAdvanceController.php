<?php

namespace App\Http\Controllers;

use App\Models\SalaryAdvance;
use App\Models\User;
use App\Models\Unidade;
use App\Support\ManagementScope;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class SalaryAdvanceController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();
        $this->ensureManagement($user);

        $monthParam = $request->query('month');
        $unitParam = $request->query('unit_id');
        $filters = [
            'month' => $monthParam,
            'unit_id' => $unitParam ? (int) $unitParam : null,
        ];

        $advancesQuery = SalaryAdvance::with(['user:id,name,tb2_id', 'unit:tb2_id,tb2_nome'])
            ->when(! ManagementScope::isMaster($user), function ($query) use ($user) {
                $allowedUnitIds = ManagementScope::managedUnitIds($user)->all();

                if (empty($allowedUnitIds)) {
                    $query->whereRaw('1 = 0');

                    return;
                }

                $query->where(function ($sub) use ($allowedUnitIds) {
                    $sub->whereIn('unit_id', $allowedUnitIds)
                        ->orWhere(function ($legacy) use ($user) {
                            $legacy->whereNull('unit_id')
                                ->whereHas('user', function ($userQuery) use ($user) {
                                    ManagementScope::applyManagedUserScope($userQuery, $user);
                                });
                        });
                });
            })
            ->when($filters['month'], function ($query) use ($filters) {
                try {
                    [$year, $month] = explode('-', $filters['month']);
                    $query->whereYear('advance_date', (int) $year)
                        ->whereMonth('advance_date', (int) $month);
                } catch (\Throwable $e) {
                    // ignore invalid format
                }
            })
            ->when($filters['unit_id'], function ($query) use ($filters) {
                $unitId = (int) $filters['unit_id'];
                $query->where(function ($sub) use ($unitId) {
                    $sub->where('unit_id', $unitId)
                        ->orWhere(function ($legacy) use ($unitId) {
                            $legacy->whereNull('unit_id')
                                ->where(function ($legacyUnit) use ($unitId) {
                                    $legacyUnit->whereHas('user', function ($userQuery) use ($unitId) {
                                        $userQuery->where('tb2_id', $unitId);
                                    })->orWhereHas('user.units', function ($unitQuery) use ($unitId) {
                                        $unitQuery->where('tb2_unidades.tb2_id', $unitId);
                                    });
                                });
                        });
                });
            });

        // se nenhum filtro de mes foi enviado, usar mes corrente
        if (empty($filters['month'])) {
            $now = now();
            $currentMonth = $now->format('Y-m');
            $filters['month'] = $currentMonth;
            $advancesQuery->whereYear('advance_date', $now->year)
                ->whereMonth('advance_date', $now->month);
        }

        $advances = $advancesQuery
            ->latest()
            ->paginate(10)
            ->withQueryString();

        $units = ManagementScope::managedUnits($user, ['tb2_id', 'tb2_nome']);

        return Inertia::render('Finance/SalaryAdvanceIndex', [
            'advances' => $advances,
            'filters' => $filters,
            'units' => $units,
            'canDeleteAdvances' => ManagementScope::isMaster($user),
        ]);
    }

    public function create(Request $request): Response
    {
        $user = $request->user();
        $this->ensureManagement($user);

        $users = User::query()->orderBy('name');
        ManagementScope::applyManagedUserScope($users, $user);
        $users = $users->get(['id', 'name', 'salario']);
        $activeUnit = $this->resolveUnit($request);
        $selectedUser = $this->resolveSelectedUser($request);
        [$monthStart, $monthEnd] = $this->currentMonthRange();
        $currentMonthAdvances = $selectedUser
            ? $this->currentMonthAdvancesQuery($selectedUser, $monthStart, $monthEnd)
                ->with('unit:tb2_id,tb2_nome')
                ->get(['id', 'advance_date', 'amount', 'reason', 'unit_id'])
            : collect();
        $currentMonthTotal = round((float) $currentMonthAdvances->sum('amount'), 2);

        return Inertia::render('Finance/SalaryAdvanceCreate', [
            'users' => $users->map(fn ($user) => [
                'id' => $user->id,
                'name' => $user->name,
                'salary_limit' => (float) ($user->salario ?? 0),
                'formatted_limit' => number_format((float) ($user->salario ?? 0), 2, ',', '.'),
            ]),
            'activeUnit' => $activeUnit,
            'selectedUser' => $selectedUser ? [
                'id' => $selectedUser->id,
                'name' => $selectedUser->name,
                'salary_limit' => (float) ($selectedUser->salario ?? 0),
                'formatted_limit' => number_format((float) ($selectedUser->salario ?? 0), 2, ',', '.'),
            ] : null,
            'currentMonthAdvances' => $currentMonthAdvances->map(fn (SalaryAdvance $advance) => [
                'id' => $advance->id,
                'advance_date' => $advance->advance_date?->toDateString(),
                'amount' => (float) $advance->amount,
                'reason' => $advance->reason,
                'unit_name' => $advance->unit?->tb2_nome,
            ])->values()->all(),
            'currentMonthTotal' => $currentMonthTotal,
            'currentMonthReference' => now()->format('m/Y'),
            'currentMonthStart' => $monthStart->toDateString(),
            'currentMonthEnd' => $monthEnd->toDateString(),
            'canDeleteAdvances' => ManagementScope::isMaster($user),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->ensureManagement($request->user());

        $activeUnit = $this->resolveUnit($request);
        if (! $activeUnit) {
            return back()->with('error', 'Unidade ativa nao definida para registrar o adiantamento.');
        }

        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'advance_date' => ['required', 'string'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $advanceDate = $this->parseAdvanceDate((string) $data['advance_date']);
        $user = User::select('id', 'name', 'salario', 'funcao', 'tb2_id')->findOrFail($data['user_id']);
        $this->ensureCanManageUser($request->user(), $user);

        $currentMonthTotal = (float) $this->currentMonthAdvancesQuery($user)->sum('amount');
        $newTotal = $currentMonthTotal + (float) $data['amount'];

        if ($newTotal > (float) ($user->salario ?? 0)) {
            throw ValidationException::withMessages([
                'amount' => 'O total de adiantamentos do mes corrente excede o salario deste usuario.',
            ]);
        }

        SalaryAdvance::create([
            'user_id' => (int) $data['user_id'],
            'advance_date' => $advanceDate->toDateString(),
            'amount' => (float) $data['amount'],
            'reason' => $this->normalizeReason($data['reason'] ?? null),
            'unit_id' => $activeUnit['id'],
        ]);

        return redirect()
            ->back()
            ->with('success', 'Adiantamento registrado com sucesso!');
    }

    public function destroy(Request $request, SalaryAdvance $salaryAdvance): RedirectResponse
    {
        if (! ManagementScope::isMaster($request->user())) {
            abort(403);
        }

        if (! $this->canManageAdvance($request->user(), $salaryAdvance)) {
            abort(403);
        }

        $salaryAdvance->delete();

        return redirect()
            ->back()
            ->with('success', 'Adiantamento excluido com sucesso!');
    }

    private function ensureManagement($user): void
    {
        if (! ManagementScope::isManagement($user)) {
            abort(403);
        }
    }

    private function resolveUnit(Request $request): ?array
    {
        $sessionUnit = $request->session()->get('active_unit');

        if (is_array($sessionUnit) && isset($sessionUnit['id'])) {
            return [
                'id' => (int) $sessionUnit['id'],
                'name' => (string) ($sessionUnit['name'] ?? ''),
            ];
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

    private function ensureCanManageUser($actingUser, User $targetUser): void
    {
        if (! $actingUser || ! ManagementScope::canManageUser($actingUser, $targetUser)) {
            abort(403);
        }
    }

    private function canManageAdvance($actingUser, SalaryAdvance $salaryAdvance): bool
    {
        if (! $actingUser || ! ManagementScope::isManagement($actingUser)) {
            return false;
        }

        if (ManagementScope::isMaster($actingUser)) {
            return true;
        }

        if ($salaryAdvance->unit_id) {
            return ManagementScope::canManageUnit($actingUser, (int) $salaryAdvance->unit_id);
        }

        $salaryAdvance->loadMissing('user.units:tb2_id,tb2_nome');

        return $salaryAdvance->user instanceof User
            && ManagementScope::canManageUser($actingUser, $salaryAdvance->user);
    }

    private function resolveSelectedUser(Request $request): ?User
    {
        $selectedUserId = (int) $request->query('user', 0);

        if ($selectedUserId <= 0) {
            return null;
        }

        $selectedUser = User::query()
            ->with('units:tb2_id,tb2_nome')
            ->findOrFail($selectedUserId, ['id', 'name', 'salario', 'funcao', 'tb2_id']);

        $this->ensureCanManageUser($request->user(), $selectedUser);

        return $selectedUser;
    }

    private function currentMonthAdvancesQuery(User $user, ?Carbon $monthStart = null, ?Carbon $monthEnd = null)
    {
        [$monthStart, $monthEnd] = $monthStart && $monthEnd
            ? [$monthStart, $monthEnd]
            : $this->currentMonthRange();

        return SalaryAdvance::query()
            ->where('user_id', $user->id)
            ->whereBetween('advance_date', [$monthStart->toDateString(), $monthEnd->toDateString()])
            ->orderByDesc('advance_date')
            ->orderByDesc('id');
    }

    private function currentMonthRange(): array
    {
        return [
            now()->startOfMonth(),
            now()->endOfMonth(),
        ];
    }

    private function parseAdvanceDate(string $value): Carbon
    {
        $normalized = trim($value);

        if ($normalized === '') {
            throw ValidationException::withMessages([
                'advance_date' => 'Informe a data do adiantamento.',
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
            'advance_date' => 'Informe a data no formato DD/MM/AA.',
        ]);
    }

    private function normalizeReason(?string $value): ?string
    {
        $normalized = trim((string) $value);

        return $normalized === '' ? null : $normalized;
    }
}
