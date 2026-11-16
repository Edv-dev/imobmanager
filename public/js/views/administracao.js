import { renderPageHead } from '../components/page.js';
import { icon } from '../components/icons.js';
import { showToast } from '../components/toast.js';

const PERFIS = [
  {
    nome: 'Administrador',
    resumo: 'Acesso completo à operação, à configuração e à auditoria do sistema.',
    icon: 'shield',
    itens: [
      'Todos os módulos operacionais',
      'Gestão de usuários e permissões',
      'Configurações de visibilidade',
      'Consulta à auditoria',
    ],
  },
  {
    nome: 'Corretor',
    resumo: 'Acesso operacional à carteira, aos clientes e aos atendimentos.',
    icon: 'briefcase',
    itens: [
      'Imóveis: consultar, criar e editar',
      'Clientes: consultar e editar',
      'Atendimentos: registrar e acompanhar',
      'Relatórios operacionais',
    ],
  },
];

function renderPerfis() {
  return PERFIS.map(
    (perfil) => `
      <article class="permission-card">
        <div class="permission-card__header">
          <span class="permission-card__icon">${icon(perfil.icon, 19)}</span>
          <div>
            <h3>${perfil.nome}</h3>
            <p>${perfil.resumo}</p>
          </div>
        </div>
        <ul class="permission-list">
          ${perfil.itens
            .map((item) => `<li>${icon('check-circle', 15)} <span>${item}</span></li>`)
            .join('')}
        </ul>
      </article>
    `
  ).join('');
}

export default {
  title: 'Administração',
  permission: 'administracao.visualizar',

  render() {
    return `
      <section class="view">
        ${renderPageHead({
          eyebrow: 'Sistema',
          title: 'Administração',
          subtitle: 'Perfis de acesso, permissões, usuários e regras de visibilidade dos dados.',
        })}

        <div class="section-stack">
          <div class="notice notice--info">
            ${icon('shield', 18)}
            <p>
              Módulo em pré-visualização. Usuários e sessões serão implementados na etapa 04;
              permissões e configurações de visibilidade, na etapa 05. As preferências passam a
              valer quando os módulos operacionais forem implementados.
            </p>
          </div>

          <div class="permission-grid">${renderPerfis()}</div>

          <div class="card">
            <div class="card__header">
              <div>
                <h2>Precedência de permissões</h2>
                <p class="card__subtitle">Regra aplicada pelo banco de dados para resolver acessos.</p>
              </div>
            </div>
            <div class="card__body">
              <div class="precedence">
                <span class="precedence__step">Permissão individual</span>
                ${icon('arrow-right', 14)}
                <span class="precedence__step">Perfil do usuário</span>
                ${icon('arrow-right', 14)}
                <span class="precedence__step">Padrão do sistema</span>
                <span>— a regra mais específica prevalece.</span>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card__header">
              <div>
                <h2>Usuários do sistema</h2>
                <p class="card__subtitle">Contas vinculadas aos perfis Administrador e Corretor.</p>
              </div>
              <span class="badge badge--warning">Etapa 04</span>
            </div>
            <div class="card__body">
              <div class="empty-state">
                <span class="empty-state__icon">${icon('user-plus', 24)}</span>
                <p class="empty-state__title">Gestão de usuários na etapa 04</p>
                <p class="empty-state__text">
                  Criação de contas, redefinição de senha e vínculo de perfil serão implementados
                  junto com a autenticação e a sessão do sistema.
                </p>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card__header">
              <div>
                <h2>Visibilidade dos dados</h2>
                <p class="card__subtitle">Define o alcance de consulta de imóveis e clientes.</p>
              </div>
            </div>
            <div class="card__body">
              <form class="visibility-form" data-visibility-form>
                <div class="form-grid">
                  <div class="field">
                    <label class="field__label" for="visibilidade-imoveis">Imóveis</label>
                    <select class="select" id="visibilidade-imoveis" name="imoveis">
                      <option value="todos">Todos os usuários</option>
                      <option value="proprios">Apenas registros próprios</option>
                      <option value="equipe">Equipe do corretor</option>
                    </select>
                    <p class="field__hint">Valor inicial previsto na tabela de configurações: "todos".</p>
                  </div>
                  <div class="field">
                    <label class="field__label" for="visibilidade-clientes">Clientes</label>
                    <select class="select" id="visibilidade-clientes" name="clientes">
                      <option value="todos">Todos os usuários</option>
                      <option value="proprios">Apenas registros próprios</option>
                      <option value="equipe">Equipe do corretor</option>
                    </select>
                    <p class="field__hint">Valor inicial previsto na tabela de configurações: "todos".</p>
                  </div>
                </div>
                <div class="visibility-actions">
                  <button type="submit" class="btn btn--primary">${icon('check-circle', 16)} Salvar preferências</button>
                  <button type="button" class="btn btn--ghost" data-action="reset-visibility">Restaurar padrão</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>
    `;
  },

  mount(root) {
    const form = root.querySelector('[data-visibility-form]');
    const reset = root.querySelector('[data-action="reset-visibility"]');

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      showToast({
        type: 'info',
        title: 'Preferência não gravada',
        message:
          'A gravação da visibilidade será conectada à tabela configuracoes na etapa 05. Nenhum valor foi alterado no banco.',
      });
    });

    reset.addEventListener('click', () => {
      form.reset();
      showToast({
        type: 'info',
        title: 'Formulário restaurado',
        message: 'Os campos voltaram aos valores padrão de exibição. Nada foi gravado.',
      });
    });
  },
};
