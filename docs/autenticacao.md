# Autenticação e segurança

Documentação da etapa 04 do ImobManager: login real, sessões no servidor, recuperação de
senha, auditoria dos eventos de acesso e controles aplicados no backend.

## Objetivo da etapa

Substituir a sessão de pré-visualização da etapa 03 por autenticação efetiva, garantindo
que:

- apenas usuários ativos e com credenciais válidas acessem a área interna;
- a sessão seja opaca, revogável e inacessível ao JavaScript da página;
- operações de escrita exigem token CSRF e origem confiável;
- tentativas excessivas de login sejam bloqueadas temporariamente;
- a recuperação de senha use token de uso único com validade curta;
- eventos relevantes fiquem registrados em `auditoria`, sem senhas ou tokens.

Nenhuma credencial padrão é criada. O administrador inicial é criado por comando
interativo após a aplicação das migrations.

## Arquitetura

```text
Navegador
  |  POST /api/auth/login (e-mail + senha)
  v
Express
  -> rate limiting e verificação de origem
  -> auth.controller            entrada/saída HTTP
  -> auth.service               regras de negócio
  -> usuario.model / sessao.model / recuperacao.model / auditoria.model
  -> PostgreSQL
  |
  v
Cookie HttpOnly (imobmanager_sid) + token CSRF na resposta JSON
```

Decisões centrais:

- O token de sessão é aleatório (32 bytes, `base64url`) e vai apenas no cookie.
- O banco armazena somente o hash SHA-256 do token; o valor utilizável nunca é persistido.
- O token CSRF é derivado da sessão com HMAC-SHA-256 e `SESSION_SECRET`; não é gravado no
  banco.
- Toda validação de credenciais, sessão e permissão ocorre no servidor.

## Fluxos

### Login

1. O cliente envia `POST /api/auth/login` com `email`, `password` e `lembrar` opcional.
2. O e-mail é normalizado (trim + minúsculas) e validado; a senha precisa ser string não
   vazia de até 256 caracteres.
3. Se o e-mail não existir, a senha é comparada com um hash fictício para reduzir a
   diferença de tempo entre conta existente e inexistente.
4. Conta bloqueada retorna `423 ACCOUNT_LOCKED` com `Retry-After`.
5. Conta inativa ou senha incorreta retorna a mesma mensagem genérica:
   `E-mail ou senha incorretos.` (`401 INVALID_CREDENTIALS`).
6. Senha correta zera tentativas falhas, atualiza `ultimo_acesso_em`, cria a sessão, grava
   auditoria e responde com usuário, permissões efetivas, token CSRF e expiração.
7. O cookie de sessão é definido com `HttpOnly`, `SameSite=Lax`, `Path=/` e `Secure` em
   produção.

Duração da sessão:

- padrão: `SESSION_TTL_MINUTES` (480 minutos, 8 horas);
- com "Lembrar de mim": `SESSION_REMEMBER_DAYS` (7 dias).

### Sessão

- `GET /api/auth/session` retorna o usuário, as permissões efetivas, o CSRF e a expiração.
- A cada requisição, o middleware lê o cookie, valida o hash no banco e confirma que a
  sessão não está revogada, não expirou e que o usuário continua ativo e não excluído.
- `ultimo_acesso_em` é atualizado no máximo a cada 5 minutos para evitar escrita excessiva.
- Permissões efetivas combinam permissões do perfil e exceções individuais
  (`permissoes_usuarios`), com precedência da exceção individual.
- `/app.html` é protegido no servidor: sem sessão válida, redireciona para `/`; se havia
  cookie inválido, limpa o cookie e sinaliza `?sessao=expirada`.
- Usuário autenticado que acessa `/` ou `/index.html` é redirecionado para `/app.html`.

### Logout

1. `POST /api/auth/logout` exige `X-CSRF-Token` válido.
2. A sessão é revogada no banco com motivo `logout`.
3. O cookie é limpo e a resposta é `204`.
4. A auditoria registra o evento quando a sessão existia.

### Recuperação de senha

1. `POST /api/auth/forgot-password` recebe o e-mail e responde sempre com a mesma
   mensagem, exista ou não a conta:
   `Se o e-mail informado estiver cadastrado, as instruções de recuperação serão enviadas.`
2. Para usuário ativo, tokens pendentes anteriores são marcados como usados e um novo
   token é gerado.
3. O token é enviado por e-mail com validade de `PASSWORD_RESET_TTL_MINUTES` (30 minutos).
4. `POST /api/auth/reset-password` valida o formato do token e a política de senha.
5. Em transação, o token é bloqueado (`FOR UPDATE`), a senha é atualizada, todos os tokens
   pendentes do usuário são consumidos e todas as sessões abertas são revogadas
   (`senha_redefinida`).
