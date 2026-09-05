<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Unidade;
use App\Models\Venda;
use App\Models\SalaryAdvance;
use App\Models\OnlineUser;
use App\Support\ManagementScope;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Redirect;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Schema;
use Inertia\Inertia;
use Inertia\Response;

class UserController extends Controller
{
    private const COMPANY_EMAIL_DOMAIN = 'paoecafepremium.com.br';

    public function __construct()
    {
        $this->middleware(function ($request, $next) {
            $user = $request->user();
            if (! $user) {
                abort(403);
            }

            $routeName = $request->route()?->getName();
            $funcao = (int) $user->funcao;

            if ($funcao === 3 && $routeName === 'users.search') {
                return $next($request);
            }

            if ($funcao === 2 && in_array($routeName, ['users.index', 'users.search'], true)) {
                return $next($request);
            }

            if (in_array($funcao, [0, 1], true)) {
                return $next($request);
            }

            abort(403);
        });
    }

    public function index(Request $request): Response
    {
        $authUser = $request->user();
        $filters = $request->only(['unit', 'funcao', 'search', 'status']);
        $statusFilter = $this->normalizeStatusFilter($request->input('status'));
        $hasIsActiveColumn = Schema::hasColumn('users', 'is_active');

        $users = User::with('units:tb2_id,tb2_nome');
        ManagementScope::applyManagedUserScope($users, $authUser);

        $users = $users
            ->when($hasIsActiveColumn && $statusFilter !== 'all', function ($query) use ($statusFilter) {
                $query->where('is_active', $statusFilter === 'active');
            })
            ->when($request->filled('search'), function ($query) use ($request) {
                $term = trim((string) $request->input('search'));
                $safeTerm = str_replace(['%', '_'], ['\\%', '\\_'], $term);

                $query->where(function ($sub) use ($safeTerm) {
                    $sub->where('name', 'like', '%' . $safeTerm . '%')
                        ->orWhere('email', 'like', '%' . $safeTerm . '%');
                });
            })
            ->when($request->filled('funcao'), function ($query) use ($request) {
                $funcao = (int) $request->input('funcao');
                $query->where('funcao_original', $funcao);
            })
            ->when($request->filled('unit'), function ($query) use ($request) {
                $unitId = (int) $request->input('unit');
                $query->where(function ($sub) use ($unitId) {
                    $sub->where('tb2_id', $unitId)
                        ->orWhereHas('units', function ($q) use ($unitId) {
                            $q->where('tb2_unidades.tb2_id', $unitId);
                        });
                });
            })
            ->when($hasIsActiveColumn && $statusFilter === 'active', function ($query) {
                $query->where('is_active', true);
            })
            ->when($hasIsActiveColumn && $statusFilter === 'inactive', function ($query) {
                $query->where('is_active', false);
            })
            ->orderByDesc('id')
            ->paginate(10)
            ->withQueryString();

        $units = ManagementScope::managedUnits($authUser, ['tb2_id', 'tb2_nome']);

        return Inertia::render('Users/UserIndex', [
            'users' => $users,
            'units' => $units,
            'filters' => [
                ...$filters,
                'status' => $statusFilter,
            ],
            'permissions' => [
                'canCreate' => in_array((int) $authUser->funcao, [0, 1], true),
                'canView' => in_array((int) $authUser->funcao, [0, 1], true),
                'canEdit' => in_array((int) $authUser->funcao, [0, 1], true),
                'canDelete' => in_array((int) $authUser->funcao, [0, 1], true),
                'canToggleActive' => in_array((int) $authUser->funcao, [0, 1], true),
                'canManageSalaryAdvances' => in_array((int) $authUser->funcao, [0, 1, 2], true),
            ],
        ]);
    }


