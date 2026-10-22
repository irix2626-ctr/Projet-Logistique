import { db, one, getKv, setKv, kvStatement, withLock } from '../core/db.js';
import { uuid } from '../core/uuid.js';
import { nowIso, normDate } from '../core/format.js';
import { base64ToBytes, sha256Hex } from '../core/b64.js';
import { emit } from '../core/events.js';
import { session } from '../core/session.js';
import { api, apiMessage, setDeviceId } from './api.js';

/** État de synchronisation exposé à l'interface. */
export const syncState = { state: 'idle', pending: 0, rejected: 0, conflicts: 0, lastSync: null, error: null };

function setState(patch) {
  Object.assign(syncState, patch);
  emit('sync-status', { ...syncState });
}

export async function refreshCounts() {
  const r = await one(
    `SELECT SUM(CASE WHEN statut = 'pending' THEN 1 ELSE 0 END) AS p, SUM(CASE WHEN statut = 'rejected' THEN 1 ELSE 0 END) AS r FROM sync_outbox`
  );
  setState({
    pending: Number(r?.p ?? 0),
    rejected: Number(r?.r ?? 0),
    conflicts: Number(await getKv('sync_conflicts_unseen', '0')),
    lastSync: await getKv('last_sync_at'),
  });
}

/** Enregistre ce poste (code P01, P02...) : nécessaire pour numéroter les lots hors-ligne. */
export async function ensureDevice() {
  let id = await getKv('device_id');
  if (!id) {
    id = uuid();
    await setKv('device_id', id);
  }
  setDeviceId(id);
  let code = await getKv('device_code');
  if (!code && session.token) {
    const dev = await api.post('/devices', { id, nom: (await getKv('device_name')) || 'Poste' });
    code = dev.code_poste;
    await setKv('device_code', code);
  }
  return { id, code };
}

// ---------------------------------------------------------------- envoi (push)

const OK_STATUS = new Set(['accepted', 'duplicate', 'conflict']);

const toApiOp = (o) => ({
  op_id: o.op_id,
  table: o.table_name,
  record_id: o.record_id,
  operation: o.operation,
  payload: JSON.parse(o.payload),
  base_version: o.base_version,
  client_ts: o.client_ts,
});

async function pushOutbox(deviceId) {
  for (let guard = 0; guard < 1000; guard++) {
    const ops = await db.select("SELECT * FROM sync_outbox WHERE statut = 'pending' ORDER BY seq LIMIT 100");
    if (!ops.length) return;

    const res = await api.post('/sync/push', { device_id: deviceId, operations: ops.map(toApiOp) });
    const byId = new Map(res.results.map((r) => [r.op_id, r]));
    const statements = [];
    let conflicts = 0;

    for (const o of ops) {
      const r = byId.get(o.op_id);
      if (!r) continue;
      if (OK_STATUS.has(r.status)) {
        statements.push({ sql: 'DELETE FROM sync_outbox WHERE seq = ?', params: [o.seq] });
        if (r.status === 'conflict') conflicts++;
      } else {
        statements.push({
          sql: "UPDATE sync_outbox SET statut = 'rejected', essais = essais + 1, derniere_erreur = ? WHERE seq = ?",
          params: [r.message || 'Refusée par le serveur.', o.seq],
        });
      }
    }
    if (!statements.length) return; // aucune progression : on évite la boucle infinie

    if (conflicts) {
      statements.push(kvStatement('sync_conflicts_unseen', Number(await getKv('sync_conflicts_unseen', '0')) + conflicts));
    }
    await withLock(() => db.batch(statements));
  }
}

