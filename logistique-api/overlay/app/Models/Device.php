<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Device extends Model
{
    use HasUuids;

    protected $table = 'devices';

    protected $fillable = ['id', 'nom', 'code_poste', 'derniere_synchro', 'revoked_at'];

    protected function casts(): array
    {
        return [
            'derniere_synchro' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'device_user')->withPivot('first_login_at');
    }

    public function isRevoked(): bool
    {
        return $this->revoked_at !== null;
    }
}
