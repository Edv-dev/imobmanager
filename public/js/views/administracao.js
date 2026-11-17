import { renderPageHead } from '../components/page.js';
import { icon } from '../components/icons.js';
import { showToast } from '../components/toast.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { request } from '../core/api.js';
import { possuiPermissao } from '../core/session.js';
import { escapeHtml } from '../core/utils.js';

const MODULOS = {
  administracao: 'Administração',
  atendimentos: 'Atendimentos',
  clientes: 'Clientes',
  corretores: 'Corretores',
  dashboard: 'Dashboard',
  imoveis: 'Imóveis',
  relatorios: 'Relatórios',
};

const ABAS = [
  { id: 'visao', label: 'Visão geral', icon: 'shield' },
  { id: 'usuarios', label: 'Usuários', icon: 'users', permissao: 'usuarios.gerenciar' },
  { id: 'perfis', label: 'Perfis e permissões', icon: 'lock', permissao: 'permissoes.gerenciar' },
  { id: 'visibilidade', label: 'Visibilidade', icon: 'eye', permissao: 'configuracoes.gerenciar' },
  { id: 'auditoria', label: 'Histórico', icon: 'history', permissao: 'auditoria.visualizar' },
];

const NUCLEO_ADMIN = [
  'administracao.visualizar',
  'usuarios.gerenciar',
  'permissoes.gerenciar',
];

const state = {
  session: null,
  perms: {},
  activeTab: 'visao',
  token: 0,
  root: null,
  abort: null,
  perfis: null,
  perfisOpcoes: null,
  usuarios: null,
  filtrosUsuarios: { busca: '', perfilId: '', status: '', pagina: 1, limite: 10 },
  auditoria: null,
  filtrosAuditoria: { busca: '', tipo: '', pagina: 1, limite: 15 },
  configuracoes: null,
  usuariosAcesso: null,
};

let sequenciaFormulario = 0;

function reiniciarEstado() {
  state.session = null;
  state.perms = {};
  state.activeTab = 'visao';
  state.token += 1;
  state.root = null;
  state.abort?.abort();
  state.abort = null;
  state.perfis = null;
  state.perfisOpcoes = null;
  state.usuarios = null;
  state.filtrosUsuarios = { busca: '', perfilId: '', status: '', pagina: 1, limite: 10 };
  state.auditoria = null;
  state.filtrosAuditoria = { busca: '', tipo: '', pagina: 1, limite: 15 };
  state.configuracoes = null;
  state.usuariosAcesso = null;
}

function calcularPermissoes(session) {
  return {
    usuarios: possuiPermissao(session, 'usuarios.gerenciar'),
    permissoes: possuiPermissao(session, 'permissoes.gerenciar'),
    configuracoes: possuiPermissao(session, 'configuracoes.gerenciar'),
    auditoria: possuiPermissao(session, 'auditoria.visualizar'),
  };
}

function abasDisponiveis() {
  return ABAS.filter((aba) => {
    if (!aba.permissao) return true;
    if (aba.id === 'visibilidade') {
      return state.perms.configuracoes || state.perms.permissoes;
    }
    return state.perms[aba.id === 'perfis' ? 'permissoes' : aba.id];
  });
}

function proximaPagina(dados) {
  return Math.max(1, Number(dados?.pagina) || 1);
}

function formatarDataHora(valor) {
  if (!valor) return 'Nunca';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(data);
}

function badge(texto, tom = 'neutral') {
  return `<span class="badge badge--${tom}">${escapeHtml(texto)}</span>`;
}

function badgeSituacao(ativo) {
  return ativo ? badge('Ativo', 'success') : badge('Inativo', 'danger');
}

function badgePerfil(perfil) {
  if (!perfil) return badge('Sem perfil', 'warning');
  return badge(perfil.nome, perfil.administrativo ? 'gold' : 'neutral');
}

function rotuloModulo(modulo) {
  return MODULOS[modulo] || modulo;
}

function textoDetalhes(detalhes) {
  if (!detalhes || Object.keys(detalhes).length === 0) return '';
  try {
    return JSON.stringify(detalhes, null, 2);
  } catch {
    return '';
  }
}

function renderCarregando() {
  return `
    <div class="admin-loading" role="status">
      <span class="admin-loading__spinner" aria-hidden="true"></span>
      <p>Carregando informações administrativas…</p>
    </div>
  `;
}

