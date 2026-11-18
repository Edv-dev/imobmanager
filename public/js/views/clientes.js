import { renderPageHead } from '../components/page.js';
import { icon } from '../components/icons.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { request } from '../core/api.js';
import { escapeHtml, initials } from '../core/utils.js';
import { possuiPermissao } from '../core/session.js';

const FILTROS_INICIAIS = {
  busca: '',
  tipo: '',
  finalidade: '',
  pagina: 1,
  limite: 10,
};

const ROTULOS_TIPO = {
  comprador: 'Comprador',
  vendedor: 'Vendedor',
  locatario: 'Locatário',
  proprietario: 'Proprietário',
  investidor: 'Investidor',
  outro: 'Outro',
};

const ROTULOS_FINALIDADE = {
  venda: 'Venda',
  aluguel: 'Aluguel',
  ambos: 'Venda e aluguel',
};

const ROTULOS_ATENDIMENTO = {
  ligacao: 'Ligação',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  visita: 'Visita',
  reuniao: 'Reunião',
  outro: 'Outro',
};

const ROTULOS_STATUS_ATENDIMENTO = {
  agendado: 'Agendado',
  realizado: 'Realizado',
  cancelado: 'Cancelado',
};

const TONS_STATUS_ATENDIMENTO = {
  agendado: 'warning',
  realizado: 'success',
  cancelado: 'neutral',
};

const ROTULOS_EVENTO = {
  'cliente.criado': 'Cliente cadastrado',
  'cliente.atualizado': 'Dados atualizados',
  'cliente.excluido': 'Cliente excluído',
  'cliente.atendimento_registrado': 'Atendimento registrado',
};

const state = {
  session: null,
  root: null,
  token: 0,
  abort: null,
  perms: {},
  clientes: null,
  filtros: { ...FILTROS_INICIAIS },
  detalhe: null,
  detalheModal: null,
};

let sequenciaFormulario = 0;

function reiniciarEstado() {
  state.session = null;
  state.token += 1;
  state.root = null;
  state.abort?.abort();
  state.abort = null;
  state.perms = {};
  state.clientes = null;
  state.filtros = { ...FILTROS_INICIAIS };
  state.detalhe = null;
  state.detalheModal = null;
}

