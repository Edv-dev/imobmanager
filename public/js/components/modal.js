import { icon } from './icons.js';
import { escapeHtml } from '../core/utils.js';

let modalCounter = 0;
let openModals = 0;
const closeHandlers = new Set();

export function closeAllModals(reason = 'route') {
  for (const close of [...closeHandlers]) close(reason);
}

export function openModal({
  title,
  description = '',
  body = '',
  footer = '',
  size = 'md',
  onClose,
}) {
  const root = document.getElementById('modal-root');
  const titleId = `modal-title-${(modalCounter += 1)}`;

  const dialog = document.createElement('dialog');
  dialog.className = `modal modal--${size}`;
  dialog.setAttribute('aria-labelledby', titleId);

  dialog.innerHTML = `
    <div class="modal__surface">
      <header class="modal__header">
        <div>
          <h2 id="${titleId}">${escapeHtml(title)}</h2>
          ${description ? `<p class="modal__description">${escapeHtml(description)}</p>` : ''}
        </div>
        <button type="button" class="icon-button icon-button--sm modal__close" data-modal-close aria-label="Fechar">${icon('close', 16)}</button>
      </header>
      <div class="modal__body">${body}</div>
      ${footer ? `<footer class="modal__footer">${footer}</footer>` : ''}
    </div>
  `;

  root.appendChild(dialog);
  openModals += 1;
  document.body.classList.add('modal-open');

  let closed = false;

  const close = (reason = 'close') => {
    if (closed) return;
    closed = true;
    closeHandlers.delete(close);
    dialog.close();
    dialog.remove();
    openModals = Math.max(0, openModals - 1);
    if (openModals === 0) document.body.classList.remove('modal-open');
    onClose?.(reason);
  };

  closeHandlers.add(close);

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close('cancel');
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close('backdrop');
  });

  dialog.querySelectorAll('[data-modal-close]').forEach((button) => {
    button.addEventListener('click', () => close('close'));
  });

  dialog.showModal();

  const focusTarget = dialog.querySelector(
    '.modal__body input:not([type="hidden"]), .modal__body select, .modal__body textarea'
  );
  focusTarget?.focus();

  return {
    element: dialog,
    body: dialog.querySelector('.modal__body'),
    close,
  };
}

export function confirmDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'primary',
}) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const modal = openModal({
      title,
      size: 'sm',
      body: `<p class="modal__text">${escapeHtml(message)}</p>`,
      footer: `
        <button type="button" class="btn btn--ghost" data-modal-close>${escapeHtml(cancelLabel)}</button>
        <button type="button" class="btn btn--${tone}" data-confirm>${escapeHtml(confirmLabel)}</button>
      `,
      onClose: () => finish(false),
    });

    modal.element.querySelector('[data-confirm]').addEventListener('click', () => {
      finish(true);
      modal.close('confirm');
    });
  });
}
