# ImobManager

Sistema web de gestão para uma única imobiliária, com arquitetura cliente-servidor e API REST.

**Versão 1.0.0 — Testes e implantação (etapa 11).**

## Visão geral

- Frontend: HTML5, CSS3 e JavaScript modular (sem frameworks), com SPA leve por hash.
- Backend: Node.js com Express.
- Banco de dados: PostgreSQL.
- Comunicação: JSON sobre HTTP (HTTPS em produção).
- Autenticação real por e-mail e senha, sessões no servidor, recuperação de senha e
  auditoria dos eventos de acesso.
- Área administrativa funcional: usuários, corretores vinculados, perfis e permissões,
  exceções individuais, visibilidade de imóveis/clientes, histórico de auditoria,
  retenção de eventos e atendimento LGPD (exportação e anonimização).
- Auditoria reforçada: acessos negados, CSRF e origem inválida registrados, tabela
  imutável por trigger, consulta com filtros combinados e expurgo por retenção.
- Cadastro de corretores funcional: busca, filtros, CRUD, ativação/desativação, vínculo
  com contas e consulta de imóveis/clientes conforme a visibilidade configurada.
- Gestão de imóveis funcional: busca, filtros, CRUD, situação, vínculo de corretores,
  galeria de imagens com ordenação e imagem principal, histórico e exclusão lógica.
- Gestão de clientes funcional: busca, filtros, CRUD, vínculo de corretores, imóveis de
  interesse, atendimentos, histórico, visibilidade e exclusão lógica.
- Dashboard e relatórios funcionais: indicadores reais, gráficos, atividade recente,
  histórico de atendimentos com filtros e exportação em CSV e PDF.
- Preparado para produção Linux: validação de ambiente, proxy reverso com HTTPS,
  cookie seguro, HSTS, trust proxy configurável, systemd, Nginx, backup diário do banco
  e uploads, manutenção de sessões e retenção.
- As telas de negócio usam dados reais da API; nenhum registro fictício é apresentado
  como informação do sistema.

## Arquitetura

```text
Navegador (HTML/CSS/JS)
        |
        | HTTPS/JSON + cookie de sessão HttpOnly
        v
Nginx (TLS, arquivos estáticos e proxy reverso)
        |
        | HTTP em 127.0.0.1:3000
        v
Express (src/app.js)
  -> Helmet, limite de corpo e cookie-parser
  -> verificação de origem, sessão e CSRF
  -> rotas (/api)
  -> controllers (entrada/saída HTTP)
  -> services (regras de negócio e autenticação)
  -> models (acesso a dados)
  -> middlewares (autenticação, autorização e erros)
        |
        v
PostgreSQL (pool único em src/config/database.js)
```

Princípios adotados:

- Separação entre frontend (`public/`), backend (`src/`) e banco de dados.
- Código modular por responsabilidade: `routes`, `controllers`, `services`, `models`,
  `middlewares`, `config` e `utils`.
- Nenhuma regra de segurança ou permissão é aplicada apenas na interface. O servidor
  valida a sessão, o CSRF e as permissões em todas as operações.
- Variáveis de ambiente para toda configuração sensível.
- Erros padronizados sem stack trace em produção e sem revelar se uma conta existe.
- Em produção, o Node escuta em `127.0.0.1`, confia em uma camada de proxy (`TRUST_PROXY=1`)
  e valida a origem canônica configurada em `APP_URL`.
- Eventos de login, bloqueio, logout, recuperação de senha, negação de acesso,
  operações administrativas e solicitações LGPD registrados em `auditoria`, sem senhas
  ou tokens.

## Estrutura de diretórios