function calcularPermissoes(session) {
  return {
    criar: possuiPermissao(session, 'clientes.criar'),
    editar: possuiPermissao(session, 'clientes.editar'),
    excluir: possuiPermissao(session, 'clientes.excluir'),
    atendimentos: possuiPermissao(session, 'atendimentos.criar'),
    atendimentosVisualizar: possuiPermissao(session, 'atendimentos.visualizar'),
    auditoria: possuiPermissao(session, 'auditoria.visualizar'),
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
  const container = state.root?.querySelector('[data-clientes-content]');
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

function rotuloTipo(tipo) {
  return ROTULOS_TIPO[tipo] || 'Não informado';
}

function rotuloFinalidade(finalidade) {
  return ROTULOS_FINALIDADE[finalidade] || 'Não informada';
}

function faixaPreco(cliente) {
  if (cliente.faixaPrecoMin === null && cliente.faixaPrecoMax === null) {
    return 'Faixa não informada';
  }

  return `${formatarMoeda(cliente.faixaPrecoMin)} – ${formatarMoeda(cliente.faixaPrecoMax)}`;
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
      <p>Carregando clientes…</p>
    </div>
  `;
}

function renderErro(error) {
  return `
    <div class="card">
      <div class="card__body">
        <div class="empty-state empty-state--panel">
          <span class="empty-state__icon">${icon('alert-circle', 24)}</span>
          <p class="empty-state__title">Não foi possível carregar os clientes</p>
          <p class="empty-state__text">${escapeHtml(
            error?.message || 'Ocorreu uma falha ao consultar o servidor.'
          )}</p>
          <button type="button" class="btn btn--ghost" data-action="cliente-recarregar">
            ${icon('refresh', 16)} Tentar novamente
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderFiltros() {
  return `
    <form class="toolbar" data-clientes-filtro>
      <div class="field toolbar__search">
        <label class="sr-only" for="clientes-busca">Buscar clientes</label>
        <div class="input-group">
          <span class="input-group__icon">${icon('search', 18)}</span>
          <input
            class="input"
            id="clientes-busca"
            name="busca"
            type="search"
            placeholder="Buscar por nome, CPF, e-mail, telefone ou localização"
            value="${escapeHtml(state.filtros.busca)}"
          >
        </div>
      </div>
      <div class="field toolbar__select">
        <label class="sr-only" for="clientes-tipo">Tipo de interesse</label>
        <select class="select" id="clientes-tipo" name="tipo">
          <option value=""${state.filtros.tipo === '' ? ' selected' : ''}>Todos os tipos</option>
          ${Object.entries(ROTULOS_TIPO)
            .map(
              ([valor, rotulo]) =>
                `<option value="${valor}"${
                  state.filtros.tipo === valor ? ' selected' : ''
                }>${rotulo}</option>`
            )
            .join('')}
        </select>
      </div>
      <div class="field toolbar__select">
        <label class="sr-only" for="clientes-finalidade">Finalidade desejada</label>
        <select class="select" id="clientes-finalidade" name="finalidade">
          <option value=""${state.filtros.finalidade === '' ? ' selected' : ''}>Todas as finalidades</option>
          ${Object.entries(ROTULOS_FINALIDADE)
            .map(
              ([valor, rotulo]) =>
                `<option value="${valor}"${
                  state.filtros.finalidade === valor ? ' selected' : ''
                }>${rotulo}</option>`
            )
            .join('')}
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
          : `Mostrando ${inicio}–${fim} de ${dados.total} clientes`
      }</p>
      <div class="pagination__controls">
        <button
          type="button"
          class="icon-button icon-button--sm"
          data-action="clientes-pagina"
          data-page="${dados.pagina - 1}"
          aria-label="Página anterior"
          ${dados.pagina <= 1 ? 'disabled' : ''}
        >${icon('chevron-left', 16)}</button>
        <span class="pagination__page">Página ${dados.pagina} de ${dados.totalPaginas}</span>
        <button
          type="button"
          class="icon-button icon-button--sm"
          data-action="clientes-pagina"
          data-page="${dados.pagina + 1}"
          aria-label="Próxima página"
          ${dados.pagina >= dados.totalPaginas ? 'disabled' : ''}
        >${icon('chevron-right', 16)}</button>
      </div>
    </div>
  `;
}

function renderLinha(cliente) {
  const principal =
    cliente.corretores.find((corretor) => corretor.principal) || cliente.corretores[0];
  const totalCorretores = cliente.corretores.length;

  const acoes = [
    botaoIcone({
      action: 'cliente-detalhe',
      id: cliente.id,
      nome: 'eye',
      rotulo: 'Consultar detalhes',
    }),
    state.perms.editar
      ? botaoIcone({
          action: 'cliente-editar',
          id: cliente.id,
          nome: 'edit',
          rotulo: 'Editar cliente',
        })
      : '',
    state.perms.excluir
      ? botaoIcone({
          action: 'cliente-excluir',
          id: cliente.id,
          nome: 'trash',
          rotulo: 'Excluir cliente',
          perigo: true,
        })
      : '',
  ].join('');

  return `
    <tr>
      <td>
        <div class="cliente-cell">
          <span class="avatar avatar--sm">${escapeHtml(initials(cliente.nome))}</span>
          <div class="cell-primary">
            <strong>${escapeHtml(cliente.nome)}</strong>
            <span>${escapeHtml(formatarCpf(cliente.cpf))}</span>
            <span>${escapeHtml(cliente.email || 'Sem e-mail')}</span>
          </div>
        </div>
      </td>
      <td>
        <div class="cell-primary">
          <strong>${escapeHtml(cliente.telefone || cliente.whatsapp || 'Sem telefone')}</strong>
          <span>${escapeHtml(
            cliente.telefone && cliente.whatsapp ? `WhatsApp: ${cliente.whatsapp}` : 'Contato'
          )}</span>
        </div>
      </td>
      <td>
        <div class="cliente-interest">
          ${badge(rotuloTipo(cliente.tipoInteresse), 'neutral')}
          ${badge(rotuloFinalidade(cliente.finalidadeDesejada), 'info')}
          <span>${escapeHtml(faixaPreco(cliente))}</span>
        </div>
      </td>
      <td>
        <div class="cell-primary">
          <strong>${escapeHtml(cliente.localizacaoDesejada || 'Não informada')}</strong>
          <span>${escapeHtml(cliente.endereco || 'Sem endereço cadastrado')}</span>
        </div>
      </td>
      <td>
        <div class="cell-primary">
          <strong>${escapeHtml(principal?.nome || 'Sem responsável')}</strong>
          <span>${
            totalCorretores > 1
              ? `+${totalCorretores - 1} corretor(es)`
              : principal?.creci
                ? escapeHtml(principal.creci)
                : '—'
          }</span>
        </div>
      </td>
      <td class="is-right"><div class="cell-actions">${acoes}</div></td>
    </tr>
  `;
}

function renderLista(dados) {
  const corpo = dados.clientes.length
    ? `<div class="table-wrap">
        <table class="data-table cliente-table">
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">Contato</th>
              <th scope="col">Interesse</th>
              <th scope="col">Localização</th>
              <th scope="col">Responsável</th>
              <th scope="col" class="is-right">Ações</th>
            </tr>
          </thead>
          <tbody>${dados.clientes.map(renderLinha).join('')}</tbody>
        </table>
      </div>`
    : `<div class="empty-state empty-state--panel">
        <span class="empty-state__icon">${icon('user', 24)}</span>
        <p class="empty-state__title">Nenhum cliente encontrado</p>
        <p class="empty-state__text">${
          state.filtros.busca || state.filtros.tipo || state.filtros.finalidade
            ? 'Ajuste a busca ou os filtros para ampliar a consulta.'
            : 'Cadastre o primeiro cliente para começar a organizar o relacionamento.'
        }</p>
        ${
          state.perms.criar &&
          !state.filtros.busca &&
          !state.filtros.tipo &&
          !state.filtros.finalidade
            ? `<button type="button" class="btn btn--primary" data-action="cliente-novo">${icon(
                'plus',
                16
              )} Novo cliente</button>`
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

async function carregarClientes() {
  const token = iniciarCarregamento();
  definirConteudo(renderCarregando());

  const params = new URLSearchParams({
    pagina: String(state.filtros.pagina),
    limite: String(state.filtros.limite),
  });

  for (const chave of ['busca', 'tipo', 'finalidade']) {
    if (state.filtros[chave] !== '') params.set(chave, String(state.filtros[chave]));
  }

  try {
    const dados = await request(`/api/clientes?${params.toString()}`);
    if (!tokenValido(token)) return;
    state.clientes = dados;
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
  min = '',
  step = '',
  inputmode = '',
}) {
  const id = `cliente-campo-${(sequenciaFormulario += 1)}`;
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
        ${hint ? `aria-describedby="${id}-hint"` : ''}
        ${maxlength ? `maxlength="${escapeHtml(maxlength)}"` : ''}
        ${min !== '' ? `min="${escapeHtml(min)}"` : ''}
        ${step !== '' ? `step="${escapeHtml(step)}"` : ''}
        ${inputmode ? `inputmode="${escapeHtml(inputmode)}"` : ''}
      >
      ${hint ? `<p class="field__hint" id="${id}-hint">${escapeHtml(hint)}</p>` : ''}
    </div>
  `;
}

function campoSelect({ label, name, value = '', options, required = false, full = false }) {
  const id = `cliente-campo-${(sequenciaFormulario += 1)}`;
  return `
    <div class="field${full ? ' field--full' : ''}">
      <label class="field__label" for="${id}">
        ${escapeHtml(label)}${required ? ' <span class="field__required" aria-hidden="true">*</span>' : ''}
      </label>
      <select class="select" id="${id}" name="${escapeHtml(name)}"${required ? ' required' : ''}>
        ${options
          .map(
            ([opcaoValor, opcaoRotulo]) => `
              <option value="${escapeHtml(opcaoValor)}"${
                String(opcaoValor) === String(value) ? ' selected' : ''
              }>${escapeHtml(opcaoRotulo)}</option>
            `
          )
          .join('')}
      </select>
    </div>
  `;
}

function campoTextarea({ label, name, value = '', full = false, rows = 4, hint = '', required = false }) {
  const id = `cliente-campo-${(sequenciaFormulario += 1)}`;
  return `
    <div class="field${full ? ' field--full' : ''}">
      <label class="field__label" for="${id}">
        ${escapeHtml(label)}${required ? ' <span class="field__required" aria-hidden="true">*</span>' : ''}
      </label>
      <textarea
        class="textarea"
        id="${id}"
        name="${escapeHtml(name)}"
        rows="${rows}"
        ${required ? 'required' : ''}
        ${hint ? `aria-describedby="${id}-hint"` : ''}
      >${escapeHtml(value || '')}</textarea>
      ${hint ? `<p class="field__hint" id="${id}-hint">${escapeHtml(hint)}</p>` : ''}
    </div>
  `;
}

function renderSelecaoCorretores(disponiveis, atuais, administrador, novo = false) {
  if (!administrador) {
    return `
      <ul class="corretor-resource-list">
        ${
          atuais.length
            ? atuais
                .map(
                  (corretor) => `
                    <li class="corretor-resource">
                      <div>
                        <strong>${escapeHtml(corretor.nome)}</strong>
                        <span>${escapeHtml(corretor.creci || 'CRECI não informado')}</span>
                      </div>
                      <div class="corretor-resource__meta">
                        ${corretor.principal ? badge('Principal', 'gold') : badge(corretor.ativo ? 'Ativo' : 'Inativo', corretor.ativo ? 'success' : 'neutral')}
                      </div>
                    </li>
                  `
                )
                .join('')
            : `<li class="corretor-detail-note">${
                novo
                  ? 'Você será vinculado automaticamente como responsável ao cadastrar o cliente.'
                  : 'Nenhum corretor responsável vinculado.'
              }</li>`
        }
      </ul>
      <div class="notice notice--info">
        ${icon('info', 18)}
        <p>O vínculo de outros corretores é gerenciado pelo administrador.</p>
      </div>
    `;
  }

  if (!disponiveis.length) {
    return `
      <div class="notice notice--warning">
        ${icon('alert-circle', 18)}
        <p>Nenhum corretor ativo disponível. Cadastre ou ative um corretor antes de atribuir responsáveis.</p>
      </div>
    `;
  }

  const selecionados = new Map(atuais.map((corretor) => [String(corretor.id), corretor]));
  const principalAtual = atuais.find((corretor) => corretor.principal)?.id ?? atuais[0]?.id;

  return `
    <div class="imovel-corretores-selector" data-corretores-selector>
      ${disponiveis
        .map((corretor) => {
          const atual = selecionados.get(String(corretor.id));
          const marcado = Boolean(atual);
          const principal = atual?.principal || String(principalAtual) === String(corretor.id);

          return `
            <div class="imovel-corretor-option">
              <label class="checkbox">
                <input type="checkbox" name="corretores" value="${corretor.id}"${marcado ? ' checked' : ''}>
                <span>
                  <strong>${escapeHtml(corretor.nome)}</strong>
                  <small>${escapeHtml(corretor.creci)}${corretor.email ? ` · ${escapeHtml(corretor.email)}` : ''}</small>
                </span>
              </label>
              <label class="imovel-principal">
                <input type="radio" name="corretorPrincipal" value="${corretor.id}"${principal && marcado ? ' checked' : ''}${marcado ? '' : ' disabled'}>
                Principal
              </label>
            </div>
          `;
        })
        .join('')}
    </div>
    <p class="field__hint">Marque um ou mais corretores e escolha o responsável principal.</p>
  `;
}

function inicializarSeletorCorretores(form) {
  const seletor = form.querySelector('[data-corretores-selector]');
  if (!seletor) return;

  const caixas = [...seletor.querySelectorAll('input[name="corretores"]')];

  function atualizar() {
    const marcados = caixas.filter((caixa) => caixa.checked);

    for (const caixa of caixas) {
      const radio = seletor.querySelector(
        `input[name="corretorPrincipal"][value="${caixa.value}"]`
      );
      if (!radio) continue;
      radio.disabled = !caixa.checked;
      if (!caixa.checked) radio.checked = false;
    }

    const algumPrincipal = caixas.some(
      (caixa) =>
        caixa.checked &&
        seletor.querySelector(`input[name="corretorPrincipal"][value="${caixa.value}"]`)?.checked
    );

    if (!algumPrincipal && marcados.length > 0) {
      const radio = seletor.querySelector(
        `input[name="corretorPrincipal"][value="${marcados[0].value}"]`
      );
      if (radio) radio.checked = true;
    }
  }

  seletor.addEventListener('change', atualizar);
  atualizar();
}

function coletarCorretores(form) {
  const ids = [...form.querySelectorAll('input[name="corretores"]:checked')].map((input) =>
    Number.parseInt(input.value, 10)
  );
  const principal = form.querySelector('input[name="corretorPrincipal"]:checked');

  return {
    corretores: ids,
    corretorPrincipalId: principal ? Number.parseInt(principal.value, 10) : undefined,
  };
}

function renderSelecaoImoveis(disponiveis, atuais) {
  const selecionados = new Set(atuais.map((imovel) => String(imovel.id)));

  if (!disponiveis.length) {
    return `
      <div class="notice notice--warning">
        ${icon('alert-circle', 18)}
        <p>Nenhum imóvel disponível para vincular. Cadastre um imóvel ou ajuste a visibilidade.</p>
      </div>
    `;
  }

  return `
    <div class="cliente-imoveis-selector" data-imoveis-selector>
      <div class="field">
        <label class="sr-only" for="cliente-imoveis-busca">Filtrar imóveis</label>
        <div class="input-group">
          <span class="input-group__icon">${icon('search', 18)}</span>
          <input
            class="input"
            id="cliente-imoveis-busca"
            type="search"
            placeholder="Filtrar por código, título, cidade ou bairro"
            data-imoveis-busca
          >
        </div>
      </div>
      <div class="cliente-imoveis-lista">
        ${disponiveis
          .map(
            (imovel) => `
              <label
                class="cliente-imovel-option"
                data-imovel-option
                data-busca="${escapeHtml(
                  `${imovel.codigo} ${imovel.titulo} ${imovel.cidade || ''} ${imovel.bairro || ''}`.toLowerCase()
                )}"
              >
                <input type="checkbox" name="imoveisInteresse" value="${imovel.id}"${
                  selecionados.has(String(imovel.id)) ? ' checked' : ''
                }>
                <span>
                  <strong>${escapeHtml(imovel.codigo)} · ${escapeHtml(imovel.titulo)}</strong>
                  <small>${escapeHtml(
                    [imovel.cidade, imovel.bairro].filter(Boolean).join(' · ') ||
                      'Localização não informada'
                  )} · ${escapeHtml(imovel.situacao)}</small>
                </span>
              </label>
            `
          )
          .join('')}
      </div>
      <p class="field__hint" data-imoveis-vazio hidden>Nenhum imóvel corresponde ao filtro.</p>
      <p class="field__hint">Os imóveis de interesse ficam disponíveis no detalhe do cliente e nos atendimentos.</p>
    </div>
  `;
}

function inicializarFiltroImoveis(form) {
  const seletor = form.querySelector('[data-imoveis-selector]');
  if (!seletor) return;

  const busca = seletor.querySelector('[data-imoveis-busca]');
  const opcoes = [...seletor.querySelectorAll('[data-imovel-option]')];
  const vazio = seletor.querySelector('[data-imoveis-vazio]');

  busca?.addEventListener('input', () => {
    const termo = busca.value.trim().toLowerCase();
    let visiveis = 0;

    for (const opcao of opcoes) {
      const combina = !termo || opcao.dataset.busca.includes(termo);
      opcao.hidden = !combina;
      if (combina) visiveis += 1;
    }

    if (vazio) vazio.hidden = visiveis > 0;
  });
}

function coletarImoveisInteresse(form) {
  return [...form.querySelectorAll('input[name="imoveisInteresse"]:checked')].map((input) =>
    Number.parseInt(input.value, 10)
  );
}

function montarPayload(form) {
  const dados = new FormData(form);
  const texto = (nome) => String(dados.get(nome) || '').trim();

  const payload = {
    nome: texto('nome'),
    cpf: texto('cpf'),
    telefone: texto('telefone'),
    whatsapp: texto('whatsapp'),
    email: texto('email'),
    endereco: texto('endereco'),
    tipoInteresse: texto('tipoInteresse'),
    finalidadeDesejada: texto('finalidadeDesejada'),
    faixaPrecoMin: texto('faixaPrecoMin'),
    faixaPrecoMax: texto('faixaPrecoMax'),
    localizacaoDesejada: texto('localizacaoDesejada'),
    observacoes: texto('observacoes'),
    imoveisInteresse: coletarImoveisInteresse(form),
  };

  if (state.session?.usuario?.administrativo) {
    Object.assign(payload, coletarCorretores(form));
  }

  return payload;
}

function renderFormulario(dados, opcoes) {
  const cliente = dados || {
    nome: '',
    cpf: '',
    telefone: '',
    whatsapp: '',
    email: '',
    endereco: '',
    tipoInteresse: '',
    finalidadeDesejada: '',
    faixaPrecoMin: null,
    faixaPrecoMax: null,
    localizacaoDesejada: '',
    observacoes: '',
    corretores: [],
    imoveisInteresse: [],
  };
  const administrador = Boolean(state.session?.usuario?.administrativo);
  const formId = `cliente-form-${(sequenciaFormulario += 1)}`;

  const body = `
    <form id="${formId}" data-cliente-form novalidate>
      <section class="form-section">
        <h3 class="form-section__title">Identificação</h3>
        <div class="form-grid">
          ${campo({
            label: 'Nome completo',
            name: 'nome',
            value: cliente.nome,
            required: true,
            full: true,
            maxlength: '150',
          })}
          ${campo({
            label: 'CPF',
            name: 'cpf',
            value: formatarCpf(cliente.cpf) === '—' ? cliente.cpf || '' : formatarCpf(cliente.cpf),
            required: true,
            inputmode: 'numeric',
            maxlength: '14',
            hint: 'O CPF é único entre clientes ativos.',
          })}
          ${campo({
            label: 'Telefone',
            name: 'telefone',
            value: cliente.telefone || '',
            type: 'tel',
            placeholder: '(00) 00000-0000',
            maxlength: '20',
          })}
          ${campo({
            label: 'WhatsApp',
            name: 'whatsapp',
            value: cliente.whatsapp || '',
            type: 'tel',
            placeholder: '(00) 00000-0000',
            maxlength: '20',
          })}
          ${campo({
            label: 'E-mail',
            name: 'email',
            value: cliente.email || '',
            type: 'email',
            maxlength: '254',
          })}
          ${campo({
            label: 'Endereço',
            name: 'endereco',
            value: cliente.endereco || '',
            full: true,
            maxlength: '255',
          })}
        </div>
      </section>

      <section class="form-section">
        <h3 class="form-section__title">Interesse de compra ou locação</h3>
        <div class="form-grid">
          ${campoSelect({
            label: 'Tipo de interesse',
            name: 'tipoInteresse',
            value: cliente.tipoInteresse || '',
            options: [['', 'Não informado'], ...Object.entries(ROTULOS_TIPO)],
          })}
          ${campoSelect({
            label: 'Finalidade desejada',
            name: 'finalidadeDesejada',
            value: cliente.finalidadeDesejada || '',
            options: [['', 'Não informada'], ...Object.entries(ROTULOS_FINALIDADE)],
          })}
          ${campo({
            label: 'Faixa de preço mínima (R$)',
            name: 'faixaPrecoMin',
            value: cliente.faixaPrecoMin ?? '',
            type: 'number',
            min: '0',
            step: '0.01',
          })}
          ${campo({
            label: 'Faixa de preço máxima (R$)',
            name: 'faixaPrecoMax',
            value: cliente.faixaPrecoMax ?? '',
            type: 'number',
            min: '0',
            step: '0.01',
          })}
          ${campo({
            label: 'Localização desejada',
            name: 'localizacaoDesejada',
            value: cliente.localizacaoDesejada || '',
            full: true,
            maxlength: '180',
            placeholder: 'Ex.: Centro de São Paulo, bairro, cidade',
          })}
          ${campoTextarea({
            label: 'Observações',
            name: 'observacoes',
            value: cliente.observacoes || '',
            full: true,
            rows: 4,
            hint: 'Até 4000 caracteres. Evite registrar dados sensíveis desnecessários.',
          })}
        </div>
      </section>

      <section class="form-section">
        <h3 class="form-section__title">Corretores responsáveis</h3>
        ${renderSelecaoCorretores(opcoes.corretores, cliente.corretores || [], administrador, !id)}
      </section>

      <section class="form-section">
        <h3 class="form-section__title">Imóveis de interesse</h3>
        ${renderSelecaoImoveis(opcoes.imoveis, cliente.imoveisInteresse || [])}
      </section>

      <div class="form-alert" data-form-error hidden></div>
    </form>
  `;

  return { formId, body };
}

async function abrirFormularioCliente({ id = null } = {}) {
  const token = state.token;
  const administrador = Boolean(state.session?.usuario?.administrativo);
  let detalhe = null;
  let corretores = [];
  let imoveis = [];

  try {
    const [dadosCliente, opcoesCorretores, opcoesImoveis] = await Promise.all([
      id ? request(`/api/clientes/${id}`) : Promise.resolve(null),
      administrador
        ? request('/api/clientes/corretores-opcoes')
        : Promise.resolve({ corretores: [] }),
      request('/api/clientes/imoveis-opcoes'),
    ]);

    detalhe = dadosCliente || null;
    corretores = opcoesCorretores?.corretores || [];
    imoveis = opcoesImoveis?.imoveis || [];
  } catch (error) {
    avisarErro(error);
    return;
  }

  if (!tokenValido(token)) return;

  const { formId, body } = renderFormulario(detalhe, { corretores, imoveis });

  const modal = openModal({
    title: id ? 'Editar cliente' : 'Novo cliente',
    description: id
      ? `Atualize os dados de ${detalhe.cliente.nome}.`
      : 'Cadastre o cliente com identificação, interesse, responsáveis e imóveis de interesse.',
    size: 'lg',
    body,
    footer: `
      <button type="button" class="btn btn--ghost" data-modal-close>Cancelar</button>
      <button type="submit" form="${formId}" class="btn btn--primary" data-form-submit>
        ${id ? 'Salvar alterações' : 'Cadastrar cliente'}
      </button>
    `,
  });

  const form = modal.element.querySelector(`#${formId}`);
  const submit = modal.element.querySelector('[data-form-submit]');

  inicializarSeletorCorretores(form);
  inicializarFiltroImoveis(form);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    esconderErroFormulario(modal);

    if (!form.reportValidity()) return;

    const payload = montarPayload(form);
    const restaurar = definirCarregando(submit, id ? 'Salvando…' : 'Cadastrando…');

    try {
      await request(id ? `/api/clientes/${id}` : '/api/clientes', {
        method: id ? 'PATCH' : 'POST',
        body: payload,
      });

      modal.close('submit');
      avisarSucesso(
        id ? 'Os dados do cliente foram atualizados.' : 'Cliente cadastrado com sucesso.'
      );
      state.filtros.pagina = id ? state.filtros.pagina : 1;
      await carregarClientes();
    } catch (error) {
      if (tratarFalha(error)) return;
      mostrarErroFormulario(
        modal,
        error?.message || 'Não foi possível salvar o cliente.'
      );
      restaurar();
    }
  });
}

