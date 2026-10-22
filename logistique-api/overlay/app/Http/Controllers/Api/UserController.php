<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Api\Concerns\Paginates;
use App\Http\Controllers\Controller;
use App\Http\Requests\UserStoreRequest;
use App\Http\Requests\UserUpdateRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Gestion des comptes : admin uniquement, uniquement dans sa propre structure, pas d'inscription libre. */
class UserController extends Controller
{
    use Paginates;

    public function index(Request $request): JsonResponse
    {
        $page = User::query()
            ->where('structure_id', $request->user()->structure_id)
            ->orderBy('nom')->orderBy('id')
            ->cursorPaginate($this->pageSize());

        return response()->json($this->pageOf($page, fn ($u) => (new UserResource($u))->resolve()));
    }

    public function store(UserStoreRequest $request): JsonResponse
    {
        $data = $request->validated();

        $user = User::create([
            'id' => $data['id'],
            'structure_id' => $request->user()->structure_id,
            'nom' => $data['nom'],
            'email' => $data['email'],
            'password' => $data['mot_de_passe'],
            'role' => $data['role'] ?? 'personnel',
            'must_change_password' => true,
        ]);

        AuditService::log('compte.cree', $user, null, ['email' => $user->email, 'role' => $user->role]);

        return (new UserResource($user))->response()->setStatusCode(201);
    }

    public function update(UserUpdateRequest $request, User $user): JsonResponse
    {
        $this->sameStructure($request, $user);
        $data = $request->validated();
        $avant = $user->only(['nom', 'email', 'role']);
        $revoke = false;

        if (isset($data['role']) && $data['role'] !== 'admin' && $user->isAdmin()) {
            $this->assertNotLastAdmin($user);
        }
        if (isset($data['role']) && $data['role'] !== $user->role) {
            $user->role = $data['role'];
            $revoke = true; // capacités du jeton à jour
        }
        if (isset($data['mot_de_passe'])) {
            $user->password = $data['mot_de_passe'];
            $user->must_change_password = true;
            $revoke = true;
        }
        foreach (['nom', 'email'] as $field) {
            if (isset($data[$field])) {
                $user->{$field} = $data[$field];
            }
        }

        $user->save();

        if ($revoke) {
            $user->tokens()->delete();
        }

        AuditService::log('compte.modifie', $user, $avant, $user->only(['nom', 'email', 'role']));

        return response()->json((new UserResource($user))->resolve());
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        $this->sameStructure($request, $user);

        if ($user->isAdmin()) {
            $this->assertNotLastAdmin($user);
        }

        $user->tokens()->delete();
        $user->delete(); // suppression logique
        AuditService::log('compte.supprime', $user);

        return response()->json(null, 204);
    }

    private function sameStructure(Request $request, User $user): void
    {
        abort_unless($user->structure_id === $request->user()->structure_id, 404);
    }

    /** SEC-2.11 : impossible de supprimer ou rétrograder le dernier administrateur. */
    private function assertNotLastAdmin(User $user): void
    {
        $others = User::query()->where('role', 'admin')->whereKeyNot($user->getKey())->exists();

        if (! $others) {
            throw new BusinessRuleException("Impossible : c'est le dernier administrateur.", 'DERNIER_ADMIN');
        }
    }
}