```text
imobManager/
├── .env.example          # modelo das variáveis de ambiente
├── .gitignore            # arquivos que não entram no Git
├── package.json          # metadados e scripts do projeto
├── README.md
├── deploy/
│   ├── env.production.example  # modelo de ambiente de produção
│   ├── nginx-imobmanager.conf  # proxy reverso e preparação para TLS
│   └── systemd/          # serviço, backup e manutenção com timers
├── docs/
│   ├── administracao.md  # usuários, permissões, visibilidade e auditoria
│   ├── lgpd-auditoria.md # retenção, imutabilidade e direitos dos titulares
│   ├── autenticacao.md   # fluxos, endpoints, sessões e decisões de segurança
│   ├── corretores.md     # cadastro, vínculos, permissões e visibilidade
│   ├── imoveis.md        # CRUD, filtros, imagens, visibilidade e auditoria
│   ├── clientes.md       # CRUD, vínculos, atendimentos, visibilidade e auditoria
│   ├── dashboard-relatorios.md # indicadores, relatórios e exportações
│   ├── banco-de-dados.md # diagrama ER, relacionamentos e regras de dados
│   ├── interface.md      # design system, telas, componentes e responsividade
│   ├── implantacao.md    # produção Linux, Nginx, HTTPS, systemd e TLS
│   ├── operacao.md       # backup, restauração, manutenção e incidentes
│   ├── testes.md         # estratégia, cobertura e checklist de validação
│   ├── guia-administracao.md # rotinas do administrador
│   └── guia-utilizacao.md    # guia do usuário final
├── migrations/
│   ├── 001_initial_schema.up.sql       # schema de negócio e seeds
│   ├── 001_initial_schema.down.sql
│   ├── 002_auth_sessions.up.sql        # sessões e recuperação de senha
│   ├── 002_auth_sessions.down.sql
│   ├── 003_resource_access.up.sql      # exceções individuais por registro
│   ├── 003_resource_access.down.sql
│   ├── 004_clientes_interesse.up.sql   # imóveis de interesse do cliente
│   ├── 004_clientes_interesse.down.sql
│   ├── 005_auditoria_lgpd.up.sql       # retenção, imutabilidade e permissões LGPD
│   └── 005_auditoria_lgpd.down.sql
├── scripts/
│   ├── create-admin.js   # administrador inicial interativo (npm run admin:create)
│   ├── db-ping.js        # verifica a conexão com o PostgreSQL
│   ├── db-integrity-check.js # testes de integridade com rollback
│   ├── migrate.js        # runner de migrations (up/down/status)
│   ├── purge-audit.js    # expurgo de auditoria por retenção (npm run audit:purge)
│   ├── maintenance.js    # sessões, recuperações e retenção (npm run maintenance)
│   ├── backup.js         # dump do banco e uploads (npm run backup)
│   └── setup-database.sh # cria usuário e banco dedicados
├── src/
│   ├── app.js            # Helmet, cookies, sessão, CSRF, estáticos e rotas
│   ├── server.js         # inicialização e encerramento seguro do servidor
│   ├── config/
│   │   ├── env.js        # carregamento e validação das variáveis de ambiente
│   │   └── database.js   # pool de conexões e verificação de saúde do banco
│   ├── controllers/
│   │   ├── admin.controller.js
│   │   ├── atendimento.controller.js
│   │   ├── auth.controller.js
│   │   ├── cliente.controller.js
│   │   ├── corretor.controller.js
│   │   ├── imovel.controller.js
│   │   ├── relatorio.controller.js
│   │   └── health.controller.js
│   ├── services/
│   │   ├── acesso.service.js        # visibilidade e exceções por registro
│   │   ├── admin-audit.service.js
│   │   ├── admin-permissoes.service.js
│   │   ├── admin-usuarios.service.js
│   │   ├── atendimento.service.js
│   │   ├── auditoria.service.js
│   │   ├── auth.service.js
│   │   ├── backup.service.js
│   │   ├── cliente.service.js
│   │   ├── configuracoes.service.js
│   │   ├── corretor.service.js
│   │   ├── email.service.js
│   │   ├── health.service.js
│   │   ├── imagem.service.js
│   │   ├── imovel.service.js
│   │   ├── lgpd.service.js
│   │   ├── maintenance.service.js
│   │   └── relatorio.service.js
│   ├── models/
│   │   ├── acesso.model.js
│   │   ├── auditoria.model.js
│   │   ├── cliente.model.js
│   │   ├── configuracao.model.js
│   │   ├── corretor.model.js
│   │   ├── imovel.model.js
│   │   ├── lgpd.model.js
│   │   ├── perfil.model.js
│   │   ├── permissao.model.js
│   │   ├── recuperacao.model.js
│   │   ├── relatorio.model.js
│   │   ├── sessao.model.js
│   │   └── usuario.model.js
│   ├── routes/
│   │   ├── index.js      # agrega as rotas em /api
│   │   ├── admin.routes.js
│   │   ├── atendimentos.routes.js
│   │   ├── auth.routes.js
│   │   ├── clientes.routes.js
│   │   ├── corretores.routes.js
│   │   ├── dashboard.routes.js
│   │   ├── imoveis.routes.js
│   │   ├── relatorios.routes.js
│   │   └── health.routes.js
│   ├── middlewares/
│   │   ├── auth.js       # sessão, autorização, CSRF e proteção de páginas
│   │   ├── security.js   # verificação de origem e cabeçalhos de segurança
│   │   ├── rateLimiters.js
│   │   ├── upload.js      # upload em memória e validação de imagens
│   │   ├── notFound.js
│   │   └── errorHandler.js
│   └── utils/
│       ├── authorization.js # guardas de perfil e autoalteração
│       ├── http-error.js
│       ├── password.js   # bcrypt com custo 12
│       ├── tokens.js     # tokens aleatórios, hash e CSRF
│       └── validators.js
├── public/
│   ├── index.html        # login real
│   ├── app.html          # shell autenticado da SPA
│   ├── recuperar-senha.html # solicitação e redefinição de senha
│   ├── assets/           # favicon e recursos estáticos
│   ├── css/
│   │   ├── base.css      # tokens, reset e tipografia
│   │   ├── layout.css    # login, recuperação, sidebar, cabeçalho e responsividade
│   │   ├── components.css # botões, formulários, tabelas, modais e toasts
│   │   └── pages.css     # dashboard, relatórios e administração
│   └── js/
│       ├── login.js      # login real e estados de erro
│       ├── recuperar-senha.js
│       ├── app.js        # bootstrap da SPA e proteção de sessão
│       ├── core/         # api, router, sessão e utilitários
│       ├── components/   # icons, shell, tabela, formulário, modal, toast etc.
│       └── views/        # dashboard, imóveis, corretores, clientes e demais telas
└── tests/
    ├── admin.test.js     # usuários, permissões, visibilidade e auditoria
    ├── api.test.js       # healthcheck, 404, JSON inválido e estáticos
    ├── auth.test.js      # login, sessão, CSRF, bloqueio, recuperação e headers
    ├── clientes.test.js  # CRUD, vínculos, atendimentos, visibilidade e auditoria
    ├── corretores.test.js # CRUD, status, autorização, visibilidade e auditoria
    ├── imoveis.test.js   # CRUD, filtros, imagens, permissões e auditoria
    ├── lgpd.test.js      # auditoria, retenção, exportação e anonimização LGPD
    ├── relatorios.test.js # dashboard, relatórios, atendimentos e exportações
    ├── database.test.js  # indisponibilidade do banco
    ├── ui.test.js        # login, área protegida, administração, CSS e responsividade
    ├── production.test.js # HSTS, no-store, origem canônica, trust proxy e env
    ├── maintenance.test.js # limpeza de sessões, recuperações e auditoria
    ├── backup.test.js    # dump, uploads, retenção e verificação com pg_restore
    └── helpers/          # suporte comum (expurgo de auditoria de teste)
```

