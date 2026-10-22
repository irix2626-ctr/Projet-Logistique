import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshEnv } from './helpers/setup.js';
import { recordExport, listExports, getExport, MAX_EXPORTS } from '../src/services/exportHistory.js';

beforeEach(async () => { await freshEnv(); });

test('historique : seuls les 20 derniers fichiers sont conservés, le plus ancien disparaît', async () => {
  for (let i = 1; i <= 23; i++) {
    await recordExport({ nom: `fichier-${i}.xlsx`, format: 'Excel', module: 'Dashboard', bytes: new Uint8Array([i, i + 1]) });
    await new Promise((r) => setTimeout(r, 2));
  }
  const list = await listExports();
  assert.equal(list.length, MAX_EXPORTS);
  assert.equal(list[0].nom, 'fichier-23.xlsx');
  assert.equal(list.at(-1).nom, 'fichier-4.xlsx');
});

test('un export conservé est ré-exportable à l\'identique', async () => {
  const id = await recordExport({ nom: 'a.pdf', format: 'PDF', module: 'Sorties', bytes: new Uint8Array([1, 2, 3, 250]) });
  const f = await getExport(id);
  assert.deepEqual([...f.bytes], [1, 2, 3, 250]);
  assert.equal(f.nom, 'a.pdf');
});
