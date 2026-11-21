# Auditoria e LGPD

Etapa 10 — auditoria reforçada, retenção de eventos e atendimento aos direitos dos titulares.

## Visão geral

A etapa 10 complementa a auditoria criada nas etapas anteriores com:

- registro de acessos negados, CSRF inválido e origem inválida;
- imutabilidade dos eventos no banco de dados;
- consulta administrativa com filtros por resultado, entidade, usuário e período;
- política de retenção configurável, com expurgo manual e por linha de comando;
- exportação dos dados pessoais de um cliente em JSON;
- anonimização irreversível de clientes, com protocolo e motivo registrados.

A auditoria continua sendo somente inclusão pela aplicação. A manutenção controlada
(expurgo e redação de dados pessoais) usa uma variável local de transação:
`imobmanager.auditoria_manutencao = 'on'`.

## Permissões

| Permissão              | Finalidade                                              |
| ---------------------- | ------------------------------------------------------- |
| `auditoria.visualizar` | Consultar o histórico administrativo.                   |
| `auditoria.gerenciar`  | Ler e alterar a retenção e executar o expurgo.          |
| `lgpd.gerenciar`       | Exportar e anonimizar dados pessoais de clientes.       |

Todas as rotas exigem sessão, perfil administrativo e CSRF nas mutações. As permissões
`auditoria.gerenciar` e `lgpd.gerenciar` foram adicionadas pela migration
`005_auditoria_lgpd` e concedidas ao perfil Administrador; `auditoria.visualizar` já
existia desde a etapa 05.

## Eventos registrados

Além dos eventos de autenticação e CRUD já existentes, a etapa 10 registra:

| Tipo de operação                     | Quando ocorre                                        |
| ------------------------------------ | ---------------------------------------------------- |
| `seguranca.acesso_negado`            | Sessão ausente, perfil não administrativo ou permissão insuficiente. |
| `seguranca.csrf_invalido`            | Mutação autenticada sem token CSRF válido.            |
| `seguranca.origem_invalida`          | `Origin` ou `Sec-Fetch-Site` incompatível em mutação. |
| `admin.retencao_auditoria_atualizada`| Alteração do prazo de retenção.                       |
| `admin.auditoria_expurgada`          | Expurgo manual (`administracao`) ou por CLI (`cli`). |
| `lgpd.cliente_exportado`             | Exportação dos dados de um titular.                   |
| `lgpd.cliente_anonimizado`           | Anonimização concluída, com protocolo e motivo.       |

Cada evento guarda ator (quando houver), e-mail, data/hora, tipo, entidade, registro,
resultado, IP, user agent e detalhes. Senhas, tokens de sessão, tokens de recuperação e
conteúdo integral de dados pessoais não são gravados pela rotina de auditoria.

## Imutabilidade

A migration `005_auditoria_lgpd` cria o trigger `trg_auditoria_somente_inclusao`, que
rejeita `UPDATE` e `DELETE` na tabela `auditoria` com o código PostgreSQL `42501`.

A única exceção é a manutenção interna, que define a variável local da transação:

```sql
BEGIN;
SELECT set_config('imobmanager.auditoria_manutencao', 'on', true);
DELETE FROM auditoria WHERE data_hora < now() - INTERVAL '365 days';
COMMIT;
```

Corretores e demais perfis não administrativos não acessam as rotas de auditoria. A
aplicação não expõe a variável de manutenção em requisições HTTP.

## Consulta administrativa

`GET /api/administracao/auditoria` aceita:

- `busca`: tipo, e-mail, entidade ou registro;
- `tipo`: tipo exato de operação;
- `resultado`: `sucesso` ou `falha`;
- `entidade`: entidade exata;
- `usuarioId`: identificador do usuário;
- `inicio` e `fim`: datas no formato `AAAA-MM-DD` (inclusivas);
- `pagina`, `limite` (máximo 50).

Datas inválidas ou intervalo invertido são rejeitados com `422 VALIDATION_ERROR`.

## Retenção e expurgo

A chave `auditoria.retencao_dias` fica em `configuracoes` (JSONB), com padrão de 365 dias
e limites de 30 a 3650 dias.

| Método | Rota                                            | Permissão             |
| ------ | ----------------------------------------------- | --------------------- |
| GET    | `/api/administracao/auditoria/retencao`         | `auditoria.gerenciar` |
| PUT    | `/api/administracao/auditoria/retencao`         | `auditoria.gerenciar` |
| POST   | `/api/administracao/auditoria/retencao/executar`| `auditoria.gerenciar` |

