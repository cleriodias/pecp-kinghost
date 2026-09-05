<?php

namespace App\Http\Middleware;

use App\Models\Unidade;
use Closure;
use Illuminate\Http\Request;

class EnsureActiveUnit
{
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();

        if ($user && ! $request->session()->has('active_unit')) {
            $unitId = (int) ($user->tb2_id ?? 0);

            if ($unitId > 0) {
                $unit = Unidade::active()
                    ->select('tb2_id', 'tb2_nome', 'tb2_endereco', 'tb2_cnpj')
                    ->find($unitId);

                if ($unit) {
                    $request->session()->put('active_unit', [
                        'id' => $unit->tb2_id,
                        'name' => $unit->tb2_nome,
                        'address' => $unit->tb2_endereco,
                        'cnpj' => $unit->tb2_cnpj,
                    ]);
                }
            }
        }

        return $next($request);
    }
}
