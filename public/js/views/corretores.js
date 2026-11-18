import { renderPageHead } from '../components/page.js';
import { icon } from '../components/icons.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { request } from '../core/api.js';
import { escapeHtml, initials } from '../core/utils.js';
import { possuiPermissao } from '../core/session.js';

const state = {
  session: null,
  root: null,
  token: 0,
  abort: null,
  perms: {},
  corretores: null,
  filtros: { busca: '', status: '', pagina: 1, limite: 10 },
};

let sequenciaFormulario = 0;

function reiniciarEstado() {
  state.session = null;
  state.token += 1;
  state.root = null;
  state.abort?.abort();
  state.abort = null;
  state.perms = {};
  state.corretores = null;
  state.filtros = { busca: '', status: '', pagina: 1, limite: 10 };
}

function calcularPermissoes(session) {
  return {
    criar: possuiPermissao(session, 'corretores.criar'),
    editar: possuiPermissao(session, 'corretores.editar'),
    desativar: possuiPermissao(session, 'corretores.desativar'),
  };
}

function iniciarCarregamento() {
  state.token += 1;
  return state.token;
}

function tokenValido(token) {
  return token === state.token;
}

function tratarFalha(error) {
  if (error?.status === 401) {
    window.location.replace('/?sessao=expirada');
    return true;
  }
  return false;
}

function avisarErro(error) {
  if (tratarFalha(error)) return;
  showToast({
    type: 'error',
    title: 'Ação não concluída',
    message: error?.message || 'Não foi possível concluir a solicitação.',
  });
}

function avisarSucesso(mensagem) {
  showToast({ type: 'success', title: 'Alterações salvas', message: mensagem });
}

function definirConteudo(html) {
  const container = state.root?.querySelector('[data-corretores-content]');
  if (container) container.innerHTML = html;
}

function definirCarregando(botao, texto = 'Salvando…') {
  if (!botao) return () => {};
  const conteudo = botao.innerHTML;
  botao.disabled = true;
  botao.textContent = texto;

  return () => {
    botao.disabled = false;
    botao.innerHTML = conteudo;
  };
}

