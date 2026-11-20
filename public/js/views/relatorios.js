import { renderPageHead } from '../components/page.js';
import { icon } from '../components/icons.js';
import { renderDataTable } from '../components/table.js';
import { showToast } from '../components/toast.js';
import { request } from '../core/api.js';
import { escapeHtml } from '../core/utils.js';
import { possuiPermissao } from '../core/session.js';

const RELATORIOS = [
  {
    id: 'imoveis-situacao',
    icon: 'building',
    title: 'Imóveis por situação',
    description: 'Distribuição da carteira conforme a situação cadastrada.',
  },
  {
    id: 'imoveis-finalidade',
    icon: 'home',
    title: 'Imóveis por finalidade',
    description: 'Quantidade e valores médios dos imóveis para venda e aluguel.',
  },
  {
    id: 'imoveis-corretor',
    icon: 'users',
    title: 'Imóveis por corretor',
    description: 'Carteira de imóveis sob responsabilidade de cada corretor.',
  },
  {
    id: 'clientes-corretor',
    icon: 'user',
    title: 'Clientes por corretor',
    description: 'Base de clientes e atendimentos vinculados a cada corretor.',
  },
  {
    id: 'atendimentos',
    icon: 'chat',
    title: 'Histórico de atendimentos',
    description: 'Atendimentos realizados no período, com cliente, corretor e imóvel.',
  },
];

const state = {
  root: null,
  session: null,
  token: 0,
  relatorioAtual: null,
  carregando: false,
};

function formatarNumero(valor) {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return '—';
  return Number(valor).toLocaleString('pt-BR');
}

function formatarCelula(valor, formato) {
  if (valor === null || valor === undefined || valor === '') return '—';

  switch (formato) {
    case 'inteiro':
      return escapeHtml(formatarNumero(valor));
    case 'percentual':
      return escapeHtml(
        `${Number(valor).toLocaleString('pt-BR', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}%`
      );
    case 'moeda':
      return escapeHtml(
        Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      );
    case 'datahora':
      return escapeHtml(
        new Intl.DateTimeFormat('pt-BR', {
          dateStyle: 'short',
          timeStyle: 'short',
        }).format(new Date(valor))
      );
    default:
      return escapeHtml(valor);
  }
}

function tratarFalha(error) {
  if (error?.status === 401) {
    window.location.replace('/?sessao=expirada');
    return true;
  }
  return false;
}

function lerFiltros(form) {
  const dados = new FormData(form);

  return {
    inicio: String(dados.get('inicio') || '').trim(),
    fim: String(dados.get('fim') || '').trim(),
    corretor: String(dados.get('corretor') || '').trim(),
    finalidade: String(dados.get('finalidade') || '').trim(),
    tipo: String(dados.get('tipo') || '').trim(),
    status: String(dados.get('status') || '').trim(),
  };
}

function filtrosComoParams(filtros) {
  const params = new URLSearchParams();

  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor) params.set(chave, valor);
  }

  return params;
}

function renderReportCards() {
  return RELATORIOS.map(
    (relatorio) => `
      <article class="report-card">
        <span class="report-card__icon">${icon(relatorio.icon, 20)}</span>
        <h3>${escapeHtml(relatorio.title)}</h3>
        <p>${escapeHtml(relatorio.description)}</p>
        <button type="button" class="btn btn--ghost btn--sm" data-report="${relatorio.id}">
          ${icon('file-text', 14)} Gerar relatório
        </button>
      </article>
    `
  ).join('');
}

function renderPlaceholder() {
  return `
    <section class="card report-result" data-report-result>
      <div class="card__body">
        <div class="empty-state">
          <span class="empty-state__icon">${icon('chart', 24)}</span>
          <p class="empty-state__title">Selecione um relatório</p>
          <p class="empty-state__text">
            Ajuste os filtros e escolha um dos relatórios acima para visualizar os dados
            consolidados. A exportação em CSV e PDF fica disponível após a geração.
          </p>
        </div>
      </div>
    </section>
  `;
}

function renderLoading() {
  return `
    <section class="card report-result" data-report-result>
      <div class="card__body">
        <p class="report-loading">${icon('refresh', 16)} Gerando relatório...</p>
      </div>
    </section>
  `;
}

function renderErro(mensagem) {
  return `
    <section class="card report-result" data-report-result>
      <div class="card__body">
        <div class="empty-state">
          <span class="empty-state__icon">${icon('alert-circle', 24)}</span>
          <p class="empty-state__title">Não foi possível gerar o relatório</p>
          <p class="empty-state__text">${escapeHtml(mensagem)}</p>
          <button type="button" class="btn btn--ghost" data-report-retry>${icon('refresh', 16)} Tentar novamente</button>
        </div>
      </div>
    </section>
  `;
}