    public function show(User $user): Response
    {
        $user->load('units:tb2_id,tb2_nome');
        $this->ensureCanManageUser(request()->user(), $user);

        $valeSales = Venda::query()
            ->select(['tb3_id', 'tb4_id', 'valor_total', 'data_hora', 'tipo_pago', 'id_unidade'])
            ->with('unidade:tb2_id,tb2_nome')
            ->where('id_user_vale', $user->id)
            ->where('tipo_pago', 'vale')
            ->orderByDesc('data_hora')
            ->get();

        $vrSales = Venda::query()
            ->select(['tb3_id', 'tb4_id', 'valor_total', 'data_hora', 'tipo_pago', 'id_unidade'])
            ->with('unidade:tb2_id,tb2_nome')
            ->where('id_user_vale', $user->id)
            ->where('tipo_pago', 'refeicao')
            ->orderByDesc('data_hora')
            ->get();

        $advances = SalaryAdvance::query()
            ->where('user_id', $user->id)
            ->orderByDesc('advance_date')
            ->get(['id', 'advance_date', 'amount', 'reason']);

        $valeUsage = $this->groupSalesByPeriod($valeSales);
        $vrUsage = $this->groupSalesByPeriod($vrSales);
        $advanceUsage = $this->groupAdvancesByPeriod($advances);

        $valeTotal = (float) $valeSales->sum('valor_total');
        $vrTotal = (float) $vrSales->sum('valor_total');
        $advancesTotal = (float) $advances->sum('amount');

        $financialSummary = [
            'valeTotal' => round($valeTotal, 2),
            'vrCreditTotal' => round($vrTotal, 2),
            'advanceTotal' => round($advancesTotal, 2),
            'balance' => round((float) $user->salario - $advancesTotal, 2),
        ];

        return Inertia::render('Users/UserShow', [
            'user' => $user,
            'valeUsage' => $valeUsage,
            'vrUsage' => $vrUsage,
            'advanceUsage' => $advanceUsage,
            'financialSummary' => $financialSummary,
        ]);
    }

    public function create(): Response
    {
        $units = ManagementScope::managedUnits(request()->user(), ['tb2_id', 'tb2_nome']);

        return Inertia::render('Users/UserCreate', [
            'units' => $units,
        ]);
    }

