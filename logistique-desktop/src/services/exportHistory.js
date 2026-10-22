import { db, one, withLock } from '../core/db.js';
import { uuid } from '../core/uuid.js';
import { nowIso } from '../core/format.js';
import { base64ToBytes, bytesToBase64 } from '../core/b64.js';
import { session } from '../core/session.js';

export const MAX_EXPORTS = 20;

/** Conserve le fichier généré (les 20 derniers seulement : le plus ancien disparaît à l'ajout d'un nouveau). */
export function recordExport({ nom, format, module, bytes }) {
  return withLock(async () => {
    const id = uuid();
    await db.batch([
      {
        sql: `INSERT INTO export_history (id, nom, format, module, user_id, user_nom, taille, created_at, content_b64)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [id, nom, format, module || '', session.user?.id ?? null, session.user?.nom ?? '', bytes.length, nowIso(), bytesToBase64(bytes)],
      },
      {
        sql: `DELETE FROM export_history WHERE id NOT IN (SELECT id FROM export_history ORDER BY created_at DESC, id DESC LIMIT ${MAX_EXPORTS})`,
        params: [],
      },
    ]);
    return id;
  });
}

export const listExports = ({ q = '', format = '' } = {}) => {
  const where = [];
  const params = [];
  if (q.trim()) { where.push('(nom LIKE ? OR module LIKE ? OR user_nom LIKE ?)'); params.push(...Array(3).fill(`%${q.trim()}%`)); }
  if (format) { where.push('format = ?'); params.push(format); }
  return db.select(
    `SELECT id, nom, format, module, user_nom, taille, created_at FROM export_history
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC, id DESC LIMIT ${MAX_EXPORTS}`,
    params
  );
};

export async function getExport(id) {
  const r = await one('SELECT nom, format, content_b64 FROM export_history WHERE id = ?', [id]);
  return r ? { nom: r.nom, format: r.format, bytes: base64ToBytes(r.content_b64) } : null;
}
