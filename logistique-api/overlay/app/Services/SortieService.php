<?php

namespace App\Services;

use App\Exceptions\BusinessRuleException;
use App\Models\Lot;
use App\Models\Sortie;
use App\Models\SyncConflict;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class SortieService
{
    public function __construct(private StockService $stock, private FileService $files)
    {
    }

    /**
     * Enregistre une sortie, sous verrou de ligne sur le lot (SEC-4.14).
     * - En ligne : un dépassement du reste est refusé (409 STOCK_INSUFFISANT).
     * - Via la synchro ($fromSync) : la sortie a réellement eu lieu, elle est ACCEPTÉE et le
     *   dépassement devient un conflit signalé à l'admin (jamais rejeté en silence).
     * `pr_sr` et `operateur_id` sont imposés par le serveur.
     *
     * @return array{0: Sortie, 1: bool, 2: ?string} [sortie, créée ?, id du conflit éventuel]
     */
    public function create(array $data, User $operator, bool $fromSync = false, ?Carbon $date = null): array
    {
        return DB::transaction(function () use ($data, $operator, $fromSync, $date) {
            $existing = Sortie::withTrashed()->find($data['id']);
            if ($existing) {
                return [$existing, false, null];
            }

            $query = Lot::query();
            if ($fromSync) {
                $query->withTrashed();
            }
            $lot = $query->lockForUpdate()->find($data['lot_id']);

            if (! $lot) {
                throw new BusinessRuleException('Lot introuvable ou archivé.', 'LOT_INTROUVABLE', 422);
            }

            $restante = $this->stock->restante($lot);
            $depassement = $data['quantite'] > $restante;

            if ($depassement && ! $fromSync) {
                throw new BusinessRuleException(
                    "Stock insuffisant : il reste {$restante} sur le lot {$lot->numero_lot}.",
                    'STOCK_INSUFFISANT'
                );
            }

            $signaturePath = null;
            if (! empty($data['signature'])) {
                $signaturePath = $this->files->storeSignatureBase64($data['signature'], $data['id']);
            }

            $sortie = Sortie::create([
                'id' => $data['id'],
                'lot_id' => $lot->getKey(),
                'quantite' => $data['quantite'],
                'nom_beneficiaire' => $data['nom_beneficiaire'],
                'contact_beneficiaire' => $data['contact_beneficiaire'] ?? null,
                'fonction' => $data['fonction'] ?? null,
                'pr_sr' => $operator->structure->nom,
                'usage' => $data['usage'],
                'etat_fonctionnement' => $data['etat_fonctionnement'],
                'description' => $data['description'] ?? null,
                'signature_path' => $signaturePath,
                'operateur_id' => $operator->getKey(),
                'date_sortie' => $date ?? now(),
                'conflit_stock' => $depassement,
            ]);

            $conflictId = null;

            if ($depassement) {
                $apres = $restante - $data['quantite'];
                $conflictId = SyncConflict::create([
                    'type' => 'depassement_stock',
                    'lot_id' => $lot->getKey(),
                    'sortie_id' => $sortie->getKey(),
                    'detail' => "Sortie de {$data['quantite']} sur le lot {$lot->numero_lot} : reste {$restante} avant, {$apres} après.",
                ])->getKey();
            }

            if ($lot->trashed()) {
                $conflictId = SyncConflict::create([
                    'type' => 'lot_archive',
                    'lot_id' => $lot->getKey(),
                    'sortie_id' => $sortie->getKey(),
                    'detail' => "Sortie enregistrée sur le lot archivé {$lot->numero_lot} : à rapprocher du lot de report.",
                ])->getKey();
                $sortie->forceFill(['conflit_stock' => true])->save();
            }

            return [$sortie, true, $conflictId];
        });
    }
}
