import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshEnv, lotInput, sortieInput } from './helpers/setup.js';
import { createLot } from '../src/services/lots.js';
import { createSortie } from '../src/services/sorties.js';
import { exportData } from '../src/services/exportData.js';

let env;
beforeEach(async () => { env = await freshEnv(); });

test('export : toutes les feuilles sont reliées par numero_lot et cohérentes', async () => {
  const a = await createLot(lotInput(env.catId, { quantite_initiale: 10, cout_total: 1000 }));
  const b = await createLot(lotInput(env.catId, { designation: 'Imprimante', quantite_initiale: 2, cout_total: 300 }));
  await createSortie(sortieInput(a.id, 4));
  await createSortie(sortieInput(b.id, 2));                 // b épuisé : sort du stock

  const d = await exportData();
  assert.equal(d.lots.length, 2);
  assert.equal(d.stock.length, 1);                          // seul le lot a reste en stock
  assert.equal(d.stock[0].numero_lot, a.numero_lot);
  assert.equal(d.stock[0].quantite_restante, 6);
  assert.equal(d.stock[0].valeur_restante, 600);
  assert.equal(d.sorties.length, 2);
  assert.equal(d.trace.length, 4);
  assert.equal(d.recap.valeur_totale_stock, 600);

  const numeros = new Set(d.lots.map((l) => l.numero_lot));
  for (const s of d.sorties) assert.ok(numeros.has(s.numero_lot));
  for (const t of d.trace) assert.ok(numeros.has(t.numero_lot));
});

test('export : les filtres actifs (période, catégorie) s\'appliquent à toutes les feuilles', async () => {
  const a = await createLot(lotInput(env.catId));
  await createSortie(sortieInput(a.id, 1));
  const none = await exportData({ dateFrom: '2000-01-01', dateTo: '2000-12-31' });
  assert.equal(none.lots.length + none.stock.length + none.sorties.length + none.trace.length, 0);
  const other = await exportData({ categorieId: 'inconnue' });
  assert.equal(other.lots.length, 0);
});
