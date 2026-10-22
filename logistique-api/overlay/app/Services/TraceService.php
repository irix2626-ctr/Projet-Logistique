<?php

namespace App\Services;

use App\Http\Resources\LotResource;
use App\Http\Resources\SortieResource;
use App\Models\Lot;
use Carbon\Carbon;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TraceService
{
    /** Journal unifié entrées + sorties (une seule liste triée par date décroissante). */
    public function journal(Request $request): Builder
    {
        $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'type' => ['nullable', 'in:entree,sortie'],
            'categorie_id' => ['nullable', 'uuid'],
            'numero_lot' => ['nullable', 'string', 'max:60'],
            'pr_sr' => ['nullable', 'string', 'max:100'],
            'operateur_id' => ['nullable', 'uuid'],
            'beneficiaire' => ['nullable', 'string', 'max:100'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
        ]);

        $query = $this->base();

        if ($v = $request->query('type')) {
            $query->where('type', $v);
        }
        if ($v = $request->query('categorie_id')) {
            $query->where('categorie_id', $v);
        }
        if ($v = $request->query('numero_lot')) {
            $query->where('numero_lot', 'like', '%'.$v.'%');
        }
        if ($v = $request->query('pr_sr')) {
            $query->where('pr_sr', 'like', '%'.$v.'%');
        }
        if ($v = $request->query('operateur_id')) {
            $query->where('operateur_id', $v);
        }
        if ($v = $request->query('beneficiaire')) {
            $query->where('beneficiaire', 'like', '%'.$v.'%');
        }
        if ($v = $request->query('date_from')) {
            $query->whereDate('date', '>=', $v);
        }
        if ($v = $request->query('date_to')) {
            $query->whereDate('date', '<=', $v);
        }
        if ($q = $request->query('q')) {
            $like = '%'.$q.'%';
            $query->where(function (Builder $w) use ($like) {
                $w->where('numero_lot', 'like', $like)
                    ->orWhere('designation', 'like', $like)
                    ->orWhere('categorie', 'like', $like)
                    ->orWhere('pr_sr', 'like', $like)
                    ->orWhere('beneficiaire', 'like', $like)
                    ->orWhere('operateur', 'like', $like);
            });
        }

        return $query;
    }

    /** Les N derniers mouvements (Dashboard, sans pagination). */
    public function latest(int $n = 100): array
    {
        return $this->base()->limit($n)->get()->map(fn ($row) => self::row($row))->all();
    }

    public static function row(object $row): array
    {
        return [
            'id' => $row->id,
            'type' => $row->type,
            'date' => Carbon::parse($row->date)->toIso8601String(),
            'numero_lot' => $row->numero_lot,
            'designation' => $row->designation,
            'categorie' => $row->categorie,
            'quantite' => (int) $row->quantite,
            'pr_sr' => $row->pr_sr,
            'beneficiaire' => $row->beneficiaire,
            'operateur' => $row->operateur,
        ];
    }

    /** Cycle de vie : arrivage -> sorties successives -> reste. */
    public function cycle(Lot $lot): array
    {
        $lot->load('materiel.categorie')->loadSum('sorties as total_sorti', 'quantite');
        $sorties = $lot->sorties()->with('lot')->orderBy('date_sortie')->get();
        $total = (int) $sorties->sum('quantite');

        return [
            'lot' => (new LotResource($lot))->resolve(),
            'sorties' => $sorties->map(fn ($s) => (new SortieResource($s))->resolve())->all(),
            'total_sorti' => $total,
            'reste' => $lot->quantite_initiale - $total,
        ];
    }

    /** Requête de base : UNION des entrées (lots) et des sorties actives. */
    private function base(): Builder
    {
        $entrees = DB::table('lots')
            ->join('materiels', 'materiels.id', '=', 'lots.materiel_id')
            ->join('categories', 'categories.id', '=', 'materiels.categorie_id')
            ->join('users', 'users.id', '=', 'lots.operateur_id')
            ->whereNull('lots.deleted_at')
            ->selectRaw("lots.id as id, 'entree' as type, lots.date_entree as date, lots.numero_lot as numero_lot,
                materiels.designation as designation, categories.nom as categorie, categories.id as categorie_id,
                lots.quantite_initiale as quantite, NULL as pr_sr, NULL as beneficiaire,
                users.nom as operateur, users.id as operateur_id");

        $sorties = DB::table('sorties')
            ->join('lots', 'lots.id', '=', 'sorties.lot_id')
            ->join('materiels', 'materiels.id', '=', 'lots.materiel_id')
            ->join('categories', 'categories.id', '=', 'materiels.categorie_id')
            ->join('users', 'users.id', '=', 'sorties.operateur_id')
            ->whereNull('sorties.deleted_at')
            ->selectRaw("sorties.id as id, 'sortie' as type, sorties.date_sortie as date, lots.numero_lot as numero_lot,
                materiels.designation as designation, categories.nom as categorie, categories.id as categorie_id,
                sorties.quantite as quantite, sorties.pr_sr as pr_sr, sorties.nom_beneficiaire as beneficiaire,
                users.nom as operateur, users.id as operateur_id");

        return DB::query()
            ->fromSub($entrees->unionAll($sorties), 't')
            ->orderByDesc('date')
            ->orderByDesc('id');
    }
}
