import { icon } from './icons.js';
import { renderPageHead } from './page.js';
import { renderToolbar, initFilterForms } from './toolbar.js';
import { renderDataTable, renderPagination } from './table.js';
import { openFormModal } from './form.js';
import { possuiPermissao } from '../core/session.js';

export function createModuleView({
  title,
  eyebrow,
  subtitle,
  permission,
  createPermission,
  createLabel,
  createAction,
  searchPlaceholder,
  filters = [],
  columns,
  emptyIcon = 'file-text',
  emptyTitle,
  emptyMessage,
  paginationLabel = 'registros',
  form,
  filterMessage,
}) {
  return {
    title,
    permission,

    render({ session }) {
      const canCreate = possuiPermissao(session, createPermission);

      const actions = canCreate
        ? `<button type="button" class="btn btn--primary" data-action="${createAction}">${icon('plus', 16)} ${createLabel}</button>`
        : '';

      const empty = {
        iconName: emptyIcon,
        title: emptyTitle,
        message: emptyMessage,
        actionLabel: canCreate ? createLabel : undefined,
        actionAttrs: canCreate ? `data-action="${createAction}"` : '',
      };

      return `
        <section class="view">
          ${renderPageHead({ eyebrow, title, subtitle, actions })}
          ${renderToolbar({ searchPlaceholder, selects: filters })}
          <div class="card">
            <div class="card__body card__body--flush">
              ${renderDataTable({ columns, rows: [], empty })}
              ${renderPagination({ total: 0, label: paginationLabel })}
            </div>
          </div>
        </section>
      `;
    },

    mount(root) {
      initFilterForms(root, filterMessage);

      root.querySelectorAll(`[data-action="${createAction}"]`).forEach((button) => {
        button.addEventListener('click', () => openFormModal(form));
      });
    },
  };
}
