<?php

namespace App\Services;

use App\Models\Lot;
use App\Models\Sortie;
use Illuminate\Support\Facades\DB;

/**
 * Règles de stock. `quantite_restante` = quantite_initiale - somme des sorties du lot.
 * Valeur d'un lot = cout_total x restante / initiale (calculée, arrondie au centime, jamais stockée).
 */
class StockService
{
    /** Expression SQL de la quantité restante d'un lot (table `lots` non aliasée). */
    public const RESTANTE_SQL = 'lots.quantite_initiale - COALESCE((select sum(s.quantite) from sorties s where s.lot_id = lots.id and s.deleted_at is null), 0)';

    /** FROM/WHERE SQL des lots en stock (alias l, m, c, s) : base des agrégats du Dashboard et de l'archivage. */
    public const STOCK_FROM = 'from lots l
        join materiels m on m.id = l.materiel_id
        join categories c on c.id = m.categorie_id
        left join (select lot_id, sum(quantite) as tot from sorties where deleted_at is null group by lot_id) s on s.lot_id = l.id
        where l.deleted_at is null and l.quantite_initiale - coalesce(s.tot, 0) > 0';

    public const VALEUR_SQL = 'round(l.cout_total * (l.quantite_initiale - coalesce(s.tot, 0)) / l.quantite_initiale, 2)';

    public function totalSorti(Lot $lot, bool $includeTrashed = false): int
    {
        $query = Sortie::query()->where('lot_id', $lot->getKey());
        if ($includeTrashed) {
            $query->withTrashed();
        }

        return (int) $query->sum('quantite');
    }

    public function restante(Lot $lot): int
    {
        return $lot->quantite_initiale - $this->totalSorti($lot, $lot->trashed());
    }

    /** Lot disponible le plus ancien pour un matériel (FIFO). */
    public function suggestion(string $materielId): ?Lot
    {
        return Lot::query()
            ->where('materiel_id', $materielId)
            ->whereRaw(self::RESTANTE_SQL.' > 0')
            ->orderBy('date_entree')
            ->orderBy('id')
            ->first();
    }

    /** Valeur totale du stock : seule source de vérité des totaux (SQL). */
    public function valeurTotale(): float
    {
        $row = DB::selectOne('select coalesce(sum('.self::VALEUR_SQL.'), 0) as v '.self::STOCK_FROM);

        return round((float) $row->v, 2);
    }
}
