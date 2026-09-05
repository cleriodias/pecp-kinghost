<?php

namespace App\Http\Controllers;

use App\Models\CashierClosure;
use App\Models\ChatMessage;
use App\Models\User;
use App\Models\Venda;
use App\Models\VendaPagamento;
use App\Models\Unidade;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class CashierClosureController extends Controller
{
    private const SYSTEM_EMAIL = 'sistema.chat@pec.local';

    public function index(Request $request): Response
    {
        $user = $request->user();
        $this->ensureCashier($user);

        $today = Carbon::today();
        $activeUnit = $this->resolveActiveUnit($request);
        $unitId = $activeUnit['id'] ?? $user->tb2_id;
        $pendingClosureDate = $this->resolvePendingClosureDate($user, $unitId, $today);

        $todayClosure = CashierClosure::where('user_id', $user->id)
            ->whereDate('closed_date', $today)
            ->where(function ($query) use ($unitId) {
                $query->whereNull('unit_id')->orWhere('unit_id', $unitId);
            })
            ->latest('closed_at')
            ->first();

        $lastClosure = CashierClosure::where('user_id', $user->id)
            ->where(function ($query) use ($unitId) {
                $query->whereNull('unit_id')->orWhere('unit_id', $unitId);
            })
            ->latest('closed_at')
            ->first();

        return Inertia::render('Cashier/Close', [
            'activeUnit' => $activeUnit,
            'hasOpenComandas' => $this->hasOpenComandas($unitId),
            'todayClosure' => $todayClosure ? [
                'cash_amount' => $todayClosure->cash_amount,
                'card_amount' => $todayClosure->card_amount,
                'closed_at' => optional($todayClosure->closed_at)->toIso8601String(),
                'unit_name' => $todayClosure->unit_name,
            ] : null,
            'lastClosure' => $lastClosure ? [
                'cash_amount' => $lastClosure->cash_amount,
                'card_amount' => $lastClosure->card_amount,
                'closed_at' => optional($lastClosure->closed_at)->toIso8601String(),
                'unit_name' => $lastClosure->unit_name,
            ] : null,
            'pendingClosureDate' => $pendingClosureDate?->toDateString(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        try {
            $user = $request->user();
            $this->ensureCashier($user);

            $validated = $request->validate([
                'cash_amount' => ['required', 'numeric', 'min:0'],
                'card_amount' => ['required', 'numeric', 'min:0'],
                'closure_date' => ['nullable', 'date'],
                'confirm_pending' => ['nullable', 'boolean'],
                'open_comandas_observation' => ['nullable', 'string', 'max:1000'],
            ]);

            $today = Carbon::today();
            $activeUnit = $this->resolveActiveUnit($request);
            $unitId = $activeUnit['id'] ?? $user->tb2_id;
            $unitName = $activeUnit['name'] ?? optional($user->primaryUnit)->tb2_nome;

            $openComandasSnapshot = $this->loadOpenComandas($unitId);
            $openComandas = $openComandasSnapshot->isNotEmpty();

            if ($openComandas) {
                $openComandasObservation = trim((string) ($validated['open_comandas_observation'] ?? ''));

                if ($openComandasObservation === '') {
                    return redirect()
                        ->route('cashier.close')
                        ->withErrors([
                            'open_comandas_observation' => 'Informe a observacao justificando o fechamento com comandas em aberto.',
                        ])
                        ->withInput();
                }
            } else {
                $openComandasObservation = null;
            }

            $pendingClosureDate = $this->resolvePendingClosureDate($user, $unitId, $today);
            $pendingDateString = $pendingClosureDate?->toDateString();
            $confirmedPending = (bool) ($validated['confirm_pending'] ?? false);

            if ($pendingClosureDate) {
                $requestedDate = $validated['closure_date'] ?? null;

                if ($requestedDate !== $pendingDateString || ! $confirmedPending) {
                    return redirect()
                        ->route('cashier.close')
                        ->withErrors([
                            'confirm_pending' => sprintf(
                                'Existe fechamento pendente em %s. Confirme o fechamento pendente para continuar.',
                                $pendingClosureDate->format('d/m/Y')
                            ),
                        ]);
                }
            } elseif (! empty($validated['closure_date']) || $confirmedPending) {
                return redirect()
                    ->route('cashier.close')
                    ->withErrors([
                        'confirm_pending' => 'Nao ha fechamento pendente para confirmar.',
                    ]);
            }

            $closureDate = $pendingClosureDate ?? $today;

            $alreadyClosed = CashierClosure::where('user_id', $user->id)
                ->whereDate('closed_date', $closureDate)
                ->where(function ($query) use ($unitId) {
                    $query->whereNull('unit_id')->orWhere('unit_id', $unitId);
                })
                ->exists();

            if ($alreadyClosed) {
                $dateMessage = $closureDate->isSameDay($today)
                    ? 'O caixa ja foi fechado hoje para esta unidade.'
                    : 'O caixa ja foi fechado em ' . $closureDate->format('d/m/Y') . ' para esta unidade.';

                return redirect()
                    ->route('cashier.close')
                    ->withErrors([
                        'cash_amount' => $dateMessage,
                    ]);
            }

            $closedAt = now();

            DB::transaction(function () use (
                $user,
                $unitId,
                $unitName,
                $validated,
                $openComandas,
                $openComandasObservation,
                $closureDate,
                $closedAt,
                &$openComandasSnapshot,
            ) {
                if ($openComandas) {
                    $openComandasSnapshot = $this->loadOpenComandas($unitId, true);
                    $this->closeOpenComandasAsFaturar($unitId, $user, $closedAt);
                }

                $payload = [
                    'user_id' => $user->id,
                    'unit_id' => $unitId,
                    'unit_name' => $unitName,
                    'cash_amount' => $validated['cash_amount'],
                    'card_amount' => $validated['card_amount'],
                    'closed_date' => $closureDate->toDateString(),
                    'closed_at' => $closedAt,
                ];

                if (Schema::hasColumn('cashier_closures', 'open_comandas_observation')) {
                    $payload['open_comandas_observation'] = $openComandasObservation;
                }

                CashierClosure::create($payload);
            });

            if ($openComandas && $openComandasObservation !== null) {
                try {
                    $this->notifyOpenComandasClosure(
                        $unitId,
                        $unitName,
                        $user,
                        $openComandasObservation,
                        $closedAt,
                        $openComandasSnapshot->all(),
                    );
                } catch (\Throwable $exception) {
                    Log::warning('Falha ao enviar notificacao de fechamento com comandas em aberto.', [
                        'user_id' => $user->id,
                        'unit_id' => $unitId,
                        'exception' => $exception,
                    ]);
                }
            }

            if ($closureDate->isSameDay($today)) {
                Auth::guard('web')->logout();
                $request->session()->invalidate();
                $request->session()->regenerateToken();

                return redirect()
                    ->route('login')
                    ->with('status', 'Fechamento concluido. Voce podera acessar novamente amanha.');
            }

            return redirect()
                ->route('dashboard')
                ->with('status', 'Fechamento pendente concluido. Voce pode continuar.');
        } catch (\Throwable $exception) {
            Log::error('Falha ao concluir fechamento de caixa.', [
                'user_id' => $request->user()?->id,
                'unit_id' => (int) ($this->resolveActiveUnit($request)['id'] ?? $request->user()?->tb2_id ?? 0),
                'exception' => $exception,
            ]);

            return redirect()
                ->route('cashier.close')
                ->withErrors([
                    'cash_amount' => 'Nao foi possivel concluir o fechamento do caixa. Tente novamente.',
                ])
                ->withInput();
        }
    }

    private function ensureCashier(?User $user): void
    {
        if (!$user || (int) $user->funcao !== 3) {
            abort(403);
        }
    }

    private function resolveActiveUnit(Request $request): array
    {
        $activeUnit = $request->session()->get('active_unit');

        if (is_array($activeUnit)) {
            return $activeUnit;
        }

        if (is_object($activeUnit)) {
            return [
                'id' => $activeUnit->id ?? $activeUnit->tb2_id ?? null,
                'name' => $activeUnit->name ?? $activeUnit->tb2_nome ?? null,
                'address' => $activeUnit->address ?? $activeUnit->tb2_endereco ?? null,
                'cnpj' => $activeUnit->cnpj ?? $activeUnit->tb2_cnpj ?? null,
            ];
        }

        return [];
    }

    private function resolvePendingClosureDate(User $user, int $unitId, Carbon $today): ?Carbon
    {
        $lastSaleDate = VendaPagamento::query()
            ->whereHas('vendas', function ($query) use ($user, $unitId) {
                $query->where('id_user_caixa', $user->id)
                    ->where('id_unidade', $unitId)
                    ->where('status', 1);
            })
            ->whereDate('created_at', '<', $today)
            ->latest('created_at')
            ->value('created_at');

        if (! $lastSaleDate) {
            return null;
        }

        $lastSaleDay = Carbon::parse($lastSaleDate)->startOfDay();
        $hasClosure = CashierClosure::where('user_id', $user->id)
            ->whereDate('closed_date', $lastSaleDay)
            ->where(function ($query) use ($unitId) {
                $query->whereNull('unit_id')->orWhere('unit_id', $unitId);
            })
            ->exists();

        return $hasClosure ? null : $lastSaleDay;
    }

    private function hasOpenComandas(int $unitId): bool
    {
        return Venda::query()
            ->whereNotNull('id_comanda')
            ->whereBetween('id_comanda', [3000, 3100])
            ->where('status', 0)
            ->where('id_unidade', $unitId)
            ->exists();
    }

    private function notifyOpenComandasClosure(
        int $unitId,
        ?string $unitName,
        User $executor,
        string $observation,
        Carbon $closedAt,
        array $openComandas,
    ): void {
        if ($openComandas === []) {
            return;
        }

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

        $message = $this->buildOpenComandasClosureMessage(
            $executor,
            $unitName,
            $observation,
            $openComandas,
            $closedAt,
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

    private function loadOpenComandas(int $unitId, bool $lockForUpdate = false)
    {
        $query = Venda::query()
            ->select(['id_comanda', 'produto_nome', 'quantidade', 'valor_total', 'created_at', 'data_hora'])
            ->whereNotNull('id_comanda')
            ->whereBetween('id_comanda', [3000, 3100])
            ->where('status', 0)
            ->where('id_unidade', $unitId)
            ->orderBy('id_comanda')
            ->orderBy('created_at');

        if ($lockForUpdate) {
            $query->lockForUpdate();
        }

        return $query
            ->get()
            ->groupBy(fn (Venda $sale) => (int) $sale->id_comanda)
            ->map(function ($items, $comandaId) {
                $firstItem = $items->first();
                $openedAt = $firstItem?->created_at instanceof Carbon
                    ? $firstItem->created_at
                    : Carbon::parse($firstItem?->created_at ?? $firstItem?->data_hora ?? now());

                return [
                    'comanda' => (int) $comandaId,
                    'items_count' => (int) $items->count(),
                    'total' => (float) $items->sum(fn (Venda $sale) => (float) ($sale->valor_total ?? 0)),
                    'opened_at' => $openedAt,
                    'items' => $items->map(function (Venda $sale) {
                        return sprintf(
                            '- %s | Qtd: %s | Total: %s',
                            (string) ($sale->produto_nome ?? '---'),
                            number_format((float) ($sale->quantidade ?? 0), 0, ',', '.'),
                            $this->formatCurrencyForMessage((float) ($sale->valor_total ?? 0)),
                        );
                    })->values()->all(),
                ];
            })
            ->values();
    }

    private function closeOpenComandasAsFaturar(int $unitId, User $user, Carbon $closedAt): void
    {
        $openSales = Venda::query()
            ->select(['tb3_id', 'id_comanda', 'valor_total'])
            ->whereNotNull('id_comanda')
            ->whereBetween('id_comanda', [3000, 3100])
            ->where('status', 0)
            ->where('id_unidade', $unitId)
            ->orderBy('id_comanda')
            ->orderBy('tb3_id')
            ->lockForUpdate()
            ->get();

        if ($openSales->isEmpty()) {
            return;
        }

        $openSales
            ->groupBy(fn (Venda $sale) => (int) $sale->id_comanda)
            ->each(function ($comandaSales) use ($user, $closedAt) {
                $payment = VendaPagamento::create([
                    'valor_total' => round((float) $comandaSales->sum('valor_total'), 2),
                    'tipo_pagamento' => 'faturar',
                    'valor_pago' => null,
                    'troco' => 0,
                    'dois_pgto' => 0,
                    'created_at' => $closedAt,
                    'updated_at' => $closedAt,
                ]);

                Venda::query()
                    ->whereIn('tb3_id', $comandaSales->pluck('tb3_id')->all())
                    ->update([
                        'tb4_id' => $payment->tb4_id,
                        'id_user_caixa' => $user->id,
                        'id_user_vale' => null,
                        'tipo_pago' => 'faturar',
                        'status_pago' => false,
                        'status' => 1,
                        'data_hora' => $closedAt,
                        'updated_at' => $closedAt,
                    ]);
            });
    }

    private function buildOpenComandasClosureMessage(
        User $executor,
        ?string $unitName,
        string $observation,
        array $openComandas,
        Carbon $closedAt,
    ): string {
        $lines = [
            '[b]Fechamento de caixa com comandas em aberto[/b]',
            sprintf('Usuario executor: %s', $this->formatExecutorLabel($unitName, $executor->name)),
            sprintf('Data e hora do fechamento: %s', $closedAt->format('d/m/y H:i:s')),
            sprintf('Quantidade de comandas em aberto: %d', count($openComandas)),
            sprintf('Observacao informada: %s', $observation),
            'Comandas em aberto:',
        ];

        foreach ($openComandas as $comanda) {
            $lines[] = sprintf(
                'Comanda %s | Itens: %d | Total: %s | Abertura: %s',
                (string) ($comanda['comanda'] ?? '---'),
                (int) ($comanda['items_count'] ?? 0),
                $this->formatCurrencyForMessage((float) ($comanda['total'] ?? 0)),
                ($comanda['opened_at'] instanceof Carbon ? $comanda['opened_at'] : Carbon::parse($comanda['opened_at']))->format('d/m/y H:i:s'),
            );

            foreach (($comanda['items'] ?? []) as $itemLine) {
                $lines[] = $itemLine;
            }
        }

        return implode("\n", $lines);
    }

    private function formatExecutorLabel(?string $unitName, string $executorName): string
    {
        $normalizedUnitName = trim((string) $unitName);

        return sprintf('%s - %s', $normalizedUnitName !== '' ? $normalizedUnitName : '---', $executorName);
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

    private function formatCurrencyForMessage(float $value): string
    {
        return 'R$ ' . number_format($value, 2, ',', '.');
    }
}
