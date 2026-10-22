<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\Paginates;
use App\Http\Controllers\Controller;
use App\Http\Requests\SortieStoreRequest;
use App\Http\Resources\LotResource;
use App\Http\Resources\SortieResource;
use App\Models\Sortie;
use App\Services\SortieService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/** Sorties : lecture seule. Aucune route PUT/DELETE n'existe (405). */
class SortieController extends Controller
{
    use Paginates;

    public function __construct(private SortieService $sorties)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'lot_id' => ['nullable', 'uuid'],
            'pr_sr' => ['nullable', 'string', 'max:100'],
            'operateur_id' => ['nullable', 'uuid'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
        ]);

        $query = Sortie::query()->with('lot');

        if ($q = $request->query('q')) {
            $like = '%'.$q.'%';
            $query->where(function (Builder $w) use ($like) {
                $w->where('nom_beneficiaire', 'like', $like)
                    ->orWhere('pr_sr', 'like', $like)
                    ->orWhere('usage', 'like', $like)
                    ->orWhere('fonction', 'like', $like)
                    ->orWhereHas('lot', fn (Builder $l) => $l->where('numero_lot', 'like', $like));
            });
        }
        if ($v = $request->query('lot_id')) {
            $query->where('lot_id', $v);
        }
        if ($v = $request->query('pr_sr')) {
            $query->where('pr_sr', 'like', '%'.$v.'%');
        }
        if ($v = $request->query('operateur_id')) {
            $query->where('operateur_id', $v);
        }
        if ($v = $request->query('date_from')) {
            $query->whereDate('date_sortie', '>=', $v);
        }
        if ($v = $request->query('date_to')) {
            $query->whereDate('date_sortie', '<=', $v);
        }

        $page = $query->orderByDesc('date_sortie')->orderByDesc('id')->cursorPaginate($this->pageSize());

        return response()->json($this->pageOf($page, fn ($s) => (new SortieResource($s))->resolve()));
    }

    public function store(SortieStoreRequest $request): JsonResponse
    {
        [$sortie, $created] = $this->sorties->create($request->validated(), $request->user());
        $sortie->load('lot');

        return (new SortieResource($sortie))->response()->setStatusCode($created ? 201 : 200);
    }

    public function show(Sortie $sortie): JsonResponse
    {
        $sortie->load('lot');

        return response()->json((new SortieResource($sortie))->resolve());
    }

    /** Données du Bon de Sortie ; le PDF est généré côté client (hors-ligne). */
    public function bon(Sortie $sortie): JsonResponse
    {
        $sortie->load(['lot.materiel.categorie', 'operateur']);

        return response()->json([
            'sortie' => (new SortieResource($sortie))->resolve(),
            'lot' => (new LotResource($sortie->lot))->resolve(),
            'operateur_nom' => $sortie->operateur?->nom,
            'signature_url' => $sortie->signature_path ? url('/api/v1/sorties/'.$sortie->id.'/signature') : null,
        ]);
    }

    /** Signature : servie uniquement par une route authentifiée (SEC-7.4). */
    public function signature(Sortie $sortie)
    {
        abort_unless($sortie->signature_path && Storage::disk('local')->exists($sortie->signature_path), 404);

        return Storage::disk('local')->response($sortie->signature_path, 'signature.png', [
            'Content-Type' => 'image/png',
            'Cache-Control' => 'private, no-store',
        ]);
    }
}
