<?php

namespace App\Http\Controllers;

use App\Models\CashierClosure;
use App\Models\Expense;
use App\Models\NotaFiscal;
use App\Models\ProductDiscard;
use App\Models\SalaryAdvance;
use App\Models\Supplier;
use App\Models\Venda;
use App\Models\VendaPagamento;
use App\Models\User;
use App\Models\Unidade;
use App\Support\DiscardAlertService;
use App\Support\FiscalInvoicePreparationService;
use App\Support\ManagementScope;
use App\Support\ProductQuickLookupCache;
use Carbon\Carbon;
use Carbon\Exceptions\InvalidFormatException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;

class SalesReportController extends Controller
{
    private const FISCAL_INVOICE_STATUS_FILTERS = [
        'assinada' => ['xml_assinado'],
        'erro' => ['erro_validacao', 'erro_transmissao'],
        'emitida' => ['emitida'],
    ];

    private const FISCAL_INVOICE_STATUS_LABELS = [
        'pendente_configuracao' => 'Pendente configuracao',
        'erro_validacao' => 'Erro',
        'erro_transmissao' => 'Erro',
        'pendente_emissao' => 'Pendente emissao',
        'xml_assinado' => 'Assinada',
        'emitida' => 'Emitida',
        'cancelada' => 'Cancelada',
    ];

    private const TYPE_META = [
        'dinheiro' => ['label' => 'Dinheiro', 'color' => '#16a34a'],
        'maquina' => ['label' => 'Maquina', 'color' => '#2563eb'],
        'vale' => ['label' => 'Vale', 'color' => '#f59e0b'],
        'refeicao' => ['label' => 'Refeição', 'color' => '#facc15'],
        'faturar' => ['label' => 'Faturar', 'color' => '#0f172a'],
    ];

    private const UNIT_CHART_COLORS = [
        '#2563eb',
        '#16a34a',
        '#f97316',
        '#7c3aed',
        '#dc2626',
        '#0891b2',
        '#ca8a04',
        '#db2777',
        '#4f46e5',
        '#0f766e',
        '#9333ea',
        '#ea580c',
    ];

    public function index(Request $request): Response
    {
        $this->ensureManager($request);

        $reports = [
            [
                'key' => 'control',
                'label' => 'Controle',
                'description' => 'Resumo financeiro mensal por unidade.',
                'icon' => 'bi-graph-up-arrow',
                'route' => 'reports.control',
            ],
            [
                'key' => 'cash-closure',
                'label' => 'Fechamento de caixa',
                'description' => 'Detalhe de pagamentos e diferencas por caixa.',
                'icon' => 'bi-clipboard-data',
                'route' => 'reports.cash.closure',
            ],
            [
                'key' => 'cash-discrepancies',
                'label' => 'Discrepancias de caixa',
                'description' => 'Fechamentos com diferencas entre sistema e fechamento.',
                'icon' => 'bi-exclamation-triangle',
                'route' => 'reports.cash.discrepancies',
            ],
            [
                'key' => 'sales-today',
                'label' => 'Vendas hoje',
                'description' => 'Total do dia e formas de pagamento.',
                'icon' => 'bi-calendar-day',
                'route' => 'reports.sales.today',
            ],
            [
                'key' => 'sales-period',
                'label' => 'Vendas periodo',
                'description' => 'Totais diarios no periodo selecionado.',
                'icon' => 'bi-calendar-range',
                'route' => 'reports.sales.period',
            ],
            [
                'key' => 'sales-detailed',
                'label' => 'Relatorio detalhado',
                'description' => 'Itens vendidos com detalhes por venda.',
                'icon' => 'bi-card-checklist',
                'route' => 'reports.sales.detailed',
            ],
            [
                'key' => 'lanchonete',
                'label' => 'Relatorio lanchonete',
                'description' => 'Comandas por dia e status na lanchonete.',
                'icon' => 'bi-cup-hot',
                'route' => 'reports.lanchonete',
            ],
            [
                'key' => 'pdr-cache',
                'label' => 'PDR CACHE',
                'description' => 'Produtos carregados no cache de leitura rapida do Dashboard.',
                'icon' => 'bi-lightning-charge',
                'route' => 'reports.pdr-cache',
            ],
            [
                'key' => 'comandas-aberto',
                'label' => 'Comandas em Aberto',
                'description' => 'Comandas abertas agrupadas por numero com filtros por loja e usuario.',
                'icon' => 'bi-journal-bookmark',
                'route' => 'reports.comandas-aberto',
            ],
            [
                'key' => 'vales',
                'label' => 'Vales',
                'description' => 'Compras feitas no vale.',
                'icon' => 'bi-ticket-perforated',
                'route' => 'reports.vale',
            ],
            [
                'key' => 'refeicao',
                'label' => 'Refeicao',
                'description' => 'Compras feitas na refeicao.',
                'icon' => 'bi-cup-straw',
                'route' => 'reports.refeicao',
            ],
            [
                'key' => 'faturar',
                'label' => 'Faturar',
                'description' => 'Cupons com pagamento faturado, agrupados por caixa e loja.',
                'icon' => 'bi-journal-text',
                'route' => 'reports.faturar',
            ],
            [
                'key' => 'notas-fiscais-emitidas',
                'label' => 'Notas Fiscais Emitidas',
                'description' => 'Notas fiscais por loja, situacao e periodo.',
                'icon' => 'bi-receipt-cutoff',
                'route' => 'reports.notas-fiscais-emitidas',
            ],
            [
                'key' => 'adiantamentos',
                'label' => 'Adiantamento',
                'description' => 'Adiantamentos realizados no periodo.',
                'icon' => 'bi-wallet2',
                'route' => 'reports.adiantamentos',
            ],
            [
                'key' => 'fornecedores',
                'label' => 'Fornecedores',
                'description' => 'Fornecedores cadastrados.',
                'icon' => 'bi-truck',
                'route' => 'reports.fornecedores',
            ],
            [
                'key' => 'gastos',
                'label' => 'Gastos',
                'description' => 'Gastos cadastrados no periodo.',
                'icon' => 'bi-receipt',
                'route' => 'reports.gastos',
            ],
            [
                'key' => 'gastos-categorias',
                'label' => 'Gastos por categoria',
                'description' => 'Gastos agrupados por categoria com detalhamento.',
                'icon' => 'bi-tags',
                'route' => 'reports.gastos.categorias',
            ],
            [
                'key' => 'descarte',
                'label' => 'Descarte',
                'description' => 'Descartes registrados no periodo.',
                'icon' => 'bi-recycle',
                'route' => 'reports.descarte',
            ],
            [
                'key' => 'descarte-consolidado',
                'label' => 'Discarte Consolidado',
                'description' => 'Agrupa descartes por item para destacar os produtos mais descartados no mes.',
                'icon' => 'bi-bar-chart-line',
                'route' => 'reports.descarte.consolidado',
            ],
        ];

        return Inertia::render('Reports/Index', [
            'reports' => $reports,
        ]);
    }

    public function pdrCache(Request $request, ProductQuickLookupCache $quickLookupCache): Response
    {
        $this->ensureManager($request);

        $products = collect($quickLookupCache->forRequest($request))
            ->values()
            ->map(fn (array $product, int $index) => [
                'position' => $index + 1,
                'id' => (int) ($product['tb1_id'] ?? 0),
                'name' => (string) ($product['tb1_nome'] ?? ''),
                'barcode' => (string) ($product['tb1_codbar'] ?? ''),
                'sale_price' => (float) ($product['tb1_vlr_venda'] ?? 0),
            ])
            ->all();

        return Inertia::render('Reports/PdrCache', [
            'products' => $products,
            'cacheScope' => 'Todos ativos',
            'cacheHours' => $quickLookupCache->ttlHours(),
        ]);
    }

    public function vale(Request $request): Response
    {
        $this->ensureManagementViewer($request);
        [$filterUnitId, $filterUnits, $selectedUnit] = $this->resolveReportUnit($request);
        $allowedUnitIds = $this->reportUnitIds($filterUnits);
        [$start, $end, $startDate, $endDate] = $this->resolveDateRange($request);
        $selectedUserId = $this->resolveReportUserId($request->query('user_id'));
        $isMobileReport = $request->routeIs('mobile.*');

        if ($isMobileReport) {
            $filterUnitId = null;
            $selectedUnit = ['id' => null, 'name' => 'Todas as unidades'];
        }

        $filterUsersQuery = User::query()->orderBy('name');
        ManagementScope::applyManagedUserScope($filterUsersQuery, $request->user());

        if ($filterUnitId) {
            $filterUsersQuery->where(function ($query) use ($filterUnitId) {
                $query
                    ->where('tb2_id', $filterUnitId)
                    ->orWhereHas('units', function ($unitQuery) use ($filterUnitId) {
                        $unitQuery->where('tb2_unidades.tb2_id', $filterUnitId);
                    });
            });
        }

        $filterUsers = $filterUsersQuery
            ->get(['id', 'name'])
            ->map(fn (User $user) => [
                'id' => (int) $user->id,
                'name' => $user->name,
            ])
            ->values();

        if ($selectedUserId && ! $filterUsers->contains(fn (array $user) => $user['id'] === $selectedUserId)) {
            $selectedUserId = null;
        }

        $applySaleFilters = function ($query) use ($filterUnitId, $allowedUnitIds) {
            if ($filterUnitId) {
                $query->where('id_unidade', $filterUnitId);
            } elseif ($allowedUnitIds->isNotEmpty()) {
                $query->whereIn('id_unidade', $allowedUnitIds);
            } else {
                $query->whereRaw('1 = 0');
            }
        };

        $rows = VendaPagamento::query()
            ->with([
                'vendas' => function ($query) use ($applySaleFilters) {
                    $query
                        ->with(['unidade:tb2_id,tb2_nome,tb2_endereco,tb2_cnpj', 'caixa:id,name', 'valeUser:id,name'])
                        ->orderBy('tb3_id')
                        ->select([
                            'tb3_id',
                            'tb4_id',
                            'tb1_id',
                            'produto_nome',
                            'valor_unitario',
                            'quantidade',
                            'valor_total',
                            'data_hora',
                            'id_comanda',
                            'id_unidade',
                            'id_user_caixa',
                            'id_user_vale',
                        ]);

                    $applySaleFilters($query);
                },
            ])
            ->where('tipo_pagamento', 'vale')
            ->whereHas('vendas', function ($subQuery) use ($applySaleFilters) {
                $applySaleFilters($subQuery);
            })
            ->when($selectedUserId, function ($query) use ($selectedUserId) {
                $query->whereHas('vendas', function ($subQuery) use ($selectedUserId) {
                    $subQuery->where('id_user_vale', $selectedUserId);
                });
            })
            ->whereBetween('created_at', [$start, $end])
            ->orderByDesc('tb4_id')
            ->get([
                'valor_total',
                'tb4_id',
                'tipo_pagamento',
                'valor_pago',
                'troco',
                'dois_pgto',
                'created_at',
            ])
            ->map(function (VendaPagamento $payment) {
                $sales = $payment->vendas->values();
                $firstSale = $sales->first();
                $saleDateTime = $firstSale?->data_hora ?? $payment->created_at;
                $receiptComanda = $this->resolveReceiptComanda($sales);
                $displayPaymentType = $this->normalizePaymentTypeForDisplay($payment->tipo_pagamento);

                return [
                    'id' => $payment->tb4_id,
                    'date_time' => $saleDateTime?->toIso8601String(),
                    'comanda' => $receiptComanda,
                    'items_count' => (int) $sales->sum('quantidade'),
                    'items_label' => $sales
                        ->map(function (Venda $sale) {
                            return trim(sprintf('%sx %s', (int) $sale->quantidade, $sale->produto_nome));
                        })
                        ->implode(', '),
                    'total' => round((float) $payment->valor_total, 2),
                    'unit_name' => $firstSale?->unidade?->tb2_nome ?? '---',
                    'cashier' => $firstSale?->caixa?->name ?? null,
                    'vale_user' => $firstSale?->valeUser?->name ?? null,
                    'receipt' => [
                        'id' => $payment->tb4_id,
                        'comanda' => $receiptComanda,
                        'total' => round((float) $payment->valor_total, 2),
                        'date_time' => $saleDateTime?->toIso8601String(),
                        'tipo_pago' => $displayPaymentType,
                        'cashier_name' => $firstSale?->caixa?->name ?? '---',
                        'unit_name' => $firstSale?->unidade?->tb2_nome ?? '---',
                        'unit_address' => $firstSale?->unidade?->tb2_endereco,
                        'unit_cnpj' => $firstSale?->unidade?->tb2_cnpj,
                        'vale_user_name' => $firstSale?->valeUser?->name,
                        'vale_type' => 'vale',
                        'payment' => [
                            'id' => $payment->tb4_id,
                            'valor_total' => round((float) $payment->valor_total, 2),
                            'valor_pago' => $payment->valor_pago !== null ? round((float) $payment->valor_pago, 2) : null,
                            'troco' => $payment->troco !== null ? round((float) $payment->troco, 2) : null,
                            'dois_pgto' => $payment->dois_pgto !== null ? round((float) $payment->dois_pgto, 2) : null,
                            'tipo_pagamento' => $displayPaymentType,
                        ],
                        'items' => $sales
                            ->map(function (Venda $sale) {
                                return [
                                    'id' => $sale->tb3_id,
                                    'product_id' => $sale->tb1_id,
                                    'product_name' => $sale->produto_nome,
                                    'quantity' => (int) $sale->quantidade,
                                    'unit_price' => round((float) $sale->valor_unitario, 2),
                                    'subtotal' => round((float) $sale->valor_total, 2),
                                    'comanda' => $sale->id_comanda,
                                ];
                            })
                            ->values(),
                    ],
                ];
            })
            ->values();

        return Inertia::render($isMobileReport ? 'Mobile/Reports/Vale' : 'Reports/Vale', [
            'rows' => $rows,
            'startDate' => $startDate,
            'endDate' => $endDate,
            'unit' => $selectedUnit,
            'filterUnits' => $filterUnits,
            'filterUsers' => $filterUsers,
            'selectedUnitId' => $filterUnitId,
            'selectedUserId' => $selectedUserId,
        ]);
    }

    public function comandasEmAberto(Request $request): Response
    {
        $this->ensureManagementViewer($request);
        [$filterUnitId, $filterUnits, $selectedUnit] = $this->resolveReportUnit($request);
        $allowedUnitIds = $this->reportUnitIds($filterUnits);
        [$start, $end, $startDate, $endDate] = $this->resolveDateRange($request);
        $selectedUserId = $this->resolveReportUserId($request->query('user_id'));

        $filterUsersQuery = User::query()
            ->whereIn('funcao', [3, 4])
            ->orderBy('name');

        ManagementScope::applyManagedUserScope($filterUsersQuery, $request->user());

        if ($filterUnitId) {
            $filterUsersQuery->where(function ($query) use ($filterUnitId) {
                $query
                    ->where('tb2_id', $filterUnitId)
                    ->orWhereHas('units', function ($unitQuery) use ($filterUnitId) {
                        $unitQuery->where('tb2_unidades.tb2_id', $filterUnitId);
                    });
            });
        }

        $filterUsers = $filterUsersQuery
            ->get(['id', 'name'])
            ->map(fn (User $user) => [
                'id' => (int) $user->id,
                'name' => $user->name,
            ])
            ->values();

        if ($selectedUserId && ! $filterUsers->contains(fn (array $user) => $user['id'] === $selectedUserId)) {
            $selectedUserId = null;
        }

        $rows = Venda::query()
            ->with(['unidade:tb2_id,tb2_nome,tb2_endereco,tb2_cnpj', 'caixa:id,name'])
            ->whereNotNull('id_comanda')
            ->whereBetween('id_comanda', [3000, 3100])
            ->where('status', 0)
            ->when($filterUnitId, function ($query) use ($filterUnitId) {
                $query->where('id_unidade', $filterUnitId);
            }, function ($query) use ($allowedUnitIds) {
                if ($allowedUnitIds->isNotEmpty()) {
                    $query->whereIn('id_unidade', $allowedUnitIds);
                } else {
                    $query->whereRaw('1 = 0');
                }
            })
            ->when($selectedUserId, function ($query) use ($selectedUserId) {
                $query->where(function ($subQuery) use ($selectedUserId) {
                    $subQuery
                        ->where('id_user_caixa', $selectedUserId)
                        ->orWhere('id_lanc', $selectedUserId);
                });
            })
            ->whereBetween('data_hora', [$start, $end])
            ->orderByDesc('data_hora')
            ->get([
                'tb3_id',
                'tb4_id',
                'tb1_id',
                'id_comanda',
                'produto_nome',
                'valor_unitario',
                'quantidade',
                'valor_total',
                'data_hora',
                'id_unidade',
                'id_user_caixa',
                'id_lanc',
            ]);

        $userIds = $rows
            ->flatMap(fn (Venda $row) => [$row->id_user_caixa, $row->id_lanc])
            ->filter()
            ->unique()
            ->values();

        $users = $userIds->isNotEmpty()
            ? User::whereIn('id', $userIds)->pluck('name', 'id')
            : collect();

        $comandas = $rows
            ->groupBy('id_comanda')
            ->map(function (Collection $items, $comanda) use ($users) {
                $first = $items->first();
                $updatedAt = $items->max('data_hora');
                $dateTime = $updatedAt ? Carbon::parse($updatedAt)->toIso8601String() : null;

                return [
                    'id' => (int) $comanda,
                    'comanda' => (int) $comanda,
                    'cashier' => $first?->caixa?->name ?? ($first?->id_user_caixa ? ($users[$first->id_user_caixa] ?? null) : null),
                    'cashier_id' => $first?->id_user_caixa ? (int) $first->id_user_caixa : null,
                    'lanchonete_user' => $first?->id_lanc ? ($users[$first->id_lanc] ?? null) : null,
                    'lanchonete_user_id' => $first?->id_lanc ? (int) $first->id_lanc : null,
                    'unit_name' => $first?->unidade?->tb2_nome ?? '---',
                    'date_time' => $dateTime,
                    'items_count' => (int) $items->sum('quantidade'),
                    'total' => round((float) $items->sum('valor_total'), 2),
                    'receipt' => [
                        'id' => (int) $comanda,
                        'total' => round((float) $items->sum('valor_total'), 2),
                        'date_time' => $dateTime,
                        'tipo_pago' => 'faturar',
                        'cashier_name' => $first?->caixa?->name ?? ($first?->id_user_caixa ? ($users[$first->id_user_caixa] ?? '---') : '---'),
                        'unit_name' => $first?->unidade?->tb2_nome ?? '---',
                        'unit_address' => $first?->unidade?->tb2_endereco,
                        'unit_cnpj' => $first?->unidade?->tb2_cnpj,
                        'vale_user_name' => null,
                        'vale_type' => null,
                        'payment' => [
                            'id' => $first?->tb4_id,
                            'valor_total' => round((float) $items->sum('valor_total'), 2),
                            'valor_pago' => null,
                            'troco' => null,
                            'dois_pgto' => null,
                            'tipo_pagamento' => 'faturar',
                        ],
                        'items' => $items
                            ->map(function (Venda $item) use ($users) {
                                return [
                                    'id' => $item->tb3_id,
                                    'product_id' => $item->tb1_id,
                                    'product_name' => $item->produto_nome,
                                    'quantity' => (int) $item->quantidade,
                                    'unit_price' => round((float) $item->valor_unitario, 2),
                                    'subtotal' => round((float) $item->valor_total, 2),
                                    'comanda' => $item->id_comanda,
                                    'cashier_name' => $item->id_user_caixa ? ($users[$item->id_user_caixa] ?? null) : null,
                                    'lanchonete_user_name' => $item->id_lanc ? ($users[$item->id_lanc] ?? null) : null,
                                ];
                            })
                            ->values(),
                    ],
                ];
            })
            ->sortBy('comanda')
            ->values();

        return Inertia::render('Reports/ComandasEmAberto', [
            'rows' => $comandas,
            'summary' => [
                'total_amount' => round((float) $comandas->sum('total'), 2),
                'total_records' => $comandas->count(),
            ],
            'startDate' => $startDate,
            'endDate' => $endDate,
            'unit' => $selectedUnit,
            'filterUnits' => $filterUnits,
            'filterUsers' => $filterUsers,
            'selectedUnitId' => $filterUnitId,
            'selectedUserId' => $selectedUserId,
        ]);
    }

