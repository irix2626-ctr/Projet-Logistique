<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Controller;
use App\Http\Requests\SyncPushRequest;
use App\Models\Device;
use App\Models\Document;
use App\Models\Sortie;
use App\Services\FileService;
use App\Services\SyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SyncController extends Controller
{
    public function push(SyncPushRequest $request, SyncService $sync): JsonResponse
    {
        $device = $this->device($request->input('device_id'));
        $results = $sync->push($device, $request->user(), $request->validated('operations'));

        return response()->json(['results' => $results]);
    }

    public function pull(Request $request, SyncService $sync): JsonResponse
    {
        $data = $request->validate([
            'cursor' => ['required', 'integer', 'min:0'],
            'device_id' => ['required', 'uuid', 'exists:devices,id'],
        ]);

        return response()->json($sync->pull($this->device($data['device_id']), (int) $data['cursor']));
    }

    /** Pièces jointes et signatures, envoyées APRÈS les enregistrements (reprise possible en cas de coupure). */
    public function fichiers(Request $request, FileService $files): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'in:document,signature'],
            'rattache_id' => ['required', 'uuid'],
            'fichier' => ['required', 'file', 'max:'.config('logistique.upload_max_kb')],
            'sha256' => ['nullable', 'string', 'size:64'],
        ]);

        $upload = $request->file('fichier');

        if (! empty($data['sha256']) && ! hash_equals(strtolower($data['sha256']), hash_file('sha256', $upload->getRealPath()))) {
            throw new BusinessRuleException('Empreinte du fichier différente : transfert corrompu.', 'INTEGRITE_FICHIER', 422);
        }

        if ($data['type'] === 'signature') {
            $sortie = Sortie::withTrashed()->findOrFail($data['rattache_id']);
            $path = $files->storeSignatureBinary(file_get_contents($upload->getRealPath()), $sortie->getKey());
            $sortie->forceFill(['signature_path' => $path])->save();

            return response()->json(['chemin' => $path]);
        }

        $document = Document::withTrashed()->findOrFail($data['rattache_id']);
        $stored = $files->storeDocument($upload);
        $document->forceFill($stored)->save();

        return response()->json(['chemin' => $stored['chemin']]);
    }

    private function device(string $id): Device
    {
        $device = Device::findOrFail($id);

        if ($device->isRevoked()) {
            throw new BusinessRuleException('Ce poste a été révoqué.', 'POSTE_REVOQUE', 403);
        }

        return $device;
    }
}
