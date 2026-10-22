/**
 * Gabarits HTML avec ÉCHAPPEMENT AUTOMATIQUE (SEC-8.7) : toute valeur interpolée est échappée,
 * sauf si elle provient d'un autre html`` ou de raw(). Désignations, noms et fournisseurs sont du texte libre.
 */
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

class Safe {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

export const raw = (s) => new Safe(String(s));

const render = (v) => {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(render).join('');
  if (v instanceof Safe) return v.s;
  return esc(v);
};

export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) out += render(vals[i]);
  });
  return new Safe(out);
}

export function mount(el, content) {
  el.innerHTML = content instanceof Safe ? content.s : String(content);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const debounce = (fn, ms = 250) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};
