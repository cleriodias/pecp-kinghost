<?php

namespace App\Http\Controllers;

use App\Models\CashierClosure;
use App\Models\ChatMessage;
use App\Models\ConfiguracaoFiscal;
use App\Models\NotaFiscal;
use App\Models\Produto;
use App\Models\Unidade;
use App\Models\User;
use App\Models\Venda;
use App\Models\VendaPagamento;
use App\Support\FiscalInvoicePreparationService;
use App\Support\FiscalNfceTransmissionService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use RuntimeException;

class SaleController extends Controller
{
    private const SYSTEM_EMAIL = 'sistema.chat@pec.local';

    public function openComandas(Request $request): JsonResponse
    {
        return response()->json($this->buildOpenComandasPayload($request));
    }

    public function restrictions(Request $request): JsonResponse
    {
        return response()->json($this->buildRestrictionsPayload($request));
    }

    public function dashboardStatus(Request $request): JsonResponse
    {
        return response()->json([
            ...$this->buildOpenComandasPayload($request),
            ...$this->buildRestrictionsPayload($request),
        ]);
    }

    public function comandaItems(Request $request, int $codigo): JsonResponse
    {
        $items = $this->getComandaItems($codigo, $this->resolveActiveUnitId($request));

        return response()->json(['items' => $items]);
    }

