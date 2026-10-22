<?php

use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CategorieController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DeviceController;
use App\Http\Controllers\Api\DocumentController;
use App\Http\Controllers\Api\LotController;
use App\Http\Controllers\Api\MaterielController;
use App\Http\Controllers\Api\PingController;
use App\Http\Controllers\Api\SortieController;
use App\Http\Controllers\Api\StockController;
use App\Http\Controllers\Api\StructureController;
use App\Http\Controllers\Api\SyncController;
use App\Http\Controllers\Api\TracabiliteController;
use App\Http\Controllers\Api\UpdateController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

// Contrat : openapi.yaml. Toutes les routes sont préfixées par /api/v1.
Route::prefix('v1')->group(function () {

    // ---------- Public ----------
    Route::get('ping', PingController::class);
    Route::get('structures', [StructureController::class, 'index'])->middleware('throttle:60,1');
    Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:login');
    Route::get('updates/{target}/{arch}/{version}', UpdateController::class)
        ->whereIn('target', ['windows', 'linux', 'darwin'])
        ->whereIn('arch', ['x86_64', 'i686', 'aarch64', 'armv7'])
        ->middleware('throttle:60,1');

    // ---------- Authentifié ----------
    Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {

        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::put('auth/password', [AuthController::class, 'changePassword']);
        Route::post('devices', [DeviceController::class, 'store']);

        // Référentiels
        Route::get('categories', [CategorieController::class, 'index']);
        Route::get('materiels', [MaterielController::class, 'index']);
        Route::post('materiels', [MaterielController::class, 'store']);
        Route::put('materiels/{materiel}', [MaterielController::class, 'update']);

        // Lots et stock (/lots/suggestion AVANT /lots/{lot})
        Route::get('lots/suggestion', [LotController::class, 'suggestion']);
        Route::get('lots', [LotController::class, 'index']);
        Route::post('lots', [LotController::class, 'store']);
        Route::get('lots/{lot}', [LotController::class, 'show']);
        Route::put('lots/{lot}', [LotController::class, 'update']);
        Route::delete('lots/{lot}', [LotController::class, 'destroy']);
        Route::get('lots/{lot}/cycle', [LotController::class, 'cycle']);
        Route::get('stock', [StockController::class, 'index']);

        // Sorties : lecture seule (aucun PUT / DELETE => 405)
        Route::get('sorties', [SortieController::class, 'index']);
        Route::post('sorties', [SortieController::class, 'store']);
        Route::get('sorties/{sortie}', [SortieController::class, 'show']);
        Route::get('sorties/{sortie}/bon', [SortieController::class, 'bon']);
        Route::get('sorties/{sortie}/signature', [SortieController::class, 'signature']);

        // Documents
        Route::post('documents', [DocumentController::class, 'store'])->middleware('throttle:upload');
        Route::get('documents/{document}', [DocumentController::class, 'show']);

        // Traçabilité et Dashboard
        Route::get('tracabilite', [TracabiliteController::class, 'index']);
        Route::get('dashboard', DashboardController::class);

        // Synchronisation
        Route::middleware(['client.version', 'throttle:sync'])->group(function () {
            Route::post('sync/push', [SyncController::class, 'push']);
            Route::get('sync/pull', [SyncController::class, 'pull']);
            Route::post('sync/fichiers', [SyncController::class, 'fichiers'])->middleware('throttle:upload');
        });

        // ---------- Administrateur ----------
        Route::middleware('admin')->group(function () {
            Route::get('users', [UserController::class, 'index']);
            Route::post('users', [UserController::class, 'store']);
            Route::put('users/{user}', [UserController::class, 'update']);
            Route::delete('users/{user}', [UserController::class, 'destroy']);

            Route::post('categories', [CategorieController::class, 'store']);
            Route::put('categories/{categorie}', [CategorieController::class, 'update']);
            Route::delete('categories/{categorie}', [CategorieController::class, 'destroy']);
            Route::delete('materiels/{materiel}', [MaterielController::class, 'destroy']);

            Route::post('admin/archivage', [AdminController::class, 'archivage'])->middleware('throttle:sensitive');
            Route::post('admin/reinitialisation', [AdminController::class, 'reinitialisation'])->middleware('throttle:sensitive');
            Route::get('admin/conflits', [AdminController::class, 'conflits']);
            Route::put('admin/conflits/{conflit}', [AdminController::class, 'resoudreConflit']);
            Route::get('admin/integrite', [AdminController::class, 'integrite']);
        });
    });
});
