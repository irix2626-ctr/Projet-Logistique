<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sorties', function (Blueprint $table) {
            $table->uuid('id')->primary();
            // Critère n°1 : une sortie est TOUJOURS rattachée à un lot précis.
            $table->foreignUuid('lot_id')->constrained('lots');
            $table->unsignedInteger('quantite');

            $table->string('nom_beneficiaire');
            $table->string('contact_beneficiaire')->nullable();
            $table->string('fonction')->nullable();

            $table->string('pr_sr');                    // structure de l'opérateur (automatique)
            $table->string('usage');
            $table->string('etat_fonctionnement', 20);
            $table->text('description')->nullable();
            $table->string('signature_path')->nullable();

            $table->foreignUuid('operateur_id')->constrained('users');
            $table->dateTime('date_sortie');

            $table->uuid('archive_batch_id')->nullable();
            $table->boolean('conflit_stock')->default(false);

            $table->timestamps();
            $table->softDeletes();

            $table->index('lot_id');
            $table->index('date_sortie');
            $table->index('archive_batch_id');
            $table->index('deleted_at');
        });

        if (in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE sorties ADD CONSTRAINT chk_sorties_quantite CHECK (quantite > 0)');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('sorties');
    }
};
