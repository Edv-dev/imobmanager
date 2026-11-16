import { icon } from './icons.js';
import { escapeHtml } from '../core/utils.js';

export function renderEmptyState({
  iconName = 'info',
  title,
  message,
  actionLabel,
  actionAttrs = '',
}) {
  return `
    <div class="empty-state">
      <span class="empty-state__icon">${icon(iconName, 24)}</span>
      <p class="empty-state__title">${escapeHtml(title)}</p>
      ${message ? `<p class="empty-state__text">${escapeHtml(message)}</p>` : ''}
      ${actionLabel ? `<button type="button" class="btn btn--ghost btn--sm" ${actionAttrs}>${escapeHtml(actionLabel)}</button>` : ''}
    </div>
  `;
}
