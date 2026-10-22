<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Journal des changements : son id auto-incrémenté EST le curseur `server_seq`.
        Schema::create('sync_log', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('table_name', 40);
            $table->uuid('record_id');
            $table->string('operation', 10); // created | updated | deleted
            $table->uuid('device_id')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['table_name', 'record_id']);
        });

        // Opérations déjà traitées : le rejeu d'un op_id est sans effet (idempotence).
        Schema::create('sync_ops', function (Blueprint $table) {
            $table->uuid('op_id')->primary();
            $table->uuid('device_id')->nullable();
            $table->string('status', 15);
            $table->unsignedBigInteger('server_seq')->nullable();
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('sync_conflicts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('type', 40); // depassement_stock | modification_concurrente | lot_archive
            $table->uuid('lot_id')->nullable();
            $table->uuid('sortie_id')->nullable();
            $table->uuid('device_id')->nullable();
            $table->text('detail');
            $table->boolean('resolu')->default(false);
            $table->text('commentaire')->nullable();
            $table->uuid('resolved_by')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->index('resolu');
            $table->index('lot_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sync_conflicts');
        Schema::dropIfExists('sync_ops');
        Schema::dropIfExists('sync_log');
    }
};
