<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SyncLog extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'sync_log';

    protected $fillable = ['table_name', 'record_id', 'operation', 'device_id'];
}
