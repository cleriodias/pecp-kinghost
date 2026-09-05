<?php

namespace App\Http\Controllers;

use App\Models\ProductDiscard;
use App\Models\Produto;
use App\Support\ManagementScope;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ProductDiscardController extends Controller
{
    public function index(Request $request): Response
    {
        $activeUnit = $request->session()->get('active_unit');
        $unitId = is_array($activeUnit)
            ? ($activeUnit['id'] ?? $activeUnit['tb2_id'] ?? null)
            : (is_object($activeUnit) ? ($activeUnit->id ?? $activeUnit->tb2_id ?? null) : null);
        $unitId = $unitId ?? $request->user()->tb2_id;

        $recent = ProductDiscard::query()
            ->with('product:tb1_id,tb1_nome,tb1_codbar,tb1_vlr_venda')
            ->where('user_id', $request->user()->id)
            ->when($unitId, function ($query) use ($unitId) {
                $query->where(function ($subQuery) use ($unitId) {
                    $subQuery->where('unit_id', $unitId)
                        ->orWhereNull('unit_id');
                });
            })
            ->orderByDesc('created_at')
            ->limit(15)
            ->get()
            ->map(function (ProductDiscard $discard) {
                return [
                    'id' => $discard->id,
                    'quantity' => $discard->quantity,
                    'unit_price' => $discard->unit_price,
                    'created_at' => $discard->created_at->toIso8601String(),
                    'product' => $discard->product
                        ? [
                            'id' => $discard->product->tb1_id,
                            'name' => $discard->product->tb1_nome,
                            'barcode' => $discard->product->tb1_codbar,
                        ]
                        : null,
                ];
            });

        return Inertia::render('Products/ProductDiscard', [
            'recentDiscards' => $recent,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate(
            [
                'product_id' => [
                    'required',
                    'integer',
                    'exists:tb1_produto,tb1_id',
                ],
                'quantity' => [
                    'required',
                    'numeric',
                    'min:0.01',
                ],
                'unit_price' => [
                    'required',
                    'numeric',
                    'min:0',
                ],
            ],
            [
                'product_id.required' => 'Selecione um produto.',
                'product_id.integer' => 'O produto selecionado é inválido.',
                'product_id.exists' => 'O produto selecionado não foi encontrado.',
                'quantity.required' => 'Informe a quantidade descartada.',
                'quantity.numeric' => 'A quantidade deve ser um número válido.',
                'quantity.min' => 'A quantidade deve ser maior que zero.',
                'unit_price.required' => 'Informe o valor unitário.',
                'unit_price.numeric' => 'O valor unitário deve ser um número válido.',
                'unit_price.min' => 'O valor unitário não pode ser negativo.',
            ],
        );

        $activeUnit = $request->session()->get('active_unit');
        $unitId = is_array($activeUnit)
            ? ($activeUnit['id'] ?? $activeUnit['tb2_id'] ?? null)
            : (is_object($activeUnit) ? ($activeUnit->id ?? $activeUnit->tb2_id ?? null) : null);
        $unitId = $unitId ?? $request->user()->tb2_id;

        $product = Produto::findOrFail($data['product_id']);

        if ((int) $product->tb1_tipo !== 1) {
            return redirect()
                ->back()
                ->withErrors([
                    'product_id' => 'Apenas produtos do tipo balança podem ser descartados.',
                ]);
        }

        ProductDiscard::create([
            'product_id' => $product->tb1_id,
            'user_id' => $request->user()->id,
            'unit_id' => $unitId,
            'quantity' => $data['quantity'],
            'unit_price' => round((float) $data['unit_price'], 2),
        ]);

        return redirect()
            ->back()
            ->with('success', 'Descarte registrado com sucesso.');
    }

    public function destroy(Request $request, ProductDiscard $discard): RedirectResponse
    {
        $actingUser = $request->user();

        if (! $actingUser || ! ManagementScope::canManageDiscard($actingUser, $discard)) {
            abort(403);
        }

        $discard->delete();

        return redirect()
            ->back()
            ->with('success', 'Descarte excluido com sucesso.');
    }
}