function renderRecursoImovel(imovel) {
  return `
    <li class="corretor-resource">
      <div>
        <strong>${escapeHtml(imovel.titulo)}</strong>
        <span>${escapeHtml(imovel.codigo)} · ${escapeHtml(
          [imovel.cidade, imovel.bairro].filter(Boolean).join(' · ') ||
            'Localização não informada'
        )}</span>
      </div>
      <div class="corretor-resource__meta">
        ${badge(imovel.situacao || '—', 'neutral')}
        <span>${escapeHtml(formatarMoeda(imovel.valorVenda ?? imovel.valorAluguel))}</span>
      </div>
    </li>
  `;
}

function renderAtendimentos(atendimentos, total = atendimentos.length) {
  return `
    <section class="corretor-detail-section">
      <div class="corretor-detail-section__header">
        <h3>Atendimentos</h3>
        ${badge(`${total}`, 'neutral')}
      </div>
      ${
        atendimentos.length
          ? `<ul class="cliente-atendimentos">
              ${atendimentos
                .map(
                  (atendimento) => `
                    <li class="cliente-atendimento">
                      <div class="cliente-atendimento__head">
                        <div>
                          <strong>${escapeHtml(
                            ROTULOS_ATENDIMENTO[atendimento.tipo] || atendimento.tipo
                          )}</strong>
                          <span>${escapeHtml(formatarDataHora(atendimento.dataAtendimento))}</span>
                        </div>
                        ${badge(
                          ROTULOS_STATUS_ATENDIMENTO[atendimento.status] || atendimento.status,
                          TONS_STATUS_ATENDIMENTO[atendimento.status] || 'neutral'
                        )}
                      </div>
                      <p>${escapeHtml(atendimento.descricao)}</p>
                      <div class="cliente-atendimento__meta">
                        <span>${icon('user', 14)} ${escapeHtml(
                          atendimento.corretor?.nome || 'Corretor não informado'
                        )}</span>
                        ${
                          atendimento.imovel
                            ? `<span>${icon('home', 14)} ${escapeHtml(
                                `${atendimento.imovel.codigo} · ${atendimento.imovel.titulo}`
                              )}</span>`
                            : ''
                        }
                      </div>
                      ${
                        atendimento.observacoes
                          ? `<p class="cliente-atendimento__note">${escapeHtml(atendimento.observacoes)}</p>`
                          : ''
                      }
                    </li>
                  `
                )
                .join('')}
            </ul>`
          : `<p class="corretor-detail-note">Nenhum atendimento registrado.</p>`
      }
      ${
        total > atendimentos.length
          ? `<p class="corretor-detail-note">Exibindo os ${atendimentos.length} atendimentos mais recentes.</p>`
          : ''
      }
    </section>
  `;
}

