import { createModuleView } from '../components/module-view.js';

export default createModuleView({
  title: 'Imóveis',
  eyebrow: 'Gestão de carteira',
  subtitle: 'Cadastre, organize e acompanhe os imóveis disponíveis para venda ou locação.',
  permission: 'imoveis.visualizar',
  createPermission: 'imoveis.criar',
  createLabel: 'Novo imóvel',
  createAction: 'novo-imovel',
  searchPlaceholder: 'Buscar por código, título ou bairro',
  filters: [
    {
      name: 'finalidade',
      label: 'Finalidade',
      options: [
        { value: '', label: 'Todas as finalidades' },
        { value: 'venda', label: 'Venda' },
        { value: 'aluguel', label: 'Aluguel' },
      ],
    },
    {
      name: 'situacao',
      label: 'Situação',
      options: [
        { value: '', label: 'Todas as situações' },
        { value: 'disponivel', label: 'Disponível' },
        { value: 'reservado', label: 'Reservado' },
        { value: 'vendido', label: 'Vendido' },
        { value: 'locado', label: 'Locado' },
        { value: 'inativo', label: 'Inativo' },
      ],
    },
    {
      name: 'tipo',
      label: 'Tipo',
      options: [
        { value: '', label: 'Todos os tipos' },
        { value: 'apartamento', label: 'Apartamento' },
        { value: 'casa', label: 'Casa' },
        { value: 'terreno', label: 'Terreno' },
        { value: 'comercial', label: 'Comercial' },
        { value: 'rural', label: 'Rural' },
      ],
    },
  ],
  columns: [
    {
      label: 'Código',
      render: (row) => `<span class="badge badge--neutral">${row.codigo}</span>`,
    },
    {
      label: 'Imóvel',
      render: (row) => `
        <div class="cell-primary">
          <strong>${row.titulo}</strong>
          <span>${row.endereco}</span>
        </div>
      `,
    },
    { label: 'Tipo', key: 'tipo' },
    { label: 'Finalidade', key: 'finalidade' },
    { label: 'Valor', key: 'valor', align: 'right' },
    { label: 'Situação', render: (row) => row.situacao },
    {
      label: 'Ações',
      align: 'right',
      render: () => '<div class="cell-actions"></div>',
    },
  ],
  paginationLabel: 'imóveis',
  emptyIcon: 'building',
  emptyTitle: 'Nenhum imóvel cadastrado',
  emptyMessage:
    'A carteira de imóveis será conectada ao banco de dados na etapa 07. Até lá, esta tela demonstra a estrutura de consulta e cadastro.',
  filterMessage: 'Os filtros de imóveis serão conectados ao PostgreSQL na etapa 07.',
  form: {
    title: 'Novo imóvel',
    description: 'Cadastro de imóvel com dados de identificação, endereço e valores.',
    submitLabel: 'Cadastrar imóvel',
    persistenceMessage:
      'Os dados não são gravados nesta etapa. A persistência de imóveis será implementada na etapa 07.',
    sections: [
      {
        title: 'Identificação',
        fields: [
          { name: 'codigo', label: 'Código', type: 'text', placeholder: 'Ex.: IM-0001', required: true },
          { name: 'titulo', label: 'Título do anúncio', type: 'text', placeholder: 'Ex.: Apartamento 3 quartos no Centro', required: true, full: true },
          {
            name: 'tipo',
            label: 'Tipo',
            type: 'select',
            required: true,
            options: [
              { value: 'apartamento', label: 'Apartamento' },
              { value: 'casa', label: 'Casa' },
              { value: 'terreno', label: 'Terreno' },
              { value: 'comercial', label: 'Comercial' },
              { value: 'rural', label: 'Rural' },
            ],
          },
          {
            name: 'finalidade',
            label: 'Finalidade',
            type: 'select',
            required: true,
            options: [
              { value: 'venda', label: 'Venda' },
              { value: 'aluguel', label: 'Aluguel' },
            ],
          },
        ],
      },
      {
        title: 'Endereço',
        fields: [
          { name: 'cep', label: 'CEP', type: 'text', placeholder: '00000-000', inputmode: 'numeric' },
          { name: 'logradouro', label: 'Logradouro', type: 'text', placeholder: 'Rua, avenida...', full: true },
          { name: 'numero', label: 'Número', type: 'text' },
          { name: 'complemento', label: 'Complemento', type: 'text' },
          { name: 'bairro', label: 'Bairro', type: 'text' },
          { name: 'cidade', label: 'Cidade', type: 'text', required: true },
          { name: 'estado', label: 'UF', type: 'text', placeholder: 'Ex.: SP', maxlength: 2 },
        ],
      },
      {
        title: 'Características e valores',
        fields: [
          { name: 'area', label: 'Área (m²)', type: 'number', min: '0', step: '0.01' },
          { name: 'valor', label: 'Valor (R$)', type: 'number', min: '0', step: '0.01', required: true },
          { name: 'quartos', label: 'Quartos', type: 'number', min: '0', step: '1' },
          { name: 'banheiros', label: 'Banheiros', type: 'number', min: '0', step: '1' },
          { name: 'vagas', label: 'Vagas de garagem', type: 'number', min: '0', step: '1' },
          {
            name: 'situacao',
            label: 'Situação',
            type: 'select',
            options: [
              { value: 'disponivel', label: 'Disponível' },
              { value: 'reservado', label: 'Reservado' },
              { value: 'vendido', label: 'Vendido' },
              { value: 'locado', label: 'Locado' },
              { value: 'inativo', label: 'Inativo' },
            ],
          },
          { name: 'descricao', label: 'Descrição', type: 'textarea', rows: 4, full: true },
        ],
      },
    ],
  },
});