function renderErro(error) {
  return `
    <div class="card">
      <div class="card__body">
        <div class="empty-state empty-state--panel">
          <span class="empty-state__icon">${icon('alert-circle', 24)}</span>
          <p class="empty-state__title">Não foi possível carregar esta área</p>
          <p class="empty-state__text">${escapeHtml(
            error?.message || 'Ocorreu uma falha ao consultar o servidor.'
          )}</p>
          <button type="button" class="btn btn--ghost" data-action="admin-recarregar">
            ${icon('refresh', 16)} Tentar novamente
          </button>
        </div>
      </div>
    </div>
  `;
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

function definirConteudo(html) {
  const container = state.root?.querySelector('[data-admin-content]');
  if (container) container.innerHTML = html;
}

function tokenValido(token, aba) {
  return token === state.token && state.activeTab === aba;
}

function iniciarCarregamento() {
  state.token += 1;
  return state.token;
}

function campo({
  label,
  name,
  type = 'text',
  value = '',
  required = false,
  placeholder = '',
  hint = '',
  full = false,
  inputmode = '',
  maxlength = '',
  autocomplete = '',
}) {
  const id = `admin-campo-${name}-${(sequenciaFormulario += 1)}`;
  return `
    <div class="field${full ? ' field--full' : ''}">
      <label class="field__label" for="${id}">${escapeHtml(label)}${
        required ? ' <span class="field__required" aria-hidden="true">*</span>' : ''
      }</label>
      <input
        class="input"
        id="${id}"
        name="${escapeHtml(name)}"
        type="${escapeHtml(type)}"
        value="${escapeHtml(value ?? '')}"
        ${required ? 'required' : ''}
        ${placeholder ? `placeholder="${escapeHtml(placeholder)}"` : ''}
        ${inputmode ? `inputmode="${escapeHtml(inputmode)}"` : ''}
        ${maxlength ? `maxlength="${escapeHtml(maxlength)}"` : ''}
        ${autocomplete ? `autocomplete="${escapeHtml(autocomplete)}"` : ''}
      >
      ${hint ? `<p class="field__hint">${escapeHtml(hint)}</p>` : ''}
    </div>
  `;
}

function campoSelect({ label, name, value = '', options, required = false, full = false, hint = '' }) {
  const id = `admin-campo-${name}-${(sequenciaFormulario += 1)}`;
  return `
    <div class="field${full ? ' field--full' : ''}">
      <label class="field__label" for="${id}">${escapeHtml(label)}${
        required ? ' <span class="field__required" aria-hidden="true">*</span>' : ''
      }</label>
      <select class="select" id="${id}" name="${escapeHtml(name)}"${required ? ' required' : ''}>
        ${options
          .map(
            (opcao) =>
              `<option value="${escapeHtml(opcao.value)}"${
                String(opcao.value) === String(value) ? ' selected' : ''
              }>${escapeHtml(opcao.label)}</option>`
          )
          .join('')}
      </select>
      ${hint ? `<p class="field__hint">${escapeHtml(hint)}</p>` : ''}
    </div>
  `;
}

function campoCheckbox({ label, name, checked = false, hint = '' }) {
  const id = `admin-checkbox-${name}-${(sequenciaFormulario += 1)}`;
  return `
    <label class="checkbox field--full" for="${id}">
      <input type="checkbox" id="${id}" name="${escapeHtml(name)}"${checked ? ' checked' : ''}>
      <span>${escapeHtml(label)}${hint ? `<small class="checkbox__hint">${escapeHtml(hint)}</small>` : ''}</span>
    </label>
  `;
}

function botaoIcone({ action, id = '', nome, rotulo, perigo = false, desabilitado = false }) {
  return `
    <button
      type="button"
      class="icon-button icon-button--sm${perigo ? ' icon-button--danger' : ''}"
      data-action="${escapeHtml(action)}"
      ${id !== '' ? `data-id="${escapeHtml(id)}"` : ''}
      title="${escapeHtml(rotulo)}"
      aria-label="${escapeHtml(rotulo)}"
      ${desabilitado ? 'disabled' : ''}
    >${icon(nome, 16)}</button>
  `;
}

function renderPaginacao({ pagina, totalPaginas, total, limite, rotulo, acao }) {
  const inicio = total === 0 ? 0 : (pagina - 1) * limite + 1;
  const fim = Math.min(total, pagina * limite);
  return `
    <div class="pagination admin-pagination">
      <p>${total === 0 ? 'Nenhum registro encontrado' : `Mostrando ${inicio}–${fim} de ${total} ${escapeHtml(rotulo)}`}</p>
      <div class="pagination__controls">
        <button
          type="button"
          class="icon-button icon-button--sm"
          data-action="${escapeHtml(acao)}"
          data-page="${pagina - 1}"
          aria-label="Página anterior"
          ${pagina <= 1 ? 'disabled' : ''}
        >${icon('chevron-left', 16)}</button>
        <span class="pagination__page">Página ${pagina} de ${totalPaginas}</span>
        <button
          type="button"
          class="icon-button icon-button--sm"
          data-action="${escapeHtml(acao)}"
          data-page="${pagina + 1}"
          aria-label="Próxima página"
          ${pagina >= totalPaginas ? 'disabled' : ''}
        >${icon('chevron-right', 16)}</button>
      </div>
    </div>
  `;
}

function renderAbas() {
  const abas = abasDisponiveis();
  return `
    <div class="tabs" role="tablist" aria-label="Seções da administração">
      ${abas
        .map(
          (aba) => `
            <button
              type="button"
              class="tab${aba.id === state.activeTab ? ' is-active' : ''}"
              role="tab"
              id="aba-${aba.id}"
              aria-controls="painel-${aba.id}"
              aria-selected="${aba.id === state.activeTab}"
              data-admin-tab="${aba.id}"
            >${icon(aba.icon, 15)} ${escapeHtml(aba.label)}</button>
          `
        )
        .join('')}
    </div>
  `;
}

function renderKpi({ label, valor, nota, icone }) {
  return `
    <article class="kpi-card">
      <div class="kpi-card__top">
        <span class="kpi-card__label">${escapeHtml(label)}</span>
        <span class="kpi-icon">${icon(icone, 20)}</span>
      </div>
      <strong class="kpi-card__value">${escapeHtml(valor)}</strong>
      <p class="kpi-card__note">${escapeHtml(nota)}</p>
    </article>
  `;
}

function renderVisaoGeral(resumo) {
  const usuarios = resumo.usuarios || {};
  return `
    <div class="kpi-grid">
      ${renderKpi({
        label: 'Usuários ativos',
        valor: String(usuarios.ativos ?? 0),
        nota: `${usuarios.total ?? 0} contas cadastradas`,
        icone: 'users',
      })}
      ${renderKpi({
        label: 'Administradores',
        valor: String(usuarios.administradores ?? 0),
        nota: 'Acesso completo ao sistema',
        icone: 'shield',
      })}
      ${renderKpi({
        label: 'Corretores ativos',
        valor: String(usuarios.corretores ?? 0),
        nota: `${usuarios.inativos ?? 0} usuários inativos`,
        icone: 'briefcase',
      })}
      ${renderKpi({
        label: 'Sessões ativas',
        valor: String(resumo.sessoesAtivas ?? 0),
        nota: 'Acessos válidos neste momento',
        icone: 'activity',
      })}
    </div>

    <div class="admin-grid">
      <section class="card">
        <div class="card__header">
          <div>
            <h2>Visibilidade atual</h2>
            <p class="card__subtitle">Alcance padrão dos registros para os corretores.</p>
          </div>
        </div>
        <div class="card__body">
          <ul class="admin-info-list">
            <li>
              <span>Imóveis</span>
              ${badge(
                resumo.visibilidade?.imoveis === 'vinculados' ? 'Somente vinculados' : 'Todos os registros',
                resumo.visibilidade?.imoveis === 'vinculados' ? 'warning' : 'success'
              )}
            </li>
            <li>
              <span>Clientes</span>
              ${badge(
                resumo.visibilidade?.clientes === 'vinculados' ? 'Somente vinculados' : 'Todos os registros',
                resumo.visibilidade?.clientes === 'vinculados' ? 'warning' : 'success'
              )}
            </li>
          </ul>
          ${
            state.perms.configuracoes
              ? `<button type="button" class="btn btn--ghost btn--sm" data-admin-tab="visibilidade">${icon(
                  'eye',
                  15
                )} Revisar visibilidade</button>`
              : ''
          }
        </div>
      </section>

      <section class="card">
        <div class="card__header">
          <div>
            <h2>Como as permissões funcionam</h2>
            <p class="card__subtitle">A regra mais específica sempre prevalece.</p>
          </div>
        </div>
        <div class="card__body">
          <ol class="admin-steps">
            <li><strong>Exceção individual:</strong> permite ou nega uma permissão específica do usuário.</li>
            <li><strong>Perfil de acesso:</strong> define o conjunto padrão de permissões.</li>
            <li><strong>Módulo administrativo:</strong> só pode ser atribuído a perfis administrativos.</li>
          </ol>
          <p class="admin-note">${icon('info', 14)} Negações individuais prevalecem sobre a visibilidade geral e sobre os vínculos do corretor.</p>
        </div>
      </section>
    </div>

    <section class="card">
      <div class="card__header">
        <div>
          <h2>Atalhos administrativos</h2>
          <p class="card__subtitle">Ações disponíveis de acordo com as suas permissões.</p>
        </div>
      </div>
      <div class="card__body">
        <div class="admin-shortcuts">
          ${
            state.perms.usuarios
              ? `<button type="button" class="admin-shortcut" data-admin-tab="usuarios">${icon(
                  'users',
                  19
                )}<span><strong>Usuários</strong><small>Criar contas, editar dados e redefinir senhas.</small></span></button>`
              : ''
          }
          ${
            state.perms.permissoes
              ? `<button type="button" class="admin-shortcut" data-admin-tab="perfis">${icon(
                  'lock',
                  19
                )}<span><strong>Perfis e permissões</strong><small>Ajustar o conjunto de permissões de cada perfil.</small></span></button>`
              : ''
          }
          ${
            state.perms.configuracoes || state.perms.permissoes
              ? `<button type="button" class="admin-shortcut" data-admin-tab="visibilidade">${icon(
                  'eye',
                  19
                )}<span><strong>Visibilidade</strong><small>Definir o alcance dos registros e exceções por usuário.</small></span></button>`
              : ''
          }
          ${
            state.perms.auditoria
              ? `<button type="button" class="admin-shortcut" data-admin-tab="auditoria">${icon(
                  'history',
                  19
                )}<span><strong>Histórico</strong><small>Consultar os eventos administrativos registrados.</small></span></button>`
              : ''
          }
        </div>
      </div>
    </section>
  `;
}

function renderFiltrosUsuarios() {
  const perfis = state.perfisOpcoes || [];
  return `
    <form class="toolbar admin-toolbar" data-admin-filtro-usuarios>
      <div class="field toolbar__search">
        <label class="sr-only" for="admin-filtro-busca-usuarios">Buscar usuários</label>
        <div class="input-group">
          <span class="input-group__icon">${icon('search', 18)}</span>
          <input
            class="input"
            id="admin-filtro-busca-usuarios"
            name="busca"
            type="search"
            placeholder="Buscar por nome ou e-mail"
            value="${escapeHtml(state.filtrosUsuarios.busca)}"
          >
        </div>
      </div>
      <div class="field toolbar__select">
        <label class="sr-only" for="admin-filtro-perfil">Perfil</label>
        <select class="select" id="admin-filtro-perfil" name="perfilId">
          <option value="">Todos os perfis</option>
          ${perfis
            .map(
              (perfil) =>
                `<option value="${escapeHtml(perfil.id)}"${
                  String(perfil.id) === String(state.filtrosUsuarios.perfilId) ? ' selected' : ''
                }>${escapeHtml(perfil.nome)}</option>`
            )
            .join('')}
        </select>
      </div>
      <div class="field toolbar__select">
        <label class="sr-only" for="admin-filtro-status">Situação</label>
        <select class="select" id="admin-filtro-status" name="status">
          <option value=""${state.filtrosUsuarios.status === '' ? ' selected' : ''}>Todos os status</option>
          <option value="ativos"${state.filtrosUsuarios.status === 'ativos' ? ' selected' : ''}>Ativos</option>
          <option value="inativos"${state.filtrosUsuarios.status === 'inativos' ? ' selected' : ''}>Inativos</option>
        </select>
      </div>
      <div class="toolbar__actions">
        <button type="submit" class="btn btn--ghost">${icon('filter', 16)} Filtrar</button>
      </div>
    </form>
  `;
}

function renderLinhaUsuario(usuario) {
  const eu = String(usuario.id) === String(state.session?.usuario?.id);
  const acoes = [
    botaoIcone({
      action: 'admin-editar-usuario',
      id: usuario.id,
      nome: 'edit',
      rotulo: 'Editar usuário',
    }),
    state.perms.permissoes && !eu
      ? botaoIcone({
          action: 'admin-permissoes-usuario',
          id: usuario.id,
          nome: 'shield',
          rotulo: 'Permissões individuais',
        })
      : '',
    state.perms.permissoes && !usuario.perfil.administrativo && !eu
      ? botaoIcone({
          action: 'admin-acessos-usuario',
          id: usuario.id,
          nome: 'eye',
          rotulo: 'Exceções de acesso a registros',
        })
      : '',
    !eu
      ? botaoIcone({
          action: 'admin-resetar-senha',
          id: usuario.id,
          nome: 'key',
          rotulo: 'Redefinir senha',
        })
      : '',
    !eu
      ? botaoIcone({
          action: 'admin-alternar-status',
          id: usuario.id,
          nome: 'power',
          rotulo: usuario.ativo ? 'Desativar usuário' : 'Reativar usuário',
          perigo: usuario.ativo,
        })
      : '',
  ]
    .filter(Boolean)
    .join('');

  return `
    <tr>
      <td>
        <div class="cell-primary">
          <strong>${escapeHtml(usuario.nome)}${eu ? ' <span class="admin-self-tag">você</span>' : ''}</strong>
          <span>${escapeHtml(usuario.email)}</span>
        </div>
      </td>
      <td>${badgePerfil(usuario.perfil)}</td>
      <td>
        ${
          usuario.corretor
            ? `<div class="cell-primary"><strong>${escapeHtml(usuario.corretor.creci)}</strong><span>${escapeHtml(
                usuario.corretor.telefone || 'Sem telefone'
              )}</span></div>`
            : '<span class="admin-muted">—</span>'
        }
      </td>
      <td>${badgeSituacao(usuario.ativo)}</td>
      <td><span class="admin-muted">${escapeHtml(formatarDataHora(usuario.ultimoAcessoEm))}</span></td>
      <td>
        <div class="cell-actions">${acoes}</div>
      </td>
    </tr>
  `;
}

function renderPainelUsuarios(dados) {
  return `
    <section class="card">
      <div class="card__header">
        <div>
          <h2>Usuários do sistema</h2>
          <p class="card__subtitle">Contas, perfis, corretores vinculados e situação de acesso.</p>
        </div>
        ${
          state.perms.usuarios
            ? `<button type="button" class="btn btn--primary btn--sm" data-action="admin-novo-usuario">${icon(
                'user-plus',
                16
              )} Novo usuário</button>`
            : ''
        }
      </div>
      <div class="card__body card__body--flush">
        ${renderFiltrosUsuarios()}
        ${
          dados.usuarios.length === 0
            ? `<div class="empty-state"><span class="empty-state__icon">${icon(
                'users',
                24
              )}</span><p class="empty-state__title">Nenhum usuário encontrado</p><p class="empty-state__text">Ajuste os filtros ou cadastre uma nova conta.</p></div>`
            : `<div class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Usuário</th>
                      <th scope="col">Perfil</th>
                      <th scope="col">Corretor</th>
                      <th scope="col">Situação</th>
                      <th scope="col">Último acesso</th>
                      <th scope="col" class="is-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>${dados.usuarios.map(renderLinhaUsuario).join('')}</tbody>
                </table>
              </div>`
        }
        ${renderPaginacao({
          pagina: dados.pagina,
          totalPaginas: dados.totalPaginas,
          total: dados.total,
          limite: dados.limite,
          rotulo: 'usuários',
          acao: 'admin-pagina-usuarios',
        })}
      </div>
    </section>
  `;
}

function renderModulosPerfil(perfil, catalogo) {
  const porModulo = new Map();
  for (const permissao of catalogo) {
    if (!perfil.permissoes.includes(permissao.chave)) continue;
    porModulo.set(permissao.modulo, (porModulo.get(permissao.modulo) || 0) + 1);
  }

  if (porModulo.size === 0) {
    return '<p class="admin-muted">Nenhuma permissão atribuída.</p>';
  }

  return [...porModulo.entries()]
    .sort(([a], [b]) => rotuloModulo(a).localeCompare(rotuloModulo(b)))
    .map(
      ([modulo, total]) =>
        `<span class="admin-chip">${escapeHtml(rotuloModulo(modulo))}<strong>${total}</strong></span>`
    )
    .join('');
}

function renderPerfis(matriz) {
  return `
    <div class="permission-grid">
      ${matriz.perfis
        .map(
          (perfil) => `
            <article class="permission-card">
              <div class="permission-card__header">
                <span class="permission-card__icon">${icon(
                  perfil.administrativo ? 'shield' : 'briefcase',
                  19
                )}</span>
                <div class="admin-profile-heading">
                  <h3>${escapeHtml(perfil.nome)}</h3>
                  <div class="admin-profile-badges">
                    ${perfil.administrativo ? badge('Administrativo', 'gold') : badge('Operacional', 'neutral')}
                    ${badge(`${perfil.usuarios} usuário${perfil.usuarios === 1 ? '' : 's'}`, 'info')}
                  </div>
                </div>
              </div>
              <p>${escapeHtml(perfil.descricao || 'Perfil de acesso do sistema.')}</p>
              <div class="admin-chips">${renderModulosPerfil(perfil, matriz.permissoes)}</div>
              <div class="admin-card-actions">
                <button type="button" class="btn btn--ghost btn--sm" data-action="admin-editar-perfil" data-id="${escapeHtml(
                  perfil.id
                )}">${icon('lock', 15)} Editar permissões</button>
              </div>
            </article>
          `
        )
        .join('')}
    </div>

    <section class="card">
      <div class="card__header">
        <div>
          <h2>Catálogo de permissões</h2>
          <p class="card__subtitle">Permissões disponíveis, agrupadas por módulo do sistema.</p>
        </div>
      </div>
      <div class="card__body">
        <div class="admin-catalog">
          ${Object.entries(
            matriz.permissoes.reduce((grupos, permissao) => {
              grupos[permissao.modulo] = grupos[permissao.modulo] || [];
              grupos[permissao.modulo].push(permissao);
              return grupos;
            }, {})
          )
            .map(
              ([modulo, permissoes]) => `
                <div class="admin-catalog__group">
                  <h3>${escapeHtml(rotuloModulo(modulo))}</h3>
                  <ul>
                    ${permissoes
                      .map(
                        (permissao) =>
                          `<li><code>${escapeHtml(permissao.chave)}</code><span>${escapeHtml(
                            permissao.nome
                          )}</span></li>`
                      )
                      .join('')}
                  </ul>
                </div>
              `
            )
            .join('')}
        </div>
      </div>
    </section>
  `;
}

