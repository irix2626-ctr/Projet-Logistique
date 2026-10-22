<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Api\Concerns\Paginates;
use App\Http\Controllers\Controller;
use App\Http\Requests\LotStoreRequest;
use App\Http\Requests\LotUpdateRequest;
use App\Http\Resources\LotResource;
use App\Models\Lot;
use App\Services\LotService;
use App\Services\StockService;
use App\Services\TraceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LotController extends Controller
{
    use Paginates;

    public function __construct(
        private LotService $lots,
        private StockService $stock,
        private TraceService $trace,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $query = Lot::query()->with('materiel.categorie')->withSum('sorties as total_sorti', 'quantite');
        LotService::applyFilters($query, $request);

        $page = $query->orderByDesc('date_entree')->orderByDesc('id')->cursorPaginate($this->pageSize());

        return response()->json($this->pageOf($page, fn ($l) => (new LotResource($l))->resolve()));
    }

    public function store(LotStoreRequest $request): JsonResponse
    {
        [$lot, $created] = $this->lots->create($request->validated(), $request->user());
        $lot->load('materiel.categorie');

        return (new LotResource($lot))->response()->setStatusCode($created ? 201 : 200);
    }

    public function show(Lot $lot): JsonResponse
    {
        $lot->load(['materiel.categorie', 'documents']);

        return response()->json((new LotResource($lot))->resolve());
    }

    public function update(LotUpdateRequest $request, Lot $lot): JsonResponse
    {
        $lot = $this->lots->update($lot, $request->validated());
        $lot->load('materiel.categorie');

        return response()->json((new LotResource($lot))->resolve());
    }

    public function destroy(Lot $lot): JsonResponse
    {
        $this->lots->delete($lot);

        return response()->json(null, 204);
    }

    public function cycle(Lot $lot): JsonResponse
    {
        return response()->json($this->trace->cycle($lot));
    }

    /** Lot proposé pour une sortie : le plus ancien disponible (FIFO), modifiable manuellement par l'utilisateur. */
    public function suggestion(Request $request): JsonResponse
    {
        $data = $request->validate(['materiel_id' => ['required', 'uuid']]);

        $lot = $this->stock->suggestion($data['materiel_id']);
        if (! $lot) {
            throw new BusinessRuleException('Aucun lot disponible pour ce matériel.', 'AUCUN_LOT', 404);
        }
        $lot->load('materiel.categorie');

        return response()->json((new LotResource($lot))->resolve());
    }
}