    public function store(Request $request, FiscalInvoicePreparationService $fiscalInvoicePreparationService): JsonResponse
    {
        $user = $request->user();
        $unit = $request->session()->get('active_unit');

        if (! $user || (int) $user->funcao !== 3) {
            throw ValidationException::withMessages([
                'items' => 'Apenas o perfil Caixa pode fazer lancamentos. Troque o perfil atual para Caixa para continuar.',
            ]);
        }

        if (! $unit) {
            throw ValidationException::withMessages([
                'unit' => 'Selecione uma unidade para registrar as vendas.',
            ]);
        }

        $unitId = $this->resolveActiveUnitId($request);
        $unitName = is_array($unit)
            ? ($unit['name'] ?? $unit['tb2_nome'] ?? null)
            : (is_object($unit) ? ($unit->name ?? $unit->tb2_nome ?? null) : null);
        $unitAddress = is_array($unit)
            ? ($unit['address'] ?? $unit['tb2_endereco'] ?? null)
            : (is_object($unit) ? ($unit->address ?? $unit->tb2_endereco ?? null) : null);
        $unitCnpj = is_array($unit)
            ? ($unit['cnpj'] ?? $unit['tb2_cnpj'] ?? null)
            : (is_object($unit) ? ($unit->cnpj ?? $unit->tb2_cnpj ?? null) : null);

        if ($unitId && (! $unitName || ! $unitAddress || ! $unitCnpj)) {
            $unitRecord = Unidade::select('tb2_id', 'tb2_nome', 'tb2_endereco', 'tb2_cnpj')->find($unitId);
            if ($unitRecord) {
                $unitName = $unitName ?? $unitRecord->tb2_nome;
                $unitAddress = $unitAddress ?? $unitRecord->tb2_endereco;
                $unitCnpj = $unitCnpj ?? $unitRecord->tb2_cnpj;
            }
        }

        $validated = $request->validate([
            'items' => ['array'],
            'items.*.product_id' => ['required_with:items', 'integer', 'exists:tb1_produto,tb1_id'],
            'items.*.quantity' => ['required_with:items', 'integer', 'min:1', 'max:1000'],
            'items.*.barcode' => ['nullable', 'string', 'max:64'],
            'items.*.unit_price' => ['nullable', 'numeric', 'min:0'],
            'tipo_pago' => [
                'required',
                'string',
                Rule::in(['cartao_credito', 'cartao_debito', 'pix', 'maquina', 'dinheiro', 'vale', 'refeicao', 'faturar']),
            ],
            'vale_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'valor_pago' => ['nullable', 'numeric', 'min:0'],
            'vale_type' => ['nullable', 'string', Rule::in(['vale', 'refeicao'])],
            'card_type' => ['nullable', 'string', Rule::in(['cartao_credito', 'cartao_debito', 'pix'])],
            'comanda_codigo' => ['nullable', 'integer', 'between:3000,3100'],
        ]);

        $comandaCodigo = $validated['comanda_codigo'] ?? null;
        $isComandaSale = $comandaCodigo !== null;
        $releaseComandaLock = $comandaCodigo !== null
            ? $this->tryAcquireComandaLock($unitId, $comandaCodigo, 5)
            : static fn () => null;

        if ($comandaCodigo !== null && $releaseComandaLock === null) {
            throw ValidationException::withMessages([
                'comanda_codigo' => 'A comanda esta sendo alterada na lanchonete. Aguarde alguns segundos e tente novamente.',
            ]);
        }

        try {
            $pendingComandas = [];
            $requiresClosure = false;
            $isPendingComanda = false;
            if ((int) $user->funcao === 3) {
                $restrictions = $this->resolveCashierRestrictions($user, $unit);
                $pendingComandas = $restrictions['pending_comandas'];
                $requiresClosure = $restrictions['requires_closure'];

                if (! empty($pendingComandas)) {
                    if (! $comandaCodigo || ! in_array($comandaCodigo, $pendingComandas, true)) {
                        throw ValidationException::withMessages([
                            'comanda_codigo' => 'Ha comanda pendente de dia anterior. Receba apenas a comanda pendente antes de novas vendas.',
                        ]);
                    }
                    $isPendingComanda = true;
                }

                if ($requiresClosure && ! $isComandaSale) {
                    throw ValidationException::withMessages([
                        'items' => 'Existe fechamento pendente de caixa. Receba uma comanda em aberto antes de registrar novas vendas.',
                    ]);
                }
            }

            $selectedValeType = $validated['vale_type'] ?? 'vale';
            $requestedPaymentType = (string) $validated['tipo_pago'];
            $salePaymentType = $this->normalizeSalePaymentType($requestedPaymentType);

            if ($salePaymentType === 'vale' && $selectedValeType === 'refeicao') {
                $salePaymentType = 'refeicao';
            }

            if ($salePaymentType === 'refeicao') {
                $selectedValeType = 'refeicao';
            }

            $isValePayment = in_array($salePaymentType, ['vale', 'refeicao'], true);

            if ($isValePayment && empty($validated['vale_user_id'])) {
                throw ValidationException::withMessages([
                    'vale_user_id' => 'Selecione o colaborador responsavel pelo vale.',
                ]);
            }

            if ($validated['tipo_pago'] === 'vale' && empty($validated['vale_type'])) {
                throw ValidationException::withMessages([
                    'vale_type' => 'Selecione se o vale e Refeicao ou Vale tradicional.',
                ]);
            }

            $groupedItems = [];
            foreach (($validated['items'] ?? []) as $item) {
                $productId = (int) $item['product_id'];
                $quantity = (int) $item['quantity'];
                $barcode = trim((string) ($item['barcode'] ?? ''));
                $weightedBarcode = $barcode !== '' ? $this->parseWeightedBarcode($barcode) : null;
                $explicitUnitPrice = $comandaCodigo !== null && array_key_exists('unit_price', $item)
                    ? round((float) $item['unit_price'], 2)
                    : null;

                if ($barcode !== '' && $weightedBarcode === null) {
                    throw ValidationException::withMessages([
                        'items' => 'Codigo de barras da balanca invalido.',
                    ]);
                }

                if ($weightedBarcode !== null && $weightedBarcode['product_id'] !== $productId) {
                    throw ValidationException::withMessages([
                        'items' => 'O codigo de barras da balanca nao corresponde ao produto informado.',
                    ]);
                }

                $unitPrice = $weightedBarcode['unit_price'] ?? $explicitUnitPrice;
                $itemKey = $this->buildSaleItemKey($productId, $unitPrice);

                if (! isset($groupedItems[$itemKey])) {
                    $groupedItems[$itemKey] = [
                        'product_id' => $productId,
                        'quantity' => 0,
                        'unit_price' => $unitPrice,
                    ];
                }

                $groupedItems[$itemKey]['quantity'] += $quantity;
            }

            $dateTime = now();
            $monthStart = $dateTime->copy()->startOfMonth();
            $monthEnd = $dateTime->copy()->endOfMonth();
            $isPaid = in_array($salePaymentType, ['maquina', 'dinheiro'], true);
            $valeUserId = $isValePayment ? $validated['vale_user_id'] : null;
            $valeUserName = null;
            $valeUser = null;

            if ($valeUserId) {
                $valeUser = User::select('id', 'name', 'vr_cred', 'tb2_id')->find($valeUserId);
                $valeUserName = $valeUser?->name;
            }

            if ($isValePayment && (! $valeUser || ! $this->userBelongsToUnit($valeUser, $unitId))) {
                throw ValidationException::withMessages([
                    'vale_user_id' => 'Selecione um colaborador da loja atual para o vale.',
                ]);
            }

            $itemsPayload = [];
            $requiresVrEligible = $salePaymentType === 'refeicao';
            $extraItems = [];
            $comandaItems = collect();

            if ($comandaCodigo) {
                $comandaItems = Venda::query()
                    ->where('id_comanda', $comandaCodigo)
                    ->where('id_unidade', $unitId)
                    ->where('status', 0)
                    ->get([
                        'tb1_id',
                        'produto_nome',
                        'valor_unitario',
                        'quantidade',
                    ]);

                if ($comandaItems->isEmpty()) {
                    throw ValidationException::withMessages([
                        'comanda_codigo' => 'Comanda informada nao possui itens em aberto.',
                    ]);
                }

                $comandaPayload = $comandaItems
                    ->groupBy(fn ($item) => $this->buildSaleItemKey(
                        (int) $item->tb1_id,
                        (float) $item->valor_unitario,
                    ))
                    ->map(function ($group) {
                        $first = $group->first();
                        $quantity = $group->sum('quantidade');
                        $unitPrice = (float) $first->valor_unitario;

                        return [
                            'product_id' => $first->tb1_id,
                            'product_name' => $first->produto_nome,
                            'unit_price' => $unitPrice,
                            'quantity' => $quantity,
                            'subtotal' => $quantity * $unitPrice,
                        ];
                    });

                $finalItemsMap = $comandaPayload->map(fn ($item) => $item)->all();

                if (! empty($groupedItems)) {
                    $products = Produto::query()
                        ->whereIn('tb1_id', array_values(array_unique(array_map(
                            fn (array $item) => $item['product_id'],
                            $groupedItems
                        ))))
                        ->get(['tb1_id', 'tb1_nome', 'tb1_vlr_venda', 'tb1_vr_credit'])
                        ->keyBy('tb1_id');

                    foreach ($groupedItems as $itemKey => $requestedItem) {
                        $productId = (int) $requestedItem['product_id'];
                        $requestedQuantity = (int) $requestedItem['quantity'];
                        $existingItem = $comandaPayload->get($itemKey);
                        $existingQuantity = $existingItem ? (int) $existingItem['quantity'] : 0;

                        if ($requestedQuantity < $existingQuantity) {
                            throw ValidationException::withMessages([
                                'items' => 'Nao e possivel reduzir itens da comanda no fechamento.',
                            ]);
                        }

                        if ($existingItem) {
                            if ($requestedQuantity > $existingQuantity) {
                                $extraQuantity = $requestedQuantity - $existingQuantity;
                                $unitPrice = (float) $existingItem['unit_price'];
                                $extraItems[] = [
                                    'product_id' => $existingItem['product_id'],
                                    'product_name' => $existingItem['product_name'],
                                    'unit_price' => $unitPrice,
                                    'quantity' => $extraQuantity,
                                    'subtotal' => round($unitPrice * $extraQuantity, 2),
                                ];

                                $finalItemsMap[$itemKey]['quantity'] = $requestedQuantity;
                                $finalItemsMap[$itemKey]['subtotal'] = round($unitPrice * $requestedQuantity, 2);
                            }
                        } else {
                            $product = $products->get($productId);

                            if (! $product) {
                                continue;
                            }

                            $unitPrice = $requestedItem['unit_price'] !== null
                                ? (float) $requestedItem['unit_price']
                                : (float) $product->tb1_vlr_venda;
                            $total = round($unitPrice * $requestedQuantity, 2);
                            $finalItemsMap[$itemKey] = [
                                'product_id' => $product->tb1_id,
                                'product_name' => $product->tb1_nome,
                                'unit_price' => $unitPrice,
                                'quantity' => $requestedQuantity,
                                'subtotal' => $total,
                            ];
                            $extraItems[] = [
                                'product_id' => $product->tb1_id,
                                'product_name' => $product->tb1_nome,
                                'unit_price' => $unitPrice,
                                'quantity' => $requestedQuantity,
                                'subtotal' => $total,
                            ];
                        }
                    }
                }

                $itemsPayload = $this->collapseSaleItems(array_values($finalItemsMap));

                if ($requiresVrEligible) {
                    $eligibility = Produto::query()
                        ->whereIn('tb1_id', array_column($itemsPayload, 'product_id'))
                        ->pluck('tb1_vr_credit', 'tb1_id');

                    foreach ($itemsPayload as $payload) {
                        $isEligible = (bool) ($eligibility[$payload['product_id']] ?? false);
                        if (! $isEligible) {
                            throw ValidationException::withMessages([
                                'comanda_codigo' => sprintf('O produto %s nao esta liberado para VR Credito.', $payload['product_name']),
                            ]);
                        }
                    }
                }
            } else {
                if (empty($groupedItems)) {
                    throw ValidationException::withMessages([
                        'items' => 'Informe ao menos um item ou selecione uma comanda.',
                    ]);
                }

                $products = Produto::query()
                    ->whereIn('tb1_id', array_values(array_unique(array_map(
                        fn (array $item) => (int) $item['product_id'],
                        $groupedItems
                    ))))
                    ->get(['tb1_id', 'tb1_nome', 'tb1_vlr_venda', 'tb1_vr_credit'])
                    ->keyBy('tb1_id');

                foreach ($groupedItems as $groupedItem) {
                    $productId = (int) $groupedItem['product_id'];
                    $quantity = (int) $groupedItem['quantity'];
                    $product = $products->get($productId);

                    if (! $product) {
                        throw ValidationException::withMessages([
                            'items' => 'Um dos produtos informados nao foi encontrado.',
                        ]);
                    }

                    if ($requiresVrEligible && ! $product->tb1_vr_credit) {
                        throw ValidationException::withMessages([
                            'items' => sprintf('O produto %s nAo estA? liberado para VR CrA(c)dito.', $product->tb1_nome),
                        ]);
                    }
                    $unitPrice = $groupedItem['unit_price'] !== null
                        ? (float) $groupedItem['unit_price']
                        : (float) $product->tb1_vlr_venda;
                    $total = round($unitPrice * $quantity, 2);

                    $itemsPayload[] = [
                        'product_id' => $product->tb1_id,
                        'product_name' => $product->tb1_nome,
                        'unit_price' => $unitPrice,
                        'quantity' => $quantity,
                        'subtotal' => $total,
                    ];
                }

                $itemsPayload = $this->collapseSaleItems($itemsPayload);
            }

            $totalValue = collect($itemsPayload)->sum('subtotal');
            $valorPago = isset($validated['valor_pago']) ? (float) $validated['valor_pago'] : null;

            if ($salePaymentType === 'refeicao' && $valeUserId) {
                if (! $valeUser) {
                    throw ValidationException::withMessages([
                        'vale_user_id' => 'Colaborador selecionado nao foi encontrado.',
                    ]);
                }

                $monthlyUsage = Venda::query()
                    ->where('tipo_pago', 'refeicao')
                    ->where('id_user_vale', $valeUserId)
                    ->whereBetween('data_hora', [$monthStart, $monthEnd])
                    ->sum('valor_total');

                $availableBalance = max(0, (float) $valeUser->vr_cred - (float) $monthlyUsage);

                if ($totalValue > $availableBalance) {
                    throw ValidationException::withMessages([
                        'vale_user_id' => sprintf(
                            'Saldo de refeicao insuficiente para %s. Disponivel: R$ %s',
                            $valeUser->name,
                            number_format($availableBalance, 2, ',', '.')
                        ),
                    ]);
                }

                $dailyLimit = $this->resolveRefeicaoDailyLimit($dateTime);
                $dailyUsage = (float) Venda::query()
                    ->where('tipo_pago', 'refeicao')
                    ->where('id_user_vale', $valeUserId)
                    ->whereBetween('data_hora', [
                        $dateTime->copy()->startOfDay(),
                        $dateTime->copy()->endOfDay(),
                    ])
                    ->sum('valor_total');
                $dailyRemaining = max(0, $dailyLimit - $dailyUsage);

                if ($totalValue > $dailyRemaining) {
                    throw ValidationException::withMessages([
                        'vale_user_id' => $this->buildRefeicaoDailyLimitMessage(
                            $valeUser->name,
                            $dailyLimit,
                            $dailyUsage,
                            $dailyRemaining
                        ),
                    ]);
                }
            }

            if ($salePaymentType === 'dinheiro' && ($valorPago === null || $valorPago <= 0)) {
                throw ValidationException::withMessages([
                    'valor_pago' => 'Informe o valor recebido em dinheiro.',
                ]);
            }

            if ($salePaymentType !== 'dinheiro') {
                $valorPago = null;
            }

            $troco = 0;
            $cardComplement = 0;
            if ($salePaymentType === 'dinheiro' && $valorPago !== null) {
                if ($valorPago >= $totalValue) {
                    $troco = round($valorPago - $totalValue, 2);
                } else {
                    $cardComplement = round($totalValue - $valorPago, 2);
                }
            }

            $selectedCardType = isset($validated['card_type']) ? (string) $validated['card_type'] : null;

            if ($requestedPaymentType === 'dinheiro' && $cardComplement > 0 && ! $this->isComplementPaymentType($selectedCardType)) {
                throw ValidationException::withMessages([
                    'card_type' => 'Selecione se o restante sera no credito, no debito ou no Pix.',
                ]);
            }

            $storedPaymentType = $this->resolveStoredPaymentType(
                $requestedPaymentType,
                $salePaymentType,
                $cardComplement,
                $selectedCardType,
            );

            $payment = DB::transaction(function () use (
                $cardComplement,
                $comandaCodigo,
                $comandaItems,
                $dateTime,
                $extraItems,
                $isPaid,
                $itemsPayload,
                $salePaymentType,
                $storedPaymentType,
                $totalValue,
                $troco,
                $unitId,
                $user,
                $valeUserId,
                $valorPago,
            ) {
                $payment = VendaPagamento::create([
                    'valor_total' => $totalValue,
                    'tipo_pagamento' => $storedPaymentType,
                    'valor_pago' => $valorPago,
                    'troco' => $troco,
                    'dois_pgto' => $cardComplement,
                ]);

                if ($comandaCodigo) {
                    $expectedOpenRows = $comandaItems->count();
                    $updatedRows = Venda::query()
                        ->where('id_comanda', $comandaCodigo)
                        ->where('id_unidade', $unitId)
                        ->where('status', 0)
                        ->update([
                            'tb4_id' => $payment->tb4_id,
                            'id_user_caixa' => $user->id,
                            'id_user_vale' => $valeUserId,
                            'tipo_pago' => $salePaymentType,
                            'status_pago' => $isPaid,
                            'status' => 1,
                            'data_hora' => $dateTime,
                        ]);

                    if ($updatedRows !== $expectedOpenRows) {
                        throw new RuntimeException('A comanda mudou durante o recebimento e a baixa foi cancelada.');
                    }

                    foreach ($extraItems as $item) {
                        Venda::create([
                            'tb4_id' => $payment->tb4_id,
                            'tb1_id' => $item['product_id'],
                            'id_comanda' => $comandaCodigo,
                            'produto_nome' => $item['product_name'],
                            'valor_unitario' => $item['unit_price'],
                            'quantidade' => $item['quantity'],
                            'valor_total' => $item['subtotal'],
                            'data_hora' => $dateTime,
                            'id_user_caixa' => $user->id,
                            'id_user_vale' => $valeUserId,
                            'id_lanc' => $user->id,
                            'id_unidade' => $unitId,
                            'tipo_pago' => $salePaymentType,
                            'status_pago' => $isPaid,
                            'status' => 1,
                        ]);
                    }

                    return $payment;
                }

                foreach ($itemsPayload as $item) {
                    Venda::create([
                        'tb4_id' => $payment->tb4_id,
                        'tb1_id' => $item['product_id'],
                        'produto_nome' => $item['product_name'],
                        'valor_unitario' => $item['unit_price'],
                        'quantidade' => $item['quantity'],
                        'valor_total' => $item['subtotal'],
                        'data_hora' => $dateTime,
                        'id_user_caixa' => $user->id,
                        'id_user_vale' => $valeUserId,
                        'id_unidade' => $unitId,
                        'tipo_pago' => $salePaymentType,
                        'status_pago' => $isPaid,
                        'status' => 1,
                    ]);
                }

                return $payment;
            });

            $invoice = $fiscalInvoicePreparationService->prepareForPayment($payment);
            $manualFiscalAvailable = ! $invoice
                && $this->canManuallySignAndTransmitFiscal($unitId, $storedPaymentType);

            $receiptItems = array_map(
                static function (array $item) use ($comandaCodigo): array {
                    if ($comandaCodigo === null) {
                        return $item;
                    }

                    $item['comanda'] = $comandaCodigo;

                    return $item;
                },
                $itemsPayload
            );

            return response()->json([
                'sale' => [
                    'id' => $payment->tb4_id,
                    'comanda' => $comandaCodigo,
                    'items' => $receiptItems,
                    'total' => $totalValue,
                    'date_time' => $dateTime->toIso8601String(),
                    'tipo_pago' => $storedPaymentType,
                    'status_pago' => $isPaid,
                    'cashier_name' => $user->name,
                    'unit_name' => $unitName,
                    'unit_address' => $unitAddress,
                    'unit_cnpj' => $unitCnpj,
                    'vale_user_name' => $valeUserName,
                    'vale_type' => $isValePayment ? $selectedValeType : null,
                    'payment' => [
                        'id' => $payment->tb4_id,
                        'valor_total' => $payment->valor_total,
                        'valor_pago' => $payment->valor_pago,
                        'troco' => $payment->troco,
                        'dois_pgto' => $payment->dois_pgto,
                        'tipo_pagamento' => $payment->tipo_pagamento,
                    ],
                    'fiscal' => $this->buildFiscalSummary($invoice),
                    'can_manual_fiscal_transmit' => $manualFiscalAvailable,
                ],
            ]);
        } catch (RuntimeException $exception) {
            throw ValidationException::withMessages([
                'comanda_codigo' => $exception->getMessage(),
            ]);
        } finally {
            $releaseComandaLock();
        }
    }

