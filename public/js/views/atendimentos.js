import { createModuleView } from '../components/module-view.js';

export default createModuleView({
  title: 'Atendimentos',
  eyebrow: 'Operação',
  subtitle: 'Acompanhe solicitações, visitas e negociações entre clientes e corretores.',
  permission: 'atendimentos.visualizar',
  createPermission: 'atendimentos.criar',
  createLabel: 'Novo atendimento',
  createAction: 'novo-atendimento',
  searchPlaceholder: 'Buscar por cliente, imóvel ou corretor',
  filters: [
    {
      name: 'status',
      label: 'Status',
      options: [
        { value: '', label: 'Todos os status' },
        { value: 'aberto', label: 'Aberto' },
        { value: 'em_andamento', label: 'Em andamento' },
        { value: 'concluido', label: 'Concluído' },
        { value: 'cancelado', label: 'Cancelado' },
      ],
    },
    {
      name: 'canal',
      label: 'Canal',
      options: [
        { value: '', label: 'Todos os canais' },
        { value: 'telefone', label: 'Telefone' },
        { value: 'whatsapp', label: 'WhatsApp' },
        { value: 'email', label: 'E-mail' },
        { value: 'presencial', label: 'Presencial' },
      ],
    },
  ],
  columns: [
    {
      label: 'Cliente',
      render: (row) => `
        <div class="cell-primary">
          <strong>${row.cliente}</strong>
          <span>${row.assunto}</span>
        </div>
      `,
    },
    { label: 'Imóvel', key: 'imovel' },
    { label: 'Corretor', key: 'corretor' },
    { label: 'Canal', key: 'canal' },
    { label: 'Status', key: 'status' },
    { label: 'Data', key: 'data', align: 'right' },
    {
      label: 'Ações',
      align: 'right',
      render: () => '<div class="cell-actions"></div>',
    },
  ],
  paginationLabel: 'atendimentos',
  emptyIcon: 'chat',
  emptyTitle: 'Nenhum atendimento registrado',
  emptyMessage:
    'Os atendimentos serão registrados na etapa 08, vinculando clientes, imóveis e corretores.',
  filterMessage: 'Os filtros de atendimentos serão conectados ao PostgreSQL na etapa 08.',
  form: {
    title: 'Novo atendimento',
    description: 'Registro de atendimento com vínculos, canal de contato e descrição.',
    submitLabel: 'Registrar atendimento',
    persistenceMessage:
      'Os dados não são gravados nesta etapa. O registro de atendimentos será implementado na etapa 08.',
    sections: [
      {
        title: 'Vínculos',
        fields: [
          {
            name: 'cliente',
            label: 'Cliente',
            type: 'select',
            required: true,
            options: [{ value: '', label: 'Selecione um cliente' }],
          },
          {
            name: 'imovel',
            label: 'Imóvel',
            type: 'select',
            options: [{ value: '', label: 'Selecione um imóvel (opcional)' }],
          },
          {
            name: 'corretor',
            label: 'Corretor responsável',
            type: 'select',
            options: [{ value: '', label: 'Selecione um corretor' }],
          },
          {
            name: 'canal',
            label: 'Canal',
            type: 'select',
            required: true,
            options: [
              { value: 'telefone', label: 'Telefone' },
              { value: 'whatsapp', label: 'WhatsApp' },
              { value: 'email', label: 'E-mail' },
              { value: 'presencial', label: 'Presencial' },
            ],
          },
        ],
      },
      {
        title: 'Detalhes',
        fields: [
          {
            name: 'status',
            label: 'Status',
            type: 'select',
            options: [
              { value: 'aberto', label: 'Aberto' },
              { value: 'em_andamento', label: 'Em andamento' },
              { value: 'concluido', label: 'Concluído' },
              { value: 'cancelado', label: 'Cancelado' },
            ],
          },
          { name: 'assunto', label: 'Assunto', type: 'text', required: true },
          { name: 'descricao', label: 'Descrição do atendimento', type: 'textarea', rows: 5, full: true, required: true },
        ],
      },
    ],
  },
});
