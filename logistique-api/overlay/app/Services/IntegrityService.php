<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/** Contrôle d'intégrité : objectif 0 anomalie (critère n°1 vérifiable, SEC-10.7). */
class IntegrityService
{
    public function check(): array
    {
        $anomalies = [];

        $depassements = DB::select(
            'select l.id, l.numero_lot, l.quantite_initiale, coalesce(s.tot, 0) as tot
             from lots l
             left join (select lot_id, sum(quantite) as tot from sorties where deleted_at is null group by lot_id) s on s.lot_id = l.id
             where l.deleted_at is null and coalesce(s.tot, 0) > l.quantite_initiale'
        );
        foreach ($depassements as $r) {
            $anomalies[] = [
                'type' => 'sorties_superieures_au_lot',
                'lot_id' => $r->id,
                'detail' => "Lot {$r->numero_lot} : {$r->tot} sorti pour {$r->quantite_initiale} reçu.",
            ];
        }

        $orphelines = DB::select(
            'select s.id, s.lot_id from sorties s left join lots l on l.id = s.lot_id
             where s.deleted_at is null and l.id is null'
        );
        foreach ($orphelines as $r) {
            $anomalies[] = ['type' => 'sortie_orpheline', 'lot_id' => $r->lot_id, 'detail' => "Sortie {$r->id} sans lot."];
        }

        $sansOperateur = DB::select(
            'select l.id, l.numero_lot from lots l left join users u on u.id = l.operateur_id
             where l.deleted_at is null and u.id is null'
        );
        foreach ($sansOperateur as $r) {
            $anomalies[] = ['type' => 'lot_sans_operateur', 'lot_id' => $r->id, 'detail' => "Lot {$r->numero_lot} sans opérateur."];
        }

        // Les lots de report créés par le serveur (code poste P00) doivent référencer leur lot d'origine.
        $reports = DB::select(
            "select id, numero_lot from lots
             where deleted_at is null and est_stock_initial = 1 and lot_origine_id is null and numero_lot like 'LOT-%-P00-%'"
        );
        foreach ($reports as $r) {
            $anomalies[] = ['type' => 'lot_report_sans_origine', 'lot_id' => $r->id, 'detail' => "Lot de report {$r->numero_lot} sans origine."];
        }

        return ['anomalies' => $anomalies, 'total' => count($anomalies)];
    }
}
