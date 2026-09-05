<?php

namespace App\Http\Controllers;

use App\Models\AnyDesckCode;
use App\Models\Unidade;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class AnyDesckController extends Controller
{
    public function index(Request $request): Response
    {
        $this->ensureMaster($request->user());

        $codes = AnyDesckCode::with('unit')
            ->orderBy('type')
            ->orderBy('code')
            ->get()
            ->map(fn (AnyDesckCode $item) => [
                'id' => $item->id,
                'code' => $item->code,
                'type' => $item->type,
                'unit_id' => $item->unit_id,
                'store' => $item->unit?->tb2_nome,
            ]);

        return Inertia::render('Settings/AnyDesck', [
            'codes' => $codes,
            'stores' => Unidade::active()->orderBy('tb2_nome')->get([
                'tb2_id',
                'tb2_nome',
            ]),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->ensureMaster($request->user());

        $normalizedCode = $this->normalizeCode((string) $request->input('code'));
        $request->merge([
            'code' => $normalizedCode,
        ]);

        $data = $request->validate([
            'code' => [
                'required',
                'string',
                'regex:/^\d \d{3} \d{3} \d{3}$/',
                Rule::unique('tb23_anydesck_codigos', 'code'),
            ],
            'unit_id' => [
                'required',
                'integer',
                Rule::exists('tb2_unidades', 'tb2_id'),
            ],
            'type' => [
                'required',
                'string',
                Rule::in(['Caixa', 'Lanchonete']),
            ],
        ], [
            'code.required' => 'Informe o codigo do AnyDesck.',
            'code.regex' => 'Use o formato 1 186 429 402.',
            'code.unique' => 'Este codigo ja foi cadastrado.',
            'unit_id.required' => 'Selecione a loja.',
            'unit_id.exists' => 'A loja selecionada e invalida.',
            'type.required' => 'Selecione o tipo.',
            'type.in' => 'O tipo deve ser Caixa ou Lanchonete.',
        ]);

        AnyDesckCode::create($data);

        return redirect()
            ->route('settings.anydesck')
            ->with('success', 'Codigo AnyDesck cadastrado com sucesso!');
    }

    public function update(Request $request, AnyDesckCode $anydesck): RedirectResponse
    {
        $this->ensureMaster($request->user());

        $normalizedCode = $this->normalizeCode((string) $request->input('code'));
        $request->merge([
            'code' => $normalizedCode,
        ]);

        $data = $request->validate([
            'code' => [
                'required',
                'string',
                'regex:/^\d \d{3} \d{3} \d{3}$/',
                Rule::unique('tb23_anydesck_codigos', 'code')->ignore($anydesck->id),
            ],
            'unit_id' => [
                'required',
                'integer',
                Rule::exists('tb2_unidades', 'tb2_id'),
            ],
            'type' => [
                'required',
                'string',
                Rule::in(['Caixa', 'Lanchonete']),
            ],
        ], [
            'code.required' => 'Informe o codigo do AnyDesck.',
            'code.regex' => 'Use o formato 1 186 429 402.',
            'code.unique' => 'Este codigo ja foi cadastrado.',
            'unit_id.required' => 'Selecione a loja.',
            'unit_id.exists' => 'A loja selecionada e invalida.',
            'type.required' => 'Selecione o tipo.',
            'type.in' => 'O tipo deve ser Caixa ou Lanchonete.',
        ]);

        $anydesck->update($data);

        return redirect()
            ->route('settings.anydesck')
            ->with('success', 'Codigo AnyDesck atualizado com sucesso!');
    }

    private function ensureMaster($user): void
    {
        if (! $user || (int) $user->funcao !== 0) {
            abort(403);
        }
    }

    private function normalizeCode(string $value): string
    {
        $digits = preg_replace('/\D/', '', $value) ?? '';

        if (strlen($digits) !== 10) {
            return trim($value);
        }

        return preg_replace('/(\d)(\d{3})(\d{3})(\d{3})/', '$1 $2 $3 $4', $digits) ?? trim($value);
    }
}