6. O token não pode ser reutilizado; tentativas retornam `400 INVALID_RESET_TOKEN`.
7. A interface redireciona para o login com aviso de sucesso (`?senha=redefinida`).

### E-mail

- Configurado por `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` e
  `SMTP_FROM`.
- Em desenvolvimento sem SMTP, o link é impresso no console do servidor.
- Em produção sem SMTP, o envio falha de forma controlada; o evento é auditado com
  `emailEnviado: false` e a resposta ao cliente continua genérica.
- O conteúdo do e-mail é escapado em HTML; links e anexos remotos/arquivos estão
  desabilitados no transporte.

## Sessões em banco

Migration `002_auth_sessions`:

| Tabela               | Conteúdo                                                                    |
| -------------------- | --------------------------------------------------------------------------- |
| `sessoes`            | `token_hash`, usuário, criação, último acesso, expiração, revogação, IP e UA |
| `recuperacoes_senha` | `token_hash`, usuário, criação, expiração, uso e IP                         |

Regras:

- `token_hash` é `CHECK` de 64 caracteres hexadecimais e único.
- `expira_em > criado_em` é garantido por `CHECK`.
- Revogação exige data e motivo preenchidos juntos.
- Excluir um usuário remove suas sessões e recuperações em cascata.
- Índices cobrem busca por usuário, expiração e sessões ainda ativas.
- A revogação é explícita: logout, redefinição de senha ou exclusão do usuário.

## Endpoints

| Método | Rota                        | Autenticação | Descrição                                        |
| ------ | --------------------------- | ------------ | ------------------------------------------------ |
| POST   | `/api/auth/login`           | pública      | Autentica e cria a sessão.                       |
| GET    | `/api/auth/session`         | cookie       | Retorna usuário, permissões, CSRF e expiração.   |
| POST   | `/api/auth/logout`          | cookie+CSRF  | Revoga a sessão e limpa o cookie.                |
| POST   | `/api/auth/forgot-password` | pública      | Solicita recuperação com resposta genérica.      |
| POST   | `/api/auth/reset-password`  | pública      | Redefine a senha com token de uso único.         |

Todas as respostas de `/api/auth` usam `Cache-Control: no-store`.

Exemplos:

```json
// POST /api/auth/login (200)
{
  "usuario": {
    "id": 1,
    "nome": "Maria Silva",
    "email": "maria@exemplo.com",
    "perfil": "Administrador",
    "administrativo": true,
    "deveTrocarSenha": false,
    "permissoes": ["administracao.visualizar", "dashboard.visualizar"]
  },
  "csrfToken": "…",
  "expiraEm": "2026-11-17T20:00:00.000Z"
}
```

```json
// Erro padronizado
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "E-mail ou senha incorretos."
  }
}
```

Códigos previstos: `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `UNAUTHENTICATED`,
`FORBIDDEN`, `CSRF_INVALID`, `ORIGIN_INVALID`, `RATE_LIMITED`, `VALIDATION_ERROR`,
`WEAK_PASSWORD`, `INVALID_RESET_TOKEN`, `ADMIN_REQUIRED`, `LAST_ADMIN`, `SELF_OPERATION`,
`INVALID_JSON` e `PAYLOAD_TOO_LARGE`.

## Segurança aplicada

### Senhas

- bcrypt com custo 12.
- Política: 12 a 128 caracteres, pelo menos uma letra e um número, sem espaços nas
  extremidades.
- Hash fictício na comparação de e-mails inexistentes.
- `senha_hash` nunca é retornado pela API nem registrado em auditoria.

### Cookies e CSRF

- Cookie `imobmanager_sid`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` em produção,
  `Max-Age` conforme a duração da sessão.
- Requisições de escrita autenticadas exigem `X-CSRF-Token` derivado da sessão via HMAC.
- Comparação de tokens com `timingSafeEqual`.
- `Origin` e `Sec-Fetch-Site` são verificados em métodos não seguros; origens diferentes
  são rejeitadas com `403 ORIGIN_INVALID`.

### Rate limiting e bloqueio

| Escopo                | Janela | Limite | Observação                         |
| --------------------- | ------ | ------ | ---------------------------------- |
| Login                 | 15 min | 20     | Sucessos não contam.               |
| Recuperação de senha  | 60 min | 5      | Por IP.                            |
| Redefinição de senha  | 15 min | 10     | Por IP.                            |
| API geral             | 15 min | 1000   | 10000 em ambiente de teste.        |

- `AUTH_MAX_ATTEMPTS` (5) falhas de senha bloqueiam a conta por `AUTH_LOCK_MINUTES` (15).
- O bloqueio retorna `423` com `Retry-After` em segundos.
- O bloqueio expira automaticamente na próxima tentativa após o prazo.

### Cabeçalhos e erros

