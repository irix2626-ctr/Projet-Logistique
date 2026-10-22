<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/** Journal d'audit (SEC-10.1). Ne reçoit jamais de mot de passe, de jeton ni de signature. */
class AuditService
{
    public static function log(
        string $action,
        ?Model $subject = null,
        ?array $avant = null,
        ?array $apres = null,
        ?User $user = null,
    ): void {
        $request = request();

        AuditLog::create([
            'user_id' => ($user ?? $request->user())?->getKey(),
            'action' => $action,
            'subject_type' => $subject?->getTable(),
            'subject_id' => $subject?->getKey(),
            'device_id' => Str::limit((string) $request->header('X-Device-Id'), 36, '') ?: null,
            'ip' => $request->ip(),
            'avant' => $avant,
            'apres' => $apres,
        ]);
    }
}