function renderVisibilidade(configuracoes, usuarios) {
  return `
    ${
      state.perms.configuracoes
        ? `<section class="card">
            <div class="card__header">
              <div>
                <h2>Regra geral de visibilidade</h2>
                <p class="card__subtitle">Define o que os corretores podem consultar por padrão.</p>
              </div>
            </div>
            <div class="card__body">
              <form class="visibility-form" data-admin-visibilidade>
                <div class="form-grid">
                  <div class="field">
                    <label class="field__label" for="admin-visibilidade-imoveis">Imóveis</label>
                    <select class="select" id="admin-visibilidade-imoveis" name="imoveis">
                      <option value="todos"${configuracoes.visibilidade.imoveis === 'todos' ? ' selected' : ''}>Todos os registros</option>
                      <option value="vinculados"${configuracoes.visibilidade.imoveis === 'vinculados' ? ' selected' : ''}>Somente registros vinculados</option>
                    </select>
                    <p class="field__hint">Registros vinculados ao corretor continuam visíveis; concessões individuais ampliam o acesso.</p>
                  </div>
                  <div class="field">
                    <label class="field__label" for="admin-visibilidade-clientes">Clientes</label>
                    <select class="select" id="admin-visibilidade-clientes" name="clientes">
                      <option value="todos"${configuracoes.visibilidade.clientes === 'todos' ? ' selected' : ''}>Todos os registros</option>
                      <option value="vinculados"${configuracoes.visibilidade.clientes === 'vinculados' ? ' selected' : ''}>Somente registros vinculados</option>
                    </select>
                    <p class="field__hint">Negar um registro individualmente prevalece sobre qualquer regra geral.</p>
                  </div>
                </div>
                <div class="notice notice--info">
                  ${icon('info', 18)}
                  <p>Administradores continuam com acesso completo. As regras valem para os demais perfis.</p>
                </div>
                <div class="visibility-actions">
                  <button type="submit" class="btn btn--primary" data-form-submit>${icon(
                    'check-circle',
                    16
                  )} Salvar visibilidade</button>
                </div>
              </form>
            </div>
          </section>`
        : `<div class="notice notice--warning">${icon(
            'lock',
            18
          )}<p>Você pode consultar as exceções por usuário, mas não possui permissão para alterar a regra geral de visibilidade.</p></div>`
    }

    ${
      state.perms.permissoes
        ? `<section class="card">
            <div class="card__header">
              <div>
                <h2>Exceções por usuário</h2>
                <p class="card__subtitle">Permita ou negue registros específicos, independentemente da regra geral.</p>
              </div>
            </div>
            <div class="card__body card__body--flush">
              ${
                usuarios.length === 0
                  ? `<div class="empty-state"><span class="empty-state__icon">${icon(
                      'users',
                      24
                    )}</span><p class="empty-state__title">Nenhum corretor cadastrado</p><p class="empty-state__text">As exceções por registro são aplicadas aos usuários não administrativos.</p></div>`
                  : `<div class="table-wrap">
                      <table class="data-table">
                        <thead><tr><th scope="col">Corretor</th><th scope="col">Perfil</th><th scope="col">Situação</th><th scope="col" class="is-right">Ações</th></tr></thead>
                        <tbody>
                          ${usuarios
                            .map(
                              (usuario) => `
                                <tr>
                                  <td><div class="cell-primary"><strong>${escapeHtml(
                                    usuario.nome
                                  )}</strong><span>${escapeHtml(usuario.email)}</span></div></td>
                                  <td>${badge(usuario.perfil, 'neutral')}</td>
                                  <td>${badgeSituacao(usuario.ativo)}</td>
                                  <td><div class="cell-actions"><button type="button" class="btn btn--ghost btn--sm" data-action="admin-acessos-usuario" data-id="${escapeHtml(
                                    usuario.id
                                  )}">${icon('eye', 15)} Gerenciar acessos</button></div></td>
                                </tr>
                              `
                            )
                            .join('')}
                        </tbody>
                      </table>
                    </div>`
              }
            </div>
          </section>`
        : ''
    }
  `;
}