    public function store(Request $request)
    {
        $authUser = $request->user();
        $request->merge([
            'name' => $this->normalizeUserName((string) $request->input('name', '')),
            'email' => $this->normalizeCompanyEmail((string) $request->input('email', '')),
            'phone' => $this->normalizePhone((string) $request->input('phone', '')) ?: null,
        ]);

        $request->validate(
            [
                'name' => ['required', 'string', 'max:15', 'regex:/^\pL+(?: \pL+)?$/u'],
                'email' => $this->companyEmailRules('unique:users'),
                'phone' => 'nullable|digits_between:10,11',
                'password' => 'required|string|min:4|max:255|confirmed',
                'funcao' => 'required|integer|between:0,6',
                'hr_ini' => 'required|date_format:H:i',
                'hr_fim' => 'required|date_format:H:i|after:hr_ini',
                'salario' => 'required|numeric|min:0',
                'vr_cred' => 'required|numeric|min:0',
                'payment_day' => 'nullable|integer|between:1,31',
                'tb2_id' => 'required|array|min:1',
                'tb2_id.*' => 'integer|exists:tb2_unidades,tb2_id',
            ],
            [
                'name.required' => 'O campo nome é obrigatório!',
                'name.string' => 'O nome deve ser uma string válida.',
                'name.max' => 'O nome não pode ter mais que :max caracteres.',
                'name.regex' => 'Informe nome e sobrenome usando apenas letras e um único espaço.',
                'email.required' => 'O campo e-mail é obrigatório.',
                'email.string' => 'O e-mail deve ser uma string válida.',
                'email.email' => 'O e-mail deve ser um endereço válido.',
                'email.max' => 'O e-mail não pode ter mais que :max caracteres.',
                'email.regex' => 'O e-mail deve ser do domínio @paoecafepremium.com.br.',
                'email.unique' => 'Este e-mail já está cadastrado.',
                'password.required' => 'O campo senha é obrigatório.',
                'password.string' => 'A senha deve ser uma string válida.',
                'password.min' => 'A senha não pode ter menos que :min caracteres.',
                'password.max' => 'A senha não pode ter mais que :max caracteres.',
                'password.confirmed' => 'A confirmação da senha não corresponde.',
                'funcao.required' => 'Selecione a função do usuário.',
                'funcao.integer' => 'Função inválida.',
                'funcao.between' => 'Função não reconhecida.',
                'hr_ini.required' => 'Informe o início da jornada.',
                'hr_ini.date_format' => 'Horário inicial inválido (HH:MM).',
                'hr_fim.required' => 'Informe o fim da jornada.',
                'hr_fim.date_format' => 'Horário final inválido (HH:MM).',
                'hr_fim.after' => 'O fim da jornada deve ser após o início.',
                'salario.required' => 'Informe o salário.',
                'salario.numeric' => 'O salário deve ser numérico.',
                'salario.min' => 'O salário deve ser maior ou igual a zero.',
                'vr_cred.required' => 'Informe o crédito de refeição.',
                'vr_cred.numeric' => 'O crédito deve ser numérico.',
                'vr_cred.min' => 'O crédito deve ser maior ou igual a zero.',
                'payment_day.integer' => 'O dia do pagamento deve ser um número válido.',
                'payment_day.between' => 'O dia do pagamento deve estar entre 1 e 31.',
                'tb2_id.required' => 'Selecione pelo menos uma unidade.',
                'tb2_id.array' => 'Selecao de unidades invalida.',
                'tb2_id.min' => 'Selecione pelo menos uma unidade.',
                'tb2_id.*.integer' => 'Unidade selecionada invalida.',
                'tb2_id.*.exists' => 'Unidade selecionada nao existe.',
            ]
        );

        $unitIds = collect($request->input('tb2_id', []))
            ->map(fn ($value) => (int) $value)
            ->filter()
            ->unique()
            ->values()
            ->all();

        if (! in_array((int) $request->input('funcao'), [0, 1], true) && count($unitIds) > 1) {
            return Redirect::back()
                ->withErrors(['tb2_id' => 'Esta funcao permite vincular apenas uma loja.'])
                ->withInput();
        }

        if (ManagementScope::isManager($authUser)) {
            $allowedUnitIds = ManagementScope::managedUnitIds($authUser)->all();
            $invalidUnitIds = array_diff($unitIds, $allowedUnitIds);

            if (! empty($invalidUnitIds)) {
                abort(403);
            }
        }

        $primaryUnit = $unitIds[0] ?? 1;

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'phone' => $request->phone ?: null,
            'password' => $request->password,
            'cod_acesso' => Str::upper(Str::random(6)),
            'funcao' => $request->funcao,
            'hr_ini' => $request->hr_ini,
            'hr_fim' => $request->hr_fim,
            'salario' => $request->salario,
            'vr_cred' => $request->vr_cred,
            'payment_day' => $request->filled('payment_day') ? (int) $request->payment_day : null,
            'tb2_id' => $primaryUnit,
        ] + (Schema::hasColumn('users', 'is_active') ? ['is_active' => true] : []));

        $user->units()->sync($unitIds);

        return Redirect::back()->with('success', 'Usuário cadastrado com sucesso!');
    }

    public function edit(User $user): Response
    {
        $user->load('units:tb2_id,tb2_nome');
        $this->ensureCanManageUser(request()->user(), $user);
        $units = ManagementScope::managedUnits(request()->user(), ['tb2_id', 'tb2_nome']);

        return Inertia::render('Users/UserEdit', [
            'user' => $user,
            'units' => $units,
        ]);
    }

    public function update(Request $request, User $user)
    {
        $this->ensureCanManageUser($request->user(), $user);
        $request->merge([
            'name' => $this->normalizeUserName((string) $request->input('name', '')),
            'email' => $this->normalizeCompanyEmail((string) $request->input('email', '')),
            'phone' => $this->normalizePhone((string) $request->input('phone', '')) ?: null,
        ]);

        $request->validate(
            [
                'name' => ['required', 'string', 'max:15', 'regex:/^\pL+ \pL+$/u'],
                'email' => $this->companyEmailRules("unique:users,email,{$user->id}"),
                'phone' => 'nullable|digits_between:10,11',
                'funcao' => 'required|integer|between:0,6',
                'hr_ini' => 'required|date_format:H:i',
                'hr_fim' => 'required|date_format:H:i|after:hr_ini',
                'salario' => 'required|numeric|min:0',
                'vr_cred' => 'required|numeric|min:0',
                'payment_day' => 'nullable|integer|between:1,31',
                'tb2_id' => 'required|array|min:1',
                'tb2_id.*' => 'integer|exists:tb2_unidades,tb2_id',
            ],
            [
                'name.required' => 'O campo nome é obrigatório!',
                'name.string' => 'O nome deve ser uma string válida.',
                'name.max' => 'O nome não pode ter mais que :max caracteres.',
                'name.regex' => 'Informe nome e sobrenome usando apenas letras e um único espaço.',
                'email.required' => 'O campo e-mail é obrigatório.',
                'email.string' => 'O e-mail deve ser uma string válida.',
                'email.email' => 'O e-mail deve ser um endereço válido.',
                'email.max' => 'O e-mail não pode ter mais que :max caracteres.',
                'email.regex' => 'O e-mail deve ser do domínio @paoecafepremium.com.br.',
                'email.unique' => 'Este e-mail já está cadastrado.',
                'funcao.required' => 'Selecione a função do usuário.',
                'funcao.integer' => 'Função inválida.',
                'funcao.between' => 'Função não reconhecida.',
                'hr_ini.required' => 'Informe o início da jornada.',
                'hr_ini.date_format' => 'Horário inicial inválido (HH:MM).',
                'hr_fim.required' => 'Informe o fim da jornada.',
                'hr_fim.date_format' => 'Horário final inválido (HH:MM).',
                'hr_fim.after' => 'O fim da jornada deve ser após o início.',
                'salario.required' => 'Informe o salário.',
                'salario.numeric' => 'O salário deve ser numérico.',
                'salario.min' => 'O salário deve ser maior ou igual a zero.',
                'vr_cred.required' => 'Informe o crédito de refeição.',
                'vr_cred.numeric' => 'O crédito deve ser numérico.',
                'vr_cred.min' => 'O crédito deve ser maior ou igual a zero.',
                'payment_day.integer' => 'O dia do pagamento deve ser um número válido.',
                'payment_day.between' => 'O dia do pagamento deve estar entre 1 e 31.',
                'tb2_id.required' => 'Selecione pelo menos uma unidade.',
                'tb2_id.array' => 'Selecao de unidades invalida.',
                'tb2_id.min' => 'Selecione pelo menos uma unidade.',
                'tb2_id.*.integer' => 'Unidade selecionada invalida.',
                'tb2_id.*.exists' => 'Unidade selecionada nao existe.',
            ]
        );

        $unitIds = collect($request->input('tb2_id', []))
            ->map(fn ($value) => (int) $value)
            ->filter()
            ->unique()
            ->values()
            ->all();

        if (! in_array((int) $request->input('funcao'), [0, 1], true) && count($unitIds) > 1) {
            return Redirect::back()
                ->withErrors(['tb2_id' => 'Esta funcao permite vincular apenas uma loja.'])
                ->withInput();
        }

        if (ManagementScope::isManager($request->user())) {
            $allowedUnitIds = ManagementScope::managedUnitIds($request->user())->all();
            $invalidUnitIds = array_diff($unitIds, $allowedUnitIds);

            if (! empty($invalidUnitIds)) {
                abort(403);
            }
        }

        $primaryUnit = $unitIds[0] ?? 1;

        $updateData = [
            'name' => $request->name,
            'email' => $request->email,
            'phone' => $request->phone ?: null,
            'funcao' => $request->funcao,
            'funcao_original' => $request->funcao,
            'hr_ini' => $request->hr_ini,
            'hr_fim' => $request->hr_fim,
            'salario' => $request->salario,
            'vr_cred' => $request->vr_cred,
            'payment_day' => $request->filled('payment_day') ? (int) $request->payment_day : null,
            'tb2_id' => $primaryUnit,
        ];

        $user->update($updateData);

        $user->units()->sync($unitIds);

        return Redirect::back()->with('success', 'Usuário editado com sucesso!');
    }

    public function search(Request $request): JsonResponse
    {
        $term = trim((string) $request->input('q', ''));
        $scope = trim((string) $request->input('scope', ''));

        if ($term === '') {
            return response()->json([]);
        }

        $safeTerm = str_replace(['%', '_'], ['\\%', '\\_'], $term);
        $monthStart = now()->startOfMonth();
        $monthEnd = now()->endOfMonth();
        $todayStart = now()->startOfDay();
        $todayEnd = now()->endOfDay();
        $dailyLimit = $this->resolveRefeicaoDailyLimit(now());

        $users = User::query();
        $authUser = $request->user();

        if ((int) $authUser->funcao !== 3) {
            ManagementScope::applyManagedUserScope($users, $authUser);
        }

        if ($scope === 'active_unit') {
            $activeUnitId = $this->resolveActiveUnitId($request);

            if (! $activeUnitId) {
                return response()->json([]);
            }

            $this->applyUnitScope($users, $activeUnitId);
        }

        $users = $users
            ->active()
            ->where('name', 'like', '%' . $safeTerm . '%')
            ->orderBy('name')
            ->limit(10)
            ->get(['id', 'name', 'vr_cred']);

        if ($users->isEmpty()) {
            return response()->json([]);
        }

        $usagePerUser = Venda::query()
            ->selectRaw('id_user_vale, SUM(valor_total) as total')
            ->where('tipo_pago', 'refeicao')
            ->whereBetween('data_hora', [$monthStart, $monthEnd])
            ->whereIn('id_user_vale', $users->pluck('id'))
            ->groupBy('id_user_vale')
            ->pluck('total', 'id_user_vale');

        $dailyUsagePerUser = Venda::query()
            ->selectRaw('id_user_vale, SUM(valor_total) as total')
            ->where('tipo_pago', 'refeicao')
            ->whereBetween('data_hora', [$todayStart, $todayEnd])
            ->whereIn('id_user_vale', $users->pluck('id'))
            ->groupBy('id_user_vale')
            ->pluck('total', 'id_user_vale');

        $response = $users->map(function ($user) use ($usagePerUser, $dailyUsagePerUser, $dailyLimit) {
            $used = (float) ($usagePerUser[$user->id] ?? 0);
            $balance = max(0, (float) $user->vr_cred - $used);
            $dailyUsed = (float) ($dailyUsagePerUser[$user->id] ?? 0);
            $dailyRemaining = max(0, $dailyLimit - $dailyUsed);

            return [
                'id' => $user->id,
                'name' => $user->name,
                'vr_cred' => (float) $user->vr_cred,
                'refeicao_used' => $used,
                'refeicao_balance' => round($balance, 2),
                'refeicao_daily_limit' => round($dailyLimit, 2),
                'refeicao_daily_used' => round($dailyUsed, 2),
                'refeicao_daily_remaining' => round($dailyRemaining, 2),
            ];
        });

        return response()->json($response);
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

    private function applyUnitScope(Builder $query, int $unitId): Builder
    {
        return $query->where(function (Builder $subQuery) use ($unitId) {
            $subQuery
                ->where('users.tb2_id', $unitId)
                ->orWhereHas('units', function (Builder $unitQuery) use ($unitId) {
                    $unitQuery->where('tb2_unidades.tb2_id', $unitId);
                });
        });
    }

    private function resolveRefeicaoDailyLimit(Carbon $date): float
    {
        return $date->isSunday() ? 24.0 : 12.0;
    }

    private function normalizePhone(string $value): string
    {
        $digits = preg_replace('/\D/', '', $value) ?? '';

        return in_array(strlen($digits), [10, 11], true) ? $digits : '';
    }

    private function normalizeCompanyEmail(string $value): string
    {
        return Str::lower(trim($value));
    }

    private function companyEmailRules(string $uniqueRule): array
    {
        $domain = preg_quote(self::COMPANY_EMAIL_DOMAIN, '/');

        return ['required', 'string', 'email', 'max:255', 'regex:/^[^@\s]+@' . $domain . '$/i', $uniqueRule];
    }

    private function normalizeStatusFilter(mixed $value): string
    {
        $status = strtolower(trim((string) ($value ?? '')));

        return in_array($status, ['active', 'inactive', 'all'], true)
            ? $status
            : 'active';
    }

    public function destroy(User $user)
    {
        $this->ensureCanManageUser(request()->user(), $user);

        if ($this->userHasTransactions($user)) {
            return Redirect::back()->with('error', 'Não é possível excluir usuários com lançamentos associados.');
        }

        $user->delete();

        return Redirect::route('users.index')->with('success', 'Usuário apagado com sucesso!');
    }


    public function resetPassword(Request $request, User $user)
    {
        $this->ensureCanManageUser($request->user(), $user);

        $newPassword = str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);

        $user->forceFill([
            'password' => $newPassword,
        ])->save();

        return Redirect::back()->with('success', "Nova senha temporária: {$newPassword}");
    }

    public function toggleActive(Request $request, User $user)
    {
        $actingUser = $request->user();

        $this->ensureCanManageUser($actingUser, $user);

        $nextStatus = ! (bool) ($user->is_active ?? true);

        if (! Schema::hasColumn('users', 'is_active')) {
            return Redirect::back()->with('error', 'O banco de producao nao possui suporte para alterar o status do usuario.');
        }

        if ($actingUser && (int) $actingUser->id === (int) $user->id && $nextStatus === false) {
            return Redirect::back()->with('error', 'Nao e possivel inativar o proprio usuario.');
        }

        $user->forceFill([
            'is_active' => $nextStatus,
        ])->save();

        if (! $nextStatus) {
            OnlineUser::query()
                ->where('user_id', $user->id)
                ->delete();
        }

        return Redirect::back()->with(
            'success',
            $nextStatus ? 'Usuario reativado com sucesso!' : 'Usuario inativado com sucesso!'
        );
    }

    private function groupSalesByPeriod(Collection $sales): array
    {
        return $sales
            ->groupBy(fn ($sale) => optional($sale->data_hora)->format('Y-m') ?? 'sem-data')
            ->map(function ($group, $period) {
                $referenceDate = optional($group->first()->data_hora) ?: now();

                return [
                    'period' => $period,
                    'label' => Str::title($referenceDate->translatedFormat('F Y')),
                    'total' => round($group->sum('valor_total'), 2),
                    'count' => $group->count(),
                    'items' => $group->map(function ($sale) {
                        return [
                            'id' => $sale->tb3_id,
                            'cupom' => $sale->tb4_id,
                            'date_time' => optional($sale->data_hora)->toDateTimeString(),
                            'total' => (float) $sale->valor_total,
                            'type' => $sale->tipo_pago,
                            'unit' => optional($sale->unidade)->tb2_nome,
                        ];
                    })->values()->all(),
                ];
            })
            ->sortByDesc('period')
            ->values()
            ->all();
    }

    private function groupAdvancesByPeriod(Collection $advances): array
    {
        return $advances
            ->groupBy(fn ($advance) => optional($advance->advance_date)->format('Y-m') ?? 'sem-data')
            ->map(function ($group, $period) {
                $referenceDate = optional($group->first()->advance_date) ?: now();

                return [
                    'period' => $period,
                    'label' => Str::title($referenceDate->translatedFormat('F Y')),
                    'total' => round($group->sum('amount'), 2),
                    'count' => $group->count(),
                    'items' => $group->map(function ($advance) {
                        return [
                            'id' => $advance->id,
                            'date' => optional($advance->advance_date)->toDateString(),
                            'amount' => (float) $advance->amount,
                            'reason' => $advance->reason,
                        ];
                    })->values()->all(),
                ];
            })
            ->sortByDesc('period')
            ->values()
            ->all();
    }

    private function userHasTransactions(User $user): bool
    {
        $hasSales = Venda::query()
            ->where('id_user_caixa', $user->id)
            ->orWhere('id_user_vale', $user->id)
            ->exists();

        $hasAdvances = SalaryAdvance::where('user_id', $user->id)->exists();

        return $hasSales || $hasAdvances;
    }

    private function ensureCanManageUser(?User $actingUser, User $targetUser): void
    {
        if (! $actingUser || ! ManagementScope::canManageUser($actingUser, $targetUser)) {
            abort(403);
        }
    }

    private function normalizeUserName(string $name): string
    {
        $lettersAndSpaces = preg_replace('/[^\pL\s]/u', '', $name) ?? '';
        $normalizedSpaces = preg_replace('/\s+/u', ' ', trim($lettersAndSpaces)) ?? '';

        if ($normalizedSpaces === '') {
            return '';
        }

        $words = explode(' ', $normalizedSpaces);

        $formattedWords = array_map(function (string $word): string {
            $firstLetter = mb_substr($word, 0, 1, 'UTF-8');
            $remainingLetters = mb_substr($word, 1, null, 'UTF-8');

            return mb_strtoupper($firstLetter, 'UTF-8') . mb_strtolower($remainingLetters, 'UTF-8');
        }, $words);

        return implode(' ', $formattedWords);
    }
}
