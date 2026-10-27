import { html, mount, $, $$ } from './ui/dom.js';
import { openModal, field, val } from './ui/modal.js';
import { toast, toastError } from './ui/toast.js';
import { session, isAdmin } from './core/session.js';
import { on } from './core/events.js';

import { logout, reauth } from './services/auth.js';
import { syncState, runOnce, startAutoSync, stopAutoSync, refreshCounts } from './services/sync.js';

const PAGES = {
  dashboard: () => import('./pages/dashboard.js'),
  entrees: () => import('./pages/entrees.js'),
  stockage: () => import('./pages/stockage.js'),
  sorties: () => import('./pages/sorties.js'),
  tracabilite: () => import('./pages/tracabilite.js'),
  historique: () => import('./pages/historique.js'),
  parametres: () => import('./pages/parametres.js'),
};

const NAV = [
  ['dashboard', 'Dashboard'], ['entrees', 'Entrées'], ['stockage', 'Stockage'], ['sorties', 'Sorties'],
  ['tracabilite', 'Traçabilité'], ['historique', 'Historique des exports'], ['parametres', 'Paramètres', true],
];



let currentPage = 'dashboard';
let pageParams = {};
let onLoggedOut = () => {};
let offSync = null;

const pageFromHash = () => {
  const p = location.hash.replace(/^#\//, '');
  return PAGES[p] && (p !== 'parametres' || isAdmin()) ? p : 'dashboard';
};

export function navigate(page, params = {}) {
  pageParams = params;
  if (location.hash === `#/${page}`) renderPage();
  else location.hash = `#/${page}`;
}

async function renderPage() {
  currentPage = pageFromHash();
  const main = $('#main');
  if (!main) return;
  $$('.nav button').forEach((b) => (b.getAttribute('data-page') === currentPage ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  $('#side')?.classList.remove('open');
  mount(main, html`<p class="muted">Chargement…</p>`);
  try {
    const mod = await PAGES[currentPage]();
    const params = pageParams;
    pageParams = {};
    await mod.render(main, { navigate, params });
    main.focus();
  } catch (e) {
    console.error(e);
    mount(main, html`<div class="card"><h2>Erreur d'affichage</h2><p class="err">${e.message}</p></div>`);
  }
}



async function reconnect() {
  await openModal({
    title: 'Reconnexion au serveur',
    body: html`<p>Votre session serveur a expiré. Saisissez votre mot de passe : vos données locales et vos opérations en attente sont conservées.</p>
      ${field('Mot de passe', html`<input class="in" type="password" name="pw" autocomplete="current-password" required />`)}`,
    submitLabel: 'Se reconnecter',
    onSubmit: async (form) => {
      await reauth(val(form, 'pw'));
      toast('Reconnecté au serveur.');
      runOnce();
    },
  });
}

/** Affiche l'application (menu + page) pour l'utilisateur connecté. */
export function showApp(root, { loggedOut }) {
  onLoggedOut = loggedOut;
  const u = session.user;
  mount(root, html`
    <div class="app">
      <header class="topbar"><button class="icon-btn" id="burger" aria-label="Menu">☰</button><span class="brand"><i></i>Logistique</span></header>
      <aside class="side" id="side">
        <div class="brand"><i></i><span>Logistique</span></div>
        <nav class="nav" aria-label="Navigation principale">
          ${NAV.filter((n) => !n[2] || isAdmin()).map(([id, label]) => html`<button type="button" data-page="${id}">${label}</button>`)}
        </nav>
        <div class="me">
          <div><strong>${u.nom}</strong><br /><span>${u.structure_nom} · ${u.role === 'admin' ? 'Administrateur' : 'Personnel'}</span></div>
          <button class="btn" id="logout" type="button">Déconnexion</button>
        </div>
      </aside>
      <main id="main" tabindex="-1"></main>
    </div>`);

  $('#burger').addEventListener('click', () => $('#side').classList.toggle('open'));
  $$('.nav button').forEach((b) => b.addEventListener('click', () => navigate(b.dataset.page)));
  $('#logout').addEventListener('click', async () => {
    stopAutoSync();
    offSync?.();
    window.removeEventListener('hashchange', renderPage);
    await logout();
    onLoggedOut();
  });
  offSync?.();
  window.addEventListener('hashchange', renderPage);
  refreshCounts();
  startAutoSync();
  renderPage();
}