    public function signAndTransmitFiscalPayment(
        Request $request,
        VendaPagamento $payment,
        FiscalInvoicePreparationService $fiscalInvoicePreparationService,
        FiscalNfceTransmissionService $fiscalNfceTransmissionService,
    ): JsonResponse {
        $user = $request->user();
        $activeUnitId = $this->resolveActiveUnitId($request);

        if (! $user) {
            abort(403, 'Acesso negado.');
        }

        if (! in_array((int) $user->funcao, [0, 1, 3], true)) {
            abort(403, 'Acesso negado.');
        }

        $payment->loadMissing(['notaFiscal', 'vendas.produto', 'vendas.unidade']);
        $paymentUnitId = (int) ($payment->vendas->first()?->id_unidade ?? 0);

        if ($activeUnitId === null || $paymentUnitId !== $activeUnitId) {
            abort(403, 'A venda nao pertence a loja ativa do caixa.');
        }

        if (! $this->canManuallySignAndTransmitFiscal($paymentUnitId, $payment->tipo_pagamento)) {
            return response()->json([
                'message' => 'A geracao manual esta disponivel apenas para vendas fiscais quando a geracao automatica da loja estiver desligada.',
                'fiscal' => $this->buildFiscalSummary($payment->notaFiscal),
            ], 422);
        }

        try {
            $invoice = $fiscalInvoicePreparationService->prepareForPayment($payment, force: true);

            if (! $invoice) {
                return response()->json([
                    'message' => 'Nao foi possivel preparar a nota fiscal desta venda.',
                    'fiscal' => null,
                ], 422);
            }

            if (! filled($invoice->tb27_xml_envio)) {
                return response()->json([
                    'message' => $invoice->tb27_mensagem ?: 'A nota foi criada com erro e ficou disponivel em settings/nfe > Com erro para correcao e regeneracao.',
                    'fiscal' => $this->buildFiscalSummary($invoice),
                ], 422);
            }

            $invoice = $fiscalNfceTransmissionService->transmit($invoice);
        } catch (RuntimeException $exception) {
            $payment->load('notaFiscal');

            return response()->json([
                'message' => $exception->getMessage(),
                'fiscal' => $this->buildFiscalSummary($payment->notaFiscal),
            ], 422);
        }

        return response()->json([
            'message' => sprintf('Nota fiscal da venda %d assinada e transmitida para a SEFAZ.', (int) $payment->tb4_id),
            'fiscal' => $this->buildFiscalSummary($invoice),
        ]);
    }

