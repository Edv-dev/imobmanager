# Cadastro de corretores

Etapa 06 — gestão dos profissionais da imobiliária, do vínculo com contas de acesso e da
carteira de imóveis e clientes.

## Visão geral

A tela `#/corretores` exige a permissão `corretores.visualizar` e opera com a API real.
A listagem oferece busca por nome, CPF, CRECI, e-mail do corretor ou dados da conta,
filtro por situação e paginação. Cada registro pode ser consultado, editado, ativado ou
desativado conforme as permissões efetivas do usuário.

O cadastro não cria uma conta de acesso. Ele vincula um usuário operacional existente que
ainda não possua corretor, pela rota `GET /api/corretores/usuarios-disponiveis`. Contas
podem ser criadas em `#/administracao` e depois vinculadas aqui; a administração também
mantém o fluxo de criar conta e corretor no mesmo formulário.

Campos do corretor:

- nome completo;
- CPF;
- CRECI;
- telefone;
- WhatsApp;
- e-mail profissional;
- endereço;
- data de cadastro;
- situação;
- usuário vinculado.

## Interface

- Cabeçalho com ação **Novo corretor** para quem possui `corretores.criar`.
- Busca e filtro por status, com paginação e estados de carregamento, erro e vazio.
- Tabela com avatar, contato, CRECI, CPF, conta vinculada, data de cadastro e situação.
- Ações de detalhe sempre disponíveis para quem visualiza; edição e mudança de situação
  aparecem apenas com as permissões correspondentes.
- Formulário de criação com seleção de conta, dados profissionais e situação inicial.
- Formulário de edição com a conta vinculada somente para leitura. A situação é exibida
  apenas para quem pode desativar.
- Detalhe com dados profissionais, conta vinculada, imóveis e clientes acessíveis.
- A desativação exige confirmação e informa que as sessões da conta serão encerradas.

## API

Base: `/api/corretores`. Todas as rotas exigem sessão, respondem com
`Cache-Control: no-store` e as mutações exigem `X-CSRF-Token`.

| Método | Rota                       | Permissão                |
| ------ | -------------------------- | ------------------------ |
| GET    | `/`                        | `corretores.visualizar`  |
| GET    | `/resumo`                  | `corretores.visualizar`  |
| GET    | `/usuarios-disponiveis`    | `corretores.criar`       |
| GET    | `/:id`                     | `corretores.visualizar`  |
| POST   | `/`                        | `corretores.criar`       |
| PATCH  | `/:id`                     | `corretores.editar`      |
| PATCH  | `/:id/status`              | `corretores.desativar`   |

Filtros da listagem: `busca`, `status` (`ativos`, `inativos` ou vazio), `pagina` e
`limite` (máximo de 50). A busca é limitada a 100 caracteres e considera também os
dígitos do CPF.

A criação recebe `usuarioId`, `nome`, `cpf`, `creci`, `telefone`, `whatsapp`, `email`,
`endereco` e `ativo`. A edição recebe os mesmos campos do corretor, sem trocar o usuário
vinculado; `ativo` é opcional e exige `corretores.desativar`.

A rota de status recebe `{ "ativo": true | false }`.

## Regras de negócio

- Apenas usuários não administrativos e sem corretor ativo aparecem como disponíveis.
- Cada usuário pode ter no máximo um corretor não excluído.
- CPF é normalizado para 11 dígitos e validado pelos dígitos verificadores.
- E-mail profissional e telefones são opcionais, mas validados quando informados.
- CPF, CRECI e e-mail profissional de corretores não excluídos são únicos. A comparação de
  CRECI ignora caixa e espaços nas extremidades.
- O nome do corretor é sincronizado com o nome da conta vinculada.
- Ativar ou desativar o corretor sincroniza `usuarios.ativo` na mesma transação.
- A desativação revoga todas as sessões da conta com motivo `corretor_desativado`.
- O usuário não pode desativar o próprio cadastro (`SELF_OPERATION`).
- A exclusão é lógica no banco; a interface usa ativação e desativação.
- O e-mail profissional é um contato do corretor e não altera o e-mail de login.
- O detalhe retorna no máximo 50 imóveis e 50 clientes, priorizando vínculos principais e
  registros mais recentes, e informa o total encontrado.

## Autorização e visibilidade

A permissão efetiva segue a precedência definida na etapa 05: exceção individual, permissão
do perfil e negação por padrão. A interface oculta ações sem permissão, mas o servidor
sempre reaplica a verificação.

A lista e o detalhe de corretores excluem registros ligados a perfis administrativos. Os
imóveis e clientes exibidos no detalhe respeitam `imoveis.visibilidade` e
`clientes.visibilidade`, além das exceções individuais:

- `todos`: o ator vê os registros, exceto negações individuais;
- `vinculados`: o ator vê apenas registros vinculados, salvo concessões individuais;
- a negação individual prevalece sobre vínculo e concessão;
- administradores mantêm acesso total.

As consultas usam `acessoService.filtroVisibilidade`, mantendo a mesma regra aplicada aos
próximos módulos.

## Auditoria

As operações são registradas em `auditoria` com ator, IP, user agent e metadados sem
senhas ou tokens:

- `corretor.criado`;
- `corretor.atualizado`;
- `corretor.status_alterado`.

A entidade registrada é `corretores`, com o identificador do corretor e os campos
alterados.

## Erros previstos

| Código                 | HTTP | Situação                                              |
| ---------------------- | ---- | ----------------------------------------------------- |
| `VALIDATION_ERROR`     | 422  | Dados inválidos, usuário ausente ou status inválido.  |
| `CORRETOR_NOT_FOUND`   | 404  | Corretor inexistente ou de perfil administrativo.     |
| `USER_NOT_FOUND`       | 404  | Usuário inexistente.                                  |
| `USER_ALREADY_LINKED`  | 409  | Usuário já possui corretor.                           |
| `ADMIN_CORRETOR`       | 422  | Tentativa de vincular usuário administrativo.         |
| `CPF_IN_USE`           | 409  | CPF já cadastrado em outro corretor.                  |
| `CRECI_IN_USE`         | 409  | CRECI já cadastrado em outro corretor.                |
| `EMAIL_IN_USE`         | 409  | E-mail profissional já cadastrado.                    |
| `SELF_OPERATION`       | 403  | Tentativa de desativar o próprio cadastro.            |
| `FORBIDDEN`            | 403  | Permissão insuficiente.                               |

## Validação

- `node --test tests/corretores.test.js`: 7 testes aprovados.
- `npm test`: 71 testes aprovados.
- `npm run db:check`: 27 verificações aprovadas.
- `npm run migrate:status`: migrations 001 a 006 aplicadas.

## Limitações

- O módulo não cria contas; o vínculo usa um usuário operacional existente.
- Não há exclusão física pela interface.
- O detalhe limita a lista visual a 50 imóveis e 50 clientes, embora exiba o total.
- Upload de foto e gestão de documentos do corretor não fazem parte desta etapa.