/** Fichiers (signatures, pièces jointes) : envoyés seulement quand leur enregistrement est parti. */
async function pushFiles() {
  const files = await db.select(
    `SELECT f.id, f.type, f.essais FROM sync_files f
     WHERE f.essais < 5 AND NOT EXISTS (SELECT 1 FROM sync_outbox o WHERE o.record_id = f.id AND o.statut = 'pending')`
  );
  for (const f of files) {
    let b64;
    let mime = 'application/octet-stream';
    let name = f.id;
    if (f.type === 'signature') {
      b64 = (await one('SELECT signature_b64 AS b FROM sorties WHERE id = ?', [f.id]))?.b;
      mime = 'image/png';
      name = `${f.id}.png`;
    } else {
      const d = await one('SELECT content_b64 AS b, mime, nom FROM documents WHERE id = ?', [f.id]);
      b64 = d?.b;
      mime = d?.mime || mime;
      name = d?.nom || name;
    }
    if (!b64) {
      await db.execute('DELETE FROM sync_files WHERE id = ? AND type = ?', [f.id, f.type]);
      continue;
    }
    const bytes = base64ToBytes(b64);
    const form = new FormData();
    form.append('type', f.type);
    form.append('rattache_id', f.id);
    form.append('sha256', await sha256Hex(bytes));
    form.append('fichier', new Blob([bytes], { type: mime }), name);
    try {
      await api.upload('/sync/fichiers', form);
      await db.execute('DELETE FROM sync_files WHERE id = ? AND type = ?', [f.id, f.type]);
    } catch (e) {
      if (e.code === 'RESEAU' || e.status === 401 || e.status === 426) throw e;
      // 404 : l'enregistrement n'est pas (encore) accepté par le serveur ; autre refus : on compte l'essai.
      await db.execute('UPDATE sync_files SET essais = essais + 1 WHERE id = ? AND type = ?', [f.id, f.type]);
    }
  }
}

// ---------------------------------------------------------------- réception (pull)

const COLUMNS = {
  structures: ['id', 'nom', 'created_at', 'updated_at', 'deleted_at'],
  users: ['id', 'structure_id', 'nom', 'email', 'role', 'created_at', 'updated_at', 'deleted_at'],
  categories: ['id', 'nom', 'icone', 'couleur_fond', 'created_at', 'updated_at', 'deleted_at'],
  materiels: ['id', 'designation', 'categorie_id', 'marque_modele', 'created_at', 'updated_at', 'deleted_at'],
  lots: [
    'id', 'numero_lot', 'materiel_id', 'structure_id', 'fournisseur', 'description', 'usage', 'etat_fonctionnement',
    'no_serie_chassis', 'code_bailleur_immatriculation', 'structure_service', 'observations', 'quantite_initiale',
    'cout_total', 'operateur_id', 'date_entree', 'est_stock_initial', 'lot_origine_id', 'archive_batch_id', 'version',
    'created_at', 'updated_at', 'deleted_at',
  ],
  sorties: [
    'id', 'lot_id', 'quantite', 'nom_beneficiaire', 'contact_beneficiaire', 'fonction', 'pr_sr', 'usage',
    'etat_fonctionnement', 'description', 'signature_path', 'operateur_id', 'date_sortie', 'archive_batch_id',
    'conflit_stock', 'created_at', 'updated_at', 'deleted_at',
  ],
  documents: [
    'id', 'rattache_type', 'rattache_id', 'nom', 'mime', 'taille', 'sha256', 'operateur_id', 'archive_batch_id',
    'created_at', 'updated_at', 'deleted_at',
  ],
};
const DATES = new Set(['created_at', 'updated_at', 'deleted_at', 'date_entree', 'date_sortie']);
const NUMBERS = new Set(['cout_total', 'quantite_initiale', 'quantite', 'version', 'taille']);
// Colonnes NOT NULL : une valeur absente du serveur prend sa valeur par défaut (un NULL explicite ignore le DEFAULT SQL).
const DEFAULTS = { est_stock_initial: 0, conflit_stock: 0, version: 1 };

