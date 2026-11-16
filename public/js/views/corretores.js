import { createModuleView } from '../components/module-view.js';

export default createModuleView({
  title: 'Corretores',
  eyebrow: 'Equipe',
  subtitle: 'Gerencie os corretores responsáveis pelo atendimento e pela carteira de imóveis.',
  permission: 'corretores.visualizar',
  createPermission: 'corretores.criar',
  createLabel: 'Novo corretor',
  createAction: 'novo-corretor',
  searchPlaceholder: 'Buscar por nome, CRECI ou e-mail',
  filters: [
    {
      name: 'situacao',
      label: 'Situação',
      options: [
        { value: '', label: 'Todos os status' },
        { value: 'ativo', label: 'Ativo' },
        { value: 'inativo', label: 'Inativo' },
      ],
    },
  ],
  columns: [
    {
      label: 'Corretor',
      render: (row) => `
        <div class="cell-primary">
          <strong>${row.nome}</strong>
          <span>${row.email}</span>
        </div>
      `,
    },
    { label: 'CRECI', key: 'creci' },
    { label: 'Telefone', key: 'telefone' },
    { label: 'Situação', key: 'situacao' },
    {
      label: 'Ações',
      align: 'right',
      render: () => '<div class="cell-actions"></div>',
    },
  ],
  paginationLabel: 'corretores',
  emptyIcon: 'users',
  emptyTitle: 'Nenhum corretor cadastrado',
  emptyMessage:
    'O cadastro de corretores será conectado ao banco de dados na etapa 06. A tela já apresenta a estrutura de consulta e formulário.',
  filterMessage: 'Os filtros de corretores serão conectados ao PostgreSQL na etapa 06.',
  form: {
    title: 'Novo corretor',
    description: 'Cadastro de corretor com dados de identificação profissional e contato.',
    submitLabel: 'Cadastrar corretor',
    persistenceMessage:
      'Os dados não são gravados nesta etapa. A persistência de corretores será implementada na etapa 06.',
    sections: [
      {
        title: 'Dados pessoais',
        fields: [
          { name: 'nome', label: 'Nome completo', type: 'text', required: true, full: true },
          { name: 'cpf', label: 'CPF', type: 'text', placeholder: '000.000.000-00' },
          { name: 'creci', label: 'CRECI', type: 'text', placeholder: 'Ex.: 123456-F', required: true },
        ],
      },
      {
        title: 'Contato',
        fields: [
          { name: 'email', label: 'E-mail', type: 'email', required: true },
          { name: 'telefone', label: 'Telefone', type: 'tel', placeholder: '(00) 00000-0000' },
          {
            name: 'situacao',
            label: 'Situação',
            type: 'select',
            options: [
              { value: 'ativo', label: 'Ativo' },
              { value: 'inativo', label: 'Inativo' },
            ],
          },
          { name: 'observacoes', label: 'Observações', type: 'textarea', rows: 3, full: true },
        ],
      },
    ],
  },
});
