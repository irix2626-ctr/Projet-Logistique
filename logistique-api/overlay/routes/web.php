<?php

use Illuminate\Support\Facades\Route;

// Aucune page web : l'application est une API consommée par le client desktop.
Route::get('/', fn () => response()->json(['app' => 'Logistique API', 'status' => 'ok']));
