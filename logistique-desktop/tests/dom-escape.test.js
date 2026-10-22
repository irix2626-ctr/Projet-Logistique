import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, esc, raw } from '../src/ui/dom.js';

test('XSS : toute valeur interpolée est échappée par défaut (désignations, bénéficiaires, fournisseurs...)', () => {
  const evil = '<img src=x onerror="alert(1)">';
  const out = String(html`<td>${evil}</td>`);
  assert.equal(out, '<td>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</td>');
  assert.ok(!out.includes('<img'));
});

test('XSS : les attributs sont échappés (guillemets), les imbrications html`` restent intactes', () => {
  const nom = '" onfocus="alert(1)';
  assert.equal(String(html`<input value="${nom}">`), '<input value="&quot; onfocus=&quot;alert(1)">');
  const inner = html`<b>${'a&b'}</b>`;
  assert.equal(String(html`<p>${inner}</p>`), '<p><b>a&amp;b</b></p>');
});

test('listes, null et false sont rendus proprement ; raw() est le seul moyen de ne pas échapper', () => {
  assert.equal(String(html`${[1, '<', null, false]}`), '1&lt;');
  assert.equal(String(html`${raw('<svg/>')}`), '<svg/>');
  assert.equal(esc(undefined), '');
});