function renderAuditoria(dados) {
  const filtros = state.filtrosAuditoria;
  return `
    <section class="card">
      <div class="card__header">
        <div>
          <h2>Histórico administrativo</h2>
          <p class="card__subtitle">Eventos de segurança e alterações registradas pelo sistema.</p>
        </div>
      </div>
      <div class="card__body card__body--flush">
        <form class="toolbar admin-toolbar" data-admin-filtro-auditoria>
          <div class="field toolbar__search">
            <label class="sr-only" for="admin-auditoria-busca">Buscar eventos</label>
            <div class="input-group">
              <span class="input-group__icon">${icon('search', 18)}</span>
              <input class="input" id="admin-auditoria-busca" name="busca" type="search" placeholder="Buscar por evento, usuário ou entidade" value="${escapeHtml(
                filtros.busca
              )}">
            </div>
          </div>
          <div class="field toolbar__select">
            <label class="sr-only" for="admin-auditoria-tipo">Tipo de evento</label>
            <select class="select" id="admin-auditoria-tipo" name="tipo">
              <option value="">Todos os tipos</option>
              ${dados.tipos
                .map(
                  (tipo) =>
                    `<option value="${escapeHtml(tipo)}"${tipo === filtros.tipo ? ' selected' : ''}>${escapeHtml(
                      tipo
                    )}</option>`
                )
                .join('')}
            </select>
          </div>
          <div class="toolbar__actions">
            <button type="submit" class="btn btn--ghost">${icon('filter', 16)} Filtrar</button>
          </div>
        </form>
        ${
          dados.eventos.length === 0
            ? `<div class="empty-state"><span class="empty-state__icon">${icon(
                'history',
                24
              )}</span><p class="empty-state__title">Nenhum evento encontrado</p><p class="empty-state__text">Ajuste os filtros para ampliar a consulta.</p></div>`
            : `<div class="table-wrap">
                <table class="data-table admin-audit-table">
                  <thead>
                    <tr>
                      <th scope="col">Data</th>
                      <th scope="col">Evento</th>
                      <th scope="col">Usuário</th>
                      <th scope="col">Registro</th>
                      <th scope="col">Resultado</th>
                      <th scope="col">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${dados.eventos
                      .map((evento) => {
                        const detalhes = textoDetalhes(evento.detalhes);
                        return `
                          <tr>
                            <td><span class="admin-nowrap">${escapeHtml(formatarDataHora(evento.data_hora))}</span></td>
                            <td><code class="admin-code">${escapeHtml(evento.tipo_operacao)}</code></td>
                            <td>${escapeHtml(evento.usuario_email || '—')}</td>
                            <td>
                              <div class="cell-primary">
                                <strong>${escapeHtml(evento.entidade || '—')}</strong>
                                <span>${escapeHtml(evento.registro_id || '—')}</span>
                              </div>
                            </td>
                            <td>${
                              evento.resultado === 'falha'
                                ? badge('Falha', 'danger')
                                : badge('Sucesso', 'success')
                            }</td>
                            <td>
                              ${
                                detalhes
                                  ? `<details class="admin-details"><summary>Ver detalhes</summary><pre>${escapeHtml(
                                      detalhes
                                    )}</pre></details>`
                                  : '<span class="admin-muted">—</span>'
                              }
                            </td>
                          </tr>
                        `;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>`
        }
        ${renderPaginacao({
          pagina: dados.pagina,
          totalPaginas: dados.totalPaginas,
          total: dados.total,
          limite: dados.limite,
          rotulo: 'eventos',
          acao: 'admin-pagina-auditoria',
        })}
      </div>
    </section>
  `;
}

async function carregarVisao() {
  const token = iniciarCarregamento();
  definirConteudo(renderCarregando());

  try {
    const resumo = await request('/api/administracao/resumo');
    if (!tokenValido(token, 'visao')) return;
    definirConteudo(renderVisaoGeral(resumo));
  } catch (error) {
    if (tratarFalha(error) || !tokenValido(token, 'visao')) return;
    definirConteudo(renderErro(error));
  }
}

async function carregarUsuarios() {
  const token = iniciarCarregamento();
  definirConteudo(renderCarregando());

  const filtros = state.filtrosUsuarios;
  const params = new URLSearchParams({
    pagina: String(filtros.pagina),
    limite: String(filtros.limite),
  });

  if (filtros.busca) params.set('busca', filtros.busca);
  if (filtros.perfilId) params.set('perfilId', String(filtros.perfilId));
  if (filtros.status) params.set('status', filtros.status);

  try {
    const [opcoes, dados] = await Promise.all([
      state.perfisOpcoes
        ? Promise.resolve({ perfis: state.perfisOpcoes })
        : request('/api/administracao/perfis/opcoes'),
      request(`/api/administracao/usuarios?${params.toString()}`),
    ]);

    if (!tokenValido(token, 'usuarios')) return;

    state.perfisOpcoes = opcoes.perfis;
    state.usuarios = dados;
    state.filtrosUsuarios.pagina = proximaPagina(dados);
    definirConteudo(renderPainelUsuarios(dados));
  } catch (error) {
    if (tratarFalha(error) || !tokenValido(token, 'usuarios')) return;
    definirConteudo(renderErro(error));
  }
}

async function carregarPerfis() {
  const token = iniciarCarregamento();
  definirConteudo(renderCarregando());

  try {
    const matriz = await request('/api/administracao/perfis');
    if (!tokenValido(token, 'perfis')) return;
    state.perfis = matriz;
    definirConteudo(renderPerfis(matriz));
  } catch (error) {
    if (tratarFalha(error) || !tokenValido(token, 'perfis')) return;
    definirConteudo(renderErro(error));
  }
}

async function carregarVisibilidade() {
  const token = iniciarCarregamento();
  definirConteudo(renderCarregando());

  try {
    const [configuracoes, usuarios] = await Promise.all([
      state.perms.configuracoes ? request('/api/administracao/configuracoes') : Promise.resolve(null),
      state.perms.permissoes
        ? request('/api/administracao/usuarios/opcoes?somenteNaoAdministrativos=true')
        : Promise.resolve({ usuarios: [] }),
    ]);

    if (!tokenValido(token, 'visibilidade')) return;

    state.configuracoes = configuracoes;
    state.usuariosAcesso = usuarios.usuarios || [];
    definirConteudo(renderVisibilidade(configuracoes, state.usuariosAcesso));
  } catch (error) {
    if (tratarFalha(error) || !tokenValido(token, 'visibilidade')) return;
    definirConteudo(renderErro(error));
  }
}

async function carregarAuditoria() {
  const token = iniciarCarregamento();
  definirConteudo(renderCarregando());

  const filtros = state.filtrosAuditoria;
  const params = new URLSearchParams({
    pagina: String(filtros.pagina),
    limite: String(filtros.limite),
  });

  if (filtros.busca) params.set('busca', filtros.busca);
  if (filtros.tipo) params.set('tipo', filtros.tipo);

  try {
    const dados = await request(`/api/administracao/auditoria?${params.toString()}`);
    if (!tokenValido(token, 'auditoria')) return;
    state.auditoria = dados;
    state.filtrosAuditoria.pagina = proximaPagina(dados);
    definirConteudo(renderAuditoria(dados));
  } catch (error) {
    if (tratarFalha(error) || !tokenValido(token, 'auditoria')) return;
    definirConteudo(renderErro(error));
  }
}

function carregarAba(aba = state.activeTab) {
  switch (aba) {
    case 'usuarios':
      return carregarUsuarios();
    case 'perfis':
      return carregarPerfis();
    case 'visibilidade':
      return carregarVisibilidade();
    case 'auditoria':
      return carregarAuditoria();
    default:
      return carregarVisao();
  }
}

function trocarAba(aba) {
  if (!abasDisponiveis().some((item) => item.id === aba)) return;
  state.activeTab = aba;
  state.token += 1;

  state.root.querySelectorAll('[data-admin-tab]').forEach((botao) => {
    const ativo = botao.dataset.adminTab === aba;
    botao.classList.toggle('is-active', ativo);
    botao.setAttribute('aria-selected', String(ativo));
  });

  const container = state.root.querySelector('[data-admin-content]');
  if (container) {
    container.id = `painel-${aba}`;
    container.setAttribute('aria-labelledby', `aba-${aba}`);
  }

  carregarAba(aba);
}

function opcoesPerfil() {
  return (state.perfisOpcoes || []).map((perfil) => ({
    value: perfil.id,
    label: perfil.nome,
  }));
}

function perfilPorId(id) {
  return (state.perfisOpcoes || []).find((perfil) => String(perfil.id) === String(id)) || null;
}

function atualizarSecaoCorretor(modal) {
  const form = modal.element.querySelector('[data-admin-usuario-form]');
  if (!form) return;
  const select = form.querySelector('[name="perfilId"]');
  const secao = form.querySelector('[data-corretor-section]');
  const perfil = perfilPorId(select.value);
  const exibir = perfil && !perfil.administrativo;

  secao.hidden = !exibir;
  secao.querySelectorAll('input').forEach((input) => {
    if (input.dataset.required === 'true') input.required = Boolean(exibir);
  });
}

async function abrirFormularioUsuario(usuarioId = null) {
  const editando = Boolean(usuarioId);
  const token = state.token;

  if (!state.perfisOpcoes) {
    try {
      const dados = await request('/api/administracao/perfis/opcoes');
      state.perfisOpcoes = dados.perfis;
    } catch (error) {
      avisarErro(error);
      return;
    }
  }

  let usuario = null;

  if (editando) {
    try {
      const dados = await request(`/api/administracao/usuarios/${usuarioId}`);
      usuario = dados.usuario;
    } catch (error) {
      avisarErro(error);
      return;
    }
  }

  if (token !== state.token) return;

  const formId = `admin-usuario-form-${(sequenciaFormulario += 1)}`;
  const perfilAtual =
    usuario?.perfil?.id ||
    state.perfisOpcoes.find((perfil) => !perfil.administrativo)?.id ||
    state.perfisOpcoes[0]?.id ||
    '';
  const perfilAdmin = perfilPorId(perfilAtual)?.administrativo;
  const corretor = usuario?.corretor || {};

  const modal = openModal({
    title: editando ? 'Editar usuário' : 'Novo usuário',
    description: editando
      ? 'Atualize os dados da conta, o perfil de acesso e o vínculo de corretor.'
      : 'Crie uma conta e, para perfis operacionais, o cadastro de corretor vinculado.',
    size: 'lg',
    body: `
      <form id="${formId}" data-admin-usuario-form novalidate>
        <section class="form-section">
          <h3 class="form-section__title">Conta de acesso</h3>
          <div class="form-grid">
            ${campo({
              label: 'Nome completo',
              name: 'nome',
              value: usuario?.nome || '',
              required: true,
              autocomplete: 'name',
            })}
            ${campo({
              label: 'E-mail',
              name: 'email',
              type: 'email',
              value: usuario?.email || '',
              required: true,
              autocomplete: 'email',
            })}
            ${
              editando
                ? ''
                : campo({
                    label: 'Senha inicial',
                    name: 'senha',
                    type: 'password',
                    required: true,
                    autocomplete: 'new-password',
                    hint: 'Mínimo de 12 caracteres, com letras e números. O usuário deverá trocá-la no primeiro acesso.',
                  })
            }
            ${campoSelect({
              label: 'Perfil de acesso',
              name: 'perfilId',
              value: perfilAtual,
              required: true,
              options: opcoesPerfil(),
            })}
            ${campoCheckbox({
              label: 'Conta ativa',
              name: 'ativo',
              checked: usuario ? usuario.ativo : true,
              hint: 'Contas inativas não podem iniciar sessão.',
            })}
            ${
              editando
                ? ''
                : campoCheckbox({
                    label: 'Exigir troca de senha no primeiro acesso',
                    name: 'deveTrocarSenha',
                    checked: true,
                  })
            }
          </div>
        </section>

        <section class="form-section" data-corretor-section${perfilAdmin ? ' hidden' : ''}>
          <h3 class="form-section__title">Cadastro de corretor</h3>
          <p class="form-section__hint">Obrigatório para perfis operacionais. O cadastro fica vinculado à conta de usuário.</p>
          <div class="form-grid">
            ${campo({
              label: 'CPF',
              name: 'cpf',
              value: corretor.cpf || '',
              required: !perfilAdmin,
              placeholder: '000.000.000-00',
              inputmode: 'numeric',
              maxlength: '14',
            })}
            ${campo({
              label: 'CRECI',
              name: 'creci',
              value: corretor.creci || '',
              required: !perfilAdmin,
              placeholder: 'Ex.: 123456-F',
              maxlength: '30',
            })}
            ${campo({
              label: 'Telefone',
              name: 'telefone',
              type: 'tel',
              value: corretor.telefone || '',
              placeholder: '(00) 00000-0000',
              maxlength: '20',
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
              label: 'E-mail do corretor',
              name: 'corretorEmail',
              type: 'email',
              value: corretor.email || '',
              hint: 'Se vazio, apenas o e-mail da conta será usado.',
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

        <div class="form-alert" data-form-error hidden></div>
      </form>
    `,
    footer: `
      <button type="button" class="btn btn--ghost" data-modal-close>Cancelar</button>
      <button type="submit" form="${formId}" class="btn btn--primary" data-form-submit>
        ${editando ? 'Salvar alterações' : 'Criar usuário'}
      </button>
    `,
  });

  modal.element.querySelectorAll('[data-corretor-section] input').forEach((input) => {
    input.dataset.required = input.required ? 'true' : 'false';
  });

  const form = modal.element.querySelector(`#${formId}`);
  const selectPerfil = form.querySelector('[name="perfilId"]');
  const submit = modal.element.querySelector('[data-form-submit]');

  selectPerfil.addEventListener('change', () => atualizarSecaoCorretor(modal));
  atualizarSecaoCorretor(modal);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    esconderErroFormulario(modal);

    if (!form.reportValidity()) return;

    const dados = new FormData(form);
    const perfilId = Number.parseInt(dados.get('perfilId'), 10);
    const perfil = perfilPorId(perfilId);
    const payload = {
      nome: String(dados.get('nome') || '').trim(),
      email: String(dados.get('email') || '').trim(),
      perfilId,
      ativo: dados.has('ativo'),
    };

    if (!editando) {
      payload.senha = String(dados.get('senha') || '');
      payload.deveTrocarSenha = dados.has('deveTrocarSenha');
    }

    if (perfil && !perfil.administrativo) {
      payload.corretor = {
        cpf: String(dados.get('cpf') || '').trim(),
        creci: String(dados.get('creci') || '').trim(),
        telefone: String(dados.get('telefone') || '').trim(),
        whatsapp: String(dados.get('whatsapp') || '').trim(),
        email: String(dados.get('corretorEmail') || '').trim(),
        endereco: String(dados.get('endereco') || '').trim(),
      };
    }

    const restaurar = definirCarregando(submit, editando ? 'Salvando…' : 'Criando…');

    try {
      await request(
        editando
          ? `/api/administracao/usuarios/${usuarioId}`
          : '/api/administracao/usuarios',
        {
          method: editando ? 'PATCH' : 'POST',
          body: payload,
        }
      );

      modal.close('submit');
      avisarSucesso(
        editando
          ? 'Os dados do usuário foram atualizados.'
          : 'A conta foi criada. O usuário deverá trocar a senha no primeiro acesso.'
      );
      if (state.activeTab === 'usuarios') await carregarUsuarios();
      if (state.activeTab === 'visibilidade') await carregarVisibilidade();
    } catch (error) {
      if (tratarFalha(error)) return;
      mostrarErroFormulario(modal, error.message);
      restaurar();
    }
  });
}

async function abrirPermissoesUsuario(usuarioId) {
  const token = state.token;

  try {
    const dados = await request(`/api/administracao/usuarios/${usuarioId}/permissoes`);
    if (token !== state.token) return;
    const { usuario, permissoes } = dados;
    const formId = `admin-permissoes-form-${(sequenciaFormulario += 1)}`;
    const grupos = permissoes.reduce((mapa, permissao) => {
      mapa[permissao.modulo] = mapa[permissao.modulo] || [];
      mapa[permissao.modulo].push(permissao);
      return mapa;
    }, {});

    const modal = openModal({
      title: 'Permissões individuais',
      description: `${usuario.nome} · ${usuario.perfil}. Exceções prevalecem sobre as permissões do perfil.`,
      size: 'lg',
      body: `
        <form id="${formId}" data-admin-permissoes-form novalidate>
          <div class="notice notice--info">
            ${icon('info', 18)}
            <p>Use <strong>Herdar</strong> para manter a regra do perfil. <strong>Permitir</strong> concede a permissão e <strong>Negar</strong> a remove, mesmo que o perfil a conceda.</p>
          </div>
          ${Object.entries(grupos)
            .map(
              ([modulo, lista]) => `
                <section class="permission-group">
                  <h3 class="form-section__title">${escapeHtml(rotuloModulo(modulo))}</h3>
                  <div class="permission-rows">
                    ${lista
                      .map((permissao) => {
                        const valor =
                          permissao.excecao === true
                            ? 'permitir'
                            : permissao.excecao === false
                            ? 'negar'
                            : 'herdar';
                        const restrito = !usuario.administrativo && permissao.modulo === 'administracao';
                        const nucleo =
                          usuario.administrativo &&
                          (state.perfis?.nucleoAdministrativo || NUCLEO_ADMIN).includes(
                            permissao.chave
                          );
                        return `
                          <div class="permission-row">
                            <div class="permission-row__text">
                              <strong>${escapeHtml(permissao.nome)}</strong>
                              <span>${escapeHtml(permissao.descricao || '')}</span>
                              <code>${escapeHtml(permissao.chave)}</code>
                            </div>
                            <div class="permission-row__current">
                              ${badge(permissao.herdado ? 'Herdada: sim' : 'Herdada: não', permissao.herdado ? 'success' : 'neutral')}
                            </div>
                            <select
                              class="select permission-row__select"
                              name="permissao-${escapeHtml(permissao.chave)}"
                              data-permission-key="${escapeHtml(permissao.chave)}"
                              ${restrito ? 'disabled' : ''}
                            >
                              <option value="herdar"${valor === 'herdar' ? ' selected' : ''}>Herdar do perfil</option>
                              <option value="permitir"${valor === 'permitir' ? ' selected' : ''}${nucleo ? ' disabled' : ''}>Permitir</option>
                              <option value="negar"${valor === 'negar' ? ' selected' : ''}${nucleo ? ' disabled' : ''}>Negar</option>
                            </select>
                            ${restrito ? '<span class="admin-muted admin-row-note">Exclusivo de perfis administrativos.</span>' : ''}
                          </div>
                        `;
                      })
                      .join('')}
                  </div>
                </section>
              `
            )
            .join('')}
          <div class="form-alert" data-form-error hidden></div>
        </form>
      `,
      footer: `
        <button type="button" class="btn btn--ghost" data-modal-close>Cancelar</button>
        <button type="submit" form="${formId}" class="btn btn--primary" data-form-submit>Salvar permissões</button>
      `,
    });

    const form = modal.element.querySelector(`#${formId}`);
    const submit = modal.element.querySelector('[data-form-submit]');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      esconderErroFormulario(modal);

      const excecoes = [...form.querySelectorAll('[data-permission-key]')]
        .filter((select) => select.value === 'permitir' || select.value === 'negar')
        .map((select) => ({
          chave: select.dataset.permissionKey,
          permitido: select.value === 'permitir',
        }));

      const restaurar = definirCarregando(submit);

      try {
        await request(`/api/administracao/usuarios/${usuarioId}/permissoes`, {
          method: 'PUT',
          body: { excecoes },
        });
        modal.close('submit');
        avisarSucesso('As permissões individuais foram atualizadas.');
        if (state.activeTab === 'usuarios') await carregarUsuarios();
      } catch (error) {
        if (tratarFalha(error)) return;
        mostrarErroFormulario(modal, error.message);
        restaurar();
      }
    });
  } catch (error) {
    avisarErro(error);
  }
}

