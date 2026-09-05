<?php

namespace App\Http\Controllers;

use App\Http\Requests\ProfileUpdateRequest;
use App\Models\SalaryAdvance;
use App\Models\Venda;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Redirect;
use Inertia\Inertia;
use Inertia\Response;

class ProfileController extends Controller
{
    /**
     * Display the user's profile form.
     */
    public function edit(Request $request): Response
    {
        $user = $request->user()->loadMissing('units');

        return Inertia::render('Profile/Edit', [
            'mustVerifyEmail' => $request->user() instanceof MustVerifyEmail,
            'status' => session('status'),
            'canDeleteAccount' => !$this->userHasTransactions($user),
        ]);
    }

    /**
     * Update the user's profile information.
     */
    public function update(ProfileUpdateRequest $request): RedirectResponse
    {
        $user = $request->user();
        $data = $request->validated();
        $data['name'] = $user->name;

        $user->fill([
            'name' => $data['name'],
            'email' => $data['email'],
        ]);

        if ($user->isDirty('email')) {
            $user->email_verified_at = null;
        }

        $user->save();

        return Redirect::route('profile.edit');
    }

    /**
     * Update the user's access code.
     */
    public function updateAccessCode(Request $request): RedirectResponse
    {
        $validated = $request->validate(
            [
                'cod_acesso' => ['required', 'digits:4', 'confirmed'],
            ],
            [
                'cod_acesso.required' => 'O novo codigo de acesso e obrigatorio.',
                'cod_acesso.digits' => 'O codigo de acesso deve ter exatamente 4 digitos.',
                'cod_acesso.confirmed' => 'A confirmacao do codigo de acesso nao corresponde.',
            ],
            [
                'cod_acesso' => 'codigo de acesso',
            ]
        );

        $request->user()->update([
            'cod_acesso' => $validated['cod_acesso'],
        ]);

        return Redirect::route('profile.edit');
    }

    /**
     * Delete the user's account.
     */
    public function destroy(Request $request): RedirectResponse
    {
        $request->validate([
            'password' => ['required', 'current_password'],
        ]);

        $user = $request->user();

        if ($this->userHasTransactions($user)) {
            return Redirect::route('profile.edit')->withErrors([
                'password' => 'Nao e possivel excluir usuarios que possuem lancamentos vinculados.',
            ]);
        }

        Auth::logout();

        $user->delete();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return Redirect::to('/');
    }

    private function userHasTransactions($user): bool
    {
        $hasSales = Venda::query()
            ->where('id_user_caixa', $user->id)
            ->orWhere('id_user_vale', $user->id)
            ->exists();

        $hasAdvances = SalaryAdvance::where('user_id', $user->id)->exists();

        return $hasSales || $hasAdvances;
    }
}
