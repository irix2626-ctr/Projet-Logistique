<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Sortie */
class SortieResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $s = $this->resource;

        return [
            'id' => $s->id,
            'lot_id' => $s->lot_id,
            'numero_lot' => $s->relationLoaded('lot') ? $s->lot?->numero_lot : null,
            'quantite' => $s->quantite,
            'nom_beneficiaire' => $s->nom_beneficiaire,
            'contact_beneficiaire' => $s->contact_beneficiaire,
            'fonction' => $s->fonction,
            'pr_sr' => $s->pr_sr,
            'usage' => $s->usage,
            'etat_fonctionnement' => $s->etat_fonctionnement,
            'description' => $s->description,
            'signature_path' => $s->signature_path,
            'operateur_id' => $s->operateur_id,
            'date_sortie' => $s->date_sortie?->toIso8601String(),
            'archive_batch_id' => $s->archive_batch_id,
            'conflit_stock' => $s->conflit_stock,
        ];
    }
}
