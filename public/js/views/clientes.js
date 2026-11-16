import { createModuleView } from '../components/module-view.js';

export default createModuleView({
  title: 'Clientes',
  eyebrow: 'Relacionamento',
  subtitle: 'Organize compradores, vendedores, locatários e proprietários atendidos pela imobiliária.',
  permission: 'clientes.visualizar',
  createPermission: 'clientes.criar',
  createLabel: 'Novo cliente',
  createAction: 'novo-cliente',
  searchPlaceholder: 'Buscar por nome, documento ou e-mail',
  filters: [
    {
      name: 'tipo',
      label: 'Tipo de cliente',
      options: [
        { value: '', label: 'Todos os tipos' },
        { value: 'comprador', label: 'Comprador' },
        { value: 'vendedor', label: 'Vendedor' },
        { value: 'locatario', label: 'Locatário' },
        { value: 'proprietario', label: 'Proprietário' },
      ],
    },
    {
      name: 'situacao',
      label: 'Situação',
      options: [
        { value: '', label: 'Todas as situações' },
        { value: 'ativo', label: 'Ativo' },
        { value: 'inativo', label: 'Inativo' },
      ],
    },
  ],
  columns: [
    {
      label: 'Cliente',
      render: (row) => `
        <div class="cell-primary">
          <strong>${row.nome}</strong>
          <span>${row.email}</span>
        </div>
      `,
    },
    { label: 'Tipo', key: 'tipo' },
    { label: 'Telefone', key: 'telefone' },
    { label: 'Cidade', key: 'cidade' },
    { label: 'Situação', key: 'situacao' },
    {
      label: 'Ações',
      align: 'right',
      render: () => '<div class="cell-actions"></div>',
    },
  ],
  paginationLabel: 'clientes',
  emptyIcon: 'user',
  emptyTitle: 'Nenhum cliente cadastrado',
  emptyMessage:
    'O cadastro de clientes será conectado ao banco de dados na etapa 08, integrado aos atendimentos.',
  filterMessage: 'Os filtros de clientes serão conectados ao PostgreSQL na etapa 08.',
  form: {
    title: 'Novo cliente',
    description: 'Cadastro de cliente com perfil, documento e dados de contato.',
    submitLabel: 'Cadastrar cliente',
    persistenceMessage:
      'Os dados não são gravados nesta etapa. A persistência de clientes será implementada na etapa 08.',
    sections: [
      {
        title: 'Identificação',
        fields: [
          { name: 'nome', label: 'Nome completo / razão social', type: 'text', required: true, full: true },
          {
            name: 'tipo',
            label: 'Tipo de cliente',
            type: 'select',
            required: true,
            options: [
              { value: 'comprador', label: 'Comprador' },
              { value: 'vendedor', label: 'Vendedor' },
              { value: 'locatario', label: 'Locatário' },
              { value: 'proprietario', label: 'Proprietário' },
            ],
          },
          { name: 'documento', label: 'CPF / CNPJ', type: 'text', required: true },
        ],
      },
      {
        title: 'Contato e localização',
        fields: [
          { name: 'email', label: 'E-mail', type: 'email' },
          { name: 'telefone', label: 'Telefone', type: 'tel', placeholder: '(00) 00000-0000', required: true },
          { name: 'cidade', label: 'Cidade', type: 'text' },
          { name: 'estado', label: 'UF', type: 'text', maxlength: 2 },
          { name: 'observacoes', label: 'Observações', type: 'textarea', rows: 3, full: true },
        ],
      },
    ],
  },
});
