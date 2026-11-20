import { renderPageHead } from '../components/page.js';
import { icon } from '../components/icons.js';
import { showToast } from '../components/toast.js';
import { request, getHealth } from '../core/api.js';
import { escapeHtml, formatTime, formatUptime } from '../core/utils.js';

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

const ROTULOS_TIPO = {
  ligacao: 'Ligação',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  visita: 'Visita',
  reuniao: 'Reunião',
  outro: 'Outro',
};

const state = {
  root: null,
  session: null,
  token: 0,
  carregado: false,
};

function formatarNumero(valor) {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return '—';
  return Number(valor).toLocaleString('pt-BR');
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

function percentual(parte, total) {
  if (!total) return 0;
  return (parte / total) * 100;
}

function slug(valor) {
  return String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function tratarFalha(error) {
  if (error?.status === 401) {
    window.location.replace('/?sessao=expirada');
    return true;
  }
  return false;
}

function renderLoading() {
  return `
    <div class="kpi-grid">
      ${Array.from({ length: 4 })
        .map(
          () => `
            <article class="kpi-card kpi-card--loading" aria-hidden="true">
              <span class="skeleton skeleton--sm"></span>
              <span class="skeleton skeleton--lg"></span>
              <span class="skeleton skeleton--md"></span>
            </article>
          `
        )
        .join('')}
    </div>
    <div class="dashboard-grid">
      <section class="card">
        <div class="card__body">
          <span class="skeleton skeleton--lg"></span>
        </div>
      </section>
      <section class="card">
        <div class="card__body">
          <span class="skeleton skeleton--lg"></span>
        </div>
      </section>
    </div>
  `;
}

function renderKpiCard({ label, value, iconName, note, featured = false }) {
  return `
    <article class="kpi-card${featured ? ' kpi-card--featured' : ''}">
      <div class="kpi-card__top">
        <span class="kpi-card__label">${escapeHtml(label)}</span>
        <span class="kpi-icon">${icon(iconName, 20)}</span>
      </div>
      <strong class="kpi-card__value">${escapeHtml(value)}</strong>
      <p class="kpi-card__note">${icon('clock', 13)} ${escapeHtml(note)}</p>
    </article>
  `;
}

function renderKpis(data) {
  const cartoes = [];
  const imoveis = data.imoveis;

  if (imoveis) {
    cartoes.push({
      label: 'Imóveis cadastrados',
      iconName: 'building',
      value: formatarNumero(imoveis.total),
      note: 'Carteira completa',
      featured: true,
    });
    cartoes.push({
      label: 'Imóveis disponíveis',
      iconName: 'home',
      value: formatarNumero(imoveis.disponiveis),
      note: `${percentual(imoveis.disponiveis, imoveis.total).toLocaleString('pt-BR', {
        maximumFractionDigits: 0,
      })}% da carteira`,
    });
    cartoes.push({
      label: 'Imóveis vendidos',
      iconName: 'check-circle',
      value: formatarNumero(imoveis.vendidos),
      note: `${percentual(imoveis.vendidos, imoveis.total).toLocaleString('pt-BR', {
        maximumFractionDigits: 0,
      })}% da carteira`,
    });
    cartoes.push({
      label: 'Imóveis alugados',
      iconName: 'key',
      value: formatarNumero(imoveis.alugados),
      note: `${percentual(imoveis.alugados, imoveis.total).toLocaleString('pt-BR', {
        maximumFractionDigits: 0,
      })}% da carteira`,
    });
  }

  if (data.corretores) {
    cartoes.push({
      label: 'Corretores ativos',
      iconName: 'users',
      value: formatarNumero(data.corretores.ativos),
      note: 'Equipe em atividade',
    });
  }

  if (data.clientes) {
    cartoes.push({
      label: 'Clientes cadastrados',
      iconName: 'user',
      value: formatarNumero(data.clientes.total),
      note: 'Base total',
    });
    cartoes.push({
      label: 'Novos clientes',
      iconName: 'user-plus',
      value: formatarNumero(data.clientes.novos30Dias),
      note: 'Últimos 30 dias',
    });
  }

  if (data.atendimentos) {
    cartoes.push({
      label: 'Atendimentos registrados',
      iconName: 'chat',
      value: formatarNumero(data.atendimentos.total),
      note: `${formatarNumero(data.atendimentos.ultimos30Dias)} nos últimos 30 dias`,
    });
  }

  if (cartoes.length === 0) {
    return `
      <div class="empty-state empty-state--panel">
        <span class="empty-state__icon">${icon('lock', 24)}</span>
        <p class="empty-state__title">Sem indicadores disponíveis</p>
        <p class="empty-state__text">
          Seu perfil não possui permissão para consultar os dados operacionais do dashboard.
        </p>
      </div>
    `;
  }

  return `<div class="kpi-grid">${cartoes.map(renderKpiCard).join('')}</div>`;
}

function renderBarChart({ title, subtitle, items, iconName, emptyMessage }) {
  const total = items.reduce((soma, item) => soma + Number(item.total || 0), 0);
  const maximo = Math.max(1, ...items.map((item) => Number(item.total || 0)));

  const conteudo = items.length
    ? `
      <ul class="chart-bars">
        ${items
          .map(
            (item) => `
              <li class="chart-bars__item">
                <div class="chart-bars__head">
                  <span>${escapeHtml(item.rotulo)}</span>
                  <strong>${formatarNumero(item.total)}</strong>
                </div>
                <div class="chart-bars__track">
                  <span class="chart-bars__fill" style="width: ${((Number(item.total) / maximo) * 100).toFixed(1)}%"></span>
                </div>
              </li>
            `
          )
          .join('')}
      </ul>
      <p class="chart-caption">Total: ${formatarNumero(total)}</p>
    `
    : `<p class="chart-empty">${escapeHtml(emptyMessage)}</p>`;

  return `
    <section class="card" aria-labelledby="chart-${slug(title)}">
      <div class="card__header">
        <div>
          <h2 id="chart-${slug(title)}">${escapeHtml(title)}</h2>
          <p class="card__subtitle">${escapeHtml(subtitle)}</p>
        </div>
        <span class="kpi-icon">${icon(iconName, 18)}</span>
      </div>
      <div class="card__body">${conteudo}</div>
    </section>
  `;
}

function renderColumnsChart({ title, subtitle, items, iconName, emptyMessage }) {
  const maximo = Math.max(1, ...items.map((item) => Number(item.total || 0)));
  const total = items.reduce((soma, item) => soma + Number(item.total || 0), 0);

  const conteudo = items.length
    ? `
      <div class="chart-columns" role="img" aria-label="${escapeHtml(title)}: ${escapeHtml(
          items.map((item) => `${item.rotulo}, ${item.total}`).join('; ')
        )}">
        ${items
          .map(
            (item) => `
              <div class="chart-columns__item">
                <span class="chart-columns__value">${formatarNumero(item.total)}</span>
                <div class="chart-columns__track">
                  <span class="chart-columns__bar" style="--altura: ${((Number(item.total) / maximo) * 100).toFixed(1)}%"></span>
                </div>
                <span class="chart-columns__label">${escapeHtml(item.rotulo)}</span>
              </div>
            `
          )
          .join('')}
      </div>
      <p class="chart-caption">Total no período: ${formatarNumero(total)}</p>
    `
    : `<p class="chart-empty">${escapeHtml(emptyMessage)}</p>`;

  return `
    <section class="card" aria-labelledby="chart-${slug(title)}">
      <div class="card__header">
        <div>
          <h2 id="chart-${slug(title)}">${escapeHtml(title)}</h2>
          <p class="card__subtitle">${escapeHtml(subtitle)}</p>
        </div>
        <span class="kpi-icon">${icon(iconName, 18)}</span>
      </div>
      <div class="card__body">${conteudo}</div>
    </section>
  `;
}

function renderAtividade(atendimentos) {
  const recentes = atendimentos?.recentes || [];

  return `
    <section class="card" aria-labelledby="activity-title">
      <div class="card__header">
        <div>
          <h2 id="activity-title">Atividade recente</h2>
          <p class="card__subtitle">Últimos atendimentos registrados no sistema.</p>
        </div>
        <a class="btn btn--ghost btn--sm" href="#/atendimentos">${icon('arrow-right', 14)} Ver todos</a>
      </div>
      <div class="card__body">
        ${
          recentes.length
            ? `<ul class="activity-list">
                ${recentes
                  .map(
                    (item) => `
                      <li class="activity-list__item">
                        <span class="activity-list__icon">${icon('chat', 16)}</span>
                        <div class="activity-list__content">
                          <strong>${escapeHtml(item.cliente)}</strong>
                          <span>
                            ${escapeHtml(item.corretor)} ·
                            ${escapeHtml(ROTULOS_TIPO[item.tipo] || item.tipo)}
                            ${item.imovel ? ` · ${escapeHtml(item.imovel.codigo)}` : ''}
                          </span>
                        </div>
                        <time datetime="${escapeHtml(item.dataAtendimento)}">${formatarDataHora(
                          item.dataAtendimento
                        )}</time>
                        <span class="badge badge--${TONS_STATUS[item.status] || 'neutral'}">${escapeHtml(
                          ROTULOS_STATUS[item.status] || item.status
                        )}</span>
                      </li>
                    `
                  )
                  .join('')}
              </ul>`
            : `<div class="empty-state">
                <span class="empty-state__icon">${icon('activity', 24)}</span>
                <p class="empty-state__title">Nenhum atendimento registrado</p>
                <p class="empty-state__text">
                  Registre atendimentos no detalhe do cliente para acompanhar a movimentação aqui.
                </p>
              </div>`
        }
      </div>
    </section>
  `;
}

function renderShortcuts() {
  const shortcuts = [
    { route: '/imoveis', icon: 'building', label: 'Consultar imóveis' },
    { route: '/atendimentos', icon: 'chat', label: 'Ver atendimentos' },
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

function statusItem(iconName, label, value, stateName = '') {
  return `
    <li class="status-list__item">
      <span class="status-list__label">${icon(iconName, 15)} ${label}</span>
      <span class="status-list__value"${stateName ? ` data-state="${stateName}"` : ''}>${value}</span>
    </li>
  `;
}

function badgeFor(stateName) {
  const map = {
    loading: ['neutral', 'Verificando'],
    ok: ['success', 'Operacional'],
    degraded: ['warning', 'Degradado'],
    down: ['danger', 'Indisponível'],
  };
  const [tone, label] = map[stateName] || map.loading;
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

  const estado = apiUp && databaseUp ? 'ok' : apiUp ? 'degraded' : 'down';
  badge.innerHTML = badgeFor(estado);

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

function initHealth(root) {
  const card = root.querySelector('[data-health-card]');
  if (!card) return;

  refreshHealth(card);

  card.addEventListener('click', (event) => {
    if (event.target.closest('[data-health-refresh]')) refreshHealth(card);
  });
}

function renderContent(data) {
  const imoveis = data.imoveis;
  const atendimentos = data.atendimentos;
  const clientes = data.clientes;

  const distribuicoes = imoveis
    ? `
      <div class="dashboard-charts">
        ${renderBarChart({
          title: 'Imóveis por situação',
          subtitle: 'Distribuição da carteira conforme a situação cadastrada.',
          items: imoveis.porSituacao,
          iconName: 'chart',
          emptyMessage: 'Nenhum imóvel visível para o seu perfil.',
        })}
        ${renderBarChart({
          title: 'Imóveis por finalidade',
          subtitle: 'Carteira de venda e de aluguel.',
          items: imoveis.porFinalidade,
          iconName: 'building',
          emptyMessage: 'Nenhum imóvel visível para o seu perfil.',
        })}
      </div>
    `
    : '';

  const series = `
    <div class="dashboard-charts">
      ${
        atendimentos
          ? renderColumnsChart({
              title: 'Atendimentos por mês',
              subtitle: 'Volume dos últimos seis meses.',
              items: atendimentos.serieMensal,
              iconName: 'chat',
              emptyMessage: 'Nenhum atendimento registrado nos últimos seis meses.',
            })
          : ''
      }
      ${
        clientes
          ? renderColumnsChart({
              title: 'Novos clientes por mês',
              subtitle: 'Cadastros realizados nos últimos seis meses.',
              items: clientes.serieMensal,
              iconName: 'user-plus',
              emptyMessage: 'Nenhum cliente cadastrado nos últimos seis meses.',
            })
          : ''
      }
    </div>
  `;

  return `
    ${renderKpis(data)}
    ${distribuicoes}
    <div class="dashboard-grid">
      ${
        atendimentos
          ? renderAtividade(atendimentos)
          : `<section class="card">
              <div class="card__body">
                <div class="empty-state">
                  <span class="empty-state__icon">${icon('lock', 24)}</span>
                  <p class="empty-state__title">Atividade restrita</p>
                  <p class="empty-state__text">
                    Seu perfil não possui permissão para consultar os atendimentos recentes.
                  </p>
                </div>
              </div>
            </section>`
      }
      <div class="dashboard-side">
        ${renderHealthCard()}
        ${renderShortcuts()}
      </div>
    </div>
    ${series}
    <p class="dashboard-updated">
      Indicadores calculados a partir dos dados reais do banco em ${formatarDataHora(data.geradoEm)}.
    </p>
  `;
}

function renderError(message) {
  return `
    <div class="empty-state empty-state--panel">
      <span class="empty-state__icon">${icon('alert-circle', 24)}</span>
      <p class="empty-state__title">Não foi possível carregar o dashboard</p>
      <p class="empty-state__text">${escapeHtml(message)}</p>
      <button type="button" class="btn btn--ghost" data-dashboard-retry>${icon('refresh', 16)} Tentar novamente</button>
    </div>
  `;
}

async function carregar(root, session) {
  const container = root.querySelector('[data-dashboard-content]');
  if (!container) return;

  const token = ++state.token;
  container.innerHTML = renderLoading();

  try {
    const data = await request('/api/dashboard');
    if (token !== state.token || !container.isConnected) return;

    state.carregado = true;
    container.innerHTML = renderContent(data);
    initHealth(container);

    container.querySelector('[data-dashboard-retry]')?.addEventListener('click', () => {
      carregar(root, session);
    });
  } catch (error) {
    if (tratarFalha(error)) return;
    if (token !== state.token || !container.isConnected) return;

    container.innerHTML = renderError(
      error?.message || 'Verifique a conexão e tente novamente.'
    );
    initHealth(container);

    container.querySelector('[data-dashboard-retry]')?.addEventListener('click', () => {
      carregar(root, session);
    });
  }
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
          subtitle: 'Panorama da operação imobiliária com indicadores calculados a partir dos dados reais.',
          actions: `<a class="btn btn--ghost" href="#/relatorios">${icon('chart', 16)} Relatórios</a>`,
        })}
        <div data-dashboard-content>${renderLoading()}</div>
      </section>
    `;
  },

  mount(root, { session } = {}) {
    state.root = root;
    state.session = session || null;
    state.carregado = false;
    carregar(root, session);
  },

  unmount() {
    state.token += 1;
    state.root = null;
  },
};