    public function refeicao(Request $request): Response
    {
        $this->ensureManagementViewer($request);
        [$filterUnitId, $filterUnits, $selectedUnit] = $this->resolveReportUnit($request);
        $allowedUnitIds = $this->reportUnitIds($filterUnits);
        [$start, $end, $startDate, $endDate] = $this->resolveDateRange($request);

        $rows = Venda::query()
            ->with(['unidade:tb2_id,tb2_nome', 'caixa:id,name', 'valeUser:id,name'])
            ->where('tipo_pago', 'refeicao')
            ->when($filterUnitId, function ($query) use ($filterUnitId) {
                $query->where('id_unidade', $filterUnitId);
            }, function ($query) use ($allowedUnitIds) {
                if ($allowedUnitIds->isNotEmpty()) {
                    $query->whereIn('id_unidade', $allowedUnitIds);
                } else {
                    $query->whereRaw('1 = 0');
                }
            })
            ->whereBetween('data_hora', [$start, $end])
            ->orderByDesc('data_hora')
            ->get([
                'tb3_id',
                'id_comanda',
                'produto_nome',
                'valor_unitario',
                'quantidade',
                'valor_total',
                'data_hora',
                'id_unidade',
                'id_user_caixa',
                'id_user_vale',
            ])
            ->map(function (Venda $row) {
                return [
                    'id' => $row->tb3_id,
                    'comanda' => $row->id_comanda,
                    'product' => $row->produto_nome,
                    'quantity' => (int) $row->quantidade,
                    'unit_price' => (float) $row->valor_unitario,
                    'total' => round((float) $row->valor_total, 2),
                    'sold_at' => $row->data_hora ? $row->data_hora->toIso8601String() : null,
                    'unit_name' => $row->unidade?->tb2_nome ?? '---',
                    'cashier' => $row->caixa?->name ?? null,
                    'vale_user' => $row->valeUser?->name ?? null,
                ];
            })
            ->values();

        return Inertia::render('Reports/Refeicao', [
            'rows' => $rows,
            'startDate' => $startDate,
            'endDate' => $endDate,
            'unit' => $selectedUnit,
            'filterUnits' => $filterUnits,
            'selectedUnitId' => $filterUnitId,
        ]);
    }

    public function faturar(Request $request): Response
    {
        $this->ensureManager($request);
        [$filterUnitId, $filterUnits, $selectedUnit] = $this->resolveReportUnit($request);
        [$start, $end, $startDate, $endDate] = $this->resolveDateRange($request);

        $requestedCashierId = $request->query('cashier_id');
        $filterCashierId = $requestedCashierId !== null && $requestedCashierId !== '' && $requestedCashierId !== 'all'
            ? (int) $requestedCashierId
            : null;

        if ($filterCashierId !== null && $filterCashierId <= 0) {
            $filterCashierId = null;
        }

        $allowedUnitIds = collect($filterUnits)->pluck('id')->filter()->values();

        $applyBaseSaleFilters = function ($query) use ($filterUnitId, $allowedUnitIds) {
            if ($filterUnitId) {
                $query->where('id_unidade', $filterUnitId);
            } elseif ($allowedUnitIds->isNotEmpty()) {
                $query->whereIn('id_unidade', $allowedUnitIds);
            }
        };

        $cashierPayments = VendaPagamento::query()
            ->where('tipo_pagamento', 'faturar')
            ->whereBetween('created_at', [$start, $end])
            ->with(['vendas' => function ($query) use ($applyBaseSaleFilters) {
                $query->select('tb3_id', 'tb4_id', 'id_user_caixa', 'id_unidade')
                    ->orderBy('tb3_id');
                $applyBaseSaleFilters($query);
            }])
            ->whereHas('vendas', function ($query) use ($applyBaseSaleFilters) {
                $applyBaseSaleFilters($query);
            })
            ->get(['tb4_id']);

        $cashierIds = $cashierPayments
            ->map(fn (VendaPagamento $payment) => optional($payment->vendas->first())->id_user_caixa)
            ->filter()
            ->unique()
            ->values();

        $cashiers = $cashierIds->isNotEmpty()
            ? User::whereIn('id', $cashierIds)->orderBy('name')->get(['id', 'name'])
            : collect();

        $cashierOptions = $cashiers
            ->map(fn (User $cashier) => [
                'id' => (int) $cashier->id,
                'name' => $cashier->name,
            ])
            ->values();

        if ($filterCashierId && ! $cashierOptions->contains(fn (array $cashier) => $cashier['id'] === $filterCashierId)) {
            $filterCashierId = null;
        }

        $payments = VendaPagamento::query()
            ->with([
                'vendas' => function ($query) use ($applyBaseSaleFilters, $filterCashierId) {
                    $query
                        ->with(['unidade:tb2_id,tb2_nome,tb2_endereco,tb2_cnpj', 'caixa:id,name', 'valeUser:id,name'])
                        ->orderBy('tb3_id')
                        ->select([
                            'tb3_id',
                            'tb4_id',
                            'tb1_id',
                            'produto_nome',
                            'valor_unitario',
                            'quantidade',
                            'valor_total',
                            'data_hora',
                            'id_comanda',
                            'id_unidade',
                            'id_user_caixa',
                            'id_user_vale',
                        ]);

                    $applyBaseSaleFilters($query);

                    if ($filterCashierId) {
                        $query->where('id_user_caixa', $filterCashierId);
                    }
                },
            ])
            ->where('tipo_pagamento', 'faturar')
            ->whereBetween('created_at', [$start, $end])
            ->whereHas('vendas', function ($query) use ($applyBaseSaleFilters, $filterCashierId) {
                $applyBaseSaleFilters($query);

                if ($filterCashierId) {
                    $query->where('id_user_caixa', $filterCashierId);
                }
            })
            ->orderByDesc('tb4_id')
            ->get([
                'tb4_id',
                'valor_total',
                'tipo_pagamento',
                'valor_pago',
                'troco',
                'dois_pgto',
                'created_at',
            ]);

        $receipts = $payments
            ->map(function (VendaPagamento $payment) {
                $sales = $payment->vendas->values();
                $firstSale = $sales->first();
                $saleDateTime = $firstSale?->data_hora ?? $payment->created_at;
                $cashierId = $firstSale?->id_user_caixa ? (int) $firstSale->id_user_caixa : null;
                $unitId = $firstSale?->id_unidade ? (int) $firstSale->id_unidade : null;
                $receiptComanda = $this->resolveReceiptComanda($sales);
                $displayPaymentType = $this->normalizePaymentTypeForDisplay($payment->tipo_pagamento);

                return [
                    'id' => $payment->tb4_id,
                    'cashier_id' => $cashierId,
                    'cashier_name' => $firstSale?->caixa?->name
                        ?? ($cashierId ? 'Caixa #' . $cashierId : '---'),
                    'unit_id' => $unitId,
                    'unit_name' => $firstSale?->unidade?->tb2_nome ?? '---',
                    'date_time' => $saleDateTime?->toIso8601String(),
                    'comanda' => $receiptComanda,
                    'total' => round((float) $payment->valor_total, 2),
                    'receipt' => [
                        'id' => $payment->tb4_id,
                        'comanda' => $receiptComanda,
                        'total' => round((float) $payment->valor_total, 2),
                        'date_time' => $saleDateTime?->toIso8601String(),
                        'tipo_pago' => $displayPaymentType,
                        'cashier_name' => $firstSale?->caixa?->name ?? '---',
                        'unit_name' => $firstSale?->unidade?->tb2_nome ?? '---',
                        'unit_address' => $firstSale?->unidade?->tb2_endereco,
                        'unit_cnpj' => $firstSale?->unidade?->tb2_cnpj,
                        'vale_user_name' => $firstSale?->valeUser?->name,
                        'vale_type' => null,
                        'payment' => [
                            'id' => $payment->tb4_id,
                            'valor_total' => round((float) $payment->valor_total, 2),
                            'valor_pago' => $payment->valor_pago !== null ? round((float) $payment->valor_pago, 2) : null,
                            'troco' => $payment->troco !== null ? round((float) $payment->troco, 2) : null,
                            'dois_pgto' => $payment->dois_pgto !== null ? round((float) $payment->dois_pgto, 2) : null,
                            'tipo_pagamento' => $displayPaymentType,
                        ],
                        'items' => $sales
                            ->map(function (Venda $sale) {
                                return [
                                    'id' => $sale->tb3_id,
                                    'product_id' => $sale->tb1_id,
                                    'product_name' => $sale->produto_nome,
                                    'quantity' => (int) $sale->quantidade,
                                    'unit_price' => round((float) $sale->valor_unitario, 2),
                                    'subtotal' => round((float) $sale->valor_total, 2),
                                    'comanda' => $sale->id_comanda,
                                ];
                            })
                            ->values(),
                    ],
                ];
            })
            ->values();

        $rows = $receipts
            ->groupBy(function (array $receipt) {
                return ($receipt['cashier_id'] ?? 'none') . '-' . ($receipt['unit_id'] ?? 'none');
            })
            ->map(function (Collection $groupedReceipts, string $groupKey) {
                $first = $groupedReceipts->first();

                return [
                    'row_key' => $groupKey,
                    'cashier_id' => $first['cashier_id'],
                    'cashier_name' => $first['cashier_name'],
                    'unit_id' => $first['unit_id'],
                    'unit_name' => $first['unit_name'],
                    'total' => round((float) $groupedReceipts->sum('total'), 2),
                    'records_count' => $groupedReceipts->count(),
                    'receipts' => $groupedReceipts
                        ->map(function (array $receipt) {
                            return [
                                'id' => $receipt['id'],
                                'date_time' => $receipt['date_time'],
                                'comanda' => $receipt['comanda'],
                                'total' => $receipt['total'],
                                'receipt' => $receipt['receipt'],
                            ];
                        })
                        ->values(),
                ];
            })
            ->sortByDesc('total')
            ->values();

        return Inertia::render('Reports/Faturar', [
            'rows' => $rows,
            'summary' => [
                'total_amount' => round((float) $receipts->sum('total'), 2),
                'total_records' => $receipts->count(),
            ],
            'startDate' => $startDate,
            'endDate' => $endDate,
            'unit' => $selectedUnit,
            'filterUnits' => $filterUnits,
            'cashiers' => $cashierOptions,
            'selectedUnitId' => $filterUnitId,
            'selectedCashierId' => $filterCashierId,
        ]);
    }

    public function adiantamentos(Request $request): Response
    {
        $this->ensureManager($request);
        [$filterUnitId, $filterUnits, $selectedUnit] = $this->resolveReportUnit($request);
        $allowedUnitIds = $this->reportUnitIds($filterUnits);
        [$start, $end, $startDate, $endDate] = $this->resolveDateRange($request);
        $selectedUserId = $this->resolveReportUserId($request->query('user_id'));

        $filterUsersQuery = User::query()
            ->where('funcao', '!=', 6)
            ->orderBy('name');

        ManagementScope::applyManagedUserScope($filterUsersQuery, $request->user());

        if ($filterUnitId) {
            $filterUsersQuery->where(function ($query) use ($filterUnitId) {
                $query
                    ->where('tb2_id', $filterUnitId)
                    ->orWhereHas('units', function ($unitQuery) use ($filterUnitId) {
                        $unitQuery->where('tb2_unidades.tb2_id', $filterUnitId);
                    });
            });
        }

        $filterUsers = $filterUsersQuery
            ->get(['id', 'name'])
            ->map(fn (User $user) => [
                'id' => (int) $user->id,
                'name' => $user->name,
            ])
            ->values();

        if ($selectedUserId && ! $filterUsers->contains(fn (array $user) => $user['id'] === $selectedUserId)) {
            $selectedUserId = null;
        }

        $filteredAdvances = SalaryAdvance::query()
            ->with(['user:id,name,tb2_id', 'unit:tb2_id,tb2_nome'])
            ->whereBetween('advance_date', [$startDate, $endDate])
            ->when($selectedUserId, function ($query) use ($selectedUserId) {
                $query->where('user_id', $selectedUserId);
            })
            ->when(! ManagementScope::isMaster($request->user()), function ($query) use ($request) {
                $query->whereHas('user', function ($userQuery) use ($request) {
                    ManagementScope::applyManagedUserScope($userQuery, $request->user());
                });
            })
            ->when($filterUnitId, function ($query) use ($filterUnitId) {
                $query->where(function ($sub) use ($filterUnitId) {
                    $sub->where('unit_id', $filterUnitId)
                        ->orWhere(function ($legacy) use ($filterUnitId) {
                            $legacy->whereNull('unit_id')
                                ->where(function ($legacyUnit) use ($filterUnitId) {
                                    $legacyUnit->whereHas('user', function ($userQuery) use ($filterUnitId) {
                                        $userQuery->where('tb2_id', $filterUnitId);
                                    })->orWhereHas('user.units', function ($unitQuery) use ($filterUnitId) {
                                        $unitQuery->where('tb2_unidades.tb2_id', $filterUnitId);
                                    });
                                });
                        });
                });
            }, function ($query) use ($allowedUnitIds) {
                if ($allowedUnitIds->isEmpty()) {
                    $query->whereRaw('1 = 0');

                    return;
                }

                $query->where(function ($sub) use ($allowedUnitIds) {
                    $sub->whereIn('unit_id', $allowedUnitIds)
                        ->orWhere(function ($legacy) use ($allowedUnitIds) {
                            $legacy->whereNull('unit_id')
                                ->where(function ($legacyUnit) use ($allowedUnitIds) {
                                    $legacyUnit->whereHas('user', function ($userQuery) use ($allowedUnitIds) {
                                        $userQuery->whereIn('tb2_id', $allowedUnitIds);
                                    })->orWhereHas('user.units', function ($unitQuery) use ($allowedUnitIds) {
                                        $unitQuery->whereIn('tb2_unidades.tb2_id', $allowedUnitIds);
                                    });
                                });
                        });
                });
            })
            ->orderByDesc('advance_date')
            ->get([
                'id',
                'user_id',
                'unit_id',
                'advance_date',
                'amount',
                'reason',
            ]);

        $userIds = $filteredAdvances
            ->pluck('user_id')
            ->filter()
            ->unique()
            ->values();

        $detailAdvances = $userIds->isEmpty()
            ? collect()
            : SalaryAdvance::query()
                ->with(['user:id,name,tb2_id', 'unit:tb2_id,tb2_nome'])
                ->whereBetween('advance_date', [$startDate, $endDate])
                ->whereIn('user_id', $userIds)
                ->when($allowedUnitIds->isNotEmpty(), function ($query) use ($allowedUnitIds) {
                    $query->where(function ($sub) use ($allowedUnitIds) {
                        $sub->whereIn('unit_id', $allowedUnitIds)
                            ->orWhere(function ($legacy) use ($allowedUnitIds) {
                                $legacy->whereNull('unit_id')
                                    ->where(function ($legacyUnit) use ($allowedUnitIds) {
                                        $legacyUnit->whereHas('user', function ($userQuery) use ($allowedUnitIds) {
                                            $userQuery->whereIn('tb2_id', $allowedUnitIds);
                                        })->orWhereHas('user.units', function ($unitQuery) use ($allowedUnitIds) {
                                            $unitQuery->whereIn('tb2_unidades.tb2_id', $allowedUnitIds);
                                        });
                                    });
                            });
                    });
                }, function ($query) {
                    $query->whereRaw('1 = 0');
                })
                ->orderBy('advance_date')
                ->orderBy('id')
                ->get([
                    'id',
                    'user_id',
                    'unit_id',
                    'advance_date',
                    'amount',
                    'reason',
                ]);

        $detailByUser = $detailAdvances->groupBy('user_id');

        $rows = $filteredAdvances
            ->groupBy('user_id')
            ->map(function (Collection $group, $userId) use ($detailByUser, $startDate, $endDate) {
                $first = $group->first();
                $detailRecords = $detailByUser
                    ->get($userId, collect())
                    ->map(function (SalaryAdvance $advance) {
                        return [
                            'id' => $advance->id,
                            'advance_date' => $advance->advance_date?->toDateString(),
                            'amount' => round((float) $advance->amount, 2),
                            'reason' => $advance->reason,
                            'unit_name' => $advance->unit?->tb2_nome ?? '---',
                        ];
                    })
                    ->values();

                return [
                    'id' => 'user-' . $userId,
                    'user_id' => (int) $userId,
                    'user_name' => $first?->user?->name ?? '---',
                    'records_count' => $group->count(),
                    'total_amount' => round((float) $group->sum('amount'), 2),
                    'detail_records_count' => $detailRecords->count(),
                    'detail_total_amount' => round((float) $detailRecords->sum('amount'), 2),
                    'detail' => [
                        'user_id' => (int) $userId,
                        'user_name' => $first?->user?->name ?? '---',
                        'start_date' => $startDate,
                        'end_date' => $endDate,
                        'records_count' => $detailRecords->count(),
                        'total_amount' => round((float) $detailRecords->sum('amount'), 2),
                        'records' => $detailRecords->all(),
                    ],
                ];
            })
            ->sortBy('user_name')
            ->values();

        return Inertia::render('Reports/Advances', [
            'rows' => $rows,
            'startDate' => $startDate,
            'endDate' => $endDate,
            'unit' => $selectedUnit,
            'filterUnits' => $filterUnits,
            'filterUsers' => $filterUsers,
            'selectedUnitId' => $filterUnitId,
            'selectedUserId' => $selectedUserId,
        ]);
    }

    public function fornecedores(Request $request): Response
    {
        $this->ensureManager($request);
        [$filterUnitId, $filterUnits, $selectedUnit] = $this->resolveReportUnit($request);
        $allowedUnitIds = $this->reportUnitIds($filterUnits);

        $suppliers = Supplier::query()
            ->when($filterUnitId, function ($query) use ($filterUnitId) {
                $query->whereHas('expenses', function ($expenseQuery) use ($filterUnitId) {
                    $expenseQuery->where('unit_id', $filterUnitId);
                });
            }, function ($query) use ($allowedUnitIds) {
                if ($allowedUnitIds->isNotEmpty()) {
                    $query->whereHas('expenses', function ($expenseQuery) use ($allowedUnitIds) {
                        $expenseQuery->whereIn('unit_id', $allowedUnitIds);
                    });
                } else {
                    $query->whereRaw('1 = 0');
                }
            })
            ->orderBy('name')
            ->get([
                'id',
                'name',
                'access_code',
                'dispute',
                'created_at',
            ])
            ->map(function (Supplier $supplier) {
                return [
                    'id' => $supplier->id,
                    'name' => $supplier->name,
                    'access_code' => $supplier->access_code,
                    'dispute' => (bool) $supplier->dispute,
                    'created_at' => $supplier->created_at?->toIso8601String(),
                ];
            })
            ->values();

        return Inertia::render('Reports/Suppliers', [
            'suppliers' => $suppliers,
            'unit' => $selectedUnit,
            'filterUnits' => $filterUnits,
            'selectedUnitId' => $filterUnitId,
        ]);
    }

    public function gastos(Request $request): Response
    {
        $this->ensureManager($request);
        [$filterUnitId, $filterUnits, $selectedUnit] = $this->resolveReportUnit($request);
        $allowedUnitIds = $this->reportUnitIds($filterUnits);
        [$start, $end, $startDate, $endDate] = $this->resolveDateRange($request);

        $rows = Expense::query()
            ->with(['supplier:id,name', 'unit:tb2_id,tb2_nome', 'user:id,name'])
            ->whereBetween('expense_date', [$startDate, $endDate])
            ->when($filterUnitId, function ($query) use ($filterUnitId) {
                $query->where('unit_id', $filterUnitId);
            }, function ($query) use ($allowedUnitIds) {
                if ($allowedUnitIds->isNotEmpty()) {
                    $query->whereIn('unit_id', $allowedUnitIds);
                } else {
                    $query->whereRaw('1 = 0');
                }
            })
            ->orderByDesc('expense_date')
            ->get([
                'id',
                'supplier_id',
                'unit_id',
                'user_id',
                'expense_date',
                'amount',
                'notes',
            ])
            ->map(function (Expense $expense) {
                return [
                    'id' => $expense->id,
                    'expense_date' => $expense->expense_date?->toDateString(),
                    'supplier' => $expense->supplier?->name ?? '---',
                    'unit' => $expense->unit?->tb2_nome ?? '---',
                    'user_name' => $expense->user?->name ?? '---',
                    'amount' => round((float) $expense->amount, 2),
                    'notes' => $expense->notes,
                ];
            })
            ->values();

        return Inertia::render('Reports/Expenses', [
            'rows' => $rows,
            'startDate' => $startDate,
            'endDate' => $endDate,
            'unit' => $selectedUnit,
            'filterUnits' => $filterUnits,
            'selectedUnitId' => $filterUnitId,
        ]);
    }

