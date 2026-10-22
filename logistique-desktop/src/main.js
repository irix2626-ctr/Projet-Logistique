import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import './styles/app.css';

import { setDb, getKv } from './core/db.js';
import { tauriDb } from './core/db-tauri.js';
import { on } from './core/events.js';
import { setBaseUrl, setDeviceId } from './services/api.js';
import { html, mount } from './ui/dom.js';
import { toast } from './ui/toast.js';
import { isTauri } from './ui/files.js';
import { showApp } from './app.js';
import { renderLogin } from './pages/login.js';

const root = document.getElementById('root');

async function showLogin() {
  location.hash = '';
  await renderLogin(root, { onLoggedIn: () => showApp(root, { loggedOut: showLogin }) });
}

async function start() {
  if (!isTauri()) {
    mount(root, html`<div style="max-width:560px;margin:12vh auto;padding:0 20px">
      <h1>Application desktop</h1>
      <p>Cette application utilise une base SQLite locale gérée par Tauri : elle ne peut pas fonctionner dans un navigateur seul.</p>
      <p>Lancez-la avec : <code>npm run tauri dev</code></p></div>`);
    return;
  }
  setDb(tauriDb);
  setBaseUrl((await getKv('server_url')) || '');
  setDeviceId(await getKv('device_id'));

  on('auth-expired', () => toast('Session serveur expirée : reconnectez-vous (bouton dans le menu) pour synchroniser.', 'err'));
  on('client-obsolete', (d) => toast(d?.message || "Mise à jour de l'application obligatoire.", 'err'));

  await showLogin();
}

start().catch((e) => {
  console.error(e);
  mount(root, html`<div style="max-width:560px;margin:12vh auto;padding:0 20px"><h1>Démarrage impossible</h1><p class="err">${e.message || e}</p></div>`);
});