function mostrarErroFormulario(modal, mensagem) {
  const caixa = modal.element.querySelector('[data-form-error]');
  if (!caixa) return;
  caixa.textContent = mensagem;
  caixa.hidden = false;
  caixa.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function esconderErroFormulario(modal) {
  const caixa = modal.element.querySelector('[data-form-error]');
  if (!caixa) return;
  caixa.hidden = true;
  caixa.textContent = '';
}

function formatarCpf(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  if (digitos.length !== 11) return valor || '—';
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
}

function formatarDataHora(valor) {
  if (!valor) return '—';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(data);
}

function formatarMoeda(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  const numero = Number(valor);
  if (Number.isNaN(numero)) return '—';
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function badge(texto, tom = 'neutral') {
  return `<span class="badge badge--${tom}">${escapeHtml(texto)}</span>`;
}

function badgeSituacao(ativo) {
  return ativo ? badge('Ativo', 'success') : badge('Inativo', 'danger');
}

function botaoIcone({ action, id = '', nome, rotulo, perigo = false }) {
  return `
    <button
      type="button"
      class="icon-button icon-button--sm${perigo ? ' icon-button--danger' : ''}"
      data-action="${escapeHtml(action)}"
      ${id !== '' ? `data-id="${escapeHtml(id)}"` : ''}
      title="${escapeHtml(rotulo)}"
      aria-label="${escapeHtml(rotulo)}"
    >${icon(nome, 16)}</button>
  `;
}

function renderCarregando() {
  return `
    <div class="admin-loading" role="status">
      <span class="admin-loading__spinner" aria-hidden="true"></span>
      <p>Carregando corretores…</p>
    </div>
  `;
}

function renderErro(error) {
  return `
    <div class="card">
      <div class="card__body">
        <div class="empty-state empty-state--panel">
          <span class="empty-state__icon">${icon('alert-circle', 24)}</span>
          <p class="empty-state__title">Não foi possível carregar os corretores</p>
          <p class="empty-state__text">${escapeHtml(
            error?.message || 'Ocorreu uma falha ao consultar o servidor.'
          )}</p>
          <button type="button" class="btn btn--ghost" data-action="corretor-recarregar">
            ${icon('refresh', 16)} Tentar novamente
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderFiltros() {
  return `
    <form class="toolbar" data-corretores-filtro>
      <div class="field toolbar__search">
        <label class="sr-only" for="corretores-busca">Buscar corretores</label>
        <div class="input-group">
          <span class="input-group__icon">${icon('search', 18)}</span>
          <input
            class="input"
            id="corretores-busca"
            name="busca"
            type="search"
            placeholder="Buscar por nome, CPF, CRECI ou e-mail"
            value="${escapeHtml(state.filtros.busca)}"
          >
        </div>
      </div>
      <div class="field toolbar__select">
        <label class="sr-only" for="corretores-status">Situação</label>
        <select class="select" id="corretores-status" name="status">
          <option value=""${state.filtros.status === '' ? ' selected' : ''}>Todos os status</option>
          <option value="ativos"${state.filtros.status === 'ativos' ? ' selected' : ''}>Ativos</option>
          <option value="inativos"${state.filtros.status === 'inativos' ? ' selected' : ''}>Inativos</option>
        </select>
      </div>
      <div class="toolbar__actions">
        <button type="submit" class="btn btn--ghost">${icon('filter', 16)} Filtrar</button>
      </div>
    </form>
  `;
}

function renderPaginacao(dados) {
  const inicio = dados.total === 0 ? 0 : (dados.pagina - 1) * dados.limite + 1;
  const fim = Math.min(dados.total, dados.pagina * dados.limite);

  return `
    <div class="pagination">
      <p>${
        dados.total === 0
          ? 'Nenhum registro encontrado'
          : `Mostrando ${inicio}–${fim} de ${dados.total} corretores`
      }</p>
      <div class="pagination__controls">
        <button
          type="button"
          class="icon-button icon-button--sm"
          data-action="corretores-pagina"
          data-page="${dados.pagina - 1}"
          aria-label="Página anterior"
          ${dados.pagina <= 1 ? 'disabled' : ''}
        >${icon('chevron-left', 16)}</button>
        <span class="pagination__page">Página ${dados.pagina} de ${dados.totalPaginas}</span>
        <button
          type="button"
          class="icon-button icon-button--sm"
          data-action="corretores-pagina"
          data-page="${dados.pagina + 1}"
          aria-label="Próxima página"
          ${dados.pagina >= dados.totalPaginas ? 'disabled' : ''}
        >${icon('chevron-right', 16)}</button>
      </div>
    </div>
  `;
}

function renderLinha(corretor) {
  const eu = String(corretor.usuario?.id) === String(state.session?.usuario?.id);
  const acoes = [
    botaoIcone({
      action: 'corretor-detalhe',
      id: corretor.id,
      nome: 'eye',
      rotulo: 'Consultar detalhes',
    }),
    state.perms.editar
      ? botaoIcone({
          action: 'corretor-editar',
          id: corretor.id,
          nome: 'edit',
          rotulo: 'Editar corretor',
        })
      : '',
    state.perms.desativar && !eu
      ? botaoIcone({
          action: 'corretor-status',
          id: corretor.id,
          nome: 'power',
          rotulo: corretor.ativo ? 'Desativar corretor' : 'Ativar corretor',
          perigo: corretor.ativo,
        })
      : '',
  ].join('');

  return `
    <tr>
      <td>
        <div class="corretor-cell">
          <span class="avatar avatar--sm">${escapeHtml(initials(corretor.nome))}</span>
          <div class="cell-primary">
            <strong>${escapeHtml(corretor.nome)}</strong>
            <span>${escapeHtml(corretor.email || 'Sem e-mail profissional')}</span>
          </div>
        </div>
      </td>
      <td><span class="corretor-nowrap">${escapeHtml(corretor.creci)}</span></td>
      <td><span class="corretor-nowrap">${escapeHtml(formatarCpf(corretor.cpf))}</span></td>
      <td>${escapeHtml(corretor.telefone || '—')}</td>
      <td>
        <div class="cell-primary">
          <strong>${escapeHtml(corretor.usuario?.nome || '—')}</strong>
          <span>${escapeHtml(corretor.usuario?.email || '—')}</span>
        </div>
      </td>
      <td><span class="corretor-nowrap">${escapeHtml(formatarDataHora(corretor.criadoEm))}</span></td>
      <td>${badgeSituacao(corretor.ativo)}</td>
      <td class="is-right"><div class="cell-actions">${acoes}</div></td>
    </tr>
  `;
}

function renderLista(dados) {
  const corpo = dados.corretores.length
    ? `<div class="table-wrap">
        <table class="data-table corretor-table">
          <thead>
            <tr>
              <th scope="col">Corretor</th>
              <th scope="col">CRECI</th>
              <th scope="col">CPF</th>
              <th scope="col">Telefone</th>
              <th scope="col">Usuário vinculado</th>
              <th scope="col">Cadastro</th>
              <th scope="col">Situação</th>
              <th scope="col" class="is-right">Ações</th>
            </tr>
          </thead>
          <tbody>${dados.corretores.map(renderLinha).join('')}</tbody>
        </table>
      </div>`
    : `<div class="empty-state empty-state--panel">
        <span class="empty-state__icon">${icon('users', 24)}</span>
        <p class="empty-state__title">Nenhum corretor encontrado</p>
        <p class="empty-state__text">${
          state.filtros.busca || state.filtros.status
            ? 'Ajuste a busca ou o filtro de situação para ampliar a consulta.'
            : 'Cadastre o primeiro corretor para começar a organizar a equipe.'
        }</p>
        ${
          state.perms.criar && !state.filtros.busca && !state.filtros.status
            ? `<button type="button" class="btn btn--primary" data-action="corretor-novo">${icon(
                'plus',
                16
              )} Novo corretor</button>`
            : ''
        }
      </div>`;

  return `
    <section class="card">
      <div class="card__body card__body--flush">
        ${corpo}
        ${renderPaginacao(dados)}
      </div>
    </section>
  `;
}

async function carregarCorretores() {
  const token = iniciarCarregamento();
  definirConteudo(renderCarregando());

  const params = new URLSearchParams({
    pagina: String(state.filtros.pagina),
    limite: String(state.filtros.limite),
  });

  if (state.filtros.busca) params.set('busca', state.filtros.busca);
  if (state.filtros.status) params.set('status', state.filtros.status);

  try {
    const dados = await request(`/api/corretores?${params.toString()}`);
    if (!tokenValido(token)) return;
    state.corretores = dados;
    definirConteudo(renderLista(dados));
  } catch (error) {
    if (tratarFalha(error) || !tokenValido(token)) return;
    definirConteudo(renderErro(error));
  }
}

function campo({
  label,
  name,
  value = '',
  type = 'text',
  required = false,
  full = false,
  placeholder = '',
  hint = '',
  maxlength = '',
  inputmode = '',
  autocomplete = '',
}) {
  const id = `corretor-campo-${(sequenciaFormulario += 1)}`;
  return `
    <div class="field${full ? ' field--full' : ''}">
      <label class="field__label" for="${id}">
        ${escapeHtml(label)}${required ? ' <span class="field__required" aria-hidden="true">*</span>' : ''}
      </label>
      <input
        class="input"
        id="${id}"
        name="${escapeHtml(name)}"
        type="${escapeHtml(type)}"
        value="${escapeHtml(value ?? '')}"
        ${required ? 'required' : ''}
        ${placeholder ? `placeholder="${escapeHtml(placeholder)}"` : ''}
        ${maxlength ? `maxlength="${escapeHtml(maxlength)}"` : ''}
        ${inputmode ? `inputmode="${escapeHtml(inputmode)}"` : ''}
        ${autocomplete ? `autocomplete="${escapeHtml(autocomplete)}"` : ''}
      >
      ${hint ? `<p class="field__hint">${escapeHtml(hint)}</p>` : ''}
    </div>
  `;
}

function campoSelect({ label, name, value = '', options, required = false }) {
  const id = `corretor-campo-${(sequenciaFormulario += 1)}`;
  return `
    <div class="field">
      <label class="field__label" for="${id}">
        ${escapeHtml(label)}${required ? ' <span class="field__required" aria-hidden="true">*</span>' : ''}
      </label>
      <select class="select" id="${id}" name="${escapeHtml(name)}"${required ? ' required' : ''}>
        ${options
          .map(
            (option) => `
              <option value="${escapeHtml(option.value)}"${
                String(option.value) === String(value) ? ' selected' : ''
              }>${escapeHtml(option.label)}</option>
            `
          )
          .join('')}
      </select>
    </div>
  `;
}

function campoCheckbox({ label, name, checked = false, hint = '' }) {
  const id = `corretor-campo-${(sequenciaFormulario += 1)}`;
  return `
    <label class="checkbox" for="${id}">
      <input type="checkbox" id="${id}" name="${escapeHtml(name)}"${checked ? ' checked' : ''}>
      <span>${escapeHtml(label)}</span>
    </label>
    ${hint ? `<p class="checkbox__hint">${escapeHtml(hint)}</p>` : ''}
  `;
}

function renderSecaoConta(corretor) {
  return `
    <section class="form-section">
      <h3 class="form-section__title">Usuário vinculado</h3>
      <div class="notice notice--info">
        ${icon('info', 18)}
        <p>O corretor utiliza a conta de acesso vinculada. Nome, situação e sessões são sincronizados com o usuário.</p>
      </div>
      <div class="corretor-linked-user">
        <span class="avatar">${escapeHtml(initials(corretor.usuario?.nome || corretor.nome))}</span>
        <div>
          <strong>${escapeHtml(corretor.usuario?.nome || '—')}</strong>
          <span>${escapeHtml(corretor.usuario?.email || '—')}</span>
        </div>
        ${badgeSituacao(corretor.usuario?.ativo)}
      </div>
    </section>
  `;
}

async function abrirNovoCorretor() {
  const token = state.token;
  let usuarios;

  try {
    const dados = await request('/api/corretores/usuarios-disponiveis');
    usuarios = dados.usuarios || [];
  } catch (error) {
    avisarErro(error);
    return;
  }

  if (!tokenValido(token)) return;

  if (!usuarios.length) {
    openModal({
      title: 'Nenhum usuário disponível',
      size: 'sm',
      body: `
        <div class="notice notice--warning">
          ${icon('alert-circle', 18)}
          <p>Não há usuários operacionais sem corretor vinculado. Crie a conta em <strong>Administração → Usuários</strong> ou libere um usuário existente.</p>
        </div>
      `,
      footer: '<button type="button" class="btn btn--ghost" data-modal-close>Fechar</button>',
    });
    return;
  }

  const formId = `corretor-form-${(sequenciaFormulario += 1)}`;
  const usuarioPorId = new Map(usuarios.map((usuario) => [String(usuario.id), usuario]));
  const opcoes = usuarios.map((usuario) => ({
    value: usuario.id,
    label: `${usuario.nome} — ${usuario.email} (${usuario.situacao})`,
  }));
  const primeiro = usuarios[0];

  const modal = openModal({
    title: 'Novo corretor',
    description: 'Vincule uma conta existente e complete os dados profissionais do corretor.',
    size: 'lg',
    body: `
      <form id="${formId}" data-corretor-form novalidate>
        <section class="form-section">
          <h3 class="form-section__title">Usuário vinculado</h3>
          ${campoSelect({
            label: 'Conta de acesso',
            name: 'usuarioId',
            value: primeiro.id,
            options: opcoes,
            required: true,
          })}
          <p class="field__hint" data-usuario-status-hint></p>
        </section>
        <section class="form-section">
          <h3 class="form-section__title">Dados profissionais</h3>
          <div class="form-grid">
            ${campo({
              label: 'Nome completo',
              name: 'nome',
              value: primeiro.nome,
              required: true,
              autocomplete: 'name',
            })}
            ${campo({
              label: 'CPF',
              name: 'cpf',
              required: true,
              placeholder: '000.000.000-00',
              inputmode: 'numeric',
              maxlength: '14',
            })}
            ${campo({
              label: 'CRECI',
              name: 'creci',
              required: true,
              placeholder: 'Ex.: 123456-F',
              maxlength: '40',
            })}
            ${campo({
              label: 'Telefone',
              name: 'telefone',
              type: 'tel',
              placeholder: '(00) 00000-0000',
              maxlength: '20',
              autocomplete: 'tel',
            })}
            ${campo({
              label: 'WhatsApp',
              name: 'whatsapp',
              type: 'tel',
              placeholder: '(00) 00000-0000',
              maxlength: '20',
            })}
            ${campo({
              label: 'E-mail profissional',
              name: 'email',
              type: 'email',
              placeholder: 'corretor@imobiliaria.com',
              hint: 'Usado para contato; não altera o e-mail de login da conta.',
              autocomplete: 'email',
            })}
            ${campo({
              label: 'Endereço',
              name: 'endereco',
              full: true,
              maxlength: '255',
            })}
          </div>
        </section>
        <section class="form-section">
          <h3 class="form-section__title">Situação</h3>
          ${campoCheckbox({
            label: 'Corretor ativo',
            name: 'ativo',
            checked: primeiro.ativo,
            hint: 'Ativar ou desativar o corretor também altera o acesso da conta vinculada.',
          })}
        </section>
        <div class="form-alert" data-form-error hidden></div>
      </form>
    `,
    footer: `
      <button type="button" class="btn btn--ghost" data-modal-close>Cancelar</button>
      <button type="submit" form="${formId}" class="btn btn--primary" data-form-submit>
        Cadastrar corretor
      </button>
    `,
  });

  const form = modal.element.querySelector(`#${formId}`);
  const submit = modal.element.querySelector('[data-form-submit]');
  const selectUsuario = form.querySelector('[name="usuarioId"]');
  const ativo = form.querySelector('[name="ativo"]');
  const hint = form.querySelector('[data-usuario-status-hint]');

  function atualizarVinculo() {
    const usuario = usuarioPorId.get(selectUsuario.value);
    if (!usuario) return;
    ativo.checked = usuario.ativo;
    hint.textContent = usuario.ativo
      ? `${usuario.nome} está com a conta ativa.`
      : `${usuario.nome} está com a conta inativa; marque "Corretor ativo" para reativar o acesso.`;
  }

  selectUsuario.addEventListener('change', atualizarVinculo);
  atualizarVinculo();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    esconderErroFormulario(modal);

    if (!form.reportValidity()) return;

    const dados = new FormData(form);
    const restaurar = definirCarregando(submit, 'Cadastrando…');

    try {
      await request('/api/corretores', {
        method: 'POST',
        body: {
          usuarioId: Number.parseInt(dados.get('usuarioId'), 10),
          nome: String(dados.get('nome') || '').trim(),
          cpf: String(dados.get('cpf') || '').trim(),
          creci: String(dados.get('creci') || '').trim(),
          telefone: String(dados.get('telefone') || '').trim(),
          whatsapp: String(dados.get('whatsapp') || '').trim(),
          email: String(dados.get('email') || '').trim(),
          endereco: String(dados.get('endereco') || '').trim(),
          ativo: dados.has('ativo'),
        },
      });

      modal.close('submit');
      avisarSucesso('Corretor cadastrado e vinculado à conta selecionada.');
      state.filtros.pagina = 1;
      await carregarCorretores();
    } catch (error) {
      if (tratarFalha(error)) return;
      mostrarErroFormulario(modal, error?.message || 'Não foi possível cadastrar o corretor.');
      restaurar();
    }
  });
}

