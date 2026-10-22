const nf = new Intl.NumberFormat('fr-FR');

export const nowIso = () => new Date().toISOString();

/** Dates normalisées en ISO UTC avec millisecondes (comparables comme du texte). */
export const normDate = (v) => (v ? new Date(v).toISOString() : null);

export const fmtDate = (iso) =>
  iso
    ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '')
    : '';

export const fmtMoney = (n) => `${nf.format(Math.round(Number(n) || 0))} FCFA`;
export const fmtInt = (n) => nf.format(Number(n) || 0);

export const slug = (s) =>
  String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\W+/g, '_').replace(/^_+|_+$/g, '');

export const PAGE_SIZE = 100;

export const ETATS = [
  ['fonctionnel', 'Fonctionnel'],
  ['non_fonctionnel', 'Non fonctionnel'],
];
export const etatLabel = (e) => (ETATS.find((x) => x[0] === e) || [, e || ''])[1];
