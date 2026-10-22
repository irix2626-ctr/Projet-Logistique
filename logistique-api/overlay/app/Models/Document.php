<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Pièce jointe libre (PDF, image). Aucun type « bon de livraison ». */
class Document extends Model
{
    use HasUuids, SoftDeletes;

    protected $table = 'documents';

    protected $fillable = [
        'id', 'rattache_type', 'rattache_id', 'nom', 'chemin', 'mime',
        'taille', 'sha256', 'operateur_id', 'archive_batch_id',
    ];

    // Le chemin interne n'est jamais exposé par l'API de synchronisation.
    protected $hidden = ['chemin'];
}
