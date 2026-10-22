import { icons } from 'lucide';
import { raw } from './dom.js';

const toPascal = (n) => String(n || '').split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');

const FALLBACK = '<path d="M21 8 12 3 3 8v8l9 5 9-5V8z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>'; // boîte

/** Icône Lucide par son nom (ex. « car », « laptop »). Repli : une boîte. */
export function iconSvg(name, size = 24) {
  let inner = FALLBACK;
  try {
    const node = icons[toPascal(name)];
    if (Array.isArray(node)) {
      inner = node
        .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs || {}).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ')}/>`)
        .join('');
    }
  } catch {
    /* repli */
  }
  return raw(
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`
  );
}
