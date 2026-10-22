<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Structure;
use Illuminate\Http\JsonResponse;

class StructureController extends Controller
{
    /** Public : liste déroulante de l'écran de connexion (mise en cache locale par le client). */
    public function index(): JsonResponse
    {
        return response()->json(Structure::query()->orderBy('nom')->get(['id', 'nom']));
    }
}
