# Gestão de clientes

Etapa 08 — cadastro, consulta, filtros, vínculos com corretores e imóveis de interesse,
atendimentos e histórico.

## Visão geral

A tela `#/clientes` exige a permissão `clientes.visualizar` e opera com a API real. A
listagem oferece busca por nome, CPF, e-mail, telefone, WhatsApp e localização, filtros por
tipo de interesse e finalidade desejada, além de paginação. Cada registro pode ser
consultado, editado ou excluído conforme as permissões efetivas do usuário.

Campos do cliente:

- nome completo;
- CPF único entre clientes ativos;
- telefone e WhatsApp;
- e-mail e endereço;
- tipo de interesse (`comprador`, `vendedor`, `locatario`, `proprietario`, `investidor`
  ou `outro`);
- finalidade desejada (`venda`, `aluguel` ou `ambos`);
- faixa de preço mínima e máxima;
- localização desejada;
- observações;
- corretores responsáveis, com um principal opcional;
- imóveis de interesse.

A migration `004_clientes_interesse` adiciona `clientes_imoveis_interesse`, que relaciona
clientes aos imóveis de interesse. Os vínculos com corretores continuam em
`clientes_corretores`.

## Interface

- Cabeçalho com ação **Novo cliente** para quem possui `clientes.criar`.
- Busca, filtros por tipo de interesse e finalidade, com paginação e estados de
  carregamento, erro e vazio.
- Tabela com identificação e contato, interesse, localização, corretor responsável e ações.
- Formulário em seções: identificação, interesse, corretores responsáveis e imóveis de
  interesse.
- Seletor pesquisável de imóveis de interesse, limitado aos imóveis acessíveis ao usuário.
- Detalhe com contato, interesse, corretores, imóveis, atendimentos e histórico.
- Modal para registrar atendimento vinculado ao cliente, com corretor, imóvel opcional,
  tipo, status, data, descrição e observações.
- Exclusão lógica com confirmação.
- A seção de atendimentos só é exibida e retornada para quem possui
  `atendimentos.visualizar`.

## API

Base: `/api/clientes`. Todas as rotas exigem sessão, respondem com
`Cache-Control: no-store` e as mutações exigem `X-CSRF-Token`.

| Método | Rota                    | Permissão                                    |
| ------ | ----------------------- | -------------------------------------------- |
| GET    | `/`                     | `clientes.visualizar`                        |
| GET    | `/corretores-opcoes`    | `clientes.visualizar` (somente administradores) |
| GET    | `/imoveis-opcoes`       | `clientes.visualizar`                        |
| GET    | `/:id`                  | `clientes.visualizar`                        |
| GET    | `/:id/historico`        | `auditoria.visualizar`                       |
| POST   | `/`                     | `clientes.criar`                             |
| PATCH  | `/:id`                  | `clientes.editar`                            |
| DELETE | `/:id`                  | `clientes.excluir`                           |
| POST   | `/:id/atendimentos`     | `atendimentos.criar`                         |

Filtros da listagem: `busca`, `tipo`, `finalidade`, `localizacao`, `pagina` e `limite`
(máximo de 50). A busca textual é limitada a 100 caracteres e a localização a 120.

A criação e a edição recebem os campos em camelCase (`nome`, `cpf`, `telefone`,
`whatsapp`, `email`, `endereco`, `tipoInteresse`, `finalidadeDesejada`, `faixaPrecoMin`,
`faixaPrecoMax`, `localizacaoDesejada`, `observacoes`). A edição é parcial: campos
ausentes mantêm o valor atual.

Administradores também enviam `corretores` como lista de identificadores e, opcionalmente,
`corretorPrincipalId` (padrão: primeiro da lista). `imoveisInteresse` recebe a lista de
identificadores de imóveis. Para substituir os vínculos por uma lista vazia, envie `[]`.

O detalhe retorna:

```json
{
  "cliente": {},
  "corretores": [],
  "imoveisInteresse": [],
  "atendimentos": [],
  "resumo": { "atendimentos": 0, "limiteAtendimentos": 50 }
}
```

`GET /corretores-opcoes` lista até 500 corretores ativos e é restrito a administradores.
`GET /imoveis-opcoes` lista até 500 imóveis não excluídos, filtrados pela visibilidade de
imóveis do ator.

O registro de atendimento recebe `tipo` (`ligacao`, `whatsapp`, `email`, `visita`,
`reuniao` ou `outro`), `status` (`agendado`, `realizado` ou `cancelado`, padrão
`realizado`), `dataAtendimento` opcional (padrão: agora), `descricao` obrigatória,
`observacoes` e `imovelId` opcional. Administradores podem informar `corretorId`; sem
informação, usa-se o corretor principal vinculado ao cliente. Corretores comuns registram
sempre em nome próprio.

