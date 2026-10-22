import { setDb, db, setKv } from '../../src/core/db.js';
import { createTestDb } from './sqlite-adapter.js';
import { session } from '../../src/core/session.js';
import { setSecretStore } from '../../src/core/secret.js';
import { uuid } from '../../src/core/uuid.js';
import { kdf } from '../../src/services/auth.js';
import { setBaseUrl } from '../../src/services/api.js';

export const secrets = new Map();

/** Base vierge + session d'un agent de la structure PNLP + poste P01 enregistré. */
export async function freshEnv({ role = 'personnel' } = {}) {
  const adapter = createTestDb();
  setDb(adapter);
  kdf.iterations = 1000; // tests rapides
  secrets.clear();
  setSecretStore({
    async set(k, v) { secrets.set(k, v); },
    async get(k) { return secrets.get(k) ?? null; },
    async delete(k) { secrets.delete(k); },
  });
  setBaseUrl('https://api.test');

  const structureId = uuid();
  const userId = uuid();
  const catId = uuid();
  await db.execute('INSERT INTO structures (id, nom) VALUES (?, ?)', [structureId, 'PNLP']);
  await db.execute('INSERT INTO users (id, structure_id, nom, email, role) VALUES (?, ?, ?, ?, ?)', [userId, structureId, 'Agent Test', 'agent', role]);
  await db.execute('INSERT INTO categories (id, nom, icone, couleur_fond) VALUES (?, ?, ?, ?)', [catId, 'Informatique', 'laptop', '#EDE7F6']);
  await setKv('device_code', 'P01');
  await setKv('device_id', uuid());

  session.user = { id: userId, structure_id: structureId, structure_nom: 'PNLP', nom: 'Agent Test', identifiant: 'agent', role, must_change_password: false };
  session.token = 'tok';
  session.online = true;
  return { adapter, structureId, userId, catId };
}

export const lotInput = (catId, over = {}) => ({
  designation: 'Ordinateur portable', categorie_id: catId, marque_modele: 'Dell 5420',
  no_serie_chassis: 'SN-1', fournisseur: 'Fournisseur SA', usage: 'Suivi terrain',
  etat_fonctionnement: 'fonctionnel', quantite_initiale: 10, cout_total: 1000, ...over,
});

export const sortieInput = (lotId, q, over = {}) => ({
  lot_id: lotId, quantite: q, nom_beneficiaire: 'Jean Kouassi', contact_beneficiaire: '0102030405',
  fonction: 'Chef de district', usage: 'Supervision', etat_fonctionnement: 'fonctionnel', ...over,
});
