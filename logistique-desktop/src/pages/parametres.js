import { html, mount, $ } from '../ui/dom.js';
import { openModal, confirmModal, field, val } from '../ui/modal.js';
import { toast, toastError } from '../ui/toast.js';
import { iconSvg } from '../ui/icons.js';
import { getKv } from '../core/db.js';
import { session } from '../core/session.js';
import { uuid } from '../core/uuid.js';
import { fmtDate } from '../core/format.js';
import { listCategories, saveCategorie } from '../services/catalog.js';
import { accounts, isStaleDevicesError, listConflicts, resetApplication, resolveConflict } from '../services/admin.js';
import { discardRejected, listRejected, markConflictsSeen, requestSync, retryRejected, runOnce, syncState } from '../services/sync.js';
import { serverSettings } from './login.js';

/** Paramètres (administrateur) : comptes, catégories, synchronisation, réinitialisation. */
export async function render(main, { navigate }) {
  mount(main, html`
    <div class="page-h"><h1>Paramètres</h1></div>
    <section class="card" id="sec-comptes"></section>
    <section class="card" id="sec-cats"></section>
    <section class="card danger-zone" id="sec-reset"></section>`);

  await Promise.all([comptes(), categories()]);
  reset(navigate);
}

// ------------------------------------------------------------------ comptes
async function comptes() {
  const el = $('#sec-comptes');
  mount(el, html`<h2>Comptes</h2><p class="hint">Les comptes sont créés uniquement par un administrateur, dans votre structure (${session.user.structure_nom}). Cette section nécessite le serveur.</p><div id="acc"><p class="muted">Chargement…</p></div>`);
  const box = $('#acc');
  let list;
  try {
    list = await accounts.list();
  } catch (e) {
    mount(box, html`<p class="muted">${e.message}</p>`);
    return;
  }
  mount(box, html`
    <div><button class="btn btn-pri" id="acc-new">Créer un compte</button></div>
    <div class="table-wrap short"><table><thead><tr><th>Nom</th><th>Identifiant</th><th>Rôle</th><th>Actions</th></tr></thead><tbody>
      ${list.map((u) => html`<tr><td>${u.nom}</td><td>${u.email}</td><td><span class="tag">${u.role === 'admin' ? 'Administrateur' : 'Personnel'}</span></td>
        <td><div class="row-actions"><button class="btn btn-sm" data-edit="${u.id}">Modifier</button><button class="btn btn-sm" data-del="${u.id}">Supprimer</button></div></td></tr>`)}</tbody></table></div>`);

  const form = (u = null) => html`
    <div class="grid2">
      ${field('Nom complet', html`<input class="in" name="nom" value="${u?.nom ?? ''}" required />`)}
      ${field('Identifiant ou e-mail', html`<input class="in" name="email" value="${u?.email ?? ''}" required />`)}
      ${field(u ? 'Nouveau mot de passe (laisser vide pour ne pas changer)' : 'Mot de passe initial', html`<input class="in" type="password" name="pw" autocomplete="new-password" ${u ? '' : 'required'} minlength="10" />`, { hint: "10 caractères minimum, lettres et chiffres. L'utilisateur devra le changer à sa première connexion." })}
      ${field('Rôle', html`<select class="in" name="role"><option value="personnel" ${u?.role !== 'admin' ? 'selected' : ''}>Personnel</option><option value="admin" ${u?.role === 'admin' ? 'selected' : ''}>Administrateur</option></select>`)}
      ${field('Structure', html`<input class="in ro" value="${session.user.structure_nom}" readonly />`)}
    </div>`;

  $('#acc-new').addEventListener('click', async () => {
    const ok = await openModal({
      title: 'Créer un compte', body: form(), submitLabel: 'Créer le compte',
      onSubmit: async (f) => {
        await accounts.create({ id: uuid(), nom: val(f, 'nom'), email: val(f, 'email'), mot_de_passe: val(f, 'pw'), role: val(f, 'role') });
        toast('Compte créé.');
      },
    });
    if (ok) comptes();
  });
  box.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
    const u = list.find((x) => x.id === b.dataset.edit);
    const ok = await openModal({
      title: `Modifier ${u.nom}`, body: form(u), submitLabel: 'Enregistrer',
      onSubmit: async (f) => {
        const body = { nom: val(f, 'nom'), email: val(f, 'email'), role: val(f, 'role') };
        if (val(f, 'pw')) body.mot_de_passe = val(f, 'pw');
        await accounts.update(u.id, body);
        toast('Compte modifié.');
      },
    });
    if (ok) comptes();
  }));
  box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const u = list.find((x) => x.id === b.dataset.del);
    if (!(await confirmModal('Supprimer ce compte ?', `${u.nom} ne pourra plus se connecter. Ses opérations passées restent conservées.`, 'Supprimer'))) return;
    try {
      await accounts.remove(u.id);
      toast('Compte supprimé.');
      comptes();
    } catch (e) { toastError(e); }
  }));
}

