import { carregarSessao } from './core/session.js';
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

async function boot() {
  const session = await carregarSessao();
  const shell = initShell({ session });

  createRouter({
    routes,
    outlet: document.getElementById('view-outlet'),
    session,
    onNavigate: (route) => shell.setActiveRoute(route),
  });
}

boot();
