import { icon } from './icons.js';
import { confirmDialog } from './modal.js';
import { possuiPermissao } from '../core/session.js';
import { initials } from '../core/utils.js';

const NAV_GROUPS = [
  {
    label: 'Principal',
    items: [{ path: '/dashboard', label: 'Dashboard', icon: 'dashboard' }],
  },
  {
    label: 'Gestão',
    items: [
      { path: '/imoveis', label: 'Imóveis', icon: 'building' },
      { path: '/corretores', label: 'Corretores', icon: 'users' },
      { path: '/clientes', label: 'Clientes', icon: 'user' },
      { path: '/atendimentos', label: 'Atendimentos', icon: 'chat' },
    ],
  },
  {
    label: 'Análise',
    items: [{ path: '/relatorios', label: 'Relatórios', icon: 'chart' }],
  },
  {
    label: 'Sistema',
    items: [
      {
        path: '/administracao',
        label: 'Administração',
        icon: 'settings',
        permission: 'administracao.visualizar',
      },
    ],
  },
];

function renderNavigation(session) {
  return NAV_GROUPS.map((group) => {
    const items = group.items.filter((item) => possuiPermissao(session, item.permission));
    if (items.length === 0) return '';

    return `
      <div class="nav-group">
        <p class="nav-group__label">${group.label}</p>
        ${items
          .map(
            (item) => `
              <a class="nav-link" href="#${item.path}" data-route="${item.path}">
                ${icon(item.icon, 18)}
                <span>${item.label}</span>
              </a>
            `
          )
          .join('')}
      </div>
    `;
  }).join('');
}

export function initShell({ session }) {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const banner = document.getElementById('preview-banner');
  const headerActions = document.getElementById('header-actions');
  const pageLabel = document.querySelector('[data-page-label]');

  const modoPrevia = session.modo === 'previa';
  const nomeExibicao = modoPrevia ? 'Pré-visualização' : session.usuario.nome;
  const perfilExibicao = modoPrevia ? 'Sessão não autenticada' : session.usuario.perfil;
  const avatarText = modoPrevia ? 'PV' : initials(session.usuario.nome);

  sidebar.innerHTML = `
    <div class="sidebar__brand">
      <span class="brand-mark">IM</span>
      <span class="brand-lockup">
        <span class="brand-wordmark">ImobManager</span>
        <span class="brand-tagline">Gestão imobiliária</span>
      </span>
    </div>
    <nav class="sidebar__nav" aria-label="Menu principal">
      ${renderNavigation(session)}
    </nav>
    <div class="sidebar__footer">
      <div class="user-card">
        <span class="avatar avatar--sm" aria-hidden="true">${avatarText}</span>
        <div class="user-card__text">
          <strong>${nomeExibicao}</strong>
          <span>${perfilExibicao}</span>
        </div>
        <button type="button" class="icon-button icon-button--ghost icon-button--sm" data-action="logout" aria-label="Sair do sistema">
          ${icon('logout', 16)}
        </button>
      </div>
    </div>
  `;

  banner.hidden = !modoPrevia;
  banner.innerHTML = modoPrevia
    ? `
      <span class="preview-banner__icon">${icon('shield', 16)}</span>
      <p>
          <strong>Ambiente de pré-visualização.</strong>
          A autenticação real será implementada na etapa 04 e as permissões, na etapa 05. Nenhum dado é gravado nesta tela.
      </p>
      <a class="preview-banner__link" href="/">Ver tela de login ${icon('arrow-right', 14)}</a>
    `
    : '';

  headerActions.innerHTML = `
    ${modoPrevia ? `<span class="preview-chip">${icon('shield', 14)} Prévia</span>` : ''}
    <div class="header-user">
      <div class="header-user__text">
        <strong>${nomeExibicao}</strong>
        <span>${perfilExibicao}</span>
      </div>
      <span class="avatar avatar--sm" aria-hidden="true">${avatarText}</span>
    </div>
  `;

  const closeSidebar = () => {
    sidebar.classList.remove('is-open');
    overlay.classList.remove('is-visible');
    document.body.classList.remove('sidebar-open');
  };

  const openSidebar = () => {
    sidebar.classList.add('is-open');
    overlay.classList.add('is-visible');
    document.body.classList.add('sidebar-open');
  };

  document.querySelectorAll('[data-action="toggle-sidebar"]').forEach((button) => {
    button.addEventListener('click', () => {
      if (sidebar.classList.contains('is-open')) closeSidebar();
      else openSidebar();
    });
  });

  overlay.addEventListener('click', closeSidebar);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSidebar();
  });

  sidebar.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', closeSidebar);
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) closeSidebar();
  });

  document.querySelector('[data-action="logout"]').addEventListener('click', async () => {
    const confirmado = await confirmDialog({
      title: 'Sair do sistema',
      message: modoPrevia
        ? 'Você retornará à tela de login. A sessão autenticada será implementada na etapa 04.'
        : 'Deseja encerrar a sessão atual?',
      confirmLabel: 'Sair',
      tone: 'primary',
    });

    if (confirmado) window.location.href = '/';
  });

  return {
    setActiveRoute(route) {
      sidebar.querySelectorAll('.nav-link').forEach((link) => {
        const active = link.dataset.route === route.path;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });

      if (pageLabel) pageLabel.textContent = route.title || 'Dashboard';
    },
  };
}
