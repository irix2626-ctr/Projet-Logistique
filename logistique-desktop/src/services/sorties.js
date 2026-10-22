import { db, one, withLock } from '../core/db.js';
import { uuid } from '../core/uuid.js';
import { nowIso, PAGE_SIZE } from '../core/format.js';
import { AppError } from '../core/errors.js';
import { dataUrlToBase64 } from '../core/b64.js';
import { requireSession } from '../core/session.js';
import { outboxCreateIfExists } from './outbox.js';
import { documentStatements } from './documents.js';
import { restanteDe } from './stock.js';

const ETATS = ['fonctionnel', 'non_fonctionnel'];
const txt = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());

/**
 * Enregistre une sortie. Le lot est OBLIGATOIRE. PR/SR = structure de l'utilisateur connecté (automatique).
 * Le contrôle « quantité <= reste du lot » est fait DANS l'INSERT (atomique) : impossible de dépasser le stock,
 * même si une synchronisation modifie les données au même moment.
 */
export function createSortie(input, files = []) {
  return withLock(async () => {
    const user = requireSession();
    const q = Number(input.quantite);
    const need = (v, label) => {
      const t = txt(v);
      if (!t) throw new AppError('VALIDATION', `${label} : champ obligatoire.`);
      return t;
    };
    if (!input.lot_id) throw new AppError('VALIDATION', 'Une sortie doit viser un lot précis.');
    if (!Number.isInteger(q) || q < 1) throw new AppError('VALIDATION', 'La quantité doit être un entier au moins égal à 1.');
    if (!ETATS.includes(input.etat_fonctionnement)) throw new AppError('VALIDATION', 'État de fonctionnement invalide.');
    const nom = need(input.nom_beneficiaire, 'Nom du bénéficiaire');
    const usage = need(input.usage, 'Usage');
    const sig = input.signature ? dataUrlToBase64(input.signature) : null;
    if (input.requireSignature && !sig) throw new AppError('VALIDATION', 'La signature du bénéficiaire est requise.');

    const lot = await one('SELECT id, numero_lot FROM lots WHERE id = ? AND deleted_at IS NULL', [input.lot_id]);
    if (!lot) throw new AppError('LOT_INTROUVABLE', 'Lot introuvable ou archivé.');

    const id = uuid();
    const ts = nowIso();
    const payload = {
      id, lot_id: lot.id, quantite: q, nom_beneficiaire: nom, contact_beneficiaire: txt(input.contact_beneficiaire),
      fonction: txt(input.fonction), usage, etat_fonctionnement: input.etat_fonctionnement,
      description: txt(input.description), date_sortie: ts,
    };

    const counts = await db.batch([
      {
        sql: `INSERT INTO sorties (id, lot_id, quantite, nom_beneficiaire, contact_beneficiaire, fonction, pr_sr, usage,
                etat_fonctionnement, description, signature_b64, operateur_id, date_sortie, created_at, updated_at)
              SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
              WHERE (SELECT l.quantite_initiale - COALESCE((SELECT SUM(s.quantite) FROM sorties s WHERE s.lot_id = l.id AND s.deleted_at IS NULL), 0)
                     FROM lots l WHERE l.id = ? AND l.deleted_at IS NULL) >= ?`,
        params: [id, lot.id, q, nom, payload.contact_beneficiaire, payload.fonction, user.structure_nom, usage,
          input.etat_fonctionnement, payload.description, sig, user.id, ts, ts, ts, lot.id, q],
      },
      outboxCreateIfExists('sorties', id, payload, user.id),
      ...(sig
        ? [{ sql: "INSERT OR IGNORE INTO sync_files (id, type) SELECT ?, 'signature' WHERE EXISTS (SELECT 1 FROM sorties WHERE id = ?)", params: [id, id] }]
        : []),
      ...files.flatMap((f) => documentStatements(f, 'sortie', id, user.id)),
    ]);

    if (counts[0] === 0) {
      const reste = await restanteDe(lot.id);
      throw new AppError('STOCK_INSUFFISANT', `Stock insuffisant : il reste ${reste} sur le lot ${lot.numero_lot}.`, { reste });
    }
    return { id, numero_lot: lot.numero_lot };
  });
}

const like = (v) => `%${String(v).trim()}%`;

const FROM = `FROM sorties s
  JOIN lots l ON l.id = s.lot_id
  JOIN materiels m ON m.id = l.materiel_id
  LEFT JOIN categories c ON c.id = m.categorie_id
  LEFT JOIN users u ON u.id = s.operateur_id`;

/** Registre des sorties (lecture seule), du plus récent au plus ancien. */
export async function listSorties({ q = '', dateFrom = '', dateTo = '', page = 1, limit = PAGE_SIZE } = {}) {
  const where = ['s.deleted_at IS NULL'];
  const params = [];
  if (q.trim()) {
    where.push(`(l.numero_lot LIKE ? OR m.designation LIKE ? OR l.no_serie_chassis LIKE ? OR s.nom_beneficiaire LIKE ?
      OR s.contact_beneficiaire LIKE ? OR s.fonction LIKE ? OR s.pr_sr LIKE ? OR u.nom LIKE ? OR s.usage LIKE ?)`);
    params.push(...Array(9).fill(like(q)));
  }
  if (dateFrom) { where.push('s.date_sortie >= ?'); params.push(`${dateFrom}T00:00:00.000Z`); }
  if (dateTo) { where.push('s.date_sortie <= ?'); params.push(`${dateTo}T23:59:59.999Z`); }
  const w = `WHERE ${where.join(' AND ')}`;
  const total = Number((await one(`SELECT COUNT(*) AS n ${FROM} ${w}`, params)).n);
  const rows = await db.select(
    `SELECT s.*, l.numero_lot, l.no_serie_chassis, m.designation, m.marque_modele, c.nom AS categorie,
            COALESCE(u.nom, '') AS operateur_nom,
            CASE WHEN s.signature_b64 IS NOT NULL OR s.signature_path IS NOT NULL THEN 1 ELSE 0 END AS signee
     ${FROM} ${w} ORDER BY s.date_sortie DESC, s.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]
  );
  return { rows, total };
}

/** Toutes les données du Bon de Sortie : fiche technique, lot, PR/SR, bénéficiaire, opérateur, signature. */
export async function getBon(sortieId) {
  const s = await one(
    `SELECT s.*, l.numero_lot, l.no_serie_chassis, l.code_bailleur_immatriculation, l.structure_service,
            l.etat_fonctionnement AS etat_lot, m.designation, m.marque_modele, c.nom AS categorie,
            COALESCE(u.nom, '') AS operateur_nom
     ${FROM} WHERE s.id = ?`,
    [sortieId]
  );
  if (!s) throw new AppError('SORTIE_INTROUVABLE', 'Sortie introuvable.');
  return s;
}
