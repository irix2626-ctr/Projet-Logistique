<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Sortie : événement en ajout seul, lecture seule (aucune route PUT/DELETE). */
class Sortie extends Model
{
    use HasUuids, SoftDeletes;

    protected $table = 'sorties';

    protected $fillable = [
        'id', 'lot_id', 'quantite', 'nom_beneficiaire', 'contact_beneficiaire', 'fonction',
        'pr_sr', 'usage', 'etat_fonctionnement', 'description', 'signature_path',
        'operateur_id', 'date_sortie', 'archive_batch_id', 'conflit_stock',
    ];

    protected function casts(): array
    {
        return [
            'quantite' => 'integer',
            'date_sortie' => 'datetime',
            'conflit_stock' => 'boolean',
        ];
    }

    public function lot(): BelongsTo
    {
        return $this->belongsTo(Lot::class)->withTrashed();
    }

    public function operateur(): BelongsTo
    {
        return $this->belongsTo(User::class, 'operateur_id')->withTrashed();
    }

    public function documents(): HasMany
    {
        return $this->hasMany(Document::class, 'rattache_id')->where('rattache_type', 'sortie');
    }
}
