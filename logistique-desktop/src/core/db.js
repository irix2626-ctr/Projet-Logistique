/**
 * Façade d'accès à la base locale. L'adaptateur est injecté :
 *  - application : commandes Rust (rusqlite) via db-tauri.js ;
 *  - tests Node  : node:sqlite (tests/helpers/sqlite-adapter.js).
 * Contrat : select(sql, params) -> lignes ; execute(sql, params) -> { rowsAffected } ;
 * batch([{sql, params}]) -> [rowsAffected...] en UNE transaction (tout ou rien).
 */
let adapter = null;

export function setDb(a) {
  adapter = a;
}

const need = () => {
  if (!adapter) throw new Error('Base locale non initialisée.');
  return adapter;
};

const norm = (params) => (params || []).map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

export const db = {
  select: (sql, params = []) => need().select(sql, norm(params)),
  execute: (sql, params = []) => need().execute(sql, norm(params)),
  batch: (statements) => need().batch(statements.map((s) => ({ sql: s.sql, params: norm(s.params) }))),
};

/** Sérialise les écritures : lecture de contrôle + écriture ne s'entrelacent jamais (UI + synchro). */
let chain = Promise.resolve();
export function withLock(fn) {
  const run = chain.then(() => fn());
  chain = run.catch(() => {});
  return run;
}

export const one = async (sql, params = []) => (await db.select(sql, params))[0] ?? null;

// Petit stockage clé/valeur local (réglages, curseur de synchro...).
export async function getKv(key, fallback = null) {
  const row = await one('SELECT value FROM kv WHERE key = ?', [key]);
  return row ? row.value : fallback;
}

export function kvStatement(key, value) {
  return {
    sql: 'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    params: [key, value == null ? null : String(value)],
  };
}

export async function setKv(key, value) {
  const s = kvStatement(key, value);
  await db.execute(s.sql, s.params);
}
