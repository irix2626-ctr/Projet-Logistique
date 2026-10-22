import { html, mount, $ } from '../ui/dom.js';
import { openModal, field } from '../ui/modal.js';
import { toast, toastError } from '../ui/toast.js';
import { createList } from '../ui/table.js';
import { readFile } from '../ui/files.js';
import { session } from '../core/session.js';
import { db } from '../core/db.js';
import { fmtDate, fmtMoney, fmtInt, etatLabel } from '../core/format.js';
import { listCategories } from '../services/catalog.js';
import { createLot, listEntrees } from '../services/lots.js';
import { exportListExcel } from '../services/exports.js';
import { requestSync } from '../services/sync.js';
import { lotFields, readLotForm } from './lot-form.js';

export async function render(main) {
  const cats = await listCategories();
  mount(main, html`
    <div class="page-h"><h1>Entrées</h1>
      <div class="btns"><button class="btn btn-pri" id="add">Enregistrer une entrée</button><button class="btn" id="xl">Exporter en Excel</button></div></div>
    <div id="list"></div>`);

  const list = createList($('#list'), {
    noun: 'entrée', searchPlaceholder: 'Rechercher (lot, désignation, fournisseur, opérateur…)', dates: true,
    filter: { label: 'Toutes les catégories', options: cats.map((c) => [c.id, c.nom]) },
    empty: 'Aucune entrée. Utilisez « Enregistrer une entrée » pour créer un lot.',
    columns: [
      { label: 'Date / heure', render: (r) => fmtDate(r.date_entree) },
      { label: 'N° de lot', render: (r) => html`<strong>${r.numero_lot}</strong>${r.est_stock_initial ? html` <span class="tag">Report</span>` : ''}` },
      { label: 'Désignation', key: 'designation' }, { label: 'Catégorie', key: 'categorie' },
      { label: 'Marque / Modèle', key: 'marque_modele' }, { label: 'N° de série', key: 'no_serie_chassis' },
      { label: 'Fournisseur', key: 'fournisseur' }, { label: 'Qté', num: true, render: (r) => fmtInt(r.quantite_initiale) },
      { label: 'Coût total', num: true, render: (r) => fmtMoney(r.cout_total) }, { label: 'Usage', key: 'usage' },
      { label: 'État', render: (r) => html`<span class="tag ${r.etat_fonctionnement === 'fonctionnel' ? 'ok' : 'warn'}">${etatLabel(r.etat_fonctionnement)}</span>` },
      { label: 'Opérateur', key: 'operateur_nom' },
    ],
    load: (p) => listEntrees({ q: p.q, categorieId: p.filter, dateFrom: p.dateFrom, dateTo: p.dateTo, page: p.page, limit: p.limit }),
  });

  $('#add').addEventListener('click', () => entryModal(cats, () => { list.reload(); requestSync(); }));

  $('#xl').addEventListener('click', async () => {
    try {
      const rows = await list.fetchAll();
      const path = await exportListExcel({
        sheet: 'Entrées', module: 'Entrées', filename: 'entrees', rows,
        columns: [
          { header: 'N° de lot', key: 'numero_lot', width: 22 }, { header: 'Date d\'entrée', key: 'date_entree', width: 18, map: (v) => fmtDate(v) },
          { header: 'Désignation', key: 'designation', width: 26 }, { header: 'Catégorie', key: 'categorie', width: 20 },
          { header: 'Marque / Modèle', key: 'marque_modele', width: 20 }, { header: 'N° de série / châssis', key: 'no_serie_chassis', width: 20 },
          { header: 'Fournisseur', key: 'fournisseur', width: 20 }, { header: 'Quantité', key: 'quantite_initiale', width: 12, map: Number },
          { header: 'Coût total', key: 'cout_total', width: 14, fmt: '#,##0', map: Number }, { header: 'Usage', key: 'usage', width: 26 },
          { header: 'État', key: 'etat_fonctionnement', width: 16, map: (v) => etatLabel(v) }, { header: 'Opérateur', key: 'operateur_nom', width: 20 },
        ],
      });
      if (path) toast('Export enregistré et ajouté à l\'historique.');
    } catch (e) { toastError(e); }
  });
}

async function entryModal(cats, done) {
  if (!cats.length) {
    toast('Aucune catégorie : demandez à un administrateur d\'en créer (Paramètres).', 'err');
    return;
  }
  const names = (await db.select('SELECT DISTINCT designation FROM materiels WHERE deleted_at IS NULL ORDER BY designation')).map((r) => r.designation);
  const u = session.user;
  const created = await openModal({
    title: 'Enregistrer une entrée',
    submitLabel: 'Enregistrer l\'entrée',
    body: html`
      <p class="hint">Un lot est créé et ajouté immédiatement au stock. Son numéro est généré automatiquement.</p>
      ${lotFields(cats, names)}
      <div class="grid2">
        ${field('Documents (facultatif)', html`<input class="in" type="file" name="docs" multiple accept=".pdf,image/jpeg,image/png" />`, { span2: true, hint: 'Facture, bon, photo… (PDF ou image).' })}
        ${field('Opérateur (automatique)', html`<input class="in ro" value="${u.nom}" readonly />`)}
        ${field('Date et heure (automatiques)', html`<input class="in ro" value="${fmtDate(new Date().toISOString())}" readonly />`)}
      </div>`,
    onSubmit: async (form) => {
      const files = await Promise.all([...form.elements.docs.files].map(readFile));
      const r = await createLot(readLotForm(form), files);
      toast(`Lot ${r.numero_lot} créé et ajouté au stock.`);
      return r;
    },
  });
  if (created) done();
}
