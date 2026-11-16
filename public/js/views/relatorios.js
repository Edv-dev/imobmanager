import { renderPageHead } from '../components/page.js';
import { icon } from '../components/icons.js';
import { initFilterForms } from '../components/toolbar.js';
import { showToast } from '../components/toast.js';

const RELATORIOS = [
  {
    id: 'carteira-imoveis',
    icon: 'building',
    title: 'Carteira de imóveis',
    description: 'Imóveis por tipo, finalidade, situação e bairro, com valores médios da carteira.',
  },
  {
    id: 'atendimentos',
    icon: 'chat',
    title: 'Atendimentos',
    description: 'Volume de atendimentos por período, canal, status e corretor responsável.',
  },
  {
    id: 'desempenho-corretores',
    icon: 'users',
    title: 'Desempenho de corretores',
    description: 'Atendimentos conduzidos, negociações e resultados por membro da equipe.',
  },
  {
    id: 'base-clientes',
    icon: 'user',
    title: 'Base de clientes',
    description: 'Clientes por tipo, cidade e situação, apoiando ações de relacionamento.',
  },
  {
    id: 'relatorio-gerencial',
    icon: 'file-text',
    title: 'Relatório gerencial',
    description: 'Consolidação periódica dos principais indicadores da operação imobiliária.',
  },
  {
    id: 'exportacao-consolidada',
    icon: 'download',
    title: 'Exportação consolidada',
    description: 'Extração de dados em PDF e CSV para análises externas e prestação de contas.',
  },
];

function renderReportCards() {
  return RELATORIOS.map(
    (report) => `
      <article class="report-card">
        <span class="report-card__icon">${icon(report.icon, 20)}</span>
        <h3>${report.title}</h3>
        <p>${report.description}</p>
        <button type="button" class="btn btn--ghost btn--sm" data-report="${report.id}">
          ${icon('file-text', 14)} Gerar relatório
        </button>
      </article>
    `
  ).join('');
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
          subtitle: 'Consultas consolidadas para apoiar decisões comerciais e operacionais.',
        })}
        <div class="card filters-card">
          <div class="card__body">
            <form class="filters-grid" data-filter-form>
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
                <label class="field__label" for="relatorio-tipo">Tipo</label>
                <select class="select" id="relatorio-tipo" name="tipo">
                  <option value="">Todos os tipos</option>
                  <option value="venda">Venda</option>
                  <option value="aluguel">Aluguel</option>
                </select>
              </div>
              <div class="filters-grid__actions">
                <button type="submit" class="btn btn--ghost">${icon('filter', 16)} Aplicar filtros</button>
              </div>
            </form>
          </div>
        </div>
        <div class="report-grid">${renderReportCards()}</div>
      </section>
    `;
  },

  mount(root) {
    initFilterForms(
      root,
      'Os filtros de relatórios serão conectados aos dados reais na etapa 09.'
    );

    root.querySelectorAll('[data-report]').forEach((button) => {
      button.addEventListener('click', () => {
        showToast({
          type: 'info',
          title: 'Relatório em pré-visualização',
          message:
            'A geração e a exportação de relatórios serão implementadas na etapa 09, após os módulos de dados.',
        });
      });
    });
  },
};
