# ImobManager

Sistema web de gestão para uma única imobiliária, com arquitetura cliente-servidor e API REST.

**Etapa atual: 03 — Interface e identidade visual.**

## Visão geral

- Frontend: HTML5, CSS3 e JavaScript modular (sem frameworks), com SPA leve por hash.
- Backend: Node.js com Express.
- Banco de dados: PostgreSQL.
- Comunicação: JSON sobre HTTP (HTTPS em produção).
- Interface visual da etapa 03 concluída: login, shell, dashboard, módulos e componentes.
- Telas de negócio não exibem dados fictícios; usam estados vazios até a persistência
  real ser conectada nas etapas 04 a 09, conforme o roteiro.

## Arquitetura

```text
Navegador (HTML/CSS/JS)
        |
        | HTTP/JSON (REST)
        v
Express (src/app.js)
  -> rotas (/api)
  -> controllers (entrada/saída HTTP)
  -> services (regras de negócio)
  -> models (acesso a dados)
  -> middlewares (erros, autenticação futura)
        |
        v
PostgreSQL (pool único em src/config/database.js)
```

Princípios adotados:

- Separação clara entre frontend (`public/`), backend (`src/`) e banco de dados.
- Código modular por responsabilidade: `routes`, `controllers`, `services`, `models`, `middlewares`, `config`.
- Nenhuma regra de negócio na interface; toda validação será feita no servidor.
- Variáveis de ambiente para toda configuração sensível.
- Estrutura preparada para autenticação, autorização e testes automatizados.

## Estrutura de diretórios

```text
imobManager/
├── .env.example          # modelo das variáveis de ambiente
├── .gitignore            # arquivos que não entram no Git
├── package.json          # metadados e scripts do projeto
├── README.md
├── docs/
│   ├── banco-de-dados.md # diagrama ER, relacionamentos e regras de dados
│   └── interface.md      # design system, telas, componentes e responsividade
├── migrations/
│   ├── 001_initial_schema.up.sql   # criação das 14 tabelas, índices e seeds
│   └── 001_initial_schema.down.sql # reversão da migration
├── scripts/
│   ├── db-ping.js        # verifica a conexão com o PostgreSQL
│   ├── db-integrity-check.js # testes de integridade com rollback
│   ├── migrate.js        # runner de migrations (up/down/status)
│   └── setup-database.sh # cria usuário e banco dedicados
├── src/
│   ├── app.js            # configuração do Express (middlewares, rotas, estáticos)
│   ├── server.js         # inicialização e encerramento seguro do servidor
│   ├── config/
│   │   ├── env.js        # carregamento e validação das variáveis de ambiente
│   │   └── database.js   # pool de conexões e verificação de saúde do banco
│   ├── controllers/
│   │   └── health.controller.js
│   ├── services/
│   │   └── health.service.js
│   ├── models/           # (vazio) models de acesso a dados, a partir da etapa 04
│   ├── routes/
│   │   ├── index.js      # agrega as rotas em /api
│   │   └── health.routes.js
│   ├── middlewares/
│   │   ├── notFound.js   # resposta 404 padronizada em JSON
│   │   └── errorHandler.js # tratamento central de erros
│   └── utils/            # (vazio) utilitários compartilhados
├── public/
│   ├── index.html        # tela de login (validação visual)
│   ├── app.html          # shell da SPA com menu, cabeçalho e outlet
│   ├── assets/           # favicon e recursos estáticos
│   ├── css/
│   │   ├── base.css      # tokens, reset e tipografia
│   │   ├── layout.css    # login, sidebar, cabeçalho e responsividade
│   │   ├── components.css # botões, formulários, tabelas, modais e toasts
│   │   └── pages.css     # dashboard, relatórios e administração
│   └── js/
│       ├── login.js      # comportamento da tela de login
│       ├── app.js        # bootstrap da SPA e rotas
│       ├── core/         # api, router, sessão de prévia e utilitários
│       ├── components/   # icons, shell, tabela, formulário, modal, toast etc.
│       └── views/        # dashboard, imóveis, corretores, clientes e demais telas
└── tests/
    ├── api.test.js       # testes de API (healthcheck, 404, JSON inválido, estáticos)
    ├── database.test.js  # teste de indisponibilidade do banco
    └── ui.test.js        # login, shell, CSS, módulos JS e favicon
```