## Requisitos

- Node.js 20 ou superior (validado com Node.js 22).
- PostgreSQL 14 ou superior (validado com PostgreSQL 18).
- Acesso ao `psql` ou a um cliente PostgreSQL.
- Servidor SMTP opcional em desenvolvimento e obrigatório para recuperação de senha em
  produção.
- Em produção: Linux, Nginx, Certbot, `pg_dump`/`pg_restore` e `tar`; veja
  [docs/implantacao.md](docs/implantacao.md).

## Instalação

```bash
npm install
cp .env.example .env
```

Edite o `.env` e preencha:

- `DB_PASSWORD` com a senha do usuário do banco;
- `SESSION_SECRET` com um valor aleatório de pelo menos 32 caracteres;
- dados de SMTP, se quiser recuperação de senha por e-mail em produção;
- `UPLOAD_DIR`, `UPLOAD_MAX_IMAGE_BYTES` e `UPLOAD_MAX_IMAGES_PER_PROPERTY`, se quiser
  alterar o diretório ou os limites padrão de imagens.

Gere um segredo de sessão com:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Sem `SESSION_SECRET`, o ambiente de desenvolvimento gera um segredo efêmero e avisa no
console. Em produção o servidor recusa iniciar sem um segredo forte.

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

### Administrador inicial

Nenhuma credencial padrão é criada automaticamente. Depois de aplicar as migrations, crie o
primeiro administrador em um terminal interativo:

```bash
npm run admin:create
```

O comando solicita nome, e-mail, senha e confirmação; a senha é digitada sem eco e precisa ter
pelo menos 12 caracteres, com letras e números. A senha é persistida apenas como hash bcrypt.
Também é possível criar outros administradores executando o comando novamente com outro e-mail.

### Retenção da auditoria

O prazo padrão é de 365 dias e pode ser alterado na aba Histórico por quem possui
`auditoria.gerenciar`. O expurgo também pode ser agendado pela linha de comando:

```bash
npm run audit:purge   # remove eventos além do prazo configurado
npm run maintenance   # limpa sessões/recuperações antigas e aplica a retenção
npm run backup        # gera dump do banco e arquivo dos uploads
```

O backup usa `pg_dump`/`pg_restore` e `tar`; o destino padrão é
`/var/backups/imobmanager`, com retenção de 30 dias. Veja
[docs/operacao.md](docs/operacao.md) para restauração e rotação externa.

## Implantação em produção

O passo a passo completo (usuário de sistema, PostgreSQL, `.env` de produção, migrations,
systemd, Nginx, Certbot, firewall, timers e verificação final) está em
[docs/implantacao.md](docs/implantacao.md).

```bash
sudo cp deploy/systemd/imobmanager.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now imobmanager
```

Em produção, use `HOST=127.0.0.1`, `TRUST_PROXY=1`, `APP_URL` com HTTPS e mantenha o Node
atrás do Nginx. O `SESSION_SECRET` deve ter pelo menos 32 caracteres.

## Modelo de dados

A etapa 02 cria 14 tabelas de negócio: `perfis`, `usuarios`, `permissoes`, `perfis_permissoes`,
`permissoes_usuarios`, `corretores`, `clientes`, `imoveis`, `imagens_imoveis`,
`imoveis_corretores`, `clientes_corretores`, `atendimentos`, `configuracoes` e `auditoria`.

