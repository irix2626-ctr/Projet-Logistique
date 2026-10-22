import { db, one } from '../core/db.js';
import { derniersMouvements } from './trace.js';
import { RESTANTE, VALEUR } from './stock.js';

const STOCK_FROM = `FROM lots l JOIN materiels m ON m.id = l.materiel_id LEFT JOIN categories c ON c.id = m.categorie_id
  WHERE l.deleted_at IS NULL AND ${RESTANTE} > 0`;

/** Récapitulatif simple : valeur du stock, cartes par catégorie, état des machines, 100 derniers mouvements. */
export async function summary({ categorieId = '', dateFrom = '', dateTo = '' } = {}) {
  const extra = [];
  const params = [];
  if (categorieId) { extra.push('AND c.id = ?'); params.push(categorieId); }
  if (dateFrom) { extra.push('AND l.date_entree >= ?'); params.push(`${dateFrom}T00:00:00.000Z`); }
  if (dateTo) { extra.push('AND l.date_entree <= ?'); params.push(`${dateTo}T23:59:59.999Z`); }
  const from = `${STOCK_FROM} ${extra.join(' ')}`;

  const valeur = await one(`SELECT COALESCE(SUM(${VALEUR}), 0) AS v ${from}`, params);
  const categories = await db.select(
    `SELECT c.id AS id, COALESCE(c.nom, 'Sans catégorie') AS nom, c.icone AS icone, c.couleur_fond AS couleur_fond,
            SUM(${RESTANTE}) AS quantite_totale, COUNT(DISTINCT l.materiel_id) AS nombre_articles,
            SUM(${VALEUR}) AS valeur
     ${from} GROUP BY c.id, c.nom, c.icone, c.couleur_fond ORDER BY c.nom`,
    params
  );
  const etats = await db.select(`SELECT l.etat_fonctionnement AS etat, SUM(${RESTANTE}) AS q ${from} GROUP BY l.etat_fonctionnement`, params);
  const machines = { fonctionnel: 0, non_fonctionnel: 0 };
  for (const e of etats) machines[e.etat] = Number(e.q);

  return {
    valeur_totale_stock: Math.round(Number(valeur.v) * 100) / 100,
    categories: categories.map((c) => ({ ...c, quantite_totale: Number(c.quantite_totale), nombre_articles: Number(c.nombre_articles) })),
    etat_machines: machines,
    derniers_mouvements: await derniersMouvements(100),
  };
}
