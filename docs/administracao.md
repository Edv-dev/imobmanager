# Administração e permissões

Etapa 05 — gestão de usuários, perfis, permissões, visibilidade e auditoria. A etapa 10
complementa a área com consulta avançada, retenção e atendimento aos direitos dos
titulares (LGPD). Detalhes em [lgpd-auditoria.md](lgpd-auditoria.md).

## Visão geral

A área `#/administracao` é exibida para usuários com `administracao.visualizar` e adapta
as abas às permissões efetivas do usuário:

| Aba                | Conteúdo                                                        | Permissão                 |
| ------------------ | --------------------------------------------------------------- | ------------------------- |
| Visão geral        | Indicadores de contas, administradores, corretores e sessões.   | `administracao.visualizar` |
| Usuários           | Cadastro, edição, status, senha, permissões e acessos.          | `usuarios.gerenciar`      |
| Perfis e permissões| Matriz de permissões por perfil e catálogo do sistema.          | `permissoes.gerenciar`    |
| Visibilidade       | Regra geral e exceções individuais por imóvel/cliente.          | `configuracoes.gerenciar` ou `permissoes.gerenciar` |
| LGPD               | Exportação e anonimização de dados de clientes.                 | `lgpd.gerenciar`          |
| Histórico          | Consulta paginada da auditoria e retenção.                      | `auditoria.visualizar` e `auditoria.gerenciar` |

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
| GET    | `/auditoria`                                      | Histórico com busca, tipo, resultado, entidade, usuário, período e paginação. |
| GET    | `/auditoria/retencao`                             | Prazo atual e quantidade de eventos expiráveis. |
| PUT    | `/auditoria/retencao`                             | Define o prazo entre 30 e 3650 dias.            |
| POST   | `/auditoria/retencao/executar`                    | Expurga eventos além do prazo.                  |
| GET    | `/lgpd`                                           | Resumo das últimas operações LGPD.              |
| GET    | `/lgpd/clientes`                                  | Busca clientes por nome, CPF ou e-mail.         |
| GET    | `/lgpd/clientes/:id/dados`                        | Exporta os dados pessoais em JSON.              |
| POST   | `/lgpd/clientes/:id/anonimizar`                   | Anonimiza o cliente após confirmação e motivo.  |

## Regras de usuários e corretores

- Perfis administrativos não exigem cadastro em `corretores`.
- Perfis não administrativos exigem CPF, CRECI válidos e demais dados do corretor na
  criação; a edição também valida os dados informados.
- CPF, CRECI e e-mail de corretor ativo são únicos. E-mail de usuário ativo também é único.
- Desativar uma conta revoga todas as sessões ativas e desativa o corretor vinculado;
  reativar a conta reativa o corretor de perfil operacional, mas não recria sessões.
- O formulário administrativo pode criar a conta e o corretor juntos. O módulo
  `#/corretores` também vincula contas operacionais existentes que ainda não tenham
  corretor; as regras estão em [corretores.md](corretores.md).
- Nome, situação e sessões são sincronizados entre a conta e o corretor pelos dois fluxos.
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

A etapa 10 acrescenta:

- `seguranca.acesso_negado`, `seguranca.csrf_invalido` e `seguranca.origem_invalida`;
- `admin.retencao_auditoria_atualizada` e `admin.auditoria_expurgada`;
- `lgpd.cliente_exportado` e `lgpd.cliente_anonimizado`.

A tabela é somente inclusão, protegida pelo trigger `trg_auditoria_somente_inclusao`.
Expurgo e redação de dados pessoais usam manutenção transacional interna. A consulta
aceita `busca`, `tipo`, `resultado`, `entidade`, `usuarioId`, `inicio`, `fim`, `pagina`
e `limite`, com limite máximo de 50 registros. A retenção padrão é de 365 dias
(configurável entre 30 e 3650) e pode ser executada manualmente ou por
`npm run audit:purge`. Fluxo completo em [lgpd-auditoria.md](lgpd-auditoria.md).

## Interface

- Abas controladas por permissão, com carregamento assíncrono e estados de erro.
- Formulário de usuário com seção de corretor exibida apenas para perfis operacionais.
- Editor de permissões individuais com opções Herdar, Permitir e Negar.
- Editor de exceções por registro com filtro local e indicação de vínculo.
- Editor de permissões do perfil com bloqueio das permissões essenciais e do módulo
  administrativo conforme o tipo de perfil.
- Histórico com filtros combinados, paginação, detalhes em JSON e card de retenção para
  usuários com `auditoria.gerenciar`.
- Aba LGPD com busca de clientes, download em JSON e anonimização com confirmação,
  motivo e protocolo.
- Todas as mensagens de erro do servidor são exibidas sem recarregar a página.

## Validação

- `node --test tests/admin.test.js`: 8 testes aprovados.
- `node --test tests/corretores.test.js`: 7 testes aprovados.
- `node --test tests/imoveis.test.js`: 10 testes aprovados.
- `node --test tests/clientes.test.js`: 9 testes aprovados.
- `node --test tests/lgpd.test.js`: 7 testes aprovados.
- `npm test`: 71 testes aprovados.
- `npm run db:check`: 27 verificações aprovadas, incluindo as novas tabelas, FKs, índices
  únicos e triggers de `atualizado_em`.
- `npm run migrate:status`: migrations 001 a 006 aplicadas.

## Limitações

- A troca de senha pelo próprio usuário continua usando o fluxo de recuperação.
- Não há exclusão física de usuários pela interface.
- O rate limiting permanece em memória do processo.
- A interface lista até 200 imóveis e 200 clientes para exceções por registro.