async function abrirEditarCorretor(id) {
  const token = state.token;

  try {
    const dados = await request(`/api/corretores/${id}`);
    if (!tokenValido(token)) return;
    const { corretor } = dados;
    const formId = `corretor-form-${(sequenciaFormulario += 1)}`;
    const podeAlterarStatus = state.perms.desativar;

    const modal = openModal({
      title: 'Editar corretor',
      description: `Atualize os dados profissionais de ${corretor.nome}.`,
      size: 'lg',
      body: `
        <form id="${formId}" data-corretor-form novalidate>
          ${renderSecaoConta(corretor)}
          <section class="form-section">
            <h3 class="form-section__title">Dados profissionais</h3>
            <div class="form-grid">
              ${campo({
                label: 'Nome completo',
                name: 'nome',
                value: corretor.nome,
                required: true,
                autocomplete: 'name',
              })}
              ${campo({
                label: 'CPF',
                name: 'cpf',
                value: formatarCpf(corretor.cpf),
                required: true,
                placeholder: '000.000.000-00',
                inputmode: 'numeric',
                maxlength: '14',
              })}
              ${campo({
                label: 'CRECI',
                name: 'creci',
                value: corretor.creci,
                required: true,
                maxlength: '40',
              })}
              ${campo({
                label: 'Telefone',
                name: 'telefone',
                type: 'tel',
                value: corretor.telefone || '',
                placeholder: '(00) 00000-0000',
                maxlength: '20',
                autocomplete: 'tel',
              })}
              ${campo({
                label: 'WhatsApp',
                name: 'whatsapp',
                type: 'tel',
                value: corretor.whatsapp || '',
                placeholder: '(00) 00000-0000',
                maxlength: '20',
              })}
              ${campo({
                label: 'E-mail profissional',
                name: 'email',
                type: 'email',
                value: corretor.email || '',
                hint: 'Usado para contato; não altera o e-mail de login da conta.',
                autocomplete: 'email',
              })}
              ${campo({
                label: 'Endereço',
                name: 'endereco',
                value: corretor.endereco || '',
                full: true,
                maxlength: '255',
              })}
            </div>
          </section>
          ${
            podeAlterarStatus
              ? `<section class="form-section">
                  <h3 class="form-section__title">Situação</h3>
                  ${campoCheckbox({
                    label: 'Corretor ativo',
                    name: 'ativo',
                    checked: corretor.ativo,
                    hint: 'A alteração também ativa ou desativa a conta e encerra sessões quando necessário.',
                  })}
                </section>`
              : ''
          }
          <div class="form-alert" data-form-error hidden></div>
        </form>
      `,
      footer: `
        <button type="button" class="btn btn--ghost" data-modal-close>Cancelar</button>
        <button type="submit" form="${formId}" class="btn btn--primary" data-form-submit>
          Salvar alterações
        </button>
      `,
    });

    const form = modal.element.querySelector(`#${formId}`);
    const submit = modal.element.querySelector('[data-form-submit]');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      esconderErroFormulario(modal);

      if (!form.reportValidity()) return;

      const dados = new FormData(form);
      const payload = {
        nome: String(dados.get('nome') || '').trim(),
        cpf: String(dados.get('cpf') || '').trim(),
        creci: String(dados.get('creci') || '').trim(),
        telefone: String(dados.get('telefone') || '').trim(),
        whatsapp: String(dados.get('whatsapp') || '').trim(),
        email: String(dados.get('email') || '').trim(),
        endereco: String(dados.get('endereco') || '').trim(),
      };

      if (podeAlterarStatus) payload.ativo = dados.has('ativo');

      const restaurar = definirCarregando(submit);

      try {
        await request(`/api/corretores/${id}`, { method: 'PATCH', body: payload });
        modal.close('submit');
        avisarSucesso('Os dados do corretor foram atualizados.');
        await carregarCorretores();
      } catch (error) {
        if (tratarFalha(error)) return;
        mostrarErroFormulario(modal, error?.message || 'Não foi possível salvar o corretor.');
        restaurar();
      }
    });
  } catch (error) {
    avisarErro(error);
  }
}