function convert(col, v) {
  if (v === undefined || v === null) return col in DEFAULTS ? DEFAULTS[col] : null;
  if (DATES.has(col)) return normDate(v);
  if (NUMBERS.has(col)) return Number(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

/**
 * Applique un enregistrement reçu. Une modification locale en attente d'envoi (ou refusée, donc à traiter par
 * l'utilisateur) n'est jamais écrasée : le serveur arbitrera à l'envoi, puis le pull ramènera l'état résolu.
 * Les colonnes purement locales (signature_b64, content_b64) ne sont jamais touchées.
 */
export function upsertStatement(table, rec) {
  const cols = COLUMNS[table];
  if (!cols || !rec?.id) return null;
  const updates = cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');
  return {
    sql: `INSERT INTO ${table} (${cols.join(', ')})
          SELECT ${cols.map(() => '?').join(', ')}
          WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE table_name = ? AND record_id = ? AND statut IN ('pending', 'rejected'))
          ON CONFLICT(id) DO UPDATE SET ${updates}`,
    params: [...cols.map((c) => convert(c, rec[c])), table, rec.id],
  };
}

async function pull(deviceId) {
  let cursor = Number(await getKv('sync_cursor', '0'));
  for (let guard = 0; guard < 1000; guard++) {
    const res = await api.get('/sync/pull', { query: { cursor, device_id: deviceId } });
    const statements = res.changes.map((c) => upsertStatement(c.table, c.record)).filter(Boolean);
    statements.push(kvStatement('sync_cursor', res.next_cursor));
    await withLock(() => db.batch(statements)); // curseur et données avancent ensemble
    cursor = res.next_cursor;
    if (!res.has_more) return;
  }
}

// ---------------------------------------------------------------- orchestration

let running = false;

export async function runOnce() {
  if (running || !session.user) return { ...syncState };
  running = true;
  setState({ state: 'running', error: null });
  try {
    if (!session.token) {
      setState({ state: 'auth' });
      return { ...syncState };
    }
    const { id } = await ensureDevice();
    await pushOutbox(id);
    await pushFiles();
    await pull(id);
    await setKv('last_sync_at', nowIso());
    setState({ state: 'idle' });
  } catch (e) {
    if (e.code === 'RESEAU') setState({ state: 'offline' });
    else if (e.status === 401) setState({ state: 'auth' });
    else if (e.status === 426) setState({ state: 'update', error: e.message });
    else if (e.code === 'POSTE_REVOQUE') setState({ state: 'revoked', error: e.message });
    else setState({ state: 'error', error: apiMessage(e) });
  } finally {
    running = false;
    await refreshCounts();
  }
  return { ...syncState };
}

let timer = null;
let debounce = null;

/** Synchro automatique : au démarrage, au retour de la connexion, toutes les minutes. */
export function startAutoSync() {
  stopAutoSync();
  runOnce();
  timer = setInterval(runOnce, 60000);
  if (typeof window !== 'undefined') window.addEventListener('online', runOnce);
}

export function stopAutoSync() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** À appeler après une écriture locale : lance une synchro peu après (regroupe les écritures proches). */
export function requestSync(delayMs = 3000) {
  refreshCounts();
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(runOnce, delayMs);
}

// ---------------------------------------------------------------- opérations refusées

export const listRejected = () =>
  db.select("SELECT seq, table_name, operation, record_id, derniere_erreur, client_ts FROM sync_outbox WHERE statut = 'rejected' ORDER BY seq");

export async function retryRejected() {
  await db.execute("UPDATE sync_outbox SET statut = 'pending' WHERE statut = 'rejected'");
  await refreshCounts();
}

/**
 * Abandonne une opération refusée. Pour une création jamais acceptée par le serveur, la donnée locale est
 * aussi masquée (suppression logique) : elle ne doit pas rester visible alors qu'elle n'existe pas côté serveur.
 */
export async function discardRejected(seq) {
  await withLock(async () => {
    const op = await one("SELECT table_name, record_id, operation FROM sync_outbox WHERE seq = ? AND statut = 'rejected'", [seq]);
    if (!op) return;
    const statements = [{ sql: 'DELETE FROM sync_outbox WHERE seq = ?', params: [seq] }];
    if (op.operation === 'create' && COLUMNS[op.table_name]) {
      const ts = nowIso();
      statements.unshift({
        sql: `UPDATE ${op.table_name} SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
        params: [ts, ts, op.record_id],
      });
    }
    await db.batch(statements);
  });
  await refreshCounts();
}

export async function markConflictsSeen() {
  await setKv('sync_conflicts_unseen', 0);
  await refreshCounts();
}
