<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('devices', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('nom');
            $table->string('code_poste', 10)->unique(); // P01, P02... (P00 réservé au serveur)
            $table->timestamp('derniere_synchro')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
        });

        // Quels utilisateurs se sont déjà connectés EN LIGNE sur quel poste (SEC-2.14, SEC-6.4).
        Schema::create('device_user', function (Blueprint $table) {
            $table->foreignUuid('device_id')->constrained('devices');
            $table->foreignUuid('user_id')->constrained('users');
            $table->timestamp('first_login_at')->nullable();
            $table->primary(['device_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('device_user');
        Schema::dropIfExists('devices');
    }
};
