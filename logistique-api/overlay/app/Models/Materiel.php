<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Materiel extends Model
{
    use HasUuids, SoftDeletes;

    protected $table = 'materiels';

    protected $fillable = ['id', 'designation', 'categorie_id', 'marque_modele'];

    public function categorie(): BelongsTo
    {
        return $this->belongsTo(Categorie::class);
    }

    public function lots(): HasMany
    {
        return $this->hasMany(Lot::class);
    }
}
