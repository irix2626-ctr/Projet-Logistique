import { html, mount, $ } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { toast, toastError } from '../ui/toast.js';
import { createList } from '../ui/table.js';
import { fmtDate, fmtInt, fmtMoney, etatLabel } from '../core/format.js';
import { cycleLot, journal, journalComplet } from '../services/trace.js';
import { db } from '../core/db.js';
import { exportListExcel, exportListPdf } from '../services/exports.js';

const COLS = [
  { header: 'Date / heure', key: 'date', width: 18, map: (v) => fmtDate(v) },
  { header: 'Type', key: 'type', width: 10, map: (v) => (v === 'entree' ? 'Entrée' : 'Sortie') },
  { header: 'N° de lot', key: 'numero_lot', width: 22 }, { header: 'Désignation', key: 'designation', width: 26 },
  { header: 'Catégorie', key: 'categorie', width: 18 }, { header: 'Quantité', key: 'quantite', width: 10, map: Number },
  { header: 'PR / SR', key: 'pr_sr', width: 12 }, { header: 'Bénéficiaire', key: 'beneficiaire', width: 22 }, { header: 'Opérateur', key: 'operateur', width: 20 },
];

export async function render(main) {
  mount(main, html`
    <div class="page-h"><h1>Traçabilité</h1>
      <div class="btns"><button class="btn" id="xl">Exporter en Excel</button><button class="btn" id="pdf">Exporter en PDF</button></div></div>
    <p class="banner">Journal unifié des entrées et des sorties. Cliquez sur un numéro de lot pour voir son cycle de vie.</p>
    <div id="list"></div>`);

  const list = createList($('#list'), {
    noun: 'mouvement', dates: true, searchPlaceholder: 'Rechercher (lot, matériel, catégorie, PR/SR, opérateur, bénéficiaire…)',
    filter: { label: 'Entrées et sorties', options: [['entree', 'Entrées'], ['sortie', 'Sorties']] },
    empty: 'Aucun mouvement.',
    columns: [
      { label: 'Date / heure', render: (r) => fmtDate(r.date) },
      { label: 'Type', render: (r) => html`<span class="tag ${r.type === 'entree' ? 'ok' : ''}">${r.type === 'entree' ? 'Entrée' : 'Sortie'}</span>` },
      { label: 'N° de lot', render: (r) => html`<button class="btn btn-sm" data-lot="${r.numero_lot}">${r.numero_lot}</button>` },
      { label: 'Désignation', key: 'designation' }, { label: 'Catégorie', key: 'categorie' },
      { label: 'Qté', num: true, render: (r) => fmtInt(r.quantite) }, { label: 'PR / SR', key: 'pr_sr' },
      { label: 'Bénéficiaire', key: 'beneficiaire' }, { label: 'Opérateur', key: 'operateur' },
    ],
    load: (p) => journal({ q: p.q, type: p.filter, dateFrom: p.dateFrom, dateTo: p.dateTo }, { page: p.page, limit: p.limit }),
  });

  $('#list').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-lot]');
    if (!b) return;
    const lot = await db.select('SELECT id FROM lots WHERE numero_lot = ?', [b.dataset.lot]);
    if (lot[0]) lifeModal(lot[0].id).catch(toastError);
  });

  const filtered = () => journalComplet({ q: list.state.q, type: list.state.filter, dateFrom: list.state.dateFrom, dateTo: list.state.dateTo });

  $('#xl').addEventListener('click', async () => {
    try {
      const path = await exportListExcel({ sheet: 'Traçabilité', columns: COLS, rows: await filtered(), module: 'Traçabilité', filename: 'tracabilite' });
      if (path) toast('Export enregistré et ajouté à l\'historique.');
    } catch (e) { toastError(e); }
  });
  $('#pdf').addEventListener('click', async () => {
    try {
      const path = await exportListPdf({
        title: 'Traçabilité des lots', columns: COLS.map((c) => ({ ...c, header: c.header })), rows: await filtered(), module: 'Traçabilité', filename: 'tracabilite',
      });
      if (path) toast('Export enregistré et ajouté à l\'historique.');
    } catch (e) { toastError(e); }
  });
}

/** Cycle de vie d'un lot : arrivage -> sorties successives -> reste. */
async function lifeModal(lotId) {
  const c = await cycleLot(lotId);
  if (!c) return;
  const l = c.lot;
  await openModal({
    title: `Cycle de vie du lot ${l.numero_lot}`, hideSubmit: true, cancelLabel: 'Fermer',
    body: html`
      <dl class="kv">
        <dt>Matériel</dt><dd>${l.designation}${l.marque_modele ? ` — ${l.marque_modele}` : ''}</dd>
        <dt>Catégorie</dt><dd>${l.categorie || ''}</dd><dt>Fournisseur</dt><dd>${l.fournisseur}</dd>
        <dt>Usage prévu</dt><dd>${l.usage || ''}</dd><dt>Coût total du lot</dt><dd>${fmtMoney(l.cout_total)}</dd>
        <dt>Valeur restante</dt><dd>${fmtMoney(l.valeur)}</dd>
      </dl>
      <ul class="cycle">
        <li><span></span><div><strong>Arrivage</strong> — ${fmtDate(l.date_entree)}<br />${fmtInt(l.quantite_initiale)} reçus · opérateur ${l.operateur_nom || '—'} · ${etatLabel(l.etat_fonctionnement)}</div></li>
        ${c.sorties.map((s) => html`<li class="out"><span></span><div><strong>Sortie de ${fmtInt(s.quantite)}</strong> — ${fmtDate(s.date_sortie)}<br />${s.nom_beneficiaire}${s.fonction ? ` (${s.fonction})` : ''} · ${s.pr_sr} · ${s.operateur_nom || '—'}${s.conflit_stock ? html` <span class="tag bad">Conflit</span>` : ''}</div></li>`)}
        <li class="end"><span></span><div><strong>Reste : ${fmtInt(c.reste)}</strong> sur ${fmtInt(l.quantite_initiale)} (${fmtInt(c.total_sorti)} sorti)</div></li>
      </ul>`,
  });
}