function renderizarAcessoRecurso(recurso, tipo) {
  const titulo =
    tipo === 'imovel'
      ? `${recurso.codigo_interno} · ${recurso.titulo}`
      : recurso.nome_completo;
  const descricao =
    tipo === 'imovel'
      ? [recurso.cidade, recurso.bairro, recurso.situacao].filter(Boolean).join(' · ')
      : `Finalidade: ${recurso.finalidade_desejada || 'não informada'}`;
  const corretores = (recurso.corretores || []).map((corretor) => corretor.nome).join(', ');
  const valor =
    recurso.excecao === true ? 'permitir' : recurso.excecao === false ? 'negar' : 'herdar';

  return `
    <div
      class="access-row"
      data-access-text="${escapeHtml(`${titulo} ${descricao} ${corretores}`.toLowerCase())}"
    >
      <div class="access-row__text">
        <strong>${escapeHtml(titulo)}</strong>
        <span>${escapeHtml(descricao)}</span>
        <div class="access-row__tags">
          ${
            recurso.vinculado
              ? badge('Vinculado ao corretor', 'success')
              : badge('Sem vínculo', 'neutral')
          }
          ${corretores ? `<span class="admin-muted">Corretores: ${escapeHtml(corretores)}</span>` : ''}
        </div>
      </div>
      <select
        class="select access-row__select"
        data-access-tipo="${tipo}"
        data-access-id="${escapeHtml(recurso.id)}"
      >
        <option value="herdar"${valor === 'herdar' ? ' selected' : ''}>Padrão da visibilidade</option>
        <option value="permitir"${valor === 'permitir' ? ' selected' : ''}>Permitir acesso</option>
        <option value="negar"${valor === 'negar' ? ' selected' : ''}>Negar acesso</option>
      </select>
    </div>
  `;
}

