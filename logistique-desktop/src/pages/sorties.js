import { html, mount, $ } from '../ui/dom.js';
import { toast, toastError } from '../ui/toast.js';
import { createList, btn } from '../ui/table.js';
import { fmtDate, fmtInt, etatLabel } from '../core/format.js';
import { listSorties } from '../services/sorties.js';
import { exportBonSortie, exportListExcel } from '../services/exports.js';
import { requestSync } from '../services/sync.js';
import { openSortieModal } from './sortie-form.js';

/** Registre des sorties : LECTURE SEULE (ni modification, ni suppression). */
export async function render(main) {
  mount(main, html`
    <div class="page-h"><h1>Sorties</h1>
      <div class="btns"><button class="btn btn-pri" id="out">Sortir</button><button class="btn" id="xl">Exporter en Excel</button></div></div>
    <p class="banner">Le registre des sorties est en lecture seule : une sortie ne se modifie ni ne se supprime.</p>
    <div id="list"></div>`);

  const list = createList($('#list'), {
    noun: 'sortie', dates: true, searchPlaceholder: 'Rechercher (lot, bénéficiaire, PR/SR, opérateur…)',
    empty: 'Aucune sortie enregistrée.',
    columns: [
      { label: 'Date / heure', render: (r) => fmtDate(r.date_sortie) },
      { label: 'N° de lot', render: (r) => html`<strong>${r.numero_lot}</strong>${r.conflit_stock ? html` <span class="tag bad" title="Dépassement de stock signalé à la synchronisation">Conflit</span>` : ''}` },
      { label: 'Désignation', key: 'designation' }, { label: 'Qté', num: true, render: (r) => fmtInt(r.quantite) },
      { label: 'Bénéficiaire', key: 'nom_beneficiaire' }, { label: 'Contact', key: 'contact_beneficiaire' }, { label: 'Fonction', key: 'fonction' },
      { label: 'PR / SR', key: 'pr_sr' }, { label: 'Usage', key: 'usage' },
      { label: 'État', render: (r) => etatLabel(r.etat_fonctionnement) }, { label: 'Opérateur', key: 'operateur_nom' },
      { label: 'Signature', render: (r) => (r.signee ? html`<span class="tag ok">Signée</span>` : html`<span class="tag warn">Non signée</span>`) },
    ],
    actions: () => btn('bon', 'Bon de sortie (PDF)'),
    onAction: async (a, row, b) => {
      if (a !== 'bon') return;
      b.disabled = true;
      try {
        if (await exportBonSortie(row.id)) toast('Bon de sortie enregistré et ajouté à l\'historique.');
      } catch (e) { toastError(e); } finally { b.disabled = false; }
    },
    load: (p) => listSorties({ q: p.q, dateFrom: p.dateFrom, dateTo: p.dateTo, page: p.page, limit: p.limit }),
  });

  $('#out').addEventListener('click', async () => {
    if (await openSortieModal()) { list.reload(); requestSync(); }
  });

  $('#xl').addEventListener('click', async () => {
    try {
      const rows = await list.fetchAll();
      const path = await exportListExcel({
        sheet: 'Sorties', module: 'Sorties', filename: 'sorties', rows,
        columns: [
          { header: 'Date / heure', key: 'date_sortie', width: 18, map: (v) => fmtDate(v) }, { header: 'N° de lot', key: 'numero_lot', width: 22 },
          { header: 'Désignation', key: 'designation', width: 26 }, { header: 'Quantité', key: 'quantite', width: 10, map: Number },
          { header: 'Bénéficiaire', key: 'nom_beneficiaire', width: 22 }, { header: 'Contact', key: 'contact_beneficiaire', width: 18 },
          { header: 'Fonction', key: 'fonction', width: 20 }, { header: 'PR / SR', key: 'pr_sr', width: 12 }, { header: 'Usage', key: 'usage', width: 26 },
          { header: 'État', key: 'etat_fonctionnement', width: 16, map: (v) => etatLabel(v) }, { header: 'Opérateur', key: 'operateur_nom', width: 20 },
        ],
      });
      if (path) toast('Export enregistré et ajouté à l\'historique.');
    } catch (e) { toastError(e); }
  });
}
