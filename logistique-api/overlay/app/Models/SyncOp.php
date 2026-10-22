<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Opérations de synchronisation déjà traitées (idempotence par op_id). */
class SyncOp extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'sync_ops';

    protected $primaryKey = 'op_id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['op_id', 'device_id', 'status', 'server_seq'];
}
