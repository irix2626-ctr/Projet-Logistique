import { db, one } from '../core/db.js';
import { PAGE_SIZE } from '../core/format.js';
import { RESTANTE, VALEUR } from './stock.js';

/** Journal unifié entrées (lots) + sorties : une seule liste triée par date décroissante. */
const UNION = `
  SELECT l.id AS id, 'entree' AS type, l.date_entree AS date, l.numero_lot AS numero_lot, m.designation AS designation,
         COALESCE(c.nom, '') AS categorie, c.id AS categorie_id, l.quantite_initiale AS quantite,
         NULL AS pr_sr, NULL AS beneficiaire, COALESCE(u.nom, '') AS operateur, l.operateur_id AS operateur_id,
         l.no_serie_chassis AS serie
  FROM lots l JOIN materiels m ON m.id = l.materiel_id
       LEFT JOIN categories c ON c.id = m.categorie_id LEFT JOIN users u ON u.id = l.operateur_id
  WHERE l.deleted_at IS NULL
  UNION ALL
  SELECT s.id, 'sortie', s.date_sortie, l.numero_lot, m.designation,
         COALESCE(c.nom, ''), c.id, s.quantite, s.pr_sr, s.nom_beneficiaire, COALESCE(u.nom, ''), s.operateur_id,
         l.no_serie_chassis
  FROM sorties s JOIN lots l ON l.id = s.lot_id JOIN materiels m ON m.id = l.materiel_id
       LEFT JOIN categories c ON c.id = m.categorie_id LEFT JOIN users u ON u.id = s.operateur_id
  WHERE s.deleted_at IS NULL`;

const like = (v) => `%${String(v).trim()}%`;

function filters({ q = '', type = '', categorieId = '', dateFrom = '', dateTo = '' }) {
  const where = [];
  const params = [];
  if (type) { where.push('type = ?'); params.push(type); }
  if (categorieId) { where.push('categorie_id = ?'); params.push(categorieId); }
  if (dateFrom) { where.push('date >= ?'); params.push(`${dateFrom}T00:00:00.000Z`); }
  if (dateTo) { where.push('date <= ?'); params.push(`${dateTo}T23:59:59.999Z`); }
  if (q.trim()) {
    where.push(`(numero_lot LIKE ? OR designation LIKE ? OR categorie LIKE ? OR serie LIKE ? OR pr_sr LIKE ? OR beneficiaire LIKE ? OR operateur LIKE ?)`);
    params.push(...Array(7).fill(like(q)));
  }
  return { w: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

export async function journal(f = {}, { page = 1, limit = PAGE_SIZE } = {}) {
  const { w, params } = filters(f);
  const total = Number((await one(`SELECT COUNT(*) AS n FROM (${UNION}) t ${w}`, params)).n);
  const rows = await db.select(
    `SELECT * FROM (${UNION}) t ${w} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]
  );
  return { rows, total };
}

/** Export : tout le journal filtré (sans pagination). */
export async function journalComplet(f = {}) {
  const { w, params } = filters(f);
  return db.select(`SELECT * FROM (${UNION}) t ${w} ORDER BY date DESC, id DESC`, params);
}

export const derniersMouvements = async (n = 100) =>
  (await journal({}, { page: 1, limit: n })).rows;

/** Cycle de vie d'un lot : arrivage -> sorties successives -> reste. */
export async function cycleLot(lotId) {
  const lot = await one(
    `SELECT l.*, m.designation, m.marque_modele, c.nom AS categorie, COALESCE(u.nom, '') AS operateur_nom,
            ${RESTANTE} AS restante, ${VALEUR} AS valeur
     FROM lots l JOIN materiels m ON m.id = l.materiel_id LEFT JOIN categories c ON c.id = m.categorie_id
          LEFT JOIN users u ON u.id = l.operateur_id
     WHERE l.id = ?`,
    [lotId]
  );
  if (!lot) return null;
  const sorties = await db.select(
    `SELECT s.*, COALESCE(u.nom, '') AS operateur_nom FROM sorties s LEFT JOIN users u ON u.id = s.operateur_id
     WHERE s.lot_id = ? AND s.deleted_at IS NULL ORDER BY s.date_sortie ASC`,
    [lotId]
  );
  const total = sorties.reduce((a, s) => a + Number(s.quantite), 0);
  return { lot, sorties, total_sorti: total, reste: lot.quantite_initiale - total };
}
