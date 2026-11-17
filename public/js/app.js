import { carregarSessao } from './core/session.js';
import { icon } from './components/icons.js';
import { createRouter } from './core/router.js';
import { initShell } from './components/shell.js';
import dashboard from './views/dashboard.js';
import imoveis from './views/imoveis.js';
import corretores from './views/corretores.js';
import clientes from './views/clientes.js';
import atendimentos from './views/atendimentos.js';
import relatorios from './views/relatorios.js';
import administracao from './views/administracao.js';

const routes = [
  { path: '/dashboard', title: 'Dashboard', permission: 'dashboard.visualizar', view: dashboard },
  { path: '/imoveis', title: 'Imóveis', permission: 'imoveis.visualizar', view: imoveis },
  { path: '/corretores', title: 'Corretores', permission: 'corretores.visualizar', view: corretores },
  { path: '/clientes', title: 'Clientes', permission: 'clientes.visualizar', view: clientes },
  { path: '/atendimentos', title: 'Atendimentos', permission: 'atendimentos.visualizar', view: atendimentos },
  { path: '/relatorios', title: 'Relatórios', permission: 'relatorios.visualizar', view: relatorios },
  { path: '/administracao', title: 'Administração', permission: 'administracao.visualizar', view: administracao },
];

function renderBootError() {
  const outlet = document.getElementById('view-outlet');

  outlet.innerHTML = `
    <section class="view">
      <div class="empty-state empty-state--panel">
        <span class="empty-state__icon">${icon('alert-circle', 24)}</span>
        <p class="empty-state__title">Não foi possível carregar o sistema</p>
        <p class="empty-state__text">
          Ocorreu uma falha ao consultar sua sessão. Verifique a conexão e tente novamente.
        </p>
        <a class="btn btn--ghost" href="/">Voltar ao login</a>
      </div>
    </section>
  `;
}

async function boot() {
  try {
    const session = await carregarSessao();
    const shell = initShell({ session });

    createRouter({
      routes,
      outlet: document.getElementById('view-outlet'),
      session,
      onNavigate: (route) => shell.setActiveRoute(route),
    });
  } catch (error) {
    if (error.status === 401) {
      window.location.replace('/?sessao=expirada');
      return;
    }

    console.error('[app] Falha ao iniciar:', error);
    renderBootError();
  }
}

boot();
