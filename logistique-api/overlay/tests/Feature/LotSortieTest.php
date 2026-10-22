<?php

namespace Tests\Feature;

use App\Models\Lot;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\MakesFixtures;
use Tests\TestCase;

class LotSortieTest extends TestCase
{
    use MakesFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpFixtures();
        $this->asPersonnel();
    }

    public function test_creer_un_lot_le_rend_disponible_au_stock(): void
    {
        $payload = $this->lotPayload();

        $this->postJson('/api/v1/lots', $payload)
            ->assertCreated()
            ->assertJsonPath('quantite_restante', 10)
            ->assertJsonPath('operateur_id', $this->personnel->id)
            ->assertJsonPath('structure_id', $this->structure->id);

        $this->getJson('/api/v1/stock')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_creation_de_lot_est_idempotente(): void
    {
        $payload = $this->lotPayload();

        $this->postJson('/api/v1/lots', $payload)->assertCreated();
        $this->postJson('/api/v1/lots', $payload)->assertOk();

        $this->assertSame(1, Lot::count());
    }

    public function test_numero_de_lot_invalide_est_refuse(): void
    {
        $this->postJson('/api/v1/lots', $this->lotPayload(['numero_lot' => 'ABC-1']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('numero_lot');
    }

    public function test_aucun_cout_unitaire_n_est_accepte_ni_expose(): void
    {
        $response = $this->postJson('/api/v1/lots', $this->lotPayload(['cout_unitaire' => 99]))->assertCreated();

        $this->assertArrayNotHasKey('cout_unitaire', $response->json());
    }

    public function test_sortie_sans_lot_est_refusee(): void
    {
        $this->postJson('/api/v1/sorties', [
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'quantite' => 1,
            'nom_beneficiaire' => 'X',
            'usage' => 'Test',
            'etat_fonctionnement' => 'fonctionnel',
        ])->assertStatus(422)->assertJsonValidationErrors('lot_id');
    }

    public function test_sortie_superieure_au_reste_est_refusee(): void
    {
        $lotId = $this->createLot(['quantite_initiale' => 10]);

        $this->postJson('/api/v1/sorties', $this->sortiePayload($lotId, 11))
            ->assertStatus(409)
            ->assertJsonPath('code', 'STOCK_INSUFFISANT');
    }

    public function test_sorties_successives_jusqu_a_epuisement(): void
    {
        $lotId = $this->createLot(['quantite_initiale' => 10]);

        $this->postJson('/api/v1/sorties', $this->sortiePayload($lotId, 4))->assertCreated();
        $this->postJson('/api/v1/sorties', $this->sortiePayload($lotId, 6))->assertCreated();
        $this->postJson('/api/v1/sorties', $this->sortiePayload($lotId, 1))->assertStatus(409);

        $this->getJson('/api/v1/lots/'.$lotId)->assertJsonPath('quantite_restante', 0);
        $this->getJson('/api/v1/stock')->assertJsonCount(0, 'data');
    }

    public function test_pr_sr_et_operateur_sont_imposes_par_le_serveur(): void
    {
        $lotId = $this->createLot();

        $this->postJson('/api/v1/sorties', $this->sortiePayload($lotId, 2, [
            'pr_sr' => 'PIRATE',
            'operateur_id' => $this->admin->id,
        ]))
            ->assertCreated()
            ->assertJsonPath('pr_sr', 'PNLP')
            ->assertJsonPath('operateur_id', $this->personnel->id);
    }

    public function test_les_sorties_sont_en_lecture_seule(): void
    {
        $lotId = $this->createLot();
        $sortieId = $this->postJson('/api/v1/sorties', $this->sortiePayload($lotId, 1))->json('id');

        $this->putJson('/api/v1/sorties/'.$sortieId, ['quantite' => 5])->assertStatus(405);
        $this->deleteJson('/api/v1/sorties/'.$sortieId)->assertStatus(405);
    }

    public function test_un_lot_avec_sorties_ne_peut_pas_etre_supprime(): void
    {
        $lotAvec = $this->createLot();
        $lotSans = $this->createLot();
        $this->postJson('/api/v1/sorties', $this->sortiePayload($lotAvec, 1))->assertCreated();

        $this->deleteJson('/api/v1/lots/'.$lotAvec)->assertStatus(409)->assertJsonPath('code', 'LOT_AVEC_SORTIES');

        $this->deleteJson('/api/v1/lots/'.$lotSans)->assertNoContent();
        $this->assertSoftDeleted('lots', ['id' => $lotSans]);
    }

    public function test_quantite_initiale_ne_peut_pas_passer_sous_les_sorties(): void
    {
        $lotId = $this->createLot(['quantite_initiale' => 10]);
        $this->postJson('/api/v1/sorties', $this->sortiePayload($lotId, 5))->assertCreated();

        $this->putJson('/api/v1/lots/'.$lotId, ['quantite_initiale' => 3])
            ->assertStatus(409)
            ->assertJsonPath('code', 'QUANTITE_SOUS_SORTIES');

        $this->putJson('/api/v1/lots/'.$lotId, ['quantite_initiale' => 8])->assertOk()->assertJsonPath('quantite_restante', 3);
    }

    public function test_le_lot_le_plus_ancien_est_propose_en_premier(): void
    {
        $recent = $this->createLot();
        $ancien = $this->createLot();
        Lot::whereKey($ancien)->update(['date_entree' => now()->subDays(5)]);

        $this->getJson('/api/v1/lots/suggestion?materiel_id='.$this->materiel->id)
            ->assertOk()
            ->assertJsonPath('id', $ancien);
    }

    public function test_valeur_du_stock_au_prorata(): void
    {
        $lotId = $this->createLot(['quantite_initiale' => 10, 'cout_total' => 1000]);
        $this->postJson('/api/v1/sorties', $this->sortiePayload($lotId, 4))->assertCreated();

        // Montants en décimal : comparaison souple (600 == 600.0).
        $this->getJson('/api/v1/lots/'.$lotId)->assertJson(['valeur_restante' => 600]);
        $this->getJson('/api/v1/dashboard')
            ->assertOk()
            ->assertJson(['valeur_totale_stock' => 600])
            ->assertJsonPath('etat_machines.fonctionnel', 6);
    }

    public function test_cycle_de_vie_et_tracabilite(): void
    {
        $lotId = $this->createLot(['quantite_initiale' => 10]);
        $this->postJson('/api/v1/sorties', $this->sortiePayload($lotId, 3))->assertCreated();
        $this->postJson('/api/v1/sorties', $this->sortiePayload($lotId, 2))->assertCreated();

        $this->getJson("/api/v1/lots/{$lotId}/cycle")
            ->assertOk()
            ->assertJsonPath('total_sorti', 5)
            ->assertJsonPath('reste', 5)
            ->assertJsonCount(2, 'sorties');

        $this->getJson('/api/v1/tracabilite')->assertOk()->assertJsonCount(3, 'data');
    }

    public function test_seul_un_admin_gere_les_categories(): void
    {
        $this->postJson('/api/v1/categories', ['id' => (string) \Illuminate\Support\Str::uuid(), 'nom' => 'Nouvelle'])->assertForbidden();

        $this->asAdmin()->postJson('/api/v1/categories', ['id' => (string) \Illuminate\Support\Str::uuid(), 'nom' => 'Nouvelle'])->assertCreated();
    }

    public function test_le_materiel_d_un_lot_peut_etre_corrige(): void
    {
        $lotId = $this->createLot();
        $autre = \App\Models\Materiel::create(['designation' => 'Imprimante', 'categorie_id' => $this->categorie->id]);

        $this->putJson('/api/v1/lots/'.$lotId, ['materiel_id' => $autre->id])
            ->assertOk()
            ->assertJsonPath('materiel_id', $autre->id);

        $this->putJson('/api/v1/lots/'.$lotId, ['materiel_id' => (string) \Illuminate\Support\Str::uuid()])
            ->assertStatus(422);
    }
}
