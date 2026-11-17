# Administração e permissões

Etapa 05 — gestão de usuários, perfis, permissões, visibilidade e auditoria.

## Visão geral

A área `#/administracao` é exibida para usuários com `administracao.visualizar` e adapta
as abas às permissões efetivas do usuário:

| Aba                | Conteúdo                                                        | Permissão                 |
| ------------------ | --------------------------------------------------------------- | ------------------------- |
| Visão geral        | Indicadores de contas, administradores, corretores e sessões.   | `administracao.visualizar` |
| Usuários           | Cadastro, edição, status, senha, permissões e acessos.          | `usuarios.gerenciar`      |
| Perfis e permissões| Matriz de permissões por perfil e catálogo do sistema.          | `permissoes.gerenciar`    |
| Visibilidade       | Regra geral e exceções individuais por imóvel/cliente.          | `configuracoes.gerenciar` ou `permissoes.gerenciar` |
| Histórico          | Consulta paginada da auditoria.                                 | `auditoria.visualizar`    |

Todas as rotas usam `requireAuth` e `requireAdministrativeProfile`, respondem com
`Cache-Control: no-store` e aplicam a autorização no servidor. Mutações exigem o
cabeçalho `X-CSRF-Token`.

## API

Base: `/api/administracao`.

| Método | Rota                                              | Observação                                      |
| ------ | ------------------------------------------------- | ----------------------------------------------- |
| GET    | `/resumo`                                         | Contagens e visibilidade atual.                 |
| GET    | `/usuarios`                                       | Busca, perfil, status e paginação.              |
| POST   | `/usuarios`                                       | Cria conta e, se operacional, o corretor.       |
| GET    | `/usuarios/:id`                                   | Detalhe da conta e do corretor vinculado.       |
| PATCH  | `/usuarios/:id`                                   | Dados da conta, perfil, status e corretor.      |
| PATCH  | `/usuarios/:id/status`                            | Ativa ou desativa e revoga sessões ao desativar.|
| POST   | `/usuarios/:id/redefinir-senha`                   | Nova senha, revogação de sessões e troca obrigatória. |
| GET    | `/usuarios/opcoes`                                | Seleção de usuários para telas administrativas. |
| GET    | `/perfis/opcoes`                                  | Perfis básicos para o formulário de usuário.    |
| GET/PUT| `/usuarios/:id/permissoes`                        | Matriz efetiva e exceções individuais.          |
| GET/PUT| `/usuarios/:id/acessos`                           | Exceções por imóvel e cliente.                  |
| GET    | `/perfis`                                         | Perfis, permissões e catálogo completo.         |
| PUT    | `/perfis/:id/permissoes`                          | Substitui as permissões gerais do perfil.       |
| GET    | `/recursos`                                       | Imóveis e clientes disponíveis para exceções.   |
| GET    | `/configuracoes`                                  | Regra atual e usuários não administrativos.     |
| PUT    | `/configuracoes/visibilidade`                     | Define `todos` ou `vinculados` por módulo.      |
| GET    | `/auditoria`                                      | Histórico com busca, tipo e paginação.          |

## Regras de usuários e corretores

- Perfis administrativos não exigem cadastro em `corretores`.
- Perfis não administrativos exigem CPF, CRECI válidos e demais dados do corretor na
  criação; a edição também valida os dados informados.
- CPF, CRECI e e-mail de corretor ativo são únicos. E-mail de usuário ativo também é único.
- Desativar uma conta revoga todas as sessões ativas e desativa o corretor vinculado;
  reativar a conta reativa o corretor de perfil operacional, mas não recria sessões.
- A exclusão é lógica no banco; a interface usa ativação/desativação.
- O último administrador ativo não pode ser desativado nem rebaixado (`LAST_ADMIN`).
- O administrador não pode desativar a própria conta, alterar o próprio perfil nem
  redefinir a própria senha pela administração (`SELF_OPERATION`).
- A senha inicial e a senha redefinida seguem a política do sistema e marcam
  `deve_trocar_senha`.

## Permissões

A permissão efetiva é resolvida nesta ordem:

1. exceção individual em `permissoes_usuarios`;
2. permissão do perfil em `perfis_permissoes`;
3. negação por padrão.

Regras adicionais aplicadas pelo servidor:

- O perfil Administrador deve manter as permissões essenciais:
  `administracao.visualizar`, `usuarios.gerenciar` e `permissoes.gerenciar`.
- Permissões do módulo `administracao` não podem ser atribuídas a perfis operacionais nem
  concedidas individualmente a usuários não administrativos.
- Um usuário não pode alterar as próprias permissões (`SELF_PERMISSION_CHANGE`) nem as
  próprias exceções de acesso (`SELF_ACCESS_CHANGE`).
- Desativar ou rebaixar o último administrador ativo é bloqueado.

## Visibilidade e exceções por registro

As configurações `imoveis.visibilidade` e `clientes.visibilidade` aceitam:

- `todos`: todos os corretores acessam todos os registros;
- `vinculados`: o corretor acessa apenas registros vinculados a ele em
  `imoveis_corretores` ou `clientes_corretores`.

Exceções individuais ficam em `acessos_imoveis` e `acessos_clientes`:

- `permitido = true` concede o registro mesmo na regra `vinculados`;
- `permitido = false` nega o registro mesmo na regra `todos` ou quando há vínculo;
- a negação prevalece sobre vínculo e concessão; administradores mantêm acesso total;
- cada par usuário + registro é único e as exceções são substituídas em conjunto;
- registros inexistentes, duplicados ou usuários administrativos são rejeitados.

O serviço `acesso.service` expõe `podeAcessarRegistro`, `garantirAcessoRegistro` e
`filtroVisibilidade`, permitindo aplicar a mesma regra nas consultas dos próximos módulos.

## Auditoria

As ações administrativas são registradas em `auditoria` com ator, IP, user agent e
detalhes sem senhas ou tokens:

- `admin.usuario_criado`
- `admin.usuario_atualizado`
- `admin.usuario_status`
- `admin.usuario_senha_redefinida`
- `admin.permissoes_perfil_atualizadas`
- `admin.permissoes_usuario_atualizadas`
- `admin.acessos_usuario_atualizados`
- `admin.visibilidade_atualizada`

A consulta aceita `busca`, `tipo`, `pagina` e `limite`, com limite máximo de 50 registros.

## Interface

- Abas controladas por permissão, com carregamento assíncrono e estados de erro.
- Formulário de usuário com seção de corretor exibida apenas para perfis operacionais.
- Editor de permissões individuais com opções Herdar, Permitir e Negar.
- Editor de exceções por registro com filtro local e indicação de vínculo.
- Editor de permissões do perfil com bloqueio das permissões essenciais e do módulo
  administrativo conforme o tipo de perfil.
- Histórico com filtros, paginação e detalhes em JSON.
- Todas as mensagens de erro do servidor são exibidas sem recarregar a página.

## Validação

- `node --test tests/admin.test.js`: 8 testes aprovados.
- `npm test`: 32 testes aprovados.
- `npm run db:check`: 25 verificações aprovadas, incluindo as novas tabelas, FKs, índices
  únicos e triggers de `atualizado_em`.
- `npm run migrate:status`: migrations 001, 002 e 003 aplicadas.

## Limitações

- A troca de senha pelo próprio usuário continua usando o fluxo de recuperação.
- Não há exclusão física de usuários pela interface.
- O rate limiting permanece em memória do processo.
- A interface lista até 200 imóveis e 200 clientes para exceções por registro.