A etapa 04 adiciona 2 tabelas de segurança:

- `sessoes`: sessões autenticadas com hash SHA-256 do token, expiração, IP, user agent e
  revogação explícita;
- `recuperacoes_senha`: tokens de recuperação com hash SHA-256, expiração curta e uso único.

A etapa 05 adiciona 2 tabelas de exceções por registro (`acessos_imoveis` e
`acessos_clientes`). A etapa 08 adiciona `clientes_imoveis_interesse`, totalizando 19
tabelas no schema.

Regras relevantes:

- Permissões gerais (`perfis_permissoes`) e individuais (`permissoes_usuarios`) ficam em tabelas separadas.
- Exceções individuais têm precedência sobre as permissões do perfil.
- O perfil administrador é identificado por `perfis.administrativo` e independe do cadastro de corretor.
- Exclusão lógica em usuários, corretores, clientes e imóveis, com índices únicos parciais.
- Visibilidade de imóveis e clientes configurada por chave em `configuracoes`.
- Senhas usam bcrypt com custo 12; nunca são gravadas ou registradas em texto puro.
- Tokens de sessão e recuperação são aleatórios (32 bytes) e só o hash é persistido.

Detalhes, diagrama ER e precedência de permissões: [docs/banco-de-dados.md](docs/banco-de-dados.md).

## Variáveis de ambiente

| Variável                   | Padrão        | Descrição                                                        |
| -------------------------- | ------------- | ---------------------------------------------------------------- |
| `NODE_ENV`                 | `development` | Ambiente (`development`, `test`, `production`).                  |
| `PORT`                     | `3000`        | Porta HTTP do servidor.                                          |
| `HOST`                     | `0.0.0.0`     | Endereço de escuta (`127.0.0.1` em produção).                    |
| `APP_URL`                  | `http://localhost:3000` | URL pública canônica; HTTPS e igual à origem em produção. |
| `TRUST_PROXY`              | `false`       | Confiança no proxy (`1`, `loopback`, IPs ou `false`).            |
| `SESSION_SECRET`           | *(vazio)*     | Segredo para derivação de CSRF; obrigatório em produção.         |
| `SESSION_TTL_MINUTES`      | `480`         | Duração da sessão normal (8 horas).                              |
| `SESSION_REMEMBER_DAYS`    | `7`           | Duração ao marcar "Lembrar de mim" (7 dias).                     |
| `AUTH_MAX_ATTEMPTS`        | `5`           | Tentativas de senha antes do bloqueio temporário.                |
| `AUTH_LOCK_MINUTES`        | `15`          | Minutos de bloqueio após exceder as tentativas.                  |
| `PASSWORD_RESET_TTL_MINUTES` | `30`        | Validade do link de recuperação de senha.                        |
| `DB_HOST`                  | `localhost`   | Host do PostgreSQL.                                              |
| `DB_PORT`                  | `5432`        | Porta do PostgreSQL.                                             |
| `DB_NAME`                  | `imobmanager` | Nome do banco de dados.                                          |
| `DB_USER`                  | `imobmanager` | Usuário do banco de dados.                                       |
| `DB_PASSWORD`              | *(vazio)*     | Senha do banco. Obrigatória em produção.                         |
| `DB_SSL`                   | `false`       | Usa conexão SSL com o banco (`true`/`false`).                    |
| `DB_POOL_MAX`              | `10`          | Máximo de conexões simultâneas no pool.                          |
| `DATABASE_URL`             | *(vazio)*     | URL completa de conexão; quando definida, substitui as `DB_*`.   |
| `SMTP_HOST`                | *(vazio)*     | Servidor SMTP para recuperação de senha.                         |
| `SMTP_PORT`                | `587`         | Porta do SMTP.                                                   |
| `SMTP_SECURE`              | `false`       | Usa TLS direto (normalmente `true` na porta 465).                |
| `SMTP_USER`                | *(vazio)*     | Usuário de autenticação SMTP.                                    |
| `SMTP_PASSWORD`            | *(vazio)*     | Senha de autenticação SMTP.                                      |
| `SMTP_FROM`                | *(vazio)*     | Remetente dos e-mails de recuperação.                            |

Em desenvolvimento sem SMTP configurado, o link de recuperação é exibido apenas no console
do servidor. Em produção sem SMTP, nenhum token é exposto e um aviso é registrado; configure
o SMTP para que a recuperação por e-mail funcione.

Em produção, `APP_URL` precisa ser `https://SEU_DOMINIO` e corresponder exatamente à origem
acessada pelo navegador; requisições de escrita de outra origem são rejeitadas. Use
`TRUST_PROXY=1` quando houver exatamente uma camada de proxy reverso confiável (Nginx).

## Execução

```bash
# desenvolvimento (reinicia automaticamente ao salvar)
npm run dev

# produção (preferencialmente via systemd, com Nginx e HTTPS)
npm start
```

