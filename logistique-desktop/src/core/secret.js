/**
 * Coffre sécurisé du système (SEC-2.17) : le jeton d'API n'est JAMAIS écrit dans SQLite.
 * En production : trousseau Windows via les commandes Rust secret_*. Remplaçable pour les tests.
 */
const tauriStore = {
  async set(key, value) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('secret_set', { key, value });
  },
  async get(key) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('secret_get', { key });
  },
  async delete(key) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('secret_delete', { key });
  },
};

let store = tauriStore;
export const setSecretStore = (s) => {
  store = s;
};

// Repli en mémoire si le trousseau est indisponible : le jeton n'est alors pas conservé après fermeture.
const memory = new Map();

export async function saveSecret(key, value) {
  memory.set(key, value);
  try {
    await store.set(key, value);
  } catch (e) {
    console.warn('Trousseau indisponible, jeton gardé en mémoire seulement.', e);
  }
}

export async function loadSecret(key) {
  try {
    const v = await store.get(key);
    if (v) return v;
  } catch {
    /* repli mémoire */
  }
  return memory.get(key) ?? null;
}

export async function removeSecret(key) {
  memory.delete(key);
  try {
    await store.delete(key);
  } catch {
    /* ignoré */
  }
}
