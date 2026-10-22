import { html, mount, $, $$, debounce } from './dom.js';
import { PAGE_SIZE } from '../core/format.js';

/**
 * Liste paginée (100 lignes par page), en-têtes fixes, recherche, filtre et période.
 * load({ q, filter, dateFrom, dateTo, page, limit }) -> { rows, total }
 */
export function createList(host, {
  columns, load, filter = null, dates = false, searchPlaceholder = 'Rechercher…', empty = 'Aucun résultat.',
  actions = null, onAction = null, noun = 'ligne', search = true, initialFilter = '', fixedHeight = null,
}) {
  const state = { q: '', filter: initialFilter, dateFrom: '', dateTo: '', page: 1, total: 0, rows: [], seq: 0 };

  mount(host, html`
    <div class="toolbar">
      ${search ? html`<input class="in" type="search" data-q placeholder="${searchPlaceholder}" aria-label="Rechercher" />` : ''}
      ${filter ? html`<select class="in" data-filter aria-label="${filter.label}">
        <option value="">${filter.label}</option>
        ${filter.options.map(([v, l]) => html`<option value="${v}" ${v === initialFilter ? 'selected' : ''}>${l}</option>`)}
      </select>` : ''}
      ${dates ? html`<input class="in" type="date" data-from aria-label="Du" style="flex:0 1 150px" />
        <input class="in" type="date" data-to aria-label="Au" style="flex:0 1 150px" />` : ''}
    </div>
    <p class="count" data-count></p>
    <div class="table-wrap" ${fixedHeight ? html`style="max-height:${fixedHeight}"` : ''}><table><thead><tr>
      ${columns.map((c) => html`<th class="${c.num ? 'num' : ''}">${c.label}</th>`)}${actions ? html`<th>Actions</th>` : ''}
    </tr></thead><tbody data-body></tbody></table></div>
    <div class="pager" data-pager></div>`);

  const body = $('[data-body]', host);
  const count = $('[data-count]', host);
  const pager = $('[data-pager]', host);

  function paint() {
    const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    count.textContent = `${state.total} ${noun}${state.total > 1 ? 's' : ''}${pages > 1 ? ` — page ${state.page} / ${pages}` : ''}`;
    mount(body, state.rows.length
      ? html`${state.rows.map((r, i) => html`<tr>${columns.map((c) => html`<td class="${c.num ? 'num' : ''}">${c.render ? c.render(r) : r[c.key]}</td>`)}${actions ? html`<td><div class="row-actions" data-i="${i}">${actions(r)}</div></td>` : ''}</tr>`)}`
      : html`<tr><td class="empty" colspan="${columns.length + (actions ? 1 : 0)}">${empty}</td></tr>`);

    const pageBtn = (p, label = p) => html`<button class="btn btn-sm" data-page="${p}" ${p === state.page ? html`aria-current="page"` : ''}>${label}</button>`;
    mount(pager, pages > 1 ? html`
      <button class="btn btn-sm" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}>Précédent</button>
      ${Array.from({ length: pages }, (_, i) => i + 1).filter((p) => Math.abs(p - state.page) <= 2 || p === 1 || p === pages).map((p) => pageBtn(p))}
      <button class="btn btn-sm" data-page="${state.page + 1}" ${state.page === pages ? 'disabled' : ''}>Suivant</button>` : '');
  }

  async function reload() {
    const seq = ++state.seq;
    const res = await load({ q: state.q, filter: state.filter, dateFrom: state.dateFrom, dateTo: state.dateTo, page: state.page, limit: PAGE_SIZE });
    if (seq !== state.seq) return; // une requête plus récente a pris le relais
    state.rows = res.rows;
    state.total = res.total;
    const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    if (state.page > pages) {
      state.page = pages;
      return reload();
    }
    paint();
  }

  const refresh = () => {
    state.page = 1;
    reload();
  };
  $('[data-q]', host)?.addEventListener('input', debounce((e) => { state.q = e.target.value; refresh(); }));
  $('[data-filter]', host)?.addEventListener('change', (e) => { state.filter = e.target.value; refresh(); });
  $('[data-from]', host)?.addEventListener('change', (e) => { state.dateFrom = e.target.value; refresh(); });
  $('[data-to]', host)?.addEventListener('change', (e) => { state.dateTo = e.target.value; refresh(); });
  pager.addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]');
    if (!b || b.disabled) return;
    state.page = Number(b.dataset.page);
    reload();
  });
  body.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-a]');
    if (!b || !onAction) return;
    const holder = b.closest('[data-i]');
    onAction(b.dataset.a, state.rows[Number(holder.dataset.i)], b);
  });

  reload();
  return {
    state,
    reload,
    /** Toutes les lignes correspondant aux filtres actifs (pour les exports). */
    fetchAll: async () => (await load({ q: state.q, filter: state.filter, dateFrom: state.dateFrom, dateTo: state.dateTo, page: 1, limit: 1_000_000 })).rows,
  };
}

export const btn = (action, label, cls = '') => html`<button class="btn btn-sm ${cls}" data-a="${action}">${label}</button>`;
export { $$ };