function linhaInfo(rotulo, valorHtml) {
  return `
    <li>
      <span>${escapeHtml(rotulo)}</span>
      <span>${valorHtml}</span>
    </li>
  `;
}

function renderRecursoImovel(imovel) {
  const valor =
    imovel.finalidade === 'aluguel'
      ? imovel.valorAluguel
      : imovel.valorVenda || imovel.valorAluguel;

  return `
    <li class="corretor-resource">
      <div>
        <strong>${escapeHtml(imovel.titulo)}</strong>
        <span>${escapeHtml(imovel.codigoInterno)} · ${escapeHtml(
          [imovel.cidade, imovel.bairro].filter(Boolean).join(' · ') || 'Localização não informada'
        )}</span>
      </div>
      <div class="corretor-resource__meta">
        ${
          imovel.principal
            ? badge('Principal', 'gold')
            : badge(imovel.situacao || '—', 'neutral')
        }
        <span>${escapeHtml(formatarMoeda(valor))}</span>
      </div>
    </li>
  `;
}

function renderRecursoCliente(cliente) {
  return `
    <li class="corretor-resource">
      <div>
        <strong>${escapeHtml(cliente.nome)}</strong>
        <span>${escapeHtml(
          cliente.email || cliente.telefone || cliente.whatsapp || 'Sem contato informado'
        )}</span>
      </div>
      <div class="corretor-resource__meta">
        ${cliente.principal ? badge('Principal', 'gold') : ''}
        <span>${escapeHtml(
          cliente.finalidadeDesejada
            ? `Interesse: ${cliente.finalidadeDesejada}`
            : 'Interesse não informado'
        )}</span>
      </div>
    </li>
  `;
}

