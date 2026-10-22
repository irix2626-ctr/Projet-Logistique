<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * 1 lot = 1 arrivage fournisseur. `quantite_restante` est DÉRIVÉE (jamais stockée).
 */
class Lot extends Model
{
    use HasUuids, SoftDeletes;

    protected $table = 'lots';

    protected $fillable = [
        'id', 'numero_lot', 'materiel_id', 'structure_id',
        'fournisseur', 'description', 'usage', 'etat_fonctionnement',
        'no_serie_chassis', 'code_bailleur_immatriculation', 'structure_service',
        'observations', 'quantite_initiale', 'cout_total',
        'operateur_id', 'date_entree', 'est_stock_initial',
        'lot_origine_id', 'archive_batch_id', 'version',
    ];

    protected function casts(): array
    {
        return [
            'quantite_initiale' => 'integer',
            'cout_total' => 'decimal:2',
            'date_entree' => 'datetime',
            'est_stock_initial' => 'boolean',
            'version' => 'integer',
        ];
    }

    public function materiel(): BelongsTo
    {
        return $this->belongsTo(Materiel::class)->withTrashed();
    }

    public function structure(): BelongsTo
    {
        return $this->belongsTo(Structure::class)->withTrashed();
    }

    public function operateur(): BelongsTo
    {
        return $this->belongsTo(User::class, 'operateur_id')->withTrashed();
    }

    public function sorties(): HasMany
    {
        return $this->hasMany(Sortie::class);
    }

    public function documents(): HasMany
    {
        return $this->hasMany(Document::class, 'rattache_id')->where('rattache_type', 'lot');
    }

    /** Total sorti : utilise `total_sorti` (withSum) s'il est chargé, sinon interroge la base. */
    public function totalSorti(): int
    {
        if (array_key_exists('total_sorti', $this->attributes)) {
            return (int) $this->attributes['total_sorti'];
        }

        return (int) $this->sorties()->sum('quantite');
    }

    public function quantiteRestante(): int
    {
        return $this->quantite_initiale - $this->totalSorti();
    }

    /** Valeur au prorata : cout_total x restante / initiale (calculée, jamais stockée). */
    public function valeurRestante(): float
    {
        if ($this->quantite_initiale <= 0) {
            return 0.0;
        }

        return round((float) $this->cout_total * max(0, $this->quantiteRestante()) / $this->quantite_initiale, 2);
    }
}
