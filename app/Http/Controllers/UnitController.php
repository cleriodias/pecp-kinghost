<?php

namespace App\Http\Controllers;

use App\Models\ConfiguracaoFiscal;
use App\Models\Unidade;
use App\Support\FiscalTaxLimitService;
use App\Support\ManagementScope;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redirect;
use Inertia\Inertia;
use Inertia\Response;

class UnitController extends Controller
{
    private function ensureAuthorized(): void
    {
        $user = request()->user();

        if (!$user || !in_array((int) $user->funcao, [0, 1])) {
            abort(403, 'Acesso negado.');
        }
    }

    public function index(): Response
    {
        $this->ensureAuthorized();

        $user = request()->user();
        $todayStart = Carbon::today()->startOfDay();
        $todayEnd = Carbon::today()->endOfDay();
        $unitsQuery = Unidade::query()
            ->select('tb2_unidades.*')
            ->with('matriz:tb30_id,tb30_nome,tb30_status')
            ->with('configuracaoFiscal:tb26_id,tb2_id,tb26_geracao_automatica_ativa,tb26_limite_imposto_ativo,tb26_limite_imposto_diario,tb26_limite_imposto_mensal,tb26_limite_imposto_bloqueado_por,tb26_limite_imposto_bloqueado_em')
            ->selectSub(
                DB::table('tb27_notas_fiscais')
                    ->join('tb4_vendas_pg', 'tb4_vendas_pg.tb4_id', '=', 'tb27_notas_fiscais.tb4_id')
                    ->whereColumn('tb27_notas_fiscais.tb2_id', 'tb2_unidades.tb2_id')
                    ->where('tb27_notas_fiscais.tb27_status', 'emitida')
                    ->whereBetween('tb27_notas_fiscais.tb27_emitida_em', [$todayStart, $todayEnd])
                    ->selectRaw('COALESCE(SUM(tb4_vendas_pg.valor_total), 0)'),
                'tb2_nf_total'
            )
            ->orderByDesc('tb2_id');

        if (ManagementScope::isManager($user)) {
            $unitIds = ManagementScope::managedUnitIds($user)->all();

            if (empty($unitIds)) {
                $unitsQuery->whereRaw('1 = 0');
            } else {
                $unitsQuery->whereIn('tb2_id', $unitIds);
            }
        }

        $fiscalTaxLimitService = app(FiscalTaxLimitService::class);

        $units = $unitsQuery->paginate(10)->through(function (Unidade $unit) use ($fiscalTaxLimitService) {
            if ($unit->configuracaoFiscal) {
                $unit->setRelation(
                    'configuracaoFiscal',
                    $fiscalTaxLimitService->reactivateAutomaticGenerationIfEligible($unit->configuracaoFiscal)
                );
            }

            $unit->tb2_nf_total = round((float) ($unit->tb2_nf_total ?? 0), 2);
            $unit->tb26_geracao_automatica_ativa = (bool) (optional($unit->configuracaoFiscal)->tb26_geracao_automatica_ativa ?? false);

            return $unit;
        });

        return Inertia::render('Units/UnitIndex', [
            'units' => $units,
            'canCreate' => ManagementScope::isMaster($user),
            'canActivateFiscalGeneration' => ManagementScope::isMaster($user),
        ]);
    }

    public function show(Unidade $unit): Response
    {
        $this->ensureAuthorized();
        $this->ensureCanManageUnit(request()->user(), $unit);

        return Inertia::render('Units/UnitShow', [
            'unit' => $unit,
        ]);
    }

    public function create(): Response
    {
        $this->ensureAuthorized();
        $this->ensureCanCreateUnit(request()->user());

        return Inertia::render('Units/UnitCreate');
    }

    public function store(Request $request)
    {
        $this->ensureAuthorized();
        $this->ensureCanCreateUnit($request->user());

        $data = $this->validateUnit($request);

        $unit = Unidade::create([
            'tb2_nome' => $data['tb2_nome'],
            'tb2_endereco' => $data['tb2_endereco'],
            'tb2_cep' => $data['tb2_cep'],
            'tb2_fone' => $data['tb2_fone'],
            'tb2_cnpj' => $data['tb2_cnpj'],
            'tb2_localizacao' => $data['tb2_localizacao'],
            'tb2_status' => (int) $data['tb2_status'],
        ]);

        return Redirect::route('units.show', ['unit' => $unit->tb2_id])
            ->with('success', 'Unidade cadastrada com sucesso!');
    }

    public function edit(Unidade $unit): Response
    {
        $this->ensureAuthorized();
        $this->ensureCanManageUnit(request()->user(), $unit);

        return Inertia::render('Units/UnitEdit', [
            'unit' => $unit,
        ]);
    }

