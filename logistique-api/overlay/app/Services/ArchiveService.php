<?php

namespace App\Services;

use App\Exceptions\BusinessRuleException;
use App\Models\ArchiveBatch;
use App\Models\Document;
use App\Models\Lot;
use App\Models\Sortie;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Archivage (après export) et réinitialisation : même mécanisme, atomique.
 * 1) crée un archive_batch_id ; 2) marque lots, sorties, documents `deleted_at` (rien n'est supprimé
 * physiquement) ; 3) crée les lots de report (est_stock_initial, lot_origine_id, coût au prorata du reste).
 */
class ArchiveService
{
    public function __construct(private StockService $stock)
    {
    }

    public function run(User $admin, string $type): array
    {
        return DB::transaction(function () use ($admin, $type) {
            $avant = $this->stock->valeurTotale();

            // Les lots à reporter sont calculés AVANT l'archivage (reste et valeur au prorata, en SQL).
            $reports = DB::select(
                'select l.id, l.quantite_initiale - coalesce(s.tot, 0) as restante, '.StockService::VALEUR_SQL.' as valeur '
                .StockService::STOCK_FROM
            );

            $batch = ArchiveBatch::create(['type' => $type, 'user_id' => $admin->getKey(), 'stats' => []]);
            $now = now();
            $stats = [];

            foreach (['lots' => Lot::class, 'sorties' => Sortie::class, 'documents' => Document::class] as $table => $class) {
                $stats[$table.'_archives'] = $class::query()
                    ->whereNull('archive_batch_id')
                    ->update(['archive_batch_id' => $batch->getKey(), 'deleted_at' => $now]);

                // Les archivages en masse n'appellent pas les observers : on alimente sync_log directement.
                DB::table('sync_log')->insertUsing(
                    ['table_name', 'record_id', 'operation', 'created_at'],
                    DB::table($table)->where('archive_batch_id', $batch->getKey())
                        ->selectRaw("'{$table}', id, 'deleted', ?", [$now])
                );
            }

            $sequence = $this->lastReportSequence((int) $now->format('Y'));

            foreach ($reports as $r) {
                $origine = Lot::withTrashed()->findOrFail($r->id);
                $sequence++;

                Lot::create([
                    'id' => (string) Str::uuid(),
                    'numero_lot' => sprintf('LOT-%s-P00-%05d', $now->format('Y'), $sequence),
                    'materiel_id' => $origine->materiel_id,
                    'structure_id' => $origine->structure_id,
                    'fournisseur' => $origine->fournisseur,
                    'description' => $origine->description,
                    'usage' => $origine->usage,
                    'etat_fonctionnement' => $origine->etat_fonctionnement,
                    'no_serie_chassis' => $origine->no_serie_chassis,
                    'code_bailleur_immatriculation' => $origine->code_bailleur_immatriculation,
                    'structure_service' => $origine->structure_service,
                    'observations' => $origine->observations,
                    'quantite_initiale' => (int) $r->restante,
                    'cout_total' => round((float) $r->valeur, 2),
                    'operateur_id' => $admin->getKey(),
                    'date_entree' => $now,
                    'est_stock_initial' => true,
                    'lot_origine_id' => $origine->getKey(),
                    'version' => 1,
                ]);
            }

            $apres = $this->stock->valeurTotale();

            // Garde-fou : l'archivage ne doit jamais changer la valeur du stock.
            if (abs($apres - $avant) > 0.009) {
                throw new BusinessRuleException(
                    "Archivage annulé : la valeur du stock aurait changé ({$avant} -> {$apres}).",
                    'ARCHIVE_INCOHERENTE',
                    500
                );
            }

            $stats['lots_reportes'] = count($reports);
            $batch->update(['stats' => $stats + ['valeur_stock' => $avant]]);

            AuditService::log($type === 'export' ? 'archivage' : 'reinitialisation', $batch, null, $stats, $admin);

            return [
                'archive_batch_id' => $batch->getKey(),
                'lots_archives' => $stats['lots_archives'],
                'sorties_archivees' => $stats['sorties_archives'],
                'lots_reportes' => count($reports),
                'valeur_stock_avant' => $avant,
                'valeur_stock_apres' => $apres,
            ];
        });
    }

    /** Dernier numéro de séquence déjà utilisé pour les lots de report (P00) de l'année. */
    private function lastReportSequence(int $year): int
    {
        $last = Lot::withTrashed()
            ->where('numero_lot', 'like', "LOT-{$year}-P00-%")
            ->max('numero_lot');

        return $last ? (int) substr($last, -5) : 0;
    }
}