    public function gastosCategorias(Request $request): Response
    {
        $this->ensureManager($request);
        [$filterUnitId, $filterUnits, $selectedUnit] = $this->resolveReportUnit($request);
        $allowedUnitIds = $this->reportUnitIds($filterUnits);
        [$start, $end, $startDate, $endDate] = $this->resolveDateRange($request);

        $rowsQuery = Expense::query()
            ->with(['supplier:id,name', 'unit:tb2_id,tb2_nome', 'user:id,name'])
            ->whereBetween('expense_date', [$startDate, $endDate])
            ->when($filterUnitId, function ($query) use ($filterUnitId) {
                $query->where('unit_id', $filterUnitId);
            }, function ($query) use ($allowedUnitIds) {
                if ($allowedUnitIds->isNotEmpty()) {
                    $query->whereIn('unit_id', $allowedUnitIds);
                } else {
                    $query->whereRaw('1 = 0');
                }
            })
            ->orderByDesc('expense_date')
            ->orderByDesc('id');

        $rows = $rowsQuery->get([
            'id',
            'supplier_id',
            'unit_id',
            'user_id',
            'expense_date',
            'amount',
            'notes',
        ]);

        $categories = $rows
            ->groupBy(function (Expense $expense) {
                return $this->normalizeExpenseCategory((string) ($expense->notes ?? ''));
            })
            ->map(function (Collection $group, string $categoryName) {
                return [
                    'id' => $this->buildExpenseCategoryKey($categoryName),
                    'category_name' => $categoryName,
                    'records_count' => $group->count(),
                    'total_amount' => round((float) $group->sum('amount'), 2),
                    'records' => $group
                        ->map(function (Expense $expense) {
                            return [
                                'id' => $expense->id,
                                'expense_date' => $expense->expense_date?->toDateString(),
                                'supplier' => $expense->supplier?->name ?? '---',
                                'unit' => $expense->unit?->tb2_nome ?? '---',
                                'user_name' => $expense->user?->name ?? '---',
                                'amount' => round((float) $expense->amount, 2),
                                'notes' => $expense->notes,
                            ];
                        })
                        ->values()
                        ->all(),
                ];
            })
            ->sortByDesc('total_amount')
            ->values();

        return Inertia::render('Reports/ExpenseCategories', [
            'categories' => $categories,
            'startDate' => $startDate,
            'endDate' => $endDate,
            'unit' => $selectedUnit,
            'filterUnits' => $filterUnits,
            'selectedUnitId' => $filterUnitId,
            'totalPersonal' => round((float) $categories->sum('total_amount'), 2),
        ]);
    }

    public function notasFiscaisEmitidas(Request $request): Response
    {
        $this->ensureManager($request);
        [$filterUnitId, $filterUnits, $selectedUnit] = $this->resolveReportUnit($request);
        $allowedUnitIds = $this->reportUnitIds($filterUnits);
        [$start, $end, $startDate, $endDate] = $this->resolveDateRange($request);
        $selectedStatus = $this->resolveFiscalInvoiceStatusFilter($request->query('status'));

        $rows = NotaFiscal::query()
            ->with([
                'unidade:tb2_id,tb2_nome,tb2_endereco,tb2_cnpj',
                'pagamento' => function ($query) {
                    $query->select([
                        'tb4_id',
                        'valor_total',
                        'tipo_pagamento',
                        'valor_pago',
                        'troco',
                        'dois_pgto',
                        'created_at',
                    ]);
                },
                'pagamento.vendas' => function ($query) {
                    $query
                        ->with(['caixa:id,name', 'unidade:tb2_id,tb2_nome,tb2_endereco,tb2_cnpj', 'valeUser:id,name'])
                        ->orderBy('tb3_id')
                        ->select([
                            'tb3_id',
                            'tb4_id',
                            'tb1_id',
                            'id_comanda',
                            'id_user_caixa',
                            'id_user_vale',
                            'id_unidade',
                            'produto_nome',
                            'valor_unitario',
                            'quantidade',
                            'valor_total',
                            'data_hora',
                        ]);
                },
            ])
            ->when($filterUnitId, function ($query) use ($filterUnitId) {
                $query->where('tb2_id', $filterUnitId);
            }, function ($query) use ($allowedUnitIds) {
                if ($allowedUnitIds->isNotEmpty()) {
                    $query->whereIn('tb2_id', $allowedUnitIds);
                } else {
                    $query->whereRaw('1 = 0');
                }
            })
            ->when($selectedStatus !== 'all', function ($query) use ($selectedStatus) {
                $query->whereIn('tb27_status', self::FISCAL_INVOICE_STATUS_FILTERS[$selectedStatus]);
            })
            ->whereBetween('created_at', [$start, $end])
            ->orderByDesc('created_at')
            ->get([
                'tb27_id',
                'tb4_id',
                'tb2_id',
                'tb27_modelo',
                'tb27_ambiente',
                'tb27_serie',
                'tb27_numero',
                'tb27_status',
                'tb27_payload',
                'tb27_chave_acesso',
                'tb27_protocolo',
                'tb27_recibo',
                'tb27_xml_envio',
                'tb27_mensagem',
                'tb27_emitida_em',
                'tb27_ultima_tentativa_em',
                'created_at',
            ])
            ->map(function (NotaFiscal $invoice) {
                $sales = $invoice->pagamento?->vendas?->values() ?? collect();
                $firstSale = $sales->first();

                return [
                    'id' => (int) $invoice->tb27_id,
                    'payment_id' => (int) $invoice->tb4_id,
                    'unit_name' => $invoice->unidade?->tb2_nome ?? '---',
                    'status' => $invoice->tb27_status,
                    'status_label' => self::FISCAL_INVOICE_STATUS_LABELS[$invoice->tb27_status] ?? $invoice->tb27_status,
                    'modelo' => $invoice->tb27_modelo,
                    'ambiente' => $invoice->tb27_ambiente,
                    'serie' => $invoice->tb27_serie,
                    'numero' => $invoice->tb27_numero,
                    'access_key' => $invoice->tb27_chave_acesso,
                    'protocol' => $invoice->tb27_protocolo,
                    'message' => $invoice->tb27_mensagem,
                    'created_at' => $invoice->created_at?->toIso8601String(),
                    'issued_at' => $invoice->tb27_emitida_em?->toIso8601String(),
                    'last_attempt_at' => $invoice->tb27_ultima_tentativa_em?->toIso8601String(),
                    'total' => round((float) ($invoice->pagamento?->valor_total ?? 0), 2),
                    'payment_type' => $this->normalizePaymentTypeForDisplay($invoice->pagamento?->tipo_pagamento),
                    'comanda' => $this->resolveReceiptComanda($sales),
                    'cashier' => $firstSale?->caixa?->name ?? null,
                    'items_count' => (int) $sales->sum('quantidade'),
                    'items_label' => $sales
                        ->map(function (Venda $sale) {
                            return trim(sprintf('%sx %s', (int) $sale->quantidade, $sale->produto_nome));
                        })
                        ->filter()
                        ->implode(', '),
                    'fiscal_receipt' => $this->buildReportFiscalReceiptPayload($invoice),
                ];
            })
            ->values();

        return Inertia::render('Reports/FiscalInvoices', [
            'rows' => $rows,
            'startDate' => $startDate,
            'endDate' => $endDate,
            'unit' => $selectedUnit,
            'filterUnits' => $filterUnits,
            'selectedUnitId' => $filterUnitId,
            'selectedStatus' => $selectedStatus,
            'statusOptions' => [
                ['value' => 'all', 'label' => 'Todas'],
                ['value' => 'assinada', 'label' => 'Assinada'],
                ['value' => 'erro', 'label' => 'Erro'],
                ['value' => 'emitida', 'label' => 'Emitida'],
            ],
        ]);
    }

    private function buildReportFiscalReceiptPayload(NotaFiscal $invoice): ?array
    {
        $payment = $invoice->pagamento;

        if (! $payment) {
            return null;
        }

        $payload = is_array($invoice->tb27_payload) ? $invoice->tb27_payload : [];
        $sales = $payment->vendas?->values() ?? collect();
        $firstSale = $sales->first();
        $consumer = is_array($payload['consumer'] ?? null) ? $payload['consumer'] : [];
        $consumerType = trim((string) ($consumer['type'] ?? ''));
        $consumerName = trim((string) ($consumer['name'] ?? ''));
        $consumerDocument = trim((string) ($consumer['document'] ?? ''));
        $fiscalItems = collect($payload['itens'] ?? []);
        $unit = $invoice->unidade ?? $firstSale?->unidade;
        $xmlData = $this->extractReportFiscalReceiptXmlData($invoice->tb27_xml_envio);

        if ($consumerType === '') {
            $consumerType = $consumerDocument !== ''
                ? ($consumerName === '' ? 'cupom_fiscal' : 'consumidor')
                : 'balcao';
        }

        return [
            'title' => strtolower((string) $invoice->tb27_modelo) === 'nfce' ? 'DANFE NFC-e' : 'Documento fiscal',
            'subtitle' => 'Documento auxiliar da nota fiscal eletronica para impressao em 80mm',
            'payment_id' => (int) $invoice->tb4_id,
            'invoice_id' => (int) $invoice->tb27_id,
            'model_label' => strtoupper((string) $invoice->tb27_modelo) === 'NFCE' ? 'NFC-e' : strtoupper((string) $invoice->tb27_modelo),
            'environment' => $invoice->tb27_ambiente === 'producao' ? 'Producao' : 'Homologacao',
            'serie' => $invoice->tb27_serie,
            'number' => $invoice->tb27_numero,
            'status' => $invoice->tb27_status,
            'status_message' => $invoice->tb27_mensagem,
            'issued_at' => ($invoice->tb27_emitida_em ?? $firstSale?->data_hora ?? $invoice->created_at)?->toIso8601String(),
            'emitter_name' => $unit?->tb2_nome ?? 'EMITENTE NAO INFORMADO',
            'emitter_document' => $unit?->tb2_cnpj,
            'emitter_address' => $unit?->tb2_endereco,
            'consumer_type' => $consumerType,
            'consumer_name' => $consumerType === 'cupom_fiscal'
                ? 'CONSUMIDOR IDENTIFICADO POR CPF'
                : ($consumerName !== '' ? $consumerName : 'CONSUMIDOR NAO IDENTIFICADO'),
            'consumer_document' => $consumerDocument !== '' ? $consumerDocument : null,
            'consumer_address' => $this->buildReportFiscalConsumerAddress($consumerType, $consumer),
            'payment_label' => $this->resolveReportPaymentLabel($payment->tipo_pagamento),
            'total' => round((float) ($payload['valor_total_documento'] ?? $payment->valor_total), 2),
            'amount_paid' => $payment->valor_pago !== null ? round((float) $payment->valor_pago, 2) : null,
            'change' => $payment->troco !== null ? round((float) $payment->troco, 2) : null,
            'additional_payment' => $payment->dois_pgto !== null ? round((float) $payment->dois_pgto, 2) : null,
            'access_key' => $invoice->tb27_chave_acesso ?: ($xmlData['access_key'] ?? null),
            'protocol' => $invoice->tb27_protocolo,
            'receipt' => $invoice->tb27_recibo,
            'consulta_url' => $xmlData['consulta_url'] ?? null,
            'qr_code_data' => $xmlData['qr_code_data'] ?? null,
            'is_preview' => $invoice->tb27_status !== 'emitida',
            'items' => $fiscalItems->isNotEmpty()
                ? $fiscalItems
                    ->map(fn (array $item) => [
                        'id' => $item['produto_id'] ?? null,
                        'product_name' => $item['descricao'] ?? 'ITEM FISCAL',
                        'quantity' => (float) ($item['quantidade'] ?? 0),
                        'unit_price' => round((float) ($item['valor_unitario'] ?? 0), 2),
                        'subtotal' => round((float) ($item['valor_total'] ?? 0), 2),
                    ])
                    ->values()
                    ->all()
                : $sales
                    ->map(fn (Venda $sale) => [
                        'id' => $sale->tb1_id,
                        'product_name' => $sale->produto_nome,
                        'quantity' => (float) $sale->quantidade,
                        'unit_price' => round((float) $sale->valor_unitario, 2),
                        'subtotal' => round((float) $sale->valor_total, 2),
                    ])
                    ->values()
                    ->all(),
        ];
    }

    private function buildReportFiscalConsumerAddress(string $consumerType, array $consumer): ?string
    {
        if ($consumerType !== 'consumidor') {
            return null;
        }

        $lineOne = trim(implode(', ', array_filter([
            trim((string) ($consumer['street'] ?? '')),
            trim((string) ($consumer['number'] ?? '')),
            trim((string) ($consumer['complement'] ?? '')),
        ])));
        $lineTwo = trim(implode(' - ', array_filter([
            trim((string) ($consumer['neighborhood'] ?? '')),
            trim((string) ($consumer['city'] ?? '')),
            trim((string) ($consumer['state'] ?? '')),
        ])));
        $cep = trim((string) ($consumer['cep'] ?? ''));

        return trim(implode(' | ', array_filter([
            $lineOne,
            $lineTwo,
            $cep !== '' ? 'CEP ' . $cep : null,
        ]))) ?: null;
    }

    private function resolveReportPaymentLabel(?string $paymentType): string
    {
        return match ((string) $paymentType) {
            'dinheiro' => 'Dinheiro',
            'cartao_credito' => 'Cartao credito',
            'cartao_debito' => 'Cartao debito',
            'pix' => 'Pix',
            'dinheiro_cartao_credito' => 'Dinheiro + Cartao credito',
            'dinheiro_cartao_debito' => 'Dinheiro + Cartao debito',
            'dinheiro_pix' => 'Dinheiro + Pix',
            'maquina' => 'Cartao',
            'vale' => 'Vale',
            'refeicao' => 'Refeicao',
            'faturar' => 'Faturar',
            default => strtoupper(str_replace('_', ' ', trim((string) $paymentType))) ?: 'Nao informado',
        };
    }

    private function extractReportFiscalReceiptXmlData(?string $xml): array
    {
        if (! $xml || ! class_exists(\DOMDocument::class) || ! class_exists(\DOMXPath::class)) {
            return [];
        }

        $document = new \DOMDocument();

        if (! @$document->loadXML($xml)) {
            return [];
        }

        $xpath = new \DOMXPath($document);
        $xpath->registerNamespace('nfe', 'http://www.portalfiscal.inf.br/nfe');

        $accessKey = trim((string) $xpath->evaluate('string(//nfe:infNFe/@Id)'));

        return [
            'access_key' => $accessKey !== '' ? preg_replace('/^NFe/', '', $accessKey) : null,
            'qr_code_data' => $this->reportStringOrNull($xpath->evaluate('string(//nfe:infNFeSupl/nfe:qrCode)')),
            'consulta_url' => $this->reportStringOrNull($xpath->evaluate('string(//nfe:infNFeSupl/nfe:urlChave)')),
        ];
    }

    private function reportStringOrNull(mixed $value): ?string
    {
        $value = trim((string) $value);

        return $value !== '' ? $value : null;
    }

    public function descarte(Request $request): Response
    {
        $this->ensureManager($request);
        [$filterUnitId, $filterUnits, $selectedUnit] = $this->resolveReportUnit($request);
        $allowedUnitIds = $this->reportUnitIds($filterUnits);
        [$start, $end, $startDate, $endDate] = $this->resolveDateRange($request);

        $rows = ProductDiscard::query()
            ->with(['product:tb1_id,tb1_nome,tb1_vlr_venda', 'user:id,name,tb2_id', 'unit:tb2_id,tb2_nome'])
            ->whereBetween('created_at', [$start, $end])
            ->when($filterUnitId, function ($query) use ($filterUnitId) {
                $query->where(function ($subQuery) use ($filterUnitId) {
                    $subQuery->where('unit_id', $filterUnitId)
                        ->orWhere(function ($legacy) use ($filterUnitId) {
                            $legacy->whereNull('unit_id')
                                ->where(function ($legacyUnit) use ($filterUnitId) {
                                    $legacyUnit->whereHas('user', function ($userQuery) use ($filterUnitId) {
                                        $userQuery->where('tb2_id', $filterUnitId);
                                    })->orWhereHas('user.units', function ($unitQuery) use ($filterUnitId) {
                                        $unitQuery->where('tb2_unidades.tb2_id', $filterUnitId);
                                    });
                                });
                        });
                });
            }, function ($query) use ($allowedUnitIds) {
                if ($allowedUnitIds->isEmpty()) {
                    $query->whereRaw('1 = 0');

                    return;
                }

                $query->where(function ($subQuery) use ($allowedUnitIds) {
                    $subQuery->whereIn('unit_id', $allowedUnitIds)
                        ->orWhere(function ($legacy) use ($allowedUnitIds) {
                            $legacy->whereNull('unit_id')
                                ->where(function ($legacyUnit) use ($allowedUnitIds) {
                                    $legacyUnit->whereHas('user', function ($userQuery) use ($allowedUnitIds) {
                                        $userQuery->whereIn('tb2_id', $allowedUnitIds);
                                    })->orWhereHas('user.units', function ($unitQuery) use ($allowedUnitIds) {
                                        $unitQuery->whereIn('tb2_unidades.tb2_id', $allowedUnitIds);
                                    });
                                });
                        });
                });
            })
            ->orderByDesc('created_at')
            ->get([
                'id',
                'product_id',
                'user_id',
                'unit_id',
                'quantity',
                'unit_price',
                'created_at',
            ])
            ->map(function (ProductDiscard $discard) {
                $unitPrice = $discard->unit_price !== null
                    ? (float) $discard->unit_price
                    : (float) ($discard->product?->tb1_vlr_venda ?? 0);
                $quantity = (float) $discard->quantity;
                $actingUser = request()->user();

                return [
                    'id' => $discard->id,
                    'product' => $discard->product?->tb1_nome ?? '---',
                    'quantity' => round($quantity, 3),
                    'unit_price' => round($unitPrice, 2),
                    'total' => round($unitPrice * $quantity, 2),
                    'user_name' => $discard->user?->name ?? '---',
                    'created_at' => $discard->created_at?->toIso8601String(),
                    'unit_name' => $discard->unit?->tb2_nome ?? '---',
                    'can_delete' => $actingUser instanceof User
                        ? ManagementScope::canManageDiscard($actingUser, $discard)
                        : false,
                ];
            })
            ->values();

        return Inertia::render('Reports/Discards', [
            'rows' => $rows,
            'startDate' => $startDate,
            'endDate' => $endDate,
            'unit' => $selectedUnit,
            'filterUnits' => $filterUnits,
            'selectedUnitId' => $filterUnitId,
        ]);
    }

