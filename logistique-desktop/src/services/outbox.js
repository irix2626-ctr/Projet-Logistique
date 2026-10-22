import { db } from '../core/db.js';
import { uuid } from '../core/uuid.js';
import { nowIso } from '../core/format.js';

const INSERT_OP =
  'INSERT INTO sync_outbox (op_id, table_name, record_id, operation, payload, base_version, operateur_id, client_ts)';

const TABLES = new Set(['categories', 'materiels', 'lots', 'sorties', 'documents']);

/**
 * Instructions SQL qui enregistrent une opération dans la file d'envoi. Elles doivent être exécutées
 * dans le MÊME batch (transaction) que la donnée métier : jamais de donnée sans opération, ni l'inverse.
 * Les opérations en attente sur un même enregistrement sont fusionnées :
 *  - update après create en attente  -> un seul create (le créateur reste l'auteur) ;
 *  - delete d'un enregistrement jamais envoyé -> rien à envoyer.
 */
export async function outboxStatements(table, recordId, operation, payload, { operateurId, baseVersion = null } = {}) {
  if (!TABLES.has(table)) throw new Error(`Table non synchronisable : ${table}`);
  const ts = nowIso();
  const pending = await db.select(
    `SELECT seq, operation, payload, base_version, operateur_id FROM sync_outbox
     WHERE table_name = ? AND record_id = ? AND statut = 'pending' ORDER BY seq`,
    [table, recordId]
  );
  const create = pending.find((p) => p.operation === 'create');
  const update = pending.find((p) => p.operation === 'update');
  const insert = (op, data) => ({
    sql: `${INSERT_OP} VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [uuid(), table, recordId, op, JSON.stringify({ ...data, operateur_id: operateurId }), baseVersion, operateurId, ts],
  });

  if (operation === 'create') return [insert('create', payload)];

  if (operation === 'update') {
    if (create) {
      const merged = { ...JSON.parse(create.payload), ...payload, operateur_id: create.operateur_id };
      return [{ sql: 'UPDATE sync_outbox SET payload = ?, client_ts = ? WHERE seq = ?', params: [JSON.stringify(merged), ts, create.seq] }];
    }
    if (update) {
      const merged = { ...JSON.parse(update.payload), ...payload, operateur_id: operateurId };
      return [{ sql: 'UPDATE sync_outbox SET payload = ?, client_ts = ?, operateur_id = ? WHERE seq = ?', params: [JSON.stringify(merged), ts, operateurId, update.seq] }];
    }
    return [insert('update', payload)];
  }

  // delete
  const clear = { sql: "DELETE FROM sync_outbox WHERE table_name = ? AND record_id = ? AND statut = 'pending'", params: [table, recordId] };
  if (create) return [clear]; // jamais envoyé : on annule tout
  return [clear, insert('delete', {})];
}

/** Création conditionnée à l'existence de la ligne métier (utilisée avec les INSERT gardés). */
export function outboxCreateIfExists(table, recordId, payload, operateurId) {
  if (!TABLES.has(table)) throw new Error(`Table non synchronisable : ${table}`);
  return {
    sql: `${INSERT_OP} SELECT ?, ?, ?, 'create', ?, NULL, ?, ? WHERE EXISTS (SELECT 1 FROM ${table} WHERE id = ?)`,
    params: [uuid(), table, recordId, JSON.stringify({ ...payload, operateur_id: operateurId }), operateurId, nowIso(), recordId],
  };
}

export async function pendingCount() {
  const r = await db.select("SELECT COUNT(*) AS n FROM sync_outbox WHERE statut = 'pending'");
  return Number(r[0].n);
}
