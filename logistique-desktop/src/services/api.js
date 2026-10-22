import { session } from '../core/session.js';
import { emit } from '../core/events.js';

const CLIENT_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'; // eslint-disable-line no-undef

let base = '';
let deviceId = '';

export const setBaseUrl = (u) => {
  base = String(u || '').trim().replace(/\/+$/, '');
};
export const getBaseUrl = () => base;
export const setDeviceId = (id) => {
  deviceId = id || '';
};

export class ApiError extends Error {
  constructor(status, code, message, errors = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

/** Client HTTP du serveur Laravel (contrat : openapi.yaml). Erreurs normalisées : RESEAU, 401, 403, 409, 422, 426... */
export async function request(method, path, { body, query, form, auth = true, timeoutMs = 20000, raw = false } = {}) {
  if (!base) throw new ApiError(0, 'SERVEUR_NON_CONFIGURE', "Adresse du serveur non configurée.");

  const qs = query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''))}` : '';
  const headers = { Accept: 'application/json', 'X-Client-Version': CLIENT_VERSION };
  if (deviceId) headers['X-Device-Id'] = deviceId;
  if (auth && session.token) headers.Authorization = `Bearer ${session.token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${base}/api/v1${path}${qs}`, { method, headers, body: payload, signal: ctrl.signal });
  } catch {
    throw new ApiError(0, 'RESEAU', 'Serveur injoignable.');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return null;
  if (raw && res.ok) return res;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && auth) emit('auth-expired');
    if (res.status === 426) emit('client-obsolete', data);
    throw new ApiError(res.status, data?.code ?? null, data?.message ?? `Erreur ${res.status}`, data?.errors ?? null);
  }
  return data;
}

export const api = {
  get: (p, o) => request('GET', p, o),
  post: (p, body, o) => request('POST', p, { ...o, body }),
  put: (p, body, o) => request('PUT', p, { ...o, body }),
  del: (p, o) => request('DELETE', p, o),
  upload: (p, form, o) => request('POST', p, { ...o, form }),
};

/** Premier message lisible d'une erreur API (validation Laravel comprise). */
export function apiMessage(e) {
  if (e?.errors) {
    const first = Object.values(e.errors).flat()[0];
    if (first) return String(first);
  }
  return e?.message || 'Erreur inconnue.';
}