    public function descarteConsolidado(Request $request): Response
    {
        $this->ensureManager($request);
        $availableUnits = $this->availableUnits($request->user());
        $fallbackUnitId = $this->resolveUnitId($request);
        $selectedUnitId = $fallbackUnitId > 0 ? $fallbackUnitId : null;

        if ($selectedUnitId && ! $availableUnits->contains(fn ($unit) => $unit['id'] === $selectedUnitId)) {
            $selectedUnitId = null;
        }

        $requestedUnitId = $request->query('unit_id');
        if ($requestedUnitId !== null && $requestedUnitId !== '' && $requestedUnitId !== 'all') {
            $candidateUnitId = (int) $requestedUnitId;

            if ($candidateUnitId > 0 && $availableUnits->contains(fn ($unit) => $unit['id'] === $candidateUnitId)) {
                $selectedUnitId = $candidateUnitId;
            }
        }

        if (! $selectedUnitId) {
            $selectedUnitId = $availableUnits->first()['id'] ?? null;
        }

        $filterUnitId = $selectedUnitId;
        $filterUnits = $availableUnits->values();
        $selectedUnit = $filterUnitId
            ? $availableUnits->firstWhere('id', $filterUnitId)
            : ['id' => null, 'name' => '---'];
        [$start, $end, $monthValue, $monthLabel] = $this->resolveMonthRange($request->query('month'));

        $entries = ProductDiscard::query()
            ->with(['product:tb1_id,tb1_nome,tb1_vlr_venda', 'user:id,name,tb2_id', 'unit:tb2_id,tb2_nome'])
            ->whereBetween('created_at', [$start, $end])
            ->when($filterUnitId, function ($query) use ($filterUnitId) {
                $query->where(function ($subQuery) use ($filterUnitId) {
                    $subQuery->where('unit_id', $filterUnitId)
                        ->orWhere(function ($legacy) use ($filterUnitId) {
                            $legacy->whereNull('unit_id')
                                ->where(function ($legacyUnit) use ($filterUnitId) {
                                    $legacyUnit->whereHas('user', function ($userQuery) use ($filterUnitId) {
                                        $userQuery->where('tb2_id', $filterUnitId);
                                    })->orWhereHas('user.units', function ($unitQuery) use ($filterUnitId) {
                                        $unitQuery->where('tb2_unidades.tb2_id', $filterUnitId);
                                    });
                                });
                        });
                });
            })
            ->orderByDesc('created_at')
            ->get([
                'id',
                'product_id',
                'user_id',
                'unit_id',
                'quantity',
                'unit_price',
                'created_at',
            ]);

        $rows = $entries
            ->groupBy(function (ProductDiscard $discard) {
                if ($discard->product_id) {
                    return 'product-' . $discard->product_id;
                }

                return 'product-name-' . strtolower(trim((string) ($discard->product?->tb1_nome ?? 'produto-removido')));
            })
            ->map(function (Collection $group) {
                $first = $group->first();
                $productName = trim((string) ($first?->product?->tb1_nome ?? 'Produto removido'));
                $totalQuantity = (float) $group->sum(fn (ProductDiscard $discard) => (float) $discard->quantity);
                $totalValue = (float) $group->sum(function (ProductDiscard $discard) {
                    $unitPrice = $discard->unit_price !== null
                        ? (float) $discard->unit_price
                        : (float) ($discard->product?->tb1_vlr_venda ?? 0);

                    return $unitPrice * (float) $discard->quantity;
                });
                $lastEntry = $group->sortByDesc('created_at')->first();
                $averageUnitPrice = $totalQuantity > 0 ? $totalValue / $totalQuantity : 0.0;

                return [
                    'product_id' => $first?->product_id ? (int) $first->product_id : null,
                    'product' => $productName !== '' ? $productName : 'Produto removido',
                    'occurrences' => $group->count(),
                    'total_quantity' => round($totalQuantity, 3),
                    'total_value' => round($totalValue, 2),
                    'average_unit_price' => round($averageUnitPrice, 2),
                    'last_discard_at' => $lastEntry?->created_at?->toIso8601String(),
                ];
            })
            ->sort(function (array $left, array $right) {
                if ($left['total_quantity'] !== $right['total_quantity']) {
                    return $right['total_quantity'] <=> $left['total_quantity'];
                }

                if ($left['occurrences'] !== $right['occurrences']) {
                    return $right['occurrences'] <=> $left['occurrences'];
                }

                if ($left['total_value'] !== $right['total_value']) {
                    return $right['total_value'] <=> $left['total_value'];
                }

                return strcmp($left['product'], $right['product']);
            })
            ->values()
            ->map(function (array $row, int $index) {
                $row['rank'] = $index + 1;

                return $row;
            });

        $topQuantityProduct = $rows->first();
        $topValueProduct = $rows
            ->sort(function (array $left, array $right) {
                if ($left['total_value'] !== $right['total_value']) {
                    return $right['total_value'] <=> $left['total_value'];
                }

                if ($left['total_quantity'] !== $right['total_quantity']) {
                    return $right['total_quantity'] <=> $left['total_quantity'];
                }

                return strcmp($left['product'], $right['product']);
            })
            ->first();

        $summary = [
            'products_count' => $rows->count(),
            'total_quantity' => round((float) $rows->sum('total_quantity'), 3),
            'total_value' => round((float) $rows->sum('total_value'), 2),
            'total_occurrences' => (int) $rows->sum('occurrences'),
            'top_quantity_product' => $topQuantityProduct,
            'top_value_product' => $topValueProduct,
        ];

        return Inertia::render('Reports/DiscardConsolidated', [
            'rows' => $rows,
            'summary' => $summary,
            'monthValue' => $monthValue,
            'monthLabel' => $monthLabel,
            'unit' => $selectedUnit,
            'filterUnits' => $filterUnits,
            'selectedUnitId' => $filterUnitId,
        ]);
    }

    public function hoje(Request $request): Response
    {
        $this->ensureHojeAccess($request);

        $unitId = $this->resolveUnitId($request);
        $unit = Unidade::find($unitId, ['tb2_id', 'tb2_nome', 'tb2_endereco', 'tb2_cnpj']);
        $start = Carbon::today()->startOfDay();
        $end = Carbon::today()->endOfDay();
        $receiptId = $this->parseReceiptIdFilter($request->query('cupom'));
        $comandaId = $this->parseReceiptIdFilter($request->query('comanda'));
        $valueFilter = $this->parseCurrencyFilter($request->query('valor'));
        $timeWindow = $this->resolveHojeTimeWindow($request->query('hora'), $start, $end);
        $showFiscalGenerate = $request->query('fiscal') === 'gerar';

        $records = VendaPagamento::query()
            ->with([
                'vendas' => function ($query) use ($unitId, $start, $end) {
                    $query
                        ->with(['caixa:id,name', 'valeUser:id,name'])
                        ->whereBetween('data_hora', [$start, $end])
                        ->when($unitId > 0, function ($salesQuery) use ($unitId) {
                            $salesQuery->where('id_unidade', $unitId);
                        }, function ($salesQuery) {
                            $salesQuery->whereRaw('1 = 0');
                        })
                        ->orderBy('tb3_id')
                        ->select([
                            'tb3_id',
                            'tb4_id',
                            'tb1_id',
                            'produto_nome',
                            'valor_unitario',
                            'quantidade',
                            'valor_total',
                            'data_hora',
                            'id_comanda',
                            'id_user_caixa',
                            'id_user_vale',
                            'tipo_pago',
                            'id_unidade',
                        ]);
                },
                'notaFiscal.unidade:tb2_id,tb2_nome,tb2_endereco,tb2_cnpj',
            ])
            ->whereHas('vendas', function ($query) use ($unitId, $start, $end, $timeWindow, $comandaId) {
                $query
                    ->whereBetween('data_hora', [$start, $end])
                    ->when($unitId > 0, function ($salesQuery) use ($unitId) {
                        $salesQuery->where('id_unidade', $unitId);
                    }, function ($salesQuery) {
                        $salesQuery->whereRaw('1 = 0');
                    })
                    ->when($comandaId !== null, function ($salesQuery) use ($comandaId) {
                        $salesQuery->where('id_comanda', $comandaId);
                    })
                    ->when($timeWindow !== null, function ($salesQuery) use ($timeWindow) {
                        $salesQuery->whereBetween('data_hora', [$timeWindow['start'], $timeWindow['end']]);
                    });
            })
            ->when($receiptId !== null, function ($query) use ($receiptId) {
                $query->where('tb4_id', $receiptId);
            })
            ->when($valueFilter !== null, function ($query) use ($valueFilter) {
                $query->whereBetween('valor_total', [$valueFilter - 0.005, $valueFilter + 0.005]);
            })
            ->when($showFiscalGenerate, function ($query) {
                $query->whereDoesntHave('notaFiscal');
            })
            ->orderByDesc('created_at')
            ->orderByDesc('tb4_id')
            ->when(! $showFiscalGenerate, function ($query) {
                $query->limit(10);
            })
            ->get([
                'tb4_id',
                'valor_total',
                'tipo_pagamento',
                'valor_pago',
                'troco',
                'dois_pgto',
                'created_at',
            ])
            ->map(function (VendaPagamento $payment) use ($unit) {
                $sales = $payment->vendas->values();
                $firstSale = $sales->first();
                $saleDateTime = $firstSale?->data_hora ?? $payment->created_at;
                $receiptComanda = $this->resolveReceiptComanda($sales);
                $displayPaymentType = $this->normalizePaymentTypeForDisplay($payment->tipo_pagamento);
                $fiscalReceipt = $payment->notaFiscal
                    ? $this->buildReportFiscalReceiptPayload($payment->notaFiscal)
                    : null;

                return [
                    'id' => $payment->tb4_id,
                    'date' => $saleDateTime?->format('d/m/Y'),
                    'time' => $saleDateTime?->format('H:i'),
                    'comanda' => $receiptComanda,
                    'total' => round((float) $payment->valor_total, 2),
                    'fiscal_receipt' => $fiscalReceipt,
                    'fiscal_status' => $payment->notaFiscal?->tb27_status,
                    'can_generate_fiscal' => $payment->notaFiscal === null,
                    'can_regenerate_fiscal' => in_array((string) $payment->notaFiscal?->tb27_status, ['erro_validacao', 'erro_transmissao'], true),
                    'receipt' => [
                        'id' => $payment->tb4_id,
                        'comanda' => $receiptComanda,
                        'total' => round((float) $payment->valor_total, 2),
                        'date_time' => $saleDateTime?->toIso8601String(),
                        'tipo_pago' => $displayPaymentType,
                        'cashier_name' => $firstSale?->caixa?->name ?? '---',
                        'unit_name' => $unit?->tb2_nome ?? ('Unidade #' . $firstSale?->id_unidade),
                        'unit_address' => $unit?->tb2_endereco,
                        'unit_cnpj' => $unit?->tb2_cnpj,
                        'vale_user_name' => $firstSale?->valeUser?->name,
                        'vale_type' => in_array($payment->tipo_pagamento, ['vale', 'refeicao'], true)
                            ? $payment->tipo_pagamento
                            : null,
                        'payment' => [
                            'id' => $payment->tb4_id,
                            'valor_total' => round((float) $payment->valor_total, 2),
                            'valor_pago' => $payment->valor_pago !== null ? round((float) $payment->valor_pago, 2) : null,
                            'troco' => $payment->troco !== null ? round((float) $payment->troco, 2) : null,
                            'dois_pgto' => $payment->dois_pgto !== null ? round((float) $payment->dois_pgto, 2) : null,
                            'tipo_pagamento' => $displayPaymentType,
                        ],
                        'items' => $sales
                            ->map(function (Venda $sale) {
                                return [
                                    'id' => $sale->tb3_id,
                                    'product_id' => $sale->tb1_id,
                                    'product_name' => $sale->produto_nome,
                                    'quantity' => (int) $sale->quantidade,
                                    'unit_price' => round((float) $sale->valor_unitario, 2),
                                    'subtotal' => round((float) $sale->valor_total, 2),
                                    'comanda' => $sale->id_comanda,
                                ];
                            })
                            ->values(),
                        'fiscal_receipt' => $fiscalReceipt,
                    ],
                ];
            })
            ->values();

        return Inertia::render('Reports/Hoje', [
            'records' => $records,
            'reportDate' => $start->format('d/m/Y'),
            'unit' => [
                'id' => $unit?->tb2_id ?? $unitId,
                'name' => $unit?->tb2_nome ?? '---',
            ],
            'filters' => [
                'cupom' => $receiptId !== null ? (string) $receiptId : trim((string) $request->query('cupom', '')),
                'comanda' => $comandaId !== null ? (string) $comandaId : trim((string) $request->query('comanda', '')),
                'valor' => trim((string) $request->query('valor', '')),
                'hora' => $timeWindow['value'] ?? trim((string) $request->query('hora', '')),
                'fiscal' => $showFiscalGenerate ? 'gerar' : '',
            ],
            'canManageFiscal' => ManagementScope::canAccessFiscalUnit($request->user(), $unitId),
            'canDeleteReceipts' => ManagementScope::isMaster($request->user()),
        ]);
    }

    public function generateAndSignTodayMissingFiscalInvoice(
        Request $request,
        VendaPagamento $payment,
        FiscalInvoicePreparationService $fiscalInvoicePreparationService,
    ): RedirectResponse|JsonResponse {
        $this->ensureTodayPaymentFiscalAccess($request, $payment);

        $payment->loadMissing(['notaFiscal', 'vendas.produto', 'vendas.unidade']);

        if ($payment->notaFiscal) {
            return $this->fiscalActionResponse(
                $request,
                'error',
                sprintf('A venda %d ja possui nota fiscal gerada.', (int) $payment->tb4_id),
                422,
            );
        }

        return $this->prepareSingleFiscalPayment(
            $request,
            $payment,
            $fiscalInvoicePreparationService,
            'Nota fiscal da venda %d gerada com status %s.',
        );
    }

    public function regenerateTodayErrorFiscalInvoice(
        Request $request,
        VendaPagamento $payment,
        FiscalInvoicePreparationService $fiscalInvoicePreparationService,
    ): RedirectResponse|JsonResponse {
        $this->ensureTodayPaymentFiscalAccess($request, $payment);

        $payment->loadMissing(['notaFiscal', 'vendas.produto', 'vendas.unidade']);

        if (! $payment->notaFiscal) {
            return $this->fiscalActionResponse(
                $request,
                'error',
                sprintf('A venda %d ainda nao possui nota fiscal para regenerar.', (int) $payment->tb4_id),
                422,
            );
        }

        if (! in_array((string) $payment->notaFiscal->tb27_status, ['erro_validacao', 'erro_transmissao'], true)) {
            return $this->fiscalActionResponse(
                $request,
                'error',
                sprintf('A nota fiscal da venda %d nao esta com erro.', (int) $payment->tb4_id),
                422,
            );
        }

        return $this->prepareSingleFiscalPayment(
            $request,
            $payment,
            $fiscalInvoicePreparationService,
            'Nota fiscal da venda %d regenerada com status %s.',
        );
    }

    public function today(Request $request): Response
    {
        $this->ensureManager($request);
        $user = $request->user();
        $availableUnits = $this->availableUnits($user);
        $allowedUnitIds = $this->reportUnitIds($availableUnits);
        $requestedUnitId = $request->query('unit_id');
        $filterUnitId = $requestedUnitId !== null && $requestedUnitId !== '' && $requestedUnitId !== 'all'
            ? (int) $requestedUnitId
            : null;

        if ($filterUnitId && !$availableUnits->contains(fn ($unit) => $unit['id'] === $filterUnitId)) {
            $filterUnitId = null;
        }

        $dayFilter = $request->query('day') === 'previous' ? 'previous' : 'current';
        $baseDate = Carbon::today();

        if ($dayFilter === 'previous') {
            $baseDate = $baseDate->subDay();
        }

        $start = $baseDate->copy()->startOfDay();
        $end = $baseDate->copy()->endOfDay();

        $payments = $this->fetchPayments($start, $end, $filterUnitId, $allowedUnitIds);
        [$totals, $details, $chartData] = $this->summarizePayments($payments);
        [$totals, $details] = $this->applyGlobalValeTotals($start, $end, $totals, $details, $filterUnitId, $allowedUnitIds);
        $chartData = $this->buildChartData($totals);
        $expenseTotal = $this->sumExpenses($start, $end, $filterUnitId, $allowedUnitIds);

        $selectedUnit = $filterUnitId
            ? $availableUnits->firstWhere('id', $filterUnitId)
            : ['id' => null, 'name' => 'Todas as unidades'];

        return Inertia::render($request->routeIs('mobile.*') ? 'Mobile/Reports/SalesToday' : 'Reports/SalesToday', [
            'meta' => self::TYPE_META,
            'chartData' => $chartData,
            'details' => $details,
            'totals' => $totals,
            'expenseTotal' => $expenseTotal,
            'dateLabel' => $start->translatedFormat('d/m/Y'),
            'filterUnits' => $availableUnits->values(),
            'selectedUnitId' => $filterUnitId,
            'selectedUnit' => $selectedUnit,
            'selectedDay' => $dayFilter,
        ]);
    }

    public function destroyTodayReceipt(Request $request, VendaPagamento $payment): JsonResponse
    {
        $this->ensureMaster($request);

        DB::transaction(function () use ($payment) {
            Venda::query()->where('tb4_id', $payment->tb4_id)->delete();
            $payment->delete();
        });

        return response()->json([
            'ok' => true,
            'message' => 'Cupom excluido com sucesso.',
        ]);
    }

