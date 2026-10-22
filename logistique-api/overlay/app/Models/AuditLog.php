<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Journal d'audit en ajout seul (SEC-5.3 : la base n'accorde que INSERT et SELECT). */
class AuditLog extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'audit_logs';

    protected $fillable = ['user_id', 'action', 'subject_type', 'subject_id', 'device_id', 'ip', 'avant', 'apres'];

    protected function casts(): array
    {
        return ['avant' => 'array', 'apres' => 'array'];
    }
}
