<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class DashboardService
{
    public function __construct(private StockService $stock, private TraceService $trace)
    {
    }

    public function summary(): array
    {
        $from = StockService::STOCK_FROM;

        // Cartes par catégorie : quantité totale en stock et nombre d'articles (matériels distincts).
        $rows = DB::select(
            'select c.id as id, c.nom as nom, c.icone as icone, c.couleur_fond as couleur_fond,
                    sum(l.quantite_initiale - coalesce(s.tot, 0)) as quantite_totale,
                    count(distinct l.materiel_id) as nombre_articles '
            .$from.' group by c.id, c.nom, c.icone, c.couleur_fond order by c.nom'
        );

        $etats = DB::select(
            'select l.etat_fonctionnement as etat, sum(l.quantite_initiale - coalesce(s.tot, 0)) as q '
            .$from.' group by l.etat_fonctionnement'
        );
        $machines = ['fonctionnel' => 0, 'non_fonctionnel' => 0];
        foreach ($etats as $e) {
            $machines[$e->etat] = (int) $e->q;
        }

        return [
            'valeur_totale_stock' => $this->stock->valeurTotale(),
            'categories' => array_map(fn ($r) => [
                'categorie' => ['id' => $r->id, 'nom' => $r->nom, 'icone' => $r->icone, 'couleur_fond' => $r->couleur_fond],
                'quantite_totale' => (int) $r->quantite_totale,
                'nombre_articles' => (int) $r->nombre_articles,
            ], $rows),
            'etat_machines' => $machines,
            'derniers_mouvements' => $this->trace->latest(100),
        ];
    }
}
