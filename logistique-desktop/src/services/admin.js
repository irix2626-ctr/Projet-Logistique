import { db, getKv, setKv, withLock } from '../core/db.js';
import { AppError } from '../core/errors.js';
import { api, apiMessage, setBaseUrl } from './api.js';
import { runOnce, syncState } from './sync.js';

/** Liste des structures pour l'écran de connexion : serveur d'abord, puis copie locale. */
export async function loadStructuresOnline() {
  try {
    const list = await api.get('/structures', { auth: false, timeoutMs: 6000 });
    await withLock(() =>
      db.batch(list.map((s) => ({
        sql: `INSERT INTO structures (id, nom) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET nom = excluded.nom`,
        params: [s.id, s.nom],
      })))
    );
    return true;
  } catch {
    return false;
  }
}

/** Test de la connexion au serveur (écran de configuration). */
export async function pingServer(url) {
  const previous = (await getKv('server_url')) || '';
  setBaseUrl(url);
  try {
    const r = await api.get('/ping', { auth: false, timeoutMs: 6000 });
    return r;
  } catch (e) {
    setBaseUrl(previous);
    throw new AppError('SERVEUR', e.code === 'RESEAU' ? "Serveur injoignable : vérifiez l'adresse et la connexion." : apiMessage(e));
  }
}

export async function saveServerSettings({ url, deviceName }) {
  setBaseUrl(url);
  await setKv('server_url', url.trim().replace(/\/+$/, ''));
  if (deviceName) await setKv('device_name', deviceName.trim());
}

// ------------------------------------------------------------------ comptes (administrateur, en ligne)

const wrap = async (fn) => {
  try {
    return await fn();
  } catch (e) {
    throw new AppError('SERVEUR', e.code === 'RESEAU' ? 'Cette action nécessite le serveur : vous êtes hors-ligne.' : apiMessage(e));
  }
};

export const accounts = {
  list: () => wrap(async () => (await api.get('/users')).data),
  create: (u) => wrap(() => api.post('/users', u)),
  update: (id, u) => wrap(() => api.put(`/users/${id}`, u)),
  remove: (id) => wrap(() => api.del(`/users/${id}`)),
};

export const listConflicts = () => wrap(async () => (await api.get('/admin/conflits', { query: { resolu: 0 } })).data);
export const resolveConflict = (id, commentaire) => wrap(() => api.put(`/admin/conflits/${id}`, { commentaire }));

// ------------------------------------------------------------------ archivage et réinitialisation

/** Toute opération destructrice commence par vider la file d'envoi : le serveur doit tout connaître. */
export async function ensureSynced() {
  await runOnce();
  if (syncState.pending > 0 || syncState.state !== 'idle') {
    throw new AppError('SYNC_REQUISE', "Synchronisez d'abord ce poste (opérations en attente ou serveur injoignable) avant d'archiver.");
  }
}

/** Archivage APRÈS un export réussi : le stock restant est reporté, l'interface repart à zéro. */
export async function archiveAfterExport(password, { force = false } = {}) {
  await ensureSynced();
  const r = await wrap(() => api.post('/admin/archivage', { export_confirme: true, mot_de_passe: password, forcer_si_postes_non_synchronises: force }));
  await runOnce();
  return r;
}

/** Réinitialisation manuelle : même mécanisme d'archivage, mot de passe obligatoire. Rien n'est supprimé physiquement. */
export async function resetApplication(password, { force = false } = {}) {
  await ensureSynced();
  const r = await wrap(() => api.post('/admin/reinitialisation', { mot_de_passe: password, forcer_si_postes_non_synchronises: force }));
  await runOnce();
  return r;
}

export const isStaleDevicesError = (e) => /Postes non synchronisés/i.test(e?.message || '');
