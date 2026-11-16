import { icon } from './icons.js';
import { escapeHtml } from '../core/utils.js';

const TOAST_ICONS = {
  success: 'check-circle',
  error: 'x-circle',
  warning: 'alert-circle',
  info: 'info',
};

const TOAST_TITLES = {
  success: 'Tudo certo',
  error: 'Não foi possível concluir',
  warning: 'Atenção',
  info: 'Informação',
};

export function showToast({ type = 'info', title, message = '', timeout = 5200 }) {
  const region = document.getElementById('toast-region');
  if (!region) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const titleText = title || TOAST_TITLES[type] || TOAST_TITLES.info;

  toast.innerHTML = `
    <span class="toast__icon">${icon(TOAST_ICONS[type] || 'info', 18)}</span>
    <div class="toast__content">
      <p class="toast__title">${escapeHtml(titleText)}</p>
      ${message ? `<p class="toast__message">${escapeHtml(message)}</p>` : ''}
    </div>
    <button type="button" class="toast__close" aria-label="Fechar aviso">${icon('close', 14)}</button>
  `;

  const remove = () => {
    clearTimeout(timer);
    toast.remove();
  };

  toast.querySelector('.toast__close').addEventListener('click', remove);

  const timer = setTimeout(remove, timeout);
  region.appendChild(toast);

  while (region.children.length > 4) {
    region.firstElementChild.remove();
  }
}
