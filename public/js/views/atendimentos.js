import { renderPageHead } from '../components/page.js';
import { icon } from '../components/icons.js';
import { request } from '../core/api.js';
import { escapeHtml } from '../core/utils.js';

const FILTROS_INICIAIS = {
  busca: '',
  tipo: '',
  status: '',
  inicio: '',
  fim: '',
  pagina: 1,
  limite: 15,
};

const ROTULOS_TIPO = {
  ligacao: 'Ligação',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  visita: 'Visita',
  reuniao: 'Reunião',
  outro: 'Outro',
};

const ROTULOS_STATUS = {
  agendado: 'Agendado',
  realizado: 'Realizado',
  cancelado: 'Cancelado',
};

const TONS_STATUS = {
  agendado: 'warning',
  realizado: 'success',
  cancelado: 'neutral',
};

const state = {
  root: null,
  token: 0,
  dados: null,
  filtros: { ...FILTROS_INICIAIS },
};

function formatarDataHora(valor) {
  if (!valor) return '—';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(data);
}

function tratarFalha(error) {
  if (error?.status === 401) {
    window.location.replace('/?sessao=expirada');
    return true;
  }
  return false;
}

function definirConteudo(html) {
  const container = state.root?.querySelector('[data-atendimentos-content]');
  if (container) container.innerHTML = html;
}

function renderCarregando() {
  return `
    <section class="card">
      <div class="card__body">
        <p class="report-loading">${icon('refresh', 16)} Carregando atendimentos...</p>
      </div>
    </section>
  `;
}

function renderErro(error) {
  return `
    <section class="card">
      <div class="card__body">
        <div class="empty-state empty-state--panel">
          <span class="empty-state__icon">${icon('alert-circle', 24)}</span>
          <p class="empty-state__title">Não foi possível carregar os atendimentos</p>
          <p class="empty-state__text">${escapeHtml(
            error?.message || 'Verifique a conexão e tente novamente.'
          )}</p>
          <button type="button" class="btn btn--ghost" data-atendimentos-retry>${icon(
            'refresh',
            16
          )} Tentar novamente</button>
        </div>
      </div>
    </section>
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
          : `Mostrando ${inicio}–${fim} de ${dados.total} atendimentos`
      }</p>
      <div class="pagination__controls">
        <button
          type="button"
          class="icon-button icon-button--sm"
          data-atendimentos-pagina="${dados.pagina - 1}"
          aria-label="Página anterior"
          ${dados.pagina <= 1 ? 'disabled' : ''}
        >${icon('chevron-left', 16)}</button>
        <span class="pagination__page">Página ${dados.pagina} de ${dados.totalPaginas}</span>
        <button
          type="button"
          class="icon-button icon-button--sm"
          data-atendimentos-pagina="${dados.pagina + 1}"
          aria-label="Próxima página"
          ${dados.pagina >= dados.totalPaginas ? 'disabled' : ''}
        >${icon('chevron-right', 16)}</button>
      </div>
    </div>
  `;
}

function renderLinha(atendimento) {
  return `
    <tr>
      <td><time datetime="${escapeHtml(atendimento.dataAtendimento)}">${escapeHtml(
        formatarDataHora(atendimento.dataAtendimento)
      )}</time></td>
      <td>
        <div class="cell-primary">
          <strong>${escapeHtml(atendimento.cliente)}</strong>
          <span>${escapeHtml(atendimento.descricao)}</span>
        </div>
      </td>
      <td>${escapeHtml(atendimento.corretor)}</td>
      <td>
        ${
          atendimento.imovel
            ? `<div class="cell-primary">
                <strong>${escapeHtml(atendimento.imovel.codigo)}</strong>
                <span>${escapeHtml(atendimento.imovel.titulo)}</span>
              </div>`
            : '—'
        }
      </td>
      <td><span class="badge badge--neutral">${escapeHtml(
        ROTULOS_TIPO[atendimento.tipo] || atendimento.tipo
      )}</span></td>
      <td><span class="badge badge--${TONS_STATUS[atendimento.status] || 'neutral'}">${escapeHtml(
        ROTULOS_STATUS[atendimento.status] || atendimento.status
      )}</span></td>
    </tr>
  `;
}