async function abrirAcessosUsuario(usuarioId) {
  const token = state.token;

  try {
    const dados = await request(`/api/administracao/usuarios/${usuarioId}/acessos`);
    if (token !== state.token) return;
    const { usuario, imoveis, clientes } = dados;
    const formId = `admin-acessos-form-${(sequenciaFormulario += 1)}`;

    const modal = openModal({
      title: 'Exceções de acesso a registros',
      description: `${usuario.nome} · ${usuario.perfil}. A regra individual prevalece sobre a visibilidade e os vínculos.`,
      size: 'lg',
      body: `
        <form id="${formId}" data-admin-acessos-form novalidate>
          <div class="notice notice--info">
            ${icon('info', 18)}
            <p><strong>Padrão da visibilidade</strong> mantém a regra geral. <strong>Permitir</strong> libera o registro e <strong>Negar</strong> bloqueia o acesso, mesmo que haja vínculo com o corretor.</p>
          </div>
          <div class="access-groups">
            <section class="access-group">
              <div class="access-group__header">
                <h3>Imóveis <span class="admin-muted">(${imoveis.length})</span></h3>
                <div class="input-group access-search">
                  <span class="input-group__icon">${icon('search', 16)}</span>
                  <input class="input input--sm" type="search" placeholder="Filtrar imóveis" data-access-search="imovel">
                </div>
              </div>
              <div class="access-list" data-access-list="imovel">
                ${
                  imoveis.length
                    ? imoveis.map((item) => renderizarAcessoRecurso(item, 'imovel')).join('')
                    : '<p class="admin-muted">Nenhum imóvel cadastrado.</p>'
                }
              </div>
            </section>
            <section class="access-group">
              <div class="access-group__header">
                <h3>Clientes <span class="admin-muted">(${clientes.length})</span></h3>
                <div class="input-group access-search">
                  <span class="input-group__icon">${icon('search', 16)}</span>
                  <input class="input input--sm" type="search" placeholder="Filtrar clientes" data-access-search="cliente">
                </div>
              </div>
              <div class="access-list" data-access-list="cliente">
                ${
                  clientes.length
                    ? clientes.map((item) => renderizarAcessoRecurso(item, 'cliente')).join('')
                    : '<p class="admin-muted">Nenhum cliente cadastrado.</p>'
                }
              </div>
            </section>
          </div>
          <div class="form-alert" data-form-error hidden></div>
        </form>
      `,
      footer: `
        <button type="button" class="btn btn--ghost" data-modal-close>Cancelar</button>
        <button type="submit" form="${formId}" class="btn btn--primary" data-form-submit>Salvar acessos</button>
      `,
    });

    modal.element.querySelectorAll('[data-access-search]').forEach((input) => {
      input.addEventListener('input', () => {
        const tipo = input.dataset.accessSearch;
        const termo = input.value.trim().toLowerCase();
        modal.element.querySelectorAll(`[data-access-list="${tipo}"] .access-row`).forEach((linha) => {
          linha.hidden = Boolean(termo) && !linha.dataset.accessText.includes(termo);
        });
      });
    });

    const form = modal.element.querySelector(`#${formId}`);
    const submit = modal.element.querySelector('[data-form-submit]');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      esconderErroFormulario(modal);

      const coletar = (tipo) =>
        [...form.querySelectorAll(`[data-access-tipo="${tipo}"]`)]
          .filter((select) => select.value !== 'herdar')
          .map((select) => ({
            id: Number.parseInt(select.dataset.accessId, 10),
            permitido: select.value === 'permitir',
          }));

      const restaurar = definirCarregando(submit);

      try {
        await request(`/api/administracao/usuarios/${usuarioId}/acessos`, {
          method: 'PUT',
          body: {
            imoveis: coletar('imovel'),
            clientes: coletar('cliente'),
          },
        });
        modal.close('submit');
        avisarSucesso('As exceções de acesso foram atualizadas.');
        if (state.activeTab === 'visibilidade') await carregarVisibilidade();
        if (state.activeTab === 'usuarios') await carregarUsuarios();
      } catch (error) {
        if (tratarFalha(error)) return;
        mostrarErroFormulario(modal, error.message);
        restaurar();
      }
    });
  } catch (error) {
    avisarErro(error);
  }
}

