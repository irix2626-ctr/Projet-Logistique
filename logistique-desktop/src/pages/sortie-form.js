import { html, mount, $ } from '../ui/dom.js';
import { openModal, field } from '../ui/modal.js';
import { toast, toastError } from '../ui/toast.js';
import { createSignaturePad } from '../ui/signature.js';
import { readFile } from '../ui/files.js';
import { session } from '../core/session.js';
import { ETATS, fmtDate, fmtInt } from '../core/format.js';
import { createSortie } from '../services/sorties.js';
import { getLot, lotsDisponibles, materielsEnStock } from '../services/stock.js';

/**
 * Modale de sortie. Le lot est OBLIGATOIRE ; le plus ancien du matériel est proposé par défaut (FIFO)
 * et modifiable. Depuis Stockage, le lot de la ligne est présélectionné.
 */
export async function openSortieModal({ lotId = null } = {}) {
  const materiels = await materielsEnStock();
  if (!materiels.length) {
    toast('Aucun lot en stock : enregistrez d\'abord une entrée.', 'err');
    return false;
  }
  const preset = lotId ? await getLot(lotId) : null;
  const u = session.user;
  let pad = null;
  let lots = [];

  return openModal({
    title: 'Sortir du matériel',
    submitLabel: 'Enregistrer la sortie',
    body: html`
      <div class="grid2">
        ${field('Matériel', html`<select class="in" name="materiel" required>
          ${materiels.map((m) => html`<option value="${m.id}" ${preset && m.id === preset.materiel_id ? 'selected' : ''}>${m.designation}${m.marque_modele ? ` — ${m.marque_modele}` : ''} (reste ${fmtInt(m.restante)})</option>`)}
        </select>`)}
        ${field('Lot', html`<select class="in" name="lot_id" required></select>`, { hint: 'Le lot le plus ancien est proposé par défaut (FIFO).' })}
        <div class="lot-info span2" data-info></div>
        ${field('Quantité', html`<input class="in" name="quantite" type="number" min="1" step="1" required />`)}
        ${field('PR / SR (automatique)', html`<input class="in ro" value="${u.structure_nom}" readonly />`)}
        ${field('Nom du bénéficiaire', html`<input class="in" name="nom_beneficiaire" required />`)}
        ${field('Contact du bénéficiaire', html`<input class="in" name="contact_beneficiaire" />`)}
        ${field('Fonction du bénéficiaire', html`<input class="in" name="fonction" />`)}
        ${field('État de fonctionnement', html`<select class="in" name="etat_fonctionnement">${ETATS.map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select>`)}
        ${field('Usage', html`<input class="in" name="usage" required />`, { span2: true })}
        ${field('Description (facultative)', html`<textarea class="in" name="description"></textarea>`, { span2: true })}
      </div>
      <div class="pad-wrap">
        <strong>Signature du bénéficiaire</strong>
        <canvas class="pad" data-pad aria-label="Zone de signature"></canvas>
        <div><button type="button" class="btn btn-sm" data-clear>Effacer la signature</button></div>
      </div>
      ${field('Document (facultatif)', html`<input class="in" type="file" name="doc" accept=".pdf,image/jpeg,image/png" />`)}
      ${field('Opérateur (automatique)', html`<input class="in ro" value="${u.nom}" readonly />`)}`,
    onOpen: async (dlg, form) => {
      pad = createSignaturePad($('[data-pad]', dlg));
      $('[data-clear]', dlg).addEventListener('click', () => pad.clear());
      const matSel = form.elements.materiel;
      const lotSel = form.elements.lot_id;
      let lastUsage = '';

      const paintLot = () => {
        const lot = lots.find((l) => l.id === lotSel.value);
        const q = form.elements.quantite;
        if (!lot) return;
        q.max = lot.restante;
        mount($('[data-info]', dlg), html`<strong>${lot.numero_lot}</strong> · reste <strong>${fmtInt(lot.restante)}</strong> sur ${fmtInt(lot.quantite_initiale)} reçus · entré le ${fmtDate(lot.date_entree)}${lot.no_serie_chassis ? html` · série ${lot.no_serie_chassis}` : ''}`);
        const usage = form.elements.usage;
        if (!usage.value || usage.value === lastUsage) usage.value = lot.usage || '';
        lastUsage = lot.usage || '';
        form.elements.etat_fonctionnement.value = lot.etat_fonctionnement || 'fonctionnel';
      };
      const paintLots = async () => {
        lots = await lotsDisponibles(matSel.value);
        mount(lotSel, html`${lots.map((l, i) => html`<option value="${l.id}">${l.numero_lot} — reste ${fmtInt(l.restante)}${i === 0 ? ' (le plus ancien)' : ''}</option>`)}`);
        if (preset && lots.some((l) => l.id === preset.id)) lotSel.value = preset.id;
        paintLot();
      };
      matSel.addEventListener('change', () => { lotSel.dataset.preset = ''; paintLots(); });
      lotSel.addEventListener('change', paintLot);
      await paintLots();
    },
    onSubmit: async (form) => {
      if (pad.isEmpty()) throw new Error('La signature du bénéficiaire est requise.');
      const g = (n) => form.elements[n].value;
      const file = form.elements.doc.files[0];
      const files = file ? [await readFile(file)] : [];
      const r = await createSortie({
        lot_id: g('lot_id'), quantite: g('quantite'), nom_beneficiaire: g('nom_beneficiaire'),
        contact_beneficiaire: g('contact_beneficiaire'), fonction: g('fonction'), usage: g('usage'),
        etat_fonctionnement: g('etat_fonctionnement'), description: g('description'),
        signature: pad.toDataURL(), requireSignature: true,
      }, files);
      toast(`Sortie enregistrée sur le lot ${r.numero_lot}.`);
      return r;
    },
  }).catch((e) => { toastError(e); return false; });
}