    public function update(Request $request, Unidade $unit)
    {
        $this->ensureAuthorized();
        $this->ensureCanManageUnit($request->user(), $unit);

        $data = $this->validateUnit($request);

        $unit->update([
            'tb2_nome' => $data['tb2_nome'],
            'tb2_endereco' => $data['tb2_endereco'],
            'tb2_cep' => $data['tb2_cep'],
            'tb2_fone' => $data['tb2_fone'],
            'tb2_cnpj' => $data['tb2_cnpj'],
            'tb2_localizacao' => $data['tb2_localizacao'],
            'tb2_status' => (int) $data['tb2_status'],
        ]);

        return Redirect::route('units.show', ['unit' => $unit->tb2_id])
            ->with('success', 'Unidade atualizada com sucesso!');
    }

    public function toggleFiscalGeneration(Request $request, Unidade $unit)
    {
        $this->ensureAuthorized();
        $this->ensureCanManageUnit($request->user(), $unit);

        $configuration = ConfiguracaoFiscal::firstOrNew([
            'tb2_id' => $unit->tb2_id,
        ]);

        $currentStatus = $configuration->exists
            ? (bool) $configuration->tb26_geracao_automatica_ativa
            : false;

        if (! $currentStatus) {
            if (! ManagementScope::isMaster($request->user())) {
                abort(403, 'Somente o master pode ativar a geracao automatica de notas.');
            }

            $request->validate(
                [
                    'current_password' => ['required', 'current_password'],
                ],
                [
                    'current_password.required' => 'Informe sua senha para ativar a geracao automatica de notas.',
                    'current_password.current_password' => 'A senha informada nao confere.',
                ]
            );
        }

        $configuration->tb26_geracao_automatica_ativa = ! $currentStatus;
        $configuration->save();

        if ($configuration->tb26_geracao_automatica_ativa) {
            app(FiscalTaxLimitService::class)->clearAutomaticLimitBlock($configuration);
        }

        return Redirect::back()->with(
            'success',
            $configuration->tb26_geracao_automatica_ativa
                ? 'Geracao automatica de notas ativada com sucesso.'
                : 'Geracao automatica de notas desativada com sucesso.'
        );
    }

    public function destroy(Unidade $unit)
    {
        $this->ensureAuthorized();
        $this->ensureCanManageUnit(request()->user(), $unit);

        $unit->delete();

        return Redirect::route('units.index')
            ->with('success', 'Unidade removida com sucesso!');
    }

    private function validateUnit(Request $request): array
    {
        $request->merge([
            'tb2_localizacao' => $this->normalizeMapUrl($request->input('tb2_localizacao')),
        ]);

        return $request->validate(
            [
                'tb2_nome' => 'required|string|max:255',
                'tb2_endereco' => 'required|string|max:255',
                'tb2_cep' => 'required|string|max:20',
                'tb2_fone' => 'required|string|max:20',
                'tb2_cnpj' => 'required|string|max:20',
                'tb2_localizacao' => 'required|url|max:512',
                'tb2_status' => 'required|integer|in:0,1',
            ],
            [
                'tb2_nome.required' => 'Informe o nome da unidade.',
                'tb2_endereco.required' => 'Informe o endere\u00E7o.',
                'tb2_cep.required' => 'Informe o CEP.',
                'tb2_fone.required' => 'Informe o telefone.',
                'tb2_cnpj.required' => 'Informe o CNPJ.',
                'tb2_localizacao.required' => 'Informe o link do Google Maps.',
                'tb2_localizacao.url' => 'O link de localiza\u00E7\u00E3o deve ser uma URL v\u00E1lida.',
                'tb2_status.required' => 'Informe o status da unidade.',
                'tb2_status.in' => 'O status da unidade e invalido.',
            ]
        );
    }

    private function normalizeMapUrl(?string $value): string
    {
        $value = trim((string) $value);

        if ($value === '') {
            return $value;
        }

        if (preg_match('/<iframe[^>]+src=["\']([^"\']+)["\']/i', $value, $matches)) {
            return $matches[1];
        }

        return $value;
    }

    private function ensureCanCreateUnit($user): void
    {
        if (! ManagementScope::isMaster($user)) {
            abort(403, 'Acesso negado.');
        }
    }

    private function ensureCanManageUnit($user, Unidade $unit): void
    {
        if (! $user || ! ManagementScope::canManageUnit($user, (int) $unit->tb2_id)) {
            abort(403, 'Acesso negado.');
        }
    }
}
