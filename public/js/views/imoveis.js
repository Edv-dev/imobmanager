import { renderPageHead } from '../components/page.js';
import { icon } from '../components/icons.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { request, requestForm } from '../core/api.js';
import { escapeHtml } from '../core/utils.js';
import { possuiPermissao } from '../core/session.js';

const FILTROS_INICIAIS = {
  busca: '',
  tipo: '',
  finalidade: '',
  situacao: '',
  cidade: '',
  bairro: '',
  valorMin: '',
  valorMax: '',
  pagina: 1,
  limite: 10,
};

const ROTULOS_TIPO = {
  apartamento: 'Apartamento',
  casa: 'Casa',
  terreno: 'Terreno',
  comercial: 'Comercial',
  rural: 'Rural',
  outro: 'Outro',
};

const ROTULOS_FINALIDADE = {
  venda: 'Venda',
  aluguel: 'Aluguel',
};

const ROTULOS_SITUACAO = {
  disponivel: 'Disponível',
  reservado: 'Reservado',
  vendido: 'Vendido',
  alugado: 'Alugado',
  inativo: 'Inativo',
};

const TONS_SITUACAO = {
  disponivel: 'success',
  reservado: 'warning',
  vendido: 'info',
  alugado: 'gold',
  inativo: 'neutral',
};

const ROTULOS_EVENTO = {
  'imovel.criado': 'Imóvel cadastrado',
  'imovel.atualizado': 'Dados atualizados',
  'imovel.situacao_alterada': 'Situação alterada',
  'imovel.excluido': 'Imóvel excluído',
  'imovel.imagens_enviadas': 'Imagens enviadas',
  'imovel.imagem_principal_alterada': 'Imagem principal alterada',
  'imovel.imagens_reordenadas': 'Imagens reordenadas',
  'imovel.imagem_removida': 'Imagem removida',
};

const state = {
  session: null,
  root: null,
  token: 0,
  abort: null,
  perms: {},
  imoveis: null,
  filtros: { ...FILTROS_INICIAIS },
  detalhe: null,
};

let sequenciaFormulario = 0;

function reiniciarEstado() {
  state.session = null;
  state.token += 1;
  state.root = null;
  state.abort?.abort();
  state.abort = null;
  state.perms = {};
  state.imoveis = null;
  state.filtros = { ...FILTROS_INICIAIS };
  state.detalhe = null;
}

