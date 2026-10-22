<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->uuid('user_id')->nullable();
            $table->string('action', 60);
            $table->string('subject_type', 40)->nullable();
            $table->string('subject_id', 40)->nullable();
            $table->string('device_id', 36)->nullable();
            $table->string('ip', 45)->nullable();
            $table->json('avant')->nullable();
            $table->json('apres')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index('action');
            $table->index('user_id');
            $table->index('created_at');
        });

        Schema::create('archive_batches', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('type', 20); // export | reinitialisation
            $table->uuid('user_id');
            $table->json('stats')->nullable();
            $table->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('archive_batches');
        Schema::dropIfExists('audit_logs');
    }
};
