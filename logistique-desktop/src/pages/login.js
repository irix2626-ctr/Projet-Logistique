import { html, mount, $ } from '../ui/dom.js';
import { openModal, field, val } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { getKv } from '../core/db.js';
import { session } from '../core/session.js';
import { listStructures } from '../services/catalog.js';
import { login, logout, changePassword } from '../services/auth.js';
import { loadStructuresOnline, pingServer, saveServerSettings } from '../services/admin.js';
import { ensureDevice } from '../services/sync.js';

/** Configuration du serveur et du nom du poste (premier lancement ou depuis l'écran de connexion). */
export async function serverSettings({ firstRun = false } = {}) {
  const url = (await getKv('server_url')) || 'https://logistique-api.test';
  const name = (await getKv('device_name')) || 'Poste 1';
  return openModal({
    title: firstRun ? 'Configuration du poste' : 'Serveur et poste',
    body: html`
      ${firstRun ? html`<p class="hint">Renseignez l'adresse du serveur fournie par votre administrateur. Cette configuration n'est demandée qu'une fois.</p>` : ''}
      ${field('Adresse du serveur', html`<input class="in" name="url" type="url" value="${url}" placeholder="https://api.votre-domaine.example" required />`)}
      ${field('Nom de ce poste', html`<input class="in" name="name" value="${name}" maxlength="100" required />`, { hint: 'Exemple : « Magasin central – PC 1 ».' })}
      <div><button type="button" class="btn" id="ping">Tester la connexion</button> <span class="hint" id="ping-res"></span></div>`,
    submitLabel: 'Enregistrer',
    onOpen: (dlg, form) => {
      dlg.querySelector('#ping').addEventListener('click', async () => {
        const out = dlg.querySelector('#ping-res');
        out.textContent = 'Test en cours…';
        try {
          const r = await pingServer(val(form, 'url'));
          out.textContent = `Connexion réussie (API ${r.api_version}).`;
        } catch (e) {
          out.textContent = e.message;
        }
      });
    },
    onSubmit: async (form) => {
      await saveServerSettings({ url: val(form, 'url'), deviceName: val(form, 'name') });
      toast('Configuration enregistrée.');
    },
  });
}

async function forcePasswordChange() {
  const ok = await openModal({
    title: 'Choisissez un nouveau mot de passe',
    body: html`<p>Votre compte a été créé par un administrateur : un nouveau mot de passe personnel est obligatoire.</p>
      ${field('Mot de passe actuel', html`<input class="in" type="password" name="cur" autocomplete="current-password" required />`)}
      ${field('Nouveau mot de passe', html`<input class="in" type="password" name="new" autocomplete="new-password" minlength="10" required />`, { hint: '10 caractères minimum, avec des lettres et des chiffres.' })}
      ${field('Confirmer', html`<input class="in" type="password" name="new2" autocomplete="new-password" required />`)}`,
    submitLabel: 'Changer le mot de passe',
    cancelLabel: 'Me déconnecter',
    onSubmit: async (form) => {
      if (val(form, 'new') !== val(form, 'new2')) throw new Error('Les deux mots de passe ne sont pas identiques.');
      await changePassword(val(form, 'cur'), val(form, 'new'));
    },
  });
  if (!ok) {
    await logout();
    return false;
  }
  toast('Mot de passe modifié.');
  return true;
}

export async function renderLogin(root, { onLoggedIn }) {
  if (!(await getKv('server_url'))) await serverSettings({ firstRun: true });

  const online = await loadStructuresOnline();
  const structures = await listStructures();

  mount(root, html`
    <div class="login">
      <section class="login-art">
        <div class="brand"><i></i>Logistique</div>
        <h1>Le matériel, tracé du lot jusqu'à la sortie.</h1>
        <p>Entrées, sorties et stock des ressources matérielles, avec le coût de chaque lot et son usage. Fonctionne sans connexion et se synchronise ensuite.</p>
        <ul>${['PNLP', 'PNLT', 'PNLS', 'UCP-FM'].map((p) => html`<li>${p}</li>`)}</ul>
      </section>
      <section class="login-form">
        <form id="lf" novalidate>
          <h2>Connexion</h2>
          ${online ? '' : html`<p class="banner warn" role="status">Serveur injoignable : seuls les comptes déjà connectés en ligne sur ce poste peuvent se connecter.</p>`}
          ${field('Structure', html`<select class="in" name="structure" required>
            <option value="">— Choisir —</option>
            ${structures.map((s) => html`<option value="${s.id}">${s.nom}</option>`)}
          </select>`)}
          ${field('Identifiant ou e-mail', html`<input class="in" name="id" autocomplete="username" required />`)}
          ${field('Mot de passe', html`<input class="in" name="pw" type="password" autocomplete="current-password" required />`)}
          <p class="err" id="lerr" role="alert" hidden></p>
          <button class="btn btn-pri btn-lg" type="submit">Se connecter</button>
          <p class="hint">Serveur : <button type="button" class="linkbtn" id="srv" style="background:none;border:0;padding:0;color:var(--pri);text-decoration:underline;cursor:pointer;font:inherit">modifier</button></p>
        </form>
      </section>
    </div>`);

  const last = await getKv('last_structure');
  const sel = $('select[name=structure]');
  if (last && structures.some((s) => s.id === last)) sel.value = last;
  else if (structures.length === 1) sel.value = structures[0].id;

  $('#srv').addEventListener('click', async () => {
    await serverSettings();
    renderLogin(root, { onLoggedIn });
  });

  $('#lf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#lerr');
    const btn = $('button[type=submit]');
    err.hidden = true;
    btn.disabled = true;
    try {
      await login({ structureId: val(e.target, 'structure'), identifiant: val(e.target, 'id'), password: val(e.target, 'pw') });
      const { setKv } = await import('../core/db.js');
      await setKv('last_structure', session.user.structure_id);
      if (session.user.must_change_password && !(await forcePasswordChange())) return renderLogin(root, { onLoggedIn });
      if (session.online) await ensureDevice().catch(() => {});
      onLoggedIn();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
}