function calcularPermissoes(session) {
  return {
    criar: possuiPermissao(session, 'imoveis.criar'),
    editar: possuiPermissao(session, 'imoveis.editar'),
    excluir: possuiPermissao(session, 'imoveis.excluir'),
    imagens: possuiPermissao(session, 'imoveis.imagens.gerenciar'),
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
  const container = state.root?.querySelector('[data-imoveis-content]');
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

function formatarMoeda(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  const numero = Number(valor);
  if (Number.isNaN(numero)) return '—';
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarArea(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  const numero = Number(valor);
  if (Number.isNaN(numero)) return '—';
  return `${numero.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²`;
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

function formatarData(valor) {
  if (!valor) return '—';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(data);
}

function linhaLogradouro(imovel) {
  const { logradouro, numero, complemento } = imovel.endereco;
  const partes = [logradouro, numero].filter(Boolean).join(', ');
  return [partes, complemento].filter(Boolean).join(' — ');
}

function linhaRegiao(imovel) {
  const { bairro, cidade, estado, cep } = imovel.endereco;
  const local = [bairro, cidade, estado].filter(Boolean).join(' · ');
  const cepFormatado = cep ? `CEP ${String(cep).replace(/^(\d{5})(\d{3})$/, '$1-$2')}` : '';
  return [local, cepFormatado].filter(Boolean).join(' · ');
}

function enderecoResumido(imovel) {
  return (
    linhaLogradouro(imovel) ||
    [imovel.endereco.bairro, imovel.endereco.cidade].filter(Boolean).join(' · ') ||
    'Endereço não informado'
  );
}

function badge(texto, tom = 'neutral') {
  return `<span class="badge badge--${tom}">${escapeHtml(texto)}</span>`;
}

function rotuloTipo(tipo) {
  return ROTULOS_TIPO[tipo] || tipo;
}

function rotuloFinalidade(finalidade) {
  return ROTULOS_FINALIDADE[finalidade] || finalidade;
}

function rotuloSituacao(situacao) {
  return ROTULOS_SITUACAO[situacao] || situacao;
}

function badgeSituacao(situacao) {
  return badge(rotuloSituacao(situacao), TONS_SITUACAO[situacao] || 'neutral');
}

function botaoIcone({ action, id = '', imagemId = '', nome, rotulo, perigo = false, extra = '' }) {
  return `
    <button
      type="button"
      class="icon-button icon-button--sm${perigo ? ' icon-button--danger' : ''}"
      data-action="${escapeHtml(action)}"
      ${id !== '' ? `data-id="${escapeHtml(id)}"` : ''}
      ${imagemId !== '' ? `data-imagem-id="${escapeHtml(imagemId)}"` : ''}
      title="${escapeHtml(rotulo)}"
      aria-label="${escapeHtml(rotulo)}"
      ${extra}
    >${icon(nome, 16)}</button>
  `;
}

function valorPrincipal(imovel) {
  const venda = imovel.valores.venda;
  const aluguel = imovel.valores.aluguel;

  if (imovel.finalidade === 'aluguel') {
    return {
      rotulo: 'Aluguel',
      valor: aluguel ?? venda,
    };
  }

  return {
    rotulo: 'Venda',
    valor: venda ?? aluguel,
  };
}

function renderCarregando() {
  return `
    <div class="admin-loading" role="status">
      <span class="admin-loading__spinner" aria-hidden="true"></span>
      <p>Carregando imóveis…</p>
    </div>
  `;
}

function renderErro(error) {
  return `
    <div class="card">
      <div class="card__body">
        <div class="empty-state empty-state--panel">
          <span class="empty-state__icon">${icon('alert-circle', 24)}</span>
          <p class="empty-state__title">Não foi possível carregar os imóveis</p>
          <p class="empty-state__text">${escapeHtml(
            error?.message || 'Ocorreu uma falha ao consultar o servidor.'
          )}</p>
          <button type="button" class="btn btn--ghost" data-action="imovel-recarregar">
            ${icon('refresh', 16)} Tentar novamente
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderFiltros() {
  const avancadoAberto =
    state.filtros.cidade ||
    state.filtros.bairro ||
    state.filtros.valorMin ||
    state.filtros.valorMax;

  return `
    <form class="toolbar imoveis-toolbar" data-imoveis-filtro>
      <div class="field toolbar__search">
        <label class="sr-only" for="imoveis-busca">Buscar imóveis</label>
        <div class="input-group">
          <span class="input-group__icon">${icon('search', 18)}</span>
          <input
            class="input"
            id="imoveis-busca"
            name="busca"
            type="search"
            placeholder="Buscar por código, título, endereço, bairro ou cidade"
            value="${escapeHtml(state.filtros.busca)}"
          >
        </div>
      </div>
      <div class="field toolbar__select">
        <label class="sr-only" for="imoveis-tipo">Tipo</label>
        <select class="select" id="imoveis-tipo" name="tipo">
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
        <label class="sr-only" for="imoveis-finalidade">Finalidade</label>
        <select class="select" id="imoveis-finalidade" name="finalidade">
          <option value=""${state.filtros.finalidade === '' ? ' selected' : ''}>Todas as finalidades</option>
          <option value="venda"${state.filtros.finalidade === 'venda' ? ' selected' : ''}>Venda</option>
          <option value="aluguel"${state.filtros.finalidade === 'aluguel' ? ' selected' : ''}>Aluguel</option>
        </select>
      </div>
      <div class="field toolbar__select">
        <label class="sr-only" for="imoveis-situacao">Situação</label>
        <select class="select" id="imoveis-situacao" name="situacao">
          <option value=""${state.filtros.situacao === '' ? ' selected' : ''}>Todas as situações</option>
          ${Object.entries(ROTULOS_SITUACAO)
            .map(
              ([valor, rotulo]) =>
                `<option value="${valor}"${
                  state.filtros.situacao === valor ? ' selected' : ''
                }>${rotulo}</option>`
            )
            .join('')}
        </select>
      </div>
      <div class="toolbar__actions">
        <button type="submit" class="btn btn--ghost">${icon('filter', 16)} Filtrar</button>
      </div>
      <details class="imoveis-avancado"${avancadoAberto ? ' open' : ''}>
        <summary>Filtros avançados</summary>
        <div class="imoveis-avancado__grid">
          <div class="field">
            <label class="field__label" for="imoveis-cidade">Cidade</label>
            <input class="input" id="imoveis-cidade" name="cidade" type="text" value="${escapeHtml(
              state.filtros.cidade
            )}" placeholder="Ex.: São Paulo">
          </div>
          <div class="field">
            <label class="field__label" for="imoveis-bairro">Bairro</label>
            <input class="input" id="imoveis-bairro" name="bairro" type="text" value="${escapeHtml(
              state.filtros.bairro
            )}" placeholder="Ex.: Centro">
          </div>
          <div class="field">
            <label class="field__label" for="imoveis-valor-min">Valor mínimo (R$)</label>
            <input class="input" id="imoveis-valor-min" name="valorMin" type="number" min="0" step="0.01" value="${escapeHtml(
              state.filtros.valorMin
            )}">
          </div>
          <div class="field">
            <label class="field__label" for="imoveis-valor-max">Valor máximo (R$)</label>
            <input class="input" id="imoveis-valor-max" name="valorMax" type="number" min="0" step="0.01" value="${escapeHtml(
              state.filtros.valorMax
            )}">
          </div>
        </div>
      </details>
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
          : `Mostrando ${inicio}–${fim} de ${dados.total} imóveis`
      }</p>
      <div class="pagination__controls">
        <button
          type="button"
          class="icon-button icon-button--sm"
          data-action="imoveis-pagina"
          data-page="${dados.pagina - 1}"
          aria-label="Página anterior"
          ${dados.pagina <= 1 ? 'disabled' : ''}
        >${icon('chevron-left', 16)}</button>
        <span class="pagination__page">Página ${dados.pagina} de ${dados.totalPaginas}</span>
        <button
          type="button"
          class="icon-button icon-button--sm"
          data-action="imoveis-pagina"
          data-page="${dados.pagina + 1}"
          aria-label="Próxima página"
          ${dados.pagina >= dados.totalPaginas ? 'disabled' : ''}
        >${icon('chevron-right', 16)}</button>
      </div>
    </div>
  `;
}

function renderLinha(imovel) {
  const capa = imovel.capa
    ? `<img class="imovel-thumb" src="${escapeHtml(imovel.capa.urlArquivo)}" alt="" loading="lazy">`
    : `<span class="imovel-thumb imovel-thumb--empty" aria-hidden="true">${icon('building', 18)}</span>`;

  const principal = imovel.corretores.find((corretor) => corretor.principal) || imovel.corretores[0];
  const totalCorretores = imovel.corretores.length;
  const valor = valorPrincipal(imovel);

  const acoes = [
    botaoIcone({
      action: 'imovel-detalhe',
      id: imovel.id,
      nome: 'eye',
      rotulo: 'Consultar detalhes',
    }),
    state.perms.editar
      ? botaoIcone({
          action: 'imovel-editar',
          id: imovel.id,
          nome: 'edit',
          rotulo: 'Editar imóvel',
        })
      : '',
    state.perms.editar
      ? botaoIcone({
          action: 'imovel-situacao',
          id: imovel.id,
          nome: 'activity',
          rotulo: 'Alterar situação',
        })
      : '',
    state.perms.excluir
      ? botaoIcone({
          action: 'imovel-excluir',
          id: imovel.id,
          nome: 'trash',
          rotulo: 'Excluir imóvel',
          perigo: true,
        })
      : '',
  ].join('');

  return `
    <tr>
      <td>
        <div class="imovel-cell">
          ${capa}
          <div class="cell-primary">
            <span class="imovel-codigo">${escapeHtml(imovel.codigo)}</span>
            <strong>${escapeHtml(imovel.titulo)}</strong>
            <span>${escapeHtml(enderecoResumido(imovel))}</span>
          </div>
        </div>
      </td>
      <td><span class="imovel-nowrap">${escapeHtml(rotuloTipo(imovel.tipo))}</span></td>
      <td>${badge(rotuloFinalidade(imovel.finalidade), imovel.finalidade === 'venda' ? 'gold' : 'info')}</td>
      <td>
        <div class="cell-primary">
          <strong>${escapeHtml(formatarMoeda(valor.valor))}</strong>
          <span>${escapeHtml(valor.rotulo)}</span>
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
      <td>${badgeSituacao(imovel.situacao)}</td>
      <td class="is-right"><div class="cell-actions">${acoes}</div></td>
    </tr>
  `;
}

function renderLista(dados) {
  const corpo = dados.imoveis.length
    ? `<div class="table-wrap">
        <table class="data-table imovel-table">
          <thead>
            <tr>
              <th scope="col">Imóvel</th>
              <th scope="col">Tipo</th>
              <th scope="col">Finalidade</th>
              <th scope="col">Valor</th>
              <th scope="col">Responsável</th>
              <th scope="col">Situação</th>
              <th scope="col" class="is-right">Ações</th>
            </tr>
          </thead>
          <tbody>${dados.imoveis.map(renderLinha).join('')}</tbody>
        </table>
      </div>`
    : `<div class="empty-state empty-state--panel">
        <span class="empty-state__icon">${icon('building', 24)}</span>
        <p class="empty-state__title">Nenhum imóvel encontrado</p>
        <p class="empty-state__text">${
          Object.values(state.filtros).some((valor) => typeof valor === 'string' && valor)
            ? 'Ajuste a busca ou os filtros para ampliar a consulta.'
            : 'Cadastre o primeiro imóvel para começar a montar a carteira.'
        }</p>
        ${
          state.perms.criar && !state.filtros.busca
            ? `<button type="button" class="btn btn--primary" data-action="imovel-novo">${icon(
                'plus',
                16
              )} Novo imóvel</button>`
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

async function carregarImoveis() {
  const token = iniciarCarregamento();
  definirConteudo(renderCarregando());

  const params = new URLSearchParams({
    pagina: String(state.filtros.pagina),
    limite: String(state.filtros.limite),
  });

  for (const chave of ['busca', 'tipo', 'finalidade', 'situacao', 'cidade', 'bairro', 'valorMin', 'valorMax']) {
    if (state.filtros[chave] !== '') params.set(chave, String(state.filtros[chave]));
  }

  try {
    const dados = await request(`/api/imoveis?${params.toString()}`);
    if (!tokenValido(token)) return;
    state.imoveis = dados;
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
  max = '',
  step = '',
  inputmode = '',
}) {
  const id = `imovel-campo-${(sequenciaFormulario += 1)}`;
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
        ${max !== '' ? `max="${escapeHtml(max)}"` : ''}
        ${step !== '' ? `step="${escapeHtml(step)}"` : ''}
        ${inputmode ? `inputmode="${escapeHtml(inputmode)}"` : ''}
      >
      ${hint ? `<p class="field__hint" id="${id}-hint">${escapeHtml(hint)}</p>` : ''}
    </div>
  `;
}

function campoSelect({ label, name, value = '', options, required = false }) {
  const id = `imovel-campo-${(sequenciaFormulario += 1)}`;
  return `
    <div class="field">
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

function campoTextarea({ label, name, value = '', full = false, rows = 4, hint = '' }) {
  const id = `imovel-campo-${(sequenciaFormulario += 1)}`;
  return `
    <div class="field${full ? ' field--full' : ''}">
      <label class="field__label" for="${id}">${escapeHtml(label)}</label>
      <textarea
        class="textarea"
        id="${id}"
        name="${escapeHtml(name)}"
        rows="${rows}"
        ${hint ? `aria-describedby="${id}-hint"` : ''}
      >${escapeHtml(value || '')}</textarea>
      ${hint ? `<p class="field__hint" id="${id}-hint">${escapeHtml(hint)}</p>` : ''}
    </div>
  `;
}

function campoCheckbox({ label, name, checked = false, hint = '' }) {
  const id = `imovel-campo-${(sequenciaFormulario += 1)}`;
  return `
    <div class="field field--full">
      <label class="checkbox" for="${id}">
        <input type="checkbox" id="${id}" name="${escapeHtml(name)}"${checked ? ' checked' : ''}>
        <span>${escapeHtml(label)}</span>
      </label>
      ${hint ? `<p class="field__hint">${escapeHtml(hint)}</p>` : ''}
    </div>
  `;
}

function renderSelecaoCorretores(disponiveis, atuais, administrador) {
  if (!administrador) {
    if (!atuais.length) {
      return `
        <div class="notice notice--info">
          ${icon('info', 18)}
          <p>Você será vinculado como responsável principal ao cadastrar o imóvel. O vínculo de outros corretores é gerenciado pelo administrador.</p>
        </div>
      `;
    }

    return `
      <ul class="corretor-resource-list">
        ${atuais
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
          .join('')}
      </ul>
      <div class="notice notice--info">
        ${icon('info', 18)}
        <p>O vínculo de corretores responsáveis é gerenciado pelo administrador.</p>
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

function montarPayload(form) {
  const dados = new FormData(form);
  const texto = (nome) => String(dados.get(nome) || '').trim();

  const payload = {
    codigo: texto('codigo'),
    titulo: texto('titulo'),
    descricao: texto('descricao'),
    tipo: texto('tipo'),
    finalidade: texto('finalidade'),
    cep: texto('cep'),
    estado: texto('estado'),
    cidade: texto('cidade'),
    bairro: texto('bairro'),
    logradouro: texto('logradouro'),
    numero: texto('numero'),
    complemento: texto('complemento'),
    areaTotal: texto('areaTotal'),
    areaConstruida: texto('areaConstruida'),
    quartos: texto('quartos'),
    banheiros: texto('banheiros'),
    suites: texto('suites'),
    vagasGaragem: texto('vagasGaragem'),
    mobiliado: dados.has('mobiliado'),
    caracteristicas: texto('caracteristicas'),
    valorVenda: texto('valorVenda'),
    valorAluguel: texto('valorAluguel'),
    valorCondominio: texto('valorCondominio'),
    valorIptu: texto('valorIptu'),
    situacao: texto('situacao'),
  };

  if (state.session?.usuario?.administrativo) {
    Object.assign(payload, coletarCorretores(form));
  }

  return payload;
}

function renderFormulario(dados, disponiveis) {
  const imovel = dados || {
    codigo: '',
    titulo: '',
    descricao: '',
    tipo: 'apartamento',
    finalidade: 'venda',
    situacao: 'disponivel',
    endereco: {},
    caracteristicas: { adicionais: [] },
    valores: {},
    corretores: [],
  };
  const administrador = Boolean(state.session?.usuario?.administrativo);
  const formId = `imovel-form-${(sequenciaFormulario += 1)}`;
  const endereco = imovel.endereco || {};
  const caracteristicas = imovel.caracteristicas || {};
  const valores = imovel.valores || {};

  const body = `
    <form id="${formId}" data-imovel-form novalidate>
      <section class="form-section">
        <h3 class="form-section__title">Identificação</h3>
        <div class="form-grid">
          ${campo({
            label: 'Código interno',
            name: 'codigo',
            value: imovel.codigo,
            required: true,
            placeholder: 'Ex.: IM-0001',
            maxlength: '40',
            hint: 'O código é armazenado em maiúsculas e deve ser único.',
          })}
          ${campoSelect({
            label: 'Tipo',
            name: 'tipo',
            value: imovel.tipo,
            options: Object.entries(ROTULOS_TIPO),
            required: true,
          })}
          ${campo({
            label: 'Título do anúncio',
            name: 'titulo',
            value: imovel.titulo,
            required: true,
            full: true,
            maxlength: '160',
            placeholder: 'Ex.: Apartamento 3 quartos no Centro',
          })}
          ${campoSelect({
            label: 'Finalidade',
            name: 'finalidade',
            value: imovel.finalidade,
            options: Object.entries(ROTULOS_FINALIDADE),
            required: true,
          })}
          ${campoSelect({
            label: 'Situação',
            name: 'situacao',
            value: imovel.situacao,
            options: Object.entries(ROTULOS_SITUACAO),
            required: true,
          })}
          ${campoTextarea({
            label: 'Descrição',
            name: 'descricao',
            value: imovel.descricao,
            full: true,
            rows: 4,
            hint: 'Até 4000 caracteres.',
          })}
        </div>
      </section>

      <section class="form-section">
        <h3 class="form-section__title">Localização</h3>
        <div class="form-grid">
          ${campo({
            label: 'CEP',
            name: 'cep',
            value: endereco.cep || '',
            placeholder: '00000-000',
            inputmode: 'numeric',
            maxlength: '9',
          })}
          ${campo({
            label: 'UF',
            name: 'estado',
            value: endereco.estado || '',
            placeholder: 'Ex.: SP',
            maxlength: '2',
          })}
          ${campo({ label: 'Cidade', name: 'cidade', value: endereco.cidade || '', maxlength: '120' })}
          ${campo({ label: 'Bairro', name: 'bairro', value: endereco.bairro || '', maxlength: '120' })}
          ${campo({
            label: 'Logradouro',
            name: 'logradouro',
            value: endereco.logradouro || '',
            full: true,
            maxlength: '180',
            placeholder: 'Rua, avenida...',
          })}
          ${campo({ label: 'Número', name: 'numero', value: endereco.numero || '', maxlength: '20' })}
          ${campo({
            label: 'Complemento',
            name: 'complemento',
            value: endereco.complemento || '',
            maxlength: '120',
          })}
        </div>
      </section>

      <section class="form-section">
        <h3 class="form-section__title">Características</h3>
        <div class="form-grid">
          ${campo({
            label: 'Área total (m²)',
            name: 'areaTotal',
            value: caracteristicas.areaTotal ?? '',
            type: 'number',
            min: '0',
            step: '0.01',
          })}
          ${campo({
            label: 'Área construída (m²)',
            name: 'areaConstruida',
            value: caracteristicas.areaConstruida ?? '',
            type: 'number',
            min: '0',
            step: '0.01',
          })}
          ${campo({
            label: 'Quartos',
            name: 'quartos',
            value: caracteristicas.quartos ?? 0,
            type: 'number',
            min: '0',
            step: '1',
          })}
          ${campo({
            label: 'Banheiros',
            name: 'banheiros',
            value: caracteristicas.banheiros ?? 0,
            type: 'number',
            min: '0',
            step: '1',
          })}
          ${campo({
            label: 'Suítes',
            name: 'suites',
            value: caracteristicas.suites ?? 0,
            type: 'number',
            min: '0',
            step: '1',
          })}
          ${campo({
            label: 'Vagas de garagem',
            name: 'vagasGaragem',
            value: caracteristicas.vagasGaragem ?? 0,
            type: 'number',
            min: '0',
            step: '1',
          })}
          ${campoCheckbox({
            label: 'Imóvel mobiliado',
            name: 'mobiliado',
            checked: Boolean(caracteristicas.mobiliado),
          })}
          ${campo({
            label: 'Características adicionais',
            name: 'caracteristicas',
            value: (caracteristicas.adicionais || []).join(', '),
            full: true,
            placeholder: 'Ex.: piscina, churrasqueira, elevador',
            hint: 'Separe os itens por vírgula (máximo de 30).',
          })}
        </div>
      </section>

      <section class="form-section">
        <h3 class="form-section__title">Valores</h3>
        <div class="form-grid">
          ${campo({
            label: 'Valor de venda (R$)',
            name: 'valorVenda',
            value: valores.venda ?? '',
            type: 'number',
            min: '0',
            step: '0.01',
          })}
          ${campo({
            label: 'Valor de aluguel (R$)',
            name: 'valorAluguel',
            value: valores.aluguel ?? '',
            type: 'number',
            min: '0',
            step: '0.01',
          })}
          ${campo({
            label: 'Condomínio (R$)',
            name: 'valorCondominio',
            value: valores.condominio ?? '',
            type: 'number',
            min: '0',
            step: '0.01',
          })}
          ${campo({
            label: 'IPTU (R$)',
            name: 'valorIptu',
            value: valores.iptu ?? '',
            type: 'number',
            min: '0',
            step: '0.01',
          })}
        </div>
      </section>

      <section class="form-section">
        <h3 class="form-section__title">Corretores responsáveis</h3>
        ${renderSelecaoCorretores(disponiveis, imovel.corretores || [], administrador)}
      </section>

      <div class="form-alert" data-form-error hidden></div>
    </form>
  `;

  return { formId, body };
}

async function abrirFormularioImovel({ id = null } = {}) {
  const token = state.token;
  const administrador = Boolean(state.session?.usuario?.administrativo);
  let dados = null;
  let disponiveis = [];

  try {
    const [detalhe, opcoes] = await Promise.all([
      id ? request(`/api/imoveis/${id}`) : Promise.resolve(null),
      administrador
        ? request('/api/imoveis/corretores-opcoes')
        : Promise.resolve({ corretores: [] }),
    ]);

    dados = detalhe?.imovel || null;
    disponiveis = opcoes?.corretores || [];
  } catch (error) {
    avisarErro(error);
    return;
  }

  if (!tokenValido(token)) return;

  const { formId, body } = renderFormulario(dados, disponiveis);

  const modal = openModal({
    title: id ? 'Editar imóvel' : 'Novo imóvel',
    description: id
      ? `Atualize os dados de ${dados.titulo}.`
      : 'Cadastre um imóvel com identificação, localização, características e valores.',
    size: 'lg',
    body,
    footer: `
      <button type="button" class="btn btn--ghost" data-modal-close>Cancelar</button>
      <button type="submit" form="${formId}" class="btn btn--primary" data-form-submit>
        ${id ? 'Salvar alterações' : 'Cadastrar imóvel'}
      </button>
    `,
  });

  const form = modal.element.querySelector(`#${formId}`);
  const submit = modal.element.querySelector('[data-form-submit]');

  inicializarSeletorCorretores(form);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    esconderErroFormulario(modal);

    if (!form.reportValidity()) return;

    const payload = montarPayload(form);
    const restaurar = definirCarregando(submit, id ? 'Salvando…' : 'Cadastrando…');

    try {
      await request(id ? `/api/imoveis/${id}` : '/api/imoveis', {
        method: id ? 'PATCH' : 'POST',
        body: payload,
      });

      modal.close('submit');
      avisarSucesso(
        id ? 'Os dados do imóvel foram atualizados.' : 'Imóvel cadastrado com sucesso.'
      );
      state.filtros.pagina = id ? state.filtros.pagina : 1;
      await carregarImoveis();
    } catch (error) {
      if (tratarFalha(error)) return;
      mostrarErroFormulario(
        modal,
        error?.message || 'Não foi possível salvar o imóvel.'
      );
      restaurar();
    }
  });
}

function renderGaleria(imovel) {
  const podeGerenciar = state.perms.imagens;
  const imagens = imovel.imagens || [];

  const galeria = imagens.length
    ? `<div class="imovel-gallery">
        ${imagens
          .map(
            (imagem, indice) => `
              <figure class="imovel-gallery__item">
                <img
                  class="imovel-gallery__image"
                  src="${escapeHtml(imagem.urlArquivo)}"
                  alt="Imagem ${indice + 1} de ${escapeHtml(imovel.titulo)}"
                  loading="lazy"
                >
                ${imagem.principal ? `<span class="badge badge--gold imovel-gallery__badge">Principal</span>` : ''}
                ${
                  podeGerenciar
                    ? `<div class="imovel-gallery__actions">
                        <button type="button" class="icon-button icon-button--sm" data-imagem-action="subir" data-imagem-id="${imagem.id}" aria-label="Mover imagem para cima" title="Mover para cima" ${indice === 0 ? 'disabled' : ''}>${icon('arrow-up', 14)}</button>
                        <button type="button" class="icon-button icon-button--sm" data-imagem-action="descer" data-imagem-id="${imagem.id}" aria-label="Mover imagem para baixo" title="Mover para baixo" ${indice === imagens.length - 1 ? 'disabled' : ''}>${icon('arrow-down', 14)}</button>
                        <button type="button" class="icon-button icon-button--sm" data-imagem-action="principal" data-imagem-id="${imagem.id}" aria-label="Definir como principal" title="Definir como principal" ${imagem.principal ? 'disabled' : ''}>${icon('star', 14)}</button>
                        <button type="button" class="icon-button icon-button--sm icon-button--danger" data-imagem-action="remover" data-imagem-id="${imagem.id}" aria-label="Remover imagem" title="Remover imagem">${icon('trash', 14)}</button>
                      </div>`
                    : ''
                }
              </figure>
            `
          )
          .join('')}
      </div>`
    : `<p class="corretor-detail-note">Nenhuma imagem cadastrada.</p>`;

  const upload = podeGerenciar
    ? `<form class="imovel-upload" data-imagem-upload-form>
        <div class="field">
          <label class="field__label" for="imovel-upload-input">Adicionar imagens</label>
          <input
            class="input"
            id="imovel-upload-input"
            type="file"
            name="imagens"
            accept="image/jpeg,image/png,image/webp"
            multiple
            required
          >
          <p class="field__hint">JPEG, PNG ou WebP. O envio respeita o limite de tamanho e quantidade configurado no servidor.</p>
        </div>
        <button type="submit" class="btn btn--ghost">${icon('upload', 16)} Enviar imagens</button>
      </form>`
    : '';

  return `
    <section class="corretor-detail-section">
      <div class="corretor-detail-section__header">
        <h3>Imagens</h3>
        ${badge(`${imagens.length}`, 'neutral')}
      </div>
      ${galeria}
      ${upload}
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

function renderDetalhe(imovel, eventos) {
  const endereco = imovel.endereco;
  const caracteristicas = imovel.caracteristicas;
  const valores = imovel.valores;
  const capa = imovel.capa
    ? `<img class="imovel-detail-cover" src="${escapeHtml(imovel.capa.urlArquivo)}" alt="Imagem principal de ${escapeHtml(imovel.titulo)}">`
    : `<span class="imovel-detail-cover imovel-detail-cover--empty" aria-hidden="true">${icon('building', 28)}</span>`;

  const corretores = imovel.corretores.length
    ? `<ul class="corretor-resource-list">
        ${imovel.corretores
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

  return `
    <div class="imovel-detail-head">
      ${capa}
      <div>
        <span class="imovel-codigo">${escapeHtml(imovel.codigo)}</span>
        <h3>${escapeHtml(imovel.titulo)}</h3>
        <p>${escapeHtml(enderecoResumido(imovel))}</p>
        <div class="imovel-badges">
          ${badge(rotuloTipo(imovel.tipo), 'neutral')}
          ${badge(rotuloFinalidade(imovel.finalidade), imovel.finalidade === 'venda' ? 'gold' : 'info')}
          ${badgeSituacao(imovel.situacao)}
        </div>
      </div>
    </div>

    <div class="corretor-detail-grid">
      <section class="corretor-detail-section">
        <h3>Localização</h3>
        <ul class="admin-info-list">
          <li><span>Logradouro</span><span>${escapeHtml(linhaLogradouro(imovel) || '—')}</span></li>
          <li><span>Bairro</span><span>${escapeHtml(endereco.bairro || '—')}</span></li>
          <li><span>Cidade</span><span>${escapeHtml(endereco.cidade || '—')}</span></li>
          <li><span>UF</span><span>${escapeHtml(endereco.estado || '—')}</span></li>
          <li><span>CEP</span><span>${escapeHtml(
            endereco.cep ? String(endereco.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2') : '—'
          )}</span></li>
        </ul>
      </section>

      <section class="corretor-detail-section">
        <h3>Valores</h3>
        <ul class="admin-info-list">
          <li><span>Venda</span><span>${escapeHtml(formatarMoeda(valores.venda))}</span></li>
          <li><span>Aluguel</span><span>${escapeHtml(formatarMoeda(valores.aluguel))}</span></li>
          <li><span>Condomínio</span><span>${escapeHtml(formatarMoeda(valores.condominio))}</span></li>
          <li><span>IPTU</span><span>${escapeHtml(formatarMoeda(valores.iptu))}</span></li>
          <li><span>Atualizado em</span><span>${escapeHtml(formatarDataHora(imovel.atualizadoEm))}</span></li>
        </ul>
      </section>
    </div>

    <section class="corretor-detail-section">
      <h3>Características</h3>
      <div class="imovel-caracteristicas">
        <span>${badge(`Tipo: ${rotuloTipo(imovel.tipo)}`, 'neutral')}</span>
        <span>${badge(`${caracteristicas.quartos} quartos`, 'neutral')}</span>
        <span>${badge(`${caracteristicas.banheiros} banheiros`, 'neutral')}</span>
        <span>${badge(`${caracteristicas.suites} suítes`, 'neutral')}</span>
        <span>${badge(`${caracteristicas.vagasGaragem} vagas`, 'neutral')}</span>
        <span>${badge(`Área: ${formatarArea(caracteristicas.areaTotal)}`, 'neutral')}</span>
        ${caracteristicas.areaConstruida !== null ? `<span>${badge(`Construída: ${formatarArea(caracteristicas.areaConstruida)}`, 'neutral')}</span>` : ''}
        ${caracteristicas.mobiliado ? `<span>${badge('Mobiliado', 'gold')}</span>` : ''}
      </div>
      ${
        caracteristicas.adicionais?.length
          ? `<div class="imovel-caracteristicas imovel-caracteristicas--extras">
              ${caracteristicas.adicionais.map((item) => badge(item, 'neutral')).join('')}
            </div>`
          : ''
      }
      ${imovel.descricao ? `<p class="imovel-descricao">${escapeHtml(imovel.descricao)}</p>` : ''}
    </section>

    <section class="corretor-detail-section">
      <h3>Corretores responsáveis</h3>
      ${corretores}
    </section>

    ${renderGaleria(imovel)}
    ${renderHistorico(eventos)}
  `;
}

async function carregarDetalheNoModal(modal, id) {
  try {
    const dados = await request(`/api/imoveis/${id}`);
    state.detalhe = dados.imovel;

    let eventos = null;

    if (state.perms.auditoria) {
      try {
        const historico = await request(`/api/imoveis/${id}/historico`);
        eventos = historico.eventos;
      } catch {
        eventos = null;
      }
    }

    modal.body.innerHTML = renderDetalhe(dados.imovel, eventos);
  } catch (error) {
    avisarErro(error);
    modal.close('erro');
  }
}

async function abrirDetalheImovel(id) {
  const modal = openModal({
    title: 'Detalhes do imóvel',
    description: 'Dados completos, responsáveis, imagens e histórico do cadastro.',
    size: 'lg',
    body: renderCarregando(),
    footer: `
      <button type="button" class="btn btn--ghost" data-modal-close>Fechar</button>
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
            )} Editar imóvel</button>`
          : ''
      }
    `,
  });

  modal.element.addEventListener('click', async (event) => {
    const acaoImagem = event.target.closest('[data-imagem-action]');

    if (acaoImagem) {
      const imagemId = acaoImagem.dataset.imagemId;
      const acao = acaoImagem.dataset.imagemAction;
      const imagens = state.detalhe?.imagens || [];
      const indice = imagens.findIndex((imagem) => String(imagem.id) === String(imagemId));

      acaoImagem.disabled = true;

      try {
        if (acao === 'principal') {
          await request(`/api/imoveis/${id}/imagens/${imagemId}/principal`, {
            method: 'PATCH',
          });
          avisarSucesso('A imagem principal foi atualizada.');
        } else if (acao === 'remover') {
          const confirmado = await confirmDialog({
            title: 'Remover imagem',
            message: 'Remover esta imagem do imóvel? A ação não pode ser desfeita.',
            confirmLabel: 'Remover',
            tone: 'danger',
          });

          if (!confirmado) {
            acaoImagem.disabled = false;
            return;
          }

          await request(`/api/imoveis/${id}/imagens/${imagemId}`, { method: 'DELETE' });
          avisarSucesso('Imagem removida do imóvel.');
        } else if ((acao === 'subir' || acao === 'descer') && indice >= 0) {
          const novaOrdem = imagens.map((imagem) => imagem.id);
          const destino = acao === 'subir' ? indice - 1 : indice + 1;

          if (destino < 0 || destino >= novaOrdem.length) {
            acaoImagem.disabled = false;
            return;
          }

          [novaOrdem[indice], novaOrdem[destino]] = [novaOrdem[destino], novaOrdem[indice]];

          await request(`/api/imoveis/${id}/imagens/ordem`, {
            method: 'PUT',
            body: { ids: novaOrdem },
          });
          avisarSucesso('A ordem das imagens foi atualizada.');
        }

        await carregarDetalheNoModal(modal, id);
      } catch (error) {
        acaoImagem.disabled = false;
        avisarErro(error);
      }

      return;
    }

    if (event.target.closest('[data-detalhe-editar]')) {
      modal.close('editar');
      abrirFormularioImovel({ id });
      return;
    }

    if (event.target.closest('[data-detalhe-excluir]')) {
      const confirmado = await confirmDialog({
        title: 'Excluir imóvel',
        message: 'Excluir este imóvel? O registro será removido das consultas e da carteira.',
        confirmLabel: 'Excluir',
        tone: 'danger',
      });

      if (!confirmado) return;

      try {
        await request(`/api/imoveis/${id}`, { method: 'DELETE' });
        modal.close('excluir');
        avisarSucesso('Imóvel excluído do sistema.');
        await carregarImoveis();
      } catch (error) {
        avisarErro(error);
      }
    }
  });

  modal.element.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-imagem-upload-form]');
    if (!form) return;

    event.preventDefault();

    const arquivos = form.querySelector('input[type="file"]')?.files || [];
    if (!arquivos.length) return;

    const submit = form.querySelector('button[type="submit"]');
    const restaurar = definirCarregando(submit, 'Enviando…');

    try {
      await requestForm(`/api/imoveis/${id}/imagens`, new FormData(form));
      form.reset();
      avisarSucesso('Imagens enviadas com sucesso.');
      await carregarDetalheNoModal(modal, id);
    } catch (error) {
      if (tratarFalha(error)) return;
      avisarErro(error);
      restaurar();
    }
  });

  await carregarDetalheNoModal(modal, id);
}

async function abrirSituacaoImovel(id) {
  const imovel =
    state.imoveis?.imoveis.find((item) => String(item.id) === String(id)) || null;

  if (!imovel) return;

  const formId = `imovel-situacao-${(sequenciaFormulario += 1)}`;
  const modal = openModal({
    title: 'Alterar situação',
    description: `Atualize a disponibilidade de ${imovel.titulo}.`,
    size: 'sm',
    body: `
      <form id="${formId}" data-imovel-situacao-form novalidate>
        <div class="field">
          <label class="field__label" for="${formId}-situacao">Situação</label>
          <select class="select" id="${formId}-situacao" name="situacao">
            ${Object.entries(ROTULOS_SITUACAO)
              .map(
                ([valor, rotulo]) =>
                  `<option value="${valor}"${imovel.situacao === valor ? ' selected' : ''}>${rotulo}</option>`
              )
              .join('')}
          </select>
        </div>
        <div class="form-alert" data-form-error hidden></div>
      </form>
    `,
    footer: `
      <button type="button" class="btn btn--ghost" data-modal-close>Cancelar</button>
      <button type="submit" form="${formId}" class="btn btn--primary" data-form-submit>Salvar situação</button>
    `,
  });

  const form = modal.element.querySelector(`#${formId}`);
  const submit = modal.element.querySelector('[data-form-submit]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const situacao = form.querySelector('[name="situacao"]').value;
    const restaurar = definirCarregando(submit);

    try {
      await request(`/api/imoveis/${id}/situacao`, {
        method: 'PATCH',
        body: { situacao },
      });
      modal.close('submit');
      avisarSucesso('A situação do imóvel foi atualizada.');
      await carregarImoveis();
    } catch (error) {
      if (tratarFalha(error)) return;
      mostrarErroFormulario(modal, error?.message || 'Não foi possível alterar a situação.');
      restaurar();
    }
  });
}

function imovelPorId(id) {
  return (
    state.imoveis?.imoveis.find((imovel) => String(imovel.id) === String(id)) || null
  );
}

async function excluirImovel(id) {
  const imovel = imovelPorId(id);
  if (!imovel) return;

  const confirmado = await confirmDialog({
    title: 'Excluir imóvel',
    message: `Excluir ${imovel.codigo} — ${imovel.titulo}? O registro sai da carteira e das consultas.`,
    confirmLabel: 'Excluir',
    tone: 'danger',
  });

  if (!confirmado) return;

  try {
    await request(`/api/imoveis/${id}`, { method: 'DELETE' });
    avisarSucesso('Imóvel excluído do sistema.');

    const ultimoDaPagina =
      state.imoveis?.imoveis.length === 1 && state.filtros.pagina > 1;

    if (ultimoDaPagina) state.filtros.pagina -= 1;

    await carregarImoveis();
  } catch (error) {
    avisarErro(error);
  }
}

async function tratarClique(event) {
  const botao = event.target.closest('[data-action]');
  if (!botao) return;

  const id = botao.dataset.id;

  switch (botao.dataset.action) {
    case 'imovel-novo':
      abrirFormularioImovel();
      break;
    case 'imovel-recarregar':
      carregarImoveis();
      break;
    case 'imovel-detalhe':
      abrirDetalheImovel(id);
      break;
    case 'imovel-editar':
      abrirFormularioImovel({ id });
      break;
    case 'imovel-situacao':
      abrirSituacaoImovel(id);
      break;
    case 'imovel-excluir':
      excluirImovel(id);
      break;
    case 'imoveis-pagina': {
      const pagina = Number.parseInt(botao.dataset.page, 10);
      if (Number.isInteger(pagina) && pagina > 0) {
        state.filtros.pagina = pagina;
        carregarImoveis();
      }
      break;
    }
    default:
      break;
  }
}

async function tratarEnvio(event) {
  const filtro = event.target.closest('[data-imoveis-filtro]');
  if (!filtro) return;

  event.preventDefault();
  const dados = new FormData(filtro);
  const texto = (nome) => String(dados.get(nome) || '').trim();

  state.filtros = {
    ...state.filtros,
    busca: texto('busca'),
    tipo: texto('tipo'),
    finalidade: texto('finalidade'),
    situacao: texto('situacao'),
    cidade: texto('cidade'),
    bairro: texto('bairro'),
    valorMin: texto('valorMin'),
    valorMax: texto('valorMax'),
    pagina: 1,
  };

  await carregarImoveis();
}

export default {
  title: 'Imóveis',
  permission: 'imoveis.visualizar',

  render({ session }) {
    reiniciarEstado();
    state.session = session;
    state.perms = calcularPermissoes(session);

    const actions = state.perms.criar
      ? `<button type="button" class="btn btn--primary" data-action="imovel-novo">${icon(
          'plus',
          16
        )} Novo imóvel</button>`
      : '';

    return `
      <section class="view">
        ${renderPageHead({
          eyebrow: 'Gestão de carteira',
          title: 'Imóveis',
          subtitle:
            'Cadastre, organize e acompanhe os imóveis para venda ou locação, com imagens, responsáveis e histórico.',
          actions,
        })}
        ${renderFiltros()}
        <div data-imoveis-content>
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
    carregarImoveis();
  },
};
