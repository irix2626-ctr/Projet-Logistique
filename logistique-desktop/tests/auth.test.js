import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/core/db.js';
import { session } from '../src/core/session.js';
import { uuid } from '../src/core/uuid.js';
import { freshEnv, secrets } from './helpers/setup.js';
import { installFakeServer } from './helpers/fake-server.js';
import { login, loginOffline, logout, kdf } from '../src/services/auth.js';

let env; let server; let userId;
beforeEach(async () => {
  env = await freshEnv();
  server = installFakeServer();
  userId = uuid();
  server.users.push({ id: userId, structure_id: env.structureId, identifiant: 'marie', nom: 'Marie K.', role: 'personnel', password: 'MotDePasse123' });
  session.user = null; session.token = null;
});

const creds = (over = {}) => ({ structureId: env.structureId, identifiant: 'marie', password: 'MotDePasse123', ...over });

test('connexion en ligne : jeton dans le coffre (jamais dans SQLite), vérificateur salé conservé', async () => {
  const u = await login(creds());
  assert.equal(u.structure_nom, 'PNLP');
  assert.equal(session.online, true);
  assert.ok(secrets.get(`token:${userId}`));

  const dump = JSON.stringify(await db.select('SELECT * FROM local_auth'));
  assert.ok(!dump.includes('MotDePasse123'));               // jamais le mot de passe
  assert.ok(!dump.includes(session.token));                 // jamais le jeton
  const row = (await db.select('SELECT * FROM local_auth'))[0];
  assert.equal(row.iterations, kdf.iterations);
  assert.ok(row.salt && row.hash);
});

test('identifiants invalides en ligne : refus net, pas de repli hors-ligne', async () => {
  await assert.rejects(() => login(creds({ password: 'mauvais' })), { code: 'IDENTIFIANTS_INVALIDES' });
  assert.equal(session.user, null);
});

test('connexion hors-ligne : possible après une connexion en ligne sur ce poste, récupère le jeton', async () => {
  await login(creds());
  session.user = null; session.token = null;

  server.down = true;
  const u = await login(creds());                           // serveur injoignable -> repli hors-ligne
  assert.equal(u.id, userId);
  assert.equal(session.online, false);
  assert.equal(session.token, secrets.get(`token:${userId}`));
});

test('hors-ligne : compte jamais connecté en ligne sur ce poste refusé', async () => {
  server.down = true;
  await assert.rejects(() => login(creds()), { code: 'HORS_LIGNE_INDISPONIBLE' });
});

test('hors-ligne : mot de passe faux refusé, verrouillage après 5 échecs', async () => {
  await login(creds());
  server.down = true;
  for (let i = 0; i < 5; i++) {
    await assert.rejects(() => loginOffline(creds({ password: 'faux' })), { code: 'IDENTIFIANTS_INVALIDES' });
  }
  await assert.rejects(() => loginOffline(creds()), { code: 'COMPTE_VERROUILLE' });   // même le bon mot de passe
});

test('hors-ligne : durée maximale dépassée (30 jours) -> reconnexion en ligne obligatoire', async () => {
  await login(creds());
  const old = new Date(Date.now() - 31 * 86400000).toISOString();
  await db.execute('UPDATE local_auth SET last_online_login_at = ?', [old]);
  server.down = true;
  await assert.rejects(() => loginOffline(creds()), { code: 'HORS_LIGNE_EXPIRE' });
});

test('déconnexion : jeton effacé du coffre, session vidée', async () => {
  await login(creds());
  await logout();
  assert.equal(session.user, null);
  assert.equal(secrets.has(`token:${userId}`), false);
});