    public function transmitFiscalInvoice(
        Request $request,
        NotaFiscal $notaFiscal,
        FiscalInvoicePreparationService $fiscalInvoicePreparationService,
        FiscalNfceTransmissionService $fiscalNfceTransmissionService,
    ): JsonResponse {
        $user = $request->user();
        $activeUnitId = $this->resolveActiveUnitId($request);

        if (! $user) {
            abort(403, 'Acesso negado.');
        }

        if ($activeUnitId === null || (int) $notaFiscal->tb2_id !== $activeUnitId) {
            abort(403, 'A nota fiscal nao pertence a loja ativa do caixa.');
        }

        if (! in_array((int) $user->funcao, [0, 1, 3], true)) {
            abort(403, 'Acesso negado.');
        }

        try {
            $notaFiscal->loadMissing('pagamento.vendas.produto', 'pagamento.vendas.unidade');

            if (! $notaFiscal->pagamento) {
                return response()->json([
                    'message' => 'Nao foi encontrado o pagamento vinculado a esta nota fiscal.',
                    'fiscal' => $this->buildFiscalSummary($notaFiscal),
                ], 422);
            }

            $refreshedInvoice = $fiscalInvoicePreparationService->prepareForPayment($notaFiscal->pagamento);

            if (! $refreshedInvoice) {
                return response()->json([
                    'message' => 'Esta forma de pagamento nao gera nota fiscal automatica para transmissao.',
                    'fiscal' => $this->buildFiscalSummary($notaFiscal),
                ], 422);
            }

            if (! filled($refreshedInvoice->tb27_xml_envio)) {
                return response()->json([
                    'message' => $refreshedInvoice->tb27_mensagem ?: 'A nota ainda nao possui XML assinado para transmissao.',
                    'fiscal' => $this->buildFiscalSummary($refreshedInvoice),
                ], 422);
            }

            $notaFiscal = $fiscalNfceTransmissionService->transmit($refreshedInvoice);
        } catch (\RuntimeException $exception) {
            $notaFiscal->refresh();

            return response()->json([
                'message' => $exception->getMessage(),
                'fiscal' => $this->buildFiscalSummary($notaFiscal),
            ], 422);
        }

        return response()->json([
            'message' => sprintf('Nota fiscal da venda %d enviada para a SEFAZ.', (int) $notaFiscal->tb4_id),
            'fiscal' => $this->buildFiscalSummary($notaFiscal),
        ]);
    }

    private function canManuallySignAndTransmitFiscal(?int $unitId, ?string $paymentType): bool
    {
        if (! $unitId || ! in_array((string) $paymentType, [
            'dinheiro',
            'cartao_credito',
            'cartao_debito',
            'pix',
            'dinheiro_cartao_credito',
            'dinheiro_cartao_debito',
            'dinheiro_pix',
            'maquina',
        ], true)) {
            return false;
        }

        $configuration = ConfiguracaoFiscal::query()
            ->where('tb2_id', $unitId)
            ->first(['tb26_id', 'tb26_geracao_automatica_ativa', 'tb26_emitir_nfce']);

        return (bool) $configuration
            && ! (bool) $configuration->tb26_geracao_automatica_ativa
            && (bool) $configuration->tb26_emitir_nfce;
    }