    public function cashClosure(Request $request, DiscardAlertService $discardAlertService): Response
    {
        $this->ensureManager($request);
        $user = $request->user();
        $availableUnits = $this->availableUnits($user);
        $allowedUnitIds = $this->reportUnitIds($availableUnits);
        $discardThreshold = $discardAlertService->thresholdPercentage();

        $requestedUnitId = $request->query('unit_id');
        $filterUnitId = $requestedUnitId !== null && $requestedUnitId !== '' ? (int) $requestedUnitId : null;
        if ($filterUnitId && !$availableUnits->contains(fn ($unit) => $unit['id'] === $filterUnitId)) {
            $filterUnitId = null;
        }

        $dateInput = $request->query('date');
        $date = $this->parseDate($dateInput, 'Y-m-d', Carbon::today());
        $start = $date->copy()->startOfDay();
        $end = $date->copy()->endOfDay();
        $dateDisplay = $date->translatedFormat('d/m/Y');
        $dateValue = $date->format('Y-m-d');

        $paymentsQuery = VendaPagamento::query()
            ->whereBetween('created_at', [$start, $end])
            ->with(['vendas' => function ($query) use ($filterUnitId, $allowedUnitIds) {
                $query->select(
                    'tb3_id',
                    'tb4_id',
                    'tb1_id',
                    'produto_nome',
                    'quantidade',
                    'valor_unitario',
                    'valor_total',
                    'data_hora',
                    'id_user_caixa',
                    'id_unidade',
                    'id_comanda',
                )
                    ->orderBy('tb3_id');

                if ($filterUnitId) {
                    $query->where('id_unidade', $filterUnitId);
                } elseif ($allowedUnitIds->isNotEmpty()) {
                    $query->whereIn('id_unidade', $allowedUnitIds);
                } else {
                    $query->whereRaw('1 = 0');
                }
            }]);

        if ($filterUnitId) {
            $paymentsQuery->whereHas('vendas', function ($query) use ($filterUnitId) {
                $query->where('id_unidade', $filterUnitId);
            });
        } elseif ($allowedUnitIds->isNotEmpty()) {
            $paymentsQuery->whereHas('vendas', function ($query) use ($allowedUnitIds) {
                $query->whereIn('id_unidade', $allowedUnitIds);
            });
        } else {
            $paymentsQuery->whereRaw('1 = 0');
        }

        $payments = $paymentsQuery->get([
            'tb4_id',
            'valor_total',
            'tipo_pagamento',
            'valor_pago',
            'troco',
            'dois_pgto',
            'created_at',
        ]);

        $cashierIds = $payments
            ->map(fn (VendaPagamento $payment) => optional($payment->vendas->first())->id_user_caixa)
            ->filter()
            ->unique();

        $unitIds = $payments
            ->map(fn (VendaPagamento $payment) => optional($payment->vendas->first())->id_unidade)
            ->filter()
            ->unique();

        $cashiers = User::whereIn('id', $cashierIds)->get(['id', 'name'])->keyBy('id');
        $units = Unidade::whereIn('tb2_id', $unitIds)->get(['tb2_id', 'tb2_nome'])->keyBy('tb2_id');
        $closureDate = $date->toDateString();
        $closureQuery = CashierClosure::whereIn('user_id', $cashierIds)
            ->whereDate('closed_date', $closureDate);

        if ($unitIds->isNotEmpty()) {
            $closureQuery->where(function ($query) use ($unitIds) {
                $query->whereIn('unit_id', $unitIds)
                    ->orWhereNull('unit_id');
            });
        }

        if ($filterUnitId) {
            $closureQuery->where(function ($query) use ($filterUnitId) {
                $query->whereNull('unit_id')
                    ->orWhere('unit_id', $filterUnitId);
            });
        }

        $closuresCollection = $closureQuery->get();
        $reviewerIds = $closuresCollection
            ->pluck('master_checked_by')
            ->filter()
            ->unique()
            ->values();
        $reviewers = $reviewerIds->isNotEmpty()
            ? User::whereIn('id', $reviewerIds)->get(['id', 'name'])->keyBy('id')
            : collect();

        $closures = $closuresCollection
            ->mapWithKeys(function ($closure) {
                $unitKey = $closure->unit_id ?? 'none';
                return [$closure->user_id . '-' . $unitKey => $closure];
            });

        $grouped = [];

        foreach ($payments as $payment) {
            $firstSale = optional($payment->vendas->first());
            $cashierId = $firstSale?->id_user_caixa;
            $unitId = $firstSale?->id_unidade;

            if (!$cashierId) {
                continue;
            }

            $groupKey = $cashierId . '-' . ($unitId ?? 'none');

            if (!isset($grouped[$groupKey])) {
                $grouped[$groupKey] = [
                    'row_key' => $groupKey,
                    'cashier_id' => $cashierId,
                    'cashier_name' => $cashiers[$cashierId]->name ?? 'Caixa #' . $cashierId,
                    'unit_id' => $unitId,
                    'unit_name' => $unitId ? ($units[$unitId]->tb2_nome ?? ('Unidade #' . $unitId)) : '---',
                    'totals' => [
                        'dinheiro' => 0.0,
                        'maquina' => 0.0,
                        'vale' => 0.0,
                        'refeicao' => 0.0,
                        'faturar' => 0.0,
                    ],
                    'grand_total' => 0.0,
                    'small_card_complements' => [
                        'total' => 0.0,
                        'items' => [],
                    ],
                ];
            }

            foreach ($this->breakdownPayment($payment) as $type => $amount) {
                $grouped[$groupKey]['totals'][$type] += $amount;
                $grouped[$groupKey]['grand_total'] += $amount;
            }

            $cardComplement = max((float) $payment->dois_pgto, 0);
            if (in_array($payment->tipo_pagamento, ['dinheiro', 'dinheiro_cartao_credito', 'dinheiro_cartao_debito', 'dinheiro_pix'], true) && $cardComplement >= 0.01 && $cardComplement < 1) {
                $grouped[$groupKey]['small_card_complements']['total'] += $cardComplement;
                $grouped[$groupKey]['small_card_complements']['items'][] = [
                    'payment_id' => $payment->tb4_id,
                    'comanda' => $this->resolveReceiptComanda($payment->vendas->values()),
                    'sale_total' => round((float) $payment->valor_total, 2),
                    'cash_paid' => $payment->valor_pago !== null ? round((float) $payment->valor_pago, 2) : null,
                    'cash_amount' => round(max((float) $payment->valor_total - $cardComplement, 0), 2),
                    'card_amount' => round($cardComplement, 2),
                    'created_at' => optional($payment->created_at)->toIso8601String(),
                    'receipt' => $this->buildReceiptPayload($payment),
                ];
            }
        }

        $dateKey = $date->toDateString();
        $expenseData = $this->groupExpenseDataByCashierUnit($dateKey, $filterUnitId, $allowedUnitIds);
        $openComandasTotalsByUnit = Venda::query()
            ->selectRaw('id_unidade, COALESCE(SUM(valor_total), 0) as total_open_comandas, COUNT(DISTINCT id_comanda) as open_comandas_count')
            ->whereNotNull('id_comanda')
            ->whereBetween('id_comanda', [3000, 3100])
            ->where('status', 0)
            ->when($filterUnitId, function ($query) use ($filterUnitId) {
                $query->where('id_unidade', $filterUnitId);
            }, function ($query) use ($allowedUnitIds) {
                if ($allowedUnitIds->isEmpty()) {
                    $query->whereRaw('1 = 0');

                    return;
                }

                $query->whereIn('id_unidade', $allowedUnitIds);
            })
            ->groupBy('id_unidade')
            ->get()
            ->mapWithKeys(function ($row) {
                $key = (int) $row->id_unidade;

                return [
                    $key => [
                        'total' => round((float) ($row->total_open_comandas ?? 0), 2),
                        'count' => (int) ($row->open_comandas_count ?? 0),
                    ],
                ];
            });
        $discardEntries = ProductDiscard::query()
            ->with(['product:tb1_id,tb1_nome,tb1_vlr_venda', 'user:id,tb2_id'])
            ->whereDate('created_at', $dateKey)
            ->when($filterUnitId, function ($query) use ($filterUnitId) {
                $query->where(function ($subQuery) use ($filterUnitId) {
                    $subQuery->where('unit_id', $filterUnitId)
                        ->orWhereHas('user', function ($userQuery) use ($filterUnitId) {
                            $userQuery->where('tb2_id', $filterUnitId);
                        })
                        ->orWhereHas('user.units', function ($unitQuery) use ($filterUnitId) {
                            $unitQuery->where('tb2_unidades.tb2_id', $filterUnitId);
                        });
                });
            }, function ($query) use ($allowedUnitIds) {
                if ($allowedUnitIds->isEmpty()) {
                    $query->whereRaw('1 = 0');

                    return;
                }

                $query->where(function ($subQuery) use ($allowedUnitIds) {
                    $subQuery->whereIn('unit_id', $allowedUnitIds)
                        ->orWhereHas('user', function ($userQuery) use ($allowedUnitIds) {
                            $userQuery->whereIn('tb2_id', $allowedUnitIds);
                        })
                        ->orWhereHas('user.units', function ($unitQuery) use ($allowedUnitIds) {
                            $unitQuery->whereIn('tb2_unidades.tb2_id', $allowedUnitIds);
                        });
                });
            })
            ->orderByDesc('created_at')
            ->get();

        $discardTotals = $discardEntries
            ->groupBy(function (ProductDiscard $discard) {
                $discardUnitId = $discard->unit_id ?? $discard->user?->tb2_id ?? null;

                return $discard->user_id . '-' . ($discardUnitId ?? 'none');
            })
            ->map(function ($group) {
                $quantity = $group->sum('quantity');
                $value = $group->sum(function (ProductDiscard $discard) {
                    $price = $discard->unit_price !== null
                        ? (float) $discard->unit_price
                        : (float) ($discard->product->tb1_vlr_venda ?? 0);

                    return (float) $discard->quantity * $price;
                });

                return [
                    'quantity' => (float) $quantity,
                    'value' => round((float) $value, 2),
                ];
            });

        $discardDetails = $discardEntries
            ->take(100)
            ->map(function (ProductDiscard $discard) {
                $price = $discard->unit_price !== null
                    ? (float) $discard->unit_price
                    : (float) ($discard->product->tb1_vlr_venda ?? 0);
                $value = (float) $discard->quantity * $price;

                return [
                    'id' => $discard->id,
                    'user_id' => $discard->user_id,
                    'unit_id' => $discard->unit_id ?? $discard->user?->tb2_id ?? null,
                    'quantity' => round((float) $discard->quantity, 3),
                    'unit_price' => round($price, 2),
                    'value' => round($value, 2),
                    'product' => $discard->product
                        ? [
                            'id' => $discard->product->tb1_id,
                            'name' => $discard->product->tb1_nome,
                        ]
                        : null,
                    'created_at' => optional($discard->created_at)->toIso8601String(),
                ];
            });

        $records = collect($grouped)
            ->map(function (array $record) use ($closures, $discardTotals, $discardAlertService, $discardThreshold, $reviewers, $expenseData, $openComandasTotalsByUnit) {
                $record['totals'] = array_map(fn ($value) => round($value, 2), $record['totals']);
                $record['grand_total'] = round($record['grand_total'], 2);
                $record['row_key'] = $record['row_key'] ?? ($record['cashier_id'] . '-' . ($record['unit_id'] ?? 'none'));
                $record['small_card_complements'] = [
                    'total' => round((float) ($record['small_card_complements']['total'] ?? 0), 2),
                    'items' => collect($record['small_card_complements']['items'] ?? [])
                        ->sortByDesc('created_at')
                        ->values()
                        ->all(),
                ];

                $expenseMeta = $expenseData[$record['row_key']] ?? ['total' => 0.0, 'items' => []];
                $cashSystem = $record['totals']['dinheiro'] ?? 0.0;
                $cardSystem = $record['totals']['maquina'] ?? 0.0;
                $expenseTotal = (float) ($expenseMeta['total'] ?? 0.0);
                $conferenceCashBase = max($cashSystem - $expenseTotal, 0.0);
                $systemTotal = $conferenceCashBase + $cardSystem;

                $closureKey = $record['cashier_id'] . '-' . ($record['unit_id'] ?? 'none');
                $closure = $closures->get($closureKey);

                if ($closure) {
                    $cashClosure = (float) $closure->cash_amount;
                    $cardClosure = (float) $closure->card_amount;
                    $hasMasterReview = $closure->master_checked_at !== null
                        && $closure->master_cash_amount !== null
                        && $closure->master_card_amount !== null;
                    $effectiveCashClosure = $hasMasterReview
                        ? (float) $closure->master_cash_amount
                        : $cashClosure;
                    $effectiveCardClosure = $hasMasterReview
                        ? (float) $closure->master_card_amount
                        : $cardClosure;
                    $closureTotal = $effectiveCashClosure + $effectiveCardClosure;
                    $closureTotalWithExpenses = $closureTotal + $expenseTotal;

                    $record['closure'] = [
                        'id' => $closure->id,
                        'closed' => true,
                        'cash_amount' => round($effectiveCashClosure, 2),
                        'card_amount' => round($effectiveCardClosure, 2),
                        'total_amount' => round($closureTotal, 2),
                        'unit_id' => $closure->unit_id,
                        'unit_name' => $closure->unit_name,
                        'closed_at' => optional($closure->closed_at)->toIso8601String(),
                        'original_cash_amount' => round($cashClosure, 2),
                        'original_card_amount' => round($cardClosure, 2),
                        'master_review' => [
                            'reviewed' => $hasMasterReview,
                            'cash_amount' => $hasMasterReview ? round((float) $closure->master_cash_amount, 2) : null,
                            'card_amount' => $hasMasterReview ? round((float) $closure->master_card_amount, 2) : null,
                            'checked_at' => optional($closure->master_checked_at)->toIso8601String(),
                            'checked_by' => $closure->master_checked_by,
                            'checked_by_name' => $closure->master_checked_by
                                ? ($reviewers[$closure->master_checked_by]->name ?? null)
                                : null,
                        ],
                        'differences' => [
                            'cash' => round($conferenceCashBase - $effectiveCashClosure, 2),
                            'card' => round($cardSystem - $effectiveCardClosure, 2),
                            'total' => round($systemTotal - $closureTotalWithExpenses, 2),
                        ],
                    ];
                } else {
                    $record['closure'] = [
                        'id' => null,
                        'closed' => false,
                        'cash_amount' => 0.0,
                        'card_amount' => 0.0,
                        'total_amount' => 0.0,
                        'unit_id' => null,
                        'unit_name' => null,
                        'closed_at' => null,
                        'original_cash_amount' => 0.0,
                        'original_card_amount' => 0.0,
                        'master_review' => [
                            'reviewed' => false,
                            'cash_amount' => null,
                            'card_amount' => null,
                            'checked_at' => null,
                            'checked_by' => null,
                            'checked_by_name' => null,
                        ],
                        'differences' => [
                            'cash' => round($conferenceCashBase, 2),
                            'card' => round($cardSystem, 2),
                            'total' => round($systemTotal, 2),
                        ],
                    ];
                }

                $record['expense_total'] = round($expenseTotal, 2);
                $record['expense_details'] = collect($expenseMeta['items'] ?? [])
                    ->sortByDesc('expense_date')
                    ->values()
                    ->all();
                $record['conference_base_cash'] = round($conferenceCashBase, 2);
                $record['conference_base_total'] = round($systemTotal, 2);
                $openComandasMeta = $openComandasTotalsByUnit[(int) ($record['unit_id'] ?? 0)] ?? [
                    'total' => 0.0,
                    'count' => 0,
                ];
                $record['open_comandas_total'] = round((float) ($openComandasMeta['total'] ?? 0), 2);
                $record['open_comandas_count'] = (int) ($openComandasMeta['count'] ?? 0);

                $discardMeta = $discardTotals[$record['row_key']] ?? ['value' => 0.0, 'quantity' => 0.0];
                $record['discard_total'] = round((float) ($discardMeta['value'] ?? 0), 2);
                $record['discard_quantity'] = round((float) ($discardMeta['quantity'] ?? 0), 3);
                $record['discard_alert'] = $discardAlertService->evaluateAmounts(
                    (float) $record['discard_total'],
                    (float) $record['grand_total'],
                    $discardThreshold,
                );

                return $record;
            })
            ->sortByDesc('grand_total')
            ->values();

        $selectedUnit = $filterUnitId
            ? $availableUnits->firstWhere('id', $filterUnitId)
            : ['id' => null, 'name' => 'Todas as unidades'];

        return Inertia::render($request->routeIs('mobile.*') ? 'Mobile/Reports/CashClosure' : 'Reports/CashClosure', [
            'records' => $records,
            'dateValue' => $dateDisplay,
            'dateInputValue' => $dateValue,
            'filterUnits' => $availableUnits->values(),
            'selectedUnitId' => $filterUnitId,
            'selectedUnit' => $selectedUnit,
            'discardDetails' => $discardDetails,
            'meta' => self::TYPE_META,
        ]);
    }

    public function updateCashClosureMasterReview(Request $request, CashierClosure $closure): JsonResponse
    {
        $this->ensureMaster($request);

        $validated = $request->validate([
            'cash_amount' => ['required', 'numeric', 'min:0'],
            'card_amount' => ['required', 'numeric', 'min:0'],
        ]);

        $closure->forceFill([
            'master_cash_amount' => round((float) $validated['cash_amount'], 2),
            'master_card_amount' => round((float) $validated['card_amount'], 2),
            'master_checked_by' => $request->user()->id,
            'master_checked_at' => now(),
        ])->save();

        return response()->json([
            'message' => 'Conferencia do Master atualizada com sucesso.',
        ]);
    }

    public function destroyCashClosure(Request $request, CashierClosure $closure): JsonResponse
    {
        $this->ensureMaster($request);

        $availableUnits = $this->availableUnits($request->user());
        $closureUnitId = $closure->unit_id !== null ? (int) $closure->unit_id : null;

        if ($closureUnitId !== null && ! $availableUnits->contains(fn (array $unit) => (int) ($unit['id'] ?? 0) === $closureUnitId)) {
            abort(403);
        }

        $closure->loadMissing('user:id,name');
        $cashierName = $closure->user?->name ?? ('Caixa #' . $closure->user_id);
        $closureDate = optional($closure->closed_date)->format('d/m/y') ?? '--';

        $closure->delete();

        return response()->json([
            'message' => sprintf(
                'Fechamento de %s em %s reaberto com sucesso.',
                $cashierName,
                $closureDate
            ),
        ]);
    }

    public function storeZeroCashClosure(Request $request): JsonResponse
    {
        $this->ensureMaster($request);

        $validated = $request->validate([
            'cashier_id' => ['required', 'integer', 'exists:users,id'],
            'unit_id' => ['required', 'integer', 'exists:tb2_unidades,tb2_id'],
            'date' => ['required', 'date_format:Y-m-d'],
        ]);

        $user = $request->user();
        $availableUnits = $this->availableUnits($user);
        $unitId = (int) $validated['unit_id'];

        if (! $availableUnits->contains(fn (array $unit) => (int) ($unit['id'] ?? 0) === $unitId)) {
            abort(403);
        }

        $cashierId = (int) $validated['cashier_id'];
        $closureDate = $this->parseDate($validated['date'], 'Y-m-d', Carbon::today())->startOfDay();
        $start = $closureDate->copy()->startOfDay();
        $end = $closureDate->copy()->endOfDay();

        $hasPayments = VendaPagamento::query()
            ->whereBetween('created_at', [$start, $end])
            ->whereHas('vendas', function ($query) use ($cashierId, $unitId) {
                $query->where('id_user_caixa', $cashierId)
                    ->where('id_unidade', $unitId);
            })
            ->exists();

        if (! $hasPayments) {
            return response()->json([
                'message' => 'Nao existem vendas para este caixa nesta data.',
            ], 422);
        }

        $alreadyClosed = CashierClosure::query()
            ->where('user_id', $cashierId)
            ->where('unit_id', $unitId)
            ->whereDate('closed_date', $closureDate)
            ->exists();

        if ($alreadyClosed) {
            return response()->json([
                'message' => 'Ja existe fechamento para este caixa na data informada.',
            ], 422);
        }

        $unit = $availableUnits->first(fn (array $item) => (int) ($item['id'] ?? 0) === $unitId);
        $closedAt = now();

        CashierClosure::create([
            'user_id' => $cashierId,
            'unit_id' => $unitId,
            'unit_name' => $unit['name'] ?? ('Unidade #' . $unitId),
            'cash_amount' => 0,
            'card_amount' => 0,
            'master_cash_amount' => 0,
            'master_card_amount' => 0,
            'closed_date' => $closureDate->toDateString(),
            'closed_at' => $closedAt,
            'master_checked_by' => $user->id,
            'master_checked_at' => $closedAt,
        ]);

        return response()->json([
            'message' => sprintf(
                'Fechamento zerado criado para %s.',
                $closureDate->format('d/m/y')
            ),
        ]);
    }

    public function storeSystemCashClosure(Request $request): JsonResponse
    {
        $this->ensureManager($request);

        $validated = $request->validate([
            'cashier_id' => ['required', 'integer', 'exists:users,id'],
            'unit_id' => ['required', 'integer', 'exists:tb2_unidades,tb2_id'],
            'date' => ['required', 'date_format:Y-m-d'],
        ]);

        $user = $request->user();
        $availableUnits = $this->availableUnits($user);
        $unitId = (int) $validated['unit_id'];

        if (! $availableUnits->contains(fn (array $unit) => (int) ($unit['id'] ?? 0) === $unitId)) {
            abort(403);
        }

        $cashierId = (int) $validated['cashier_id'];
        $closureDate = $this->parseDate($validated['date'], 'Y-m-d', Carbon::today())->startOfDay();

        $alreadyClosed = CashierClosure::query()
            ->where('user_id', $cashierId)
            ->where('unit_id', $unitId)
            ->whereDate('closed_date', $closureDate)
            ->exists();

        if ($alreadyClosed) {
            return response()->json([
                'message' => 'Ja existe fechamento para este caixa na data informada.',
            ], 422);
        }

        $systemValues = $this->calculateCashClosureSystemValues($cashierId, $unitId, $closureDate);

        if ($systemValues === null) {
            return response()->json([
                'message' => 'Nao existem vendas para este caixa nesta data.',
            ], 422);
        }

        $unit = $availableUnits->first(fn (array $item) => (int) ($item['id'] ?? 0) === $unitId);

        CashierClosure::create([
            'user_id' => $cashierId,
            'unit_id' => $unitId,
            'unit_name' => $unit['name'] ?? ('Unidade #' . $unitId),
            'cash_amount' => $systemValues['cash_amount'],
            'card_amount' => $systemValues['card_amount'],
            'closed_date' => $closureDate->toDateString(),
            'closed_at' => now(),
        ]);

        return response()->json([
            'message' => sprintf(
                'Fechamento OK criado para %s.',
                $closureDate->format('d/m/y')
            ),
        ]);
    }