function renderTabela(relatorio) {
  return renderDataTable({
    columns: relatorio.colunas.map((coluna) => ({
      label: coluna.rotulo,
      align: coluna.alinhamento === 'right' ? 'right' : undefined,
      render: (linha) => formatarCelula(linha[coluna.chave], coluna.formato),
    })),
    rows: relatorio.linhas,
    empty: {
      iconName: 'chart',
      title: 'Nenhum registro encontrado',
      message: 'Ajuste o período ou os filtros e gere o relatório novamente.',
    },
  });
}

function renderResultado(relatorio) {
  const podeExportar = possuiPermissao(state.session, 'relatorios.exportar');

  return `
    <section class="card report-result" data-report-result>
      <div class="card__header">
        <div>
          <span class="eyebrow">Relatório</span>
          <h2>${escapeHtml(relatorio.titulo)}</h2>
          <p class="card__subtitle">${escapeHtml(relatorio.descricao)}</p>
        </div>
        ${
          podeExportar
            ? `<div class="report-result__actions">
                <button type="button" class="btn btn--ghost btn--sm" data-export="csv">
                  ${icon('download', 14)} CSV
                </button>
                <button type="button" class="btn btn--primary btn--sm" data-export="pdf">
                  ${icon('file-text', 14)} PDF
                </button>
              </div>`
            : ''
        }
      </div>
      <div class="card__body">
        <div class="report-meta">
          <span>Gerado em ${escapeHtml(
            new Intl.DateTimeFormat('pt-BR', {
              dateStyle: 'short',
              timeStyle: 'short',
            }).format(new Date(relatorio.geradoEm))
          )}</span>
          ${relatorio.filtros
            .map((filtro) => `<span class="badge badge--neutral">${escapeHtml(filtro)}</span>`)
            .join('')}
        </div>
        <div class="report-summary">
          ${relatorio.resumo
            .map(
              (item) => `
                <div class="report-summary__item">
                  <span>${escapeHtml(item.label)}</span>
                  <strong>${escapeHtml(item.valor)}</strong>
                </div>
              `
            )
            .join('')}
        </div>
        ${renderTabela(relatorio)}
      </div>
    </section>
  `;
}

function definirResultado(html) {
  const container = state.root?.querySelector('[data-report-result]');
  if (container) container.outerHTML = html;
}

function definirCarregando(botao, texto = 'Exportando…') {
  if (!botao) return () => {};
  const conteudo = botao.innerHTML;
  botao.disabled = true;
  botao.textContent = texto;

  return () => {
    botao.disabled = false;
    botao.innerHTML = conteudo;
  };
}

function nomeDoArquivo(header, fallback) {
  const match = /filename="?([^";]+)"?/i.exec(header || '');
  return match ? match[1] : fallback;
}

function baixarArquivo(blob, nome) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportar(formato, botao) {
  if (!state.relatorioAtual) return;

  if (!possuiPermissao(state.session, 'relatorios.exportar')) {
    showToast({
      type: 'warning',
      title: 'Permissão necessária',
      message: 'Seu perfil não possui permissão para exportar relatórios.',
    });
    return;
  }

  const form = state.root?.querySelector('[data-report-filter]');
  const filtros = form ? lerFiltros(form) : {};
  const params = filtrosComoParams(filtros);
  params.set('formato', formato);

  const restaurar = definirCarregando(botao);

  try {
    const resposta = await fetch(
      `/api/relatorios/${encodeURIComponent(state.relatorioAtual)}/exportacao?${params.toString()}`,
      {
        credentials: 'same-origin',
        headers: {
          Accept: formato === 'csv' ? 'text/csv' : 'application/pdf',
        },
      }
    );

    if (resposta.status === 401) {
      window.location.replace('/?sessao=expirada');
      return;
    }

    if (!resposta.ok) {
      let dados = null;

      try {
        dados = await resposta.json();
      } catch {
        dados = null;
      }

      throw new Error(dados?.error?.message || 'Não foi possível exportar o relatório.');
    }

    const blob = await resposta.blob();
    const nome = nomeDoArquivo(
      resposta.headers.get('Content-Disposition'),
      `relatorio-${state.relatorioAtual}.${formato}`
    );

    baixarArquivo(blob, nome);

    showToast({
      type: 'success',
      title: 'Exportação concluída',
      message: `O arquivo ${nome} foi gerado.`,
    });
  } catch (error) {
    showToast({
      type: 'error',
      title: 'Exportação não concluída',
      message: error?.message || 'Não foi possível exportar o relatório.',
    });
  } finally {
    restaurar();
  }
}

async function carregarRelatorio(id) {
  const form = state.root?.querySelector('[data-report-filter]');
  const filtros = form ? lerFiltros(form) : {};
  const params = filtrosComoParams(filtros);
  const query = params.toString();

  state.relatorioAtual = id;
  state.carregando = true;
  const token = ++state.token;

  definirResultado(renderLoading());

  try {
    const dados = await request(
      `/api/relatorios/${encodeURIComponent(id)}${query ? `?${query}` : ''}`
    );

    if (token !== state.token) return;

    state.carregando = false;
    definirResultado(renderResultado(dados.relatorio));

    state.root
      ?.querySelector('[data-report-result]')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    if (tratarFalha(error)) return;
    if (token !== state.token) return;

    state.carregando = false;
    definirResultado(renderErro(error?.message || 'Verifique a conexão e tente novamente.'));
  }
}

