<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * Manifeste Tauri Updater. Le serveur lit storage/app/updates/latest.json :
 * { "version": "0.2.0", "notes": "...", "pub_date": "...",
 *   "platforms": { "windows-x86_64": { "url": "https://...", "signature": "contenu du .sig" } } }
 * Réponse 204 si le client est déjà à jour. La signature est vérifiée par le client avec la clé publique.
 */
class UpdateController extends Controller
{
    public function __invoke(string $target, string $arch, string $version): JsonResponse|Response
    {
        $file = storage_path('app/updates/latest.json');

        if (! is_file($file)) {
            return response()->noContent();
        }

        $manifest = json_decode((string) file_get_contents($file), true);
        $platform = $manifest['platforms']["{$target}-{$arch}"] ?? null;

        if (! is_array($manifest) || ! $platform || version_compare($manifest['version'] ?? '0.0.0', $version, '<=')) {
            return response()->noContent();
        }

        return response()->json([
            'version' => $manifest['version'],
            'notes' => $manifest['notes'] ?? '',
            'pub_date' => $manifest['pub_date'] ?? null,
            'url' => $platform['url'],
            'signature' => $platform['signature'],
        ]);
    }
}
