<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lots', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('numero_lot', 40)->unique(); // LOT-AAAA-Pxx-00001
            $table->foreignUuid('materiel_id')->constrained('materiels');
            $table->foreignUuid('structure_id')->constrained('structures');

            $table->string('fournisseur');
            $table->text('description')->nullable();
            $table->string('usage');                     // à quoi sert la ressource
            $table->string('etat_fonctionnement', 20);   // fonctionnel | non_fonctionnel
            $table->string('no_serie_chassis')->nullable();
            $table->string('code_bailleur_immatriculation')->nullable();
            $table->string('structure_service')->nullable();
            $table->text('observations')->nullable();

            $table->unsignedInteger('quantite_initiale');
            // Coût TOTAL du lot. Aucun coût unitaire n'existe dans le système.
            $table->decimal('cout_total', 14, 2);

            $table->foreignUuid('operateur_id')->constrained('users');
            $table->dateTime('date_entree');

            $table->boolean('est_stock_initial')->default(false);
            $table->uuid('lot_origine_id')->nullable();
            $table->uuid('archive_batch_id')->nullable();
            $table->unsignedInteger('version')->default(1);

            $table->timestamps();
            $table->softDeletes();

            $table->foreign('lot_origine_id')->references('id')->on('lots');
            $table->index('materiel_id');
            $table->index('structure_id');
            $table->index('date_entree');
            $table->index('archive_batch_id');
            $table->index('deleted_at');
        });

        // SEC-5.5 : contraintes en base (MySQL ; SQLite ne sait pas ajouter une contrainte après coup).
        if (in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE lots ADD CONSTRAINT chk_lots_quantite CHECK (quantite_initiale > 0)');
            DB::statement('ALTER TABLE lots ADD CONSTRAINT chk_lots_cout CHECK (cout_total >= 0)');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('lots');
    }
};