    public function updateConsumerFiscalInvoice(
        Request $request,
        NotaFiscal $notaFiscal,
        FiscalInvoicePreparationService $fiscalInvoicePreparationService,
    ): JsonResponse {
        $user = $request->user();
        $activeUnitId = $this->resolveActiveUnitId($request);

        if (! $user) {
            abort(403, 'Acesso negado.');
        }

        if ($activeUnitId === null || (int) $notaFiscal->tb2_id !== $activeUnitId) {
            abort(403, 'A nota fiscal nao pertence a loja ativa do caixa.');
        }

        if (! in_array((int) $user->funcao, [0, 1, 3], true)) {
            abort(403, 'Acesso negado.');
        }

        $validated = $request->validate([
            'consumer.type' => ['required', 'string', Rule::in(['cupom_fiscal', 'consumidor'])],
            'consumer.name' => ['nullable', 'string', 'max:60'],
            'consumer.document' => ['required', 'string', 'max:18'],
            'consumer.cep' => ['nullable', 'string', 'max:9'],
            'consumer.street' => ['nullable', 'string', 'max:60'],
            'consumer.number' => ['nullable', 'string', 'max:20'],
            'consumer.complement' => ['nullable', 'string', 'max:60'],
            'consumer.neighborhood' => ['nullable', 'string', 'max:60'],
            'consumer.city' => ['nullable', 'string', 'max:60'],
            'consumer.city_code' => ['nullable', 'string', 'max:7'],
            'consumer.state' => ['nullable', 'string', 'size:2'],
        ]);

        try {
            $notaFiscal->loadMissing('pagamento.vendas.produto', 'pagamento.vendas.unidade');

            if (! $notaFiscal->pagamento) {
                return response()->json([
                    'message' => 'Nao foi encontrado o pagamento vinculado a esta nota fiscal.',
                    'fiscal' => $this->buildFiscalSummary($notaFiscal),
                ], 422);
            }

            if (in_array((string) $notaFiscal->tb27_status, ['emitida', 'cancelada'], true)) {
                return response()->json([
                    'message' => 'A nota fiscal ja foi finalizada e nao pode mais trocar o tipo de identificacao do consumidor.',
                    'fiscal' => $this->buildFiscalSummary($notaFiscal),
                ], 422);
            }

            $consumer = $this->normalizeFiscalConsumerInput($validated['consumer']);
            $notaFiscal = $fiscalInvoicePreparationService->prepareForPayment($notaFiscal->pagamento, $consumer);
        } catch (\RuntimeException $exception) {
            $notaFiscal->refresh();

            return response()->json([
                'message' => $exception->getMessage(),
                'fiscal' => $this->buildFiscalSummary($notaFiscal),
            ], 422);
        }

        return response()->json([
            'message' => sprintf(
                '%s preparado para a venda %d.',
                $consumer['type'] === 'cupom_fiscal' ? 'Cupom fiscal' : 'NF Consumidor',
                (int) $notaFiscal->tb4_id
            ),
            'fiscal' => $this->buildFiscalSummary($notaFiscal),
        ]);
    }

