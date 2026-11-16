import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../core/utils.js';

let formCounter = 0;

function renderField(field, formId) {
  const id = `${formId}-${field.name}`;
  const fullClass = field.full ? ' field--full' : '';
  const required = field.required ? ' required' : '';
  const requiredMark = field.required
    ? ' <span class="field__required" aria-hidden="true">*</span>'
    : '';

  if (field.type === 'checkbox') {
    return `
      <label class="checkbox${fullClass}" for="${id}">
        <input type="checkbox" id="${id}" name="${escapeHtml(field.name)}"${field.checked ? ' checked' : ''}>
        <span>${escapeHtml(field.label)}</span>
      </label>
    `;
  }

  const baseAttrs = `id="${id}" name="${escapeHtml(field.name)}"${required}${
    field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : ''
  }`;

  let control = '';

  if (field.type === 'select') {
    const options = (field.options || [])
      .map(
        (option) =>
          `<option value="${escapeHtml(option.value)}"${option.selected ? ' selected' : ''}>${escapeHtml(option.label)}</option>`
      )
      .join('');
    control = `<select class="select" ${baseAttrs}>${options}</select>`;
  } else if (field.type === 'textarea') {
    control = `<textarea class="textarea" ${baseAttrs} rows="${field.rows || 3}">${escapeHtml(field.value || '')}</textarea>`;
  } else {
    const extra = [];

    if (field.min !== undefined) extra.push(`min="${escapeHtml(field.min)}"`);
    if (field.max !== undefined) extra.push(`max="${escapeHtml(field.max)}"`);
    if (field.step !== undefined) extra.push(`step="${escapeHtml(field.step)}"`);
    if (field.maxlength !== undefined) extra.push(`maxlength="${escapeHtml(field.maxlength)}"`);
    if (field.minlength !== undefined) extra.push(`minlength="${escapeHtml(field.minlength)}"`);
    if (field.inputmode) extra.push(`inputmode="${escapeHtml(field.inputmode)}"`);
    if (field.autocomplete) extra.push(`autocomplete="${escapeHtml(field.autocomplete)}"`);
    if (field.value !== undefined) extra.push(`value="${escapeHtml(field.value)}"`);

    control = `<input type="${escapeHtml(field.type || 'text')}" class="input" ${baseAttrs}${extra.length ? ` ${extra.join(' ')}` : ''}>`;
  }

  return `
    <div class="field${fullClass}">
      <label class="field__label" for="${id}">${escapeHtml(field.label)}${requiredMark}</label>
      ${control}
      ${field.hint ? `<p class="field__hint">${escapeHtml(field.hint)}</p>` : ''}
    </div>
  `;
}

export function openFormModal({
  title,
  description,
  sections,
  submitLabel = 'Salvar',
  persistenceMessage,
  size = 'lg',
}) {
  const formId = `form-modal-${(formCounter += 1)}`;

  const body = `
    <form id="${formId}">
      ${sections
        .map(
          (section) => `
            <section class="form-section">
              <h3 class="form-section__title">${escapeHtml(section.title)}</h3>
              <div class="form-grid">
                ${section.fields.map((field) => renderField(field, formId)).join('')}
              </div>
            </section>
          `
        )
        .join('')}
    </form>
  `;

  const footer = `
    <button type="button" class="btn btn--ghost" data-modal-close>Cancelar</button>
    <button type="submit" form="${formId}" class="btn btn--primary">${escapeHtml(submitLabel)}</button>
  `;

  const modal = openModal({ title, description, body, footer, size });
  const form = modal.element.querySelector(`#${formId}`);

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    if (persistenceMessage) {
      showToast({
        type: 'info',
        title: 'Formulário validado no navegador',
        message: persistenceMessage,
      });
    }

    modal.close('submit');
  });
}