function renderHistorico(eventos) {
  if (!eventos) return '';

  return `
    <section class="corretor-detail-section">
      <div class="corretor-detail-section__header">
        <h3>Histórico de alterações</h3>
        ${badge(`${eventos.length}`, 'neutral')}
      </div>
      ${
        eventos.length
          ? `<ul class="imovel-history">
              ${eventos
                .map(
                  (evento) => `
                    <li>
                      <div>
                        <strong>${escapeHtml(ROTULOS_EVENTO[evento.tipoOperacao] || evento.tipoOperacao)}</strong>
                        <span>${escapeHtml(evento.usuarioEmail || 'Sistema')} · ${escapeHtml(formatarDataHora(evento.dataHora))}</span>
                      </div>
                      ${badge(evento.resultado, evento.resultado === 'sucesso' ? 'success' : 'danger')}
                    </li>
                  `
                )
                .join('')}
            </ul>`
          : `<p class="corretor-detail-note">Nenhum evento registrado.</p>`
      }
    </section>
  `;
}

function renderDetalhe(dados, eventos) {
  const cliente = dados.cliente;
  const corretores = dados.corretores || [];
  const imoveis = dados.imoveisInteresse || [];
  const atendimentos = dados.atendimentos || [];

  const listaCorretores = corretores.length
    ? `<ul class="corretor-resource-list">
        ${corretores
          .map(
            (corretor) => `
              <li class="corretor-resource">
                <div>
                  <strong>${escapeHtml(corretor.nome)}</strong>
                  <span>${escapeHtml(corretor.creci || 'CRECI não informado')}${corretor.email ? ` · ${escapeHtml(corretor.email)}` : ''}</span>
                </div>
                <div class="corretor-resource__meta">
                  ${corretor.principal ? badge('Principal', 'gold') : ''}
                  ${badge(corretor.ativo ? 'Ativo' : 'Inativo', corretor.ativo ? 'success' : 'neutral')}
                </div>
              </li>
            `
          )
          .join('')}
      </ul>`
    : `<p class="corretor-detail-note">Nenhum corretor responsável vinculado.</p>`;

  const listaImoveis = imoveis.length
    ? `<ul class="corretor-resource-list">${imoveis.map(renderRecursoImovel).join('')}</ul>`
    : `<p class="corretor-detail-note">Nenhum imóvel de interesse vinculado.</p>`;

  return `
    <div class="cliente-detail-head">
      <span class="avatar">${escapeHtml(initials(cliente.nome))}</span>
      <div>
        <h3>${escapeHtml(cliente.nome)}</h3>
        <p>${escapeHtml(formatarCpf(cliente.cpf))} · ${escapeHtml(cliente.email || 'Sem e-mail')}</p>
        <div class="imovel-badges">
          ${badge(rotuloTipo(cliente.tipoInteresse), 'neutral')}
          ${badge(rotuloFinalidade(cliente.finalidadeDesejada), 'info')}
          ${badge(faixaPreco(cliente), 'gold')}
        </div>
      </div>
    </div>

    <div class="corretor-detail-grid">
      <section class="corretor-detail-section">
        <h3>Contato e identificação</h3>
        <ul class="admin-info-list">
          <li><span>CPF</span><span>${escapeHtml(formatarCpf(cliente.cpf))}</span></li>
          <li><span>Telefone</span><span>${escapeHtml(cliente.telefone || '—')}</span></li>
          <li><span>WhatsApp</span><span>${escapeHtml(cliente.whatsapp || '—')}</span></li>
          <li><span>E-mail</span><span>${escapeHtml(cliente.email || '—')}</span></li>
          <li><span>Endereço</span><span>${escapeHtml(cliente.endereco || '—')}</span></li>
          <li><span>Cadastro</span><span>${escapeHtml(formatarDataHora(cliente.criadoEm))}</span></li>
        </ul>
      </section>

      <section class="corretor-detail-section">
        <h3>Interesse</h3>
        <ul class="admin-info-list">
          <li><span>Tipo</span><span>${escapeHtml(rotuloTipo(cliente.tipoInteresse))}</span></li>
          <li><span>Finalidade</span><span>${escapeHtml(rotuloFinalidade(cliente.finalidadeDesejada))}</span></li>
          <li><span>Faixa de preço</span><span>${escapeHtml(faixaPreco(cliente))}</span></li>
          <li><span>Localização</span><span>${escapeHtml(cliente.localizacaoDesejada || '—')}</span></li>
          <li><span>Atualizado em</span><span>${escapeHtml(formatarDataHora(cliente.atualizadoEm))}</span></li>
        </ul>
        ${
          cliente.observacoes
            ? `<p class="imovel-descricao">${escapeHtml(cliente.observacoes)}</p>`
            : ''
        }
      </section>
    </div>

    <section class="corretor-detail-section">
      <h3>Corretores responsáveis</h3>
      ${listaCorretores}
    </section>

    <section class="corretor-detail-section">
      <div class="corretor-detail-section__header">
        <h3>Imóveis de interesse</h3>
        ${badge(`${imoveis.length}`, 'neutral')}
      </div>
      ${listaImoveis}
    </section>

    ${state.perms.atendimentosVisualizar ? renderAtendimentos(atendimentos, dados.resumo?.atendimentos ?? atendimentos.length) : ''}
    ${renderHistorico(eventos)}
  `;
}

