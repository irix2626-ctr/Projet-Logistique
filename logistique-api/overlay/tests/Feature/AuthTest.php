<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\Concerns\MakesFixtures;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use MakesFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpFixtures();
    }

    private function credentials(string $password = 'MotDePasse123', string $identifiant = 'agent'): array
    {
        return [
            'structure_id' => $this->structure->id,
            'identifiant' => $identifiant,
            'mot_de_passe' => $password,
            'device_name' => 'PC Magasin 1',
        ];
    }

    public function test_connexion_reussie_renvoie_un_jeton(): void
    {
        $this->postJson('/api/v1/auth/login', $this->credentials())
            ->assertOk()
            ->assertJsonStructure(['token', 'user' => ['id', 'structure_id', 'nom', 'role']])
            ->assertJsonPath('user.role', 'personnel');
    }

    public function test_mauvais_mot_de_passe_et_identifiant_inconnu_donnent_le_meme_message(): void
    {
        $a = $this->postJson('/api/v1/auth/login', $this->credentials('mauvais'))->assertStatus(422);
        $b = $this->postJson('/api/v1/auth/login', $this->credentials('MotDePasse123', 'inconnu'))->assertStatus(422);

        $this->assertSame($a->json('errors.identifiant'), $b->json('errors.identifiant'));
    }

    public function test_limitation_des_tentatives_de_connexion(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/auth/login', $this->credentials('mauvais'))->assertStatus(422);
        }

        $this->postJson('/api/v1/auth/login', $this->credentials('mauvais'))->assertStatus(429);
    }

    public function test_un_personnel_ne_peut_pas_gerer_les_comptes(): void
    {
        $token = $this->postJson('/api/v1/auth/login', $this->credentials())->json('token');

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/v1/users')
            ->assertForbidden();
    }

    public function test_route_protegee_sans_jeton_renvoie_401_json(): void
    {
        $this->getJson('/api/v1/lots')->assertUnauthorized();
    }

    public function test_deconnexion_revoque_le_jeton(): void
    {
        $token = $this->postJson('/api/v1/auth/login', $this->credentials())->json('token');
        $this->assertSame(1, PersonalAccessToken::count());

        $this->withHeader('Authorization', 'Bearer '.$token)->postJson('/api/v1/auth/logout')->assertNoContent();

        $this->assertSame(0, PersonalAccessToken::count());
    }

    public function test_admin_cree_un_compte_dans_sa_structure(): void
    {
        $this->asAdmin();

        $this->postJson('/api/v1/users', [
            'id' => (string) Str::uuid(),
            'nom' => 'Nouvel Agent',
            'email' => 'nouvel.agent',
            'mot_de_passe' => 'MotDePasse456',
        ])
            ->assertCreated()
            ->assertJsonPath('role', 'personnel')
            ->assertJsonPath('structure_id', $this->structure->id)
            ->assertJsonPath('must_change_password', true);
    }

    public function test_le_dernier_admin_est_protege(): void
    {
        $this->asAdmin();

        $this->deleteJson('/api/v1/users/'.$this->admin->id)
            ->assertStatus(409)
            ->assertJsonPath('code', 'DERNIER_ADMIN');

        $this->putJson('/api/v1/users/'.$this->admin->id, ['role' => 'personnel'])
            ->assertStatus(409);
    }

    public function test_suppression_de_compte_est_logique(): void
    {
        $this->asAdmin();

        $this->deleteJson('/api/v1/users/'.$this->personnel->id)->assertNoContent();

        $this->assertSoftDeleted('users', ['id' => $this->personnel->id]);
        $this->assertSame(1, User::withTrashed()->where('email', 'agent')->count());
    }
}
