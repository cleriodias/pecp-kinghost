<?php

namespace App\Http\Controllers;

use App\Models\TipoProduto;
use App\Support\FiscalNcmValidator;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Redirect;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class ProductTypeController extends Controller
{
    private const NCM_TYPE_LABELS = [
        0 => 'Industria',
        3 => 'Balanca/Producao',
    ];

    public function index(): Response
    {
        return Inertia::render('Products/ProductTypeIndex', [
            'productTypes' => TipoProduto::query()
                ->withCount('produtos')
                ->orderBy('tb32_nome')
                ->get(),
            'ncmTypeOptions' => collect(self::NCM_TYPE_LABELS)
                ->map(fn (string $label, int $value) => ['value' => $value, 'label' => $label])
                ->values()
                ->all(),
        ]);
    }

    public function store(Request $request)
    {
        TipoProduto::create($this->validatedData($request));

        return Redirect::route('product-types.index')
            ->with('success', 'Tipo de produto cadastrado com sucesso!');
    }

    public function update(Request $request, TipoProduto $productType)
    {
        $productType->update($this->validatedData($request, $productType));

        return Redirect::route('product-types.index')
            ->with('success', 'Tipo de produto atualizado com sucesso!');
    }

    public function destroy(TipoProduto $productType)
    {
        if ($productType->produtos()->exists()) {
            throw ValidationException::withMessages([
                'productType' => 'Este tipo nao pode ser removido porque existem produtos vinculados a ele.',
            ]);
        }

        $productType->delete();

        return Redirect::route('product-types.index')
            ->with('success', 'Tipo de produto removido com sucesso!');
    }

    private function validatedData(Request $request, ?TipoProduto $productType = null): array
    {
        $request->merge([
            'tb32_nome' => trim((string) $request->input('tb32_nome')),
            'tb32_ncm' => preg_replace('/\D+/', '', (string) $request->input('tb32_ncm')),
            'tb32_tipo_ncm' => (int) $request->input('tb32_tipo_ncm', 0),
        ]);

        return $request->validate(
            [
                'tb32_nome' => [
                    'required',
                    'string',
                    'max:50',
                    Rule::unique('tb32_tipo_produto', 'tb32_nome')->ignore($productType?->tb32_id, 'tb32_id'),
                ],
                'tb32_ncm' => ['required', 'string', 'size:8', Rule::notIn(FiscalNcmValidator::invalidCodes())],
                'tb32_tipo_ncm' => ['required', 'integer', Rule::in(array_keys(self::NCM_TYPE_LABELS))],
            ],
            [
                'tb32_nome.required' => 'Informe o nome do tipo de produto.',
                'tb32_nome.max' => 'O nome nao pode exceder :max caracteres.',
                'tb32_nome.unique' => 'Este nome ja esta cadastrado.',
                'tb32_ncm.required' => 'Informe o NCM.',
                'tb32_ncm.size' => 'O NCM deve ter exatamente 8 digitos.',
                'tb32_ncm.not_in' => FiscalNcmValidator::invalidMessage($request->input('tb32_ncm')) ?? 'NCM invalido para emissao fiscal.',
                'tb32_tipo_ncm.required' => 'Selecione se o NCM e de Industria ou Balanca/Producao.',
                'tb32_tipo_ncm.in' => 'Tipo de NCM invalido.',
            ],
        );
    }
}