O expurgo remove eventos com `data_hora` anterior ao prazo e registra
`admin.auditoria_expurgada` com a quantidade removida. O agendamento periódico fica sob
responsabilidade da operação; uma opção é executar diariamente:

```bash
npm run audit:purge
```

Exemplo de cron (diário, 03:15):

```cron
15 3 * * * cd /caminho/imobManager && npm run audit:purge >> logs/audit-purge.log 2>&1
```

## Direitos dos titulares

### Exportação

`GET /api/administracao/lgpd/clientes/:id/dados` gera um JSON com:

- dados cadastrais do titular;
- corretores vinculados;
- imóveis de interesse;
- até 500 atendimentos, com descrição e observações;
- finalidade do tratamento e base legal resumida.

A interface baixa o arquivo `lgpd-cliente-<id>-<timestamp>.json` e registra
`lgpd.cliente_exportado` sem copiar os dados pessoais para os detalhes da auditoria.

### Anonimização

`POST /api/administracao/lgpd/clientes/:id/anonimizar` exige `confirmar: true` e um
`motivo` entre 10 e 300 caracteres. Em uma única transação:

1. bloqueia o cliente para atualização;
2. substitui o nome por `Cliente anonimizado #<id>`;
3. substitui o CPF por um identificador derivado do ID e remove contato e preferências;
4. marca `excluido_em` (se ainda não estiver preenchido);
5. substitui as descrições de atendimentos e remove observações;
6. remove vínculos de corretores, imóveis de interesse e exceções de acesso;
7. remove chaves pessoais dos detalhes de eventos de auditoria ligados ao cliente;
8. registra `lgpd.cliente_anonimizado` com protocolo `LGPD-<timestamp>-<id>` e motivo.

A operação é irreversível e retorna a contagem de atendimentos, vínculos e eventos de
auditoria tratados. O protocolo deve ser usado no registro interno da solicitação.

## Consulta de clientes para LGPD

`GET /api/administracao/lgpd/clientes?busca=...` localiza clientes por nome, CPF ou
e-mail, com no mínimo 2 caracteres. A rota exige `lgpd.gerenciar` e não depende das
permissões operacionais do módulo de clientes.

## Medidas de proteção adotadas

- Autorização no servidor por permissão e perfil administrativo.
- CSRF e verificação de origem em todas as mutações.
- Auditoria de negação de acesso, CSRF e origem inválida.
- Imutabilidade da auditoria no banco, com manutenção transacional restrita.
- Retenção configurável e expurgo registrado.
- Exportação sem persistir o conteúdo do arquivo no servidor.
- Anonimização transacional com redação de PII em atendimentos e auditoria.
- Dados sensíveis não são incluídos em logs de aplicação.
- Consultas parametrizadas e respostas de erro sem detalhes internos.

## Pontos pendentes para conformidade jurídica

Este documento descreve medidas técnicas, não parecer jurídico. A conformidade final
depende de validação com responsável legal/encarregado de dados (DPO):

- nomear encarregado e publicar canal de comunicação do titular;
- definir a base legal de cada finalidade (contrato, legítimo interesse, consentimento
  quando aplicável) e registrar a avaliação no inventário de tratamentos;
- revisar a política de privacidade e os avisos de coleta;
- definir prazos de retenção por categoria de dado e alinhar `auditoria.retencao_dias` e
  eventuais obrigações legais de guarda;
- formalizar contratos com operadores e prestadores (SMTP, hospedagem, backup);
- definir procedimento de verificação de identidade do titular antes de exportar ou
  anonimizar dados;
- definir processo de atendimento de incidentes, incluindo comunicação à ANPD e titulares;
- avaliar necessidade de RIPD para tratamentos de maior risco;
- tratar transferência internacional de dados, se houver;
- incluir dados de backup e logs no escopo de retenção e eliminação;
- documentar a impossibilidade de atender pedidos que conflitem com obrigações legais de
  guarda e registrar a justificativa.

## Validação

```bash
node --test --test-concurrency=1 tests/lgpd.test.js
npm test
npm run db:check
```

A suíte `tests/lgpd.test.js` cobre permissões, CSRF, origem inválida, exportação,
validação da anonimização, remoção de PII, redação da auditoria, retenção, expurgo e
filtros combinados da consulta.