function renderListaVinculos(titulo, itens, total, renderItem, vazio, limite) {
  return `
    <section class="corretor-detail-section">
      <div class="corretor-detail-section__header">
        <h3>${escapeHtml(titulo)}</h3>
        ${badge(`${total}`, 'neutral')}
      </div>
      ${
        itens.length
          ? `<ul class="corretor-resource-list">${itens.map(renderItem).join('')}</ul>`
          : `<p class="corretor-detail-note">${escapeHtml(vazio)}</p>`
      }
      ${
        total > limite
          ? `<p class="corretor-detail-note">Exibindo os ${limite} vínculos mais recentes.</p>`
          : ''
      }
    </section>
  `;
}

async function abrirDetalheCorretor(id) {
  const token = state.token;

  try {
    const dados = await request(`/api/corretores/${id}`);
    if (!tokenValido(token)) return;
    const { corretor, imoveis, clientes, resumo } = dados;

    const modal = openModal({
      title: 'Detalhes do corretor',
      description: 'Dados profissionais, conta vinculada e carteira de atendimento.',
      size: 'lg',
      body: `
        <div class="corretor-detail-head">
          <span class="avatar">${escapeHtml(initials(corretor.nome))}</span>
          <div>
            <h3>${escapeHtml(corretor.nome)}</h3>
            <p>${escapeHtml(corretor.creci)} · ${escapeHtml(corretor.email || 'Sem e-mail profissional')}</p>
          </div>
          ${badgeSituacao(corretor.ativo)}
        </div>
        <div class="corretor-detail-grid">
          <section class="corretor-detail-section">
            <h3>Dados profissionais</h3>
            <ul class="admin-info-list">
              ${linhaInfo('CPF', escapeHtml(formatarCpf(corretor.cpf)))}
              ${linhaInfo('CRECI', escapeHtml(corretor.creci))}
              ${linhaInfo('Telefone', escapeHtml(corretor.telefone || '—'))}
              ${linhaInfo('WhatsApp', escapeHtml(corretor.whatsapp || '—'))}
              ${linhaInfo('E-mail profissional', escapeHtml(corretor.email || '—'))}
              ${linhaInfo('Endereço', escapeHtml(corretor.endereco || '—'))}
              ${linhaInfo('Cadastro', escapeHtml(formatarDataHora(corretor.criadoEm)))}
            </ul>
          </section>
          <section class="corretor-detail-section">
            <h3>Usuário vinculado</h3>
            <ul class="admin-info-list">
              ${linhaInfo('Nome da conta', escapeHtml(corretor.usuario?.nome || '—'))}
              ${linhaInfo('E-mail de login', escapeHtml(corretor.usuario?.email || '—'))}
              ${linhaInfo('Perfil', escapeHtml(corretor.usuario?.perfil || '—'))}
              ${linhaInfo('Situação da conta', badgeSituacao(corretor.usuario?.ativo))}
            </ul>
            <div class="notice notice--info">
              ${icon('shield', 18)}
              <p>Os imóveis e clientes abaixo respeitam as regras de visibilidade e as exceções de acesso da sua conta.</p>
            </div>
          </section>
        </div>
        ${renderListaVinculos(
          'Imóveis vinculados',
          imoveis,
          resumo.imoveis,
          renderRecursoImovel,
          'Nenhum imóvel vinculado ou acessível.',
          resumo.limiteVinculos
        )}
        ${renderListaVinculos(
          'Clientes vinculados',
          clientes,
          resumo.clientes,
          renderRecursoCliente,
          'Nenhum cliente vinculado ou acessível.',
          resumo.limiteVinculos
        )}
      `,
      footer: `
        <button type="button" class="btn btn--ghost" data-modal-close>Fechar</button>
        ${
          state.perms.editar
            ? `<button type="button" class="btn btn--primary" data-detalhe-editar>${icon(
                'edit',
                16
              )} Editar corretor</button>`
            : ''
        }
      `,
    });

    modal.element
      .querySelector('[data-detalhe-editar]')
      ?.addEventListener('click', () => {
        modal.close('edit');
        abrirEditarCorretor(id);
      });
  } catch (error) {
    avisarErro(error);
  }
}

