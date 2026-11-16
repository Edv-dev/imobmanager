const PERMISSOES_ADMINISTRADOR = [
  'dashboard.visualizar',
  'imoveis.visualizar',
  'imoveis.criar',
  'imoveis.editar',
  'imoveis.excluir',
  'imoveis.imagens.gerenciar',
  'corretores.visualizar',
  'corretores.criar',
  'corretores.editar',
  'corretores.desativar',
  'clientes.visualizar',
  'clientes.criar',
  'clientes.editar',
  'clientes.excluir',
  'atendimentos.visualizar',
  'atendimentos.criar',
  'atendimentos.editar',
  'relatorios.visualizar',
  'relatorios.exportar',
  'administracao.visualizar',
  'usuarios.gerenciar',
  'permissoes.gerenciar',
  'configuracoes.gerenciar',
  'auditoria.visualizar',
];

/*
 * Etapa 04 substitui esta sessao de previa por uma chamada a API de
 * autenticacao (por exemplo, GET /api/auth/me), redirecionando para o login
 * quando nao houver sessao valida. A interface nao concede acesso por si so:
 * toda autorizacao sera aplicada no servidor.
 */
const SESSION_PREVIA = {
  modo: 'previa',
  usuario: {
    id: null,
    nome: 'Pré-visualização',
    email: null,
    perfil: 'Administrador',
    permissoes: PERMISSOES_ADMINISTRADOR,
  },
};

export async function carregarSessao() {
  return SESSION_PREVIA;
}

export function possuiPermissao(sessao, permissao) {
  if (!permissao) return true;
  return Boolean(sessao?.usuario?.permissoes?.includes(permissao));
}
