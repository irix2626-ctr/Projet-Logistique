<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Resources\UserResource;
use App\Models\Device;
use App\Models\User;
use App\Services\AuditService;
use App\Support\Rules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /** Hash factice : même temps de réponse que l'identifiant existe ou non (SEC-2.4). */
    private const DUMMY_HASH = '$2y$12$esVzetCyPzC8NogS3Em/hXQq4qFY719LB/6F1kItkc0KREvz8wARI';

    public function login(LoginRequest $request): JsonResponse
    {
        $data = $request->validated();

        $user = User::query()
            ->where('email', $data['identifiant'])
            ->first();

        if (! $user || ! $user->isAdmin()) {
            $user = User::query()
                ->where('structure_id', $data['structure_id'])
                ->where('email', $data['identifiant'])
                ->first();
        }

        $passwordOk = Hash::check($data['mot_de_passe'], $user?->password ?? self::DUMMY_HASH);

        if (! $user || ! $passwordOk) {
            AuditService::log('connexion.echec', null, null, ['identifiant' => $data['identifiant']]);

            // Message identique : identifiant inconnu ou mauvais mot de passe.
            throw ValidationException::withMessages(['identifiant' => ['Identifiants invalides.']]);
        }

        $abilities = $user->isAdmin() ? ['admin', 'personnel'] : ['personnel'];
        $token = $user->createToken(
            $data['device_name'],
            $abilities,
            now()->addDays(config('logistique.token_ttl_days'))
        )->plainTextToken;

        $user->forceFill(['last_login_at' => now()])->saveQuietly();

        // Un utilisateur connecté en ligne sur un poste connu peut ensuite s'y connecter hors-ligne (SEC-2.14).
        if (! empty($data['device_id'])) {
            $device = Device::find($data['device_id']);
            if ($device && ! $device->isRevoked() && ! $device->users()->where('users.id', $user->getKey())->exists()) {
                $device->users()->attach($user->getKey(), ['first_login_at' => now()]);
            }
        }

        AuditService::log('connexion.reussie', $user, null, null, $user);

        return response()->json([
            'token' => $token,
            'user' => (new UserResource($user))->resolve(),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $token = $request->user()->currentAccessToken();

        if ($token && method_exists($token, 'delete')) {
            $token->delete();
        }

        return response()->json(null, 204);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json((new UserResource($request->user()))->resolve());
    }

    /** Changement de son propre mot de passe (obligatoire à la première connexion, SEC-2.2). */
    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'mot_de_passe_actuel' => ['required', 'string'],
            'nouveau_mot_de_passe' => ['required', 'string', Rules::password()],
        ]);

        $user = $request->user();

        if (! Hash::check($data['mot_de_passe_actuel'], $user->password)) {
            throw ValidationException::withMessages(['mot_de_passe_actuel' => ['Mot de passe actuel incorrect.']]);
        }

        $user->password = $data['nouveau_mot_de_passe'];
        $user->must_change_password = false;
        $user->save();

        // Les autres jetons du compte sont révoqués (SEC-2.8).
        $current = $user->currentAccessToken();
        $query = $user->tokens();
        if ($current && isset($current->id)) {
            $query->where('id', '!=', $current->id);
        }
        $query->delete();

        AuditService::log('mot_de_passe.change', $user);

        return response()->json((new UserResource($user))->resolve());
    }
}
