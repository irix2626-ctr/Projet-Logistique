<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Controller;
use App\Models\Device;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeviceController extends Controller
{
    /** Enregistre un poste (premier lancement) et lui attribue son code (P01, P02...). Idempotent sur l'id. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'id' => ['required', 'uuid'],
            'nom' => ['required', 'string', 'max:100'],
        ]);

        $device = Device::find($data['id']);

        if ($device && $device->isRevoked()) {
            throw new BusinessRuleException('Ce poste a été révoqué.', 'POSTE_REVOQUE', 403);
        }

        $created = false;
        if (! $device) {
            $device = $this->register($data['id'], $data['nom']);
            $created = true;
        }

        $user = $request->user();
        if (! $device->users()->where('users.id', $user->getKey())->exists()) {
            $device->users()->attach($user->getKey(), ['first_login_at' => now()]);
        }

        return response()->json($this->payload($device), $created ? 201 : 200);
    }

    private function register(string $id, string $nom): Device
    {
        for ($i = 0; $i < 5; $i++) {
            $max = Device::query()->pluck('code_poste')->map(fn ($c) => (int) substr($c, 1))->max() ?? 0;

            try {
                return Device::create(['id' => $id, 'nom' => $nom, 'code_poste' => sprintf('P%02d', $max + 1)]);
            } catch (UniqueConstraintViolationException) {
                continue; // deux postes se sont enregistrés en même temps : on réessaie
            }
        }

        throw new BusinessRuleException("Impossible d'attribuer un code poste.", 'CODE_POSTE', 500);
    }

    private function payload(Device $device): array
    {
        return [
            'id' => $device->id,
            'nom' => $device->nom,
            'code_poste' => $device->code_poste,
            'derniere_synchro' => $device->derniere_synchro?->toIso8601String(),
        ];
    }
}
