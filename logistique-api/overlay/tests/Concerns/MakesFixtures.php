<?php

namespace Tests\Concerns;

use App\Models\Categorie;
use App\Models\Materiel;
use App\Models\Structure;
use App\Models\User;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;

trait MakesFixtures
{
    protected Structure $structure;

    protected User $admin;

    protected User $personnel;

    protected Categorie $categorie;

    protected Materiel $materiel;

    private static int $lotCounter = 0;

    protected function setUpFixtures(): void
    {
        $this->structure = Structure::create(['nom' => 'PNLP']);

        $this->admin = User::create([
            'structure_id' => $this->structure->id, 'nom' => 'Admin', 'email' => 'admin',
            'password' => 'MotDePasse123', 'role' => 'admin', 'must_change_password' => false,
        ]);
        $this->personnel = User::create([
            'structure_id' => $this->structure->id, 'nom' => 'Agent', 'email' => 'agent',
            'password' => 'MotDePasse123', 'role' => 'personnel', 'must_change_password' => false,
        ]);

        $this->categorie = Categorie::create(['nom' => 'Informatique', 'icone' => 'laptop', 'couleur_fond' => '#EDE7F6']);
        $this->materiel = Materiel::create(['designation' => 'Ordinateur portable', 'categorie_id' => $this->categorie->id, 'marque_modele' => 'Dell 5420']);
    }

    protected function asPersonnel(): static
    {
        Sanctum::actingAs($this->personnel, ['personnel']);

        return $this;
    }

    protected function asAdmin(): static
    {
        Sanctum::actingAs($this->admin, ['admin', 'personnel']);

        return $this;
    }

    protected function lotPayload(array $overrides = []): array
    {
        self::$lotCounter++;

        return array_merge([
            'id' => (string) Str::uuid(),
            'numero_lot' => sprintf('LOT-2026-P01-%05d', self::$lotCounter),
            'materiel_id' => $this->materiel->id,
            'fournisseur' => 'Fournisseur SA',
            'usage' => 'Suivi des activités de terrain',
            'etat_fonctionnement' => 'fonctionnel',
            'quantite_initiale' => 10,
            'cout_total' => 1000,
        ], $overrides);
    }

    /** Crée un lot via l'API et renvoie son id. */
    protected function createLot(array $overrides = []): string
    {
        $payload = $this->lotPayload($overrides);
        $this->postJson('/api/v1/lots', $payload)->assertCreated();

        return $payload['id'];
    }

    protected function sortiePayload(string $lotId, int $quantite, array $overrides = []): array
    {
        return array_merge([
            'id' => (string) Str::uuid(),
            'lot_id' => $lotId,
            'quantite' => $quantite,
            'nom_beneficiaire' => 'Jean Kouassi',
            'contact_beneficiaire' => '+225 01 02 03 04',
            'fonction' => 'Chef de district',
            'usage' => 'Supervision',
            'etat_fonctionnement' => 'fonctionnel',
        ], $overrides);
    }
}
