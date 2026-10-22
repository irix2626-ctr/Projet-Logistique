<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureClientVersion
{
    public function handle(Request $request, Closure $next): Response
    {
        $min = (string) config('logistique.min_client_version');
        $version = (string) $request->header('X-Client-Version', '0.0.0');

        if (version_compare($version, $min, '<')) {
            return response()->json([
                'message' => "Mise à jour obligatoire de l'application (version minimale : {$min}).",
                'code' => 'CLIENT_OBSOLETE',
                'version_minimale' => $min,
            ], 426);
        }

        return $next($request);
    }
}
