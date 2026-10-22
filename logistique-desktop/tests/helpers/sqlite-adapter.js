import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '../../src-tauri/migrations');

/** Base en mémoire avec les VRAIES migrations de l'application (même SQL que Rust). */
export function createTestDb() {
  const raw = new DatabaseSync(':memory:');
  for (const f of readdirSync(migrationsDir).filter((x) => x.endsWith('.sql')).sort()) {
    raw.exec(readFileSync(join(migrationsDir, f), 'utf8'));
  }

  const toRows = (stmt, params) => stmt.all(...params).map((r) => ({ ...r }));

  const adapter = {
    raw,
    async select(sql, params) {
      return toRows(raw.prepare(sql), params);
    },
    async execute(sql, params) {
      const r = raw.prepare(sql).run(...params);
      return { rowsAffected: Number(r.changes) };
    },
    async batch(statements) {
      raw.exec('BEGIN');
      try {
        const counts = [];
        for (const s of statements) counts.push(Number(raw.prepare(s.sql).run(...s.params).changes));
        raw.exec('COMMIT');
        return counts;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return adapter;
}