async function carregarDetalheNoModal(modal, id) {
  try {
    const dados = await request(`/api/clientes/${id}`);
    state.detalhe = dados;

    let eventos = null;

    if (state.perms.auditoria) {
      try {
        const historico = await request(`/api/clientes/${id}/historico`);
        eventos = historico.eventos;
      } catch {
        eventos = null;
      }
    }

    modal.body.innerHTML = renderDetalhe(dados, eventos);
  } catch (error) {
    avisarErro(error);
    modal.close('erro');
  }
}

async function abrirDetalheCliente(id) {
  const modal = openModal({
    title: 'Detalhes do cliente',
    description: 'Dados de contato, interesse, responsáveis, imóveis e atendimentos.',
    size: 'lg',
    body: renderCarregando(),
    footer: `
      <button type="button" class="btn btn--ghost" data-modal-close>Fechar</button>
      ${
        state.perms.atendimentos
          ? `<button type="button" class="btn btn--ghost" data-detalhe-atendimento>${icon(
              'calendar',
              16
            )} Registrar atendimento</button>`
          : ''
      }
      ${
        state.perms.excluir
          ? `<button type="button" class="btn btn--danger" data-detalhe-excluir>${icon(
              'trash',
              16
            )} Excluir</button>`
          : ''
      }
      ${
        state.perms.editar
          ? `<button type="button" class="btn btn--primary" data-detalhe-editar>${icon(
              'edit',
              16
            )} Editar cliente</button>`
          : ''
      }
    `,
  });

  state.detalheModal = modal;

  modal.element.addEventListener('click', (event) => {
    if (event.target.closest('[data-detalhe-editar]')) {
      modal.close('edit');
      state.detalheModal = null;
      abrirFormularioCliente({ id });
      return;
    }

    if (event.target.closest('[data-detalhe-excluir]')) {
      modal.close('excluir');
      state.detalheModal = null;
      excluirCliente(id);
      return;
    }

    if (event.target.closest('[data-detalhe-atendimento]')) {
      abrirAtendimento(id);
    }
  });

  await carregarDetalheNoModal(modal, id);
}

