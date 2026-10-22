<?php

namespace App\Services;

use App\Exceptions\BusinessRuleException;
use App\Models\Lot;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class LotService
{
    public function __construct(private StockService $stock)
    {
    }

    /**
     * Crée un lot (entrée). Idempotent sur l'id : un rejeu renvoie le lot existant.
     *
     * @return array{0: Lot, 1: bool} [lot, créé ?]
     */
    public function create(array $data, User $operator, ?Carbon $dateEntree = null): array
    {
        return DB::transaction(function () use ($data, $operator, $dateEntree) {
            $existing = Lot::withTrashed()->find($data['id']);
            if ($existing) {
                return [$existing, false];
            }

            $lot = Lot::create([
                'id' => $data['id'],
                'numero_lot' => $data['numero_lot'],
                'materiel_id' => $data['materiel_id'],
                'structure_id' => $operator->structure_id,
                'fournisseur' => $data['fournisseur'],
                'description' => $data['description'] ?? null,
                'usage' => $data['usage'],
                'etat_fonctionnement' => $data['etat_fonctionnement'],
                'no_serie_chassis' => $data['no_serie_chassis'] ?? null,
                'code_bailleur_immatriculation' => $data['code_bailleur_immatriculation'] ?? null,
                'structure_service' => $data['structure_service'] ?? null,
                'observations' => $data['observations'] ?? null,
                'quantite_initiale' => $data['quantite_initiale'],
                'cout_total' => $data['cout_total'],
                'operateur_id' => $operator->getKey(),
                'date_entree' => $dateEntree ?? now(),
                'est_stock_initial' => false,
                'version' => 1,
            ]);

            return [$lot, true];
        });
    }

    /** Correction de saisie : la quantité initiale ne peut pas passer sous ce qui est déjà sorti. */
    public function update(Lot $lot, array $data): Lot
    {
        return DB::transaction(function () use ($lot, $data) {
            $lot = Lot::lockForUpdate()->findOrFail($lot->getKey());

            if (isset($data['version']) && (int) $data['version'] !== $lot->version) {
                throw new BusinessRuleException(
                    'Ce lot a été modifié entre-temps. Rechargez-le avant de corriger.',
                    'VERSION_OBSOLETE'
                );
            }

            if (isset($data['quantite_initiale']) && $data['quantite_initiale'] < $this->stock->totalSorti($lot)) {
                throw new BusinessRuleException(
                    'La quantité initiale ne peut pas être inférieure à la quantité déjà sortie.',
                    'QUANTITE_SOUS_SORTIES'
                );
            }

            unset($data['version']);
            $avant = $lot->only(array_keys($data));

            $lot->fill($data);
            $lot->version = $lot->version + 1;
            $lot->save();

            AuditService::log('lot.modifie', $lot, $avant, $lot->only(array_keys($data)));

            return $lot;
        });
    }

    /** Suppression logique, refusée si le lot a déjà des sorties. */
    public function delete(Lot $lot): void
    {
        DB::transaction(function () use ($lot) {
            $lot = Lot::lockForUpdate()->findOrFail($lot->getKey());

            if ($lot->sorties()->exists()) {
                throw new BusinessRuleException('Ce lot a déjà des sorties : suppression impossible.', 'LOT_AVEC_SORTIES');
            }

            $lot->delete();
            AuditService::log('lot.supprime', $lot);
        });
    }

    /** Filtres communs aux listes Entrées et Stockage (valeurs validées en amont). */
    public static function applyFilters(Builder $query, Request $request): Builder
    {
        $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'categorie_id' => ['nullable', 'uuid'],
            'structure_id' => ['nullable', 'uuid'],
            'fournisseur' => ['nullable', 'string', 'max:100'],
            'etat_fonctionnement' => ['nullable', 'in:'.implode(',', config('logistique.etats'))],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
        ]);

        if ($q = $request->query('q')) {
            $like = '%'.$q.'%';
            $query->where(function (Builder $w) use ($like) {
                $w->where('numero_lot', 'like', $like)
                    ->orWhere('fournisseur', 'like', $like)
                    ->orWhere('description', 'like', $like)
                    ->orWhere('no_serie_chassis', 'like', $like)
                    ->orWhere('code_bailleur_immatriculation', 'like', $like)
                    ->orWhereHas('materiel', fn (Builder $m) => $m->where('designation', 'like', $like)->orWhere('marque_modele', 'like', $like));
            });
        }
        if ($id = $request->query('categorie_id')) {
            $query->whereHas('materiel', fn (Builder $m) => $m->where('categorie_id', $id));
        }
        if ($id = $request->query('structure_id')) {
            $query->where('structure_id', $id);
        }
        if ($f = $request->query('fournisseur')) {
            $query->where('fournisseur', 'like', '%'.$f.'%');
        }
        if ($e = $request->query('etat_fonctionnement')) {
            $query->where('etat_fonctionnement', $e);
        }
        if ($d = $request->query('date_from')) {
            $query->whereDate('date_entree', '>=', $d);
        }
        if ($d = $request->query('date_to')) {
            $query->whereDate('date_entree', '<=', $d);
        }

        return $query;
    }
}
