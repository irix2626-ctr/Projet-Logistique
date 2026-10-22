import { uuid } from '../core/uuid.js';
import { nowIso } from '../core/format.js';
import { AppError } from '../core/errors.js';
import { outboxCreateIfExists } from './outbox.js';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MIMES = ['application/pdf', 'image/jpeg', 'image/png'];

/** Fichier préparé par l'interface : { nom, mime, taille, base64 }. */
export function checkFile(f) {
  if (!f || !f.base64) throw new AppError('VALIDATION', 'Fichier illisible.');
  if (!MIMES.includes(f.mime)) throw new AppError('VALIDATION', 'Type de fichier non autorisé (PDF, JPG ou PNG).');
  if (f.taille > MAX_FILE_BYTES) throw new AppError('VALIDATION', 'Fichier trop volumineux (10 Mo maximum).');
}

/**
 * Pièce jointe libre (aucun « bon de livraison »). Les instructions sont conditionnées à l'existence de
 * la ligne rattachée : si l'enregistrement principal est refusé, aucune pièce orpheline n'est créée.
 */
export function documentStatements(file, rattacheType, rattacheId, operateurId) {
  checkFile(file);
  const table = rattacheType === 'lot' ? 'lots' : 'sorties';
  const id = uuid();
  const ts = nowIso();
  return [
    {
      sql: `INSERT INTO documents (id, rattache_type, rattache_id, nom, mime, taille, content_b64, operateur_id, created_at, updated_at)
            SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM ${table} WHERE id = ?)`,
      params: [id, rattacheType, rattacheId, file.nom, file.mime, file.taille, file.base64, operateurId, ts, ts, rattacheId],
    },
    outboxCreateIfExists('documents', id, { id, rattache_type: rattacheType, rattache_id: rattacheId, nom: file.nom, mime: file.mime }, operateurId),
    {
      sql: "INSERT OR IGNORE INTO sync_files (id, type) SELECT ?, 'document' WHERE EXISTS (SELECT 1 FROM documents WHERE id = ?)",
      params: [id, id],
    },
  ];
}