## Regras de negócio

- Nome completo é normalizado e exige pelo menos 3 caracteres.
- CPF é normalizado para 11 dígitos, validado pelos dígitos verificadores e único entre
  clientes ativos; a violação retorna `CPF_IN_USE`.
- Telefone, WhatsApp e e-mail são opcionais, mas validados quando informados.
- Tipo de interesse e finalidade desejada são opcionais, mas restritos aos valores
  previstos.
- Faixa de preço aceita valores não negativos e exige mínimo menor ou igual ao máximo.
- Observações aceitam até 4000 caracteres.
- O corretor que cria o cliente é automaticamente vinculado como principal.
- Somente administradores alteram vínculos de corretores; corretores comuns editam somente
  os demais dados de clientes acessíveis.
- Vínculos usam corretores ativos; o principal deve estar entre os selecionados.
- Imóveis de interesse devem existir e não estar excluídos. Para não administradores, a
  lista também respeita `imoveis.visibilidade` e as exceções individuais por imóvel.
- O detalhe filtra os imóveis de interesse pela visibilidade do ator, mesmo que o vínculo
  tenha sido criado por um administrador.
- A exclusão é lógica (`excluido_em`): o cliente sai da lista, do detalhe e das consultas,
  mas atendimentos e auditoria permanecem no banco. O CPF volta a ficar disponível para
  novos clientes ativos.
- O detalhe retorna no máximo 50 atendimentos e 50 eventos de histórico, do mais recente
  para o mais antigo.

## Autorização e visibilidade

A permissão efetiva segue a precedência da etapa 05: exceção individual, permissão do
perfil e negação por padrão. A interface oculta ações sem permissão, mas o servidor sempre
reaplica a verificação.

A lista, o detalhe, a edição, a exclusão e o registro de atendimentos respeitam
`clientes.visibilidade`:

- `todos`: o ator vê todos os clientes, exceto negações individuais;
- `vinculados`: o ator vê apenas clientes ligados a ele, salvo concessões individuais;
- a negação individual prevalece sobre vínculo e concessão;
- administradores mantêm acesso total.

Clientes inacessíveis respondem `404 CLIENTE_NOT_FOUND`, sem revelar a existência do
registro. As consultas usam `acessoService.filtroVisibilidade`.

Os atendimentos exigem `atendimentos.criar` para registro. A leitura dos atendimentos no
detalhe exige `atendimentos.visualizar`; sem essa permissão, a lista é omitida e o resumo
retorna zero. O histórico exige `auditoria.visualizar`.

## Auditoria

As operações são registradas em `auditoria` com ator, IP, user agent e metadados sem
conteúdo sensível. A entidade registrada é `clientes`:

- `cliente.criado`, com nome, CPF, tipo de interesse, finalidade e vínculos;
- `cliente.atualizado`, com a lista de campos alterados;
- `cliente.excluido`;
- `cliente.atendimento_registrado`, com atendimento, corretor, imóvel, tipo, status e
  data.

O histórico do detalhe é retornado por `GET /:id/historico` e exige
`auditoria.visualizar`.

## Erros previstos

| Código                | HTTP | Situação                                                 |
| --------------------- | ---- | -------------------------------------------------------- |
| `VALIDATION_ERROR`    | 422  | Dados inválidos, enums, valores, vínculos ou atendimento.|
| `CLIENTE_NOT_FOUND`   | 404  | Cliente inexistente, excluído ou inacessível.            |
| `CPF_IN_USE`          | 409  | CPF já utilizado por cliente ativo.                      |
| `FORBIDDEN`           | 403  | Permissão insuficiente ou vínculo não permitido.         |
| `UNAUTHENTICATED`     | 401  | Sessão ausente ou expirada.                              |

## Validação

- `node --test tests/clientes.test.js`: 9 testes aprovados.
- `npm test`: 71 testes aprovados.
- `npm run db:check`: 27 verificações aprovadas.
- `npm run migrate:status`: migrations 001, 002, 003, 004 e 005 aplicadas.

## Limitações

- Não há histórico de alterações de valores campo a campo; a auditoria registra a lista de
  campos alterados, não os valores anteriores.
- A exclusão de cliente é lógica e não remove atendimentos nem vínculos físicos.
- A tela isolada de atendimentos foi ativada na etapa 09; o registro continua no detalhe
  do cliente e a consulta consolidada ocorre em `#/atendimentos`.
- A visibilidade é global por configuração, combinada com exceções individuais; não há
  configuração por cliente.
