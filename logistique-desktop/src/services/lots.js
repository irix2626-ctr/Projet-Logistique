import { db, one, getKv, withLock } from '../core/db.js';
import { uuid } from '../core/uuid.js';
import { nowIso, PAGE_SIZE } from '../core/format.js';
import { AppError } from '../core/errors.js';
import { requireSession } from '../core/session.js';
import { findOrCreateMateriel } from './catalog.js';
import { outboxStatements } from './outbox.js';
import { documentStatements } from './documents.js';
import { RESTANTE } from './stock.js';

const ETATS = ['fonctionnel', 'non_fonctionnel'];

const FICHE = [
  'fournisseur', 'description', 'usage', 'etat_fonctionnement', 'no_serie_chassis',
  'code_bailleur_immatriculation', 'structure_service', 'observations', 'quantite_initiale', 'cout_total',
];

const txt = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());

/** Validation et normalisation de la saisie d'un lot (mêmes règles que l'API). */
export function normalizeLot(input) {
  const need = (v, label) => {
    const t = txt(v);
    if (!t) throw new AppError('VALIDATION', `${label} : champ obligatoire.`);
    return t;
  };
  const qte = Number(input.quantite_initiale);
  const cout = Number(input.cout_total);
  if (!Number.isInteger(qte) || qte < 1) throw new AppError('VALIDATION', 'La quantité doit être un entier au moins égal à 1.');
  if (!Number.isFinite(cout) || cout < 0) throw new AppError('VALIDATION', 'Le coût total doit être un nombre positif ou nul.');
  if (!ETATS.includes(input.etat_fonctionnement)) throw new AppError('VALIDATION', "État de fonctionnement invalide.");
  return {
    designation: need(input.designation, 'Désignation'),
    categorie_id: need(input.categorie_id, 'Catégorie'),
    marque_modele: txt(input.marque_modele),
    fournisseur: need(input.fournisseur, 'Fournisseur'),
    description: txt(input.description),
    usage: need(input.usage, 'Usage prévu'),
    etat_fonctionnement: input.etat_fonctionnement,
    no_serie_chassis: txt(input.no_serie_chassis),
    code_bailleur_immatriculation: txt(input.code_bailleur_immatriculation),
    structure_service: txt(input.structure_service),
    observations: txt(input.observations),
    quantite_initiale: qte,
    cout_total: cout,
  };
}

/** LOT-AAAA-Pxx-00001 : le code du poste rend le numéro unique même sans réseau (décision D1). */
async function nextLotNumber(date) {
  const code = await getKv('device_code');
  if (!code) {
    throw new AppError('POSTE_NON_ENREGISTRE', "Ce poste n'est pas encore enregistré : connectez-vous une première fois au serveur.");
  }
  const annee = date.getUTCFullYear();
  const row = await one('SELECT dernier FROM lot_counters WHERE annee = ?', [annee]);
  const n = (row ? Number(row.dernier) : 0) + 1;
  return {
    annee,
    n,
    numero: `LOT-${annee}-${code}-${String(n).padStart(5, '0')}`,
  };
}

/**
 * Enregistre une entrée : crée le lot, immédiatement disponible au stock.
 * Tout est écrit dans UNE transaction : matériel éventuel, compteur, lot, pièces jointes, file d'envoi.
 */
