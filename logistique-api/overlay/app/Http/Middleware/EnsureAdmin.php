<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // Double contrôle : rôle en base ET capacité du jeton (SEC-2.6).
        if (! $user || $user->role !== 'admin' || ! $user->tokenCan('admin')) {
            abort(403, 'Droits administrateur requis.');
        }

        return $next($request);
    }
}
