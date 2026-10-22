<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ArchiveBatch extends Model
{
    use HasUuids;

    public const UPDATED_AT = null;

    protected $table = 'archive_batches';

    protected $fillable = ['id', 'type', 'user_id', 'stats'];

    protected function casts(): array
    {
        return ['stats' => 'array'];
    }
}
