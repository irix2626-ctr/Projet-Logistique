import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, getKv, setKv } from '../src/core/db.js';
import { session } from '../src/core/session.js';
import { freshEnv, lotInput, sortieInput } from './helpers/setup.js';
import { installFakeServer } from './helpers/fake-server.js';
import { createLot, deleteLot } from '../src/services/lots.js';
import { createSortie } from '../src/services/sorties.js';
import { runOnce, syncState, retryRejected, discardRejected, ensureDevice, listRejected } from '../src/services/sync.js';

let env; let server;
beforeEach(async () => {
  env = await freshEnv();
  server = installFakeServer();
});

const outboxCount = async () => Number((await db.select('SELECT COUNT(*) AS n FROM sync_outbox'))[0].n);

test('la synchro envoie la file dans l\'ordre (matériel avant lot), puis la vide', async () => {
  const { id } = await createLot(lotInput(env.catId));
  await createSortie(sortieInput(id, 2));
  await runOnce();

  assert.deepEqual(server.ops.map((o) => `${o.table}:${o.operation}`), ['materiels:create', 'lots:create', 'sorties:create']);
  assert.equal(await outboxCount(), 0);
  assert.equal(syncState.state, 'idle');
  assert.ok(await getKv('last_sync_at'));
  // L'opérateur voyage dans l'opération (plusieurs utilisateurs possibles sur un poste).
  assert.ok(server.ops.every((o) => o.payload.operateur_id === env.userId));
});

test('hors-ligne : rien n\'est perdu, la file est conservée puis envoyée au retour du réseau', async () => {
  const { id } = await createLot(lotInput(env.catId));
  server.down = true;
  await runOnce();
  assert.equal(syncState.state, 'offline');
  assert.equal(await outboxCount(), 2);

  server.down = false;
  await runOnce();
  assert.equal(await outboxCount(), 0);
  assert.equal(server.ops.filter((o) => o.record_id === id).length, 1);
});

test('rejeu : une opération renvoyée garde son op_id (idempotence côté serveur)', async () => {
  await createLot(lotInput(env.catId));
  server.down = true;
  await runOnce();
  const first = (await db.select('SELECT op_id FROM sync_outbox ORDER BY seq')).map((r) => r.op_id);
  server.down = false;
  await runOnce();
  assert.deepEqual(server.ops.map((o) => o.op_id), first);
});

test('opération refusée : conservée avec son message, rejouable', async () => {
  await createLot(lotInput(env.catId));
  const op = (await db.select("SELECT op_id FROM sync_outbox WHERE table_name = 'lots'"))[0];
  server.nextPushStatus.set(op.op_id, { status: 'rejected', message: 'Quantité invalide.' });
  await runOnce();

  const rejected = await listRejected();
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].derniere_erreur, 'Quantité invalide.');
  assert.equal(syncState.rejected, 1);

  server.nextPushStatus.clear();
  await retryRejected();
  await runOnce();
  assert.equal(await outboxCount(), 0);
});

test('conflit de stock : la sortie est acceptée, le conflit est signalé', async () => {
  const { id } = await createLot(lotInput(env.catId));
  const s = await createSortie(sortieInput(id, 3));
  const op = (await db.select("SELECT op_id FROM sync_outbox WHERE record_id = ?", [s.id]))[0];
  server.nextPushStatus.set(op.op_id, { status: 'conflict' });
  await runOnce();

  assert.equal(await outboxCount(), 0);
  assert.equal(syncState.conflicts, 1);
});

test('la réception applique les changements, y compris les suppressions et les lots de report', async () => {
  const lotId = 'aaaaaaaa-0000-4000-8000-000000000001';
  server.addChange('materiels', { id: 'm1', designation: 'Moto', categorie_id: env.catId, marque_modele: 'Yamaha' });
  server.addChange('lots', {
    id: lotId, numero_lot: 'LOT-2026-P02-00001', materiel_id: 'm1', structure_id: env.structureId, fournisseur: 'X', usage: 'U',
    etat_fonctionnement: 'fonctionnel', quantite_initiale: 5, cout_total: '500.00', operateur_id: env.userId,
    date_entree: '2026-10-01T10:00:00.000000Z', est_stock_initial: false, version: 1, created_at: '2026-10-01T10:00:00.000000Z',
    updated_at: '2026-10-01T10:00:00.000000Z', deleted_at: null,
  });
  await runOnce();
  const lot = (await db.select('SELECT * FROM lots WHERE id = ?', [lotId]))[0];
  assert.equal(lot.cout_total, 500);
  assert.equal(lot.date_entree, '2026-10-01T10:00:00.000Z');   // dates normalisées
  assert.equal(await getKv('sync_cursor'), '2');

  // archivage côté serveur : le lot est masqué et remplacé par un lot de report
  server.addChange('lots', { ...JSON.parse(JSON.stringify({ id: lotId, numero_lot: 'LOT-2026-P02-00001', materiel_id: 'm1', quantite_initiale: 5, cout_total: '500.00', date_entree: '2026-10-01T10:00:00Z', version: 2 })), deleted_at: '2026-10-09T00:00:00Z', archive_batch_id: 'b1' });
  await runOnce();
  assert.ok((await db.select('SELECT deleted_at FROM lots WHERE id = ?', [lotId]))[0].deleted_at);
  assert.equal(await getKv('sync_cursor'), '3');
});

