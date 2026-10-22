import { html } from '../ui/dom.js';
import { field } from '../ui/modal.js';
import { ETATS } from '../core/format.js';

/** Champs de la fiche d'un lot (entrée et correction). `v` : valeurs initiales. */
export function lotFields(categories, names = [], v = {}) {
  return html`
    <datalist id="dl-designations">${names.map((n) => html`<option value="${n}"></option>`)}</datalist>
    <div class="grid2">
      ${field('Désignation', html`<input class="in" name="designation" list="dl-designations" value="${v.designation ?? ''}" required />`)}
      ${field('Catégorie', html`<select class="in" name="categorie_id" required>
        <option value="">— Choisir —</option>
        ${categories.map((c) => html`<option value="${c.id}" ${c.id === v.categorie_id ? 'selected' : ''}>${c.nom}</option>`)}
      </select>`)}
      ${field('Marque / Modèle', html`<input class="in" name="marque_modele" value="${v.marque_modele ?? ''}" />`)}
      ${field('N° de série / châssis', html`<input class="in" name="no_serie_chassis" value="${v.no_serie_chassis ?? ''}" />`)}
      ${field('Code bailleur / immatriculation', html`<input class="in" name="code_bailleur_immatriculation" value="${v.code_bailleur_immatriculation ?? ''}" />`)}
      ${field('Structure / service', html`<input class="in" name="structure_service" value="${v.structure_service ?? ''}" />`)}
      ${field('État de fonctionnement', html`<select class="in" name="etat_fonctionnement" required>
        ${ETATS.map(([k, l]) => html`<option value="${k}" ${k === (v.etat_fonctionnement ?? 'fonctionnel') ? 'selected' : ''}>${l}</option>`)}
      </select>`)}
      ${field('Usage prévu', html`<input class="in" name="usage" value="${v.usage ?? ''}" placeholder="À quoi sert cette ressource ?" required />`)}
      ${field('Nom du fournisseur', html`<input class="in" name="fournisseur" value="${v.fournisseur ?? ''}" required />`)}
      ${field('Quantité', html`<input class="in" name="quantite_initiale" type="number" min="1" step="1" value="${v.quantite_initiale ?? ''}" required />`)}
      ${field('Coût total du lot (FCFA)', html`<input class="in" name="cout_total" type="number" min="0" step="any" value="${v.cout_total ?? ''}" required />`, { hint: 'Coût du lot entier : aucun coût unitaire n\'est géré.' })}
      ${field('Description du lot', html`<textarea class="in" name="description">${v.description ?? ''}</textarea>`, { span2: true })}
      ${field('Observations', html`<textarea class="in" name="observations">${v.observations ?? ''}</textarea>`, { span2: true })}
    </div>`;
}

export function readLotForm(form) {
  const g = (n) => form.elements[n].value;
  return {
    designation: g('designation'), categorie_id: g('categorie_id'), marque_modele: g('marque_modele'),
    no_serie_chassis: g('no_serie_chassis'), code_bailleur_immatriculation: g('code_bailleur_immatriculation'),
    structure_service: g('structure_service'), etat_fonctionnement: g('etat_fonctionnement'), usage: g('usage'),
    fournisseur: g('fournisseur'), quantite_initiale: g('quantite_initiale'), cout_total: g('cout_total'),
    description: g('description'), observations: g('observations'),
  };
}
