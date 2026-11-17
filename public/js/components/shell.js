import { icon } from './icons.js';
import { confirmDialog } from './modal.js';
import { possuiPermissao, encerrarSessaoLocal } from '../core/session.js';
import { initials, escapeHtml } from '../core/utils.js';
import { request } from '../core/api.js';
import { showToast } from './toast.js';

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
  const headerActions = document.getElementById('header-actions');
  const pageLabel = document.querySelector('[data-page-label]');

  const nomeExibicao = escapeHtml(session.usuario.nome);
  const perfilExibicao = escapeHtml(session.usuario.perfil);
  const avatarText = escapeHtml(initials(session.usuario.nome));

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

  headerActions.innerHTML = `
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

  const logoutButton = document.querySelector('[data-action="logout"]');

  logoutButton.addEventListener('click', async () => {
    const confirmado = await confirmDialog({
      title: 'Sair do sistema',
      message: 'Deseja encerrar a sessão atual?',
      confirmLabel: 'Sair',
      tone: 'primary',
    });

    if (!confirmado) return;

    logoutButton.disabled = true;

    try {
      await request('/api/auth/logout', { method: 'POST' });
      encerrarSessaoLocal();
      window.location.assign('/');
    } catch (error) {
      logoutButton.disabled = false;

      if (error.status === 401) {
        encerrarSessaoLocal();
        window.location.assign('/');
        return;
      }

      showToast({
        type: 'error',
        title: 'Não foi possível encerrar a sessão',
        message: error.message,
      });
    }
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
