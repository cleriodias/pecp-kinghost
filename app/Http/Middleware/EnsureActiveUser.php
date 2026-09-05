<?php

namespace App\Http\Middleware;

use App\Models\OnlineUser;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class EnsureActiveUser
{
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();

        if ($user && ! (bool) ($user->is_active ?? true)) {
            OnlineUser::query()
                ->where('user_id', $user->id)
                ->delete();

            Auth::guard('web')->logout();

            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return redirect()
                ->route('login')
                ->withErrors([
                    'username' => 'Este usuario esta inativo.',
                ]);
        }

        return $next($request);
    }
}
