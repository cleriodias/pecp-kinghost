<?php

namespace App\Http\Controllers;

use App\Models\ConfiguracaoFiscal;
use App\Models\NotaFiscal;
use App\Models\Unidade;
use App\Models\Venda;
use App\Models\VendaPagamento;
use App\Support\FiscalCertificateService;
use App\Support\FiscalDfeDistributionService;
use App\Support\FiscalInvoicePreparationService;
use App\Support\FiscalMunicipalityCodeService;
use App\Support\FiscalNfceTransmissionService;
use App\Support\FiscalTaxLimitService;
use App\Support\FiscalWebserviceResolverService;
use Carbon\Carbon;
use DOMDocument;
use DOMXPath;
use Illuminate\Http\UploadedFile;
use App\Support\ManagementScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;
use Throwable;

class FiscalConfigurationController extends Controller
{
    private const INVOICE_FILTER_OPTIONS = ['all', 'error', 'signed', 'issued'];

    public function index(
        Request $request,
        FiscalCertificateService $fiscalCertificateService,
        FiscalWebserviceResolverService $fiscalWebserviceResolverService,
    ): Response
    {
        $user = $request->user();
        $this->ensureFiscalAccess($user);
        $units = collect();
        $selectedUnitId = (int) $request->query('unit_id', 0);
        $invoiceStatusFilter = strtolower((string) $request->query('invoice_status', 'error'));
        $lastStep = 'inicializar tela fiscal';

        if (! in_array($invoiceStatusFilter, self::INVOICE_FILTER_OPTIONS, true)) {
            $invoiceStatusFilter = 'all';
        }

        try {
            $lastStep = 'carregar unidades gerenciadas';
            $units = ManagementScope::managedUnits($user, ['tb2_id', 'tb2_nome', 'tb2_cnpj'])
                ->map(fn (Unidade $unit) => [
                    'id' => (int) $unit->tb2_id,
                    'name' => $unit->tb2_nome,
                    'cnpj' => $unit->tb2_cnpj,
                    'monthly_issued_count' => 0,
                    'monthly_issued_total' => 0,
                    'monthly_issued_today_total' => 0,
                    'monthly_issued_daily_average' => 0,
                    'fiscal_generation_enabled' => false,
                    'tax_daily_limit' => null,
                ])
                ->values();

            [$units, $selectedUnitId] = $this->resolveFiscalSelectableUnits($request, $user, $units, $selectedUnitId);

            if ($selectedUnitId > 0 && ! ManagementScope::canAccessFiscalUnit($user, $selectedUnitId)) {
                abort(403, 'Acesso negado.');
            }

            if (! $this->fiscalTablesAreAvailable()) {
                return $this->renderFiscalConfigPage(
                    $units,
                    $selectedUnitId,
                    null,
                    $this->defaultFiscalConfigurationPayload($selectedUnitId),
                    collect(),
                    null,
                    $this->defaultConfigurationDiagnostics($selectedUnitId),
                    'As tabelas fiscais ainda nao estao disponiveis neste ambiente. Execute as migrations fiscais do deploy antes de usar esta tela.',
                    null,
                );
            }

            $units = $this->attachFiscalConfigurationSummaries(
                $this->attachFiscalCurrentMonthIssuedSummaries($units)
            );

            $lastStep = 'carregar configuracao fiscal da unidade';
            $configuration = $selectedUnitId > 0
                ? ConfiguracaoFiscal::query()->where('tb2_id', $selectedUnitId)->first()
                : null;

            $lastStep = 'carregar dados da unidade';
            $unit = $selectedUnitId > 0
                ? Unidade::query()->find($selectedUnitId)
                : null;

            $invoiceLoadWarning = null;
            $invoices = collect();

            if ($selectedUnitId > 0) {
                try {
                    $lastStep = 'carregar ultimas notas fiscais da unidade';
                    $invoiceQuery = NotaFiscal::query()
                        ->where('tb2_id', $selectedUnitId);

                    if ($invoiceStatusFilter === 'error') {
                        $invoiceQuery->whereIn('tb27_status', ['erro_validacao', 'erro_transmissao']);
                    } elseif ($invoiceStatusFilter === 'signed') {
                        $invoiceQuery->where('tb27_status', 'xml_assinado');
                    } elseif ($invoiceStatusFilter === 'issued') {
                        $invoiceQuery->where('tb27_status', 'emitida');
                    }

                    $invoices = $invoiceQuery
                        ->with([
                            'pagamento.vendas.unidade:tb2_id,tb2_nome,tb2_endereco,tb2_cnpj',
                            'pagamento.vendas.caixa:id,name',
                            'pagamento.vendas.valeUser:id,name',
                            'configuracaoFiscal:tb26_id,tb26_razao_social,tb26_nome_fantasia,tb26_ie,tb26_logradouro,tb26_numero,tb26_complemento,tb26_bairro,tb26_municipio,tb26_uf,tb26_cep',
                        ])
                        ->orderByDesc('tb27_id')
                        ->limit(20)
                        ->get([
                            'tb27_id',
                            'tb4_id',
                            'tb2_id',
                            'tb26_id',
                            'tb27_modelo',
                            'tb27_ambiente',
                            'tb27_serie',
                            'tb27_numero',
                            'tb27_status',
                            'tb27_payload',
                            'tb27_mensagem',
                            'tb27_chave_acesso',
                            'tb27_protocolo',
                            'tb27_recibo',
                            'tb27_xml_envio',
                            'tb27_emitida_em',
                            'created_at',
                        ])
                        ->map(fn (NotaFiscal $invoice) => $this->buildInvoiceListPayload($invoice))
                        ->values();
                } catch (Throwable) {
                    $invoiceLoadWarning = 'Nao foi possivel carregar todas as notas fiscais desta unidade neste ambiente. A tela foi mantida aberta sem derrubar a configuracao.';
                    $invoices = collect();
                }
            }

            $resolvedEndpoints = null;

            if ($configuration && filled($configuration->tb26_uf) && filled($configuration->tb26_ambiente)) {
                try {
                    $lastStep = 'resolver endpoints da SEFAZ para a unidade';
                    $resolvedEndpoints = $fiscalWebserviceResolverService->resolveNfceEndpoints(
                        (string) $configuration->tb26_uf,
                        (string) $configuration->tb26_ambiente,
                    );
                } catch (RuntimeException $exception) {
                    $resolvedEndpoints = [
                        'error' => $exception->getMessage(),
                    ];
                }
            }

            $lastStep = 'montar payload da configuracao fiscal para a tela';
            return $this->renderFiscalConfigPage(
                $units,
                $selectedUnitId,
                $unit,
                $this->buildFiscalConfigurationPayload($configuration, $unit, $selectedUnitId, $fiscalCertificateService),
                $invoices,
                $resolvedEndpoints,
                $this->buildConfigurationDiagnostics($configuration, $selectedUnitId, $fiscalCertificateService),
                null,
                $invoiceLoadWarning,
                $invoiceStatusFilter,
            );
        } catch (Throwable $exception) {
            report($exception);

            $fallbackDiagnostics = $this->buildRawConfigurationDiagnostics($selectedUnitId);
            $fallbackDiagnostics['loading_error'] = sprintf(
                'Etapa: %s | Detalhe: %s',
                $lastStep,
                $this->buildSafeExceptionMessage($exception)
            );

            return $this->renderFiscalConfigPage(
                $units,
                $selectedUnitId,
                null,
                $this->defaultFiscalConfigurationPayload($selectedUnitId),
                collect(),
                null,
                $fallbackDiagnostics,
                sprintf(
                    'O ambiente de producao retornou um erro interno ao montar os dados fiscais. Etapa: %s. Detalhe tecnico: %s',
                    $lastStep,
                    $this->buildSafeExceptionMessage($exception)
                ),
                null,
                $invoiceStatusFilter,
            );
        }
    }

    public function nfeIndex(Request $request): Response
    {
        $user = $request->user();
        $this->ensureFiscalAccess($user);
        $units = collect();
        $selectedUnitId = (int) $request->query('unit_id', 0);
        $signedMode = $this->normalizeNfeSignedMode($request->query('signed_mode', 'signed'));
        $signedPaymentFilter = $this->normalizeNfeSignedPaymentFilter($request->query('signed_payment', 'non_cash'));
        $selectedDate = $this->normalizeNfeInvoiceDate($request->query('date'));
        $signedOrderSearch = $this->normalizeNfeSignedOrderSearch($request->query('signed_order'));
        $signedSort = $this->normalizeNfeSignedSort($request->query('signed_sort', 'time_desc'));
        $lastStep = 'inicializar tela NFe';

        try {
            $lastStep = 'carregar unidades gerenciadas';
            $units = ManagementScope::managedUnits($user, ['tb2_id', 'tb2_nome', 'tb2_cnpj'])
                ->map(fn (Unidade $unit) => [
                    'id' => (int) $unit->tb2_id,
                    'name' => $unit->tb2_nome,
                    'cnpj' => $unit->tb2_cnpj,
                    'daily_issued_count' => 0,
                    'daily_issued_total' => 0,
                    'fiscal_generation_enabled' => false,
                ])
                ->values();

            [$units, $selectedUnitId] = $this->resolveFiscalSelectableUnits($request, $user, $units, $selectedUnitId);

            if ($selectedUnitId > 0 && ! ManagementScope::canAccessFiscalUnit($user, $selectedUnitId)) {
                abort(403, 'Acesso negado.');
            }

            if (! $this->fiscalTablesAreAvailable()) {
                return $this->renderNfePage(
                    $units,
                    $selectedUnitId,
                    null,
                    collect(),
                    $this->emptyNfePaginator($request, 'signed_page'),
                    $this->emptyNfePaginator($request, 'issued_page'),
                    'As tabelas fiscais ainda nao estao disponiveis neste ambiente. Execute as migrations fiscais do deploy antes de usar esta tela.',
                    null,
                    $signedMode,
                    $selectedDate,
                    null,
                    $signedPaymentFilter,
                );
            }

            $units = $this->attachFiscalConfigurationSummaries($units);
            $units = $this->attachNfeDailyIssuedSummaries($units, $selectedDate);

            $lastStep = 'carregar dados da unidade';
            $unit = $selectedUnitId > 0
                ? Unidade::query()->find($selectedUnitId)
                : null;

            $invoiceLoadWarning = null;
            $errorInvoices = collect();
            $signedInvoices = $this->emptyNfePaginator($request, 'signed_page');
            $issuedInvoices = $this->emptyNfePaginator($request, 'issued_page');
            $invoiceCounts = $this->emptyNfeInvoiceCounts();
            $issuedCashierTotals = [];

            if ($selectedUnitId > 0) {
                try {
                    $lastStep = 'carregar ultimas notas fiscais da unidade';
                    $errorInvoices = $this->loadPreparedInvoicesForUnit($selectedUnitId, 'error', $selectedDate);
                    $signedInvoices = $this->loadPreparedInvoicesPageForUnit($request, $selectedUnitId, 'signed', $selectedDate, 15, 'signed_page', $signedPaymentFilter, $signedOrderSearch, $signedSort);
                    $issuedInvoices = $this->loadPreparedInvoicesPageForUnit($request, $selectedUnitId, 'issued', $selectedDate, 15, 'issued_page', 'all', $signedOrderSearch, $signedSort);
                    $invoiceCounts = $this->loadNfeInvoiceCounts($selectedUnitId, $selectedDate, $signedOrderSearch);
                    $issuedCashierTotals = $this->loadNfeIssuedCashierTotals($selectedUnitId, $selectedDate, $signedOrderSearch);
                } catch (Throwable) {
                    $invoiceLoadWarning = 'Nao foi possivel carregar todas as notas fiscais desta unidade neste ambiente. A tela foi mantida aberta sem derrubar a configuracao.';
                    $errorInvoices = collect();
                    $signedInvoices = $this->emptyNfePaginator($request, 'signed_page');
                    $issuedInvoices = $this->emptyNfePaginator($request, 'issued_page');
                    $invoiceCounts = $this->emptyNfeInvoiceCounts();
                    $issuedCashierTotals = [];
                }
            }

            return $this->renderNfePage(
                $units,
                $selectedUnitId,
                $unit,
                $errorInvoices,
                $signedInvoices,
                $issuedInvoices,
                null,
                $invoiceLoadWarning,
                $signedMode,
                $selectedDate,
                $invoiceCounts,
                $signedPaymentFilter,
                $signedOrderSearch,
                $signedSort,
                $issuedCashierTotals,
            );
        } catch (Throwable $exception) {
            report($exception);

            return $this->renderNfePage(
                $units,
                $selectedUnitId,
                null,
                collect(),
                $this->emptyNfePaginator($request, 'signed_page'),
                $this->emptyNfePaginator($request, 'issued_page'),
                sprintf(
                    'O ambiente de producao retornou um erro interno ao montar os dados fiscais. Etapa: %s. Detalhe tecnico: %s',
                    $lastStep,
                    $this->buildSafeExceptionMessage($exception)
                ),
                null,
                $signedMode,
                $selectedDate,
                null,
                $signedPaymentFilter,
                $signedOrderSearch,
                $signedSort,
            );
        }
    }

