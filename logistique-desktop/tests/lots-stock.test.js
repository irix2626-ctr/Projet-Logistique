import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/core/db.js';
import { freshEnv, lotInput, sortieInput } from './helpers/setup.js';
import { createLot, updateLot, deleteLot, listEntrees } from '../src/services/lots.js';
import { createSortie, listSorties, getBon } from '../src/services/sorties.js';
import { listStock, suggestion, restanteDe, getLot, lotsDisponibles } from '../src/services/stock.js';
import { journal, cycleLot } from '../src/services/trace.js';
import { summary } from '../src/services/dashboard.js';

let env;
beforeEach(async () => { env = await freshEnv(); });

const outbox = () => db.select('SELECT * FROM sync_outbox ORDER BY seq');

test('une entrée crée un lot disponible, numéroté LOT-AAAA-Pxx-00001, avec file d\'envoi', async () => {
  const { id, numero_lot } = await createLot(lotInput(env.catId));
  assert.match(numero_lot, /^LOT-\d{4}-P01-00001$/);

  const lot = await getLot(id);
  assert.equal(lot.restante, 10);
  assert.equal(lot.structure_id, env.structureId);
  assert.equal(lot.operateur_id, env.userId);

  const ops = await outbox();
  assert.deepEqual(ops.map((o) => [o.table_name, o.operation]), [['materiels', 'create'], ['lots', 'create']]);
  const payload = JSON.parse(ops[1].payload);
  assert.equal(payload.numero_lot, numero_lot);
  assert.equal(payload.operateur_id, env.userId);
  assert.equal('cout_unitaire' in payload, false);          // aucun coût unitaire
});

test('les numéros de lot sont consécutifs et le matériel du catalogue est réutilisé', async () => {
  const a = await createLot(lotInput(env.catId));
  const b = await createLot(lotInput(env.catId));
  assert.match(a.numero_lot, /00001$/);
  assert.match(b.numero_lot, /00002$/);
  assert.equal((await db.select('SELECT id FROM materiels')).length, 1);
});

test('poste non enregistré : création de lot refusée avec un message clair', async () => {
  await db.execute("DELETE FROM kv WHERE key = 'device_code'");
  await assert.rejects(() => createLot(lotInput(env.catId)), { code: 'POSTE_NON_ENREGISTRE' });
  assert.equal((await db.select('SELECT id FROM lots')).length, 0);
});

test('validation de la saisie du lot', async () => {
  await assert.rejects(() => createLot(lotInput(env.catId, { quantite_initiale: 0 })), { code: 'VALIDATION' });
  await assert.rejects(() => createLot(lotInput(env.catId, { cout_total: -1 })), { code: 'VALIDATION' });
  await assert.rejects(() => createLot(lotInput(env.catId, { fournisseur: ' ' })), { code: 'VALIDATION' });
  await assert.rejects(() => createLot(lotInput(env.catId, { etat_fonctionnement: 'Bon' })), { code: 'VALIDATION' });
  assert.equal((await db.select('SELECT id FROM lots')).length, 0);
  assert.equal((await outbox()).length, 0);
});

test('sortie : lot obligatoire, plafonnée au reste, PR/SR et opérateur automatiques', async () => {
  const { id } = await createLot(lotInput(env.catId));
  await assert.rejects(() => createSortie({ ...sortieInput(id, 1), lot_id: null }), { code: 'VALIDATION' });

  const s = await createSortie(sortieInput(id, 4));
  assert.ok(s.id);
  const row = (await db.select('SELECT * FROM sorties WHERE id = ?', [s.id]))[0];
  assert.equal(row.pr_sr, 'PNLP');
  assert.equal(row.operateur_id, env.userId);
  assert.equal(await restanteDe(id), 6);
});

test('sortie au-delà du reste : refusée, rien n\'est écrit (ni sortie, ni opération)', async () => {
  const { id } = await createLot(lotInput(env.catId, { quantite_initiale: 5 }));
  const before = (await outbox()).length;
  await assert.rejects(() => createSortie(sortieInput(id, 6)), { code: 'STOCK_INSUFFISANT' });
  assert.equal((await db.select('SELECT id FROM sorties')).length, 0);
  assert.equal((await outbox()).length, before);
});

test('sorties successives jusqu\'à épuisement, le lot quitte le stock', async () => {
  const { id } = await createLot(lotInput(env.catId, { quantite_initiale: 10 }));
  await createSortie(sortieInput(id, 4));
  await createSortie(sortieInput(id, 6));
  await assert.rejects(() => createSortie(sortieInput(id, 1)), { code: 'STOCK_INSUFFISANT' });
  assert.equal((await listStock()).total, 0);
});