export function createLot(input, files = []) {
  return withLock(async () => {
    const user = requireSession();
    const d = normalizeLot(input);
    const { materielId, statements: matStatements } = await findOrCreateMateriel({
      designation: d.designation, categorieId: d.categorie_id, marque: d.marque_modele,
    });

    const now = new Date();
    const ts = now.toISOString();
    const { annee, n, numero } = await nextLotNumber(now);
    const id = uuid();

    const payload = {
      id, numero_lot: numero, materiel_id: materielId,
      fournisseur: d.fournisseur, description: d.description, usage: d.usage,
      etat_fonctionnement: d.etat_fonctionnement, no_serie_chassis: d.no_serie_chassis,
      code_bailleur_immatriculation: d.code_bailleur_immatriculation, structure_service: d.structure_service,
      observations: d.observations, quantite_initiale: d.quantite_initiale, cout_total: d.cout_total,
      date_entree: ts,
    };

    const statements = [
      ...matStatements,
      { sql: 'INSERT INTO lot_counters (annee, dernier) VALUES (?, ?) ON CONFLICT(annee) DO UPDATE SET dernier = excluded.dernier', params: [annee, n] },
      {
        sql: `INSERT INTO lots (id, numero_lot, materiel_id, structure_id, fournisseur, description, usage, etat_fonctionnement,
                no_serie_chassis, code_bailleur_immatriculation, structure_service, observations, quantite_initiale, cout_total,
                operateur_id, date_entree, est_stock_initial, version, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
        params: [
          id, numero, materielId, user.structure_id, d.fournisseur, d.description, d.usage, d.etat_fonctionnement,
          d.no_serie_chassis, d.code_bailleur_immatriculation, d.structure_service, d.observations,
          d.quantite_initiale, d.cout_total, user.id, ts, ts, ts,
        ],
      },
      ...(await outboxStatements('lots', id, 'create', payload, { operateurId: user.id })),
      ...files.flatMap((f) => documentStatements(f, 'lot', id, user.id)),
    ];
    await db.batch(statements);
    return { id, numero_lot: numero };
  });
}

/** Correction de saisie (Stockage > Modifier). La quantité initiale ne passe jamais sous le total sorti. */
export function updateLot(id, input) {
  return withLock(async () => {
    const user = requireSession();
    const lot = await one('SELECT * FROM lots WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!lot) throw new AppError('LOT_INTROUVABLE', 'Lot introuvable.');
    const d = normalizeLot(input);

    const sorti = Number((await one('SELECT COALESCE(SUM(quantite), 0) AS t FROM sorties WHERE lot_id = ? AND deleted_at IS NULL', [id])).t);
    if (d.quantite_initiale < sorti) {
      throw new AppError('QUANTITE_SOUS_SORTIES', `La quantité initiale ne peut pas être inférieure à la quantité déjà sortie (${sorti}).`);
    }

    const { materielId, statements: matStatements } = await findOrCreateMateriel({
      designation: d.designation, categorieId: d.categorie_id, marque: d.marque_modele,
    });
    const ts = nowIso();
    const payload = { materiel_id: materielId, ...Object.fromEntries(FICHE.map((k) => [k, d[k]])) };

    await db.batch([
      ...matStatements,
      {
        sql: `UPDATE lots SET materiel_id = ?, fournisseur = ?, description = ?, usage = ?, etat_fonctionnement = ?,
                no_serie_chassis = ?, code_bailleur_immatriculation = ?, structure_service = ?, observations = ?,
                quantite_initiale = ?, cout_total = ?, updated_at = ? WHERE id = ?`,
        params: [materielId, d.fournisseur, d.description, d.usage, d.etat_fonctionnement, d.no_serie_chassis,
          d.code_bailleur_immatriculation, d.structure_service, d.observations, d.quantite_initiale, d.cout_total, ts, id],
      },
      ...(await outboxStatements('lots', id, 'update', payload, { operateurId: user.id, baseVersion: lot.version })),
    ]);
  });
}

/** Suppression logique, refusée si le lot a déjà des sorties. */
export function deleteLot(id) {
  return withLock(async () => {
    const user = requireSession();
    const lot = await one('SELECT id FROM lots WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!lot) throw new AppError('LOT_INTROUVABLE', 'Lot introuvable.');
    if (await one('SELECT 1 AS x FROM sorties WHERE lot_id = ? AND deleted_at IS NULL LIMIT 1', [id])) {
      throw new AppError('LOT_AVEC_SORTIES', 'Ce lot a déjà des sorties : suppression impossible.');
    }
    const ts = nowIso();
    await db.batch([
      { sql: 'UPDATE lots SET deleted_at = ?, updated_at = ? WHERE id = ?', params: [ts, ts, id] },
      ...(await outboxStatements('lots', id, 'delete', {}, { operateurId: user.id })),
    ]);
  });
}

const like = (v) => `%${String(v).trim()}%`;

/** Registre des entrées (lots), du plus récent au plus ancien. */
export async function listEntrees({ q = '', categorieId = '', dateFrom = '', dateTo = '', page = 1, limit = PAGE_SIZE } = {}) {
  const where = ['l.deleted_at IS NULL'];
  const params = [];
  if (q.trim()) {
    where.push(`(l.numero_lot LIKE ? OR m.designation LIKE ? OR m.marque_modele LIKE ? OR c.nom LIKE ? OR l.no_serie_chassis LIKE ?
      OR l.fournisseur LIKE ? OR u.nom LIKE ? OR l.usage LIKE ?)`);
    params.push(...Array(8).fill(like(q)));
  }
  if (categorieId) { where.push('c.id = ?'); params.push(categorieId); }
  if (dateFrom) { where.push('l.date_entree >= ?'); params.push(`${dateFrom}T00:00:00.000Z`); }
  if (dateTo) { where.push('l.date_entree <= ?'); params.push(`${dateTo}T23:59:59.999Z`); }
  const from = `FROM lots l JOIN materiels m ON m.id = l.materiel_id LEFT JOIN categories c ON c.id = m.categorie_id
                LEFT JOIN users u ON u.id = l.operateur_id WHERE ${where.join(' AND ')}`;
  const total = Number((await one(`SELECT COUNT(*) AS n ${from}`, params)).n);
  const rows = await db.select(
    `SELECT l.*, m.designation, m.marque_modele, c.nom AS categorie, COALESCE(u.nom, '') AS operateur_nom,
            ${RESTANTE} AS restante
     ${from} ORDER BY l.date_entree DESC, l.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]
  );
  return { rows, total };
}
