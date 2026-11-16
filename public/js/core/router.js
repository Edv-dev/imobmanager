import { possuiPermissao } from './session.js';
import { icon } from '../components/icons.js';
import { closeAllModals } from '../components/modal.js';

function accessDeniedView() {
  return `
    <section class="view">
      <div class="empty-state empty-state--panel">
        <span class="empty-state__icon">${icon('lock', 24)}</span>
        <p class="empty-state__title">Acesso não autorizado</p>
        <p class="empty-state__text">
          Você não possui permissão para acessar esta área. Esta verificação é apenas visual;
          a autenticação será aplicada na etapa 04 e a autorização definitiva no servidor, na etapa 05.
        </p>
        <a class="btn btn--ghost" href="#/dashboard">${icon('arrow-right')} Voltar ao dashboard</a>
      </div>
    </section>
  `;
}

function notFoundView() {
  return `
    <section class="view">
      <div class="empty-state empty-state--panel">
        <span class="empty-state__icon">${icon('info', 24)}</span>
        <p class="empty-state__title">Página não encontrada</p>
        <p class="empty-state__text">O endereço informado não corresponde a uma tela do sistema.</p>
        <a class="btn btn--ghost" href="#/dashboard">${icon('arrow-right')} Ir para o dashboard</a>
      </div>
    </section>
  `;
}

export function createRouter({ routes, outlet, session, onNavigate }) {
  function parsePath() {
    const hash = window.location.hash.replace(/^#/, '');
    const path = hash.split('?')[0] || '/dashboard';
    return path === '/' ? '/dashboard' : path;
  }

  function render() {
    closeAllModals();
    const path = parsePath();
    const route = routes.find((item) => item.path === path);

    if (!route) {
      outlet.innerHTML = notFoundView();
      document.title = 'Página não encontrada · ImobManager';
      onNavigate?.({ title: 'Não encontrado', path });
      return;
    }

    if (!possuiPermissao(session, route.permission)) {
      outlet.innerHTML = accessDeniedView();
      document.title = 'Acesso restrito · ImobManager';
      onNavigate?.({ title: 'Acesso restrito', path });
      return;
    }

    outlet.innerHTML = route.view.render({ session });

    const heading = outlet.querySelector('h1');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }

    route.view.mount?.(outlet, { session });

    document.title = `${route.title} · ImobManager`;
    onNavigate?.(route);
  }

  window.addEventListener('hashchange', render);
  render();

  return { render, currentPath: parsePath };
}