    public function taxLimitIndex(Request $request, FiscalTaxLimitService $fiscalTaxLimitService): Response
    {
        $user = $request->user();
        $this->ensureFiscalAccess($user);

        $units = ManagementScope::managedUnits($user, ['tb2_id', 'tb2_nome', 'tb2_cnpj'])
            ->map(fn (Unidade $unit) => [
                'id' => (int) $unit->tb2_id,
                'name' => $unit->tb2_nome,
                'cnpj' => $unit->tb2_cnpj,
                'monthly_issued_count' => 0,
                'monthly_issued_total' => 0,
                'monthly_issued_today_total' => 0,
                'monthly_issued_daily_average' => 0,
                'fiscal_generation_enabled' => false,
                'tax_daily_limit' => null,
            ])
            ->values();

        if ($this->fiscalTablesAreAvailable()) {
            $units = $this->attachFiscalConfigurationSummaries(
                $this->attachFiscalCurrentMonthIssuedSummaries($units)
            );
        }

        $selectedUnitId = (int) $request->query('unit_id', 0);

        [$units, $selectedUnitId] = $this->resolveFiscalSelectableUnits($request, $user, $units, $selectedUnitId);

        if ($selectedUnitId > 0 && ! ManagementScope::canAccessFiscalUnit($user, $selectedUnitId)) {
            abort(403, 'Acesso negado.');
        }

        $unit = $selectedUnitId > 0
            ? Unidade::query()->find($selectedUnitId)
            : null;
        $configuration = null;
        $fiscalUnavailableMessage = null;

        if (! $this->fiscalTablesAreAvailable()) {
            $fiscalUnavailableMessage = 'As tabelas fiscais ainda nao estao disponiveis neste ambiente. Execute as migrations fiscais do deploy antes de usar esta tela.';
        } elseif (! $this->taxLimitColumnsAreAvailable()) {
            $fiscalUnavailableMessage = 'As colunas de limite de imposto ainda nao estao disponiveis neste ambiente. Execute as migrations do deploy antes de usar esta tela.';
        } elseif ($selectedUnitId > 0) {
            $configuration = ConfiguracaoFiscal::query()->where('tb2_id', $selectedUnitId)->first();

            if ($configuration) {
                $configuration = $fiscalTaxLimitService->reactivateAutomaticGenerationIfEligible($configuration);
            }
        }

        return Inertia::render('Settings/FiscalTaxLimit', [
            'units' => $units,
            'selectedUnitId' => $selectedUnitId > 0 ? $selectedUnitId : null,
            'unit' => $unit ? [
                'id' => (int) $unit->tb2_id,
                'name' => $unit->tb2_nome,
                'cnpj' => $unit->tb2_cnpj,
                'endereco' => $unit->tb2_endereco,
            ] : null,
            'configuration' => $this->buildFiscalTaxLimitPayload($configuration, $selectedUnitId),
            'summary' => $fiscalTaxLimitService->summarize($configuration),
            'fiscalUnavailableMessage' => $fiscalUnavailableMessage,
        ]);
    }

    public function updateTaxLimit(Request $request, FiscalTaxLimitService $fiscalTaxLimitService): RedirectResponse
    {
        $user = $request->user();
        $this->ensureFiscalAccess($user);

        if (! $this->taxLimitColumnsAreAvailable()) {
            return redirect()
                ->back()
                ->with('error', 'As colunas de limite de imposto ainda nao estao disponiveis. Execute as migrations do deploy.');
        }

        $data = $request->validate([
            'tb2_id' => ['required', 'integer', 'exists:tb2_unidades,tb2_id'],
            'tb26_limite_imposto_ativo' => ['nullable', 'boolean'],
            'tb26_limite_imposto_diario' => ['nullable', 'numeric', 'min:0'],
            'tb26_limite_imposto_mensal' => ['nullable', 'numeric', 'min:0'],
            'tb26_limite_valor_compra' => ['nullable', 'numeric', 'min:0'],
        ]);

        $unitId = (int) $data['tb2_id'];

        if (! ManagementScope::canAccessFiscalUnit($user, $unitId)) {
            abort(403, 'Acesso negado.');
        }

        $configuration = ConfiguracaoFiscal::query()->firstOrNew([
            'tb2_id' => $unitId,
        ]);

        $configuration->fill([
            'tb26_limite_imposto_ativo' => (bool) ($data['tb26_limite_imposto_ativo'] ?? false),
            'tb26_limite_imposto_diario' => $this->positiveDecimalOrNull($data['tb26_limite_imposto_diario'] ?? null),
            'tb26_limite_imposto_mensal' => $this->positiveDecimalOrNull($data['tb26_limite_imposto_mensal'] ?? null),
            'tb26_limite_valor_compra' => $this->positiveDecimalOrNull($data['tb26_limite_valor_compra'] ?? null),
        ]);

        if (! (bool) $configuration->tb26_limite_imposto_ativo) {
            $configuration->tb26_limite_imposto_bloqueado_por = null;
            $configuration->tb26_limite_imposto_bloqueado_em = null;
        }

        $configuration->save();
        $fiscalTaxLimitService->reactivateAutomaticGenerationIfEligible($configuration);

        return redirect()
            ->route('settings.fiscal.tax-limit', ['unit_id' => $unitId])
            ->with('success', 'Configuracao de limite de imposto atualizada com sucesso.');
    }

    public function issuedMonthlySummary(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->ensureFiscalAccess($user);

        $data = $request->validate([
            'unit_id' => ['required', 'integer', 'exists:tb2_unidades,tb2_id'],
            'month' => ['required', 'date_format:Y-m'],
        ]);

        $unitId = (int) $data['unit_id'];

        if (! ManagementScope::canAccessFiscalUnit($user, $unitId)) {
            abort(403, 'Acesso negado.');
        }

        if (! $this->fiscalTablesAreAvailable()) {
            return response()->json([
                'message' => 'As tabelas fiscais ainda nao estao disponiveis neste ambiente.',
            ], 503);
        }

        $month = Carbon::createFromFormat('!Y-m', $data['month']);
        $monthStart = $month->copy()->startOfMonth();
        $monthEnd = $month->copy()->endOfMonth();
        $managedUnits = ManagementScope::managedUnits($user, ['tb2_id', 'tb2_nome']);
        $managedUnitIds = $managedUnits
            ->pluck('tb2_id')
            ->map(fn ($managedUnitId) => (int) $managedUnitId)
            ->filter()
            ->values();

        $invoices = NotaFiscal::query()
            ->whereIn('tb2_id', $managedUnitIds)
            ->where('tb27_status', 'emitida')
            ->whereBetween('tb27_emitida_em', [$monthStart, $monthEnd])
            ->with('pagamento:tb4_id,valor_total')
            ->orderBy('tb27_emitida_em')
            ->get(['tb27_id', 'tb2_id', 'tb4_id', 'tb27_emitida_em', 'tb27_payload']);

        $selectedUnitInvoices = $invoices
            ->where('tb2_id', $unitId)
            ->values();

        $days = $selectedUnitInvoices
            ->groupBy(fn (NotaFiscal $invoice) => $invoice->tb27_emitida_em->toDateString())
            ->map(function ($dailyInvoices, string $date): array {
                $total = $dailyInvoices->sum(function (NotaFiscal $invoice): float {
                    return $this->fiscalInvoiceDocumentTotal($invoice);
                });

                return [
                    'date' => $date,
                    'count' => $dailyInvoices->count(),
                    'total' => round($total, 2),
                ];
            })
            ->sortBy('date')
            ->values();

        $storeSummaries = $invoices
            ->groupBy('tb2_id')
            ->map(function ($storeInvoices): array {
                return [
                    'count' => $storeInvoices->count(),
                    'total' => round($storeInvoices->sum(function (NotaFiscal $invoice): float {
                        return $this->fiscalInvoiceDocumentTotal($invoice);
                    }), 2),
                ];
            });

        $stores = $managedUnits
            ->map(function (Unidade $unit) use ($storeSummaries): array {
                $summary = $storeSummaries->get((int) $unit->tb2_id, ['count' => 0, 'total' => 0]);

                return [
                    'id' => (int) $unit->tb2_id,
                    'name' => $unit->tb2_nome,
                    'issued_count' => (int) $summary['count'],
                    'issued_total' => (float) $summary['total'],
                    'fiscal_generation_enabled' => false,
                ];
            })
            ->values();
        $stores = $this->attachFiscalConfigurationSummaries($stores);

        return response()->json([
            'month' => $month->format('Y-m'),
            'count' => $selectedUnitInvoices->count(),
            'total' => round($days->sum('total'), 2),
            'daily_average' => $days->isNotEmpty() ? round($days->sum('total') / $days->count(), 2) : 0,
            'stores' => $stores,
            'days' => $days,
        ]);
    }

