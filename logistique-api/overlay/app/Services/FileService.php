<?php

namespace App\Services;

use App\Exceptions\BusinessRuleException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/** Stockage des fichiers (SEC-7) : types vérifiés sur le contenu, noms aléatoires, disque privé. */
class FileService
{
    private const MIMES = [
        'application/pdf' => 'pdf',
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
    ];

    public function storeDocument(UploadedFile $file): array
    {
        $mime = $file->getMimeType(); // détecté sur le contenu, pas sur l'extension
        $ext = self::MIMES[$mime] ?? null;

        if ($ext === null) {
            throw new BusinessRuleException('Type de fichier non autorisé (PDF, JPG ou PNG).', 'FICHIER_TYPE_INTERDIT', 422);
        }
        if ($file->getSize() > config('logistique.upload_max_kb') * 1024) {
            throw new BusinessRuleException('Fichier trop volumineux.', 'FICHIER_TROP_GRAND', 422);
        }

        $path = $file->storeAs('documents', Str::uuid()->toString().'.'.$ext, 'local');

        return [
            'chemin' => $path,
            'mime' => $mime,
            'taille' => $file->getSize(),
            'sha256' => hash_file('sha256', $file->getRealPath()),
        ];
    }

    /** Signature : uniquement du PNG valide, dimensions bornées (SEC-7.6). */
    public function storeSignatureBinary(string $raw, string $sortieId): string
    {
        if (strlen($raw) > 2_000_000) {
            throw new BusinessRuleException('Signature trop volumineuse.', 'SIGNATURE_INVALIDE', 422);
        }

        $info = @getimagesizefromstring($raw);
        if (! $info || $info[2] !== IMAGETYPE_PNG || $info[0] > 2000 || $info[1] > 1000) {
            throw new BusinessRuleException('La signature doit être une image PNG valide.', 'SIGNATURE_INVALIDE', 422);
        }

        $path = 'signatures/'.$sortieId.'.png';
        Storage::disk('local')->put($path, $raw);

        return $path;
    }

    public function storeSignatureBase64(string $base64, string $sortieId): string
    {
        $clean = preg_replace('#^data:image/png;base64,#', '', $base64);
        $raw = base64_decode((string) $clean, true);

        if ($raw === false) {
            throw new BusinessRuleException('Signature illisible.', 'SIGNATURE_INVALIDE', 422);
        }

        return $this->storeSignatureBinary($raw, $sortieId);
    }
}