## Requisitos

- Node.js 20 ou superior (validado com Node.js 22).
- PostgreSQL 14 ou superior (validado com PostgreSQL 18).
- Acesso ao `psql` ou a um cliente PostgreSQL.

## Instalação

```bash
npm install
cp .env.example .env
```

Edite o arquivo `.env` e preencha, no mínimo, `DB_PASSWORD` com a senha do usuário do banco.

## Configuração do banco de dados

Crie um usuário e um banco dedicados com o script auxiliar (requer acesso administrativo ao PostgreSQL):

```bash
npm run db:setup
```

O script pede a senha do novo usuário e não armazena credenciais. Para fazer manualmente:

```bash
sudo -u postgres createuser --pwprompt imobmanager
sudo -u postgres createdb --owner=imobmanager imobmanager
```

Depois, preencha `DB_PASSWORD` no `.env`, verifique a conexão e aplique as migrations:

```bash
npm run db:ping
npm run migrate:up
```

Saída esperada do `db:ping`: `Banco de dados acessível (latência: ... ms).`

### Migrations

```bash
npm run migrate:status   # lista migrations aplicadas e pendentes
npm run migrate:up       # aplica as migrations pendentes
npm run migrate:down     # reverte a última migration aplicada
npm run db:check         # executa os testes de integridade do schema
```

As migrations ficam em `migrations/`, são aplicadas em transação e registradas na tabela
`schema_migrations` com checksum SHA-256. Alterar um arquivo já aplicado bloqueia novas execuções
até a correção ser tratada.

## Modelo de dados

A etapa 02 cria 14 tabelas: `perfis`, `usuarios`, `permissoes`, `perfis_permissoes`,
`permissoes_usuarios`, `corretores`, `clientes`, `imoveis`, `imagens_imoveis`,
`imoveis_corretores`, `clientes_corretores`, `atendimentos`, `configuracoes` e `auditoria`.

- Permissões gerais (`perfis_permissoes`) e individuais (`permissoes_usuarios`) ficam em tabelas separadas.
- Exceções individuais têm precedência sobre as permissões do perfil.
- O perfil administrador é identificado por `perfis.administrativo` e independe do cadastro de corretor.
- Exclusão lógica em usuários, corretores, clientes e imóveis, com índices únicos parciais.
- Visibilidade de imóveis e clientes configurada por chave em `configuracoes`.

Detalhes, diagrama ER e precedência de permissões: [docs/banco-de-dados.md](docs/banco-de-dados.md).

## Variáveis de ambiente

| Variável       | Padrão        | Descrição                                                        |
| -------------- | ------------- | ---------------------------------------------------------------- |
| `NODE_ENV`     | `development` | Ambiente de execução (`development`, `test`, `production`).       |
| `PORT`         | `3000`        | Porta HTTP do servidor.                                          |
| `HOST`         | `0.0.0.0`     | Endereço de escuta.                                              |
| `DB_HOST`      | `localhost`   | Host do PostgreSQL.                                              |
| `DB_PORT`      | `5432`        | Porta do PostgreSQL.                                             |
| `DB_NAME`      | `imobmanager` | Nome do banco de dados.                                          |
| `DB_USER`      | `imobmanager` | Usuário do banco de dados.                                       |
| `DB_PASSWORD`  | *(vazio)*     | Senha do banco. Obrigatória em produção.                         |
| `DB_SSL`       | `false`       | Usa conexão SSL com o banco (`true`/`false`).                    |
| `DB_POOL_MAX`  | `10`          | Máximo de conexões simultâneas no pool.                          |
| `DATABASE_URL` | *(vazio)*     | URL completa de conexão; quando definida, substitui as `DB_*`.   |

## Execução

```bash
# desenvolvimento (reinicia automaticamente ao salvar)
npm run dev

# produção
npm start
```

Acesse `http://localhost:3000` para a tela de login,
`http://localhost:3000/app.html` para a prévia das telas internas e
`http://localhost:3000/api/health` para o healthcheck.

### Interface (etapa 03)

- Login: tela visual com validação nativa, status dos serviços via `/api/health` e link
  para a prévia. A autenticação real será implementada na etapa 04.