    public function cashDiscrepancies(Request $request): Response
    {
        $this->ensureManager($request);
        $user = $request->user();
        $availableUnits = $this->availableUnits($user);

        $requestedUnitId = $request->query('unit_id');
        $filterUnitId = $requestedUnitId !== null && $requestedUnitId !== '' && $requestedUnitId !== 'all'
            ? (int) $requestedUnitId
            : null;

        if ($filterUnitId && ! $availableUnits->contains(fn ($unit) => $unit['id'] === $filterUnitId)) {
            $filterUnitId = null;
        }

        $dateInput = $request->query('date');
        $date = $this->parseDate($dateInput, 'Y-m-d', Carbon::today());
        $start = $date->copy()->startOfDay();
        $end = $date->copy()->endOfDay();
        $dateValue = $date->format('Y-m-d');
        $referenceDate = $date->toDateString();

        $requestedCashierId = $request->query('cashier_id');
        $filterCashierId = $requestedCashierId !== null && $requestedCashierId !== '' && $requestedCashierId !== 'all'
            ? (int) $requestedCashierId
            : null;

        $allowedUnitIds = $availableUnits->pluck('id')->filter()->values();

        $closureBaseQuery = CashierClosure::query()
            ->whereDate('closed_date', $referenceDate);

        if ($allowedUnitIds->isNotEmpty()) {
            $closureBaseQuery->where(function ($query) use ($allowedUnitIds) {
                $query->whereIn('unit_id', $allowedUnitIds)
                    ->orWhereNull('unit_id');
            });
        }

        if ($filterUnitId) {
            $closureBaseQuery->where(function ($query) use ($filterUnitId) {
                $query->whereNull('unit_id')
                    ->orWhere('unit_id', $filterUnitId);
            });
        }

        $cashierIds = (clone $closureBaseQuery)
            ->pluck('user_id')
            ->filter()
            ->unique()
            ->values();

        $cashiers = $cashierIds->isNotEmpty()
            ? User::whereIn('id', $cashierIds)->orderBy('name')->get(['id', 'name'])->keyBy('id')
            : collect();

        $cashierOptions = $cashiers
            ->map(fn (User $cashier) => ['id' => $cashier->id, 'name' => $cashier->name])
            ->values();

        $closureQuery = clone $closureBaseQuery;
        if ($filterCashierId) {
            $closureQuery->where('user_id', $filterCashierId);
        }

        $closures = $closureQuery->get([
            'id',
            'user_id',
            'unit_id',
            'unit_name',
            'cash_amount',
            'card_amount',
            'closed_date',
            'closed_at',
        ]);

        $applySaleFilters = function ($query) use ($filterUnitId, $filterCashierId, $allowedUnitIds) {
            if ($filterUnitId) {
                $query->where('id_unidade', $filterUnitId);
            } elseif ($allowedUnitIds->isNotEmpty()) {
                $query->whereIn('id_unidade', $allowedUnitIds);
            }

            if ($filterCashierId) {
                $query->where('id_user_caixa', $filterCashierId);
            }
        };

        $paymentsQuery = VendaPagamento::query()
            ->whereBetween('created_at', [$start, $end])
            ->with(['vendas' => function ($query) use ($applySaleFilters) {
                $query->select('tb3_id', 'tb4_id', 'id_user_caixa', 'id_unidade')
                    ->orderBy('tb3_id');
                $applySaleFilters($query);
            }]);

        $paymentsQuery->whereHas('vendas', function ($query) use ($applySaleFilters) {
            $applySaleFilters($query);
        });

        $payments = $paymentsQuery->get([
            'tb4_id',
            'valor_total',
            'tipo_pagamento',
            'valor_pago',
            'troco',
            'dois_pgto',
            'created_at',
        ]);
        $expenseTotals = $this->groupExpensesByCashierUnit($referenceDate, $filterUnitId, $allowedUnitIds, $filterCashierId);

        $baseTotals = [
            'dinheiro' => 0.0,
            'maquina' => 0.0,
            'vale' => 0.0,
            'refeicao' => 0.0,
            'faturar' => 0.0,
        ];

        $groupedTotals = [];

        foreach ($payments as $payment) {
            $firstSale = optional($payment->vendas->first());
            $cashierId = $firstSale?->id_user_caixa;
            $unitId = $firstSale?->id_unidade;

            if (! $cashierId) {
                continue;
            }

            $groupKey = $cashierId . '-' . ($unitId ?? 'none');

            if (! isset($groupedTotals[$groupKey])) {
                $groupedTotals[$groupKey] = [
                    'cashier_id' => $cashierId,
                    'unit_id' => $unitId,
                    'totals' => $baseTotals,
                ];
            }

            foreach ($this->breakdownPayment($payment) as $type => $amount) {
                $groupedTotals[$groupKey]['totals'][$type] += $amount;
            }
        }

        $unitNameMap = $availableUnits
            ->mapWithKeys(fn ($unit) => [$unit['id'] => $unit['name']])
            ->all();

        $records = $closures
            ->map(function (CashierClosure $closure) use ($groupedTotals, $cashiers, $unitNameMap, $baseTotals, $expenseTotals) {
                $unitId = $closure->unit_id;
                $groupKey = $closure->user_id . '-' . ($unitId ?? 'none');
                $systemTotals = $groupedTotals[$groupKey]['totals'] ?? $baseTotals;

                $cashSystem = $systemTotals['dinheiro'] ?? 0.0;
                $cardSystem = $systemTotals['maquina'] ?? 0.0;
                $expenseTotal = (float) ($expenseTotals[$groupKey] ?? 0.0);
                $conferenceCashBase = max($cashSystem - $expenseTotal, 0.0);
                $systemTotal = $conferenceCashBase + $cardSystem;

                $cashClosure = (float) $closure->cash_amount;
                $cardClosure = (float) $closure->card_amount;
                $closureTotal = $cashClosure + $cardClosure;
                $closureTotalWithExpenses = $closureTotal + $expenseTotal;

                $discrepancy = round($systemTotal - $closureTotalWithExpenses, 2);

                $totalsRounded = array_map(fn ($value) => round((float) $value, 2), $systemTotals);

                return [
                    'id' => $closure->id,
                    'cashier_id' => $closure->user_id,
                    'cashier_name' => optional($cashiers->get($closure->user_id))->name
                        ?? 'Caixa #' . $closure->user_id,
                    'unit_id' => $unitId,
                    'unit_name' => $closure->unit_name
                        ?? ($unitId ? ($unitNameMap[$unitId] ?? ('Unidade #' . $unitId)) : '---'),
                    'closed_date' => $closure->closed_date?->toDateString(),
                    'closed_at' => optional($closure->closed_at)->toIso8601String(),
                    'discrepancy' => $discrepancy,
                    'expense_total' => round($expenseTotal, 2),
                    'conference_base_cash' => round($conferenceCashBase, 2),
                    'conference_base_total' => round($systemTotal, 2),
                    'totals' => $totalsRounded,
                    'closure' => [
                        'cash_amount' => round($cashClosure, 2),
                        'card_amount' => round($cardClosure, 2),
                        'total_amount' => round($closureTotal, 2),
                    ],
                ];
            })
            ->filter(fn (array $record) => abs($record['discrepancy']) >= 0.01)
            ->sortByDesc(fn (array $record) => abs($record['discrepancy']))
            ->values();

        return Inertia::render('Reports/CashDiscrepancies', [
            'records' => $records,
            'dateValue' => $dateValue,
            'filterUnits' => $availableUnits->values(),
            'cashiers' => $cashierOptions,
            'selectedUnitId' => $filterUnitId,
            'selectedCashierId' => $filterCashierId,
        ]);
    }

    public function period(Request $request): Response
    {
        $this->ensureManager($request);
        [$filterUnitId, $filterUnits, $selectedUnit] = $this->resolveReportUnit($request);
        $allowedUnitIds = $this->reportUnitIds($filterUnits);
        $loadDailyTotals = $request->boolean('load_daily_totals');

        $mode = $request->query('mode', 'month') === 'day' ? 'day' : 'month';
        $dateValue = $request->query('date');

        if ($mode === 'day') {
            $date = $this->parseDate($dateValue, 'Y-m-d', Carbon::today());
            $start = $date->copy()->startOfDay();
            $end = $date->copy()->endOfDay();
            $dateValue = $date->format('Y-m-d');
        } else {
            $month = $this->parseDate($dateValue, 'Y-m', Carbon::today()->startOfMonth());
            $start = $month->copy()->startOfMonth();
            $end = $month->copy()->endOfMonth();
            $dateValue = $month->format('Y-m');
        }

        $totals = $this->aggregatePeriodTotals($start, $end, $filterUnitId, $allowedUnitIds);
        $chartData = $this->buildChartData($totals);
        $expenseTotal = $this->sumExpenses($start, $end, $filterUnitId, $allowedUnitIds);
        $dailyTotals = $loadDailyTotals
            ? $this->buildDailyTotals($start, $end, $filterUnitId, $allowedUnitIds)
            : collect();

        return Inertia::render('Reports/SalesPeriod', [
            'chartData' => $chartData,
            'expenseTotal' => $expenseTotal,
            'dailyTotals' => $dailyTotals,
            'loadDailyTotals' => $loadDailyTotals,
            'mode' => $mode,
            'dateValue' => $dateValue,
            'startDate' => $start->format('d/m/y'),
            'endDate' => $end->format('d/m/y'),
            'filterUnits' => $filterUnits,
            'selectedUnitId' => $filterUnitId,
            'unit' => $selectedUnit,
        ]);
    }

    public function detailed(Request $request): Response
    {
        $this->ensureManager($request);
        [$filterUnitId, $filterUnits, $selectedUnit] = $this->resolveReportUnit($request);
        $allowedUnitIds = $this->reportUnitIds($filterUnits);

        $dateValue = $request->query('date');
        $date = $this->parseDate($dateValue, 'Y-m-d', Carbon::today());
        $start = $date->copy()->startOfDay();
        $end = $date->copy()->endOfDay();
        $dateValue = $date->format('Y-m-d');

        $payments = VendaPagamento::with(['vendas' => function ($query) use ($filterUnitId, $allowedUnitIds) {
            $query->orderBy('tb3_id')->select([
                'tb3_id',
                'tb4_id',
                'produto_nome',
                'valor_unitario',
                'quantidade',
                'valor_total',
                'data_hora',
                'id_comanda',
                'id_lanc',
            ]);

            if ($filterUnitId) {
                $query->where('id_unidade', $filterUnitId);
            } elseif ($allowedUnitIds->isNotEmpty()) {
                $query->whereIn('id_unidade', $allowedUnitIds);
            } else {
                $query->whereRaw('1 = 0');
            }
        }])
            ->whereBetween('created_at', [$start, $end])
            ->when($filterUnitId, function ($query) use ($filterUnitId) {
                $query->whereHas('vendas', function ($subQuery) use ($filterUnitId) {
                    $subQuery->where('id_unidade', $filterUnitId);
                });
            }, function ($query) use ($allowedUnitIds) {
                if ($allowedUnitIds->isNotEmpty()) {
                    $query->whereHas('vendas', function ($subQuery) use ($allowedUnitIds) {
                        $subQuery->whereIn('id_unidade', $allowedUnitIds);
                    });
                } else {
                    $query->whereRaw('1 = 0');
                }
            })
            ->orderByDesc('tb4_id')
            ->get([
                'tb4_id',
                'valor_total',
                'tipo_pagamento',
                'valor_pago',
                'troco',
                'dois_pgto',
                'created_at',
            ])
            ->values();

        $lancIds = $payments
            ->flatMap(fn (VendaPagamento $payment) => $payment->vendas->pluck('id_lanc'))
            ->filter()
            ->unique()
            ->values();

        $lancUsers = $lancIds->isNotEmpty()
            ? User::whereIn('id', $lancIds)->pluck('name', 'id')
            : collect();

        $payments = $payments
            ->map(function (VendaPagamento $payment) use ($lancUsers) {
                return [
                    'tb4_id' => $payment->tb4_id,
                    'valor_total' => (float) $payment->valor_total,
                    'tipo_pagamento' => $this->normalizePaymentTypeForDisplay($payment->tipo_pagamento),
                    'valor_pago' => $payment->valor_pago,
                    'troco' => $payment->troco,
                    'dois_pgto' => $payment->dois_pgto,
                    'created_at' => $payment->created_at->toIso8601String(),
                    'items' => $payment->vendas
                        ->map(function ($item) use ($lancUsers) {
                            return [
                                'tb3_id' => $item->tb3_id,
                                'produto_nome' => $item->produto_nome,
                                'quantidade' => $item->quantidade,
                                'valor_unitario' => $item->valor_unitario,
                                'valor_total' => $item->valor_total,
                                'data_hora' => optional($item->data_hora)->toIso8601String(),
                                'id_comanda' => $item->id_comanda,
                                'lanc_user_name' => $item->id_lanc ? ($lancUsers[$item->id_lanc] ?? null) : null,
                            ];
                        })
                        ->values(),
                ];
            })
            ->values();

        return Inertia::render($request->routeIs('mobile.*') ? 'Mobile/Reports/SalesDetailed' : 'Reports/SalesDetailed', [
            'payments' => $payments,
            'dateValue' => $dateValue,
            'filterUnits' => $filterUnits,
            'selectedUnitId' => $filterUnitId,
            'unit' => $selectedUnit,
        ]);
    }

    public function lanchonete(Request $request): Response
    {
        $this->ensureManager($request);
        [$filterUnitId, $filterUnits, $selectedUnit] = $this->resolveReportUnit($request);
        $allowedUnitIds = $this->reportUnitIds($filterUnits);
        $dateValue = $request->query('date');
        $date = $this->parseDate($dateValue, 'Y-m-d', Carbon::today());
        $start = $date->copy()->startOfDay();
        $end = $date->copy()->endOfDay();
        $dateValue = $date->format('Y-m-d');

        $rows = Venda::query()
            ->whereNotNull('id_comanda')
            ->whereBetween('id_comanda', [3000, 3100])
            ->when($filterUnitId, function ($query) use ($filterUnitId) {
                $query->where('id_unidade', $filterUnitId);
            }, function ($query) use ($allowedUnitIds) {
                if ($allowedUnitIds->isNotEmpty()) {
                    $query->whereIn('id_unidade', $allowedUnitIds);
                } else {
                    $query->whereRaw('1 = 0');
                }
            })
            ->whereBetween('data_hora', [$start, $end])
            ->orderByDesc('data_hora')
            ->get([
                'tb3_id',
                'tb4_id',
                'id_comanda',
                'produto_nome',
                'valor_unitario',
                'quantidade',
                'valor_total',
                'data_hora',
                'id_user_caixa',
                'id_lanc',
                'tipo_pago',
                'status_pago',
                'status',
                'id_unidade',
            ]);

        $userIds = $rows
            ->flatMap(fn (Venda $row) => [$row->id_user_caixa, $row->id_lanc])
            ->filter()
            ->unique()
            ->values();

        $users = $userIds->isNotEmpty()
            ? User::whereIn('id', $userIds)->pluck('name', 'id')
            : collect();

        $unitIds = $rows
            ->pluck('id_unidade')
            ->filter()
            ->unique()
            ->values();

        $units = $unitIds->isNotEmpty()
            ? Unidade::whereIn('tb2_id', $unitIds)->pluck('tb2_nome', 'tb2_id')
            : collect();

        $openComandas = [];
        $closedComandas = [];

        $grouped = $rows->groupBy(fn (Venda $row) => $this->buildLanchoneteGroupKey($row));

        foreach ($grouped as $groupKey => $items) {
            $first = $items->first();
            $status = (int) ($first->status ?? 0);
            $lastUpdate = $items->max('data_hora');
            $lastUpdate = $lastUpdate ? Carbon::parse($lastUpdate)->toIso8601String() : null;
            $unitName = $first?->id_unidade ? ($units[$first->id_unidade] ?? null) : null;

            $payload = [
                'group_key' => $groupKey,
                'comanda' => (int) ($first->id_comanda ?? 0),
                'status' => $status,
                'payment_type' => $first->tipo_pago,
                'status_paid' => (bool) $first->status_pago,
                'unit_name' => $unitName,
                'total' => round((float) $items->sum('valor_total'), 2),
                'quantity' => (int) $items->sum('quantidade'),
                'updated_at' => $lastUpdate,
                'items' => $items->map(function (Venda $item) use ($users) {
                    return [
                        'id' => $item->tb3_id,
                        'name' => $item->produto_nome,
                        'quantity' => (int) $item->quantidade,
                        'unit_price' => (float) $item->valor_unitario,
                        'total' => round((float) $item->valor_total, 2),
                        'launched_at' => $item->data_hora ? $item->data_hora->toIso8601String() : null,
                        'launched_by' => $item->id_lanc ? ($users[$item->id_lanc] ?? null) : null,
                        'cashier' => $item->id_user_caixa ? ($users[$item->id_user_caixa] ?? null) : null,
                    ];
                })->values()->all(),
            ];

            if ($status === 0) {
                $openComandas[] = $payload;
            } else {
                $closedComandas[] = $payload;
            }
        }

        usort($openComandas, fn (array $a, array $b) => $a['comanda'] <=> $b['comanda']);
        usort($closedComandas, fn (array $a, array $b) => strcmp((string) $b['updated_at'], (string) $a['updated_at']));

        return Inertia::render('Reports/Lanchonete', [
            'unit' => [
                'id' => $selectedUnit['id'] ?? null,
                'name' => $selectedUnit['name'] ?? '---',
            ],
            'dateValue' => $dateValue,
            'openComandas' => $openComandas,
            'closedComandas' => $closedComandas,
            'filterUnits' => $filterUnits,
            'selectedUnitId' => $filterUnitId,
        ]);
    }

    public function control(Request $request): Response
    {
        $this->ensureManager($request);
        $user = $request->user();
        $availableUnits = $this->availableUnits($user);

        $defaultStart = Carbon::today()->startOfMonth();
        $defaultEnd = Carbon::today()->endOfDay();
        $start = $this->parseFlexibleReportDate($request->query('start_date'), $defaultStart)->startOfDay();
        $end = $this->parseFlexibleReportDate($request->query('end_date'), $defaultEnd)->endOfDay();

        if ($end->lt($start)) {
            $end = $start->copy()->endOfDay();
        }

        $paymentType = $this->normalizeControlPaymentType($request->query('payment_type'));
        $stores = $this->buildControlStoreTotals($start, $end, $availableUnits, $paymentType);
        $grandTotal = round((float) $stores->sum('total'), 2);
        $storesWithSales = $stores->filter(fn (array $store) => $store['total'] > 0)->count();
        $topStore = $stores->first(fn (array $store) => $store['total'] > 0);
        $averagePerStore = $storesWithSales > 0 ? round($grandTotal / $storesWithSales, 2) : 0.0;

        return Inertia::render($request->routeIs('mobile.*') ? 'Mobile/Reports/ControlPanel' : 'Reports/ControlPanel', [
            'period' => [
                'start' => $start->format('d/m/y'),
                'end' => $end->format('d/m/y'),
                'label' => $start->translatedFormat('d/m/Y') . ' - ' . $end->translatedFormat('d/m/Y'),
            ],
            'paymentType' => $paymentType,
            'paymentOptions' => [
                ['value' => 'all', 'label' => 'Tudo (Dinheiro + Cartao + Vale)'],
                ['value' => 'dinheiro', 'label' => 'Dinheiro'],
                ['value' => 'cartao', 'label' => 'Cartao'],
                ['value' => 'vale', 'label' => 'Vale'],
                ['value' => 'refeicao', 'label' => 'Refeicao'],
            ],
            'stores' => $stores,
            'summary' => [
                'grand_total' => $grandTotal,
                'stores_with_sales' => $storesWithSales,
                'average_per_store' => $averagePerStore,
                'top_store' => $topStore,
            ],
        ]);
    }

    private function ensureManager(Request $request): void
    {
        $user = $request->user();

        if (!$user || !in_array((int) $user->funcao, [0, 1], true)) {
            abort(403);
        }
    }

    private function ensureManagementViewer(Request $request): void
    {
        $user = $request->user();

        if (!$user || !in_array((int) $user->funcao, [0, 1, 2], true)) {
            abort(403);
        }
    }

    private function ensureMaster(Request $request): void
    {
        $user = $request->user();

        if (! $user || (int) $user->funcao !== 0) {
            abort(403);
        }
    }

    private function ensureCashier(Request $request): void
    {
        $user = $request->user();

        if (! $user || (int) $user->funcao !== 3) {
            abort(403);
        }
    }

    private function ensureHojeAccess(Request $request): void
    {
        $user = $request->user();

        if (! $user || ! in_array((int) $user->funcao, [0, 1, 2, 3], true)) {
            abort(403);
        }
    }

    private function ensureTodayPaymentFiscalAccess(Request $request, VendaPagamento $payment): int
    {
        $this->ensureHojeAccess($request);

        $unitId = $this->resolveUnitId($request);

        if (! ManagementScope::canAccessFiscalUnit($request->user(), $unitId)) {
            abort(403);
        }

        $belongsToActiveUnit = VendaPagamento::query()
            ->whereKey($payment->tb4_id)
            ->whereHas('vendas', function ($query) use ($unitId) {
                $query->where('id_unidade', $unitId);
            })
            ->exists();

        if (! $belongsToActiveUnit) {
            abort(404);
        }

        return $unitId;
    }

    private function prepareSingleFiscalPayment(
        Request $request,
        VendaPagamento $payment,
        FiscalInvoicePreparationService $fiscalInvoicePreparationService,
        string $successMessage,
    ): RedirectResponse|JsonResponse {
        try {
            $invoice = $fiscalInvoicePreparationService->prepareForPayment($payment, force: true);
        } catch (RuntimeException $exception) {
            return $this->fiscalActionResponse($request, 'error', $exception->getMessage(), 422);
        }

        if (! $invoice) {
            return $this->fiscalActionResponse(
                $request,
                'error',
                sprintf('A venda %d nao gerou nota fiscal automatica.', (int) $payment->tb4_id),
                422,
            );
        }

        $messageType = in_array((string) $invoice->tb27_status, ['erro_validacao', 'erro_transmissao'], true)
            ? 'error'
            : 'success';
        $message = sprintf(
            $successMessage,
            (int) $payment->tb4_id,
            $invoice->tb27_status ?? 'indefinido',
        );

        if ($request->expectsJson()) {
            return response()->json([
                'message_type' => $messageType,
                'message' => $message,
                'payment_id' => (int) $payment->tb4_id,
                'invoice_id' => (int) $invoice->tb27_id,
                'invoice_status' => $invoice->tb27_status,
                'fiscal_receipt' => $this->buildReportFiscalReceiptPayload($invoice),
            ], $messageType === 'error' ? 422 : 200);
        }

        return redirect()
            ->route('reports.hoje')
            ->with($messageType, $message);
    }

