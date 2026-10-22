<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\Paginates;
use App\Http\Controllers\Controller;
use App\Http\Resources\LotResource;
use App\Models\Lot;
use App\Services\LotService;
use App\Services\StockService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StockController extends Controller
{
    use Paginates;

    /** Lots disponibles : quantite_restante > 0 (calculée en SQL, jamais lue d'une colonne saisie). */
    public function index(Request $request): JsonResponse
    {
        $query = Lot::query()
            ->with('materiel.categorie')
            ->withSum('sorties as total_sorti', 'quantite')
            ->whereRaw(StockService::RESTANTE_SQL.' > 0');

        LotService::applyFilters($query, $request);

        $page = $query->orderBy('date_entree')->orderBy('id')->cursorPaginate($this->pageSize());

        return response()->json($this->pageOf($page, fn ($l) => (new LotResource($l))->resolve()));
    }
}