// ------------------------------------------------------------------ catégories
async function categories() {
  const el = $('#sec-cats');
  const list = await listCategories();
  mount(el, html`
    <h2>Catégories</h2>
    <p class="hint">Les catégories regroupent le matériel et alimentent les cartes du Dashboard. Icône : nom d'une icône Lucide (car, laptop, armchair, stethoscope…).</p>
    <div><button class="btn btn-pri" id="cat-new">Ajouter une catégorie</button></div>
    <div class="table-wrap short"><table><thead><tr><th>Icône</th><th>Nom</th><th>Couleur</th><th>Action</th></tr></thead><tbody>
      ${list.map((c) => html`<tr><td>${iconSvg(c.icone, 20)}</td><td>${c.nom}</td>
        <td>${c.couleur_fond ? html`<span class="tag" style="background:${c.couleur_fond}">${c.couleur_fond}</span>` : ''}</td>
        <td><button class="btn btn-sm" data-cat="${c.id}">Modifier</button></td></tr>`)}</tbody></table></div>`);

  const modal = async (c = null) => {
    const ok = await openModal({
      title: c ? 'Modifier la catégorie' : 'Nouvelle catégorie', submitLabel: 'Enregistrer',
      body: html`<div class="grid2">
        ${field('Nom', html`<input class="in" name="nom" value="${c?.nom ?? ''}" required />`, { span2: true })}
        ${field('Couleur pastel', html`<input class="in" type="color" name="couleur" value="${c?.couleur_fond ?? '#E3F2FD'}" />`)}</div>`,
      onSubmit: async (f) => { await saveCategorie({ id: c?.id, nom: val(f, 'nom'), icone: 'package', couleur_fond: val(f, 'couleur') }); toast('Catégorie enregistrée.'); },
    });
    if (ok) { categories(); requestSync(); }
  };
  $('#cat-new').addEventListener('click', () => modal().catch(toastError));
  el.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => modal(list.find((x) => x.id === b.dataset.cat)).catch(toastError)));
}

// ------------------------------------------------------------------ réinitialisation
function reset(navigate) {
  const el = $('#sec-reset');
  mount(el, html`
    <h2>Réinitialisation de l'application</h2>
    <p>Archive toutes les données (elles sont masquées, jamais supprimées physiquement) et fait repartir l'interface à zéro. Le stock restant est reporté sous forme de lots « stock initial ».
      <strong>Pensez à exporter vos données avant</strong> (Dashboard &gt; Exporter et archiver).</p>
    <div><button class="btn btn-danger" id="reset">Réinitialiser l'application…</button></div>`);
  $('#reset').addEventListener('click', async () => {
    const r = await openModal({
      title: 'Confirmer la réinitialisation', submitLabel: 'Réinitialiser', danger: true,
      body: html`<p class="err">Cette action concerne tous les postes. Elle nécessite le serveur.</p>
        ${field('Votre mot de passe (obligatoire)', html`<input class="in" type="password" name="pw" autocomplete="current-password" required />`)}`,
      onSubmit: async (f) => {
        const pw = val(f, 'pw');
        if (!pw) throw new Error('Le mot de passe est obligatoire.');
        try {
          return await resetApplication(pw);
        } catch (e) {
          if (!isStaleDevicesError(e)) throw e;
          if (!window.confirm(`${e.message}\n\nContinuer quand même ?`)) throw new Error('Réinitialisation annulée.');
          return resetApplication(pw, { force: true });
        }
      },
    });
    if (r && r !== true) {
      toast(`Application réinitialisée : ${r.lots_reportes} lot(s) reporté(s).`);
      navigate('dashboard');
    }
  });
}