async function alternarStatus(corretor) {
  const ativando = !corretor.ativo;
  const confirmado = await confirmDialog({
    title: ativando ? 'Ativar corretor' : 'Desativar corretor',
    message: ativando
      ? `Ativar ${corretor.nome}? A conta vinculada também será reativada.`
      : `Desativar ${corretor.nome}? A conta vinculada será desativada e as sessões serão encerradas.`,
    confirmLabel: ativando ? 'Ativar' : 'Desativar',
    tone: ativando ? 'primary' : 'danger',
  });

  if (!confirmado) return;

  try {
    await request(`/api/corretores/${corretor.id}/status`, {
      method: 'PATCH',
      body: { ativo: ativando },
    });
    avisarSucesso(
      ativando ? 'Corretor e conta reativados.' : 'Corretor desativado e sessões encerradas.'
    );
    await carregarCorretores();
  } catch (error) {
    avisarErro(error);
  }
}

function corretorPorId(id) {
  return (
    state.corretores?.corretores.find(
      (corretor) => String(corretor.id) === String(id)
    ) || null
  );
}

async function tratarClique(event) {
  const botao = event.target.closest('[data-action]');
  if (!botao) return;

  const id = botao.dataset.id;

  switch (botao.dataset.action) {
    case 'corretor-novo':
      abrirNovoCorretor();
      break;
    case 'corretor-recarregar':
      carregarCorretores();
      break;
    case 'corretor-detalhe':
      abrirDetalheCorretor(id);
      break;
    case 'corretor-editar':
      abrirEditarCorretor(id);
      break;
    case 'corretor-status': {
      const corretor = corretorPorId(id);
      if (corretor) alternarStatus(corretor);
      break;
    }
    case 'corretores-pagina': {
      const pagina = Number.parseInt(botao.dataset.page, 10);
      if (Number.isInteger(pagina) && pagina > 0) {
        state.filtros.pagina = pagina;
        carregarCorretores();
      }
      break;
    }
    default:
      break;
  }
}

