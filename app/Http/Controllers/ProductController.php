<?php

namespace App\Http\Controllers;

use App\Models\Produto;
use App\Models\TipoProduto;
use App\Models\User;
use App\Support\FiscalNcmValidator;
use App\Support\ProductQuickLookupCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Redirect;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class ProductController extends Controller
{
    private const RESERVED_PRODUCT_ID_START = 3000;

    private const RESERVED_PRODUCT_ID_END = 3100;

    private const MAX_SAFE_PRODUCT_ID = 9999;

    private const TYPE_LABELS = [
        0 => 'Industria',
        1 => 'Balanca',
        2 => 'Servico',
        3 => 'Producao',
    ];

    private const STATUS_LABELS = [
        0 => 'Inativo',
        1 => 'Ativo',
    ];

    private const ORIGIN_LABELS = [
        0 => '0 - Nacional',
        1 => '1 - Estrangeira importacao direta',
        2 => '2 - Estrangeira adquirida no mercado interno',
        3 => '3 - Nacional com conteudo de importacao superior a 40%',
        4 => '4 - Nacional com processo produtivo basico',
        5 => '5 - Nacional com conteudo de importacao ate 40%',
        6 => '6 - Estrangeira importacao direta sem similar nacional',
        7 => '7 - Estrangeira mercado interno sem similar nacional',
        8 => '8 - Nacional com conteudo de importacao superior a 70%',
    ];

    private const PRODUCT_NAME_ENCODING = 'UTF-8';

    public function index(Request $request): Response
    {
        $search = trim((string) $request->input('search', ''));
        $vrCreditOnly = in_array(strtolower((string) $request->input('vr_credit', '0')), ['1', 'true'], true);
        $fiscalStatus = strtolower(trim((string) $request->input('fiscal_status', '')));
        $ncmFilter = $this->normalizeDigitsField($request->input('ncm'), 8) ?? '';
        $sort = (string) $request->input('sort', '');
        $direction = strtolower((string) $request->input('direction', 'asc'));
        $query = Produto::query();

        if ($search !== '') {
            $isNumeric = ctype_digit($search);
            $numericTerm = $isNumeric ? (int) $search : null;

            $query->where(function ($builder) use ($isNumeric, $numericTerm, $search) {
                if ($isNumeric) {
                    $builder->where('tb1_id', $numericTerm);

                    return;
                }

                $safeTerm = str_replace(['%', '_'], ['\%', '\_'], $search);
                $likeTerm = '%' . $safeTerm . '%';
                $builder->where('tb1_nome', 'like', $likeTerm);
            });
        }

        if ($vrCreditOnly) {
            $query->where('tb1_vr_credit', true);
        }

        if ($fiscalStatus === 'complete') {
            $this->applyCompleteFiscalFilter($query);
        } elseif ($fiscalStatus === 'incomplete') {
            $this->applyIncompleteFiscalFilter($query);
        }

        if ($ncmFilter !== '') {
            $query->whereRaw('TRIM(tb1_ncm) = ?', [$ncmFilter]);
        }

        $allowedSorts = [
            'tb1_favorito',
            'tb1_id',
            'tb1_nome',
            'tb1_vlr_custo',
            'tb1_vlr_venda',
            'tb1_codbar',
            'tb1_tipo',
            'tb1_qtd',
            'tb1_status',
        ];
        $allowedDirections = ['asc', 'desc'];

        if (! in_array($sort, $allowedSorts, true)) {
            $sort = '';
        }

        if (! in_array($direction, $allowedDirections, true)) {
            $direction = 'asc';
        }

        if ($sort !== '') {
            $query->orderBy($sort, $direction)
                ->orderBy('tb1_id', $direction);
        } else {
            $query->orderByDesc('tb1_favorito')
                ->orderByDesc('tb1_id');
            $direction = '';
        }

        $products = $query->paginate(10)->withQueryString();

        return Inertia::render('Products/ProductIndex', [
            'products' => $products,
            'typeLabels' => self::TYPE_LABELS,
            'statusLabels' => self::STATUS_LABELS,
            'search' => $search,
            'vrCreditOnly' => $vrCreditOnly,
            'fiscalStatus' => $fiscalStatus,
            'ncmFilter' => $ncmFilter,
            'ncmOptions' => $this->ncmFilterOptions(),
            'sort' => $sort,
            'direction' => $direction,
        ]);
    }

    public function show(Produto $product): Response
    {
        $product->load('tipoProduto');

        return Inertia::render('Products/ProductShow', [
            'product' => $product,
            'typeLabels' => self::TYPE_LABELS,
            'statusLabels' => self::STATUS_LABELS,
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('Products/ProductCreate', $this->formOptions());
    }

    public function fiscalQueue(): Response
    {
        $typeFilter = $this->resolveFiscalQueueTypeFilter(request());
        $search = $this->resolveFiscalQueueSearch(request());
        $pendingQuery = $this->pendingFiscalProductsQuery($typeFilter, $search);
        $formOptions = $this->formOptions();

        return Inertia::render('Products/ProductFiscalQueue', [
            'items' => $pendingQuery->limit(20)->get(),
            'pendingCount' => $this->pendingFiscalProductsQuery($typeFilter, $search)->count(),
            'selectedType' => $typeFilter,
            'search' => $search,
            'typeOptions' => $formOptions['typeOptions'],
            'productTypeOptions' => $formOptions['productTypeOptions'],
        ]);
    }

    public function fiscalQueueItems(Request $request): JsonResponse
    {
        $typeFilter = $this->resolveFiscalQueueTypeFilter($request);
        $search = $this->resolveFiscalQueueSearch($request);

        return response()->json([
            'items' => $this->pendingFiscalProductsQuery($typeFilter, $search)->limit(20)->get(),
            'pendingCount' => $this->pendingFiscalProductsQuery($typeFilter, $search)->count(),
            'selectedType' => $typeFilter,
            'search' => $search,
        ]);
    }

    public function updateFiscalQueueItem(
        Request $request,
        Produto $product,
        ProductQuickLookupCache $quickLookupCache
    ): JsonResponse
    {
        $data = $request->validate(
            [
                'tb32_id' => ['required', 'integer', Rule::exists('tb32_tipo_produto', 'tb32_id')],
                'tb1_ncm' => ['required', 'string', 'size:8', Rule::notIn(FiscalNcmValidator::invalidCodes())],
                'tb1_cfop' => ['required', 'string', Rule::in(['5101', '5102', '6102', '5405'])],
                'tb1_csosn' => ['required', 'string', 'max:4'],
                'tb1_cst' => ['required', 'string', 'max:3'],
            ],
            [
                'tb32_id.required' => 'Selecione o NCM.',
                'tb32_id.integer' => 'NCM invalido.',
                'tb32_id.exists' => 'O NCM selecionado nao existe.',
                'tb1_ncm.required' => 'Informe o NCM.',
                'tb1_ncm.size' => 'O NCM deve ter exatamente 8 digitos.',
                'tb1_ncm.not_in' => FiscalNcmValidator::invalidMessage($request->input('tb1_ncm')) ?? 'NCM invalido para emissao fiscal.',
                'tb1_cfop.required' => 'Informe o CFOP.',
                'tb1_cfop.in' => 'Selecione um CFOP valido.',
                'tb1_csosn.required' => 'Informe o CSOSN.',
                'tb1_csosn.max' => 'O CSOSN deve ter no maximo :max caracteres.',
                'tb1_cst.required' => 'Informe o CST.',
                'tb1_cst.max' => 'O CST deve ter no maximo :max caracteres.',
            ]
        );

        $productType = TipoProduto::query()->findOrFail($data['tb32_id']);
        $selectedNcm = $this->normalizeDigitsField($productType->tb32_ncm, 8);

        $fiscalData = $this->applyFiscalDefaults([
            'tb1_cfop' => $data['tb1_cfop'],
            'tb1_csosn' => $data['tb1_csosn'],
            'tb1_cst' => $data['tb1_cst'],
        ]);

        $product->update([
            'tb32_id' => (int) $data['tb32_id'],
            'tb1_ncm' => $selectedNcm,
            'tb1_cfop' => $fiscalData['tb1_cfop'],
            'tb1_csosn' => $fiscalData['tb1_csosn'],
            'tb1_cst' => $fiscalData['tb1_cst'],
        ]);
        $quickLookupCache->invalidateCatalog();

        return response()->json([
            'message' => 'Dados fiscais gravados com sucesso.',
            'product_id' => (int) $product->tb1_id,
        ]);
    }

    public function store(Request $request, ProductQuickLookupCache $quickLookupCache)
    {
        $data = $this->validateProduct($request);

        if ((int) ($data['tb1_tipo'] ?? 0) !== 1) {
            $data['tb1_id'] = $this->nextSafeProductId($this->shouldUseOwnIdAsBarcode($data));
        }

        $data['tb1_vr_credit'] = (bool) ($data['tb1_vr_credit'] ?? false);
        $data = $this->prepareProductData($data);

        $product = Produto::create($data);
        $quickLookupCache->invalidateCatalog();

        return Redirect::route('products.show', ['product' => $product->tb1_id])
            ->with('success', 'Produto cadastrado com sucesso!');
    }

    public function edit(Produto $product): Response
    {
        return Inertia::render('Products/ProductEdit', array_merge(
            ['product' => $product],
            $this->formOptions()
        ));
    }

    public function update(Request $request, Produto $product, ProductQuickLookupCache $quickLookupCache)
    {
        $data = $this->validateProduct($request, $product);
        $data['tb1_vr_credit'] = (bool) ($data['tb1_vr_credit'] ?? false);
        $data = $this->prepareProductData($data, $product);

        $product->update($data);
        $quickLookupCache->invalidateCatalog();

        return Redirect::route('products.show', ['product' => $product->tb1_id])
            ->with('success', 'Produto atualizado com sucesso!');
    }

    public function destroy(Produto $product, ProductQuickLookupCache $quickLookupCache)
    {
        $product->delete();
        $quickLookupCache->invalidateCatalog();

        return Redirect::route('products.index')
            ->with('success', 'Produto removido com sucesso!');
    }

    public function toggleFavorite(
        Request $request,
        Produto $product,
        ProductQuickLookupCache $quickLookupCache
    )
    {
        $data = $request->validate([
            'favorite' => 'required|boolean',
        ]);

        $product->update([
            'tb1_favorito' => $data['favorite'],
        ]);
        $quickLookupCache->invalidateCatalog();

        return Redirect::back()->with('success', $data['favorite'] ? 'Produto marcado como favorito.' : 'Produto removido dos favoritos.');
    }

    public function favorites(): JsonResponse
    {
        $favorites = Produto::query()
            ->where('tb1_favorito', true)
            ->where('tb1_status', 1)
            ->orderBy('tb1_nome')
            ->get([
                'tb1_id',
                'tb1_nome',
                'tb1_codbar',
                'tb1_vlr_custo',
                'tb1_vlr_venda',
                'tb1_tipo',
                'tb1_qtd',
                'tb1_status',
                'tb1_vr_credit',
            ]);

        return response()->json($favorites);
    }

    public function search(Request $request): JsonResponse
    {
        $term = trim((string) $request->input('q', ''));
        $typeFilter = $request->input('type');

        $isNumeric = ctype_digit($term);

        if (mb_strlen($term) < 3 && ! $isNumeric) {
            return response()->json([]);
        }

        $numericTerm = $isNumeric ? (int) $term : null;
            $booleanSearchTerm = $isNumeric ? null : $this->buildBooleanFullTextSearchTerm($term);

        $selectedColumns = [
            'tb1_id',
            'tb1_nome',
            'tb1_codbar',
            'tb1_vlr_custo',
            'tb1_vlr_venda',
            'tb1_tipo',
            'tb1_qtd',
            'tb1_status',
            'tb1_vr_credit',
        ];

        $baseQuery = Produto::query();

        if ($typeFilter !== null && $typeFilter !== '') {
            $baseQuery->where('tb1_tipo', (int) $typeFilter);
        }

        if ($isNumeric) {
            $products = (clone $baseQuery)
                ->where('tb1_id', $numericTerm)
                ->orderByDesc('tb1_status')
                ->orderBy('tb1_nome')
                ->limit(10)
                ->get($selectedColumns);

            return response()->json($products);
        }

        $safeLikeTerm = str_replace(['%', '_'], ['\\%', '\\_'], $term);

        try {
            $products = (clone $baseQuery)
                ->whereRaw('MATCH(tb1_nome) AGAINST (? IN BOOLEAN MODE)', [$booleanSearchTerm])
                ->orderByDesc('tb1_status')
                ->orderByRaw('MATCH(tb1_nome) AGAINST (? IN BOOLEAN MODE) DESC', [$booleanSearchTerm])
                ->orderBy('tb1_nome')
                ->limit(10)
                ->get($selectedColumns);

            if ($products->isEmpty()) {
                $products = (clone $baseQuery)
                    ->where('tb1_nome', 'like', '%' . $safeLikeTerm . '%')
                    ->orderByDesc('tb1_status')
                    ->orderBy('tb1_nome')
                    ->limit(10)
                    ->get($selectedColumns);
            }
        } catch (\Throwable $exception) {
            $products = (clone $baseQuery)
                ->where('tb1_nome', 'like', '%' . $safeLikeTerm . '%')
                ->orderByDesc('tb1_status')
                ->orderBy('tb1_nome')
                ->limit(10)
                ->get($selectedColumns);
        }

        return response()->json($products);
    }

    public function quickLookup(Request $request, ProductQuickLookupCache $quickLookupCache): JsonResponse
    {
        $term = trim((string) $request->input('q', ''));

        if ($term === '' || ! ctype_digit($term)) {
            return response()->json([
                'message' => 'Informe um codigo de barras ou ID numerico.',
            ], 422);
        }

        $weightedBarcode = $this->parseWeightedBarcode($term);
        $isLongNumeric = mb_strlen($term) > 4;

        $product = Produto::query()
            ->when($weightedBarcode !== null, function ($query) use ($weightedBarcode) {
                $query->where('tb1_id', $weightedBarcode['product_id']);
            })
            ->when($weightedBarcode === null && $isLongNumeric, function ($query) use ($term) {
                $query->where('tb1_codbar', $term);
            })
            ->when($weightedBarcode === null && ! $isLongNumeric, function ($query) use ($term) {
                $query->where('tb1_id', (int) $term);
            })
            ->first([
                'tb1_id',
                'tb1_nome',
                'tb1_codbar',
                'tb1_vlr_custo',
                'tb1_vlr_venda',
                'tb1_tipo',
                'tb1_qtd',
                'tb1_status',
                'tb1_vr_credit',
            ]);

        if (! $product) {
            return response()->json([
                'message' => 'Produto nao encontrado.',
            ], 404);
        }

        $quickLookupCache->rememberProductForRequest($product, $request);

        return response()->json($quickLookupCache->productPayload($product));
    }

    public function quickLookupSnapshot(Request $request, ProductQuickLookupCache $quickLookupCache): JsonResponse
    {
        $requestedVersion = max((int) $request->query('version', 0), 0);
        $snapshot = $quickLookupCache->snapshotForRequest($request);
        $currentVersion = (int) ($snapshot['version'] ?? 1);

        if ($requestedVersion === $currentVersion) {
            return response()->json([
                'changed' => false,
                'version' => $currentVersion,
            ]);
        }

        return response()->json([
            'changed' => true,
            'version' => $currentVersion,
            'products' => $snapshot['products'] ?? [],
        ]);
    }

    private function buildBooleanFullTextSearchTerm(string $term): string
    {
        $words = preg_split('/\s+/', trim($term)) ?: [];
        $words = array_values(array_filter(array_map(function (string $word) {
            $word = preg_replace('/[^\pL\pN]+/u', '', $word);

            if ($word === '') {
                return '';
            }

            return (mb_strlen($word) >= 3 ? '+' : '') . $word . '*';
        }, $words)));

        return $words !== [] ? implode(' ', $words) : trim($term);
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

        if ($productId <= 0) {
            return null;
        }

        return [
            'barcode' => $barcode,
            'product_id' => $productId,
        ];
    }

    private function validateProduct(Request $request, ?Produto $product = null): array
    {
        $request->merge([
            'tb1_ncm' => $this->nullableTrimmedInput($request->input('tb1_ncm')),
            'tb1_cest' => $this->nullableTrimmedInput($request->input('tb1_cest')),
            'tb1_cfop' => $this->nullableTrimmedInput($request->input('tb1_cfop')),
            'tb1_unidade_comercial' => $this->nullableTrimmedInput($request->input('tb1_unidade_comercial')),
            'tb1_unidade_tributavel' => $this->nullableTrimmedInput($request->input('tb1_unidade_tributavel')),
            'tb1_csosn' => $this->nullableTrimmedInput($request->input('tb1_csosn')),
            'tb1_cst' => $this->nullableTrimmedInput($request->input('tb1_cst')),
            'tb1_aliquota_icms' => $this->nullableTrimmedInput($request->input('tb1_aliquota_icms')),
        ]);

        $data = $request->validate(
            [
                'tb1_id' => [
                    Rule::requiredIf(fn () => (int) $request->input('tb1_tipo') === 1 && $product === null),
                    'nullable',
                    'integer',
                    'min:1',
                    'max:' . self::MAX_SAFE_PRODUCT_ID,
                ],
                'tb1_nome' => 'required|string|max:45',
                'tb1_vlr_custo' => 'required|numeric|min:0',
                'tb1_vlr_venda' => 'required|numeric|min:0|gte:tb1_vlr_custo',
                'tb1_codbar' => [
                    Rule::requiredIf(fn () => (int) $request->input('tb1_tipo') !== 1 && ! $request->boolean('sem_codigo_barras')),
                    'nullable',
                    'string',
                    'max:64',
                    Rule::unique('tb1_produto', 'tb1_codbar')->ignore($product?->tb1_id, 'tb1_id'),
                ],
                'tb1_tipo' => [
                    'required',
                    'integer',
                    Rule::in(array_keys(self::TYPE_LABELS)),
                ],
                'tb32_id' => ['required', 'integer', Rule::exists('tb32_tipo_produto', 'tb32_id')],
                'tb1_ncm' => ['nullable', 'string', 'size:8', Rule::notIn(FiscalNcmValidator::invalidCodes())],
                'tb1_cest' => ['nullable', 'string', 'size:7'],
                'tb1_cfop' => ['nullable', 'string', Rule::in(['5101', '5102', '6102', '5405'])],
                'tb1_unidade_comercial' => ['nullable', 'string', 'max:6'],
                'tb1_unidade_tributavel' => ['nullable', 'string', 'max:6'],
                'tb1_origem' => ['nullable', 'integer', Rule::in(array_keys(self::ORIGIN_LABELS))],
                'tb1_csosn' => ['nullable', 'string', 'max:4'],
                'tb1_cst' => ['nullable', 'string', 'max:3'],
                'tb1_aliquota_icms' => ['nullable', 'numeric', 'min:0', 'max:100'],
                'tb1_qtd' => [
                    Rule::requiredIf(fn () => (int) $request->input('tb1_tipo') === 3),
                    'nullable',
                    'integer',
                    'min:0',
                ],
                'tb1_status' => [
                    'required',
                    'integer',
                    Rule::in(array_keys(self::STATUS_LABELS)),
                ],
                'tb1_vr_credit' => [
                    'nullable',
                    'boolean',
                ],
                'sem_codigo_barras' => [
                    'nullable',
                    'boolean',
                ],
            ],
            [
                'tb1_id.required' => 'Informe o ID do produto de balanca.',
                'tb1_id.integer' => 'O ID do produto deve ser numerico.',
                'tb1_id.min' => 'O ID do produto deve ser maior que zero.',
                'tb1_id.max' => 'O ID do produto deve ser no maximo :max.',
                'tb1_nome.required' => 'Informe o nome do produto.',
                'tb1_nome.max' => 'O nome nao pode exceder :max caracteres.',
                'tb1_vlr_custo.required' => 'Informe o valor de custo.',
                'tb1_vlr_custo.numeric' => 'O valor de custo deve ser numerico.',
                'tb1_vlr_custo.min' => 'O valor de custo deve ser maior ou igual a zero.',
                'tb1_vlr_venda.required' => 'Informe o valor de venda.',
                'tb1_vlr_venda.numeric' => 'O valor de venda deve ser numerico.',
                'tb1_vlr_venda.min' => 'O valor de venda deve ser maior ou igual a zero.',
                'tb1_vlr_venda.gte' => 'O valor de venda deve ser maior que o valor de custo.',
                'tb1_codbar.required' => 'Informe o codigo de barras.',
                'tb1_codbar.max' => 'O codigo de barras deve ter no maximo :max caracteres.',
                'tb1_codbar.unique' => 'Este codigo de barras ja esta cadastrado.',
                'tb1_tipo.required' => 'Selecione o tipo do produto.',
                'tb1_tipo.integer' => 'Tipo de produto invalido.',
                'tb1_tipo.in' => 'Tipo de produto nao reconhecido.',
                'tb32_id.required' => 'Selecione o tipo de produto.',
                'tb32_id.integer' => 'Tipo de produto invalido.',
                'tb32_id.exists' => 'O tipo de produto selecionado nao existe.',
                'tb1_ncm.size' => 'O NCM deve ter exatamente 8 digitos.',
                'tb1_ncm.not_in' => FiscalNcmValidator::invalidMessage($request->input('tb1_ncm')) ?? 'NCM invalido para emissao fiscal.',
                'tb1_cest.size' => 'O CEST deve ter exatamente 7 digitos.',
                'tb1_cfop.in' => 'Selecione um CFOP valido.',
                'tb1_unidade_comercial.max' => 'A unidade comercial deve ter no maximo :max caracteres.',
                'tb1_unidade_tributavel.max' => 'A unidade tributavel deve ter no maximo :max caracteres.',
                'tb1_origem.in' => 'Origem fiscal invalida.',
                'tb1_csosn.max' => 'O CSOSN deve ter no maximo :max caracteres.',
                'tb1_cst.max' => 'O CST deve ter no maximo :max caracteres.',
                'tb1_aliquota_icms.numeric' => 'A aliquota de ICMS deve ser numerica.',
                'tb1_aliquota_icms.min' => 'A aliquota de ICMS nao pode ser negativa.',
                'tb1_aliquota_icms.max' => 'A aliquota de ICMS nao pode ultrapassar 100%.',
                'tb1_qtd.required' => 'Informe a quantidade em estoque para o produto de Producao.',
                'tb1_qtd.integer' => 'A quantidade em estoque deve ser numerica e inteira.',
                'tb1_qtd.min' => 'A quantidade em estoque nao pode ser negativa.',
                'tb1_status.required' => 'Selecione o status do produto.',
                'tb1_status.integer' => 'Status invalido.',
                'tb1_status.in' => 'Status nao reconhecido.',
                'tb1_vr_credit.boolean' => 'Valor invalido para VR Credito.',
                'sem_codigo_barras.boolean' => 'Valor invalido para a opcao sem codigo de barras.',
            ]
        );

        $requestedId = isset($data['tb1_id']) ? (int) $data['tb1_id'] : null;

        if ($product && $requestedId !== null && $requestedId !== (int) $product->tb1_id) {
            throw ValidationException::withMessages([
                'tb1_id' => 'Nao e permitido alterar o ID de um produto ja cadastrado.',
            ]);
        }

        if ($product === null && (int) ($data['tb1_tipo'] ?? 0) === 1 && $requestedId !== null) {
            if ($this->isReservedProductId($requestedId)) {
                throw ValidationException::withMessages([
                    'tb1_id' => sprintf(
                        'Os IDs de %d a %d sao reservados para comandas. Informe outro ID de balanca.',
                        self::RESERVED_PRODUCT_ID_START,
                        self::RESERVED_PRODUCT_ID_END
                    ),
                ]);
            }

            $existingProduct = Produto::query()->find($requestedId);

            if ($existingProduct) {
                throw ValidationException::withMessages([
                    'tb1_id' => $this->existingProductMessage($existingProduct),
                ]);
            }
        }

        $this->ensurePriceEditingIsAuthorized($data, $product, $request->user());

        $resolvedBarcode = $this->resolveProductBarcode($data, $product);

        if ($resolvedBarcode !== '') {
            $barcodeInUse = Produto::query()
                ->where('tb1_codbar', $resolvedBarcode)
                ->when(
                    $product,
                    fn ($query) => $query->where('tb1_id', '!=', $product->tb1_id)
                )
                ->first();

            if ($barcodeInUse) {
                $field = $this->shouldUseOwnIdAsBarcode($data, $product) ? 'tb1_id' : 'tb1_codbar';

                throw ValidationException::withMessages([
                    $field => sprintf(
                        'O codigo de barras %s ja esta em uso no produto %d.',
                        $resolvedBarcode,
                        $barcodeInUse->tb1_id
                    ),
                ]);
            }
        }

        return $data;
    }

    private function nullableTrimmedInput(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $normalized = trim((string) $value);

        return $normalized === '' ? null : $normalized;
    }

    private function formOptions(): array
    {
        $format = fn (array $labels) => collect($labels)
            ->map(fn (string $label, int $value) => ['value' => $value, 'label' => $label])
            ->values()
            ->all();

        return [
            'typeOptions' => $format(self::TYPE_LABELS),
            'statusOptions' => $format(self::STATUS_LABELS),
            'originOptions' => $format(self::ORIGIN_LABELS),
            'productTypeOptions' => TipoProduto::query()
                ->orderBy('tb32_nome')
                ->get(['tb32_id', 'tb32_nome', 'tb32_ncm', 'tb32_tipo_ncm'])
                ->map(fn (TipoProduto $type) => [
                    'value' => $type->tb32_id,
                    'label' => $type->tb32_nome,
                    'ncm' => $type->tb32_ncm,
                    'ncmType' => $type->tb32_tipo_ncm,
                    'tb32_tipo_ncm' => $type->tb32_tipo_ncm,
                ])
                ->values()
                ->all(),
        ];
    }

    private function ncmFilterOptions(): array
    {
        return TipoProduto::query()
            ->whereNotNull('tb32_ncm')
            ->whereRaw("TRIM(tb32_ncm) <> ''")
            ->orderBy('tb32_nome')
            ->get(['tb32_nome', 'tb32_ncm'])
            ->map(function (TipoProduto $type) {
                $ncm = $this->normalizeDigitsField($type->tb32_ncm, 8);

                if ($ncm === null) {
                    return null;
                }

                return [
                    'value' => $ncm,
                    'label' => trim((string) $type->tb32_nome),
                ];
            })
            ->filter()
            ->unique('value')
            ->values()
            ->all();
    }

    private function pendingFiscalProductsQuery(?int $typeFilter = null, string $search = '')
    {
        $query = Produto::query()
            ->select([
                'tb1_id',
                'tb1_nome',
                'tb1_codbar',
                'tb1_tipo',
                'tb32_id',
                'tb1_ncm',
                'tb1_cfop',
                'tb1_csosn',
                'tb1_cst',
            ])
            ->when($typeFilter !== null, function ($query) use ($typeFilter) {
                $query->where('tb1_tipo', $typeFilter);
            })
            ->when($search !== '', function ($query) use ($search) {
                $isNumeric = ctype_digit($search);
                $numericTerm = $isNumeric ? (int) $search : null;

                $query->where(function ($builder) use ($isNumeric, $numericTerm, $search) {
                    if ($isNumeric) {
                        $builder->where('tb1_id', $numericTerm);

                        return;
                    }

                    $safeTerm = str_replace(['%', '_'], ['\%', '\_'], $search);
                    $likeTerm = '%' . $safeTerm . '%';
                    $builder->where('tb1_nome', 'like', $likeTerm);
                });
            });

        $this->applyMissingFiscalQueueFilter($query);

        return $query->orderBy('tb1_id');
    }

    private function applyMissingFiscalQueueFilter($query): void
    {
        $query->where(function ($query) {
            $query
                ->whereNull('tb32_id')
                ->orWhereNull('tb1_ncm')
                ->orWhereRaw("TRIM(tb1_ncm) = ''")
                ->orWhereNull('tb1_cfop')
                ->orWhereRaw("TRIM(tb1_cfop) = ''")
                ->orWhereNull('tb1_csosn')
                ->orWhereRaw("TRIM(tb1_csosn) = ''")
                ->orWhereNull('tb1_cst')
                ->orWhereRaw("TRIM(tb1_cst) = ''");
        });
    }

    private function applyIncompleteFiscalFilter($query): void
    {
        $query->where(function ($query) {
            $query
                ->whereNull('tb1_ncm')
                ->orWhereRaw("TRIM(tb1_ncm) = ''")
                ->orWhereNull('tb1_cfop')
                ->orWhereRaw("TRIM(tb1_cfop) NOT IN (?, ?, ?)", ['5101', '5102', '5405'])
                ->orWhereNull('tb1_csosn')
                ->orWhereRaw("
                    CASE
                        WHEN TRIM(tb1_cfop) = '5405' THEN TRIM(tb1_csosn) <> '500'
                        WHEN TRIM(tb1_cfop) IN ('5101', '5102') THEN TRIM(tb1_csosn) <> '102'
                        ELSE TRUE
                    END
                ")
                ->orWhereNull('tb1_cst')
                ->orWhereRaw("TRIM(tb1_cst) <> ?", ['00']);
        });
    }

    private function applyCompleteFiscalFilter($query): void
    {
        $query
            ->whereNotNull('tb1_ncm')
            ->whereRaw("TRIM(tb1_ncm) <> ''")
            ->whereRaw("TRIM(tb1_cfop) IN (?, ?, ?)", ['5101', '5102', '5405'])
            ->whereRaw("
                CASE
                    WHEN TRIM(tb1_cfop) = '5405' THEN TRIM(tb1_csosn) = '500'
                    WHEN TRIM(tb1_cfop) IN ('5101', '5102') THEN TRIM(tb1_csosn) = '102'
                    ELSE FALSE
                END
            ")
            ->whereRaw("TRIM(tb1_cst) = ?", ['00']);
    }

    private function resolveFiscalQueueTypeFilter(Request $request): ?int
    {
        $type = $request->input('type');

        if ($type === null || $type === '') {
            return null;
        }

        $type = (int) $type;

        return array_key_exists($type, self::TYPE_LABELS) ? $type : null;
    }

    private function resolveFiscalQueueSearch(Request $request): string
    {
        return trim((string) $request->input('search', ''));
    }

    private function prepareProductData(array $data, ?Produto $product = null): array
    {
        $type = (int) ($data['tb1_tipo'] ?? $product?->tb1_tipo ?? 0);

        $data['tb1_nome'] = $this->normalizeProductName($data['tb1_nome'] ?? $product?->tb1_nome ?? '');
        $data['tb1_codbar'] = $this->resolveProductBarcode($data, $product);
        $data['tb1_ncm'] = $this->normalizeDigitsField($data['tb1_ncm'] ?? $product?->tb1_ncm ?? null, 8);
        $data['tb1_cest'] = $this->normalizeDigitsField($data['tb1_cest'] ?? $product?->tb1_cest ?? null, 7);
        $data['tb1_cfop'] = $this->normalizeDigitsField($data['tb1_cfop'] ?? $product?->tb1_cfop ?? null, 4);
        $data['tb1_unidade_comercial'] = $this->normalizeShortCode($data['tb1_unidade_comercial'] ?? $product?->tb1_unidade_comercial ?? 'UN', 'UN');
        $data['tb1_unidade_tributavel'] = $this->normalizeShortCode($data['tb1_unidade_tributavel'] ?? $product?->tb1_unidade_tributavel ?? 'UN', 'UN');
        $data['tb1_origem'] = isset($data['tb1_origem']) && $data['tb1_origem'] !== ''
            ? (int) $data['tb1_origem']
            : (int) ($product?->tb1_origem ?? 0);
        $data['tb1_csosn'] = $this->normalizeDigitsField($data['tb1_csosn'] ?? $product?->tb1_csosn ?? null, 4);
        $data['tb1_cst'] = $this->normalizeDigitsField($data['tb1_cst'] ?? $product?->tb1_cst ?? null, 3);
        $data = $this->applyFiscalDefaults($data);
        $data['tb1_aliquota_icms'] = round((float) ($data['tb1_aliquota_icms'] ?? $product?->tb1_aliquota_icms ?? 0), 2);

        $data['tb1_qtd'] = $type === 3
            ? (int) ($data['tb1_qtd'] ?? $product?->tb1_qtd ?? 0)
            : 0;

        unset($data['sem_codigo_barras']);

        if ($product) {
            unset($data['tb1_id']);
        }

        return $data;
    }

    private function resolveProductBarcode(array $data, ?Produto $product = null): string
    {
        if ($this->shouldUseOwnIdAsBarcode($data, $product)) {
            $productId = isset($data['tb1_id'])
                ? (int) $data['tb1_id']
                : (int) ($product?->tb1_id ?? 0);

            return $this->formatGeneratedBarcode($productId);
        }

        return trim((string) ($data['tb1_codbar'] ?? $product?->tb1_codbar ?? ''));
    }

    private function nextSafeProductId(bool $reserveOwnIdBarcode = false): int
    {
        $maxExistingId = (int) Produto::query()
            ->where('tb1_id', '<=', self::MAX_SAFE_PRODUCT_ID)
            ->where(function ($query) {
                $query->where('tb1_id', '<', self::RESERVED_PRODUCT_ID_START)
                    ->orWhere('tb1_id', '>', self::RESERVED_PRODUCT_ID_END);
            })
            ->max('tb1_id');

        $candidateId = $maxExistingId + 1;

        while ($candidateId <= self::MAX_SAFE_PRODUCT_ID) {
            if ($candidateId >= self::RESERVED_PRODUCT_ID_START && $candidateId <= self::RESERVED_PRODUCT_ID_END) {
                $candidateId = self::RESERVED_PRODUCT_ID_END + 1;
                continue;
            }

            if (! $reserveOwnIdBarcode) {
                return $candidateId;
            }

            $generatedBarcode = $this->formatGeneratedBarcode($candidateId);

            $barcodeInUse = Produto::query()
                ->where('tb1_codbar', $generatedBarcode)
                ->exists();

            if (! $barcodeInUse) {
                return $candidateId;
            }

            $candidateId++;
        }

        throw ValidationException::withMessages([
            'tb1_nome' => 'Nao ha mais IDs seguros disponiveis para novos produtos.',
        ]);
    }

    private function isReservedProductId(int $productId): bool
    {
        return $productId >= self::RESERVED_PRODUCT_ID_START
            && $productId <= self::RESERVED_PRODUCT_ID_END;
    }

    private function ensurePriceEditingIsAuthorized(array $data, ?Produto $product, ?User $user): void
    {
        if (! $product || $this->canEditProductPrices($user)) {
            return;
        }

        $errors = [];

        if ($this->priceValueChanged($data['tb1_vlr_custo'] ?? null, $product->tb1_vlr_custo)) {
            $errors['tb1_vlr_custo'] = 'Apenas Master, Gerente e Sub-Gerente podem alterar o valor de custo.';
        }

        if ($this->priceValueChanged($data['tb1_vlr_venda'] ?? null, $product->tb1_vlr_venda)) {
            $errors['tb1_vlr_venda'] = 'Apenas Master, Gerente e Sub-Gerente podem alterar o valor de venda.';
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }

    private function canEditProductPrices(?User $user): bool
    {
        return $user instanceof User
            && in_array((int) $user->funcao, [0, 1, 2], true);
    }

    private function priceValueChanged(mixed $requestedValue, mixed $currentValue): bool
    {
        if ($requestedValue === null) {
            return false;
        }

        return abs((float) $requestedValue - (float) $currentValue) > 0.00001;
    }

    private function existingProductMessage(Produto $product): string
    {
        $type = self::TYPE_LABELS[(int) $product->tb1_tipo] ?? '---';
        $status = self::STATUS_LABELS[(int) $product->tb1_status] ?? '---';

        return sprintf(
            'O ID %d ja esta cadastrado. Nome: %s | Tipo: %s | Status: %s.',
            $product->tb1_id,
            $product->tb1_nome,
            $type,
            $status
        );
    }

    private function shouldUseOwnIdAsBarcode(array $data, ?Produto $product = null): bool
    {
        $type = (int) ($data['tb1_tipo'] ?? $product?->tb1_tipo ?? 0);

        if ($type === 1) {
            return true;
        }

        return (bool) ($data['sem_codigo_barras'] ?? false);
    }

    private function formatGeneratedBarcode(int $productId): string
    {
        if ($productId <= 0) {
            return '';
        }

        return (string) $productId;
    }

    private function normalizeProductName(mixed $value): string
    {
        $normalized = trim((string) $value);

        if ($normalized === '') {
            return '';
        }

        return mb_strtoupper($normalized, self::PRODUCT_NAME_ENCODING);
    }

    private function normalizeDigitsField(mixed $value, int $size): ?string
    {
        $normalized = preg_replace('/\D+/', '', (string) $value);

        if ($normalized === '') {
            return null;
        }

        return mb_substr($normalized, 0, $size);
    }

    private function applyFiscalDefaults(array $data): array
    {
        $cfop = $this->normalizeDigitsField($data['tb1_cfop'] ?? null, 4);

        $data['tb1_cfop'] = $cfop;
        $data['tb1_csosn'] = match ($cfop) {
            '5405' => '500',
            '5101', '5102' => '102',
            default => $this->normalizeDigitsField($data['tb1_csosn'] ?? null, 4),
        };
        $data['tb1_cst'] = '00';

        return $data;
    }

    private function normalizeShortCode(mixed $value, string $fallback): string
    {
        $normalized = trim((string) $value);
        $normalized = $normalized === '' ? $fallback : $normalized;

        return mb_strtoupper($normalized, self::PRODUCT_NAME_ENCODING);
    }
}
