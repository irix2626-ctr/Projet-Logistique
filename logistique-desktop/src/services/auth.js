import { db, one, getKv, setKv } from '../core/db.js';
import { AppError } from '../core/errors.js';
import { nowIso } from '../core/format.js';
import { base64ToBytes, bytesToBase64 } from '../core/b64.js';
import { saveSecret, loadSecret, removeSecret } from '../core/secret.js';
import { session, clearSession } from '../core/session.js';
import { api, apiMessage } from './api.js';

/** Dérivation du vérificateur hors-ligne (PBKDF2-SHA256, sel unique). Modifiable pour les tests. */
export const kdf = { iterations: 310000 };

const MAX_FAILED = 5;

async function derive(password, saltB64, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: base64ToBytes(saltB64), iterations }, key, 256);
  return bytesToBase64(new Uint8Array(bits));
}

function sameSecret(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function storeVerifier({ userId, structureId, identifiant, nom, role, password }) {
  const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await derive(password, salt, kdf.iterations);
  await db.execute(
    `INSERT INTO local_auth (user_id, structure_id, identifiant, nom, role, salt, hash, iterations, last_online_login_at, failed_attempts, locked_until)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
     ON CONFLICT(user_id) DO UPDATE SET structure_id = excluded.structure_id, identifiant = excluded.identifiant, nom = excluded.nom,
       role = excluded.role, salt = excluded.salt, hash = excluded.hash, iterations = excluded.iterations,
       last_online_login_at = excluded.last_online_login_at, failed_attempts = 0, locked_until = NULL`,
    [userId, structureId, identifiant.toLowerCase(), nom, role, salt, hash, kdf.iterations, nowIso()]
  );
}

async function structureNom(id) {
  return (await one('SELECT nom FROM structures WHERE id = ?', [id]))?.nom ?? '';
}

async function openSession(user, identifiant, token, online) {
  session.user = {
    id: user.id, structure_id: user.structure_id, structure_nom: await structureNom(user.structure_id),
    nom: user.nom, identifiant, role: user.role, must_change_password: !!user.must_change_password,
  };
  session.token = token;
  session.online = online;
  return session.user;
}

/**
 * Connexion : en ligne d'abord (le serveur fait foi). Si le serveur est injoignable, connexion hors-ligne
 * possible seulement pour un compte déjà connecté EN LIGNE sur ce poste (SEC-2.14).
 */
export async function login({ structureId, identifiant, password }) {
  const id = String(identifiant || '').trim();
  if (!structureId) throw new AppError('VALIDATION', 'Choisissez votre structure.');
  if (!id || !password) throw new AppError('VALIDATION', "Renseignez l'identifiant et le mot de passe.");

  let res;
  try {
    res = await api.post(
      '/auth/login',
      {
        structure_id: structureId, identifiant: id, mot_de_passe: password,
        device_name: (await getKv('device_name')) || 'Poste', device_id: (await getKv('device_id')) || undefined,
      },
      { auth: false, timeoutMs: 8000 }
    );
  } catch (e) {
    if (e.code === 'RESEAU' || e.code === 'SERVEUR_NON_CONFIGURE') return loginOffline({ structureId, identifiant: id, password });
    if (e.status === 422) throw new AppError('IDENTIFIANTS_INVALIDES', 'Identifiants incorrects pour cette structure.');
    if (e.status === 429) throw new AppError('TROP_DE_TENTATIVES', 'Trop de tentatives : patientez une minute.');
    throw new AppError('SERVEUR', apiMessage(e));
  }

  await storeVerifier({ userId: res.user.id, structureId: res.user.structure_id, identifiant: id, nom: res.user.nom, role: res.user.role, password });
  await saveSecret(`token:${res.user.id}`, res.token);
  return openSession(res.user, id, res.token, true);
}

export async function loginOffline({ structureId, identifiant, password }) {
  const row = await one('SELECT * FROM local_auth WHERE structure_id = ? AND identifiant = ?', [structureId, identifiant.toLowerCase()]);
  if (!row) {
    throw new AppError('HORS_LIGNE_INDISPONIBLE',
      "Serveur injoignable, et ce compte ne s'est jamais connecté en ligne sur ce poste : connexion impossible.");
  }
  if (row.locked_until && new Date(row.locked_until) > new Date()) {
    const min = Math.max(1, Math.ceil((new Date(row.locked_until) - new Date()) / 60000));
    throw new AppError('COMPTE_VERROUILLE', `Compte verrouillé après plusieurs échecs : réessayez dans ${min} min.`);
  }
  const maxDays = Number(await getKv('offline_max_days', '30'));
  const days = (Date.now() - new Date(row.last_online_login_at).getTime()) / 86400000;
  if (days > maxDays) {
    throw new AppError('HORS_LIGNE_EXPIRE', `Dernière connexion en ligne il y a plus de ${maxDays} jours : reconnectez-vous au serveur.`);
  }

  const hash = await derive(password, row.salt, row.iterations);
  if (!sameSecret(hash, row.hash)) {
    const n = row.failed_attempts + 1;
    const lock = n >= MAX_FAILED ? new Date(Date.now() + Math.min(60, 2 ** (n - MAX_FAILED)) * 60000).toISOString() : null;
    await db.execute('UPDATE local_auth SET failed_attempts = ?, locked_until = ? WHERE user_id = ?', [n, lock, row.user_id]);
    throw new AppError('IDENTIFIANTS_INVALIDES', 'Identifiants incorrects pour cette structure.');
  }

  await db.execute('UPDATE local_auth SET failed_attempts = 0, locked_until = NULL WHERE user_id = ?', [row.user_id]);
  const token = await loadSecret(`token:${row.user_id}`);
  return openSession({ id: row.user_id, structure_id: row.structure_id, nom: row.nom, role: row.role }, row.identifiant, token, false);
}

/** Reconnexion au serveur d'un utilisateur déjà ouvert hors-ligne (nouveau jeton, outbox conservée). */
export async function reauth(password) {
  const u = session.user;
  if (!u) throw new AppError('NON_CONNECTE', 'Vous devez être connecté.');
  try {
    const res = await api.post(
      '/auth/login',
      { structure_id: u.structure_id, identifiant: u.identifiant, mot_de_passe: password,
        device_name: (await getKv('device_name')) || 'Poste', device_id: (await getKv('device_id')) || undefined },
      { auth: false, timeoutMs: 8000 }
    );
    await storeVerifier({ userId: u.id, structureId: u.structure_id, identifiant: u.identifiant, nom: res.user.nom, role: res.user.role, password });
    await saveSecret(`token:${u.id}`, res.token);
    session.token = res.token;
    session.online = true;
    session.user.must_change_password = !!res.user.must_change_password;
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (e.status === 422) throw new AppError('IDENTIFIANTS_INVALIDES', 'Mot de passe incorrect.');
    throw new AppError('SERVEUR', apiMessage(e));
  }
}

/** Changement de son propre mot de passe (obligatoire à la première connexion). Nécessite le serveur. */
export async function changePassword(actuel, nouveau) {
  try {
    await api.put('/auth/password', { mot_de_passe_actuel: actuel, nouveau_mot_de_passe: nouveau });
  } catch (e) {
    throw new AppError('SERVEUR', e.code === 'RESEAU' ? 'Le changement de mot de passe nécessite le serveur.' : apiMessage(e));
  }
  const u = session.user;
  await storeVerifier({ userId: u.id, structureId: u.structure_id, identifiant: u.identifiant, nom: u.nom, role: u.role, password: nouveau });
  u.must_change_password = false;
}

/** Déconnexion : le jeton est effacé du coffre (SEC-2.19) ; les données locales et la file d'envoi restent. */
export async function logout() {
  const u = session.user;
  if (u) {
    try {
      if (session.token) await api.post('/auth/logout', undefined, { timeoutMs: 4000 });
    } catch {
      /* serveur injoignable : le jeton expirera */
    }
    await removeSecret(`token:${u.id}`);
  }
  clearSession();
}

export { setKv };