async function tratarEnvio(event) {
  const filtro = event.target.closest('[data-corretores-filtro]');
  if (!filtro) return;

  event.preventDefault();
  const dados = new FormData(filtro);
  state.filtros = {
    ...state.filtros,
    busca: String(dados.get('busca') || '').trim(),
    status: String(dados.get('status') || ''),
    pagina: 1,
  };
  await carregarCorretores();
}

export default {
  title: 'Corretores',
  permission: 'corretores.visualizar',

  render({ session }) {
    reiniciarEstado();
    state.session = session;
    state.perms = calcularPermissoes(session);

    const actions = state.perms.criar
      ? `<button type="button" class="btn btn--primary" data-action="corretor-novo">${icon(
          'plus',
          16
        )} Novo corretor</button>`
      : '';

    return `
      <section class="view">
        ${renderPageHead({
          eyebrow: 'Equipe',
          title: 'Corretores',
          subtitle:
            'Gerencie os profissionais da imobiliária, o vínculo com contas de acesso e a carteira de imóveis e clientes.',
          actions,
        })}
        ${renderFiltros()}
        <div data-corretores-content>
          ${renderCarregando()}
        </div>
      </section>
    `;
  },

  mount(root) {
    state.root = root;
    state.abort = new AbortController();

    const { signal } = state.abort;
    root.addEventListener('click', tratarClique, { signal });
    root.addEventListener('submit', tratarEnvio, { signal });
    carregarCorretores();
  },
};
