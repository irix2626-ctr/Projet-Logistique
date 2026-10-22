<?php

namespace App\Observers;

use App\Models\SyncLog;
use Illuminate\Database\Eloquent\Model;

/**
 * Écrit une ligne dans sync_log à chaque création / modification / suppression (soft).
 * L'identifiant auto-incrémenté de sync_log est le curseur `server_seq` de /sync/pull.
 */
class SyncObserver
{
    public function created(Model $model): void
    {
        $this->log($model, 'created');
    }

    public function updated(Model $model): void
    {
        $this->log($model, 'updated');
    }

    public function deleted(Model $model): void
    {
        $this->log($model, 'deleted');
    }

    public function restored(Model $model): void
    {
        $this->log($model, 'updated');
    }

    private function log(Model $model, string $operation): void
    {
        SyncLog::create([
            'table_name' => $model->getTable(),
            'record_id' => $model->getKey(),
            'operation' => $operation,
        ]);
    }
}