Não execute a aplicação como `root` em produção. Use o usuário `imobmanager`, mantenha
o Node atrás do Nginx e siga [docs/implantacao.md](docs/implantacao.md).

Acesse:

- `http://localhost:3000` — login;
- `http://localhost:3000/app.html` — área interna, disponível somente com sessão válida;
- `http://localhost:3000/recuperar-senha.html` — solicitação e redefinição de senha;
- `http://localhost:3000/api/health` — healthcheck.

### Autenticação e interface

- Login real por e-mail e senha, com erro genérico para credenciais inválidas.
- Bloqueio temporário após 5 tentativas de senha incorretas (configurável).
- Sessão em cookie `HttpOnly`, `SameSite=Lax`, `Path=/` e `Secure` em produção.
- Expiração de 8 horas por padrão ou 7 dias ao marcar "Lembrar de mim".
- Logout revoga a sessão no banco e limpa o cookie.
- Recuperação de senha com token de uso único, expiração de 30 minutos e revogação de
  todas as sessões após a redefinição.
- `/app.html` é protegido no servidor; a SPA carrega usuário e permissões reais de
  `GET /api/auth/session`.
- Rotas por hash: `#/dashboard`, `#/imoveis`, `#/corretores`, `#/clientes`,
  `#/atendimentos`, `#/relatorios` e `#/administracao`.
- A navegação respeita as permissões retornadas pelo servidor, mas a autorização
  definitiva é sempre aplicada no backend.
- Administração (`#/administracao`) opera com dados reais: criação e edição de usuários,
  cadastro de corretor vinculado, ativação/desativação, redefinição de senha, permissões
  individuais, perfis, exceções por imóvel/cliente, consulta à auditoria, retenção de
  eventos e aba LGPD para exportar e anonimizar dados de clientes.
- Corretores (`#/corretores`) opera com dados reais: busca, filtro, cadastro, edição,
  detalhe, ativação/desativação e vínculos com imóveis e clientes. O cadastro vincula
  uma conta operacional existente e sincroniza nome, situação e sessões.
- Imóveis (`#/imoveis`) opera com dados reais: busca, filtros avançados, cadastro, edição,
  detalhe, situação, vínculos de corretores e galeria de imagens com ordenação, imagem
  principal e remoção. Imagens são servidas apenas por rota autenticada.
- Clientes (`#/clientes`) opera com dados reais: busca, filtros, cadastro, edição,
  detalhe, vínculos de corretores, imóveis de interesse, atendimentos, histórico e
  exclusão lógica.
- Dashboard (`#/dashboard`) opera com dados reais: indicadores de imóveis, corretores,
  clientes e atendimentos, gráficos por situação/finalidade, atividade recente, saúde da
  API e atalhos para os módulos.
- Atendimentos (`#/atendimentos`) opera com dados reais: busca por cliente, corretor,
  imóvel ou descrição, filtros por tipo, status e período, além de paginação.
- Relatórios (`#/relatorios`) opera com dados reais: filtros por período, corretor,
  finalidade, tipo e status, geração de cinco relatórios e exportação em CSV e PDF.
- Layout responsivo validado em desktop e celular.

Detalhes do design system e das telas: [docs/interface.md](docs/interface.md).
Fluxos e decisões de segurança: [docs/autenticacao.md](docs/autenticacao.md).
Regras administrativas: [docs/administracao.md](docs/administracao.md).
Regras do cadastro de corretores: [docs/corretores.md](docs/corretores.md).
Regras da gestão de imóveis: [docs/imoveis.md](docs/imoveis.md).
Regras da gestão de clientes: [docs/clientes.md](docs/clientes.md).
Regras do dashboard e dos relatórios: [docs/dashboard-relatorios.md](docs/dashboard-relatorios.md).
Auditoria, retenção e LGPD: [docs/lgpd-auditoria.md](docs/lgpd-auditoria.md).

### API de autenticação

| Método | Rota                       | Descrição                                             |
| ------ | -------------------------- | ----------------------------------------------------- |
| POST   | `/api/auth/login`          | Autentica e cria a sessão.                            |
| GET    | `/api/auth/session`        | Retorna usuário, permissões, CSRF e expiração.        |
| POST   | `/api/auth/logout`         | Revoga a sessão (exige CSRF).                         |
| POST   | `/api/auth/forgot-password`| Solicita recuperação com resposta genérica.           |
| POST   | `/api/auth/reset-password` | Redefine a senha com token de uso único.              |

Todas as respostas de autenticação usam `Cache-Control: no-store`. Operações autenticadas
que alteram estado exigem o cabeçalho `X-CSRF-Token`, obtido em `GET /api/auth/session`.

### API administrativa

Todas as rotas exigem sessão, perfil administrativo (`perfis.administrativo = true`),
CSRF nas mutações e a permissão indicada.

