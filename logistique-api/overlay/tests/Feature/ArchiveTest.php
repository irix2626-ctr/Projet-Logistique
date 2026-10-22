<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\Lot;
use App\Models\Sortie;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\MakesFixtures;
use Tests\TestCase;

class ArchiveTest extends TestCase
{
    use MakesFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpFixtures();
    }

    private function seedStock(): array
    {
        $this->asPersonnel();
        $a = $this->createLot(['quantite_initiale' => 10, 'cout_total' => 1000]);
        $b = $this->createLot(['quantite_initiale' => 5, 'cout_total' => 500]);
        $this->postJson('/api/v1/sorties', $this->sortiePayload($a, 4))->assertCreated();

        return [$a, $b];
    }

    public function test_archivage_conserve_la_valeur_du_stock_et_ne_supprime_rien(): void
    {
        [$a, $b] = $this->seedStock();
        $lotsAvant = Lot::withTrashed()->count();
        $sortiesAvant = Sortie::withTrashed()->count();

        $this->asAdmin()
            ->postJson('/api/v1/admin/archivage', ['export_confirme' => true, 'mot_de_passe' => 'MotDePasse123'])
            ->assertOk()
            ->assertJsonPath('lots_reportes', 2)
            ->assertJson(['valeur_stock_avant' => 1100, 'valeur_stock_apres' => 1100]);

        // Rien n'est supprimé physiquement : le nombre de lignes ne diminue jamais.
        $this->assertGreaterThanOrEqual($lotsAvant, Lot::withTrashed()->count());
        $this->assertSame($sortiesAvant, Sortie::withTrashed()->count());

        // L'interface repart à zéro : seuls les lots de report sont actifs.
        $actifs = Lot::all();
        $this->assertCount(2, $actifs);
        foreach ($actifs as $lot) {
            $this->assertTrue($lot->est_stock_initial);
            $this->assertNotNull($lot->lot_origine_id);
            $this->assertMatchesRegularExpression('/^LOT-\d{4}-P00-\d{5}$/', $lot->numero_lot);
        }
        $this->assertSame(0, Sortie::count());

        // Le lot partiellement sorti est reporté pour sa quantité restante, au prorata.
        $report = Lot::where('lot_origine_id', $a)->first();
        $this->assertSame(6, $report->quantite_initiale);
        $this->assertEquals(600.0, (float) $report->cout_total);

        $this->getJson('/api/v1/admin/integrite')->assertOk()->assertJson(['total' => 0]);
        $this->getJson('/api/v1/dashboard')->assertJson(['valeur_totale_stock' => 1100]);
    }

    public function test_le_lot_archive_garde_sa_trace(): void
    {
        [$a] = $this->seedStock();

        $this->asAdmin()->postJson('/api/v1/admin/archivage', ['export_confirme' => true, 'mot_de_passe' => 'MotDePasse123'])->assertOk();

        $this->assertSoftDeleted('lots', ['id' => $a]);
        $this->assertNotNull(Lot::withTrashed()->find($a)->archive_batch_id);
    }

    public function test_mot_de_passe_incorrect_refuse_l_archivage(): void
    {
        $this->seedStock();

        $this->asAdmin()
            ->postJson('/api/v1/admin/archivage', ['export_confirme' => true, 'mot_de_passe' => 'faux'])
            ->assertStatus(403)
            ->assertJsonPath('code', 'MOT_DE_PASSE_INVALIDE');

        $this->assertSame(2, Lot::count());
    }

    public function test_l_export_doit_etre_confirme(): void
    {
        $this->seedStock();

        $this->asAdmin()
            ->postJson('/api/v1/admin/archivage', ['mot_de_passe' => 'MotDePasse123'])
            ->assertStatus(422);
    }

    public function test_un_personnel_ne_peut_pas_archiver(): void
    {
        $this->asPersonnel()
            ->postJson('/api/v1/admin/archivage', ['export_confirme' => true, 'mot_de_passe' => 'MotDePasse123'])
            ->assertForbidden();
    }

    public function test_les_postes_non_synchronises_sont_signales(): void
    {
        $this->seedStock();
        Device::create(['nom' => 'PC en retard', 'code_poste' => 'P02']);

        $this->asAdmin()
            ->postJson('/api/v1/admin/archivage', ['export_confirme' => true, 'mot_de_passe' => 'MotDePasse123'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'POSTES_NON_SYNCHRONISES');

        $this->asAdmin()
            ->postJson('/api/v1/admin/archivage', [
                'export_confirme' => true,
                'mot_de_passe' => 'MotDePasse123',
                'forcer_si_postes_non_synchronises' => true,
            ])
            ->assertOk();
    }

    public function test_reinitialisation_utilise_le_meme_mecanisme(): void
    {
        $this->seedStock();

        $this->asAdmin()
            ->postJson('/api/v1/admin/reinitialisation', ['mot_de_passe' => 'MotDePasse123'])
            ->assertOk()
            ->assertJson(['valeur_stock_avant' => 1100, 'valeur_stock_apres' => 1100]);
    }
}
