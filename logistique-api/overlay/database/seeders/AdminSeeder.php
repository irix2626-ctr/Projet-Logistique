<?php

namespace Database\Seeders;

use App\Models\Structure;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class AdminSeeder extends Seeder
{
    /** Crée le premier administrateur avec un mot de passe ALÉATOIRE affiché une seule fois (SEC-2.12). */
    public function run(): void
    {
        $identifiant = config('logistique.admin.identifiant');

        if (User::withTrashed()->where('email', $identifiant)->exists()) {
            $this->command?->info("Administrateur « {$identifiant} » déjà présent : rien à faire.");

            return;
        }

        $password = Str::password(16);

        User::create([
            'id' => (string) Str::uuid(),
            'structure_id' => Structure::where('nom', 'Service central')->firstOrFail()->getKey(),
            'nom' => config('logistique.admin.nom'),
            'email' => $identifiant,
            'password' => $password,
            'role' => 'admin',
            'must_change_password' => true,
        ]);

        $this->command?->warn('============================================================');
        $this->command?->warn(" Compte administrateur créé (structure : Service central)");
        $this->command?->warn(" Identifiant   : {$identifiant}");
        $this->command?->warn(" Mot de passe  : {$password}");
        $this->command?->warn(' Notez-le maintenant : il ne sera plus jamais affiché.');
        $this->command?->warn('============================================================');
    }
}
