<?php

namespace App\Http\Controllers;

use App\Models\ChatMessage;
use App\Models\Expense;
use App\Models\Supplier;
use App\Models\Unidade;
use App\Models\User;
use App\Support\ManagementScope;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class ExpenseController extends Controller
{
    private const SYSTEM_EMAIL = 'sistema@paoecafe.local';

    public function index(Request $request): Response
    {
        $user = $request->user();
        $this->ensureManager($user);

        $activeUnit = $this->resolveUnit($request);
        $suppliers = Supplier::orderBy('name')->get(['id', 'name']);
        $canFilterList = ManagementScope::isAdmin($user);
        $today = Carbon::today()->toDateString();
        $filterUnits = collect();
        $selectedUnitId = null;
        $filters = [
            'start_date' => trim((string) $request->query('start_date', $today)),
            'end_date' => trim((string) $request->query('end_date', $today)),
            'unit_id' => 'all',
        ];
        $expensesQuery = Expense::with([
            'supplier:id,name',
            'unit:tb2_id,tb2_nome',
            'user:id,name',
        ])
            ->leftJoin('tb2_unidades', 'tb2_unidades.tb2_id', '=', 'expenses.unit_id')
            ->orderBy('tb2_unidades.tb2_nome')
            ->orderByDesc('expense_date')
            ->orderByDesc('id');

        if ($canFilterList) {
            $filterUnits = ManagementScope::managedUnits($user, ['tb2_id', 'tb2_nome'])
                ->map(fn (Unidade $unit) => [
                    'id' => (int) $unit->tb2_id,
                    'name' => $unit->tb2_nome,
                ])
                ->values();

            $selectedUnitId = $this->resolveSelectedUnitId($request->query('unit_id'), $filterUnits);
            $filters['unit_id'] = $selectedUnitId !== null ? (string) $selectedUnitId : 'all';

            if ($selectedUnitId !== null) {
                $expensesQuery->where('unit_id', $selectedUnitId);
            } elseif ($filterUnits->isNotEmpty()) {
                $expensesQuery->whereIn('unit_id', $filterUnits->pluck('id'));
            } else {
                $expensesQuery->whereRaw('1 = 0');
            }

            if ($filters['start_date'] !== '') {
                $expensesQuery->whereDate('expense_date', '>=', $filters['start_date']);
            }

            if ($filters['end_date'] !== '') {
                $expensesQuery->whereDate('expense_date', '<=', $filters['end_date']);
            }
        } elseif ($activeUnit) {
            $expensesQuery->where('unit_id', $activeUnit['id']);
        } else {
            $expensesQuery->whereRaw('1 = 0');
        }

        $currentUserId = (int) $user->id;

        $expenses = $expensesQuery->get([
            'expenses.id',
            'expenses.supplier_id',
            'expenses.unit_id',
            'expenses.user_id',
            'expenses.expense_date',
            'expenses.amount',
            'expenses.notes',
        ])->map(function (Expense $expense) use ($currentUserId) {
            $canManage = (int) $expense->user_id === $currentUserId;
            $expense->setAttribute('can_edit', $canManage);
            $expense->setAttribute('can_delete', $canManage);

            return $expense;
        });

        return Inertia::render('Finance/ExpenseIndex', [
            'suppliers' => $suppliers,
            'expenses' => $expenses,
            'activeUnit' => $activeUnit,
            'canFilterList' => $canFilterList,
            'filterUnits' => $filterUnits,
            'filters' => $filters,
            'listTotalAmount' => round((float) $expenses->sum('amount'), 2),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->ensureManager($request->user());

        $activeUnit = $this->resolveUnit($request);
        if (! $activeUnit) {
            return back()->with('error', 'Unidade ativa nao definida para registrar o gasto.');
        }

        $data = $request->validate([
            'supplier_id' => ['required', 'integer', 'exists:suppliers,id'],
            'expense_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        Expense::create(array_merge($data, [
            'unit_id' => $activeUnit['id'],
            'user_id' => $request->user()->id,
        ]));

        return back()->with('success', 'Gasto cadastrado com sucesso!');
    }

    public function update(Request $request, Expense $expense): RedirectResponse
    {
        $user = $request->user();
        $this->ensureManager($user);
        $activeUnit = $this->resolveUnit($request);

        if (
            ! $activeUnit
            || (int) $expense->unit_id !== (int) $activeUnit['id']
            || (int) $expense->user_id !== (int) $user->id
        ) {
            abort(403);
        }

        $data = $request->validate([
            'supplier_id' => ['required', 'integer', 'exists:suppliers,id'],
            'expense_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $originalExpense = $expense->loadMissing(['supplier:id,name', 'unit:tb2_id,tb2_nome']);
        $originalPayload = $this->mapExpenseSnapshot($originalExpense);

        $expense->fill($data);
        $hasChanges = $expense->isDirty(['supplier_id', 'amount', 'notes']);
        $expense->save();

        $updatedExpense = $expense->fresh(['supplier:id,name', 'unit:tb2_id,tb2_nome']);
        $updatedPayload = $this->mapExpenseSnapshot($updatedExpense);

        if ($hasChanges && $updatedExpense) {
            $this->notifyExpenseEdited(
                $activeUnit['id'],
                $activeUnit['name'] ?? ($updatedExpense->unit?->tb2_nome ?? null),
                $user,
                $originalPayload,
                $updatedPayload,
            );
        }

        return back()->with('success', 'Gasto atualizado com sucesso!');
    }

    public function destroy(Request $request, Expense $expense): RedirectResponse
    {
        $this->ensureManager($request->user());
        $activeUnit = $this->resolveUnit($request);

        if (
            ! $activeUnit
            || (int) $expense->unit_id !== (int) $activeUnit['id']
            || (int) $expense->user_id !== (int) $request->user()->id
        ) {
            abort(403);
        }

        $expense->delete();

        return back()->with('success', 'Gasto removido com sucesso!');
    }

    private function ensureManager($user): void
    {
        if (! $user || ! in_array((int) $user->funcao, [0, 1, 3], true)) {
            abort(403);
        }
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

    private function resolveSelectedUnitId(mixed $value, Collection $filterUnits): ?int
    {
        if ($value === null || $value === '' || $value === 'all') {
            return null;
        }

        $unitId = (int) $value;

        if ($unitId <= 0) {
            return null;
        }

        return $filterUnits->contains(fn (array $unit) => (int) $unit['id'] === $unitId)
            ? $unitId
            : null;
    }

    private function notifyExpenseEdited(
        int $unitId,
        ?string $unitName,
        User $executor,
        array $originalExpense,
        array $updatedExpense,
    ): void {
        $systemUser = $this->ensureSystemUser($unitId);
        $recipientIds = User::query()
            ->where(function ($query) use ($unitId) {
                $query->where('funcao_original', 0)
                    ->orWhere(function ($managerQuery) use ($unitId) {
                        $managerQuery->where('funcao_original', 1)
                            ->where(function ($unitQuery) use ($unitId) {
                                $unitQuery->where('tb2_id', $unitId)
                                    ->orWhereHas('units', function ($relationQuery) use ($unitId) {
                                        $relationQuery->where('tb2_unidades.tb2_id', $unitId);
                                    });
                            });
                    });
            })
            ->pluck('id')
            ->unique()
            ->values();

        if ($recipientIds->isEmpty()) {
            return;
        }

        $message = $this->buildExpenseEditedMessage(
            $executor,
            $unitName,
            $originalExpense,
            $updatedExpense,
            now(),
        );

        foreach ($recipientIds as $recipientId) {
            ChatMessage::create([
                'sender_id' => $systemUser->id,
                'recipient_id' => (int) $recipientId,
                'sender_role' => (int) $systemUser->funcao,
                'sender_unit_id' => $unitId,
                'message' => $message,
            ]);
        }
    }

    private function buildExpenseEditedMessage(
        User $executor,
        ?string $unitName,
        array $originalExpense,
        array $updatedExpense,
        Carbon $editedAt,
    ): string {
        $lines = [
            '[b]Edicao de gasto[/b]',
            sprintf('Usuario executor: %s', $this->formatExecutorLabel($unitName, $executor->name)),
            sprintf('Data e hora da edicao: %s', $editedAt->format('d/m/y H:i:s')),
            sprintf('Gasto ID: %s', (string) ($updatedExpense['id'] ?? $originalExpense['id'] ?? '---')),
            'Original:',
            sprintf('- Fornecedor: %s', $originalExpense['supplier_name'] ?? '---'),
            sprintf('- Data: %s', $originalExpense['expense_date'] ?? '---'),
            sprintf('- Valor: %s', $originalExpense['amount_label'] ?? $this->formatCurrencyForMessage(0)),
            sprintf('- Observacao: %s', $originalExpense['notes'] !== '' ? $originalExpense['notes'] : '---'),
            'Alterado:',
            sprintf('- Fornecedor: %s', $updatedExpense['supplier_name'] ?? '---'),
            sprintf('- Data: %s', $updatedExpense['expense_date'] ?? '---'),
            sprintf('- Valor: %s', $updatedExpense['amount_label'] ?? $this->formatCurrencyForMessage(0)),
            sprintf('- Observacao: %s', $updatedExpense['notes'] !== '' ? $updatedExpense['notes'] : '---'),
        ];

        return implode("\n", $lines);
    }

    private function formatExecutorLabel(?string $unitName, string $executorName): string
    {
        $normalizedUnitName = trim((string) $unitName);

        return sprintf('%s - %s', $normalizedUnitName !== '' ? $normalizedUnitName : '---', $executorName);
    }

    private function mapExpenseSnapshot(?Expense $expense): array
    {
        $expenseDate = $expense?->expense_date instanceof Carbon
            ? $expense->expense_date
            : ($expense?->expense_date ? Carbon::parse($expense->expense_date) : null);

        return [
            'id' => $expense?->id,
            'supplier_name' => $expense?->supplier?->name ?? '---',
            'expense_date' => $expenseDate ? $expenseDate->format('d/m/y') : '---',
            'amount' => (float) ($expense?->amount ?? 0),
            'amount_label' => $this->formatCurrencyForMessage((float) ($expense?->amount ?? 0)),
            'notes' => trim((string) ($expense?->notes ?? '')),
        ];
    }

    private function formatCurrencyForMessage(float $value): string
    {
        return 'R$ ' . number_format($value, 2, ',', '.');
    }

    private function ensureSystemUser(?int $activeUnitId = null): User
    {
        $activeUnitIds = Unidade::active()
            ->orderBy('tb2_id')
            ->pluck('tb2_id')
            ->map(fn ($value) => (int) $value)
            ->values();

        $primaryUnitId = $activeUnitId && $activeUnitId > 0
            ? $activeUnitId
            : (int) ($activeUnitIds->first() ?? 0);

        $systemUser = User::query()->firstOrCreate(
            ['email' => self::SYSTEM_EMAIL],
            [
                'name' => 'Sistema',
                'password' => Str::random(32),
                'funcao' => 1,
                'funcao_original' => 1,
                'hr_ini' => '00:00',
                'hr_fim' => '23:59',
                'salario' => 0,
                'vr_cred' => 0,
                'tb2_id' => $primaryUnitId > 0 ? $primaryUnitId : null,
                'cod_acesso' => Str::upper(Str::random(6)),
            ]
        );

        $nextPrimaryUnitId = $primaryUnitId > 0
            ? $primaryUnitId
            : (int) ($systemUser->tb2_id ?? 0);

        if ($nextPrimaryUnitId > 0 && (int) $systemUser->tb2_id !== $nextPrimaryUnitId) {
            $systemUser->forceFill(['tb2_id' => $nextPrimaryUnitId])->save();
        }

        if ($activeUnitIds->isNotEmpty()) {
            $systemUser->units()->sync($activeUnitIds->all());
        }

        return $systemUser->fresh(['units']) ?? $systemUser;
    }
}