async function carregarOpcoes() {
  try {
    const dados = await request('/api/relatorios/opcoes');
    const select = state.root?.querySelector('#relatorio-corretor');
    if (!select) return;

    for (const corretor of dados.corretores || []) {
      const option = document.createElement('option');
      option.value = String(corretor.id);
      option.textContent = corretor.creci
        ? `${corretor.nome} · ${corretor.creci}`
        : corretor.nome;
      select.appendChild(option);
    }
  } catch (error) {
    if (tratarFalha(error)) return;
    showToast({
      type: 'warning',
      title: 'Filtro de corretores indisponível',
      message: 'Não foi possível carregar a lista de corretores para o filtro.',
    });
  }
}

export default {
  title: 'Relatórios',
  permission: 'relatorios.visualizar',

  render() {
    return `
      <section class="view">
        ${renderPageHead({
          eyebrow: 'Análise',
          title: 'Relatórios',
          subtitle: 'Consultas consolidadas e exportação em CSV e PDF, sempre respeitando as permissões de acesso.',
        })}
        <div class="card filters-card">
          <div class="card__body">
            <form class="filters-grid" data-report-filter>
              <div class="field">
                <label class="field__label" for="relatorio-inicio">Data inicial</label>
                <input class="input" id="relatorio-inicio" name="inicio" type="date">
              </div>
              <div class="field">
                <label class="field__label" for="relatorio-fim">Data final</label>
                <input class="input" id="relatorio-fim" name="fim" type="date">
              </div>
              <div class="field">
                <label class="field__label" for="relatorio-corretor">Corretor</label>
                <select class="select" id="relatorio-corretor" name="corretor">
                  <option value="">Todos os corretores</option>
                </select>
              </div>
              <div class="field">
                <label class="field__label" for="relatorio-finalidade">Finalidade</label>
                <select class="select" id="relatorio-finalidade" name="finalidade">
                  <option value="">Todas as finalidades</option>
                  <option value="venda">Venda</option>
                  <option value="aluguel">Aluguel</option>
                </select>
              </div>
              <div class="field">
                <label class="field__label" for="relatorio-tipo">Tipo de atendimento</label>
                <select class="select" id="relatorio-tipo" name="tipo">
                  <option value="">Todos os tipos</option>
                  <option value="ligacao">Ligação</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">E-mail</option>
                  <option value="visita">Visita</option>
                  <option value="reuniao">Reunião</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div class="field">
                <label class="field__label" for="relatorio-status">Status do atendimento</label>
                <select class="select" id="relatorio-status" name="status">
                  <option value="">Todos os status</option>
                  <option value="agendado">Agendado</option>
                  <option value="realizado">Realizado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              <div class="filters-grid__actions">
                <button type="reset" class="btn btn--ghost">Limpar</button>
                <button type="submit" class="btn btn--primary">${icon('filter', 16)} Aplicar filtros</button>
              </div>
            </form>
            <p class="filters-hint">
              Os filtros de finalidade aplicam-se aos relatórios de imóveis e clientes; tipo e
              status aplicam-se ao histórico de atendimentos.
            </p>
          </div>
        </div>
        <div class="report-grid">${renderReportCards()}</div>
        <div class="report-result-stack">${renderPlaceholder()}</div>
      </section>
    `;
  },

  mount(root, { session } = {}) {
    state.root = root;
    state.session = session || null;
    state.token += 1;
    state.relatorioAtual = null;
    state.carregando = false;

    carregarOpcoes();

    root.querySelector('[data-report-filter]')?.addEventListener('submit', (event) => {
      event.preventDefault();

      if (!state.relatorioAtual) {
        showToast({
          type: 'info',
          title: 'Selecione um relatório',
          message: 'Escolha um dos relatórios abaixo para aplicar os filtros.',
        });
        return;
      }

      carregarRelatorio(state.relatorioAtual);
    });

    root.querySelector('[data-report-filter]')?.addEventListener('reset', () => {
      window.setTimeout(() => {
        if (state.relatorioAtual) carregarRelatorio(state.relatorioAtual);
      }, 0);
    });

    root.querySelectorAll('[data-report]').forEach((button) => {
      button.addEventListener('click', () => {
        carregarRelatorio(button.dataset.report);
      });
    });

    root.addEventListener('click', (event) => {
      const exportButton = event.target.closest('[data-export]');

      if (exportButton) {
        exportar(exportButton.dataset.export, exportButton);
        return;
      }

      if (event.target.closest('[data-report-retry]') && state.relatorioAtual) {
        carregarRelatorio(state.relatorioAtual);
      }
    });
  },

  unmount() {
    state.token += 1;
    state.root = null;
    state.relatorioAtual = null;
  },
};