- Helmet com CSP restritiva: `default-src`, `script-src`, `style-src`, `img-src`,
  `font-src`, `connect-src`, `object-src`, `base-uri`, `form-action` e `frame-ancestors`.
- Sem `unsafe-inline` e sem `unsafe-eval`.
- `x-powered-by` desabilitado, `nosniff`, `Referrer-Policy: no-referrer` e bloqueio de
  enquadramento.
- JSON e formulários limitados a `1mb`.
- Erros padronizados em JSON; stack trace apenas fora de produção.
- `trust proxy` desabilitado por padrão (adequado a uma instância sem proxy reverso).

## Auditoria

Eventos registrados em `auditoria` com usuário, e-mail, IP, user agent e detalhes não
sensíveis:

- `auth.login` (sucesso);
- `auth.login_falha` (credenciais inválidas ou usuário inativo);
- `auth.login_bloqueado` (conta bloqueada ou limite atingido);
- `auth.logout`;
- `auth.recuperacao_solicitada`;
- `auth.recuperacao_invalida`;
- `auth.senha_redefinida`;
- `auth.administrador_inicial_criado`.

Falhas de auditoria não interrompem o fluxo de autenticação; são registradas no console.

## Administrador inicial

```bash
npm run migrate:up
npm run admin:create
```

O comando:

- exige terminal interativo para não expor a senha em histórico ou logs;
- valida nome, e-mail, política de senha e confirmação;
- recusa e-mail já cadastrado;
- cria o usuário vinculado ao perfil Administrador;
- registra o evento de criação em auditoria.

Não há usuário ou senha padrão no código ou nas migrations.

## Integração com o frontend

- `public/js/login.js` envia as credenciais, exibe erro genérico e redireciona para
  `/app.html` em caso de sucesso.
- `public/js/recuperar-senha.js` cobre solicitação e redefinição; o token é lido de
  `?token=` e removido da URL após o uso.
- `public/js/core/session.js` carrega `GET /api/auth/session`, guarda o CSRF em memória e
  expõe `possuiPermissao` para a navegação.
- `public/js/core/api.js` envia cookies (`credentials: same-origin`) e inclui
  `X-CSRF-Token` automaticamente em métodos não seguros.
- `public/js/components/shell.js` faz logout real com confirmação; a navegação esconde
  itens sem permissão, mas o backend continua sendo a autoridade final.
- Falha `401` ao carregar a SPA redireciona para `/?sessao=expirada`; outras falhas
  exibem estado de erro com link para o login.

## Variáveis de ambiente

| Variável                     | Padrão                | Uso                                              |
| ---------------------------- | --------------------- | ------------------------------------------------ |
| `APP_URL`                    | `http://localhost:PORT` | Base do link enviado por e-mail.               |
| `SESSION_SECRET`             | efêmero em dev        | HMAC do CSRF; obrigatório (32+ caracteres) em produção. |
| `SESSION_TTL_MINUTES`        | `480`                 | Duração padrão da sessão.                        |
| `SESSION_REMEMBER_DAYS`      | `7`                   | Duração com "Lembrar de mim".                    |
| `AUTH_MAX_ATTEMPTS`          | `5`                   | Falhas antes do bloqueio.                        |
| `AUTH_LOCK_MINUTES`          | `15`                  | Duração do bloqueio.                             |
| `PASSWORD_RESET_TTL_MINUTES` | `30`                  | Validade do token de recuperação.                |
| `SMTP_*`                     | vazio                 | Envio do e-mail de recuperação.                  |

Em produção, a aplicação recusa `SESSION_SECRET` ausente ou com menos de 32 caracteres.

## Testes e validação

- `npm test`: 39 testes aprovados, incluindo `tests/auth.test.js`, `tests/admin.test.js` e
  `tests/corretores.test.js`.
- `tests/auth.test.js` cobre: proteção de páginas, credenciais inválidas, login válido,
  cookie e expiração, CSRF no logout, origem inválida, bloqueio após tentativas,
  recuperação com token de uso único, revogação de sessões, política de senha,
  cabeçalhos de segurança e middlewares de autorização.
- `npm run migrate:status`: migrations 001, 002 e 003 aplicadas.
- `npm run db:check`: 25 verificações de integridade aprovadas, com rollback ao final.

## Limitações e próximos passos

- O rate limiting usa memória do processo; para múltiplas instâncias, migrar para um
  armazenamento compartilhado (por exemplo, Redis).
- A recuperação de senha depende de SMTP configurado em produção.
- A administração permite redefinir a senha de terceiros e encerrar suas sessões; a troca
  de senha pelo próprio usuário autenticado continua usando o fluxo de recuperação.
- `trust proxy` permanece desabilitado; ao publicar atrás de proxy reverso, configurar
  corretamente para que IP e `Secure` sejam confiáveis.
