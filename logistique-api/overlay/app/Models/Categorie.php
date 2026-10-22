<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Categorie extends Model
{
    use HasUuids, SoftDeletes;

    protected $table = 'categories';

    protected $fillable = ['id', 'nom', 'icone', 'couleur_fond'];

    public function materiels(): HasMany
    {
        return $this->hasMany(Materiel::class);
    }
}