function renderFormularioAtendimento(dados, opcoes) {
  const formId = `atendimento-form-${(sequenciaFormulario += 1)}`;
  const administrador = Boolean(state.session?.usuario?.administrativo);
  const corretores = opcoes.corretores || [];
  const imoveis = opcoes.imoveis || [];
  const principal =
    dados.corretores.find((corretor) => corretor.principal) || dados.corretores[0];
  const opcoesImoveis = [
    ['', 'Nenhum imóvel específico'],
    ...imoveis.map((imovel) => [
      String(imovel.id),
      `${imovel.codigo} · ${imovel.titulo}`,
    ]),
  ];
  const opcoesCorretores = corretores.map((corretor) => [
    String(corretor.id),
    `${corretor.nome}${corretor.creci ? ` · ${corretor.creci}` : ''}`,
  ]);

  const agora = new Date();
  const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  const body = `
    <form id="${formId}" data-atendimento-form novalidate>
      <div class="form-grid">
        ${campoSelect({
          label: 'Tipo de atendimento',
          name: 'tipo',
          value: 'ligacao',
          options: Object.entries(ROTULOS_ATENDIMENTO),
          required: true,
        })}
        ${campoSelect({
          label: 'Status',
          name: 'status',
          value: 'realizado',
          options: Object.entries(ROTULOS_STATUS_ATENDIMENTO),
          required: true,
        })}
        ${campo({
          label: 'Data e hora',
          name: 'dataAtendimento',
          value: local,
          type: 'datetime-local',
          required: true,
        })}
        ${
          administrador
            ? campoSelect({
                label: 'Corretor responsável',
                name: 'corretorId',
                value: principal?.id ?? '',
                options: opcoesCorretores,
                required: true,
              })
            : ''
        }
        ${campoSelect({
          label: 'Imóvel relacionado',
          name: 'imovelId',
          value: '',
          options: opcoesImoveis,
          full: true,
        })}
        ${campoTextarea({
          label: 'Descrição do atendimento',
          name: 'descricao',
          value: '',
          required: true,
          full: true,
          rows: 4,
          hint: 'Resumo objetivo do contato, visita ou reunião.',
        })}
        ${campoTextarea({
          label: 'Observações',
          name: 'observacoes',
          value: '',
          full: true,
          rows: 3,
        })}
      </div>
      <div class="form-alert" data-form-error hidden></div>
    </form>
  `;

  return { formId, body };
}