    public function addComandaItem(Request $request, int $codigo): JsonResponse
    {
        $unitId = $this->resolveActiveUnitId($request);

        $validated = $request->validate([
            'product_id' => ['required', 'integer', 'exists:tb1_produto,tb1_id'],
            'quantity' => ['nullable', 'integer', 'min:1', 'max:1000'],
            'barcode' => ['nullable', 'string', 'max:64'],
            'unit_price' => ['nullable', 'numeric', 'min:0'],
            'access_user_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        if ($codigo < 3000 || $codigo > 3100) {
            return response()->json(['message' => 'Codigo de comanda invalido (3000-3100).'], 422);
        }

        $releaseComandaLock = $this->tryAcquireComandaLock($unitId, $codigo, 0);

        if ($releaseComandaLock === null) {
            return response()->json([
                'message' => 'A comanda esta em recebimento no caixa. Aguarde a finalizacao e recarregue.',
            ], 409);
        }

        try {

            $product = Produto::select('tb1_id', 'tb1_nome', 'tb1_vlr_venda')->findOrFail($validated['product_id']);
            $quantity = (int) ($validated['quantity'] ?? 1);
            $barcode = trim((string) ($validated['barcode'] ?? ''));
            $weightedBarcode = $barcode !== '' ? $this->parseWeightedBarcode($barcode) : null;

            if ($barcode !== '' && $weightedBarcode === null) {
                return response()->json(['message' => 'Codigo de barras da balanca invalido.'], 422);
            }

            if ($weightedBarcode !== null && $weightedBarcode['product_id'] !== (int) $product->tb1_id) {
                return response()->json([
                    'message' => 'O codigo de barras da balanca nao corresponde ao produto informado.',
                ], 422);
            }

            $explicitUnitPrice = array_key_exists('unit_price', $validated) && $validated['unit_price'] !== null
                ? round((float) $validated['unit_price'], 2)
                : null;
            $price = (float) ($weightedBarcode['unit_price'] ?? $explicitUnitPrice ?? $product->tb1_vlr_venda);
            $total = round($price * $quantity, 2);

            // Mantem um registro por produto/preco/comanda em aberto.
            $existing = Venda::query()
                ->where('id_comanda', $codigo)
                ->where('id_unidade', $unitId)
                ->where('tb1_id', $product->tb1_id)
                ->where('valor_unitario', $price)
                ->where('status', 0)
                ->first();

            if ($existing) {
                $newQuantity = $existing->quantidade + $quantity;
                $existing->update([
                    'quantidade' => $newQuantity,
                    'valor_total' => round($price * $newQuantity, 2),
                    'data_hora' => now(),
                    'id_lanc' => $validated['access_user_id'],
                    'id_user_caixa' => null,
                ]);
            } else {
                Venda::create([
                    'tb1_id' => $product->tb1_id,
                    'id_comanda' => $codigo,
                    'produto_nome' => $product->tb1_nome,
                    'valor_unitario' => $price,
                    'quantidade' => $quantity,
                    'valor_total' => $total,
                    'data_hora' => now(),
                    'id_user_caixa' => null,
                    'id_user_vale' => null,
                    'id_lanc' => $validated['access_user_id'],
                    'id_unidade' => $unitId,
                    'tipo_pago' => 'faturar',
                    'status_pago' => false,
                    'status' => 0,
                ]);
            }

            $items = $this->getComandaItems($codigo, $unitId);

            return response()->json([
                'items' => $items,
            ]);
        } finally {
            $releaseComandaLock();
        }
    }

    public function updateComandaItem(Request $request, int $codigo, string $lineKey): JsonResponse
    {
        $unitId = $this->resolveActiveUnitId($request);
        $validated = $request->validate([
            'quantity' => ['required', 'integer', 'min:0', 'max:1000'],
            'access_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'removal_reason' => ['nullable', 'string', 'max:1000'],
        ]);

        $lineData = $this->parseSaleItemKey($lineKey);

        if ($lineData === null) {
            return response()->json(['message' => 'Item invalido na comanda.'], 422);
        }

        $releaseComandaLock = $this->tryAcquireComandaLock($unitId, $codigo, 0);

        if ($releaseComandaLock === null) {
            return response()->json([
                'message' => 'A comanda esta em recebimento no caixa. Aguarde a finalizacao e recarregue.',
            ], 409);
        }

        try {

            $record = Venda::query()
                ->where('id_comanda', $codigo)
                ->where('id_unidade', $unitId)
                ->where('tb1_id', $lineData['product_id'])
                ->where('valor_unitario', $lineData['unit_price'])
                ->where('status', 0)
                ->first();

            if (! $record) {
                return response()->json(['message' => 'Item nao encontrado na comanda.'], 404);
            }

            if ($validated['quantity'] === 0) {
                $removalReason = trim((string) ($validated['removal_reason'] ?? ''));

                if ($removalReason === '') {
                    throw ValidationException::withMessages([
                        'removal_reason' => 'Informe o motivo da remocao do item.',
                    ]);
                }

                $executor = $this->resolveRemovalExecutor($validated['access_user_id'] ?? null, $request->user());
                $removedAt = now();

                $this->notifyComandaItemRemoval(
                    unitId: $unitId,
                    executor: $executor,
                    record: $record,
                    removalReason: $removalReason,
                    removedAt: $removedAt,
                );

                $record->delete();
            } else {
                $record->update([
                    'quantidade' => $validated['quantity'],
                    'valor_total' => round($record->valor_unitario * $validated['quantity'], 2),
                    'data_hora' => now(),
                    'id_lanc' => $validated['access_user_id'] ?? $record->id_lanc,
                    'id_user_caixa' => null,
                ]);
            }

            $items = $this->getComandaItems($codigo, $unitId);

            return response()->json(['items' => $items]);
        } finally {
            $releaseComandaLock();
        }
    }

    private function resolveCashierRestrictions(User $user, $unit): array
    {
        $unitId = is_array($unit)
            ? ($unit['id'] ?? $unit['tb2_id'] ?? null)
            : (is_object($unit) ? ($unit->id ?? $unit->tb2_id ?? null) : null);
        $unitId = $unitId ?? ($user?->tb2_id);

        if (! $unitId) {
            return [
                'unit_id' => null,
                'pending_comandas' => [],
                'pending_closure_date' => null,
                'requires_closure' => false,
            ];
        }

        $today = Carbon::today();
        $pendingComandas = Venda::query()
            ->whereNotNull('id_comanda')
            ->whereBetween('id_comanda', [3000, 3100])
            ->where('status', 0)
            ->where('id_unidade', $unitId)
            ->whereDate('data_hora', '<', $today)
            ->pluck('id_comanda')
            ->unique()
            ->values()
            ->map(fn ($value) => (int) $value)
            ->all();

        $pendingClosureDate = $this->resolvePendingClosureDate($user, $unitId, $today);

        return [
            'unit_id' => $unitId,
            'pending_comandas' => $pendingComandas,
            'pending_closure_date' => $pendingClosureDate ? $pendingClosureDate->toDateString() : null,
            'requires_closure' => $pendingClosureDate !== null,
        ];
    }

    private function buildOpenComandasPayload(Request $request): array
    {
        $unitId = $this->resolveActiveUnitId($request);

        $baseQuery = Venda::query()
            ->whereNotNull('id_comanda')
            ->where('status', 0);

        if ($unitId) {
            $baseQuery->where('id_unidade', $unitId);
        }

        $open = (clone $baseQuery)
            ->selectRaw('COUNT(DISTINCT id_comanda) as total_comandas, COALESCE(SUM(valor_total), 0) as total_amount')
            ->first();

        $comandas = (clone $baseQuery)
            ->selectRaw('id_comanda, COALESCE(SUM(valor_total), 0) as total_amount')
            ->groupBy('id_comanda')
            ->orderBy('id_comanda')
            ->get()
            ->map(function ($row) {
                return [
                    'codigo' => (int) $row->id_comanda,
                    'total' => (float) $row->total_amount,
                ];
            })
            ->values()
            ->all();

        return [
            'total_comandas' => (int) ($open->total_comandas ?? 0),
            'total_amount' => (float) ($open->total_amount ?? 0),
            'comandas' => $comandas,
        ];
    }

    private function buildRestrictionsPayload(Request $request): array
    {
        $user = $request->user();

        if (! $user || (int) $user->funcao !== 3) {
            return [
                'requires_closure' => false,
                'pending_closure_date' => null,
                'pending_comandas' => [],
            ];
        }

        $unit = $request->session()->get('active_unit');
        $restrictions = $this->resolveCashierRestrictions($user, $unit);

        return [
            'requires_closure' => $restrictions['requires_closure'],
            'pending_closure_date' => $restrictions['pending_closure_date'],
            'pending_comandas' => $restrictions['pending_comandas'],
        ];
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

    private function getComandaItems(int $codigo, ?int $unitId = null): array
    {
        $items = Venda::query()
            ->where('id_comanda', $codigo)
            ->where('status', 0)
            ->when($unitId, function ($query) use ($unitId) {
                $query->where('id_unidade', $unitId);
            })
            ->get(['tb1_id', 'produto_nome', 'valor_unitario', 'quantidade', 'id_lanc']);

        if ($items->isEmpty()) {
            return [];
        }

        $lancIds = $items->pluck('id_lanc')->filter()->unique()->values();
        $lancUsers = $lancIds->isNotEmpty()
            ? User::whereIn('id', $lancIds)->pluck('name', 'id')
            : collect();

        return $items
            ->groupBy(fn ($item) => $this->buildSaleItemKey(
                (int) $item->tb1_id,
                (float) $item->valor_unitario,
            ))
            ->map(function ($group) use ($lancUsers) {
                $first = $group->first();
                $quantity = $group->sum('quantidade');
                $price = (float) $first->valor_unitario;
                $lineId = $this->buildSaleItemKey((int) $first->tb1_id, $price);

                return [
                    'line_id' => $lineId,
                    'id' => $first->tb1_id,
                    'product_id' => $first->tb1_id,
                    'name' => $first->produto_nome,
                    'price' => $price,
                    'quantity' => $quantity,
                    'lanc_user_id' => $first->id_lanc,
                    'lanc_user_name' => $first->id_lanc ? ($lancUsers[$first->id_lanc] ?? null) : null,
                ];
            })
            ->values()
            ->all();
    }

    private function resolveActiveUnitId(Request $request): ?int
    {
        $unit = $request->session()->get('active_unit');
        $unitId = is_array($unit)
            ? ($unit['id'] ?? $unit['tb2_id'] ?? null)
            : (is_object($unit) ? ($unit->id ?? $unit->tb2_id ?? null) : null);

        $unitId = $unitId ?? ($request->user()?->tb2_id);

        return $unitId ? (int) $unitId : null;
    }

    private function userBelongsToUnit(User $user, ?int $unitId): bool
    {
        if (! $unitId) {
            return false;
        }

        if ((int) ($user->tb2_id ?? 0) === (int) $unitId) {
            return true;
        }

        return $user->units()
            ->where('tb2_unidades.tb2_id', (int) $unitId)
            ->exists();
    }

    private function buildSaleItemKey(int $productId, ?float $unitPrice = null): string
    {
        $normalizedPrice = number_format((float) ($unitPrice ?? 0), 2, '.', '');

        return sprintf('product-%d-price-%s', $productId, $normalizedPrice);
    }

    private function tryAcquireComandaLock(?int $unitId, int $codigo, int $waitSeconds): ?callable
    {
        $lockKey = sprintf('sale-comanda-unit-%s-codigo-%d', (string) ($unitId ?? 'none'), $codigo);
        $connection = DB::connection();

        if ($connection->getDriverName() === 'mysql') {
            $row = $connection->selectOne('SELECT GET_LOCK(?, ?) AS acquired', [$lockKey, $waitSeconds]);
            $acquired = (int) ($row->acquired ?? 0) === 1;

            if (! $acquired) {
                return null;
            }

            return static function () use ($connection, $lockKey): void {
                $connection->select('SELECT RELEASE_LOCK(?)', [$lockKey]);
            };
        }

        $lock = Cache::lock($lockKey, max($waitSeconds, 5));
        $acquired = $waitSeconds > 0 ? $lock->block($waitSeconds) : $lock->get();

        if (! $acquired) {
            return null;
        }

        return static function () use ($lock): void {
            $lock->release();
        };
    }

    private function parseSaleItemKey(?string $itemKey): ?array
    {
        $itemKey = trim((string) $itemKey);

        if (! preg_match('/^product-(\d+)-price-(\d+\.\d{2})$/', $itemKey, $matches)) {
            return null;
        }

        $productId = (int) $matches[1];
        $unitPrice = round((float) $matches[2], 2);

        if ($productId <= 0) {
            return null;
        }

        return [
            'product_id' => $productId,
            'unit_price' => $unitPrice,
        ];
    }

    private function collapseSaleItems(array $items): array
    {
        $collapsed = [];

        foreach ($items as $item) {
            $productId = (int) ($item['product_id'] ?? 0);
            $unitPrice = round((float) ($item['unit_price'] ?? 0), 2);
            $itemKey = $this->buildSaleItemKey($productId, $unitPrice);

            if (! isset($collapsed[$itemKey])) {
                $collapsed[$itemKey] = [
                    'product_id' => $productId,
                    'product_name' => $item['product_name'] ?? '',
                    'unit_price' => $unitPrice,
                    'quantity' => 0,
                    'subtotal' => 0.0,
                ];
            }

            $collapsed[$itemKey]['quantity'] += (int) ($item['quantity'] ?? 0);
            $collapsed[$itemKey]['subtotal'] = round(
                $collapsed[$itemKey]['quantity'] * $unitPrice,
                2
            );
        }

        return array_values($collapsed);
    }

    private function parseWeightedBarcode(?string $barcode): ?array
    {
        $barcode = trim((string) $barcode);

        if (
            $barcode === '' ||
            ! preg_match('/^\d{13}$/', $barcode) ||
            substr($barcode, 0, 1) !== '2'
        ) {
            return null;
        }

        $productId = (int) substr($barcode, 1, 4);
        $encodedValue = (int) substr($barcode, 7, 5);
        $unitPrice = round($encodedValue / 100, 2);

        if ($productId <= 0) {
            return null;
        }

        return [
            'barcode' => $barcode,
            'product_id' => $productId,
            'unit_price' => $unitPrice,
        ];
    }

    private function resolveRefeicaoDailyLimit(Carbon $date): float
    {
        return $date->isSunday() ? 24.0 : 12.0;
    }

    private function buildRefeicaoDailyLimitMessage(
        string $userName,
        float $dailyLimit,
        float $dailyUsage,
        float $dailyRemaining,
    ): string {
        if ($dailyRemaining <= 0) {
            return sprintf(
                'Limite diario de refeicao de %s ja foi atingido hoje para %s.',
                $this->formatCurrencyForMessage($dailyLimit),
                $userName
            );
        }

        return sprintf(
            'A compra ultrapassa o limite diario de refeicao para %s. Limite de hoje: %s. Ja utilizado: %s. Disponivel hoje: %s.',
            $userName,
            $this->formatCurrencyForMessage($dailyLimit),
            $this->formatCurrencyForMessage($dailyUsage),
            $this->formatCurrencyForMessage($dailyRemaining)
        );
    }

    private function formatCurrencyForMessage(float $value): string
    {
        return 'R$ '.number_format($value, 2, ',', '.');
    }

    private function resolveRemovalExecutor(?int $accessUserId, ?User $fallbackUser): User
    {
        if ($accessUserId) {
            $executor = User::find($accessUserId);

            if ($executor) {
                return $executor;
            }
        }

        if ($fallbackUser) {
            return $fallbackUser;
        }

        throw ValidationException::withMessages([
            'access_user_id' => 'Usuario executor da remocao nao foi encontrado.',
        ]);
    }

    private function notifyComandaItemRemoval(int $unitId, User $executor, Venda $record, string $removalReason, Carbon $removedAt): void
    {
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
            ->push($executor->id)
            ->unique()
            ->values();

        $unitName = Unidade::query()
            ->where('tb2_id', $unitId)
            ->value('tb2_nome');

        $message = $this->buildComandaItemRemovalMessage($executor, $record, $removalReason, $removedAt, $unitName);

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

    private function buildComandaItemRemovalMessage(User $executor, Venda $record, string $removalReason, Carbon $removedAt, ?string $unitName): string
    {
        $includedAt = $record->created_at instanceof Carbon
            ? $record->created_at
            : Carbon::parse($record->created_at ?? $record->data_hora);
        $minutesDifference = max(0, $includedAt->diffInMinutes($removedAt));

        $lines = [
            '[b]Remocao de item da comanda[/b]',
            sprintf('Usuario executor: %s', $this->formatExecutorLabel($unitName, $executor->name)),
            sprintf('Comanda: %s', $record->id_comanda ? (string) $record->id_comanda : '---'),
            sprintf('Item removido: %s', (string) $record->produto_nome),
            sprintf('Quantidade removida: %d', (int) $record->quantidade),
            sprintf('Valor unitario: %s', $this->formatCurrencyForMessage((float) $record->valor_unitario)),
            sprintf('Data e hora da inclusao: %s', $includedAt->format('d/m/y H:i:s')),
            sprintf('Data e hora da exclusao: %s', $removedAt->format('d/m/y H:i:s')),
            sprintf('Diferenca em minutos: %d', $minutesDifference),
            sprintf('Motivo da exclusao: %s', $removalReason),
        ];

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

    private function normalizeFiscalConsumerInput(array $consumer): array
    {
        $type = trim((string) ($consumer['type'] ?? ''));
        $document = preg_replace('/\D+/', '', (string) ($consumer['document'] ?? ''));
        $cep = preg_replace('/\D+/', '', (string) ($consumer['cep'] ?? ''));
        $cityCode = preg_replace('/\D+/', '', (string) ($consumer['city_code'] ?? ''));

        if (! in_array($type, ['cupom_fiscal', 'consumidor'], true)) {
            throw ValidationException::withMessages([
                'consumer.type' => 'Selecione um tipo fiscal valido para o consumidor.',
            ]);
        }

        if ($type === 'cupom_fiscal' && strlen($document) !== 11) {
            throw ValidationException::withMessages([
                'consumer.document' => 'Informe apenas um CPF com 11 digitos para o cupom fiscal.',
            ]);
        }

        if ($type === 'consumidor' && ! in_array(strlen($document), [11, 14], true)) {
            throw ValidationException::withMessages([
                'consumer.document' => 'Informe um CPF com 11 digitos ou um CNPJ com 14 digitos.',
            ]);
        }

        if ($type === 'consumidor' && strlen($cep) !== 8) {
            throw ValidationException::withMessages([
                'consumer.cep' => 'Informe o CEP com 8 digitos.',
            ]);
        }

        if ($type === 'consumidor' && strlen($cityCode) !== 7) {
            throw ValidationException::withMessages([
                'consumer.city_code' => 'Informe o codigo do municipio IBGE com 7 digitos.',
            ]);
        }

        $normalized = [
            'type' => $type,
            'name' => trim((string) ($consumer['name'] ?? '')),
            'document' => $document,
            'cep' => $cep,
            'street' => trim((string) ($consumer['street'] ?? '')),
            'number' => trim((string) ($consumer['number'] ?? '')),
            'complement' => trim((string) ($consumer['complement'] ?? '')),
            'neighborhood' => trim((string) ($consumer['neighborhood'] ?? '')),
            'city' => trim((string) ($consumer['city'] ?? '')),
            'city_code' => $cityCode,
            'state' => strtoupper(trim((string) ($consumer['state'] ?? ''))),
        ];

        if ($type === 'cupom_fiscal') {
            $normalized['name'] = '';
            $normalized['cep'] = '';
            $normalized['street'] = '';
            $normalized['number'] = '';
            $normalized['complement'] = '';
            $normalized['neighborhood'] = '';
            $normalized['city'] = '';
            $normalized['city_code'] = '';
            $normalized['state'] = '';
        }

        return $normalized;
    }

    private function buildFiscalSummary(?NotaFiscal $invoice): ?array
    {
        if (! $invoice) {
            return null;
        }

        $xmlDebug = $this->extractFiscalXmlDebugData($invoice->tb27_xml_envio);
        $statusMessage = $this->augmentFiscalStatusMessage($invoice->tb27_mensagem, $xmlDebug);
        $consumer = $this->extractFiscalConsumer($invoice, $xmlDebug);

        return [
            'id' => $invoice->tb27_id,
            'status' => $invoice->tb27_status,
            'mensagem' => $statusMessage,
            'modelo' => $invoice->tb27_modelo,
            'ambiente' => $invoice->tb27_ambiente,
            'serie' => $invoice->tb27_serie,
            'numero' => $invoice->tb27_numero,
            'protocolo' => $invoice->tb27_protocolo,
            'recibo' => $invoice->tb27_recibo,
            'chave_acesso' => $invoice->tb27_chave_acesso,
            'emitida_em' => optional($invoice->tb27_emitida_em)?->toIso8601String(),
            'consumer_type' => $consumer['type'] ?? 'balcao',
            'consumer' => $consumer,
            'items' => $this->extractFiscalItems($invoice),
            'xml_debug' => $xmlDebug,
        ];
    }

    private function extractFiscalConsumer(NotaFiscal $invoice, ?array $xmlDebug = null): ?array
    {
        $payload = is_array($invoice->tb27_payload) ? $invoice->tb27_payload : [];
        $consumer = is_array($payload['consumer'] ?? null) ? $payload['consumer'] : [];

        $type = trim((string) ($consumer['type'] ?? ''));
        $name = trim((string) ($consumer['name'] ?? $xmlDebug['dest_name'] ?? ''));
        $document = trim((string) ($consumer['document'] ?? $xmlDebug['dest_document'] ?? ''));

        if ($type === '' && $document !== '') {
            $type = $name === '' ? 'cupom_fiscal' : 'consumidor';
        }

        if ($name === '' && $document === '') {
            return null;
        }

        return [
            'type' => $type !== '' ? $type : 'balcao',
            'name' => $name !== '' ? $name : ($document !== '' ? 'CPF INFORMADO' : 'CONSUMIDOR NAO IDENTIFICADO'),
            'document' => $document !== '' ? $document : null,
            'cep' => $this->nullableXmlValue($consumer['cep'] ?? null),
            'street' => $this->nullableXmlValue($consumer['street'] ?? null),
            'number' => $this->nullableXmlValue($consumer['number'] ?? null),
            'complement' => $this->nullableXmlValue($consumer['complement'] ?? null),
            'neighborhood' => $this->nullableXmlValue($consumer['neighborhood'] ?? null),
            'city' => $this->nullableXmlValue($consumer['city'] ?? null),
            'city_code' => $this->nullableXmlValue($consumer['city_code'] ?? $xmlDebug['dest_city_code'] ?? null),
            'state' => $this->nullableXmlValue($consumer['state'] ?? null),
        ];
    }

    private function extractFiscalItems(NotaFiscal $invoice): array
    {
        $payload = is_array($invoice->tb27_payload) ? $invoice->tb27_payload : [];
        $items = $payload['itens'] ?? [];

        if (! is_array($items)) {
            return [];
        }

        return array_values(array_map(function ($item) {
            $item = is_array($item) ? $item : [];
            $quantity = (float) ($item['quantidade'] ?? 0);
            $unitPrice = round((float) ($item['valor_unitario'] ?? 0), 2);
            $total = round((float) ($item['valor_total'] ?? ($quantity * $unitPrice)), 2);

            return [
                'product_id' => (int) ($item['produto_id'] ?? 0),
                'product_name' => (string) ($item['descricao'] ?? ''),
                'quantity' => $quantity,
                'unit_price' => $unitPrice,
                'subtotal' => $total,
            ];
        }, $items));
    }

    private function extractFiscalXmlDebugData(?string $xml): ?array
    {
        if (! filled($xml) || ! class_exists(\DOMDocument::class) || ! class_exists(\DOMXPath::class)) {
            return null;
        }

        $document = new \DOMDocument;

        if (! @$document->loadXML((string) $xml)) {
            return null;
        }

        $xpath = new \DOMXPath($document);
        $xpath->registerNamespace('nfe', 'http://www.portalfiscal.inf.br/nfe');
        $xpath->registerNamespace('ds', 'http://www.w3.org/2000/09/xmldsig#');
        $qrCodeData = $this->nullableXmlValue($xpath->evaluate('string(//nfe:infNFeSupl/nfe:qrCode)'));
        $queryString = $qrCodeData ? (string) parse_url($qrCodeData, PHP_URL_QUERY) : '';
        $payload = str_starts_with($queryString, 'p=') ? substr($queryString, 2) : $queryString;
        $payloadParts = $payload !== '' ? explode('|', $payload) : [];

        return [
            'mod' => $this->nullableXmlValue($xpath->evaluate('string(//nfe:infNFe/nfe:ide/nfe:mod)')),
            'tp_imp' => $this->nullableXmlValue($xpath->evaluate('string(//nfe:infNFe/nfe:ide/nfe:tpImp)')),
            'dest_present' => (bool) $xpath->evaluate('count(//nfe:infNFe/nfe:dest)'),
            'dest_document' => $this->nullableXmlValue($xpath->evaluate('string(//nfe:infNFe/nfe:dest/nfe:CPF | //nfe:infNFe/nfe:dest/nfe:CNPJ | //nfe:infNFe/nfe:dest/nfe:idEstrangeiro)')),
            'dest_name' => $this->nullableXmlValue($xpath->evaluate('string(//nfe:infNFe/nfe:dest/nfe:xNome)')),
            'dest_city_code' => $this->nullableXmlValue($xpath->evaluate('string(//nfe:infNFe/nfe:dest/nfe:enderDest/nfe:cMun)')),
            'card_present' => (bool) $xpath->evaluate('count(//nfe:infNFe/nfe:pag/nfe:detPag/nfe:card)'),
            'qr_code_data' => $qrCodeData,
            'signature_present' => (bool) $xpath->evaluate('count(//ds:Signature)'),
            'csc_id' => $payloadParts[3] ?? null,
        ];
    }

    private function nullableXmlValue(mixed $value): ?string
    {
        $value = trim((string) $value);

        return $value !== '' ? $value : null;
    }

    private function augmentFiscalStatusMessage(?string $message, ?array $xmlDebug = null): ?string
    {
        $message = $this->nullableXmlValue($message);

        if ($message === null || ! str_contains($message, 'cStat 462')) {
            return $message;
        }

        $cscId = $xmlDebug['csc_id'] ?? null;
        $suffix = sprintf(
            ' Confira o CSC ID%s cadastrado na SEFAZ para o ambiente atual da loja.',
            $cscId ? ' '.$cscId : ''
        );

        return str_contains($message, $suffix) ? $message : $message.$suffix;
    }

    private function normalizeSalePaymentType(string $paymentType): string
    {
        return $this->isMachinePaymentType($paymentType) ? 'maquina' : $paymentType;
    }

    private function isComplementPaymentType(?string $paymentType): bool
    {
        return in_array((string) $paymentType, ['cartao_credito', 'cartao_debito', 'pix'], true);
    }

    private function isMachinePaymentType(?string $paymentType): bool
    {
        return in_array((string) $paymentType, ['cartao_credito', 'cartao_debito', 'pix'], true);
    }

    private function resolveStoredPaymentType(
        string $requestedPaymentType,
        string $salePaymentType,
        float $cardComplement,
        ?string $selectedCardType,
    ): string {
        if ($requestedPaymentType === 'dinheiro' && $cardComplement > 0) {
            if ($selectedCardType === 'pix') {
                return 'dinheiro_pix';
            }

            return $selectedCardType === 'cartao_debito'
                ? 'dinheiro_cartao_debito'
                : 'dinheiro_cartao_credito';
        }

        if ($this->isMachinePaymentType($requestedPaymentType)) {
            return $requestedPaymentType;
        }

        return $salePaymentType;
    }
}