    private function fiscalActionResponse(
        Request $request,
        string $messageType,
        string $message,
        int $status = 200,
    ): RedirectResponse|JsonResponse {
        if ($request->expectsJson()) {
            return response()->json([
                'message_type' => $messageType,
                'message' => $message,
            ], $status);
        }

        return redirect()
            ->route('reports.hoje')
            ->with($messageType, $message);
    }

    private function fetchPayments(
        Carbon $start,
        Carbon $end,
        ?int $unitId = null,
        ?Collection $allowedUnitIds = null
    ): Collection
    {
        $applyUnitFilters = function ($query) use ($unitId, $allowedUnitIds) {
            if ($unitId) {
                $query->where('id_unidade', $unitId);
            } elseif ($allowedUnitIds instanceof Collection && $allowedUnitIds->isNotEmpty()) {
                $query->whereIn('id_unidade', $allowedUnitIds);
            } else {
                $query->whereRaw('1 = 0');
            }
        };

        $query = VendaPagamento::query()
            ->with([
                'vendas' => function ($subQuery) use ($applyUnitFilters) {
                    $subQuery->select([
                        'tb3_id',
                        'tb4_id',
                        'tb1_id',
                        'id_comanda',
                        'produto_nome',
                        'valor_unitario',
                        'quantidade',
                        'valor_total',
                        'data_hora',
                        'id_user_caixa',
                        'id_user_vale',
                        'id_unidade',
                        'tipo_pago',
                    ])->orderBy('tb3_id');

                    $applyUnitFilters($subQuery);
                },
                'vendas.caixa:id,name',
                'vendas.valeUser:id,name',
                'vendas.unidade:tb2_id,tb2_nome,tb2_endereco,tb2_cnpj',
            ])
            ->whereBetween('created_at', [$start, $end]);

        $query->whereHas('vendas', function ($subQuery) use ($applyUnitFilters) {
            $applyUnitFilters($subQuery);
        });

        return $query
            ->orderByDesc('tb4_id')
            ->get([
                'tb4_id',
                'valor_total',
                'tipo_pagamento',
                'valor_pago',
                'troco',
                'dois_pgto',
                'created_at',
            ]);
    }

    private function summarizePayments(Collection $payments): array
    {
        $totals = [
            'dinheiro' => 0.0,
            'maquina' => 0.0,
            'vale' => 0.0,
            'refeicao' => 0.0,
            'faturar' => 0.0,
        ];
        $details = [
            'dinheiro' => [],
            'maquina' => [],
            'vale' => [],
            'refeicao' => [],
            'faturar' => [],
        ];

        foreach ($payments as $payment) {
            $rawType = (string) $payment->tipo_pagamento;
            $type = $this->normalizePaymentTypeForBucket($rawType);
            $displayPaymentType = $this->normalizePaymentTypeForDisplay($rawType);
            $base = [
                'tb4_id' => $payment->tb4_id,
                'tipo_pagamento' => $displayPaymentType,
                'valor_total' => (float) $payment->valor_total,
                'valor_pago' => $payment->valor_pago,
                'troco' => $payment->troco,
                'dois_pgto' => $payment->dois_pgto,
                'created_at' => $payment->created_at->toIso8601String(),
                'origin' => $rawType,
                'receipt' => $this->buildReceiptPayload($payment),
            ];

            if ($type === 'dinheiro') {
                $cardPortion = max((float) $payment->dois_pgto, 0);
                $cashPortion = max((float) $payment->valor_total - $cardPortion, 0);

                if ($cashPortion > 0) {
                    $totals['dinheiro'] += $cashPortion;
                    $details['dinheiro'][] = array_merge($base, [
                        'applied_total' => $cashPortion,
                    ]);
                }

                if ($cardPortion > 0) {
                    $totals['maquina'] += $cardPortion;
                    $details['maquina'][] = array_merge($base, [
                        'applied_total' => $cardPortion,
                    ]);
                }

                continue;
            }

            if (!isset($totals[$type])) {
                continue;
            }

            $totals[$type] += (float) $payment->valor_total;
            $details[$type][] = array_merge($base, [
                'applied_total' => (float) $payment->valor_total,
            ]);
        }

        $chartData = $this->buildChartData($totals);

        return [$totals, $details, $chartData];
    }

    private function buildReceiptPayload(VendaPagamento $payment): array
    {
        $sales = $payment->vendas->values();
        $firstSale = $sales->first();
        $saleDateTime = $firstSale?->data_hora ?? $payment->created_at;
        $receiptComanda = $this->resolveReceiptComanda($sales);
        $displayPaymentType = $this->normalizePaymentTypeForDisplay($payment->tipo_pagamento);

        return [
            'id' => $payment->tb4_id,
            'comanda' => $receiptComanda,
            'total' => round((float) $payment->valor_total, 2),
            'date_time' => $saleDateTime?->toIso8601String(),
            'tipo_pago' => $displayPaymentType,
            'cashier_name' => $firstSale?->caixa?->name ?? '---',
            'unit_name' => $firstSale?->unidade?->tb2_nome ?? '---',
            'unit_address' => $firstSale?->unidade?->tb2_endereco,
            'unit_cnpj' => $firstSale?->unidade?->tb2_cnpj,
            'vale_user_name' => $firstSale?->valeUser?->name,
            'vale_type' => in_array($payment->tipo_pagamento, ['vale', 'refeicao'], true)
                ? $payment->tipo_pagamento
                : null,
            'payment' => [
                'id' => $payment->tb4_id,
                'valor_total' => round((float) $payment->valor_total, 2),
                'valor_pago' => $payment->valor_pago !== null ? round((float) $payment->valor_pago, 2) : null,
                'troco' => $payment->troco !== null ? round((float) $payment->troco, 2) : null,
                'dois_pgto' => $payment->dois_pgto !== null ? round((float) $payment->dois_pgto, 2) : null,
                'tipo_pagamento' => $displayPaymentType,
            ],
            'items' => $sales
                ->map(function (Venda $sale) {
                    return [
                        'id' => $sale->tb3_id,
                        'product_id' => $sale->tb1_id,
                        'product_name' => $sale->produto_nome,
                        'quantity' => (int) $sale->quantidade,
                        'unit_price' => round((float) $sale->valor_unitario, 2),
                        'subtotal' => round((float) $sale->valor_total, 2),
                        'comanda' => $sale->id_comanda,
                    ];
                })
                ->values()
                ->all(),
        ];
    }

    private function resolveReceiptComanda(Collection $sales): ?string
    {
        $comanda = $sales
            ->pluck('id_comanda')
            ->filter(fn ($value) => $value !== null && $value !== '')
            ->unique()
            ->implode(', ');

        return $comanda !== '' ? $comanda : null;
    }

    private function parseDate(?string $value, string $format, Carbon $fallback): Carbon
    {
        if (!$value) {
            return $fallback;
        }

        try {
            return Carbon::createFromFormat($format, $value);
        } catch (InvalidFormatException $exception) {
            return $fallback;
        }
    }

    private function buildLanchoneteGroupKey(Venda $sale): string
    {
        $comandaId = (int) ($sale->id_comanda ?? 0);
        $unitId = (int) ($sale->id_unidade ?? 0);
        $status = (int) ($sale->status ?? 0);

        if ($status === 0) {
            return sprintf('unit-%d-comanda-%d-open', $unitId, $comandaId);
        }

        if ($sale->tb4_id) {
            return sprintf('unit-%d-comanda-%d-payment-%d', $unitId, $comandaId, (int) $sale->tb4_id);
        }

        return sprintf('unit-%d-comanda-%d-closed-row-%d', $unitId, $comandaId, (int) $sale->tb3_id);
    }

    private function normalizeExpenseCategory(string $value): string
    {
        $normalized = preg_replace('/\s+/u', ' ', trim($value));

        return $normalized !== '' ? $normalized : 'Sem categoria';
    }

    private function buildExpenseCategoryKey(string $categoryName): string
    {
        $slug = Str::slug($categoryName);

        return $slug !== '' ? $slug : 'sem-categoria';
    }

    private function calculateCashClosureSystemValues(int $cashierId, int $unitId, Carbon $closureDate): ?array
    {
        $start = $closureDate->copy()->startOfDay();
        $end = $closureDate->copy()->endOfDay();
        $payments = VendaPagamento::query()
            ->whereBetween('created_at', [$start, $end])
            ->whereHas('vendas', function ($query) use ($cashierId, $unitId) {
                $query->where('id_user_caixa', $cashierId)
                    ->where('id_unidade', $unitId);
            })
            ->get([
                'tb4_id',
                'valor_total',
                'tipo_pagamento',
                'valor_pago',
                'troco',
                'dois_pgto',
                'created_at',
            ]);

        if ($payments->isEmpty()) {
            return null;
        }

        $totals = [
            'dinheiro' => 0.0,
            'maquina' => 0.0,
        ];

        foreach ($payments as $payment) {
            foreach ($this->breakdownPayment($payment) as $type => $amount) {
                if (array_key_exists($type, $totals)) {
                    $totals[$type] += $amount;
                }
            }
        }

        $referenceDate = $closureDate->toDateString();
        $expenseTotal = (float) $this->groupExpensesByCashierUnit(
            $referenceDate,
            $unitId,
            collect([$unitId]),
            $cashierId
        )->get($cashierId . '-' . $unitId, 0);

        return [
            'cash_amount' => round(max((float) $totals['dinheiro'] - $expenseTotal, 0), 2),
            'card_amount' => round((float) $totals['maquina'], 2),
        ];
    }

    private function parseReceiptIdFilter(mixed $value): ?int
    {
        $digits = preg_replace('/\D+/', '', trim((string) $value));

        if ($digits === null || $digits === '') {
            return null;
        }

        $receiptId = (int) $digits;

        return $receiptId > 0 ? $receiptId : null;
    }

    private function parseCurrencyFilter(mixed $value): ?float
    {
        $normalized = trim((string) $value);

        if ($normalized === '') {
            return null;
        }

        $normalized = str_replace(['R$', ' '], '', $normalized);

        if (str_contains($normalized, ',')) {
            $normalized = str_replace('.', '', $normalized);
            $normalized = str_replace(',', '.', $normalized);
        }

        if (! is_numeric($normalized)) {
            return null;
        }

        return round((float) $normalized, 2);
    }

    private function resolveHojeTimeWindow(mixed $value, Carbon $start, Carbon $end): ?array
    {
        $normalized = trim((string) $value);

        if ($normalized === '') {
            return null;
        }

        if (! preg_match('/^(\d{1,2}):(\d{2})$/', $normalized, $matches)) {
            return null;
        }

        $hour = (int) $matches[1];
        $minute = (int) $matches[2];

        if ($hour < 0 || $hour > 23 || $minute < 0 || $minute > 59) {
            return null;
        }

        $baseTime = $start->copy()->setTime($hour, $minute);

        return [
            'start' => $baseTime->copy()->subMinutes(10)->max($start->copy()),
            'end' => $baseTime->copy()->addMinutes(10)->min($end->copy()),
            'value' => sprintf('%02d:%02d', $hour, $minute),
        ];
    }

    private function resolveUnitId(Request $request): int
    {
        $unit = $request->session()->get('active_unit');

        if (isset($unit['id'])) {
            $unitId = (int) $unit['id'];

            if ($unitId > 0 && Unidade::active()->where('tb2_id', $unitId)->exists()) {
                return $unitId;
            }
        }

        $userUnitId = (int) ($request->user()?->tb2_id ?? 0);

        if ($userUnitId > 0 && Unidade::active()->where('tb2_id', $userUnitId)->exists()) {
            return $userUnitId;
        }

        return 0;
    }

    private function valeBreakdown(Carbon $start, Carbon $end, ?int $unitId = null): array
    {
        $query = Venda::query()
            ->whereIn('tipo_pago', ['vale', 'refeicao'])
            ->whereBetween('data_hora', [$start, $end])
            ->selectRaw('tipo_pago as tipo, SUM(valor_total) as total')
            ->groupBy('tipo');

        if ($unitId) {
            $query->where('id_unidade', $unitId);
        }

        $rows = $query->get();

        $totals = [
            'vale' => 0.0,
            'refeicao' => 0.0,
        ];

        foreach ($rows as $row) {
            $tipo = $row->tipo === 'refeicao' ? 'refeicao' : 'vale';
            $totals[$tipo] += (float) $row->total;
        }

        return $totals;
    }

    private function applyGlobalValeTotals(
        Carbon $start,
        Carbon $end,
        array $totals,
        array $details,
        ?int $unitId = null,
        ?Collection $allowedUnitIds = null
    ): array
    {
        $valeIds = $this->valeSaleIds($start, $end, 'vale', $unitId, $allowedUnitIds);
        $refeicaoIds = $this->valeSaleIds($start, $end, 'refeicao', $unitId, $allowedUnitIds);

        $globalPayments = $this->fetchPayments($start, $end, $unitId, $allowedUnitIds);

        $valePayments = $valeIds->isEmpty()
            ? collect()
            : $globalPayments->filter(fn (VendaPagamento $payment) => $valeIds->contains($payment->tb4_id));

        $refeicaoPayments = $refeicaoIds->isEmpty()
            ? collect()
            : $globalPayments->filter(fn (VendaPagamento $payment) => $refeicaoIds->contains($payment->tb4_id));

        if ($valePayments->isNotEmpty()) {
            $valePayments = $valePayments->map(function (VendaPagamento $payment) {
                $cloned = clone $payment;
                $cloned->tipo_pagamento = 'vale';

                return $cloned;
            });

            [$valeTotals, $valeDetails] = $this->summarizePayments($valePayments);
            $totals['vale'] = $valeTotals['vale'];
            $details['vale'] = $valeDetails['vale'];
        } else {
            $totals['vale'] = 0.0;
            $details['vale'] = [];
        }

        if ($refeicaoPayments->isNotEmpty()) {
            $refeicaoPayments = $refeicaoPayments->map(function (VendaPagamento $payment) {
                $cloned = clone $payment;
                $cloned->tipo_pagamento = 'refeicao';

                return $cloned;
            });

            [$refTotals, $refDetails] = $this->summarizePayments($refeicaoPayments);
            $totals['refeicao'] = $refTotals['refeicao'];
            $details['refeicao'] = $refDetails['refeicao'];
        } else {
            $totals['refeicao'] = 0.0;
            $details['refeicao'] = [];
        }

        return [$totals, $details];
    }

    private function valeSaleIds(
        Carbon $start,
        Carbon $end,
        string $type,
        ?int $unitId = null,
        ?Collection $allowedUnitIds = null
    ): Collection
    {
        $query = Venda::query()
            ->where('tipo_pago', $type)
            ->whereBetween('data_hora', [$start, $end])
            ->select('tb4_id');

        if ($unitId) {
            $query->where('id_unidade', $unitId);
        } elseif ($allowedUnitIds instanceof Collection && $allowedUnitIds->isNotEmpty()) {
            $query->whereIn('id_unidade', $allowedUnitIds);
        } else {
            $query->whereRaw('1 = 0');
        }

        return $query->pluck('tb4_id')->unique()->values();
    }

    private function buildChartData(array $totals, ?array $meta = null): Collection
    {
        $meta = $meta ?? self::TYPE_META;

        return collect($meta)
            ->map(function (array $metaData, string $type) use ($totals) {
                return [
                    'type' => $type,
                    'label' => $metaData['label'],
                    'color' => $metaData['color'],
                    'total' => round($totals[$type] ?? 0, 2),
                ];
            })
            ->values();
    }

