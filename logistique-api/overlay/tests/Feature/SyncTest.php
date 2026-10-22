<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\Lot;
use App\Models\Sortie;
use App\Models\SyncConflict;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Concerns\MakesFixtures;
use Tests\TestCase;

class SyncTest extends TestCase
{
    use MakesFixtures, RefreshDatabase;

    private Device $device;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpFixtures();

        $this->device = Device::create(['nom' => 'PC 1', 'code_poste' => 'P01']);
        $this->device->users()->attach($this->personnel->id, ['first_login_at' => now()]);

        $this->asPersonnel();
    }

    private function op(string $table, string $operation, string $recordId, array $payload = [], array $extra = []): array
    {
        return array_merge([
            'op_id' => (string) Str::uuid(),
            'table' => $table,
            'record_id' => $recordId,
            'operation' => $operation,
            'payload' => $payload,
            'client_ts' => now()->subMinutes(5)->toIso8601String(),
        ], $extra);
    }

    private function push(array $operations)
    {
        return $this->postJson('/api/v1/sync/push', ['device_id' => $this->device->id, 'operations' => $operations]);
    }

    private function lotOp(array $overrides = []): array
    {
        $payload = $this->lotPayload($overrides);

        return $this->op('lots', 'create', $payload['id'], $payload);
    }

    public function test_le_rejeu_d_une_operation_est_sans_effet(): void
    {
        $op = $this->lotOp();

        $this->push([$op])->assertOk()->assertJsonPath('results.0.status', 'accepted');
        $this->push([$op])->assertOk()->assertJsonPath('results.0.status', 'duplicate');

        $this->assertSame(1, Lot::count());
    }

    public function test_un_depassement_de_stock_est_accepte_et_signale(): void
    {
        $lotOp = $this->lotOp(['quantite_initiale' => 10]);
        $lotId = $lotOp['record_id'];

        $s1 = $this->sortiePayload($lotId, 6);
        $s2 = $this->sortiePayload($lotId, 6);

        $response = $this->push([
            $lotOp,
            $this->op('sorties', 'create', $s1['id'], $s1),
            $this->op('sorties', 'create', $s2['id'], $s2),
        ])->assertOk();

        $response->assertJsonPath('results.0.status', 'accepted')
            ->assertJsonPath('results.1.status', 'accepted')
            ->assertJsonPath('results.2.status', 'conflict');

        $this->assertNotNull($response->json('results.2.conflict_id'));
        $this->assertSame(2, Sortie::count()); // rien n'est rejeté en silence
        $this->assertSame(1, SyncConflict::where('type', 'depassement_stock')->count());

        $this->asAdmin()->getJson('/api/v1/admin/integrite')->assertOk()->assertJson(['total' => 1]);
    }

    public function test_operateur_jamais_connecte_sur_ce_poste_est_rejete(): void
    {
        $payload = $this->lotPayload(['operateur_id' => $this->admin->id]);

        $this->push([$this->op('lots', 'create', $payload['id'], $payload)])
            ->assertOk()
            ->assertJsonPath('results.0.status', 'rejected');

        $this->assertSame(0, Lot::count());
    }

    public function test_une_sortie_ne_se_modifie_pas_par_synchro(): void
    {
        $lotOp = $this->lotOp();
        $s = $this->sortiePayload($lotOp['record_id'], 1);

        $this->push([$lotOp, $this->op('sorties', 'create', $s['id'], $s)])->assertOk();

        $this->push([$this->op('sorties', 'update', $s['id'], ['quantite' => 9])])
            ->assertOk()
            ->assertJsonPath('results.0.status', 'rejected');

        $this->assertSame(1, Sortie::first()->quantite);
    }

    public function test_une_operation_invalide_ne_bloque_pas_les_autres(): void
    {
        $bad = $this->lotOp(['quantite_initiale' => -5]);
        $good = $this->lotOp();

        $this->push([$bad, $good])
            ->assertOk()
            ->assertJsonPath('results.0.status', 'rejected')
            ->assertJsonPath('results.1.status', 'accepted');
    }

    public function test_table_inconnue_rejetee(): void
    {
        $this->push([$this->op('personal_access_tokens', 'create', (string) Str::uuid(), ['x' => 1])])
            ->assertOk()
            ->assertJsonPath('results.0.status', 'rejected');
    }

    public function test_pull_renvoie_les_changements_et_les_suppressions(): void
    {
        $lotOp = $this->lotOp();
        $this->push([$lotOp])->assertOk();

        $first = $this->getJson('/api/v1/sync/pull?cursor=0&device_id='.$this->device->id)->assertOk();
        $tables = collect($first->json('changes'))->pluck('table')->all();
        $this->assertContains('lots', $tables);

        $cursor = $first->json('next_cursor');

        $this->push([$this->op('lots', 'delete', $lotOp['record_id'])])->assertOk()->assertJsonPath('results.0.status', 'accepted');

        $second = $this->getJson("/api/v1/sync/pull?cursor={$cursor}&device_id=".$this->device->id)->assertOk();
        $deleted = collect($second->json('changes'))->firstWhere('table', 'lots');

        $this->assertNotNull($deleted);
        $this->assertNotNull($deleted['record']['deleted_at']);
    }

    public function test_un_poste_revoque_est_refuse(): void
    {
        $this->device->forceFill(['revoked_at' => now()])->save();

        $this->push([$this->lotOp()])->assertStatus(403);
    }

    public function test_client_trop_ancien_recoit_426(): void
    {
        config(['logistique.min_client_version' => '2.0.0']);

        $this->withHeader('X-Client-Version', '1.0.0')
            ->postJson('/api/v1/sync/push', ['device_id' => $this->device->id, 'operations' => [$this->lotOp()]])
            ->assertStatus(426);
    }

    public function test_modification_concurrente_d_un_lot_est_signalee_sans_perdre_la_saisie(): void
    {
        $lotOp = $this->lotOp(['quantite_initiale' => 10]);
        $this->push([$lotOp])->assertOk();

        $update = fn (string $fournisseur, int $base) => $this->op('lots', 'update', $lotOp['record_id'], [
            'fournisseur' => $fournisseur,
            'operateur_id' => $this->personnel->id,
        ], ['base_version' => $base]);

        $this->push([$update('Premier SA', 1)])->assertOk()->assertJsonPath('results.0.status', 'accepted');
        // Un second poste modifie la version 1 alors que le serveur est déjà en version 2 : conflit signalé.
        $this->push([$update('Second SA', 1)])->assertOk()->assertJsonPath('results.0.status', 'conflict');

        $this->assertSame('Second SA', Lot::find($lotOp['record_id'])->fournisseur);
        $this->assertSame(1, SyncConflict::where('type', 'modification_concurrente')->count());
    }
}
