import { html, mount, esc } from './dom.js';

/**
 * Fenêtre modale (<dialog>). onSubmit(form, dlg) : retourner false (ou lever une erreur) garde la fenêtre ouverte
 * et affiche le message ; sinon la fenêtre se ferme et la promesse reçoit la valeur retournée.
 */
export function openModal({
  title, body, submitLabel = 'Enregistrer', cancelLabel = 'Annuler', danger = false, hideSubmit = false,
  onOpen, onSubmit, onClose,
}) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'modal';
    mount(dlg, html`
      <form class="mform" method="dialog" novalidate>
        <div class="m-h"><h2>${title}</h2><button type="button" class="icon-btn" data-close aria-label="Fermer">×</button></div>
        <div class="m-b">${body}<p class="err" role="alert" data-err hidden></p></div>
        <div class="m-f">
          <button type="button" class="btn" data-close>${cancelLabel}</button>
          ${hideSubmit ? '' : html`<button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-pri'}">${submitLabel}</button>`}
        </div>
      </form>`);
    document.body.appendChild(dlg);

    let result;
    const form = dlg.querySelector('form');
    const errEl = dlg.querySelector('[data-err]');
    const showError = (m) => {
      errEl.textContent = m;
      errEl.hidden = !m;
    };
    const finish = () => {
      onClose?.();
      dlg.close();
      dlg.remove();
      resolve(result);
    };

    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', finish));
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      showError('');
      if (btn) btn.disabled = true;
      try {
        const r = await onSubmit?.(form, dlg);
        if (r === false) return;
        result = r === undefined ? true : r;
        finish();
      } catch (err) {
        showError(err?.message || String(err));
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    dlg.showModal();
    onOpen?.(dlg, form);
    dlg.querySelector('input:not([type=hidden]):not([readonly]), select, textarea')?.focus();
  });
}

/** Confirmation simple (suppression, etc.). Retourne true/undefined. */
export const confirmModal = (title, message, label = 'Confirmer', danger = true) =>
  openModal({ title, body: html`<p>${message}</p>`, submitLabel: label, danger, onSubmit: () => true });

export const field = (label, control, { span2 = false, hint = '' } = {}) =>
  html`<label class="fld${span2 ? ' span2' : ''}">${label}${control}${hint ? html`<span class="hint">${hint}</span>` : ''}</label>`;

export const val = (form, name) => form.elements[name]?.value ?? '';
export { esc };
