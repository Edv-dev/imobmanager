import { renderPageHead } from '../components/page.js';
import { icon } from '../components/icons.js';
import { getHealth } from '../core/api.js';
import { formatTime, formatUptime } from '../core/utils.js';

const KPIS = [
  {
    label: 'Imóveis cadastrados',
    icon: 'building',
    note: 'Disponível na etapa 07',
    featured: true,
  },
  {
    label: 'Clientes ativos',
    icon: 'user',
    note: 'Disponível na etapa 08',
  },
  {
    label: 'Corretores ativos',
    icon: 'users',
    note: 'Disponível na etapa 06',
  },
  {
    label: 'Atendimentos em aberto',
    icon: 'chat',
    note: 'Disponível na etapa 08',
  },
];

function renderKpis() {
  return KPIS.map(
    (kpi) => `
      <article class="kpi-card${kpi.featured ? ' kpi-card--featured' : ''}">
        <div class="kpi-card__top">
          <span class="kpi-card__label">${kpi.label}</span>
          <span class="kpi-icon">${icon(kpi.icon, 20)}</span>
        </div>
        <strong class="kpi-card__value">&mdash;</strong>
        <p class="kpi-card__note">${icon('clock', 13)} ${kpi.note}</p>
      </article>
    `
  ).join('');
}

function renderActivity() {
  return `
    <section class="card" aria-labelledby="activity-title">
      <div class="card__header">
        <div>
          <h2 id="activity-title">Atividade recente</h2>
          <p class="card__subtitle">Últimos movimentos registrados no sistema.</p>
        </div>
        <span class="badge badge--neutral">Em breve</span>
      </div>
      <div class="card__body">
        <div class="empty-state">
          <span class="empty-state__icon">${icon('activity', 24)}</span>
          <p class="empty-state__title">Nenhuma atividade registrada</p>
          <p class="empty-state__text">
            Cadastros de imóveis, clientes e atendimentos aparecerão aqui quando os módulos
            operacionais entrarem em funcionamento.
          </p>
        </div>
      </div>
    </section>
  `;
}

function renderShortcuts() {
  const shortcuts = [
    { route: '/imoveis', icon: 'building', label: 'Consultar imóveis' },
    { route: '/atendimentos', icon: 'chat', label: 'Registrar atendimento' },
    { route: '/clientes', icon: 'user', label: 'Cadastrar cliente' },
    { route: '/relatorios', icon: 'chart', label: 'Abrir relatórios' },
  ];

  return `
    <section class="card" aria-labelledby="shortcuts-title">
      <div class="card__header">
        <div>
          <h2 id="shortcuts-title">Atalhos rápidos</h2>
          <p class="card__subtitle">Acesso direto às áreas mais utilizadas.</p>
        </div>
      </div>
      <div class="card__body">
        <ul class="shortcut-list">
          ${shortcuts
            .map(
              (item) => `
                <li>
                  <a href="#${item.route}">
                    ${icon(item.icon, 17)}
                    <span>${item.label}</span>
                    ${icon('arrow-right', 15)}
                  </a>
                </li>
              `
            )
            .join('')}
        </ul>
      </div>
    </section>
  `;
}

function renderHealthCard() {
  return `
    <section class="card" data-health-card aria-labelledby="health-title">
      <div class="card__header">
        <div>
          <h2 id="health-title">Status do sistema</h2>
          <p class="card__subtitle">Verificação em tempo real da infraestrutura.</p>
        </div>
        <span data-health-badge><span class="badge badge--neutral">Verificando</span></span>
      </div>
      <div class="card__body" data-health-body>
        <p class="status-timestamp">Consultando /api/health...</p>
      </div>
    </section>
  `;
}

function statusItem(iconName, label, value, state = '') {
  return `
    <li class="status-list__item">
      <span class="status-list__label">${icon(iconName, 15)} ${label}</span>
      <span class="status-list__value"${state ? ` data-state="${state}"` : ''}>${value}</span>
    </li>
  `;
}

function badgeFor(state) {
  const map = {
    loading: ['neutral', 'Verificando'],
    ok: ['success', 'Operacional'],
    degraded: ['warning', 'Degradado'],
    down: ['danger', 'Indisponível'],
  };
  const [tone, label] = map[state] || map.loading;
  return `<span class="badge badge--${tone}">${label}</span>`;
}

async function refreshHealth(card) {
  const badge = card.querySelector('[data-health-badge]');
  const body = card.querySelector('[data-health-body]');

  badge.innerHTML = badgeFor('loading');
  body.innerHTML = '<p class="status-timestamp">Consultando /api/health...</p>';

  const { ok, status, data } = await getHealth();

  if (!card.isConnected) return;

  const database = data?.checks?.database;
  const databaseUp = database?.status === 'up';
  const apiUp = ok && Boolean(data);

  const state = apiUp && databaseUp ? 'ok' : apiUp ? 'degraded' : 'down';
  badge.innerHTML = badgeFor(state);

  const latency =
    databaseUp && typeof database.latencyMs === 'number'
      ? ` · ${database.latencyMs.toLocaleString('pt-BR')} ms`
      : '';

  body.innerHTML = `
    <ul>
      ${statusItem('database', 'Banco de dados', databaseUp ? `Conectado${latency}` : 'Indisponível', databaseUp ? 'ok' : 'error')}
      ${statusItem('activity', 'API REST', apiUp ? 'Respondendo' : 'Sem resposta', apiUp ? 'ok' : 'error')}
      ${statusItem('clock', 'Tempo no ar', data?.uptimeSeconds !== undefined ? formatUptime(data.uptimeSeconds) : '—')}
      ${statusItem('info', 'Ambiente', data?.environment || '—')}
    </ul>
    <div class="health-actions">
      <button type="button" class="btn btn--ghost btn--sm" data-health-refresh>${icon('refresh', 14)} Verificar novamente</button>
      <p class="status-timestamp">Última verificação: ${formatTime()}${status === 503 ? ' · serviço degradado' : ''}</p>
    </div>
  `;
}

export default {
  title: 'Dashboard',
  permission: 'dashboard.visualizar',

  render() {
    return `
      <section class="view">
        ${renderPageHead({
          eyebrow: 'Visão geral',
          title: 'Dashboard',
          subtitle: 'Panorama da operação imobiliária. Os indicadores serão alimentados pelos módulos operacionais.',
          actions: `<a class="btn btn--ghost" href="#/relatorios">${icon('chart', 16)} Relatórios</a>`,
        })}
        <div class="kpi-grid">${renderKpis()}</div>
        <div class="dashboard-grid">
          ${renderActivity()}
          <div class="dashboard-side">
            ${renderHealthCard()}
            ${renderShortcuts()}
          </div>
        </div>
      </section>
    `;
  },

  mount(root) {
    const card = root.querySelector('[data-health-card]');
    if (!card) return;

    refreshHealth(card);

    card.addEventListener('click', (event) => {
      if (event.target.closest('[data-health-refresh]')) refreshHealth(card);
    });
  },
};
