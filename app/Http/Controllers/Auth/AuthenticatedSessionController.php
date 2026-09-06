<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Models\CashierClosure;
use App\Models\OnlineUser;
use App\Models\Unidade;
use App\Models\VendaPagamento;
use App\Models\User;
use App\Support\PaymentControlNotificationService;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;
use Inertia\Inertia;
use Inertia\Response;

class AuthenticatedSessionController extends Controller
{
    private const LOGIN_DOMAIN = '@paoecafepremium.com.br';

    /**
     * Display the login view.
     */
    public function create(Request $request): Response
    {
        $requestedUnitId = (int) $request->query('l', 0);

        return Inertia::render('Auth/Login', [
            'canResetPassword' => Route::has('password.request'),
            'status' => session('status'),
            'selectedUnitId' => $requestedUnitId > 0 ? $requestedUnitId : null,
            'units' => [],
        ]);
    }

    public function userUnits(Request $request)
    {
        $validated = $request->validate([
            'username' => ['required', 'string', 'max:255'],
        ]);

        $email = $this->emailFromUsername($validated['username']);
        $user = User::query()
            ->active()
            ->where('email', $email)
            ->whereRaw('COALESCE(funcao_original, funcao) not in (?, ?)', [5, 6])
            ->with([
                'primaryUnit' => fn ($query) => $query
                    ->active()
                    ->select('tb2_id', 'tb2_nome'),
                'units' => fn ($query) => $query
                    ->active()
                    ->select('tb2_unidades.tb2_id', 'tb2_unidades.tb2_nome'),
            ])
            ->first();

        if (! $user) {
            return response()->json(['units' => []]);
        }

        $units = $user->units
            ->when($user->primaryUnit, fn ($collection) => $collection->push($user->primaryUnit))
            ->unique('tb2_id')
            ->sortBy('tb2_nome', SORT_NATURAL | SORT_FLAG_CASE)
            ->values()
            ->map(fn (Unidade $unit) => [
                'tb2_id' => $unit->tb2_id,
                'tb2_nome' => $unit->tb2_nome,
            ]);

        return response()->json(['units' => $units]);
    }

    /**
     * Handle an incoming authentication request.
     */
    public function store(LoginRequest $request): RedirectResponse
    {
        try {
            $request->authenticate();

            $request->session()->regenerate();

            $unitId = (int) $request->input('unit_id');
            $user = $request->user();
            $funcaoOriginal = $user->funcao_original ?? $user->funcao;

            if (! (bool) ($user->is_active ?? true)) {
                Auth::logout();
                $request->session()->invalidate();
                $request->session()->regenerateToken();

                throw ValidationException::withMessages([
                    'username' => 'Este usuario esta inativo.',
                ]);
            }

            if (in_array((int) $funcaoOriginal, [5, 6], true)) {
                Auth::logout();
                $request->session()->invalidate();
                $request->session()->regenerateToken();

                throw ValidationException::withMessages([
                    'username' => 'Este perfil nao possui acesso ao sistema.',
                ]);
            }

            if ((int) $funcaoOriginal === 3) {
                $pendingClosureDate = $this->resolvePendingClosureDate($user, $unitId, Carbon::today());

                if ($pendingClosureDate === null) {
                    $closedToday = CashierClosure::where('user_id', $user->id)
                        ->whereDate('closed_date', Carbon::today())
                        ->where(function ($query) use ($unitId) {
                            $query->whereNull('unit_id')
                                ->orWhere('unit_id', $unitId);
                        })
                        ->exists();
                } else {
                    $closedToday = false;
                }

                if ($closedToday) {
                    Auth::logout();

                    throw ValidationException::withMessages([
                        'username' => 'Seu caixa ja foi fechado hoje para esta unidade. Novo acesso apenas amanha.',
                    ]);
                }
            }

            $hasAccess = $user->units()->where('tb2_unidades.tb2_id', $unitId)->exists() || (int) $user->tb2_id === $unitId;

            if (! $hasAccess) {
                Auth::logout();

                throw ValidationException::withMessages([
                    'unit_id' => 'Voce nao tem acesso a esta unidade.',
                ]);
            }

            $selectedUnit = Unidade::active()
                ->select('tb2_id', 'tb2_nome', 'tb2_endereco', 'tb2_cnpj')
                ->find($unitId);

            if (! $selectedUnit) {
                Auth::logout();

                throw ValidationException::withMessages([
                    'unit_id' => 'A unidade selecionada esta inativa.',
                ]);
            }

            $request->session()->put('active_unit', [
                'id' => $selectedUnit->tb2_id,
                'name' => $selectedUnit->tb2_nome,
                'address' => $selectedUnit->tb2_endereco,
                'cnpj' => $selectedUnit->tb2_cnpj,
            ]);

            if (
                $user->funcao_original === null &&
                Schema::hasColumn('users', 'funcao_original')
            ) {
                $user->forceFill(['funcao_original' => $user->funcao])->save();
            }

            $request->session()->put('active_role', (int) ($user->funcao_original ?? $user->funcao));
            try {
                app(PaymentControlNotificationService::class)->notifyUserOnLogin($user, (int) $selectedUnit->tb2_id);
            } catch (\Throwable $exception) {
                Log::warning('Falha ao enviar notificacao de login.', [
                    'user_id' => $user->id,
                    'unit_id' => $selectedUnit->tb2_id,
                    'exception' => $exception,
                ]);
            }

            if ($this->shouldRedirectMasterToMobileHome($request, $user)) {
                return redirect()->route('mobile.home');
            }

            return redirect()->intended(route('dashboard', absolute: false));
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            Log::error('Falha ao concluir login.', [
                'unit_id' => (int) $request->input('unit_id'),
                'exception' => $exception,
            ]);

            throw ValidationException::withMessages([
                'username' => 'Nao foi possivel concluir o login. Tente novamente.',
            ]);
        }
    }

    /**
     * Destroy an authenticated session.
     */
    public function destroy(Request $request): RedirectResponse
    {
        OnlineUser::query()
            ->where('session_id', $request->session()->getId())
            ->delete();

        Auth::guard('web')->logout();

        $request->session()->invalidate();

        $request->session()->regenerateToken();

        return redirect('/');
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

    private function shouldRedirectMasterToMobileHome(Request $request, User $user): bool
    {
        if ((int) ($user->funcao_original ?? $user->funcao) !== 0) {
            return false;
        }

        return $this->isMobileUserAgent($request->userAgent());
    }

    private function isMobileUserAgent(?string $userAgent): bool
    {
        if (! is_string($userAgent) || trim($userAgent) === '') {
            return false;
        }

        return (bool) preg_match(
            '/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i',
            $userAgent
        );
    }

    private function emailFromUsername(string $username): string
    {
        $normalizedUsername = Str::before(trim($username), '@');

        return Str::lower($normalizedUsername . self::LOGIN_DOMAIN);
    }
}
