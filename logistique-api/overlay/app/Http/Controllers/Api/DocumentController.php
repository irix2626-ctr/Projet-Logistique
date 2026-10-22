<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\DocumentStoreRequest;
use App\Models\Document;
use App\Services\FileService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;

class DocumentController extends Controller
{
    private const FIELDS = ['id', 'rattache_type', 'rattache_id', 'nom', 'mime'];

    public function __construct(private FileService $files)
    {
    }

    public function store(DocumentStoreRequest $request): JsonResponse
    {
        $data = $request->validated();

        $existing = Document::withTrashed()->find($data['id']);
        if ($existing) {
            return response()->json($existing->only(self::FIELDS));
        }

        $upload = $request->file('fichier');
        $stored = $this->files->storeDocument($upload);

        // Le nom d'origine est nettoyé ; le fichier sur disque porte un nom aléatoire (SEC-7.3).
        $nom = preg_replace('/[^\w.\- ]+/u', '_', basename($upload->getClientOriginalName()));

        $document = Document::create([
            'id' => $data['id'],
            'rattache_type' => $data['rattache_type'],
            'rattache_id' => $data['rattache_id'],
            'nom' => mb_substr($nom, 0, 255),
            'chemin' => $stored['chemin'],
            'mime' => $stored['mime'],
            'taille' => $stored['taille'],
            'sha256' => $stored['sha256'],
            'operateur_id' => $request->user()->getKey(),
        ]);

        return response()->json($document->only(self::FIELDS), 201);
    }

    public function show(Document $document)
    {
        abort_unless($document->chemin && Storage::disk('local')->exists($document->chemin), 404);

        return Storage::disk('local')->download($document->chemin, $document->nom, [
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
