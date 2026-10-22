import { esc } from './dom.js';

export function toast(message, kind = 'ok', ms = 5000) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast${kind === 'err' ? ' err' : ''}`;
  el.innerHTML = `<p>${esc(message)}</p>`;
  host.appendChild(el);
  setTimeout(() => el.remove(), kind === 'err' ? Math.max(ms, 8000) : ms);
}

export const toastError = (e) => toast(e?.message || String(e), 'err');