| Método | Rota                                             | Permissão                |
| ------ | ------------------------------------------------ | ------------------------ |
| GET    | `/api/administracao/resumo`                      | `administracao.visualizar` |
| GET    | `/api/administracao/usuarios`                    | `usuarios.gerenciar`     |
| POST   | `/api/administracao/usuarios`                    | `usuarios.gerenciar`     |
| GET    | `/api/administracao/usuarios/:id`                | `usuarios.gerenciar`     |
| PATCH  | `/api/administracao/usuarios/:id`                | `usuarios.gerenciar`     |
| PATCH  | `/api/administracao/usuarios/:id/status`         | `usuarios.gerenciar`     |
| POST   | `/api/administracao/usuarios/:id/redefinir-senha`| `usuarios.gerenciar`     |
| GET    | `/api/administracao/usuarios/opcoes`             | usuários, permissões ou configurações |
| GET    | `/api/administracao/perfis/opcoes`               | `usuarios.gerenciar`     |
| GET    | `/api/administracao/usuarios/:id/permissoes`     | `permissoes.gerenciar`   |
| PUT    | `/api/administracao/usuarios/:id/permissoes`     | `permissoes.gerenciar`   |
| GET    | `/api/administracao/usuarios/:id/acessos`        | `permissoes.gerenciar`   |
| PUT    | `/api/administracao/usuarios/:id/acessos`        | `permissoes.gerenciar`   |
| GET    | `/api/administracao/perfis`                      | `permissoes.gerenciar`   |
| PUT    | `/api/administracao/perfis/:id/permissoes`       | `permissoes.gerenciar`   |
| GET    | `/api/administracao/recursos`                    | `permissoes.gerenciar`   |
| GET    | `/api/administracao/configuracoes`               | `configuracoes.gerenciar`|
| PUT    | `/api/administracao/configuracoes/visibilidade`  | `configuracoes.gerenciar`|
| GET    | `/api/administracao/auditoria`                   | `auditoria.visualizar`   |
| GET    | `/api/administracao/auditoria/retencao`          | `auditoria.gerenciar`    |
| PUT    | `/api/administracao/auditoria/retencao`          | `auditoria.gerenciar`    |
| POST   | `/api/administracao/auditoria/retencao/executar` | `auditoria.gerenciar`    |
| GET    | `/api/administracao/lgpd`                        | `lgpd.gerenciar`         |
| GET    | `/api/administracao/lgpd/clientes`               | `lgpd.gerenciar`         |
| GET    | `/api/administracao/lgpd/clientes/:id/dados`     | `lgpd.gerenciar`         |
| POST   | `/api/administracao/lgpd/clientes/:id/anonimizar`| `lgpd.gerenciar`         |

### API de corretores

Todas as rotas exigem sessão, respondem com `Cache-Control: no-store` e as mutações exigem
o cabeçalho `X-CSRF-Token` e a permissão indicada.

| Método | Rota                                | Permissão               |
| ------ | ----------------------------------- | ----------------------- |
| GET    | `/api/corretores`                   | `corretores.visualizar` |
| GET    | `/api/corretores/resumo`            | `corretores.visualizar` |
| GET    | `/api/corretores/usuarios-disponiveis` | `corretores.criar`  |
| GET    | `/api/corretores/:id`               | `corretores.visualizar` |
| POST   | `/api/corretores`                   | `corretores.criar`      |
| PATCH  | `/api/corretores/:id`               | `corretores.editar`     |
| PATCH  | `/api/corretores/:id/status`        | `corretores.desativar`  |

A listagem aceita `busca`, `status` (`ativos` ou `inativos`), `pagina` e `limite`. A
criação vincula um usuário operacional existente; o detalhe retorna imóveis e clientes
filtrados pela visibilidade do ator. Regras completas: [docs/corretores.md](docs/corretores.md).

### API de imóveis

Todas as rotas exigem sessão, respondem com `Cache-Control: no-store` e as mutações exigem
o cabeçalho `X-CSRF-Token` e a permissão indicada.

| Método | Rota                                   | Permissão                   |
| ------ | -------------------------------------- | --------------------------- |
| GET    | `/api/imoveis`                         | `imoveis.visualizar`        |
| GET    | `/api/imoveis/corretores-opcoes`       | `imoveis.visualizar` (admin)|
| GET    | `/api/imoveis/:id`                     | `imoveis.visualizar`        |
| GET    | `/api/imoveis/:id/historico`           | `auditoria.visualizar`      |
| POST   | `/api/imoveis`                         | `imoveis.criar`             |
| PATCH  | `/api/imoveis/:id`                     | `imoveis.editar`            |
| PATCH  | `/api/imoveis/:id/situacao`            | `imoveis.editar`            |
| DELETE | `/api/imoveis/:id`                     | `imoveis.excluir`           |
| POST   | `/api/imoveis/:id/imagens`             | `imoveis.imagens.gerenciar` |
| PUT    | `/api/imoveis/:id/imagens/ordem`       | `imoveis.imagens.gerenciar` |
| PATCH  | `/api/imoveis/:id/imagens/:imagemId/principal` | `imoveis.imagens.gerenciar` |
| DELETE | `/api/imoveis/:id/imagens/:imagemId`   | `imoveis.imagens.gerenciar` |
| GET    | `/api/imoveis/:id/imagens/:imagemId/arquivo` | `imoveis.visualizar`  |

