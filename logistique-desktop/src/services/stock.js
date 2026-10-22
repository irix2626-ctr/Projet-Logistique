import { db, one } from '../core/db.js';
import { PAGE_SIZE } from '../core/format.js';

/** Quantité restante d'un lot (alias SQL `l`) : initiale - somme des sorties actives. Jamais stockée. */
export const RESTANTE = `(l.quantite_initiale - COALESCE((SELECT SUM(s.quantite) FROM sorties s WHERE s.lot_id = l.id AND s.deleted_at IS NULL), 0))`;
/** Valeur au prorata, arrondie au centime (aucun coût unitaire stocké). */
export const VALEUR = `ROUND(l.cout_total * ${RESTANTE} / l.quantite_initiale, 2)`;

const BASE_FROM = `FROM lots l
  JOIN materiels m ON m.id = l.materiel_id
  LEFT JOIN categories c ON c.id = m.categorie_id`;

const SELECT = `l.*, m.designation, m.marque_modele, c.id AS categorie_id, c.nom AS categorie,
  ${RESTANTE} AS restante, ${VALEUR} AS valeur`;

const like = (v) => `%${String(v).trim()}%`;

/** Lots en stock (restante > 0), du plus ancien au plus récent (FIFO). */
export async function listStock({ q = '', categorieId = '', etat = '', page = 1, limit = PAGE_SIZE } = {}) {
  const where = [`l.deleted_at IS NULL`, `${RESTANTE} > 0`];
  const params = [];
  if (q.trim()) {
    where.push(`(l.numero_lot LIKE ? OR m.designation LIKE ? OR m.marque_modele LIKE ? OR c.nom LIKE ? OR l.no_serie_chassis LIKE ?
      OR l.code_bailleur_immatriculation LIKE ? OR l.fournisseur LIKE ? OR l.usage LIKE ?)`);
    params.push(...Array(8).fill(like(q)));
  }
  if (categorieId) {
    where.push('c.id = ?');
    params.push(categorieId);
  }
  if (etat) {
    where.push('l.etat_fonctionnement = ?');
    params.push(etat);
  }
  const w = `WHERE ${where.join(' AND ')}`;
  const total = Number((await one(`SELECT COUNT(*) AS n ${BASE_FROM} ${w}`, params)).n);
  const rows = await db.select(
    `SELECT ${SELECT} ${BASE_FROM} ${w} ORDER BY l.date_entree ASC, l.id ASC LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]
  );
  return { rows, total };
}

export const getLot = (id) =>
  one(`SELECT ${SELECT} ${BASE_FROM} WHERE l.id = ? AND l.deleted_at IS NULL`, [id]);

export const restanteDe = async (lotId) =>
  Number((await one(`SELECT ${RESTANTE} AS r FROM lots l WHERE l.id = ?`, [lotId]))?.r ?? 0);

/** Lots disponibles d'un matériel, le plus ancien en premier : c'est le lot proposé par défaut (FIFO). */
export const lotsDisponibles = (materielId) =>
  db.select(
    `SELECT ${SELECT} ${BASE_FROM} WHERE l.deleted_at IS NULL AND l.materiel_id = ? AND ${RESTANTE} > 0
     ORDER BY l.date_entree ASC, l.id ASC`,
    [materielId]
  );

export const suggestion = async (materielId) => (await lotsDisponibles(materielId))[0] ?? null;

/** Matériels ayant du stock (choix d'une sortie manuelle). */
export const materielsEnStock = () =>
  db.select(
    `SELECT m.id, m.designation, m.marque_modele, c.nom AS categorie, SUM(${RESTANTE}) AS restante
     ${BASE_FROM} WHERE l.deleted_at IS NULL AND ${RESTANTE} > 0
     GROUP BY m.id, m.designation, m.marque_modele, c.nom ORDER BY m.designation`
  );