    public function syncOfficialMonthlyConference(Request $request, FiscalDfeDistributionService $fiscalDfeDistributionService): JsonResponse
    {
        $user = $request->user();
        $this->ensureFiscalAccess($user);

        $data = $request->validate([
            'unit_id' => ['required', 'integer', 'exists:tb2_unidades,tb2_id'],
            'month' => ['required', 'date_format:Y-m'],
        ]);

        $unitId = (int) $data['unit_id'];

        if (! ManagementScope::canAccessFiscalUnit($user, $unitId)) {
            abort(403, 'Acesso negado.');
        }

        if (
            ! $this->fiscalTablesAreAvailable()
            || ! Schema::hasTable('tb33_dfe_distribuicao_controles')
            || ! Schema::hasTable('tb34_dfe_documentos_receita')
        ) {
            return response()->json([
                'message' => 'As tabelas de conferencia fiscal ainda nao estao disponiveis neste ambiente. Execute as migrations fiscais do deploy.',
            ], 503);
        }

        $configuration = ConfiguracaoFiscal::query()
            ->where('tb2_id', $unitId)
            ->with('unidade:tb2_id,tb2_cnpj')
            ->first();

        if (! $configuration) {
            return response()->json([
                'message' => 'Configure os dados fiscais e o certificado da loja antes de consultar a Receita.',
            ], 422);
        }

        try {
            $month = Carbon::createFromFormat('!Y-m', (string) $data['month']);

            return response()->json(
                $fiscalDfeDistributionService->syncAndCompareMonthly($configuration, $month)
            );
        } catch (Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => $this->buildSafeExceptionMessage($exception),
            ], 422);
        }
    }

    public function update(
        Request $request,
        FiscalCertificateService $fiscalCertificateService,
        FiscalMunicipalityCodeService $fiscalMunicipalityCodeService,
    ): RedirectResponse
    {
        $user = $request->user();
        $this->ensureFiscalAccess($user);

        $data = $request->validate([
            'tb2_id' => ['required', 'integer', 'exists:tb2_unidades,tb2_id'],
            'tb26_emitir_nfe' => ['nullable', 'boolean'],
            'tb26_emitir_nfce' => ['nullable', 'boolean'],
            'tb26_geracao_automatica_ativa' => ['nullable', 'boolean'],
            'tb26_ambiente' => ['required', Rule::in(['homologacao', 'producao'])],
            'tb26_serie' => ['required', 'string', 'max:10'],
            'tb26_proximo_numero' => ['required', 'integer', 'min:1'],
            'tb26_crt' => ['nullable', Rule::in(['1', '2', '3', 1, 2, 3])],
            'tb26_csc_id' => ['nullable', 'string', 'max:36'],
            'tb26_csc' => ['nullable', 'string', 'max:255'],
            'tb26_certificado_tipo' => ['nullable', Rule::in(['A1', 'A3'])],
            'tb26_certificado_nome' => ['nullable', 'string', 'max:255'],
            'tb26_certificado_cnpj' => ['nullable', 'string', 'max:18'],
            'tb26_certificado_arquivo_upload' => [
                'nullable',
                'file',
                'max:5120',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    if (! $value instanceof UploadedFile) {
                        return;
                    }

                    $extension = strtolower((string) ($value->getClientOriginalExtension() ?: $value->extension()));

                    if (! in_array($extension, ['pfx', 'p12'], true)) {
                        $fail('O campo certificado deve ser um arquivo do tipo: pfx, p12.');
                    }
                },
            ],
            'tb26_certificado_senha' => ['nullable', 'string', 'max:255'],
            'remover_certificado' => ['nullable', 'boolean'],
            'tb26_razao_social' => ['nullable', 'string', 'max:60'],
            'tb26_nome_fantasia' => ['nullable', 'string', 'max:60'],
            'tb26_ie' => ['nullable', 'string', 'max:20'],
            'tb26_im' => ['nullable', 'string', 'max:20'],
            'tb26_cnae' => ['nullable', 'string', 'max:10'],
            'tb26_logradouro' => ['nullable', 'string', 'max:60'],
            'tb26_numero' => ['nullable', 'string', 'max:60'],
            'tb26_complemento' => ['nullable', 'string', 'max:60'],
            'tb26_bairro' => ['nullable', 'string', 'max:60'],
            'tb26_codigo_municipio' => ['nullable', 'string', 'max:7'],
            'tb26_municipio' => ['nullable', 'string', 'max:60'],
            'tb26_uf' => ['nullable', 'string', 'size:2'],
            'tb26_cep' => ['nullable', 'string', 'max:8'],
            'tb26_telefone' => ['nullable', 'string', 'max:20'],
            'tb26_email' => ['nullable', 'email', 'max:255'],
        ]);

        $unitId = (int) $data['tb2_id'];

        try {
            if (! ManagementScope::canAccessFiscalUnit($user, $unitId)) {
                abort(403, 'Acesso negado.');
            }

            $unit = Unidade::query()->findOrFail($unitId);

            $configuration = ConfiguracaoFiscal::query()->firstOrNew([
                'tb2_id' => $unitId,
            ]);

            $currentFiscalGenerationStatus = $configuration->exists
                ? (bool) $configuration->tb26_geracao_automatica_ativa
                : false;
            $requestedFiscalGenerationStatus = $request->has('tb26_geracao_automatica_ativa')
                ? (bool) ($data['tb26_geracao_automatica_ativa'] ?? false)
                : $currentFiscalGenerationStatus;

            if (
                $requestedFiscalGenerationStatus
                && ! $currentFiscalGenerationStatus
                && ! ManagementScope::isMaster($user)
            ) {
                throw ValidationException::withMessages([
                    'tb26_geracao_automatica_ativa' => 'Somente o master pode ativar a geracao automatica de notas.',
                ]);
            }

            if ($request->boolean('remover_certificado') && filled($configuration->tb26_certificado_arquivo)) {
                Storage::delete($configuration->tb26_certificado_arquivo);
                $configuration->tb26_certificado_arquivo = null;
                $configuration->tb26_certificado_senha = null;
                $configuration->tb26_certificado_senha_compartilhada = null;
            }

            if ($request->hasFile('tb26_certificado_arquivo_upload')) {
                if (filled($configuration->tb26_certificado_arquivo)) {
                    Storage::delete($configuration->tb26_certificado_arquivo);
                }

                $file = $request->file('tb26_certificado_arquivo_upload');
                $password = trim((string) ($data['tb26_certificado_senha'] ?? ''));

                if ($password === '' && ! $fiscalCertificateService->hasStoredPassword($configuration)) {
                    throw ValidationException::withMessages([
                        'tb26_certificado_senha' => 'Informe a senha do certificado para validar o arquivo enviado.',
                    ]);
                }

                $path = $file->storeAs(
                    'fiscal-certificados/' . $unitId,
                    'certificado-' . now()->format('YmdHis') . '.' . $file->getClientOriginalExtension()
                );

                $configuration->tb26_certificado_arquivo = $path;

                try {
                    $inspection = $fiscalCertificateService->inspectStoredCertificate(
                        $path,
                        $password !== '' ? $password : (string) $fiscalCertificateService->resolveConfigurationPassword($configuration)
                    );
                } catch (RuntimeException $exception) {
                    Storage::delete($path);
                    $configuration->tb26_certificado_arquivo = null;

                    throw ValidationException::withMessages([
                        'tb26_certificado_arquivo_upload' => $exception->getMessage(),
                    ]);
                }

                $configuration->tb26_certificado_nome = $inspection['common_name'] ?? $configuration->tb26_certificado_nome;
                $configuration->tb26_certificado_cnpj = $inspection['cnpj'] ?? $configuration->tb26_certificado_cnpj;
                $configuration->tb26_certificado_valido_ate = isset($inspection['valid_to'])
                    ? now()->setTimestamp((int) $inspection['valid_to'])
                    : null;
            }

            $configuration->fill([
                'tb26_emitir_nfe' => (bool) ($data['tb26_emitir_nfe'] ?? false),
                'tb26_emitir_nfce' => (bool) ($data['tb26_emitir_nfce'] ?? false),
                'tb26_geracao_automatica_ativa' => $requestedFiscalGenerationStatus,
                'tb26_ambiente' => $data['tb26_ambiente'],
                'tb26_serie' => trim((string) $data['tb26_serie']),
                'tb26_proximo_numero' => (int) $data['tb26_proximo_numero'],
                'tb26_crt' => filled($data['tb26_crt'] ?? null) ? (int) $data['tb26_crt'] : null,
                'tb26_csc_id' => $this->nullableTrim($data['tb26_csc_id'] ?? null),
                'tb26_csc' => $this->nullableTrim($data['tb26_csc'] ?? null),
                'tb26_certificado_tipo' => $this->nullableTrim($data['tb26_certificado_tipo'] ?? null) ?? 'A1',
                'tb26_certificado_nome' => $this->nullableTrim($data['tb26_certificado_nome'] ?? null) ?? $configuration->tb26_certificado_nome,
                'tb26_certificado_cnpj' => $this->onlyDigits($data['tb26_certificado_cnpj'] ?? null) ?? $configuration->tb26_certificado_cnpj,
                'tb26_certificado_valido_ate' => $configuration->tb26_certificado_valido_ate,
                'tb26_razao_social' => $this->nullableTrim($data['tb26_razao_social'] ?? null),
                'tb26_nome_fantasia' => $this->nullableTrim($data['tb26_nome_fantasia'] ?? null),
                'tb26_ie' => $this->normalizeStateRegistration($data['tb26_ie'] ?? null),
                'tb26_im' => $this->nullableTrim($data['tb26_im'] ?? null),
                'tb26_cnae' => $this->onlyDigits($data['tb26_cnae'] ?? null),
                'tb26_logradouro' => $this->nullableTrim($data['tb26_logradouro'] ?? null),
                'tb26_numero' => $this->nullableTrim($data['tb26_numero'] ?? null),
                'tb26_complemento' => $this->nullableTrim($data['tb26_complemento'] ?? null),
                'tb26_bairro' => $this->nullableTrim($data['tb26_bairro'] ?? null),
                'tb26_codigo_municipio' => $this->onlyDigits($data['tb26_codigo_municipio'] ?? null),
                'tb26_municipio' => $this->nullableTrim($data['tb26_municipio'] ?? null),
                'tb26_uf' => strtoupper((string) ($data['tb26_uf'] ?? '')),
                'tb26_cep' => $this->onlyDigits($data['tb26_cep'] ?? null),
                'tb26_telefone' => $this->nullableTrim($data['tb26_telefone'] ?? null),
                'tb26_email' => $this->nullableTrim($data['tb26_email'] ?? null),
            ]);

            if ($request->filled('tb26_certificado_senha')) {
                $configuration->tb26_certificado_senha = null;
                $configuration->tb26_certificado_senha_compartilhada = $data['tb26_certificado_senha'];
            } elseif (! filled($configuration->getRawOriginal('tb26_certificado_senha_compartilhada'))) {
                $resolvedPassword = $fiscalCertificateService->resolveConfigurationPassword($configuration);

                if ($resolvedPassword !== null && $resolvedPassword !== '') {
                    $configuration->tb26_certificado_senha_compartilhada = $resolvedPassword;
                }
            }

            if (filled($configuration->getRawOriginal('tb26_certificado_senha_compartilhada'))) {
                $configuration->tb26_certificado_senha = null;
            }

            $this->ensureCertificateMatchesUnit($configuration, $unit);
            $this->ensureMunicipalityCodeMatchesUf($configuration, $fiscalMunicipalityCodeService);

            $configuration->save();

            return redirect()
                ->route('settings.fiscal', ['unit_id' => $unitId])
                ->with('success', 'Configuracao fiscal atualizada com sucesso.');
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            report($exception);

            return redirect()
                ->route('settings.fiscal', ['unit_id' => $unitId])
                ->with('error', sprintf(
                    'Nao foi possivel salvar a configuracao fiscal neste ambiente. Detalhe tecnico: %s',
                    $this->buildSafeExceptionMessage($exception)
                ));
        }
    }

    public function reprocess(
        Request $request,
        FiscalInvoicePreparationService $fiscalInvoicePreparationService,
    ): RedirectResponse {
        $user = $request->user();
        $this->ensureFiscalAccess($user);

        $data = $request->validate([
            'tb2_id' => ['required', 'integer', 'exists:tb2_unidades,tb2_id'],
        ]);

        $unitId = (int) $data['tb2_id'];

        if (! ManagementScope::canAccessFiscalUnit($user, $unitId)) {
            abort(403, 'Acesso negado.');
        }

        $count = $fiscalInvoicePreparationService->reprocessPendingInvoicesForUnit($unitId);

        return $this->redirectToInvoiceListing($request, $unitId)
            ->with('success', sprintf('%d nota(s) fiscal(is) reprocessada(s) para a loja selecionada.', $count));
    }

    public function regenerateInvoice(
        Request $request,
        NotaFiscal $notaFiscal,
        FiscalInvoicePreparationService $fiscalInvoicePreparationService,
    ): RedirectResponse {
        $user = $request->user();
        $this->ensureFiscalAccess($user);

        if (! ManagementScope::canAccessFiscalUnit($user, (int) $notaFiscal->tb2_id)) {
            abort(403, 'Acesso negado.');
        }

        $notaFiscal->loadMissing('pagamento.vendas.produto', 'pagamento.vendas.unidade');

        if (! $notaFiscal->pagamento) {
            return $this->redirectToInvoiceListing($request, (int) $notaFiscal->tb2_id)
                ->with('error', 'Nao foi encontrado o pagamento vinculado a esta nota fiscal.');
        }

        try {
            $invoice = $fiscalInvoicePreparationService->prepareForPayment(
                $notaFiscal->pagamento,
                forceNewNumber: $request->boolean('force_new_number'),
            );
        } catch (RuntimeException $exception) {
            return $this->redirectToInvoiceListing($request, (int) $notaFiscal->tb2_id)
                ->with('error', $exception->getMessage());
        }

        return $this->redirectToInvoiceListing($request, (int) $notaFiscal->tb2_id)
            ->with('success', sprintf(
                'Nota fiscal da venda %d regenerada com status %s.',
                (int) $notaFiscal->tb4_id,
                $invoice?->tb27_status ?? 'indefinido'
            ));
    }

    public function destroyInvoice(Request $request, NotaFiscal $notaFiscal): RedirectResponse
    {
        $user = $request->user();
        $this->ensureFiscalAccess($user);

        if (! ManagementScope::canAccessFiscalUnit($user, (int) $notaFiscal->tb2_id)) {
            abort(403, 'Acesso negado.');
        }

        if (! $this->canDeletePreparedInvoice($notaFiscal)) {
            return $this->redirectToInvoiceListing($request, (int) $notaFiscal->tb2_id)
                ->with('error', 'Somente notas preparadas que ainda nao foram transmitidas podem ser excluidas.');
        }

        $paymentId = (int) $notaFiscal->tb4_id;
        $unitId = (int) $notaFiscal->tb2_id;

        $notaFiscal->delete();

        return $this->redirectToInvoiceListing($request, $unitId)
            ->with('success', sprintf(
                'Nota fiscal preparada da venda %d excluida com sucesso.',
                $paymentId
            ));
    }

    public function downloadXml(Request $request, NotaFiscal $notaFiscal)
    {
        $user = $request->user();
        $this->ensureFiscalAccess($user);

        if (! ManagementScope::canAccessFiscalUnit($user, (int) $notaFiscal->tb2_id)) {
            abort(403, 'Acesso negado.');
        }

        if (! filled($notaFiscal->tb27_xml_envio)) {
            abort(404, 'Nao existe XML assinado para esta nota.');
        }

        $filename = sprintf('nfce-loja-%d-venda-%d.xml', (int) $notaFiscal->tb2_id, (int) $notaFiscal->tb4_id);

        return response($notaFiscal->tb27_xml_envio, 200, [
            'Content-Type' => 'application/xml; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
        ]);
    }

    public function transmit(
        Request $request,
        NotaFiscal $notaFiscal,
        FiscalInvoicePreparationService $fiscalInvoicePreparationService,
        FiscalNfceTransmissionService $fiscalNfceTransmissionService,
    ): RedirectResponse {
        $user = $request->user();
        $this->ensureFiscalAccess($user);

        if (! ManagementScope::canAccessFiscalUnit($user, (int) $notaFiscal->tb2_id)) {
            abort(403, 'Acesso negado.');
        }

        try {
            $notaFiscal->loadMissing('pagamento.vendas.produto', 'pagamento.vendas.unidade');

            if (! $notaFiscal->pagamento) {
                return $this->redirectToInvoiceListing($request, (int) $notaFiscal->tb2_id)
                    ->with('error', 'Nao foi encontrado o pagamento vinculado a esta nota fiscal.');
            }

            $refreshedInvoice = $fiscalInvoicePreparationService->prepareForPayment($notaFiscal->pagamento);

            if (! $refreshedInvoice) {
                return $this->redirectToInvoiceListing($request, (int) $notaFiscal->tb2_id)
                    ->with('error', 'Esta forma de pagamento nao gera nota fiscal automatica para transmissao.');
            }

            if (! filled($refreshedInvoice->tb27_xml_envio)) {
                return $this->redirectToInvoiceListing($request, (int) $notaFiscal->tb2_id)
                    ->with('error', $refreshedInvoice->tb27_mensagem ?: 'A nota ainda nao possui XML assinado para transmissao.');
            }

            $fiscalNfceTransmissionService->transmit($refreshedInvoice);
        } catch (RuntimeException $exception) {
            return $this->redirectToInvoiceListing($request, (int) $notaFiscal->tb2_id)
                ->with('error', $exception->getMessage());
        }

        return $this->redirectToInvoiceListing($request, (int) $notaFiscal->tb2_id)
            ->with('success', sprintf('Nota fiscal da venda %d enviada para a SEFAZ.', (int) $notaFiscal->tb4_id));
    }

    public function transmitBatch(
        Request $request,
        FiscalInvoicePreparationService $fiscalInvoicePreparationService,
        FiscalNfceTransmissionService $fiscalNfceTransmissionService,
    ): JsonResponse {
        $user = $request->user();
        $this->ensureFiscalAccess($user);

        $data = $request->validate([
            'invoice_ids' => ['required', 'array', 'min:1', 'max:25'],
            'invoice_ids.*' => ['required', 'integer', 'distinct'],
        ]);

        $invoiceIds = collect($data['invoice_ids'])->map(fn ($invoiceId) => (int) $invoiceId)->values();
        $invoices = NotaFiscal::query()
            ->whereIn('tb27_id', $invoiceIds)
            ->get()
            ->keyBy('tb27_id');
        $results = [];

        foreach ($invoiceIds as $invoiceId) {
            $notaFiscal = $invoices->get($invoiceId);

            if (! $notaFiscal) {
                $results[] = [
                    'invoice_id' => $invoiceId,
                    'status' => 'error',
                    'message' => 'Nota fiscal nao encontrada.',
                ];

                continue;
            }

            if (! ManagementScope::canAccessFiscalUnit($user, (int) $notaFiscal->tb2_id)) {
                $results[] = [
                    'invoice_id' => $invoiceId,
                    'payment_id' => (int) $notaFiscal->tb4_id,
                    'status' => 'error',
                    'message' => 'Acesso negado para a unidade desta nota.',
                ];

                continue;
            }

            if ($notaFiscal->tb27_status !== 'xml_assinado') {
                $results[] = [
                    'invoice_id' => $invoiceId,
                    'payment_id' => (int) $notaFiscal->tb4_id,
                    'status' => 'error',
                    'message' => 'A nota nao esta assinada para transmissao.',
                ];

                continue;
            }

            try {
                $notaFiscal->loadMissing('pagamento.vendas.produto', 'pagamento.vendas.unidade');

                if (! $notaFiscal->pagamento) {
                    throw new RuntimeException('Nao foi encontrado o pagamento vinculado a esta nota fiscal.');
                }

                $refreshedInvoice = $fiscalInvoicePreparationService->prepareForPayment($notaFiscal->pagamento);

                if (! $refreshedInvoice) {
                    throw new RuntimeException('Esta forma de pagamento nao gera nota fiscal automatica para transmissao.');
                }

                if (! filled($refreshedInvoice->tb27_xml_envio)) {
                    throw new RuntimeException($refreshedInvoice->tb27_mensagem ?: 'A nota ainda nao possui XML assinado para transmissao.');
                }

                $transmittedInvoice = $fiscalNfceTransmissionService->transmit($refreshedInvoice);
                $results[] = [
                    'invoice_id' => (int) $transmittedInvoice->tb27_id,
                    'payment_id' => (int) $transmittedInvoice->tb4_id,
                    'status' => $transmittedInvoice->tb27_status === 'emitida' ? 'success' : 'error',
                    'message' => $transmittedInvoice->tb27_mensagem ?: 'Nota fiscal processada pela SEFAZ.',
                    'can_regenerate_with_new_number' => $this->isDuplicateInvoiceRejection($transmittedInvoice->tb27_mensagem),
                ];
            } catch (Throwable $exception) {
                report($exception);
                $results[] = [
                    'invoice_id' => (int) $notaFiscal->tb27_id,
                    'payment_id' => (int) $notaFiscal->tb4_id,
                    'status' => 'error',
                    'message' => $exception->getMessage(),
                    'can_regenerate_with_new_number' => $this->isDuplicateInvoiceRejection($exception->getMessage()),
                ];
            }
        }

        return response()->json([
            'results' => $results,
            'success_count' => collect($results)->where('status', 'success')->count(),
            'error_count' => collect($results)->where('status', 'error')->count(),
        ]);
    }

    private function isDuplicateInvoiceRejection(?string $message): bool
    {
        $message = mb_strtolower((string) $message);

        return str_contains($message, 'duplicidade')
            || str_contains($message, 'cstat 539')
            || str_contains($message, 'rejeicao: duplicidade')
            || str_contains($message, 'rejeição: duplicidade');
    }

    private function ensureFiscalAccess($user): void
    {
        if (! ManagementScope::canAccessFiscal($user)) {
            abort(403, 'Acesso negado.');
        }
    }

    private function nullableTrim(?string $value): ?string
    {
        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }

    private function onlyDigits(?string $value): ?string
    {
        $value = preg_replace('/\D+/', '', (string) $value);

        return $value === '' ? null : $value;
    }

    private function positiveDecimalOrNull(mixed $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        $decimal = round((float) $value, 2);

        return $decimal > 0 ? $decimal : null;
    }

    private function normalizeStateRegistration(?string $value): ?string
    {
        $value = strtoupper(trim((string) $value));

        if ($value === '') {
            return null;
        }

        if ($value === 'ISENTO') {
            return 'ISENTO';
        }

        return $this->onlyDigits($value);
    }

    private function ensureCertificateMatchesUnit(ConfiguracaoFiscal $configuration, Unidade $unit): void
    {
        $certificateCnpj = $this->onlyDigits($configuration->tb26_certificado_cnpj);
        $unitCnpj = $this->onlyDigits($unit->tb2_cnpj);

        if (! $certificateCnpj || ! $unitCnpj) {
            return;
        }

        $unitBase = substr($unitCnpj, 0, 8);
        $certificateBase = substr($certificateCnpj, 0, 8);

        if ($unitBase !== $certificateBase) {
            throw ValidationException::withMessages([
                'tb26_certificado_cnpj' => 'O certificado informado nao pertence ao mesmo CNPJ base da loja selecionada.',
            ]);
        }
    }

    private function ensureMunicipalityCodeMatchesUf(
        ConfiguracaoFiscal $configuration,
        FiscalMunicipalityCodeService $fiscalMunicipalityCodeService,
    ): void {
        if (! filled($configuration->tb26_uf) || ! filled($configuration->tb26_codigo_municipio)) {
            return;
        }

        if ($fiscalMunicipalityCodeService->matchesUf($configuration->tb26_uf, $configuration->tb26_codigo_municipio)) {
            return;
        }

        $expectedPrefix = $fiscalMunicipalityCodeService->expectedPrefixForUf($configuration->tb26_uf);

        throw ValidationException::withMessages([
            'tb26_codigo_municipio' => sprintf(
                'O codigo do municipio IBGE %s nao pertence a UF %s. Use um codigo iniciado por %s.',
                (string) $configuration->tb26_codigo_municipio,
                (string) $configuration->tb26_uf,
                $expectedPrefix ?? '--'
            ),
        ]);
    }

    private function buildReceiptPayload(VendaPagamento $payment): array
    {
        $sales = $payment->vendas->values();
        $firstSale = $sales->first();
        $saleDateTime = $firstSale?->data_hora ?? $payment->created_at;
        $receiptComanda = $this->resolveReceiptComanda($sales);

        return [
            'id' => $payment->tb4_id,
            'comanda' => $receiptComanda,
            'total' => round((float) $payment->valor_total, 2),
            'date_time' => $saleDateTime?->toIso8601String(),
            'tipo_pago' => $payment->tipo_pagamento,
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
            ],
            'items' => $sales
                ->map(fn (Venda $sale) => [
                    'id' => $sale->tb3_id,
                    'product_name' => $sale->produto_nome,
                    'quantity' => (int) $sale->quantidade,
                    'unit_price' => round((float) $sale->valor_unitario, 2),
                    'subtotal' => round((float) $sale->valor_total, 2),
                    'comanda' => $sale->id_comanda,
                ])
                ->values()
                ->all(),
        ];
    }

    private function resolveReceiptComanda($sales): ?string
    {
        $comanda = $sales
            ->pluck('id_comanda')
            ->filter(fn ($value) => $value !== null && $value !== '')
            ->unique()
            ->implode(', ');

        return $comanda !== '' ? $comanda : null;
    }

    private function buildFiscalReceiptPayload(NotaFiscal $invoice): ?array
    {
        $payment = $invoice->pagamento;

        if (! $payment) {
            return null;
        }

        $sales = $payment->vendas->values();
        $firstSale = $sales->first();
        $configuration = $invoice->configuracaoFiscal;
        $invoicePayload = $invoice->tb27_payload ?? [];
        $fiscalItems = collect($invoicePayload['itens'] ?? []);
        $excludedItems = collect($invoicePayload['itens_excluidos'] ?? []);
        $xmlData = $this->extractFiscalReceiptXmlData($invoice->tb27_xml_envio);
        $issueDateTime = $invoice->tb27_emitida_em ?? $firstSale?->data_hora ?? $invoice->created_at;
        $emitterName = $configuration?->tb26_nome_fantasia
            ?: $configuration?->tb26_razao_social
            ?: $firstSale?->unidade?->tb2_nome
            ?: 'EMITENTE NAO INFORMADO';
        $documentTotal = round((float) ($invoicePayload['valor_total_documento'] ?? $payment->valor_total), 2);
        $statusMessage = $this->augmentFiscalStatusMessage($invoice->tb27_mensagem, $xmlData);

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
            'status_message' => $statusMessage,
            'issued_at' => $issueDateTime?->toIso8601String(),
            'emitter_name' => $emitterName,
            'emitter_legal_name' => $configuration?->tb26_razao_social,
            'emitter_document' => $firstSale?->unidade?->tb2_cnpj,
            'emitter_ie' => $configuration?->tb26_ie,
            'emitter_address' => $this->buildEmitterAddress($configuration),
            'consumer_name' => 'CONSUMIDOR NAO IDENTIFICADO',
            'payment_label' => $this->resolvePaymentLabel($payment->tipo_pagamento),
            'total' => $documentTotal,
            'amount_paid' => $documentTotal,
            'change' => null,
            'additional_payment' => null,
            'access_key' => $invoice->tb27_chave_acesso ?: ($xmlData['access_key'] ?? null),
            'protocol' => $invoice->tb27_protocolo,
            'receipt' => $invoice->tb27_recibo,
            'consulta_url' => $xmlData['consulta_url'] ?? null,
            'qr_code_data' => $xmlData['qr_code_data'] ?? null,
            'is_preview' => $invoice->tb27_status !== 'emitida',
            'excluded_items' => $excludedItems->values()->all(),
            'items' => $fiscalItems
                ->map(fn (array $item) => [
                    'id' => $item['produto_id'] ?? null,
                    'product_name' => $item['descricao'] ?? 'ITEM FISCAL',
                    'quantity' => (float) ($item['quantidade'] ?? 0),
                    'unit_price' => round((float) ($item['valor_unitario'] ?? 0), 2),
                    'subtotal' => round((float) ($item['valor_total'] ?? 0), 2),
                ])
                ->values()
                ->all(),
        ];
    }

    private function buildEmitterAddress(?ConfiguracaoFiscal $configuration): ?string
    {
        if (! $configuration) {
            return null;
        }

        $lineOne = trim(implode(', ', array_filter([
            $configuration->tb26_logradouro,
            $configuration->tb26_numero,
            $configuration->tb26_complemento,
        ])));

        $lineTwo = trim(implode(' - ', array_filter([
            $configuration->tb26_bairro,
            trim(implode('/', array_filter([
                $configuration->tb26_municipio,
                $configuration->tb26_uf,
            ]))),
        ])));

        $parts = array_filter([
            $lineOne,
            $lineTwo,
            $configuration->tb26_cep ? 'CEP ' . $configuration->tb26_cep : null,
        ]);

        if ($parts === []) {
            return null;
        }

        return implode(' | ', $parts);
    }

    private function extractFiscalReceiptXmlData(?string $xml): array
    {
        if (! filled($xml)) {
            return [];
        }

        if (! class_exists(DOMDocument::class) || ! class_exists(DOMXPath::class)) {
            return [];
        }

        $document = new DOMDocument();

        if (! @$document->loadXML((string) $xml)) {
            return [];
        }

        $xpath = new DOMXPath($document);
        $xpath->registerNamespace('nfe', 'http://www.portalfiscal.inf.br/nfe');
        $xpath->registerNamespace('ds', 'http://www.w3.org/2000/09/xmldsig#');

        $qrCodeData = $this->stringOrNull($xpath->evaluate('string(//nfe:infNFeSupl/nfe:qrCode)'));
        $queryString = $qrCodeData ? (string) parse_url($qrCodeData, PHP_URL_QUERY) : '';
        $payload = str_starts_with($queryString, 'p=') ? substr($queryString, 2) : $queryString;
        $payloadParts = $payload !== '' ? explode('|', $payload) : [];

        return [
            'access_key' => $this->stringOrNull($xpath->evaluate('string(//nfe:infNFe/@Id)'))
                ? preg_replace('/^NFe/', '', (string) $xpath->evaluate('string(//nfe:infNFe/@Id)'))
                : null,
            'qr_code_data' => $qrCodeData,
            'consulta_url' => $this->stringOrNull($xpath->evaluate('string(//nfe:infNFeSupl/nfe:urlChave)')),
            'mod' => $this->stringOrNull($xpath->evaluate('string(//nfe:infNFe/nfe:ide/nfe:mod)')),
            'tp_imp' => $this->stringOrNull($xpath->evaluate('string(//nfe:infNFe/nfe:ide/nfe:tpImp)')),
            'dest_present' => (bool) $xpath->evaluate('count(//nfe:infNFe/nfe:dest)'),
            'dest_name' => $this->stringOrNull($xpath->evaluate('string(//nfe:infNFe/nfe:dest/nfe:xNome)')),
            'dest_city_code' => $this->stringOrNull($xpath->evaluate('string(//nfe:infNFe/nfe:dest/nfe:enderDest/nfe:cMun)')),
            'dest_document' => $this->stringOrNull($xpath->evaluate('string(//nfe:infNFe/nfe:dest/nfe:CPF | //nfe:infNFe/nfe:dest/nfe:CNPJ | //nfe:infNFe/nfe:dest/nfe:idEstrangeiro)')),
            'card_present' => (bool) $xpath->evaluate('count(//nfe:infNFe/nfe:pag/nfe:detPag/nfe:card)'),
            'signature_present' => (bool) $xpath->evaluate('count(//ds:Signature)'),
            'csc_id' => $payloadParts[3] ?? null,
        ];
    }

    private function stringOrNull(mixed $value): ?string
    {
        $value = trim((string) $value);

        return $value !== '' ? $value : null;
    }

    private function augmentFiscalStatusMessage(?string $message, array $xmlData = []): ?string
    {
        $message = $this->stringOrNull($message);

        if ($message === null || ! str_contains($message, 'cStat 462')) {
            return $message;
        }

        $cscId = $xmlData['csc_id'] ?? null;
        $suffix = sprintf(
            ' Confira o CSC ID%s cadastrado na SEFAZ para o ambiente atual da loja.',
            $cscId ? ' ' . $cscId : ''
        );

        return str_contains($message, $suffix) ? $message : $message . $suffix;
    }

    private function resolvePaymentLabel(?string $paymentType): string
    {
        return match ((string) $paymentType) {
            'dinheiro' => 'Dinheiro',
            'cartao_credito' => 'Cartao credito',
            'cartao_debito' => 'Cartao debito',
            'pix' => 'Pix',
            'dinheiro_cartao_credito' => 'Dinheiro + Cartao credito',
            'dinheiro_cartao_debito' => 'Dinheiro + Cartao debito',
            'dinheiro_pix' => 'Dinheiro + Pix',
            'maquina' => 'Maquina',
            'vale' => 'Vale',
            'refeicao' => 'Refeicao',
            'faturar' => 'Faturar',
            default => strtoupper(str_replace('_', ' ', trim((string) $paymentType))) ?: 'Nao informado',
        };
    }

    private function buildInvoiceListPayload(NotaFiscal $invoice): array
    {
        $invoicePayload = is_array($invoice->tb27_payload) ? $invoice->tb27_payload : [];
        $xmlData = $this->extractFiscalReceiptXmlData($invoice->tb27_xml_envio);

        $payload = [
            'id' => (int) $invoice->tb27_id,
            'payment_id' => (int) $invoice->tb4_id,
            'modelo' => $invoice->tb27_modelo,
            'ambiente' => $invoice->tb27_ambiente,
            'serie' => $invoice->tb27_serie,
            'numero' => $invoice->tb27_numero,
            'status' => $invoice->tb27_status,
            'mensagem' => $this->augmentFiscalStatusMessage($invoice->tb27_mensagem, $xmlData),
            'chave_acesso' => $invoice->tb27_chave_acesso,
            'protocolo' => $invoice->tb27_protocolo,
            'recibo' => $invoice->tb27_recibo,
            'emitida_em' => optional($invoice->tb27_emitida_em)->format('d/m/y H:i'),
            'criada_em' => optional($invoice->created_at)->format('d/m/y H:i'),
            'payment_type' => $invoicePayload['tipo_pagamento'] ?? $invoice->pagamento?->tipo_pagamento,
            'total' => round((float) ($invoicePayload['valor_total_documento'] ?? $invoice->pagamento?->valor_total ?? 0), 2),
            'cashier_name' => $invoice->pagamento?->vendas?->first()?->caixa?->name ?? '---',
            'fiscal_correction_items' => $this->buildFiscalCorrectionItems($invoice),
            'xml_disponivel' => filled($invoice->tb27_xml_envio),
            'pode_regenerar' => in_array($invoice->tb27_status, [
                'pendente_configuracao',
                'erro_validacao',
                'erro_transmissao',
                'pendente_emissao',
                'xml_assinado',
                'emitida',
            ], true),
            'pode_excluir' => $this->canDeletePreparedInvoice($invoice),
            'itens_excluidos_qtd' => (int) ($invoicePayload['itens_excluidos_qtd'] ?? 0),
            'xml_debug' => [
                'mod' => $xmlData['mod'] ?? null,
                'tp_imp' => $xmlData['tp_imp'] ?? null,
                'dest_present' => $xmlData['dest_present'] ?? false,
                'dest_document' => $xmlData['dest_document'] ?? null,
                'dest_name' => $xmlData['dest_name'] ?? null,
                'dest_city_code' => $xmlData['dest_city_code'] ?? null,
                'card_present' => $xmlData['card_present'] ?? false,
                'signature_present' => $xmlData['signature_present'] ?? false,
                'csc_id' => $xmlData['csc_id'] ?? null,
                'qr_code_data' => $xmlData['qr_code_data'] ?? null,
            ],
            'fiscal_receipt' => null,
        ];

        if (! $invoice->pagamento) {
            return $payload;
        }

        try {
            $payload['fiscal_receipt'] = $this->buildFiscalReceiptPayload($invoice);
        } catch (Throwable) {
            $payload['fiscal_receipt'] = null;
        }

        return $payload;
    }

    private function buildFiscalCorrectionItems(NotaFiscal $invoice): array
    {
        if (! in_array($invoice->tb27_status, ['erro_validacao', 'erro_transmissao'], true) || ! $invoice->pagamento) {
            return [];
        }

        return $invoice->pagamento->vendas
            ->map(function (Venda $sale): array {
                return [
                    'product_id' => (int) $sale->tb1_id,
                    'product_name' => $sale->produto?->tb1_nome ?: $sale->produto_nome ?: 'Produto nao informado',
                    'quantity' => (float) $sale->quantidade,
                ];
            })
            ->filter(fn (array $item) => $item['product_id'] > 0)
            ->values()
            ->all();
    }

    private function isMissingFiscalItemDataError(?string $message): bool
    {
        return str_contains(
            mb_strtolower((string) $message),
            'nenhum item da venda possui dados fiscais minimos para gerar a nota'
        );
    }

    private function canDeletePreparedInvoice(NotaFiscal $invoice): bool
    {
        return ! in_array($invoice->tb27_status, ['emitida', 'cancelada'], true)
            && ! filled($invoice->tb27_protocolo)
            && ! filled($invoice->tb27_recibo);
    }

    private function resolveDefaultSelectedUnitId(Request $request, $units): int
    {
        $activeUnit = $request->session()->get('active_unit');
        $activeUnitId = 0;
        $loggedUnitId = (int) ($request->user()?->tb2_id ?? 0);

        if (is_array($activeUnit)) {
            $activeUnitId = (int) ($activeUnit['id'] ?? $activeUnit['tb2_id'] ?? 0);
        } elseif (is_object($activeUnit)) {
            $activeUnitId = (int) ($activeUnit->id ?? $activeUnit->tb2_id ?? 0);
        }

        if ($activeUnitId > 0 && collect($units)->contains(fn ($unit) => (int) ($unit['id'] ?? 0) === $activeUnitId)) {
            return $activeUnitId;
        }

        if ($loggedUnitId > 0 && collect($units)->contains(fn ($unit) => (int) ($unit['id'] ?? 0) === $loggedUnitId)) {
            return $loggedUnitId;
        }

        return (int) ($units->first()['id'] ?? 0);
    }

    private function resolveFiscalSelectableUnits(Request $request, $user, $units, int $selectedUnitId): array
    {
        if (! ManagementScope::isMaster($user)) {
            $selectedUnitId = $this->resolveDefaultSelectedUnitId($request, $units);
            $units = collect($units)
                ->filter(fn ($unit) => (int) ($unit['id'] ?? 0) === $selectedUnitId)
                ->values();

            return [$units, $selectedUnitId];
        }

        if ($selectedUnitId <= 0) {
            $selectedUnitId = $this->resolveDefaultSelectedUnitId($request, $units);
        }

        return [$units, $selectedUnitId];
    }

    private function normalizeInvoiceStatusFilter(mixed $invoiceStatusFilter): string
    {
        $invoiceStatusFilter = strtolower(trim((string) $invoiceStatusFilter));

        if (! in_array($invoiceStatusFilter, self::INVOICE_FILTER_OPTIONS, true)) {
            return 'all';
        }

        return $invoiceStatusFilter;
    }

    private function normalizeNfeSignedMode(mixed $signedMode): string
    {
        $signedMode = strtolower(trim((string) $signedMode));

        return in_array($signedMode, ['signed', 'issued'], true) ? $signedMode : 'signed';
    }

    private function normalizeNfeSignedPaymentFilter(mixed $signedPaymentFilter): string
    {
        return strtolower(trim((string) $signedPaymentFilter)) === 'cash'
            ? 'cash'
            : 'non_cash';
    }

    private function normalizeNfeSignedOrderSearch(mixed $signedOrderSearch): string
    {
        return preg_replace('/\D+/', '', (string) $signedOrderSearch) ?? '';
    }

    private function normalizeNfeSignedSort(mixed $signedSort): string
    {
        $signedSort = strtolower(trim((string) $signedSort));

        return in_array($signedSort, ['time_desc', 'time_asc', 'value_desc', 'value_asc'], true)
            ? $signedSort
            : 'time_desc';
    }

    private function normalizeNfeInvoiceDate(mixed $date): string
    {
        $date = trim((string) $date);

        if ($date === '') {
            return now()->toDateString();
        }

        try {
            $parsedDate = Carbon::createFromFormat('!Y-m-d', $date);

            return $parsedDate->format('Y-m-d') === $date
                ? $parsedDate->toDateString()
                : now()->toDateString();
        } catch (Throwable) {
            return now()->toDateString();
        }
    }

    private function attachNfeDailyIssuedSummaries($units, string $selectedDate)
    {
        $unitIds = collect($units)->pluck('id')->map(fn ($unitId) => (int) $unitId)->filter()->values();

        if ($unitIds->isEmpty()) {
            return $units;
        }

        $summaries = NotaFiscal::query()
            ->whereIn('tb2_id', $unitIds)
            ->where('tb27_status', 'emitida')
            ->whereDate('tb27_emitida_em', $selectedDate)
            ->with('pagamento:tb4_id,valor_total')
            ->get(['tb27_id', 'tb2_id', 'tb4_id', 'tb27_payload'])
            ->groupBy('tb2_id')
            ->map(function ($invoices): array {
                return [
                    'count' => $invoices->count(),
                    'total' => round($invoices->sum(function (NotaFiscal $invoice): float {
                        return $this->fiscalInvoiceDocumentTotal($invoice);
                    }), 2),
                ];
            });

        return collect($units)->map(function (array $unit) use ($summaries): array {
            $summary = $summaries->get((int) $unit['id'], ['count' => 0, 'total' => 0]);
            $unit['daily_issued_count'] = (int) $summary['count'];
            $unit['daily_issued_total'] = (float) $summary['total'];

            return $unit;
        })->values();
    }

    private function attachFiscalCurrentMonthIssuedSummaries($units)
    {
        $unitIds = collect($units)->pluck('id')->map(fn ($unitId) => (int) $unitId)->filter()->values();

        if ($unitIds->isEmpty()) {
            return $units;
        }

        $monthStart = now()->startOfMonth();
        $monthEnd = now()->endOfMonth();

        $summaries = NotaFiscal::query()
            ->whereIn('tb2_id', $unitIds)
            ->where('tb27_status', 'emitida')
            ->whereBetween('tb27_emitida_em', [$monthStart, $monthEnd])
            ->with('pagamento:tb4_id,valor_total')
            ->get(['tb27_id', 'tb2_id', 'tb4_id', 'tb27_emitida_em', 'tb27_payload'])
            ->groupBy('tb2_id')
            ->map(function ($invoices): array {
                $today = now()->toDateString();
                $todayTotal = round($invoices
                    ->filter(fn (NotaFiscal $invoice): bool => optional($invoice->tb27_emitida_em)?->toDateString() === $today)
                    ->sum(function (NotaFiscal $invoice): float {
                        return $this->fiscalInvoiceDocumentTotal($invoice);
                    }), 2);
                $activeDays = $invoices
                    ->map(fn (NotaFiscal $invoice) => optional($invoice->tb27_emitida_em)?->toDateString())
                    ->filter()
                    ->unique()
                    ->count();

                return [
                    'count' => $invoices->count(),
                    'total' => round($invoices->sum(function (NotaFiscal $invoice): float {
                        return $this->fiscalInvoiceDocumentTotal($invoice);
                    }), 2),
                    'today_total' => $todayTotal,
                    'active_days' => $activeDays,
                ];
            });

        return collect($units)->map(function (array $unit) use ($summaries): array {
            $summary = $summaries->get((int) $unit['id'], ['count' => 0, 'total' => 0, 'today_total' => 0, 'active_days' => 0]);
            $unit['monthly_issued_count'] = (int) $summary['count'];
            $unit['monthly_issued_total'] = (float) $summary['total'];
            $unit['monthly_issued_today_total'] = (float) $summary['today_total'];
            $unit['monthly_issued_active_days'] = (int) $summary['active_days'];
            $unit['monthly_issued_daily_average'] = $summary['active_days'] > 0
                ? round(((float) $summary['total']) / ((int) $summary['active_days']), 2)
                : 0.0;

            return $unit;
        })->values();
    }

    private function attachFiscalConfigurationSummaries($units)
    {
        $unitIds = collect($units)->pluck('id')->map(fn ($unitId) => (int) $unitId)->filter()->values();

        if ($unitIds->isEmpty() || ! $this->fiscalTablesAreAvailable()) {
            return $units;
        }

        $columns = ['tb2_id'];

        if (Schema::hasColumn('tb26_configuracoes_fiscais', 'tb26_geracao_automatica_ativa')) {
            $columns[] = 'tb26_geracao_automatica_ativa';
        }

        if (Schema::hasColumn('tb26_configuracoes_fiscais', 'tb26_limite_imposto_diario')) {
            $columns[] = 'tb26_limite_imposto_diario';
        }

        $configurations = ConfiguracaoFiscal::query()
            ->whereIn('tb2_id', $unitIds)
            ->get($columns)
            ->keyBy('tb2_id');

        return collect($units)->map(function (array $unit) use ($configurations): array {
            $configuration = $configurations->get((int) $unit['id']);

            $unit['fiscal_generation_enabled'] = (bool) ($configuration?->tb26_geracao_automatica_ativa ?? false);
            $unit['tax_daily_limit'] = $configuration?->tb26_limite_imposto_diario;

            return $unit;
        })->values();
    }

    private function emptyNfeInvoiceCounts(): array
    {
        return [
            'error' => 0,
            'signed' => 0,
            'signed_cash' => 0,
            'issued' => 0,
        ];
    }

    private function loadNfeInvoiceCounts(int $selectedUnitId, string $selectedDate, string $signedOrderSearch = ''): array
    {
        $signedCashInvoices = $this->buildPreparedInvoicesQuery($selectedUnitId, 'signed', $selectedDate, 'cash', $signedOrderSearch)
            ->with('pagamento:tb4_id,valor_total')
            ->get(['tb27_id', 'tb4_id', 'tb27_payload']);

        return [
            'error' => $this->buildPreparedInvoicesQuery($selectedUnitId, 'error', $selectedDate)->count(),
            'signed' => $this->buildPreparedInvoicesQuery($selectedUnitId, 'signed', $selectedDate, 'non_cash', $signedOrderSearch)->count(),
            'signed_cash' => $signedCashInvoices->count(),
            'issued' => $this->buildPreparedInvoicesQuery($selectedUnitId, 'issued', $selectedDate, 'all', $signedOrderSearch)->count(),
        ];
    }

    private function loadNfeIssuedCashierTotals(int $selectedUnitId, string $selectedDate, string $signedOrderSearch = ''): array
    {
        return $this->buildPreparedInvoicesQuery($selectedUnitId, 'issued', $selectedDate, 'all', $signedOrderSearch)
            ->with([
                'pagamento:tb4_id,valor_total',
                'pagamento.vendas.caixa:id,name',
            ])
            ->get([
                'tb27_notas_fiscais.tb27_id',
                'tb27_notas_fiscais.tb4_id',
                'tb27_notas_fiscais.tb27_payload',
            ])
            ->groupBy(fn (NotaFiscal $invoice): string => $invoice->pagamento?->vendas?->first()?->caixa?->name ?? 'Sem caixa')
            ->map(function ($invoices, string $cashierName): array {
                return [
                    'cashier_name' => $cashierName,
                    'count' => $invoices->count(),
                    'total' => round($invoices->sum(fn (NotaFiscal $invoice): float => $this->fiscalInvoiceDocumentTotal($invoice)), 2),
                ];
            })
            ->sortByDesc('total')
            ->values()
            ->all();
    }

    private function fiscalInvoiceDocumentTotal(NotaFiscal $invoice): float
    {
        $payload = is_array($invoice->tb27_payload) ? $invoice->tb27_payload : [];

        return (float) ($payload['valor_total_documento'] ?? $invoice->pagamento?->valor_total ?? 0);
    }

    private function loadPreparedInvoicesForUnit(
        int $selectedUnitId,
        string $invoiceStatusFilter,
        string $selectedDate,
        string $signedPaymentFilter = 'all',
        string $signedOrderSearch = '',
    )
    {
        return $this->buildPreparedInvoicesQuery($selectedUnitId, $invoiceStatusFilter, $selectedDate, $signedPaymentFilter, $signedOrderSearch)
            ->with([
                'pagamento.vendas.unidade:tb2_id,tb2_nome,tb2_endereco,tb2_cnpj',
                'pagamento.vendas.produto:tb1_id,tb1_nome',
                'pagamento.vendas.caixa:id,name',
                'pagamento.vendas.valeUser:id,name',
                'configuracaoFiscal:tb26_id,tb26_razao_social,tb26_nome_fantasia,tb26_ie,tb26_logradouro,tb26_numero,tb26_complemento,tb26_bairro,tb26_municipio,tb26_uf,tb26_cep',
            ])
            ->orderByDesc('tb27_id')
            ->limit(20)
            ->get([
                'tb27_notas_fiscais.tb27_id',
                'tb27_notas_fiscais.tb4_id',
                'tb27_notas_fiscais.tb2_id',
                'tb27_notas_fiscais.tb26_id',
                'tb27_notas_fiscais.tb27_modelo',
                'tb27_notas_fiscais.tb27_ambiente',
                'tb27_notas_fiscais.tb27_serie',
                'tb27_notas_fiscais.tb27_numero',
                'tb27_notas_fiscais.tb27_status',
                'tb27_notas_fiscais.tb27_payload',
                'tb27_notas_fiscais.tb27_mensagem',
                'tb27_notas_fiscais.tb27_chave_acesso',
                'tb27_notas_fiscais.tb27_protocolo',
                'tb27_notas_fiscais.tb27_recibo',
                'tb27_notas_fiscais.tb27_xml_envio',
                'tb27_notas_fiscais.tb27_emitida_em',
                'tb27_notas_fiscais.created_at',
            ])
            ->map(fn (NotaFiscal $invoice) => $this->buildInvoiceListPayload($invoice))
            ->values();
    }

    private function loadPreparedInvoicesPageForUnit(
        Request $request,
        int $selectedUnitId,
        string $invoiceStatusFilter,
        string $selectedDate,
        int $perPage,
        string $pageName,
        string $signedPaymentFilter = 'all',
        string $signedOrderSearch = '',
        string $signedSort = 'time_desc',
    ): LengthAwarePaginator {
        $invoiceQuery = $this->buildPreparedInvoicesQuery($selectedUnitId, $invoiceStatusFilter, $selectedDate, $signedPaymentFilter, $signedOrderSearch)
            ->with([
                'pagamento.vendas.unidade:tb2_id,tb2_nome,tb2_endereco,tb2_cnpj',
                'pagamento.vendas.produto:tb1_id,tb1_nome',
                'pagamento.vendas.caixa:id,name',
                'pagamento.vendas.valeUser:id,name',
                'configuracaoFiscal:tb26_id,tb26_razao_social,tb26_nome_fantasia,tb26_ie,tb26_logradouro,tb26_numero,tb26_complemento,tb26_bairro,tb26_municipio,tb26_uf,tb26_cep',
            ]);

        $this->applyNfeInvoiceOrdering($invoiceQuery, $invoiceStatusFilter, $signedSort);

        $paginator = $invoiceQuery->paginate($perPage, [
                'tb27_notas_fiscais.tb27_id',
                'tb27_notas_fiscais.tb4_id',
                'tb27_notas_fiscais.tb2_id',
                'tb27_notas_fiscais.tb26_id',
                'tb27_notas_fiscais.tb27_modelo',
                'tb27_notas_fiscais.tb27_ambiente',
                'tb27_notas_fiscais.tb27_serie',
                'tb27_notas_fiscais.tb27_numero',
                'tb27_notas_fiscais.tb27_status',
                'tb27_notas_fiscais.tb27_payload',
                'tb27_notas_fiscais.tb27_mensagem',
                'tb27_notas_fiscais.tb27_chave_acesso',
                'tb27_notas_fiscais.tb27_protocolo',
                'tb27_notas_fiscais.tb27_recibo',
                'tb27_notas_fiscais.tb27_xml_envio',
                'tb27_notas_fiscais.tb27_emitida_em',
                'tb27_notas_fiscais.created_at',
            ], $pageName)
            ->withQueryString();

        $paginator->setCollection(
            $paginator->getCollection()
                ->map(fn (NotaFiscal $invoice) => $this->buildInvoiceListPayload($invoice))
                ->values()
        );

        return $paginator;
    }

    private function buildPreparedInvoicesQuery(
        int $selectedUnitId,
        string $invoiceStatusFilter,
        string $selectedDate,
        string $signedPaymentFilter = 'all',
        string $signedOrderSearch = '',
    )
    {
        $invoiceQuery = NotaFiscal::query()
            ->where('tb27_notas_fiscais.tb2_id', $selectedUnitId);

        if ($invoiceStatusFilter === 'error') {
            $invoiceQuery->whereIn('tb27_notas_fiscais.tb27_status', ['erro_validacao', 'erro_transmissao']);
        } elseif ($invoiceStatusFilter === 'signed') {
            $invoiceQuery->where('tb27_notas_fiscais.tb27_status', 'xml_assinado');
            $this->applyNfeSignedPaymentFilter($invoiceQuery, $signedPaymentFilter);
            $this->applyNfeSignedOrderSearch($invoiceQuery, $signedOrderSearch);
        } elseif ($invoiceStatusFilter === 'issued') {
            $invoiceQuery->where('tb27_notas_fiscais.tb27_status', 'emitida');
            $this->applyNfeSignedOrderSearch($invoiceQuery, $signedOrderSearch);
        }

        $dateColumn = $invoiceStatusFilter === 'issued' ? 'tb27_notas_fiscais.tb27_emitida_em' : 'tb27_notas_fiscais.created_at';

        $invoiceQuery->whereDate($dateColumn, $selectedDate);

        return $invoiceQuery;
    }

    private function applyNfeSignedOrderSearch($invoiceQuery, string $signedOrderSearch): void
    {
        if ($signedOrderSearch === '') {
            return;
        }

        $invoiceQuery->where('tb27_notas_fiscais.tb4_id', (int) $signedOrderSearch);
    }

    private function applyNfeInvoiceOrdering($invoiceQuery, string $invoiceStatusFilter, string $signedSort): void
    {
        if (in_array($invoiceStatusFilter, ['signed', 'issued'], true)) {
            if (str_starts_with($signedSort, 'value_')) {
                $direction = str_ends_with($signedSort, '_asc') ? 'asc' : 'desc';

                $invoiceQuery
                    ->leftJoin('tb4_vendas_pg as nfe_pagamentos_sort', 'nfe_pagamentos_sort.tb4_id', '=', 'tb27_notas_fiscais.tb4_id')
                    ->orderByRaw("COALESCE(nfe_pagamentos_sort.valor_total, 0) {$direction}")
                    ->orderByDesc('tb27_notas_fiscais.tb27_id');

                return;
            }

            $direction = str_ends_with($signedSort, '_asc') ? 'asc' : 'desc';
            $dateColumn = $invoiceStatusFilter === 'issued'
                ? 'tb27_notas_fiscais.tb27_emitida_em'
                : 'tb27_notas_fiscais.created_at';

            $invoiceQuery->orderBy($dateColumn, $direction)->orderByDesc('tb27_notas_fiscais.tb27_id');

            return;
        }

        $invoiceQuery->orderByDesc('tb27_notas_fiscais.tb27_id');
    }

    private function applyNfeSignedPaymentFilter($invoiceQuery, string $signedPaymentFilter): void
    {
        if ($signedPaymentFilter === 'cash') {
            $invoiceQuery->whereHas('pagamento', fn ($paymentQuery) => $paymentQuery->where('tipo_pagamento', 'dinheiro'));

            return;
        }

        if ($signedPaymentFilter !== 'non_cash') {
            return;
        }

        $invoiceQuery->where(function ($query): void {
            $query->whereDoesntHave('pagamento')
                ->orWhereHas('pagamento', fn ($paymentQuery) => $paymentQuery->where('tipo_pagamento', '!=', 'dinheiro'));
        });
    }

    private function emptyNfePaginator(Request $request, string $pageName): LengthAwarePaginator
    {
        return (new LengthAwarePaginator(
            [],
            0,
            15,
            1,
            [
                'path' => $request->url(),
                'pageName' => $pageName,
                'query' => $request->query(),
            ]
        ))->withQueryString();
    }

    private function redirectToInvoiceListing(Request $request, int $unitId): RedirectResponse
    {
        $routeName = strtolower(trim((string) $request->input('origin', $request->query('origin', '')))) === 'nfe'
            ? 'settings.nfe'
            : 'settings.fiscal';

        $routeParameters = ['unit_id' => $unitId];
        $invoiceStatusFilter = $this->normalizeInvoiceStatusFilter(
            $request->input('invoice_status', $request->query('invoice_status', 'all'))
        );

        if ($invoiceStatusFilter !== '') {
            $routeParameters['invoice_status'] = $invoiceStatusFilter;
        }

        if ($routeName === 'settings.nfe') {
            $routeParameters['signed_mode'] = $this->normalizeNfeSignedMode(
                $request->input('signed_mode', $request->query('signed_mode', 'signed'))
            );
            $routeParameters['signed_payment'] = $this->normalizeNfeSignedPaymentFilter(
                $request->input('signed_payment', $request->query('signed_payment', 'non_cash'))
            );
            $routeParameters['date'] = $this->normalizeNfeInvoiceDate(
                $request->input('date', $request->query('date'))
            );
            $routeParameters['signed_order'] = $this->normalizeNfeSignedOrderSearch(
                $request->input('signed_order', $request->query('signed_order'))
            );
            $routeParameters['signed_sort'] = $this->normalizeNfeSignedSort(
                $request->input('signed_sort', $request->query('signed_sort', 'time_desc'))
            );
        }

        return redirect()->route($routeName, $routeParameters);
    }

    private function fiscalTablesAreAvailable(): bool
    {
        try {
            return Schema::hasTable('tb26_configuracoes_fiscais')
                && Schema::hasTable('tb27_notas_fiscais');
        } catch (Throwable) {
            return false;
        }
    }

    private function taxLimitColumnsAreAvailable(): bool
    {
        try {
            if (! Schema::hasTable('tb26_configuracoes_fiscais')) {
                return false;
            }

            foreach ([
                'tb26_limite_imposto_ativo',
                'tb26_limite_imposto_diario',
                'tb26_limite_imposto_mensal',
                'tb26_limite_valor_compra',
                'tb26_limite_imposto_bloqueado_por',
                'tb26_limite_imposto_bloqueado_em',
            ] as $column) {
                if (! Schema::hasColumn('tb26_configuracoes_fiscais', $column)) {
                    return false;
                }
            }

            return true;
        } catch (Throwable) {
            return false;
        }
    }

    private function renderFiscalConfigPage(
        $units,
        int $selectedUnitId,
        ?Unidade $unit,
        array $configuration,
        $invoices,
        ?array $resolvedEndpoints,
        array $configurationDiagnostics,
        ?string $fiscalUnavailableMessage,
        ?string $invoiceLoadWarning,
        string $invoiceStatusFilter = 'error',
    ): Response {
        return Inertia::render('Settings/FiscalConfig', [
            'units' => $units,
            'selectedUnitId' => $selectedUnitId > 0 ? $selectedUnitId : null,
            'unit' => $unit ? [
                'id' => (int) $unit->tb2_id,
                'name' => $unit->tb2_nome,
                'cnpj' => $unit->tb2_cnpj,
                'endereco' => $unit->tb2_endereco,
                'cnpj_digits' => $this->onlyDigits($unit->tb2_cnpj),
            ] : null,
            'configuration' => $configuration,
            'resolvedEndpoints' => $resolvedEndpoints,
            'configurationDiagnostics' => $configurationDiagnostics,
            'invoices' => $invoices,
            'fiscalUnavailableMessage' => $fiscalUnavailableMessage,
            'invoiceLoadWarning' => $invoiceLoadWarning,
            'invoiceStatusFilter' => $invoiceStatusFilter,
            'canActivateFiscalGeneration' => ManagementScope::isMaster(request()->user()),
        ]);
    }

    private function renderNfePage(
        $units,
        int $selectedUnitId,
        ?Unidade $unit,
        $errorInvoices,
        $signedInvoices,
        $issuedInvoices,
        ?string $fiscalUnavailableMessage,
        ?string $invoiceLoadWarning,
        string $signedMode = 'signed',
        ?string $selectedDate = null,
        ?array $invoiceCounts = null,
        string $signedPaymentFilter = 'non_cash',
        string $signedOrderSearch = '',
        string $signedSort = 'time_desc',
        array $issuedCashierTotals = [],
    ): Response {
        return Inertia::render('Settings/Nfe', [
            'units' => $units,
            'selectedUnitId' => $selectedUnitId > 0 ? $selectedUnitId : null,
            'unit' => $unit ? [
                'id' => (int) $unit->tb2_id,
                'name' => $unit->tb2_nome,
                'cnpj' => $unit->tb2_cnpj,
                'endereco' => $unit->tb2_endereco,
                'cnpj_digits' => $this->onlyDigits($unit->tb2_cnpj),
            ] : null,
            'errorInvoices' => $errorInvoices,
            'signedInvoices' => $signedInvoices,
            'issuedInvoices' => $issuedInvoices,
            'fiscalUnavailableMessage' => $fiscalUnavailableMessage,
            'invoiceLoadWarning' => $invoiceLoadWarning,
            'signedMode' => $signedMode,
            'signedCashOnly' => $signedPaymentFilter === 'cash',
            'selectedDate' => $selectedDate ?? now()->toDateString(),
            'invoiceCounts' => array_merge($this->emptyNfeInvoiceCounts(), $invoiceCounts ?? []),
            'signedOrderSearch' => $signedOrderSearch,
            'signedSort' => $signedSort,
            'issuedCashierTotals' => $issuedCashierTotals,
        ]);
    }

    private function defaultFiscalConfigurationPayload(int $selectedUnitId): array
    {
        return [
            'tb2_id' => $selectedUnitId > 0 ? $selectedUnitId : null,
            'tb26_emitir_nfe' => false,
            'tb26_emitir_nfce' => false,
            'tb26_geracao_automatica_ativa' => false,
            'tb26_ambiente' => 'homologacao',
            'tb26_serie' => '1',
            'tb26_proximo_numero' => 1,
            'tb26_crt' => '',
            'tb26_csc_id' => '',
            'tb26_csc' => '',
            'tb26_certificado_tipo' => 'A1',
            'tb26_certificado_nome' => '',
            'tb26_certificado_cnpj' => '',
            'tb26_certificado_arquivo' => '',
            'tb26_certificado_valido_ate' => '',
            'tb26_razao_social' => '',
            'tb26_nome_fantasia' => '',
            'tb26_ie' => '',
            'tb26_im' => '',
            'tb26_cnae' => '',
            'tb26_logradouro' => '',
            'tb26_numero' => '',
            'tb26_complemento' => '',
            'tb26_bairro' => '',
            'tb26_codigo_municipio' => '',
            'tb26_municipio' => '',
            'tb26_uf' => '',
            'tb26_cep' => '',
            'tb26_telefone' => '',
            'tb26_email' => '',
            'has_certificate_password' => false,
        ];
    }

    private function buildFiscalConfigurationPayload(
        ?ConfiguracaoFiscal $configuration,
        ?Unidade $unit,
        int $selectedUnitId,
        FiscalCertificateService $fiscalCertificateService,
    ): array {
        return [
            'tb2_id' => $selectedUnitId > 0 ? $selectedUnitId : null,
            'tb26_emitir_nfe' => (bool) ($configuration?->tb26_emitir_nfe ?? false),
            'tb26_emitir_nfce' => (bool) ($configuration?->tb26_emitir_nfce ?? false),
            'tb26_geracao_automatica_ativa' => (bool) ($configuration?->tb26_geracao_automatica_ativa ?? false),
            'tb26_ambiente' => $configuration?->tb26_ambiente ?? 'homologacao',
            'tb26_serie' => $configuration?->tb26_serie ?? '1',
            'tb26_proximo_numero' => (int) ($configuration?->tb26_proximo_numero ?? 1),
            'tb26_crt' => $configuration?->tb26_crt ? (string) $configuration->tb26_crt : '',
            'tb26_csc_id' => $configuration?->tb26_csc_id ?? '',
            'tb26_csc' => $configuration?->tb26_csc ?? '',
            'tb26_certificado_tipo' => $configuration?->tb26_certificado_tipo ?? 'A1',
            'tb26_certificado_nome' => $configuration?->tb26_certificado_nome ?? '',
            'tb26_certificado_cnpj' => $configuration?->tb26_certificado_cnpj ?? '',
            'tb26_certificado_arquivo' => $configuration?->tb26_certificado_arquivo ?? '',
            'tb26_certificado_valido_ate' => $configuration?->tb26_certificado_valido_ate
                ? $configuration->tb26_certificado_valido_ate->format('d/m/y H:i')
                : '',
            'tb26_razao_social' => $configuration?->tb26_razao_social ?? '',
            'tb26_nome_fantasia' => $configuration?->tb26_nome_fantasia ?? ($unit?->tb2_nome ?? ''),
            'tb26_ie' => $configuration?->tb26_ie ?? '',
            'tb26_im' => $configuration?->tb26_im ?? '',
            'tb26_cnae' => $configuration?->tb26_cnae ?? '',
            'tb26_logradouro' => $configuration?->tb26_logradouro ?? '',
            'tb26_numero' => $configuration?->tb26_numero ?? '',
            'tb26_complemento' => $configuration?->tb26_complemento ?? '',
            'tb26_bairro' => $configuration?->tb26_bairro ?? '',
            'tb26_codigo_municipio' => $configuration?->tb26_codigo_municipio ?? '',
            'tb26_municipio' => $configuration?->tb26_municipio ?? '',
            'tb26_uf' => $configuration?->tb26_uf ?? '',
            'tb26_cep' => $configuration?->tb26_cep ?? '',
            'tb26_telefone' => $configuration?->tb26_telefone ?? '',
            'tb26_email' => $configuration?->tb26_email ?? '',
            'has_certificate_password' => $configuration ? $fiscalCertificateService->hasStoredPassword($configuration) : false,
        ];
    }

    private function buildFiscalTaxLimitPayload(?ConfiguracaoFiscal $configuration, int $selectedUnitId): array
    {
        return [
            'tb2_id' => $selectedUnitId > 0 ? $selectedUnitId : null,
            'tb26_geracao_automatica_ativa' => (bool) ($configuration?->tb26_geracao_automatica_ativa ?? false),
            'tb26_limite_imposto_ativo' => (bool) ($configuration?->tb26_limite_imposto_ativo ?? false),
            'tb26_limite_imposto_diario' => $configuration?->tb26_limite_imposto_diario,
            'tb26_limite_imposto_mensal' => $configuration?->tb26_limite_imposto_mensal,
            'tb26_limite_valor_compra' => $configuration?->tb26_limite_valor_compra,
            'tb26_limite_imposto_bloqueado_por' => $configuration?->tb26_limite_imposto_bloqueado_por,
            'tb26_limite_imposto_bloqueado_em' => optional($configuration?->tb26_limite_imposto_bloqueado_em)?->format('d/m/y H:i'),
        ];
    }

    private function defaultConfigurationDiagnostics(int $selectedUnitId): array
    {
        return [
            'selected_unit_id' => $selectedUnitId > 0 ? $selectedUnitId : null,
            'configuration_found' => false,
            'configuration_id' => null,
            'storage_path' => null,
            'storage_exists' => false,
            'legacy_storage_exists' => false,
            'raw_password_present' => false,
            'shared_password_present' => false,
            'password_decryptable' => null,
            'password_source' => null,
            'password_status' => 'Configuracao fiscal ainda nao encontrada no banco.',
            'raw_configuration_found' => false,
            'raw_configuration_id' => null,
            'loading_error' => null,
        ];
    }

    private function buildSafeExceptionMessage(Throwable $exception): string
    {
        $message = trim($exception->getMessage());

        if ($message !== '') {
            return $message;
        }

        return class_basename($exception);
    }

    private function buildConfigurationDiagnostics(
        ?ConfiguracaoFiscal $configuration,
        int $selectedUnitId,
        FiscalCertificateService $fiscalCertificateService,
    ): array
    {
        $diagnostics = $this->defaultConfigurationDiagnostics($selectedUnitId);

        if (! $configuration) {
            return $diagnostics;
        }

        $storagePath = $this->stringOrNull($configuration->tb26_certificado_arquivo);
        $rawPassword = trim((string) $configuration->getRawOriginal('tb26_certificado_senha'));
        $sharedPassword = trim((string) $configuration->getRawOriginal('tb26_certificado_senha_compartilhada'));
        $passwordDecryption = $fiscalCertificateService->resolveConfigurationPasswordDetails($configuration);

        $diagnostics['configuration_found'] = true;
        $diagnostics['configuration_id'] = (int) $configuration->tb26_id;
        $diagnostics['storage_path'] = $storagePath;
        $diagnostics['storage_exists'] = $storagePath ? Storage::exists($storagePath) : false;
        $diagnostics['legacy_storage_exists'] = $storagePath && ! str_starts_with($storagePath, 'private/')
            ? Storage::exists('private/' . $storagePath)
            : false;
        $diagnostics['raw_password_present'] = $rawPassword !== '' || $sharedPassword !== '';
        $diagnostics['shared_password_present'] = $sharedPassword !== '';
        $diagnostics['password_decryptable'] = $passwordDecryption['readable'];
        $diagnostics['password_status'] = $passwordDecryption['message'];
        $diagnostics['password_source'] = $passwordDecryption['source'];
        $diagnostics['raw_configuration_found'] = true;
        $diagnostics['raw_configuration_id'] = (int) $configuration->tb26_id;

        return $diagnostics;
    }

    private function buildRawConfigurationDiagnostics(int $selectedUnitId): array
    {
        $diagnostics = $this->defaultConfigurationDiagnostics($selectedUnitId);

        if ($selectedUnitId <= 0 || ! $this->fiscalTablesAreAvailable()) {
            return $diagnostics;
        }

        try {
            $row = DB::table('tb26_configuracoes_fiscais')
                ->where('tb2_id', $selectedUnitId)
                ->first([
                    'tb26_id',
                    'tb26_certificado_arquivo',
                    'tb26_certificado_senha',
                    'tb26_certificado_senha_compartilhada',
                ]);

            if (! $row) {
                return $diagnostics;
            }

            $storagePath = $this->stringOrNull($row->tb26_certificado_arquivo ?? null);

            $diagnostics['raw_configuration_found'] = true;
            $diagnostics['raw_configuration_id'] = (int) $row->tb26_id;
            $diagnostics['storage_path'] = $storagePath;
            $diagnostics['storage_exists'] = $storagePath ? Storage::exists($storagePath) : false;
            $diagnostics['legacy_storage_exists'] = $storagePath && ! str_starts_with($storagePath, 'private/')
                ? Storage::exists('private/' . $storagePath)
                : false;
            $diagnostics['raw_password_present'] = trim((string) ($row->tb26_certificado_senha ?? '')) !== '';
            $diagnostics['shared_password_present'] = trim((string) ($row->tb26_certificado_senha_compartilhada ?? '')) !== '';

            return $diagnostics;
        } catch (Throwable $exception) {
            $diagnostics['loading_error'] = sprintf(
                'Falha ao consultar a configuracao fiscal crua no banco: %s',
                $this->buildSafeExceptionMessage($exception)
            );

            return $diagnostics;
        }
    }
}