A listagem aceita `busca`, `tipo`, `finalidade`, `situacao`, `cidade`, `bairro`,
`valorMin`, `valorMax`, `pagina` e `limite`. Uploads usam `multipart/form-data` (JPEG, PNG
ou WebP); arquivos ficam fora de `public/` e são servidos apenas com sessão e visibilidade
válidas. Regras completas: [docs/imoveis.md](docs/imoveis.md).

### API de clientes

Todas as rotas exigem sessão, respondem com `Cache-Control: no-store` e as mutações exigem
o cabeçalho `X-CSRF-Token` e a permissão indicada.

| Método | Rota                              | Permissão                                    |
| ------ | --------------------------------- | -------------------------------------------- |
| GET    | `/api/clientes`                   | `clientes.visualizar`                        |
| GET    | `/api/clientes/corretores-opcoes` | `clientes.visualizar` (somente administradores) |
| GET    | `/api/clientes/imoveis-opcoes`    | `clientes.visualizar`                        |
| GET    | `/api/clientes/:id`               | `clientes.visualizar`                        |
| GET    | `/api/clientes/:id/historico`     | `auditoria.visualizar`                       |
| POST   | `/api/clientes`                   | `clientes.criar`                             |
| PATCH  | `/api/clientes/:id`               | `clientes.editar`                            |
| DELETE | `/api/clientes/:id`               | `clientes.excluir`                           |
| POST   | `/api/clientes/:id/atendimentos`  | `atendimentos.criar`                         |

A listagem aceita `busca`, `tipo`, `finalidade`, `localizacao`, `pagina` e `limite`. A
criação e a edição recebem os dados pessoais, de interesse e as listas `corretores` e
`imoveisInteresse` (vínculos de corretores são exclusivos de administradores). O detalhe
retorna cliente, vínculos, atendimentos e resumo conforme as permissões e a visibilidade.
Regras completas: [docs/clientes.md](docs/clientes.md).

### API do dashboard, relatórios e atendimentos

Todas as rotas exigem sessão, respondem com `Cache-Control: no-store` e a permissão
indicada. Consultas reaplicam a visibilidade de imóveis/clientes do ator.

| Método | Rota                                                    | Permissão                |
| ------ | ------------------------------------------------------- | ------------------------ |
| GET    | `/api/dashboard`                                        | `dashboard.visualizar`   |
| GET    | `/api/relatorios`                                       | `relatorios.visualizar`  |
| GET    | `/api/relatorios/opcoes`                                | `relatorios.visualizar`  |
| GET    | `/api/relatorios/:relatorio`                            | `relatorios.visualizar` + módulo |
| GET    | `/api/relatorios/:relatorio/exportacao?formato=csv\|pdf`| `relatorios.exportar`    |
| GET    | `/api/atendimentos`                                     | `atendimentos.visualizar`|