function renderLista(dados) {
  const corpo = dados.atendimentos.length
    ? `<div class="table-wrap">
        <table class="data-table atendimentos-table">
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">Cliente e descrição</th>
              <th scope="col">Corretor</th>
              <th scope="col">Imóvel</th>
              <th scope="col">Tipo</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>${dados.atendimentos.map(renderLinha).join('')}</tbody>
        </table>
      </div>`
    : `<div class="empty-state empty-state--panel">
        <span class="empty-state__icon">${icon('chat', 24)}</span>
        <p class="empty-state__title">Nenhum atendimento encontrado</p>
        <p class="empty-state__text">${
          state.filtros.busca ||
          state.filtros.tipo ||
          state.filtros.status ||
          state.filtros.inicio ||
          state.filtros.fim
            ? 'Ajuste a busca, o período ou os filtros para ampliar a consulta.'
            : 'Os atendimentos são registrados no detalhe do cliente.'
        }</p>
        ${
          state.filtros.busca ||
          state.filtros.tipo ||
          state.filtros.status ||
          state.filtros.inicio ||
          state.filtros.fim
            ? ''
            : `<a class="btn btn--primary" href="#/clientes">${icon(
                'arrow-right',
                16
              )} Ir para clientes</a>`
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

function renderToolbar() {
  return `
    <form class="toolbar toolbar--wrap" data-atendimentos-filter>
      <div class="field toolbar__search">
        <label class="sr-only" for="atendimento-busca">Buscar</label>
        <div class="input-group">
          <span class="input-group__icon">${icon('search', 18)}</span>
          <input
            class="input"
            id="atendimento-busca"
            name="busca"
            type="search"
            placeholder="Buscar por cliente, corretor, imóvel ou descrição"
            value="${escapeHtml(state.filtros.busca)}"
          >
        </div>
      </div>
      <div class="field toolbar__select">
        <label class="sr-only" for="atendimento-tipo">Tipo</label>
        <select class="select" id="atendimento-tipo" name="tipo">
          <option value="">Todos os tipos</option>
          ${Object.entries(ROTULOS_TIPO)
            .map(
              ([valor, rotulo]) =>
                `<option value="${valor}"${state.filtros.tipo === valor ? ' selected' : ''}>${rotulo}</option>`
            )
            .join('')}
        </select>
      </div>
      <div class="field toolbar__select">
        <label class="sr-only" for="atendimento-status">Status</label>
        <select class="select" id="atendimento-status" name="status">
          <option value="">Todos os status</option>
          ${Object.entries(ROTULOS_STATUS)
            .map(
              ([valor, rotulo]) =>
                `<option value="${valor}"${state.filtros.status === valor ? ' selected' : ''}>${rotulo}</option>`
            )
            .join('')}
        </select>
      </div>
      <div class="field toolbar__select">
        <label class="sr-only" for="atendimento-inicio">Data inicial</label>
        <input class="input" id="atendimento-inicio" name="inicio" type="date" value="${escapeHtml(
          state.filtros.inicio
        )}">
      </div>
      <div class="field toolbar__select">
        <label class="sr-only" for="atendimento-fim">Data final</label>
        <input class="input" id="atendimento-fim" name="fim" type="date" value="${escapeHtml(
          state.filtros.fim
        )}">
      </div>
      <div class="toolbar__actions">
        <button type="reset" class="btn btn--ghost">Limpar</button>
        <button type="submit" class="btn btn--primary">${icon('filter', 16)} Filtrar</button>
      </div>
    </form>
  `;
}

async function carregar() {
  const token = ++state.token;
  definirConteudo(renderCarregando());

  const params = new URLSearchParams({
    pagina: String(state.filtros.pagina),
    limite: String(state.filtros.limite),
  });

  for (const chave of ['busca', 'tipo', 'status', 'inicio', 'fim']) {
    if (state.filtros[chave]) params.set(chave, state.filtros[chave]);
  }

  try {
    const dados = await request(`/api/atendimentos?${params.toString()}`);
    if (token !== state.token) return;
    state.dados = dados;
    definirConteudo(renderLista(dados));
  } catch (error) {
    if (tratarFalha(error) || token !== state.token) return;
    definirConteudo(renderErro(error));
  }
}

export default {
  title: 'Atendimentos',
  permission: 'atendimentos.visualizar',

  render() {
    return `
      <section class="view">
        ${renderPageHead({
          eyebrow: 'Operação',
          title: 'Atendimentos',
          subtitle: 'Histórico de contatos, visitas e negociações registrados nos clientes.',
          actions: `<a class="btn btn--primary" href="#/clientes">${icon(
            'plus',
            16
          )} Registrar atendimento</a>`,
        })}
        ${renderToolbar()}
        <div data-atendimentos-content>${renderCarregando()}</div>
      </section>
    `;
  },

  mount(root) {
    state.root = root;
    state.token += 1;
    state.dados = null;
    state.filtros = { ...FILTROS_INICIAIS };

    carregar();

    root.querySelector('[data-atendimentos-filter]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const dados = new FormData(event.currentTarget);

      state.filtros = {
        ...state.filtros,
        busca: String(dados.get('busca') || '').trim(),
        tipo: String(dados.get('tipo') || ''),
        status: String(dados.get('status') || ''),
        inicio: String(dados.get('inicio') || ''),
        fim: String(dados.get('fim') || ''),
        pagina: 1,
      };

      carregar();
    });

    root.querySelector('[data-atendimentos-filter]')?.addEventListener('reset', (event) => {
      const form = event.currentTarget;

      window.setTimeout(() => {
        form.querySelectorAll('input, select').forEach((campo) => {
          campo.value = '';
        });
        state.filtros = { ...FILTROS_INICIAIS };
        carregar();
      }, 0);
    });

    root.addEventListener('click', (event) => {
      const pagina = event.target.closest('[data-atendimentos-pagina]');

      if (pagina) {
        const numero = Number.parseInt(pagina.dataset.atendimentosPagina, 10);
        if (Number.isInteger(numero) && numero > 0) {
          state.filtros.pagina = numero;
          carregar();
        }
        return;
      }

      if (event.target.closest('[data-atendimentos-retry]')) {
        carregar();
      }
    });
  },

  unmount() {
    state.token += 1;
    state.root = null;
    state.dados = null;
  },
};