test('deux sorties simultanées ne peuvent pas dépasser le stock', async () => {
  const { id } = await createLot(lotInput(env.catId, { quantite_initiale: 10 }));
  const r = await Promise.allSettled([createSortie(sortieInput(id, 6)), createSortie(sortieInput(id, 6))]);
  assert.equal(r.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(await restanteDe(id), 4);
});

test('FIFO : le lot le plus ancien est proposé en premier', async () => {
  const recent = await createLot(lotInput(env.catId));
  const ancien = await createLot(lotInput(env.catId));
  await db.execute("UPDATE lots SET date_entree = '2020-01-01T00:00:00.000Z' WHERE id = ?", [ancien.id]);
  const matId = (await getLot(recent.id)).materiel_id;
  assert.equal((await suggestion(matId)).id, ancien.id);
  assert.deepEqual((await lotsDisponibles(matId)).map((l) => l.id), [ancien.id, recent.id]);
});

test('valeur du stock au prorata (aucun coût unitaire)', async () => {
  const { id } = await createLot(lotInput(env.catId, { quantite_initiale: 10, cout_total: 1000 }));
  await createSortie(sortieInput(id, 4));
  assert.equal((await getLot(id)).valeur, 600);
  const d = await summary();
  assert.equal(d.valeur_totale_stock, 600);
  assert.equal(d.etat_machines.fonctionnel, 6);
  assert.equal(d.categories[0].quantite_totale, 6);
  assert.equal(d.categories[0].nombre_articles, 1);
  assert.equal(d.derniers_mouvements.length, 2);
});

test('modification : la quantité initiale ne passe pas sous les sorties ; update fusionné dans la création en attente', async () => {
  const { id } = await createLot(lotInput(env.catId, { quantite_initiale: 10 }));
  await createSortie(sortieInput(id, 5));
  await assert.rejects(() => updateLot(id, lotInput(env.catId, { quantite_initiale: 3 })), { code: 'QUANTITE_SOUS_SORTIES' });
  await updateLot(id, lotInput(env.catId, { quantite_initiale: 8, fournisseur: 'Autre SA' }));
  assert.equal((await getLot(id)).restante, 3);

  const ops = (await outbox()).filter((o) => o.table_name === 'lots');
  assert.equal(ops.length, 1);                              // create + update = un seul create
  assert.equal(ops[0].operation, 'create');
  const p = JSON.parse(ops[0].payload);
  assert.equal(p.fournisseur, 'Autre SA');
  assert.equal(p.operateur_id, env.userId);
});

test('suppression : refusée si sorties ; logique sinon ; un lot jamais envoyé n\'envoie rien', async () => {
  const a = await createLot(lotInput(env.catId));
  const b = await createLot(lotInput(env.catId));
  await createSortie(sortieInput(a.id, 1));
  await assert.rejects(() => deleteLot(a.id), { code: 'LOT_AVEC_SORTIES' });

  await deleteLot(b.id);
  const row = (await db.select('SELECT deleted_at FROM lots WHERE id = ?', [b.id]))[0];
  assert.ok(row.deleted_at);                                // suppression logique : la ligne existe toujours
  assert.equal((await outbox()).filter((o) => o.record_id === b.id).length, 0);
});

test('traçabilité : journal unifié, cycle de vie, bon de sortie, registres', async () => {
  const { id, numero_lot } = await createLot(lotInput(env.catId));
  const s = await createSortie(sortieInput(id, 3, { signature: 'data:image/png;base64,AAAA' }));
  await createSortie(sortieInput(id, 2));

  const j = await journal();
  assert.equal(j.total, 3);
  assert.equal((await journal({ type: 'sortie' })).total, 2);
  assert.equal((await journal({ q: 'Kouassi' })).total, 2);

  const c = await cycleLot(id);
  assert.equal(c.total_sorti, 5);
  assert.equal(c.reste, 5);
  assert.equal(c.sorties.length, 2);

  const bon = await getBon(s.id);
  assert.equal(bon.numero_lot, numero_lot);
  assert.equal(bon.pr_sr, 'PNLP');
  assert.equal(bon.operateur_nom, 'Agent Test');
  assert.equal(bon.signature_b64, 'AAAA');

  assert.equal((await listSorties()).rows.find((r) => r.id === s.id).signee, 1);
  assert.equal((await listEntrees()).total, 1);
});

test('la signature part dans la file des fichiers ; la pièce jointe est liée au lot', async () => {
  const doc = { nom: 'facture.pdf', mime: 'application/pdf', taille: 10, base64: 'JVBERi0=' };
  const { id } = await createLot(lotInput(env.catId), [doc]);
  await createSortie(sortieInput(id, 1, { signature: 'data:image/png;base64,AAAA' }));
  const files = await db.select('SELECT type FROM sync_files ORDER BY type');
  assert.deepEqual(files.map((f) => f.type), ['document', 'signature']);
  const docs = await db.select('SELECT rattache_type, rattache_id FROM documents');
  assert.deepEqual(docs, [{ rattache_type: 'lot', rattache_id: id }]);

  await assert.rejects(() => createLot(lotInput(env.catId), [{ ...doc, mime: 'application/x-msdownload' }]), { code: 'VALIDATION' });
});