async function abrirAtendimento(clienteId) {
  const token = state.token;
  let detalhe = state.detalhe;
  let corretores = [];
  let imoveis = [];

  try {
    const [dadosCliente, opcoesCorretores, opcoesImoveis] = await Promise.all([
      detalhe ? Promise.resolve(detalhe) : request(`/api/clientes/${clienteId}`),
      state.session?.usuario?.administrativo
        ? request('/api/clientes/corretores-opcoes')
        : Promise.resolve({ corretores: [] }),
      request('/api/clientes/imoveis-opcoes'),
    ]);

    detalhe = dadosCliente;
    corretores = opcoesCorretores?.corretores || [];
    imoveis = opcoesImoveis?.imoveis || [];
  } catch (error) {
    avisarErro(error);
    return;
  }

  if (!tokenValido(token)) return;

  const { formId, body } = renderFormularioAtendimento(detalhe, { corretores, imoveis });

  const modal = openModal({
    title: 'Registrar atendimento',
    description: `Registre um contato com ${detalhe.cliente.nome}.`,
    size: 'md',
    body,
    footer: `
      <button type="button" class="btn btn--ghost" data-modal-close>Cancelar</button>
      <button type="submit" form="${formId}" class="btn btn--primary" data-form-submit>
        Registrar atendimento
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
    const texto = (nome) => String(dados.get(nome) || '').trim();
    const payload = {
      tipo: texto('tipo'),
      status: texto('status'),
      dataAtendimento: texto('dataAtendimento'),
      descricao: texto('descricao'),
      observacoes: texto('observacoes'),
      imovelId: texto('imovelId') ? Number.parseInt(texto('imovelId'), 10) : undefined,
    };

    if (state.session?.usuario?.administrativo) {
      payload.corretorId = texto('corretorId')
        ? Number.parseInt(texto('corretorId'), 10)
        : undefined;
    }

    const restaurar = definirCarregando(submit, 'Registrando…');

    try {
      await request(`/api/clientes/${clienteId}/atendimentos`, {
        method: 'POST',
        body: payload,
      });

      modal.close('submit');
      avisarSucesso('Atendimento registrado com sucesso.');

      if (state.detalheModal?.element?.open) {
        await carregarDetalheNoModal(state.detalheModal, clienteId);
      }

      await carregarClientes();
    } catch (error) {
      if (tratarFalha(error)) return;
      mostrarErroFormulario(
        modal,
        error?.message || 'Não foi possível registrar o atendimento.'
      );
      restaurar();
    }
  });
}

function clientePorId(id) {
  return (
    state.clientes?.clientes.find((cliente) => String(cliente.id) === String(id)) || null
  );
}

async function excluirCliente(id) {
  const cliente = clientePorId(id) || state.detalhe?.cliente;
  if (!cliente) return;

  const confirmado = await confirmDialog({
    title: 'Excluir cliente',
    message: `Excluir ${cliente.nome}? O registro sai da lista e das consultas, mas o histórico é mantido.`,
    confirmLabel: 'Excluir',
    tone: 'danger',
  });

  if (!confirmado) return;

  try {
    await request(`/api/clientes/${id}`, { method: 'DELETE' });
    avisarSucesso('Cliente excluído do sistema.');

    const ultimoDaPagina =
      state.clientes?.clientes.length === 1 && state.filtros.pagina > 1;

    if (ultimoDaPagina) state.filtros.pagina -= 1;

    await carregarClientes();
  } catch (error) {
    avisarErro(error);
  }
}

async function tratarClique(event) {
  const botao = event.target.closest('[data-action]');
  if (!botao) return;

  const id = botao.dataset.id;

  switch (botao.dataset.action) {
    case 'cliente-novo':
      abrirFormularioCliente();
      break;
    case 'cliente-recarregar':
      carregarClientes();
      break;
    case 'cliente-detalhe':
      abrirDetalheCliente(id);
      break;
    case 'cliente-editar':
      abrirFormularioCliente({ id });
      break;
    case 'cliente-excluir':
      excluirCliente(id);
      break;
    case 'clientes-pagina': {
      const pagina = Number.parseInt(botao.dataset.page, 10);
      if (Number.isInteger(pagina) && pagina > 0) {
        state.filtros.pagina = pagina;
        carregarClientes();
      }
      break;
    }
    default:
      break;
  }
}

async function tratarEnvio(event) {
  const filtro = event.target.closest('[data-clientes-filtro]');
  if (!filtro) return;

  event.preventDefault();
  const dados = new FormData(filtro);
  const texto = (nome) => String(dados.get(nome) || '').trim();

  state.filtros = {
    ...state.filtros,
    busca: texto('busca'),
    tipo: texto('tipo'),
    finalidade: texto('finalidade'),
    pagina: 1,
  };

  await carregarClientes();
}

export default {
  title: 'Clientes',
  permission: 'clientes.visualizar',

  render({ session }) {
    reiniciarEstado();
    state.session = session;
    state.perms = calcularPermissoes(session);

    const actions = state.perms.criar
      ? `<button type="button" class="btn btn--primary" data-action="cliente-novo">${icon(
          'plus',
          16
        )} Novo cliente</button>`
      : '';

    return `
      <section class="view">
        ${renderPageHead({
          eyebrow: 'Relacionamento',
          title: 'Clientes',
          subtitle:
            'Organize compradores, vendedores, locatários e proprietários, com interesses, responsáveis e histórico de atendimento.',
          actions,
        })}
        ${renderFiltros()}
        <div data-clientes-content>
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
    carregarClientes();
  },
};