    private function aggregatePeriodTotals(
        Carbon $start,
        Carbon $end,
        ?int $unitId = null,
        ?Collection $allowedUnitIds = null
    ): array {
        $totals = [
            'dinheiro' => 0.0,
            'maquina' => 0.0,
            'vale' => 0.0,
            'refeicao' => 0.0,
            'faturar' => 0.0,
        ];

        $paymentTotals = $this->salesPeriodPaymentsBaseQuery($start, $end, $unitId, $allowedUnitIds)
            ->selectRaw("
                COALESCE(SUM(CASE
                    WHEN pagamentos.tipo_pagamento IN ('dinheiro', 'dinheiro_cartao_credito', 'dinheiro_cartao_debito', 'dinheiro_pix')
                        THEN GREATEST(pagamentos.valor_total - COALESCE(pagamentos.dois_pgto, 0), 0)
                    ELSE 0
                END), 0) as dinheiro,
                COALESCE(SUM(CASE
                    WHEN pagamentos.tipo_pagamento IN ('cartao_credito', 'cartao_debito', 'pix', 'maquina')
                        THEN GREATEST(pagamentos.valor_total, 0)
                    WHEN pagamentos.tipo_pagamento IN ('dinheiro', 'dinheiro_cartao_credito', 'dinheiro_cartao_debito', 'dinheiro_pix')
                        THEN GREATEST(COALESCE(pagamentos.dois_pgto, 0), 0)
                    ELSE 0
                END), 0) as maquina,
                COALESCE(SUM(CASE
                    WHEN pagamentos.tipo_pagamento = 'faturar'
                        THEN GREATEST(pagamentos.valor_total, 0)
                    ELSE 0
                END), 0) as faturar
            ")
            ->first();

        $totals['dinheiro'] = round((float) ($paymentTotals->dinheiro ?? 0), 2);
        $totals['maquina'] = round((float) ($paymentTotals->maquina ?? 0), 2);
        $totals['faturar'] = round((float) ($paymentTotals->faturar ?? 0), 2);

        return array_merge($totals, $this->saleTypeTotals($start, $end, $unitId, $allowedUnitIds));
    }

    private function breakdownPayment(VendaPagamento $payment): array
    {
        $rawType = (string) $payment->tipo_pagamento;
        $type = $this->normalizePaymentTypeForBucket($rawType);

        if (in_array($rawType, ['dinheiro', 'dinheiro_cartao_credito', 'dinheiro_cartao_debito', 'dinheiro_pix'], true)) {
            $cardPortion = max((float) $payment->dois_pgto, 0);
            $cashPortion = max((float) $payment->valor_total - $cardPortion, 0);
            $entries = [];
            if ($cashPortion > 0) {
                $entries['dinheiro'] = $cashPortion;
            }
            if ($cardPortion > 0) {
                $entries['maquina'] = $cardPortion;
            }

            return $entries;
        }

        if (!array_key_exists($type, self::TYPE_META)) {
            return [];
        }

        $amount = max((float) $payment->valor_total, 0);

        return $amount > 0 ? [$type => $amount] : [];
    }

    private function normalizePaymentTypeForDisplay(?string $paymentType): string
    {
        return match ((string) $paymentType) {
            'cartao_credito', 'cartao_debito', 'pix', 'maquina' => 'maquina',
            'dinheiro_cartao_credito', 'dinheiro_cartao_debito' => 'dinheiro',
            default => (string) $paymentType,
        };
    }

    private function normalizePaymentTypeForBucket(?string $paymentType): ?string
    {
        return match ((string) $paymentType) {
            'cartao_credito', 'cartao_debito', 'pix', 'maquina' => 'maquina',
            'dinheiro', 'dinheiro_cartao_credito', 'dinheiro_cartao_debito', 'dinheiro_pix' => 'dinheiro',
            'vale', 'refeicao', 'faturar' => (string) $paymentType,
            default => null,
        };
    }

    private function buildDailyTotals(
        Carbon $start,
        Carbon $end,
        ?int $unitId = null,
        ?Collection $allowedUnitIds = null
    ): Collection {
        $dailyTotals = $this->salesPeriodPaymentsBaseQuery($start, $end, $unitId, $allowedUnitIds)
            ->selectRaw("
                DATE(pagamentos.created_at) as payment_date,
                COALESCE(SUM(CASE
                    WHEN pagamentos.tipo_pagamento IN ('dinheiro', 'dinheiro_cartao_credito', 'dinheiro_cartao_debito', 'dinheiro_pix')
                        THEN GREATEST(pagamentos.valor_total - COALESCE(pagamentos.dois_pgto, 0), 0)
                    ELSE 0
                END), 0) as dinheiro,
                COALESCE(SUM(CASE
                    WHEN pagamentos.tipo_pagamento IN ('cartao_credito', 'cartao_debito', 'pix', 'maquina')
                        THEN GREATEST(pagamentos.valor_total, 0)
                    WHEN pagamentos.tipo_pagamento IN ('dinheiro', 'dinheiro_cartao_credito', 'dinheiro_cartao_debito', 'dinheiro_pix')
                        THEN GREATEST(COALESCE(pagamentos.dois_pgto, 0), 0)
                    ELSE 0
                END), 0) as maquina,
                COALESCE(SUM(CASE
                    WHEN pagamentos.tipo_pagamento = 'faturar'
                        THEN GREATEST(pagamentos.valor_total, 0)
                    ELSE 0
                END), 0) as faturar,
                COALESCE(SUM(pagamentos.valor_total), 0) as total
            ")
            ->groupBy(DB::raw('DATE(pagamentos.created_at)'))
            ->orderByDesc('payment_date')
            ->get()
            ->mapWithKeys(function ($row) {
                $date = (string) $row->payment_date;
                $carbon = Carbon::createFromFormat('Y-m-d', $date);

                return [
                    $date => [
                        'date' => $date,
                        'label' => $carbon->translatedFormat('d/m/y'),
                        'total' => round((float) $row->total, 2),
                        'dinheiro' => round((float) $row->dinheiro, 2),
                        'maquina' => round((float) $row->maquina, 2),
                        'vale' => 0.0,
                        'refeicao' => 0.0,
                        'faturar' => round((float) $row->faturar, 2),
                        'gastos' => 0.0,
                    ],
                ];
            });

        $valeAndMealTotals = $this->saleTypeTotalsByDay($start, $end, $unitId, $allowedUnitIds);
        $expenseTotals = $this->expenseTotalsByDay($start, $end, $unitId, $allowedUnitIds);

        return $dailyTotals
            ->map(function (array $day, string $date) use ($valeAndMealTotals, $expenseTotals) {
                $day['vale'] = round((float) ($valeAndMealTotals[$date]['vale'] ?? 0), 2);
                $day['refeicao'] = round((float) ($valeAndMealTotals[$date]['refeicao'] ?? 0), 2);
                $day['gastos'] = round((float) ($expenseTotals[$date] ?? 0), 2);

                return $day;
            })
            ->sortByDesc('date')
            ->values();
    }

    private function salesPeriodPaymentsBaseQuery(
        Carbon $start,
        Carbon $end,
        ?int $unitId = null,
        ?Collection $allowedUnitIds = null
    ) {
        return DB::table('tb4_vendas_pg as pagamentos')
            ->whereBetween('pagamentos.created_at', [$start, $end])
            ->whereExists(function ($subQuery) use ($unitId, $allowedUnitIds) {
                $subQuery
                    ->select(DB::raw(1))
                    ->from('tb3_vendas as vendas')
                    ->whereColumn('vendas.tb4_id', 'pagamentos.tb4_id');

                $this->applySaleUnitFilters($subQuery, $unitId, $allowedUnitIds, 'vendas');
            });
    }

    private function sumExpenses(
        Carbon $start,
        Carbon $end,
        ?int $unitId = null,
        ?Collection $allowedUnitIds = null
    ): float {
        $query = Expense::query()
            ->whereBetween('expense_date', [$start->toDateString(), $end->toDateString()]);

        $this->applyExpenseUnitFilters($query, $unitId, $allowedUnitIds);

        return round((float) $query->sum('amount'), 2);
    }

    private function expenseTotalsByDay(
        Carbon $start,
        Carbon $end,
        ?int $unitId = null,
        ?Collection $allowedUnitIds = null
    ): Collection {
        $query = Expense::query()
            ->whereBetween('expense_date', [$start->toDateString(), $end->toDateString()])
            ->selectRaw('expense_date, SUM(amount) as total')
            ->groupBy('expense_date');

        $this->applyExpenseUnitFilters($query, $unitId, $allowedUnitIds);

        return $query
            ->get()
            ->mapWithKeys(function ($row) {
                $dateKey = $row->expense_date instanceof Carbon
                    ? $row->expense_date->toDateString()
                    : (string) $row->expense_date;

                return [$dateKey => round((float) $row->total, 2)];
            });
    }

    private function saleTypeTotalsByDay(
        Carbon $start,
        Carbon $end,
        ?int $unitId = null,
        ?Collection $allowedUnitIds = null
    ): Collection {
        $query = Venda::query()
            ->whereIn('tipo_pago', ['vale', 'refeicao'])
            ->whereBetween('data_hora', [$start, $end])
            ->selectRaw('DATE(data_hora) as sale_date, tipo_pago as tipo, SUM(valor_total) as total')
            ->groupBy('sale_date', 'tipo');

        $this->applySaleUnitFilters($query, $unitId, $allowedUnitIds);

        return $query
            ->get()
            ->groupBy('sale_date')
            ->map(function (Collection $rows) {
                $totals = [
                    'vale' => 0.0,
                    'refeicao' => 0.0,
                ];

                foreach ($rows as $row) {
                    $type = $row->tipo === 'refeicao' ? 'refeicao' : 'vale';
                    $totals[$type] += (float) $row->total;
                }

                return [
                    'vale' => round((float) $totals['vale'], 2),
                    'refeicao' => round((float) $totals['refeicao'], 2),
                ];
            });
    }

    private function saleTypeTotals(
        Carbon $start,
        Carbon $end,
        ?int $unitId = null,
        ?Collection $allowedUnitIds = null
    ): array {
        $query = Venda::query()
            ->whereIn('tipo_pago', ['vale', 'refeicao'])
            ->whereBetween('data_hora', [$start, $end])
            ->selectRaw('tipo_pago as tipo, SUM(valor_total) as total')
            ->groupBy('tipo_pago');

        $this->applySaleUnitFilters($query, $unitId, $allowedUnitIds);

        $totals = [
            'vale' => 0.0,
            'refeicao' => 0.0,
        ];

        foreach ($query->get() as $row) {
            $type = $row->tipo === 'refeicao' ? 'refeicao' : 'vale';
            $totals[$type] = round((float) $row->total, 2);
        }

        return $totals;
    }

    private function applySaleUnitFilters(
        $query,
        ?int $unitId = null,
        ?Collection $allowedUnitIds = null,
        ?string $tableAlias = null
    ): void {
        $column = $tableAlias ? "{$tableAlias}.id_unidade" : 'id_unidade';

        if ($unitId) {
            $query->where($column, $unitId);

            return;
        }

        if ($allowedUnitIds instanceof Collection && $allowedUnitIds->isNotEmpty()) {
            $query->whereIn($column, $allowedUnitIds);

            return;
        }

        $query->whereRaw('1 = 0');
    }

    private function applyExpenseUnitFilters($query, ?int $unitId = null, ?Collection $allowedUnitIds = null): void
    {
        if ($unitId) {
            $query->where('unit_id', $unitId);

            return;
        }

        if ($allowedUnitIds instanceof Collection && $allowedUnitIds->isNotEmpty()) {
            $query->whereIn('unit_id', $allowedUnitIds);

            return;
        }

        $query->whereRaw('1 = 0');
    }

    private function parseFlexibleReportDate(?string $value, Carbon $fallback): Carbon
    {
        if (!$value) {
            return $fallback->copy();
        }

        foreach (['d/m/y', 'd/m/Y', 'Y-m-d'] as $format) {
            try {
                return Carbon::createFromFormat($format, $value);
            } catch (InvalidFormatException $exception) {
                continue;
            }
        }

        return $fallback->copy();
    }

    private function resolveMonthRange(?string $value): array
    {
        $fallback = Carbon::today()->startOfMonth();

        if ($value) {
            try {
                $month = Carbon::createFromFormat('Y-m', $value)->startOfMonth();
            } catch (InvalidFormatException $exception) {
                $month = $fallback->copy();
            }
        } else {
            $month = $fallback->copy();
        }

        return [
            $month->copy()->startOfMonth()->startOfDay(),
            $month->copy()->endOfMonth()->endOfDay(),
            $month->format('Y-m'),
            $month->format('m/Y'),
        ];
    }

    private function normalizeControlPaymentType(?string $value): string
    {
        $allowed = ['all', 'dinheiro', 'cartao', 'vale', 'refeicao'];

        return in_array($value, $allowed, true) ? $value : 'all';
    }

    private function buildControlStoreTotals(
        Carbon $start,
        Carbon $end,
        Collection $availableUnits,
        string $paymentType,
    ): Collection {
        $unitIds = $availableUnits->pluck('id')->filter()->values();

        if ($unitIds->isEmpty()) {
            return collect();
        }

        $totalsByUnit = $unitIds->mapWithKeys(fn (int $unitId) => [$unitId => 0.0])->all();

        if (in_array($paymentType, ['vale', 'refeicao'], true)) {
            $rows = Venda::query()
                ->where('tipo_pago', $paymentType)
                ->whereBetween('data_hora', [$start, $end])
                ->whereIn('id_unidade', $unitIds)
                ->selectRaw('id_unidade, SUM(valor_total) as total')
                ->groupBy('id_unidade')
                ->get();

            foreach ($rows as $row) {
                $unitId = (int) $row->id_unidade;
                $totalsByUnit[$unitId] = round((float) $row->total, 2);
            }
        } elseif ($paymentType === 'all') {
            $rows = $this->buildControlStorePaymentTotals($start, $end, $unitIds, 'all');
            $valeRows = Venda::query()
                ->where('tipo_pago', 'vale')
                ->whereBetween('data_hora', [$start, $end])
                ->whereIn('id_unidade', $unitIds)
                ->selectRaw('id_unidade, SUM(valor_total) as total')
                ->groupBy('id_unidade')
                ->get();

            foreach ($rows as $row) {
                $unitId = (int) $row->id_unidade;

                if ($unitId <= 0 || !array_key_exists($unitId, $totalsByUnit)) {
                    continue;
                }

                $totalsByUnit[$unitId] = round((float) $row->total, 2);
            }

            foreach ($valeRows as $row) {
                $unitId = (int) $row->id_unidade;

                if ($unitId <= 0 || !array_key_exists($unitId, $totalsByUnit)) {
                    continue;
                }

                $totalsByUnit[$unitId] = round((float) $totalsByUnit[$unitId] + (float) $row->total, 2);
            }
        } else {
            $rows = $this->buildControlStorePaymentTotals($start, $end, $unitIds, $paymentType);

            foreach ($rows as $row) {
                $unitId = (int) $row->id_unidade;

                if ($unitId <= 0 || !array_key_exists($unitId, $totalsByUnit)) {
                    continue;
                }

                $totalsByUnit[$unitId] = round((float) $row->total, 2);
            }
        }

        $rows = $availableUnits
            ->map(function (array $unit) use ($totalsByUnit) {
                $unitId = (int) $unit['id'];

                return [
                    'id' => $unitId,
                    'name' => $unit['name'],
                    'total' => round((float) ($totalsByUnit[$unitId] ?? 0), 2),
                ];
            })
            ->sortByDesc('total')
            ->values();

        $grandTotal = (float) $rows->sum('total');

        return $rows
            ->values()
            ->map(function (array $row, int $index) use ($grandTotal) {
                $row['color'] = self::UNIT_CHART_COLORS[$index % count(self::UNIT_CHART_COLORS)];
                $row['percentage'] = $grandTotal > 0
                    ? round(((float) $row['total'] / $grandTotal) * 100, 2)
                    : 0.0;

                return $row;
            })
            ->values();
    }

    private function buildControlStorePaymentTotals(
        Carbon $start,
        Carbon $end,
        Collection $unitIds,
        string $paymentType,
    ): Collection {
        $firstSaleIds = DB::table('tb3_vendas as vendas')
            ->join('tb4_vendas_pg as pagamentos_periodo', 'pagamentos_periodo.tb4_id', '=', 'vendas.tb4_id')
            ->selectRaw('vendas.tb4_id, MIN(vendas.tb3_id) as first_tb3_id')
            ->whereBetween('pagamentos_periodo.created_at', [$start, $end])
            ->whereNotNull('vendas.tb4_id')
            ->whereIn('vendas.id_unidade', $unitIds)
            ->groupBy('vendas.tb4_id');

        $cashExpression = "
            CASE
                WHEN pagamentos.tipo_pagamento IN ('dinheiro', 'dinheiro_cartao_credito', 'dinheiro_cartao_debito', 'dinheiro_pix')
                    THEN GREATEST(pagamentos.valor_total - COALESCE(pagamentos.dois_pgto, 0), 0)
                ELSE 0
            END
        ";

        $cardExpression = "
            CASE
                    WHEN pagamentos.tipo_pagamento IN ('cartao_credito', 'cartao_debito', 'pix', 'maquina')
                    THEN GREATEST(pagamentos.valor_total, 0)
                WHEN pagamentos.tipo_pagamento IN ('dinheiro', 'dinheiro_cartao_credito', 'dinheiro_cartao_debito', 'dinheiro_pix')
                    THEN GREATEST(COALESCE(pagamentos.dois_pgto, 0), 0)
                ELSE 0
            END
        ";

        $totalExpression = match ($paymentType) {
            'dinheiro' => $cashExpression,
            'cartao' => $cardExpression,
            'all' => "({$cashExpression}) + ({$cardExpression})",
            default => "({$cashExpression}) + ({$cardExpression})",
        };

        return DB::table('tb4_vendas_pg as pagamentos')
            ->joinSub($firstSaleIds, 'first_sales', function ($join) {
                $join->on('first_sales.tb4_id', '=', 'pagamentos.tb4_id');
            })
            ->join('tb3_vendas as venda_referencia', 'venda_referencia.tb3_id', '=', 'first_sales.first_tb3_id')
            ->whereBetween('pagamentos.created_at', [$start, $end])
            ->selectRaw('venda_referencia.id_unidade, SUM(' . $totalExpression . ') as total')
            ->groupBy('venda_referencia.id_unidade')
            ->get();
    }

    private function resolveDateRange(Request $request): array
    {
        $defaultStart = Carbon::today()->startOfMonth();
        $defaultEnd = Carbon::today()->endOfMonth();

        $startInput = $request->query('start_date');
        $endInput = $request->query('end_date');

        $start = $this->parseDate($startInput, 'Y-m-d', $defaultStart)->startOfDay();
        $end = $this->parseDate($endInput, 'Y-m-d', $defaultEnd)->endOfDay();

        if ($end->lt($start)) {
            $end = $start->copy()->endOfDay();
        }

        return [$start, $end, $start->toDateString(), $end->toDateString()];
    }

    private function resolveUnitPayload(int $unitId): array
    {
        if ($unitId <= 0) {
            return [
                'id' => $unitId,
                'name' => '---',
            ];
        }

        $unit = Unidade::find($unitId, ['tb2_id', 'tb2_nome']);

        return [
            'id' => $unit?->tb2_id ?? $unitId,
            'name' => $unit?->tb2_nome ?? '---',
        ];
    }

    private function resolveReportUnit(Request $request): array
    {
        $availableUnits = $this->availableUnits($request->user());
        $requestedUnitId = $request->query('unit_id', null);

        if ($requestedUnitId === null) {
            $filterUnitId = $this->resolveUnitId($request);
        } else {
            $filterUnitId =
                ($requestedUnitId !== '' && $requestedUnitId !== 'all')
                    ? (int) $requestedUnitId
                    : null;
        }

        if (! $filterUnitId) {
            $filterUnitId = null;
        }

        if ($filterUnitId && ! $availableUnits->contains(fn ($unit) => $unit['id'] === $filterUnitId)) {
            $filterUnitId = null;
        }

        $selectedUnit = $filterUnitId
            ? $availableUnits->firstWhere('id', $filterUnitId)
            : ['id' => null, 'name' => 'Todas as unidades'];

        return [$filterUnitId, $availableUnits->values(), $selectedUnit];
    }

    private function resolveReportUserId(mixed $requestedUserId): ?int
    {
        if ($requestedUserId === null || $requestedUserId === '' || $requestedUserId === 'all') {
            return null;
        }

        $userId = (int) $requestedUserId;

        return $userId > 0 ? $userId : null;
    }

    private function resolveFiscalInvoiceStatusFilter(mixed $status): string
    {
        $status = (string) ($status ?? 'all');

        return $status === 'all' || array_key_exists($status, self::FISCAL_INVOICE_STATUS_FILTERS)
            ? $status
            : 'all';
    }

    private function reportUnitIds(iterable $units): Collection
    {
        return collect($units)
            ->pluck('id')
            ->map(fn ($value) => (int) $value)
            ->filter(fn (int $value) => $value > 0)
            ->unique()
            ->values();
    }

    private function availableUnits(User $user): Collection
    {
        $units = $user->units()
            ->select('tb2_unidades.tb2_id', 'tb2_unidades.tb2_nome')
            ->where('tb2_unidades.tb2_status', 1)
            ->get();

        if ($user->tb2_id && !$units->contains('tb2_id', $user->tb2_id)) {
            $primary = Unidade::active()->find($user->tb2_id, ['tb2_id', 'tb2_nome']);
            if ($primary) {
                $units->push($primary);
            }
        }

        return $units
            ->map(fn ($unit) => [
                'id' => (int) $unit->tb2_id,
                'name' => $unit->tb2_nome,
            ])
            ->unique('id')
            ->sortBy('name')
            ->values();
    }

    private function groupExpensesByCashierUnit(
        string $referenceDate,
        ?int $filterUnitId = null,
        ?Collection $allowedUnitIds = null,
        ?int $filterCashierId = null
    ): Collection {
        $query = Expense::query()
            ->whereDate('expense_date', $referenceDate)
            ->whereNotNull('user_id');

        if ($filterUnitId) {
            $query->where('unit_id', $filterUnitId);
        } elseif ($allowedUnitIds instanceof Collection && $allowedUnitIds->isNotEmpty()) {
            $query->where(function ($subQuery) use ($allowedUnitIds) {
                $subQuery->whereIn('unit_id', $allowedUnitIds)
                    ->orWhereNull('unit_id');
            });
        }

        if ($filterCashierId) {
            $query->where('user_id', $filterCashierId);
        }

        return $query
            ->get(['user_id', 'unit_id', 'amount'])
            ->groupBy(fn (Expense $expense) => $expense->user_id . '-' . ($expense->unit_id ?? 'none'))
            ->map(fn (Collection $group) => round((float) $group->sum('amount'), 2));
    }

    private function groupExpenseDataByCashierUnit(
        string $referenceDate,
        ?int $filterUnitId = null,
        ?Collection $allowedUnitIds = null,
        ?int $filterCashierId = null
    ): Collection {
        $query = Expense::query()
            ->with([
                'supplier:id,name',
                'unit:tb2_id,tb2_nome',
                'user:id,name',
            ])
            ->whereDate('expense_date', $referenceDate)
            ->whereNotNull('user_id');

        if ($filterUnitId) {
            $query->where('unit_id', $filterUnitId);
        } elseif ($allowedUnitIds instanceof Collection && $allowedUnitIds->isNotEmpty()) {
            $query->where(function ($subQuery) use ($allowedUnitIds) {
                $subQuery->whereIn('unit_id', $allowedUnitIds)
                    ->orWhereNull('unit_id');
            });
        }

        if ($filterCashierId) {
            $query->where('user_id', $filterCashierId);
        }

        return $query
            ->orderByDesc('expense_date')
            ->orderByDesc('id')
            ->get(['id', 'supplier_id', 'unit_id', 'user_id', 'expense_date', 'amount', 'notes'])
            ->groupBy(fn (Expense $expense) => $expense->user_id . '-' . ($expense->unit_id ?? 'none'))
            ->map(function (Collection $group) {
                return [
                    'total' => round((float) $group->sum('amount'), 2),
                    'items' => $group
                        ->map(function (Expense $expense) {
                            return [
                                'id' => $expense->id,
                                'supplier' => $expense->supplier?->name ?? '---',
                                'unit_name' => $expense->unit?->tb2_nome ?? '---',
                                'user_name' => $expense->user?->name ?? '---',
                                'expense_date' => $expense->expense_date?->toDateString(),
                                'amount' => round((float) $expense->amount, 2),
                                'notes' => $expense->notes,
                            ];
                        })
                        ->values()
                        ->all(),
                ];
            });
    }

}