function abrirRedefinirSenha(usuarioId, nome) {
  const formId = `admin-senha-form-${(sequenciaFormulario += 1)}`;
  const modal = openModal({
    title: 'Redefinir senha',
    description: `${nome} será obrigado a trocar a senha no próximo acesso.`,
    size: 'sm',
    body: `
      <form id="${formId}" data-admin-senha-form novalidate>
        <div class="form-grid">
          ${campo({
            label: 'Nova senha',
            name: 'novaSenha',
            type: 'password',
            required: true,
            autocomplete: 'new-password',
            full: true,
            hint: 'Mínimo de 12 caracteres, com letras e números.',
          })}
          ${campo({
            label: 'Confirmar nova senha',
            name: 'confirmacao',
            type: 'password',
            required: true,
            autocomplete: 'new-password',
            full: true,
          })}
        </div>
        <div class="form-alert" data-form-error hidden></div>
      </form>
    `,
    footer: `
      <button type="button" class="btn btn--ghost" data-modal-close>Cancelar</button>
      <button type="submit" form="${formId}" class="btn btn--primary" data-form-submit>Redefinir senha</button>
    `,
  });

  const form = modal.element.querySelector(`#${formId}`);
  const submit = modal.element.querySelector('[data-form-submit]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    esconderErroFormulario(modal);

    if (!form.reportValidity()) return;

    const dados = new FormData(form);
    const novaSenha = String(dados.get('novaSenha') || '');
    const confirmacao = String(dados.get('confirmacao') || '');

    if (novaSenha !== confirmacao) {
      mostrarErroFormulario(modal, 'A confirmação da senha não confere.');
      return;
    }

    const restaurar = definirCarregando(submit);

    try {
      const resultado = await request(
        `/api/administracao/usuarios/${usuarioId}/redefinir-senha`,
        { method: 'POST', body: { novaSenha } }
      );
      modal.close('submit');
      avisarSucesso(resultado.message || 'Senha redefinida e sessões encerradas.');
      if (state.activeTab === 'usuarios') await carregarUsuarios();
    } catch (error) {
      if (tratarFalha(error)) return;
      mostrarErroFormulario(modal, error.message);
      restaurar();
    }
  });
}