test('une modification locale en attente n\'est jamais écrasée par la réception', async () => {
  const { id } = await createLot(lotInput(env.catId, { fournisseur: 'Local SA' }));
  server.down = true;
  await runOnce(); // reste en attente
  server.down = false;
  // le serveur « connaît » déjà ce lot avec une autre valeur (arbitrage au prochain envoi)
  server.addChange('lots', { id, numero_lot: 'LOT-X', materiel_id: 'm', fournisseur: 'Serveur SA', quantite_initiale: 10, cout_total: 1, date_entree: '2026-01-01T00:00:00Z', version: 5 });
  // on ne laisse passer que la réception : on bloque l'envoi
  server.nextPushStatus.set((await db.select("SELECT op_id FROM sync_outbox WHERE record_id = ?", [id]))[0].op_id, { status: 'rejected', message: 'x' });
  await runOnce();
  // rejeté => n'est plus 'pending' ; la réception a été sautée tant que l'opération était en attente
  assert.equal((await db.select('SELECT fournisseur FROM lots WHERE id = ?', [id]))[0].fournisseur, 'Local SA');
});

test('signature : envoyée avec son empreinte seulement APRÈS l\'enregistrement de la sortie', async () => {
  const { id } = await createLot(lotInput(env.catId));
  const s = await createSortie(sortieInput(id, 1, { signature: 'data:image/png;base64,iVBORw0KGgo=' }));
  await runOnce();
  assert.equal(server.files.length, 1);
  assert.equal(server.files[0].type, 'signature');
  assert.equal(server.files[0].rattache_id, s.id);
  assert.equal(server.files[0].sha256.length, 64);
  assert.equal((await db.select('SELECT * FROM sync_files')).length, 0);
});

test('suppression d\'un lot déjà envoyé : une opération delete est envoyée', async () => {
  const { id } = await createLot(lotInput(env.catId));
  await runOnce();
  await deleteLot(id);
  await runOnce();
  assert.equal(server.ops.at(-1).operation, 'delete');
  assert.equal(server.ops.at(-1).record_id, id);
});

test('enregistrement du poste : code P01 mémorisé, utilisable pour numéroter les lots', async () => {
  await db.execute("DELETE FROM kv WHERE key = 'device_code'");
  const dev = await ensureDevice();
  assert.equal(dev.code, 'P01');
  assert.equal(await getKv('device_code'), 'P01');
});

test('jeton expiré (401) : état « auth », la file est conservée', async () => {
  await createLot(lotInput(env.catId));
  server.status = 401;
  await runOnce();
  assert.equal(syncState.state, 'auth');
  assert.equal(await outboxCount(), 2);
});

test('client obsolète (426) : état « update », la file est conservée', async () => {
  await createLot(lotInput(env.catId));
  server.status = 426;
  await runOnce();
  assert.equal(syncState.state, 'update');
  assert.equal(await outboxCount(), 2);
});

test('sans jeton : pas de synchro, état « auth »', async () => {
  session.token = null;
  await runOnce();
  assert.equal(syncState.state, 'auth');
});

test('abandon d\'une création refusée : l\'opération disparaît et la donnée locale est masquée', async () => {
  const { id } = await createLot(lotInput(env.catId));
  const op = (await db.select("SELECT op_id FROM sync_outbox WHERE table_name = 'lots'"))[0];
  server.nextPushStatus.set(op.op_id, { status: 'rejected', message: 'Refusé.' });
  await runOnce();
  const [r] = await listRejected();
  await discardRejected(r.seq);
  assert.equal((await listRejected()).length, 0);
  assert.ok((await db.select('SELECT deleted_at FROM lots WHERE id = ?', [id]))[0].deleted_at);
});
