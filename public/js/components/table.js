import { icon } from './icons.js';
import { escapeHtml } from '../core/utils.js';
import { renderEmptyState } from './empty-state.js';

export function renderDataTable({ columns, rows = [], empty }) {
  const head = columns
    .map(
      (column) =>
        `<th scope="col"${column.align ? ` class="is-${column.align}"` : ''}>${escapeHtml(column.label)}</th>`
    )
    .join('');

  const table = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>${head}</tr></thead>
        ${rows.length ? `<tbody>${rows
          .map(
            (row) =>
              `<tr>${columns
                .map((column) => {
                  const value = typeof column.render === 'function'
                    ? column.render(row)
                    : escapeHtml(row[column.key] ?? '—');
                  return `<td${column.align ? ` class="is-${column.align}"` : ''}>${value}</td>`;
                })
                .join('')}</tr>`
          )
          .join('')}</tbody>` : ''}
      </table>
    </div>
  `;

  return rows.length ? table : `${table}${renderEmptyState(empty)}`;
}

export function renderPagination({ total = 0, pageSize = 10, label = 'registros' } = {}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : 1;
  const last = Math.min(total, pageSize);
  const summary = total === 0
    ? 'Nenhum registro encontrado'
    : `Mostrando ${first}–${last} de ${total} ${escapeHtml(label)}`;

  return `
    <div class="pagination">
      <p>${summary}</p>
      <div class="pagination__controls">
        <button type="button" class="icon-button icon-button--sm" aria-label="Página anterior" disabled>${icon('chevron-left', 16)}</button>
        <span class="pagination__page">Página 1 de ${totalPages}</span>
        <button type="button" class="icon-button icon-button--sm" aria-label="Próxima página" disabled>${icon('chevron-right', 16)}</button>
      </div>
    </div>
  `;
}
