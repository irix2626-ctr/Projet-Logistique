<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class SyncConflict extends Model
{
    use HasUuids;

    protected $table = 'sync_conflicts';

    protected $fillable = [
        'id', 'type', 'lot_id', 'sortie_id', 'device_id', 'detail',
        'resolu', 'commentaire', 'resolved_by', 'resolved_at',
    ];

    protected function casts(): array
    {
        return [
            'resolu' => 'boolean',
            'resolved_at' => 'datetime',
        ];
    }
}