function abrirPerfilPermissoes(perfilId) {
  const matriz = state.perfis;
  const perfil = matriz?.perfis.find((item) => String(item.id) === String(perfilId));
  if (!perfil) return;

  const formId = `admin-perfil-form-${(sequenciaFormulario += 1)}`;
  const grupos = matriz.permissoes.reduce((mapa, permissao) => {
    mapa[permissao.modulo] = mapa[permissao.modulo] || [];
    mapa[permissao.modulo].push(permissao);
    return mapa;
  }, {});

  const modal = openModal({
    title: 'Permissões do perfil',
    description: `${perfil.nome} · ${perfil.descricao || 'Perfil de acesso'}`,
    size: 'lg',
    body: `
      <form id="${formId}" data-admin-perfil-form novalidate>
        ${
          perfil.administrativo
            ? `<div class="notice notice--warning">${icon(
                'shield',
                18
              )}<p>As permissões essenciais do perfil administrativo não podem ser removidas: ${escapeHtml(
                (matriz.nucleoAdministrativo || []).join(', ')
              )}.</p></div>`
            : `<div class="notice notice--info">${icon(
                'info',
                18
              )}<p>Permissões do módulo Administração não podem ser atribuídas a perfis operacionais.</p></div>`
        }
        ${Object.entries(grupos)
          .map(
            ([modulo, lista]) => `
              <section class="permission-group">
                <h3 class="form-section__title">${escapeHtml(rotuloModulo(modulo))}</h3>
                <div class="permission-checkboxes">
                  ${lista
                    .map((permissao) => {
                      const marcado = perfil.permissoes.includes(permissao.chave);
                      const essencial =
                        perfil.administrativo &&
                        (matriz.nucleoAdministrativo || NUCLEO_ADMIN).includes(
                          permissao.chave
                        );
                      const bloqueado = !perfil.administrativo && permissao.modulo === 'administracao';
                      return `
                        <label class="permission-check${bloqueado ? ' is-disabled' : ''}">
                          <input
                            type="checkbox"
                            name="permissao-${escapeHtml(permissao.chave)}"
                            data-permission-key="${escapeHtml(permissao.chave)}"
                            ${marcado ? ' checked' : ''}
                            ${bloqueado ? ' disabled' : ''}
                            ${essencial ? ' data-core="true"' : ''}
                          >
                          <span>
                            <strong>${escapeHtml(permissao.nome)}</strong>
                            <small>${escapeHtml(permissao.descricao || '')}</small>
                            <code>${escapeHtml(permissao.chave)}</code>
                          </span>
                        </label>
                      `;
                    })
                    .join('')}
                </div>
              </section>
            `
          )
          .join('')}
        <div class="form-alert" data-form-error hidden></div>
      </form>
    `,
    footer: `
      <button type="button" class="btn btn--ghost" data-modal-close>Cancelar</button>
      <button type="submit" form="${formId}" class="btn btn--primary" data-form-submit>Salvar permissões</button>
    `,
  });

  const form = modal.element.querySelector(`#${formId}`);
  const submit = modal.element.querySelector('[data-form-submit]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    esconderErroFormulario(modal);

    const permissoes = [...form.querySelectorAll('[data-permission-key]')]
      .filter((input) => input.checked || input.dataset.core === 'true')
      .map((input) => input.dataset.permissionKey);

    const restaurar = definirCarregando(submit);

    try {
      await request(`/api/administracao/perfis/${perfil.id}/permissoes`, {
        method: 'PUT',
        body: { permissoes },
      });
      modal.close('submit');
      avisarSucesso('As permissões do perfil foram atualizadas.');
      if (state.activeTab === 'perfis') await carregarPerfis();
    } catch (error) {
      if (tratarFalha(error)) return;
      mostrarErroFormulario(modal, error.message);
      restaurar();
    }
  });
}

async function alternarStatusUsuario(usuarioId, ativo, nome) {
  const confirmado = await confirmDialog({
    title: ativo ? 'Desativar usuário' : 'Reativar usuário',
    message: ativo
      ? `Desativar ${nome}? Todas as sessões ativas serão encerradas.`
      : `Reativar ${nome}? A conta poderá iniciar sessão novamente.`,
    confirmLabel: ativo ? 'Desativar' : 'Reativar',
    tone: ativo ? 'danger' : 'primary',
  });

  if (!confirmado) return;

  try {
    await request(`/api/administracao/usuarios/${usuarioId}/status`, {
      method: 'PATCH',
      body: { ativo: !ativo },
    });
    avisarSucesso(ativo ? 'Usuário desativado e sessões encerradas.' : 'Usuário reativado.');
    await carregarUsuarios();
  } catch (error) {
    avisarErro(error);
  }
}

async function salvarVisibilidade(form) {
  if (!form.reportValidity()) return;
  const submit = form.querySelector('[data-form-submit]');
  const restaurar = definirCarregando(submit);
  const dados = new FormData(form);

  try {
    await request('/api/administracao/configuracoes/visibilidade', {
      method: 'PUT',
      body: {
        imoveis: String(dados.get('imoveis')),
        clientes: String(dados.get('clientes')),
      },
    });
    avisarSucesso('A regra de visibilidade foi atualizada.');
    await carregarVisibilidade();
  } catch (error) {
    avisarErro(error);
    restaurar();
  }
}

function usuarioPorId(id) {
  return state.usuarios?.usuarios.find((usuario) => String(usuario.id) === String(id)) || null;
}

async function tratarClique(event) {
  const aba = event.target.closest('[data-admin-tab]');
  if (aba) {
    trocarAba(aba.dataset.adminTab);
    return;
  }

  const botao = event.target.closest('[data-action]');
  if (!botao) return;

  const id = botao.dataset.id;
  const usuario = id ? usuarioPorId(id) : null;

  switch (botao.dataset.action) {
    case 'admin-recarregar':
      carregarAba();
      break;
    case 'admin-novo-usuario':
      abrirFormularioUsuario();
      break;
    case 'admin-editar-usuario':
      abrirFormularioUsuario(id);
      break;
    case 'admin-permissoes-usuario':
      abrirPermissoesUsuario(id);
      break;
    case 'admin-acessos-usuario':
      abrirAcessosUsuario(id);
      break;
    case 'admin-resetar-senha':
      abrirRedefinirSenha(id, usuario?.nome || 'Usuário');
      break;
    case 'admin-alternar-status':
      if (usuario) alternarStatusUsuario(id, usuario.ativo, usuario.nome);
      break;
    case 'admin-editar-perfil':
      abrirPerfilPermissoes(id);
      break;
    case 'admin-pagina-usuarios': {
      const pagina = Number.parseInt(botao.dataset.page, 10);
      if (Number.isInteger(pagina) && pagina > 0) {
        state.filtrosUsuarios.pagina = pagina;
        carregarUsuarios();
      }
      break;
    }
    case 'admin-pagina-auditoria': {
      const pagina = Number.parseInt(botao.dataset.page, 10);
      if (Number.isInteger(pagina) && pagina > 0) {
        state.filtrosAuditoria.pagina = pagina;
        carregarAuditoria();
      }
      break;
    }
    default:
      break;
  }
}

async function tratarEnvio(event) {
  const filtroUsuarios = event.target.closest('[data-admin-filtro-usuarios]');
  if (filtroUsuarios) {
    event.preventDefault();
    const dados = new FormData(filtroUsuarios);
    state.filtrosUsuarios = {
      ...state.filtrosUsuarios,
      busca: String(dados.get('busca') || '').trim(),
      perfilId: String(dados.get('perfilId') || ''),
      status: String(dados.get('status') || ''),
      pagina: 1,
    };
    await carregarUsuarios();
    return;
  }

  const filtroAuditoria = event.target.closest('[data-admin-filtro-auditoria]');
  if (filtroAuditoria) {
    event.preventDefault();
    const dados = new FormData(filtroAuditoria);
    state.filtrosAuditoria = {
      ...state.filtrosAuditoria,
      busca: String(dados.get('busca') || '').trim(),
      tipo: String(dados.get('tipo') || ''),
      pagina: 1,
    };
    await carregarAuditoria();
    return;
  }

  const visibilidade = event.target.closest('[data-admin-visibilidade]');
  if (visibilidade) {
    event.preventDefault();
    await salvarVisibilidade(visibilidade);
  }
}

export default {
  title: 'Administração',
  permission: 'administracao.visualizar',

  render({ session }) {
    reiniciarEstado();
    state.session = session;
    state.perms = calcularPermissoes(session);

    const abas = abasDisponiveis();
    state.activeTab = abas[0]?.id || 'visao';

    return `
      <section class="view">
        ${renderPageHead({
          eyebrow: 'Sistema',
          title: 'Administração',
          subtitle:
            'Gerencie usuários, perfis, permissões, visibilidade dos dados e consulte o histórico de auditoria.',
        })}
        ${renderAbas()}
        <div
          data-admin-content
          id="painel-${state.activeTab}"
          role="tabpanel"
          aria-labelledby="aba-${state.activeTab}"
        >
          ${renderCarregando()}
        </div>
      </section>
    `;
  },

  mount(root, { session }) {
    state.root = root;
    state.session = session;
    state.abort = new AbortController();

    const { signal } = state.abort;
    root.addEventListener('click', tratarClique, { signal });
    root.addEventListener('submit', tratarEnvio, { signal });
    carregarAba(state.activeTab);
  },
};
