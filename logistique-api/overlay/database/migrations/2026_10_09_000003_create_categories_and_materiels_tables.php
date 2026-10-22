<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('nom')->unique();
            $table->string('icone')->nullable();          // nom d'icône Lucide
            $table->string('couleur_fond', 20)->nullable(); // couleur pastel
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('materiels', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('designation');
            $table->foreignUuid('categorie_id')->constrained('categories');
            $table->string('marque_modele')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('designation');
            $table->index('categorie_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('materiels');
        Schema::dropIfExists('categories');
    }
};
