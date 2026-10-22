import { html, mount, $, $$ } from '../ui/dom.js';
import { openModal, field, val } from '../ui/modal.js';
import { toast, toastError } from '../ui/toast.js';
import { iconSvg } from '../ui/icons.js';
import { isAdmin } from '../core/session.js';
import { fmtDate, fmtMoney, fmtInt } from '../core/format.js';
import { listCategories } from '../services/catalog.js';
import { summary } from '../services/dashboard.js';
import { exportWorkbook, exportDashboardPdf, exportDashboardWord } from '../services/exports.js';
import { archiveAfterExport, ensureSynced, isStaleDevicesError } from '../services/admin.js';
import { runOnce } from '../services/sync.js';

export async function render(main, { navigate }) {
  const s = await summary();
  mount(main, html`
    <div class="page-h"><h1>Dashboard</h1>
      <div class="btns">
        <button class="btn" data-x="excel">Exporter en Excel</button><button class="btn" data-x="pdf">PDF</button><button class="btn" data-x="word">Word</button>
        ${isAdmin() ? html`<button class="btn btn-danger" data-x="archive">Exporter et archiver…</button>` : ''}
      </div></div>
    <section class="dash-top card price">
      <div class="sub">Valeur totale du stock</div><div class="big">${fmtMoney(s.valeur_totale_stock)}</div>
      <div class="sub">Somme des coûts totaux des lots en stock, au prorata de ce qui reste dans chaque lot.</div></section>
    <section><h2>Stock par catégorie</h2>
      <div class="cat-grid" style="margin-top:10px">
        ${s.categories.length ? s.categories.map((c, i) => html`
          <button class="cat" type="button" data-cat="${c.id ?? ''}" style="--hue:var(--h${i % 8})">
            <span class="cat-ic">${iconSvg(c.icone)}</span><span class="cat-n">${c.nom}</span>
            <span class="cat-s"><span>Quantité</span><b>${fmtInt(c.quantite_totale)}</b></span>
            <span class="cat-s"><span>Articles</span><b>${fmtInt(c.nombre_articles)}</b></span></button>`)
          : html`<p class="muted">Aucun matériel en stock.</p>`}
      </div></section>
    <section><h2>État des machines</h2>
      <p style="margin-top:8px"><span class="tag ok">Fonctionnelles : ${fmtInt(s.etat_machines.fonctionnel)}</span>
        <span class="tag warn">Non fonctionnelles : ${fmtInt(s.etat_machines.non_fonctionnel)}</span></p></section>
    <section><h2>100 derniers mouvements</h2>
      <div class="table-wrap short" style="margin-top:10px"><table><thead><tr>
        <th>Date / heure</th><th>Type</th><th>N° de lot</th><th>Désignation</th><th>Catégorie</th><th class="num">Qté</th><th>PR / SR</th><th>Opérateur</th></tr></thead><tbody>
        ${s.derniers_mouvements.length ? s.derniers_mouvements.map((m) => html`<tr><td>${fmtDate(m.date)}</td>
          <td><span class="tag ${m.type === 'entree' ? 'ok' : ''}">${m.type === 'entree' ? 'Entrée' : 'Sortie'}</span></td>
          <td>${m.numero_lot}</td><td>${m.designation}</td><td>${m.categorie}</td><td class="num">${fmtInt(m.quantite)}</td><td>${m.pr_sr ?? ''}</td><td>${m.operateur}</td></tr>`)
          : html`<tr><td class="empty" colspan="8">Aucun mouvement pour le moment.</td></tr>`}
      </tbody></table></div></section>`);

  $$('[data-cat]', main).forEach((b) => b.addEventListener('click', () => navigate('stockage', { categorieId: b.dataset.cat })));
  $$('[data-x]', main).forEach((b) => b.addEventListener('click', () => handleExport(b.dataset.x, navigate).catch(toastError)));
}

async function filtersModal(title, submitLabel) {
  const cats = await listCategories();
  return openModal({
    title, submitLabel,
    body: html`<p class="hint">Les filtres choisis s'appliquent à toutes les feuilles de l'export. Laissez vide pour tout exporter.</p>
      <div class="grid2">
        ${field('Du', html`<input class="in" type="date" name="from" />`)}${field('Au', html`<input class="in" type="date" name="to" />`)}
        ${field('Catégorie', html`<select class="in" name="cat"><option value="">Toutes les catégories</option>${cats.map((c) => html`<option value="${c.id}">${c.nom}</option>`)}</select>`, { span2: true })}
      </div>`,
    onSubmit: (form) => ({ dateFrom: val(form, 'from'), dateTo: val(form, 'to'), categorieId: val(form, 'cat') }),
  });
}

async function handleExport(kind, navigate) {
  if (kind === 'archive') return archiveFlow(navigate);
  const f = await filtersModal(`Exporter en ${kind === 'excel' ? 'Excel' : kind === 'pdf' ? 'PDF' : 'Word'}`, 'Exporter');
  if (!f) return;
  const run = kind === 'excel' ? exportWorkbook : kind === 'pdf' ? exportDashboardPdf : exportDashboardWord;
  if (await run(f)) toast('Export enregistré et ajouté à l\'historique.');
}

/** Export Excel complet PUIS archivage : le stock restant est reporté, l'interface repart à zéro. */
async function archiveFlow(navigate) {
  const done = await openModal({
    title: 'Exporter et archiver', submitLabel: 'Exporter puis archiver', danger: true,
    body: html`
      <p>Cette opération :</p>
      <ol class="steps">
        <li>synchronise ce poste avec le serveur ;</li>
        <li>exporte <strong>toutes</strong> les données en Excel (vous choisissez l'emplacement) ;</li>
        <li>archive les lots, sorties et documents, puis <strong>reporte le stock restant</strong> sous forme de lots « stock initial » reliés à leur lot d'origine.</li>
      </ol>
      <p class="hint">Rien n'est supprimé physiquement : les données archivées sont seulement masquées. Opération en ligne uniquement.</p>
      ${field('Votre mot de passe (obligatoire)', html`<input class="in" type="password" name="pw" autocomplete="current-password" required />`)}`,
    onSubmit: async (form) => {
      const pw = val(form, 'pw');
      if (!pw) throw new Error('Le mot de passe est obligatoire.');
      await ensureSynced();
      const saved = await exportWorkbook({});
      if (!saved) throw new Error("Export annulé : l'archivage n'a pas été effectué.");
      let r;
      try {
        r = await archiveAfterExport(pw);
      } catch (e) {
        if (!isStaleDevicesError(e)) throw e;
        if (!window.confirm(`${e.message}\n\nContinuer quand même ?`)) throw new Error('Archivage annulé.');
        r = await archiveAfterExport(pw, { force: true });
      }
      return r;
    },
  });
  if (done && done !== true) {
    toast(`Archivage terminé : ${done.lots_reportes} lot(s) reporté(s), valeur du stock conservée.`);
    await runOnce();
    navigate('dashboard');
  }
}
