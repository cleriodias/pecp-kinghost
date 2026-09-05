<?php

namespace App\Http\Controllers;

use App\Models\Matriz;
use App\Support\ManagementScope;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class MatrizController extends Controller
{
    private function ensureAuthorized(): void
    {
        $user = request()->user();

        if (! ManagementScope::isManagement($user)) {
            abort(403, 'Acesso negado.');
        }
    }

    public function index(): Response
    {
        $this->ensureAuthorized();

        $user = request()->user();

        $matrizesQuery = Matriz::query()
            ->withCount('unidades')
            ->orderBy('tb30_nome');

        if (ManagementScope::isManager($user)) {
            $unitIds = ManagementScope::managedUnitIds($user)->all();

            if (empty($unitIds)) {
                $matrizesQuery->whereRaw('1 = 0');
            } else {
                $matrizesQuery->whereHas('unidades', function ($query) use ($unitIds) {
                    $query->whereIn('tb2_unidades.tb2_id', $unitIds);
                });
            }
        }

        $matrizes = $matrizesQuery
            ->with([
                'unidades' => function ($query) {
                    $query->select([
                        'tb2_id',
                        'tb2_nome',
                        'tb2_status',
                        'matriz_id',
                    ])->orderBy('tb2_nome');
                },
            ])
            ->paginate(10);

        return Inertia::render('Matrizes/Index', [
            'matrizes' => $matrizes,
        ]);
    }

    public function edit(Matriz $matriz): Response
    {
        $this->ensureAuthorized();
        $this->ensureCanManageMatriz(request()->user(), $matriz);

        $matriz->loadCount('unidades');

        return Inertia::render('Matrizes/Edit', [
            'matriz' => $matriz,
        ]);
    }

    public function update(Request $request, Matriz $matriz): RedirectResponse
    {
        $this->ensureAuthorized();
        $this->ensureCanManageMatriz($request->user(), $matriz);

        $data = $request->validate(
            [
                'tb30_nome' => [
                    'required',
                    'string',
                    'max:255',
                    Rule::unique('tb30_matrizes', 'tb30_nome')->ignore($matriz->tb30_id, 'tb30_id'),
                ],
                'tb30_slug' => [
                    'required',
                    'string',
                    'max:255',
                    Rule::unique('tb30_matrizes', 'tb30_slug')->ignore($matriz->tb30_id, 'tb30_id'),
                ],
                'tb30_status' => ['required', 'integer', Rule::in([0, 1])],
            ],
            [
                'tb30_nome.required' => 'Informe o nome da matriz.',
                'tb30_nome.unique' => 'Ja existe uma matriz com esse nome.',
                'tb30_slug.required' => 'Informe o slug da matriz.',
                'tb30_slug.unique' => 'Ja existe uma matriz com esse slug.',
                'tb30_status.required' => 'Informe o status da matriz.',
                'tb30_status.in' => 'O status informado e invalido.',
            ]
        );

        $matriz->update([
            'tb30_nome' => $data['tb30_nome'],
            'tb30_slug' => Str::slug($data['tb30_slug']),
            'tb30_status' => (int) $data['tb30_status'],
        ]);

        return redirect()
            ->route('matrizes.index')
            ->with('success', 'Matriz atualizada com sucesso!');
    }

    private function ensureCanManageMatriz($user, Matriz $matriz): void
    {
        if (ManagementScope::isMaster($user)) {
            return;
        }

        if (! ManagementScope::isManager($user)) {
            abort(403, 'Acesso negado.');
        }

        $managedUnitIds = ManagementScope::managedUnitIds($user)->all();

        if (empty($managedUnitIds)) {
            abort(403, 'Acesso negado.');
        }

        $hasManagedUnits = $matriz->unidades()
            ->whereIn('tb2_unidades.tb2_id', $managedUnitIds)
            ->exists();

        if (! $hasManagedUnits) {
            abort(403, 'Acesso negado.');
        }
    }
}
