<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class RoleSwitchController extends Controller
{
    public function index(): RedirectResponse
    {
        return redirect()->route('reports.switch-unit');
    }

    public function update(Request $request): RedirectResponse
    {
        return redirect()
            ->route('reports.switch-unit')
            ->with('error', 'Use a tela Trocar para atualizar unidade e funcao na mesma sessao.');
    }
}