- Prévia (`/app.html`): shell com sidebar, cabeçalho, banner permanente de ambiente de
  pré-visualização, dashboard, módulos, relatórios e administração.
- Rotas por hash: `#/dashboard`, `#/imoveis`, `#/corretores`, `#/clientes`,
  `#/atendimentos`, `#/relatorios` e `#/administracao`.
- Dashboard consulta o healthcheck real e exibe banco, API, uptime e ambiente.
- Indicadores e tabelas não exibem dados fictícios; usam estado vazio com a etapa em que
  cada informação será alimentada.
- Formulários, filtros e ações informativas validam no navegador e deixam claro que não
  gravam dados nesta fase.
- Componentes reutilizáveis: botões, formulários, tabelas, paginação, modais, toasts,
  estados vazios e toolbars.
- Layout responsivo validado em desktop, tablet e celular.

Detalhes do design system, telas e validação: [docs/interface.md](docs/interface.md).

### Healthcheck

Resposta saudável (`200`):

```json
{
  "status": "ok",
  "service": "imobmanager-api",
  "environment": "development",
  "uptimeSeconds": 12,
  "timestamp": "2026-11-16T12:00:00.000Z",
  "checks": {
    "database": { "status": "up", "latencyMs": 1.42 }
  }
}
```

Se o banco estiver indisponível, a API responde `503` com `"status": "degraded"`
e `"checks.database.status": "down"`, sem expor detalhes internos.

## Testes

```bash
npm test          # testes de API, banco e interface
npm run db:ping   # teste de conectividade com o PostgreSQL
npm run db:check  # testes de integridade do schema (rollback ao final)
```

Os testes usam o test runner nativo do Node.js (`node --test`), sem dependências extras.
A suíte `tests/ui.test.js` verifica login, shell, folhas de estilo, módulos JavaScript e
favicon. O `db:check` valida tabelas, FKs, índices, seeds e regras de unicidade, exclusão
lógica e cascata; todos os dados de teste são revertidos por rollback.

## Segurança já aplicada

- Credenciais e configurações apenas via variáveis de ambiente (`.env` fora do Git).
- `x-powered-by` desabilitado.
- Limite de tamanho para corpos JSON e formulários (`1mb`).
- Respostas de erro padronizadas, sem stack trace em produção.
- Consultas via driver `pg` com suporte a consultas parametrizadas.
- Encerramento seguro do servidor e do pool de conexões.
- A interface da etapa 03 não simula autenticação: o login é claramente identificado como
  prévia e o acesso interno usa `/app.html` com banner informativo.
- Autenticação e proteção de rotas serão implementadas na etapa 04; autorização e
  permissões reais no backend, na etapa 05, junto com Helmet, rate limiting e CSRF.

## Versionamento

O projeto utiliza Git. Cada etapa validada deve ser registrada em um commit.
A versão do `package.json` acompanha as versões definidas no roteiro (`0.1.0` nesta etapa).

## Próximas etapas

- [x] 01 — Planejamento e arquitetura
- [x] 02 — Modelagem do banco de dados
- [x] 03 — Identidade visual e interface
- [ ] 04 — Autenticação e segurança
- [ ] 05 — Administração e permissões
- [ ] 06 — Gestão de corretores
- [ ] 07 — Gestão de imóveis
- [ ] 08 — Gestão de clientes
- [ ] 09 — Dashboard e relatórios
- [ ] 10 — Auditoria e LGPD
- [ ] 11 — Testes e implantação

## Solução de problemas

- **Porta 3000 em uso:** altere `PORT` no `.env`.
- **`Banco de dados inacessível`:** confirme se o PostgreSQL está ativo, se o banco/usuário existem e se a senha no `.env` está correta.
- **Login não autentica:** comportamento esperado na etapa 03; a autenticação será
  implementada na etapa 04. Use `http://localhost:3000/app.html` para a prévia.
- **Erro de autenticação do PostgreSQL:** verifique o método de autenticação configurado no `pg_hba.conf`.
- **Checksum divergente em migration:** um arquivo já aplicado foi alterado; restaure o conteúdo original e crie uma nova migration para a mudança.
- **Tabelas ausentes no `db:check`:** execute `npm run migrate:up`.
