<?php

namespace App\Http\Controllers;

use App\Models\ProductStockMovement;
use App\Models\Produto;
use App\Support\ProductQuickLookupCache;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class ProductStockController extends Controller
{
    private const PRODUCT_TYPE_PRODUCTION = 3;

    private const MOVEMENT_LABELS = [
        1 => 'Entrada',
        0 => 'Saida',
    ];

    public function index(Request $request): Response
    {
        $productionProducts = Produto::query()
            ->where('tb1_tipo', self::PRODUCT_TYPE_PRODUCTION)
            ->orderByDesc('tb1_status')
            ->orderBy('tb1_nome')
            ->get([
                'tb1_id',
                'tb1_nome',
                'tb1_codbar',
                'tb1_qtd',
                'tb1_status',
            ]);

        $selectedProductId = (int) $request->query('product_id', 0);
        $selectedProductId = $productionProducts->contains('tb1_id', $selectedProductId)
            ? $selectedProductId
            : null;

        $recentMovements = ProductStockMovement::query()
            ->with([
                'product:tb1_id,tb1_nome,tb1_codbar',
                'user:id,name',
            ])
            ->orderByDesc('created_at')
            ->limit(30)
            ->get()
            ->map(fn (ProductStockMovement $movement) => [
                'id' => $movement->id,
                'movement_type' => (int) $movement->movement_type,
                'movement_label' => self::MOVEMENT_LABELS[(int) $movement->movement_type] ?? '---',
                'quantity' => (int) $movement->quantity,
                'stock_before' => (int) $movement->stock_before,
                'stock_after' => (int) $movement->stock_after,
                'notes' => $movement->notes,
                'created_at' => optional($movement->created_at)->toIso8601String(),
                'product' => $movement->product
                    ? [
                        'id' => $movement->product->tb1_id,
                        'name' => $movement->product->tb1_nome,
                        'barcode' => $movement->product->tb1_codbar,
                    ]
                    : null,
                'user' => $movement->user
                    ? [
                        'id' => $movement->user->id,
                        'name' => $movement->user->name,
                    ]
                    : null,
            ])
            ->values();

        return Inertia::render('Products/ProductionStock', [
            'productionProducts' => $productionProducts,
            'movementTypeOptions' => collect(self::MOVEMENT_LABELS)
                ->map(fn (string $label, int $value) => [
                    'value' => $value,
                    'label' => $label,
                ])
                ->values()
                ->all(),
            'recentMovements' => $recentMovements,
            'selectedProductId' => $selectedProductId,
        ]);
    }

    public function store(Request $request, ProductQuickLookupCache $quickLookupCache): RedirectResponse
    {
        $data = $request->validate(
            [
                'product_id' => [
                    'required',
                    'integer',
                    Rule::exists('tb1_produto', 'tb1_id')->where(
                        fn ($query) => $query->where('tb1_tipo', self::PRODUCT_TYPE_PRODUCTION)
                    ),
                ],
                'movement_type' => [
                    'required',
                    'integer',
                    Rule::in(array_keys(self::MOVEMENT_LABELS)),
                ],
                'quantity' => [
                    'required',
                    'integer',
                    'min:1',
                ],
                'notes' => [
                    'nullable',
                    'string',
                    'max:255',
                ],
            ],
            [
                'product_id.required' => 'Selecione um produto de Producao.',
                'product_id.integer' => 'Produto invalido.',
                'product_id.exists' => 'O produto selecionado nao e do tipo Producao.',
                'movement_type.required' => 'Selecione o tipo de movimentacao.',
                'movement_type.integer' => 'Tipo de movimentacao invalido.',
                'movement_type.in' => 'Tipo de movimentacao nao reconhecido.',
                'quantity.required' => 'Informe a quantidade.',
                'quantity.integer' => 'A quantidade deve ser numerica e inteira.',
                'quantity.min' => 'A quantidade deve ser maior que zero.',
                'notes.max' => 'A observacao deve ter no maximo :max caracteres.',
            ]
        );

        DB::transaction(function () use ($data, $request) {
            /** @var Produto $product */
            $product = Produto::query()
                ->where('tb1_id', $data['product_id'])
                ->lockForUpdate()
                ->firstOrFail();

            $currentStock = (int) ($product->tb1_qtd ?? 0);
            $quantity = (int) $data['quantity'];
            $movementType = (int) $data['movement_type'];
            $stockAfter = $movementType === 1
                ? $currentStock + $quantity
                : $currentStock - $quantity;

            if ($stockAfter < 0) {
                throw ValidationException::withMessages([
                    'quantity' => sprintf(
                        'Estoque insuficiente para saida. Saldo atual de %s: %d.',
                        $product->tb1_nome,
                        $currentStock
                    ),
                ]);
            }

            $product->update([
                'tb1_qtd' => $stockAfter,
            ]);

            ProductStockMovement::create([
                'product_id' => $product->tb1_id,
                'user_id' => $request->user()?->id,
                'movement_type' => $movementType,
                'quantity' => $quantity,
                'stock_before' => $currentStock,
                'stock_after' => $stockAfter,
                'notes' => trim((string) ($data['notes'] ?? '')) ?: null,
            ]);
        });
        $quickLookupCache->invalidateCatalog();

        return redirect()
            ->route('products.production-stock', ['product_id' => $data['product_id']])
            ->with('success', 'Movimentacao de estoque registrada com sucesso!');
    }
}
