<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Lot */
class LotResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $lot = $this->resource;

        $data = [
            'id' => $lot->id,
            'numero_lot' => $lot->numero_lot,
            'materiel_id' => $lot->materiel_id,
            'structure_id' => $lot->structure_id,
            'fournisseur' => $lot->fournisseur,
            'description' => $lot->description,
            'usage' => $lot->usage,
            'etat_fonctionnement' => $lot->etat_fonctionnement,
            'no_serie_chassis' => $lot->no_serie_chassis,
            'code_bailleur_immatriculation' => $lot->code_bailleur_immatriculation,
            'structure_service' => $lot->structure_service,
            'observations' => $lot->observations,
            'quantite_initiale' => $lot->quantite_initiale,
            'cout_total' => (float) $lot->cout_total,
            'operateur_id' => $lot->operateur_id,
            'date_entree' => $lot->date_entree?->toIso8601String(),
            'est_stock_initial' => $lot->est_stock_initial,
            'lot_origine_id' => $lot->lot_origine_id,
            'archive_batch_id' => $lot->archive_batch_id,
            'quantite_restante' => $lot->quantiteRestante(),
            'valeur_restante' => $lot->valeurRestante(),
            'version' => $lot->version,
        ];

        if ($lot->relationLoaded('materiel') && $lot->materiel) {
            $materiel = $lot->materiel->toArray();
            if ($lot->materiel->relationLoaded('categorie')) {
                $materiel['categorie'] = $lot->materiel->categorie?->toArray();
            }
            $data['materiel'] = $materiel;
        }

        if ($lot->relationLoaded('documents')) {
            $data['documents'] = $lot->documents->map(fn ($d) => $d->only(['id', 'rattache_type', 'rattache_id', 'nom', 'mime']))->values()->all();
        }

        return $data;
    }
}
