<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('documents', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('rattache_type', 10);   // lot | sortie
            $table->uuid('rattache_id');
            $table->string('nom');
            $table->string('chemin')->nullable();  // null tant que le fichier n'est pas arrivé (synchro)
            $table->string('mime', 100)->nullable();
            $table->unsignedInteger('taille')->nullable();
            $table->string('sha256', 64)->nullable();
            $table->foreignUuid('operateur_id')->constrained('users');
            $table->uuid('archive_batch_id')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['rattache_type', 'rattache_id']);
            $table->index('archive_batch_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('documents');
    }
};
