import { html, mount, $ } from '../ui/dom.js';
import { toast, toastError } from '../ui/toast.js';
import { createList, btn } from '../ui/table.js';
import { saveBytes } from '../ui/files.js';
import { fmtDate } from '../core/format.js';
import { getExport, listExports, MAX_EXPORTS } from '../services/exportHistory.js';

/** Les 20 derniers fichiers exportés, ré-exportables, classés par date uniquement. */
export async function render(main) {
  mount(main, html`<div class="page-h"><h1>Historique des exports</h1></div>
    <p class="banner">Les ${MAX_EXPORTS} derniers fichiers sont conservés. Le plus ancien disparaît quand un nouveau est ajouté.</p><div id="list"></div>`);

  createList($('#list'), {
    noun: 'fichier', searchPlaceholder: 'Rechercher un fichier…', empty: 'Aucun export pour le moment.',
    filter: { label: 'Tous les formats', options: [['Excel', 'Excel'], ['PDF', 'PDF'], ['Word', 'Word']] },
    columns: [
      { label: 'Date', render: (r) => fmtDate(r.created_at) }, { label: 'Fichier', render: (r) => html`<strong>${r.nom}</strong>` },
      { label: 'Format', key: 'format' }, { label: 'Module', key: 'module' }, { label: 'Par', key: 'user_nom' },
      { label: 'Taille', num: true, render: (r) => `${Math.max(1, Math.round(r.taille / 1024))} Ko` },
    ],
    actions: () => btn('reexport', 'Ré-exporter', 'btn-pri'),
    onAction: async (a, row) => {
      try {
        const f = await getExport(row.id);
        if (!f) throw new Error('Fichier introuvable.');
        if (await saveBytes(f.nom, f.bytes)) toast('Fichier ré-exporté.');
      } catch (e) { toastError(e); }
    },
    load: async (p) => {
      const rows = await listExports({ q: p.q, format: p.filter });
      return { rows, total: rows.length };
    },
  });
}
