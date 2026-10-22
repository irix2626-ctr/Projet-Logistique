import { html, mount, $ } from '../ui/dom.js';
import { openModal, confirmModal } from '../ui/modal.js';
import { toast, toastError } from '../ui/toast.js';
import { createList, btn } from '../ui/table.js';
import { db } from '../core/db.js';
import { fmtDate, fmtMoney, fmtInt, etatLabel } from '../core/format.js';
import { listCategories } from '../services/catalog.js';
import { deleteLot, updateLot } from '../services/lots.js';
import { getLot, listStock } from '../services/stock.js';
import { requestSync } from '../services/sync.js';
import { lotFields, readLotForm } from './lot-form.js';
import { openSortieModal } from './sortie-form.js';

export async function render(main, { params = {} } = {}) {
  const cats = await listCategories();
  mount(main, html`<div class="page-h"><h1>Stockage</h1></div>
    <p class="banner">Lots disponibles (quantité restante supérieure à 0), du plus ancien au plus récent.</p><div id="list"></div>`);

  const list = createList($('#list'), {
    noun: 'lot', searchPlaceholder: 'Rechercher (lot, désignation, série, fournisseur…)', initialFilter: params.categorieId || '',
    filter: { label: 'Toutes les catégories', options: cats.map((c) => [c.id, c.nom]) },
    empty: 'Aucun lot en stock.',
    columns: [
      { label: 'N° de lot', render: (r) => html`<strong>${r.numero_lot}</strong>` },
      { label: 'Désignation', key: 'designation' }, { label: 'Catégorie', key: 'categorie' },
      { label: 'Marque / Modèle', key: 'marque_modele' }, { label: 'N° de série', key: 'no_serie_chassis' },
      { label: 'Disponible', num: true, render: (r) => html`<strong>${fmtInt(r.restante)}</strong>` },
      { label: 'Reçu', num: true, render: (r) => fmtInt(r.quantite_initiale) },
      { label: 'Valeur restante', num: true, render: (r) => fmtMoney(r.valeur) },
      { label: 'État', render: (r) => html`<span class="tag ${r.etat_fonctionnement === 'fonctionnel' ? 'ok' : 'warn'}">${etatLabel(r.etat_fonctionnement)}</span>` },
      { label: 'Usage', key: 'usage' }, { label: 'Entrée', render: (r) => fmtDate(r.date_entree) },
    ],
    actions: () => html`${btn('sortir', 'Sortir', 'btn-pri')}${btn('modifier', 'Modifier')}${btn('supprimer', 'Supprimer')}`,
    onAction: async (a, row) => {
      try {
        if (a === 'sortir') {
          if (await openSortieModal({ lotId: row.id })) { list.reload(); requestSync(); }
        } else if (a === 'modifier') {
          if (await editModal(row.id, cats)) { list.reload(); requestSync(); }
        } else if (a === 'supprimer') {
          if (await confirmModal('Supprimer ce lot ?', `Le lot ${row.numero_lot} sera masqué (suppression logique). Impossible s'il a déjà des sorties.`, 'Supprimer')) {
            await deleteLot(row.id);
            toast('Lot supprimé.');
            list.reload();
            requestSync();
          }
        }
      } catch (e) { toastError(e); }
    },
    load: (p) => listStock({ q: p.q, categorieId: p.filter, page: p.page, limit: p.limit }),
  });
}

async function editModal(id, cats) {
  const lot = await getLot(id);
  if (!lot) throw new Error('Lot introuvable.');
  const names = (await db.select('SELECT DISTINCT designation FROM materiels WHERE deleted_at IS NULL ORDER BY designation')).map((r) => r.designation);
  return openModal({
    title: `Modifier le lot ${lot.numero_lot}`,
    submitLabel: 'Enregistrer les modifications',
    body: html`<p class="hint">Correction de la saisie. La quantité ne peut pas devenir inférieure à ce qui est déjà sorti (${fmtInt(lot.quantite_initiale - lot.restante)}).</p>
      ${lotFields(cats, names, { ...lot })}`,
    onSubmit: async (form) => {
      await updateLot(id, readLotForm(form));
      toast('Lot modifié.');
    },
  });
}
