import { db, one, withLock } from '../core/db.js';
import { uuid } from '../core/uuid.js';
import { nowIso } from '../core/format.js';
import { AppError } from '../core/errors.js';
import { requireSession } from '../core/session.js';
import { outboxStatements } from './outbox.js';

export const listCategories = () =>
  db.select('SELECT id, nom, icone, couleur_fond FROM categories WHERE deleted_at IS NULL ORDER BY nom');

export const listStructures = () =>
  db.select('SELECT id, nom FROM structures WHERE deleted_at IS NULL ORDER BY nom');

/** Retrouve le matériel du catalogue (désignation + catégorie + marque) ou prépare sa création. */
export async function findOrCreateMateriel({ designation, categorieId, marque }) {
  const found = await one(
    `SELECT id FROM materiels WHERE deleted_at IS NULL AND lower(designation) = lower(?) AND categorie_id = ?
       AND lower(COALESCE(marque_modele, '')) = lower(?)`,
    [designation, categorieId, marque || '']
  );
  if (found) return { materielId: found.id, statements: [] };

  const user = requireSession();
  const id = uuid();
  const ts = nowIso();
  const statements = [
    {
      sql: 'INSERT INTO materiels (id, designation, categorie_id, marque_modele, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [id, designation, categorieId, marque || null, ts, ts],
    },
    ...(await outboxStatements(
      'materiels', id, 'create',
      { id, designation, categorie_id: categorieId, marque_modele: marque || null },
      { operateurId: user.id }
    )),
  ];
  return { materielId: id, statements };
}

/** Catégories : gérées par l'administrateur (aussi hors-ligne, synchronisées ensuite). */
export function saveCategorie({ id, nom, icone, couleur_fond }) {
  return withLock(async () => {
    const user = requireSession();
    if (user.role !== 'admin') throw new AppError('DROIT_INSUFFISANT', 'Seul un administrateur gère les catégories.');
    const name = String(nom || '').trim();
    if (!name) throw new AppError('VALIDATION', 'Le nom de la catégorie est obligatoire.');
    const dup = await one('SELECT id FROM categories WHERE deleted_at IS NULL AND lower(nom) = lower(?) AND id != ?', [name, id || '']);
    if (dup) throw new AppError('VALIDATION', 'Cette catégorie existe déjà.');

    const ts = nowIso();
    const color = couleur_fond && /^#[0-9A-Fa-f]{6}$/.test(couleur_fond) ? couleur_fond : null;
    const catId = id || uuid();
    const exists = id ? await one('SELECT id FROM categories WHERE id = ?', [id]) : null;
    const payload = { id: catId, nom: name, icone: icone || null, couleur_fond: color };

    const statements = [
      exists
        ? { sql: 'UPDATE categories SET nom = ?, icone = ?, couleur_fond = ?, updated_at = ? WHERE id = ?', params: [name, icone || null, color, ts, catId] }
        : { sql: 'INSERT INTO categories (id, nom, icone, couleur_fond, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', params: [catId, name, icone || null, color, ts, ts] },
      ...(await outboxStatements('categories', catId, exists ? 'update' : 'create', payload, { operateurId: user.id })),
    ];
    await db.batch(statements);
    return catId;
  });
}