Os relatórios disponíveis são `imoveis-situacao`, `imoveis-finalidade`,
`imoveis-corretor`, `clientes-corretor` e `atendimentos`. Os filtros aceitos são `inicio`
e `fim` (`YYYY-MM-DD`), `corretor` (id), `finalidade` (`venda` ou `aluguel`), `tipo` e
`status` de atendimento. Datas inválidas ou períodos invertidos retornam `422`. A
listagem de atendimentos também aceita `busca`, `pagina` e `limite`. Regras completas:
[docs/dashboard-relatorios.md](docs/dashboard-relatorios.md).

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
npm test           # suíte completa (Node.js test runner)
npm run db:ping    # teste de conectividade com o PostgreSQL
npm run db:check   # integridade do schema (rollback ao final)
npm run maintenance
npm run backup     # requer pg_dump e tar
```

A suíte usa `node --test --test-concurrency=1` e cobre API, autenticação, sessão/CSRF,
permissões, isolamento entre corretores, CRUD dos módulos, filtros, uploads, relatórios,
auditoria/LGPD, interface, produção, manutenção e backup. Os testes usam PostgreSQL real,
criam dados com prefixo único e os removem ao final. Para um banco dedicado:

```bash
DB_NAME=imobmanager_test npm run migrate:up
DB_NAME=imobmanager_test npm test
```

Resultado de referência (22/11/2026): **83 testes aprovados**, `db:check` com **27
verificações aprovadas** e **6 migrations aplicadas**. Detalhes, cobertura por arquivo e
checklist manual de responsividade/acessibilidade: [docs/testes.md](docs/testes.md).

## Segurança aplicada

- Helmet com Content Security Policy restritiva (sem `unsafe-inline` nem `unsafe-eval`).
- `x-powered-by` desabilitado, `X-Content-Type-Options: nosniff`, política de referência
  `no-referrer` e bloqueio de enquadramento.
- Senhas com bcrypt (custo 12), política mínima de 12 caracteres com letras e números.
- Comparação de senha com hash fictício quando o e-mail não existe, reduzindo diferenças
  de tempo entre conta existente e inexistente.
- Sessões opacas, com token de 32 bytes; apenas o hash SHA-256 fica no banco.
- Cookie de sessão `HttpOnly`, `SameSite=Lax`, `Path=/` e `Secure` em produção.
- CSRF por token derivado da sessão e enviado no cabeçalho `X-CSRF-Token` em operações
  autenticadas que alteram estado.
- Verificação de `Origin`/`Sec-Fetch-Site` para requisições de escrita.
- Rate limiting em login, recuperação, redefinição e API.
- Bloqueio temporário de conta após tentativas excessivas e expiração do bloqueio.
- Recuperação de senha com token de uso único, hash no banco, expiração curta, resposta
  genérica e revogação de todas as sessões após a troca.
- Autorização no servidor por permissões carregadas do banco, incluindo exceções
  individuais sobre o perfil.
- Rotas administrativas exigem perfil administrativo e permissão específica; mutações
  também exigem CSRF. Autoalteração de permissões/acessos, autodesativação e remoção do
  último administrador ativo são bloqueadas.
- Permissões do módulo Administração não podem ser concedidas a perfis ou usuários não
  administrativos; o perfil Administrador mantém as permissões essenciais.
- Auditoria de login, falhas, bloqueio, logout, solicitação de recuperação, redefinição,
  ações administrativas, acessos negados, CSRF/origem inválidos e operações LGPD, sem
  registrar senhas ou tokens.
- Tabela de auditoria imutável por trigger; expurgo e redação LGPD usam manutenção
  transacional interna. Retenção padrão de 365 dias, configurável entre 30 e 3650.
- Exportação de dados pessoais em JSON e anonimização transacional com protocolo e
  motivo registrados, incluindo remoção de PII dos atendimentos e da auditoria.
- Limite de tamanho para corpos JSON e formulários (`1mb`), com limite separado para
  imagens (`UPLOAD_MAX_IMAGE_BYTES`).
- Upload de imagens validado por magic bytes, armazenado fora de `public/` e servido por
  rota autenticada que reaplica permissão e visibilidade.
- Caminhos de imagem normalizados e restritos ao diretório de uploads, bloqueando
  travessia de diretório.
- Erros padronizados, sem stack trace em produção e sem detalhes internos.
- Consultas parametrizadas via `pg`.

Limitações atuais: o rate limiting usa memória do processo (adequado a uma instância) e
o envio de e-mail exige SMTP configurado. A troca de senha pelo próprio usuário segue o
fluxo de recuperação; a administração redefine senhas de terceiros.

## Versionamento

O projeto utiliza Git. Cada etapa validada deve ser registrada em um commit.
A versão do `package.json` acompanha as versões definidas no roteiro (`0.1.0` nesta etapa).

## Próximas etapas

- [x] 01 — Planejamento e arquitetura
- [x] 02 — Modelagem do banco de dados
- [x] 03 — Identidade visual e interface
- [x] 04 — Autenticação e segurança
- [x] 05 — Administração e permissões
- [x] 06 — Gestão de corretores
- [x] 07 — Gestão de imóveis
- [x] 08 — Gestão de clientes
- [x] 09 — Dashboard e relatórios
- [x] 10 — Auditoria e LGPD
- [ ] 11 — Testes e implantação

## Solução de problemas

- **Porta 3000 em uso:** altere `PORT` no `.env`.
- **`Banco de dados inacessível`:** confirme se o PostgreSQL está ativo, se o banco/usuário existem e se a senha no `.env` está correta.
- **Login não autentica:** confirme se as migrations foram aplicadas e se existe um
  administrador criado com `npm run admin:create`. Não há credenciais padrão.
- **Erro `LAST_ADMIN`:** mantenha ao menos um administrador ativo; reative ou crie outro
  antes de desativar o atual.
- **Imagem não aparece:** confirme se o arquivo existe em `UPLOAD_DIR` e se o usuário tem
  `imoveis.visualizar` e visibilidade sobre o imóvel.
- **Acessos inesperados a imóveis/clientes:** revise a regra em `#/administracao` na aba
  Visibilidade e as exceções individuais do usuário; negações prevalecem.
- **Não recebi o e-mail de recuperação:** em desenvolvimento, consulte o link no console
  do servidor; em produção, configure `SMTP_HOST` e `SMTP_FROM`.
- **Sessão expirou:** entre novamente; a duração é configurável por `SESSION_TTL_MINUTES`.
- **`SESSION_SECRET` inválido:** em produção, use pelo menos 32 caracteres aleatórios.
- **Erro de autenticação do PostgreSQL:** verifique o método de autenticação configurado no `pg_hba.conf`.
- **Checksum divergente em migration:** um arquivo já aplicado foi alterado; restaure o conteúdo original e crie uma nova migration para a mudança.
- **Tabelas ausentes no `db:check`:** execute `npm run migrate:up`.
