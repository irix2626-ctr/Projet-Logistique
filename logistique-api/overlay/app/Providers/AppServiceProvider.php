<?php

namespace App\Providers;

use App\Models\Categorie;
use App\Models\Document;
use App\Models\Lot;
use App\Models\Materiel;
use App\Models\Sortie;
use App\Models\Structure;
use App\Models\User;
use App\Observers\SyncObserver;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        JsonResource::withoutWrapping();

        $key = fn (Request $request) => (string) ($request->user()?->getAuthIdentifier() ?: $request->ip());

        // Connexion : 5 essais par minute par couple identifiant + IP (SEC-2.3).
        RateLimiter::for('login', function (Request $request) {
            $id = Str::lower((string) $request->input('identifiant'));

            return Limit::perMinute(5)->by($id.'|'.$request->ip());
        });

        // API générale : lecture 120/min, écriture 60/min (SEC-4.6).
        RateLimiter::for('api', function (Request $request) use ($key) {
            return $request->isMethodSafe()
                ? Limit::perMinute(120)->by($key($request).'|r')
                : Limit::perMinute(60)->by($key($request).'|w');
        });

        RateLimiter::for('sync', fn (Request $request) => Limit::perMinute(30)->by($key($request).'|sync'));
        RateLimiter::for('upload', fn (Request $request) => Limit::perMinute(20)->by($key($request).'|up'));
        RateLimiter::for('sensitive', fn (Request $request) => Limit::perMinute(5)->by($key($request).'|sens'));

        // Journal de synchronisation : chaque écriture sur ces modèles alimente /sync/pull.
        foreach ([Structure::class, User::class, Categorie::class, Materiel::class, Lot::class, Sortie::class, Document::class] as $model) {
            $model::observe(SyncObserver::class);
        }
    }
}
