import { icon } from './icons.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../core/utils.js';

export function renderToolbar({
  searchLabel = 'Buscar',
  searchPlaceholder = 'Buscar...',
  selects = [],
  submitLabel = 'Filtrar',
}) {
  const selectFields = selects
    .map((select) => {
      const id = `filtro-${select.name}`;
      const options = select.options
        .map(
          (option) =>
            `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`
        )
        .join('');

      return `
        <div class="field toolbar__select">
          <label class="sr-only" for="${id}">${escapeHtml(select.label)}</label>
          <select class="select" id="${id}" name="${escapeHtml(select.name)}">${options}</select>
        </div>
      `;
    })
    .join('');

  return `
    <form class="toolbar" data-filter-form>
      <div class="field toolbar__search">
        <label class="sr-only" for="filtro-busca">${escapeHtml(searchLabel)}</label>
        <div class="input-group">
          <span class="input-group__icon">${icon('search', 18)}</span>
          <input class="input" id="filtro-busca" name="busca" type="search" placeholder="${escapeHtml(searchPlaceholder)}">
        </div>
      </div>
      ${selectFields}
      <div class="toolbar__actions">
        <button type="submit" class="btn btn--ghost">${icon('filter')} ${escapeHtml(submitLabel)}</button>
      </div>
    </form>
  `;
}

export function initFilterForms(root, message) {
  root.querySelectorAll('[data-filter-form]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      showToast({
        type: 'info',
        title: 'Consulta em pré-visualização',
        message,
      });
    });
  });
}
