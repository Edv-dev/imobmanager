import { escapeHtml } from '../core/utils.js';

export function renderPageHead({ eyebrow, title, subtitle, actions = '' }) {
  return `
    <div class="page-head">
      <div>
        ${eyebrow ? `<span class="eyebrow">${escapeHtml(eyebrow)}</span>` : ''}
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<p class="page-head__subtitle">${escapeHtml(subtitle)}</p>` : ''}
      </div>
      ${actions ? `<div class="page-head__actions">${actions}</div>` : ''}
    </div>
  `;
}
