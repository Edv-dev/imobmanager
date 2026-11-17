'use strict';

process.env.NODE_ENV = 'test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const crypto = require('node:crypto');

const createApp = require('../src/app');
const { pool, closePool } = require('../src/config/database');
const { hashPassword } = require('../src/utils/password');
const { requireAuth, requirePermission } = require('../src/middlewares/auth');

const SENHA = 'SenhaSegura123!';
const SENHA_NOVA = 'NovaSenhaSegura456!';
const TEST_PREFIX = `auth.${process.pid}.${Date.now()}`;

let server;
let baseUrl;
let usuarioAdmin;
let usuarioCorretor;
let usuarioBloqueado;

function email(nome) {
  return `${TEST_PREFIX}.${nome}@exemplo.test`;
}

async function criarUsuario({ endereco, senha, perfil }) {
  const { rows: perfis } = await pool.query(
    'SELECT id FROM perfis WHERE nome = $1',
    [perfil]
  );
  const senhaHash = await hashPassword(senha);
  const { rows } = await pool.query(
    `INSERT INTO usuarios (perfil_id, nome_completo, email, senha_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email`,
    [perfis[0].id, `Usuario ${perfil}`, endereco, senhaHash]
  );
  return rows[0];
}

async function requisitar(path, options = {}) {
  const { method = 'GET', body, cookie, csrf, headers = {}, redirect = 'follow' } = options;
  const resposta = await fetch(`${baseUrl}${path}`, {
    method,
    redirect,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const texto = await resposta.text();
  let dados = null;

  if (texto) {
    try {
      dados = JSON.parse(texto);
    } catch {
      dados = texto;
    }
  }

  return { resposta, dados };
}

async function login({ endereco, senha, lembrar = false }) {
  const { resposta, dados } = await requisitar('/api/auth/login', {
    method: 'POST',
    body: { email: endereco, password: senha, lembrar },
  });
  const setCookies = resposta.headers.getSetCookie();

  return {
    resposta,
    dados,
    setCookies,
    cookie: setCookies.map((item) => item.split(';')[0]).join('; '),
  };
}

before(async () => {
  const app = createApp();
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  usuarioAdmin = await criarUsuario({
    endereco: email('admin'),
    senha: SENHA,
    perfil: 'Administrador',
  });
  usuarioCorretor = await criarUsuario({
    endereco: email('corretor'),
    senha: SENHA,
    perfil: 'Corretor',
  });
  usuarioBloqueado = await criarUsuario({
    endereco: email('bloqueado'),
    senha: SENHA,
    perfil: 'Corretor',
  });
});

after(async () => {
  const usuarios = [usuarioAdmin, usuarioCorretor, usuarioBloqueado].filter(Boolean);

  for (const usuario of usuarios) {
    await pool.query(
      'DELETE FROM auditoria WHERE usuario_id = $1 OR usuario_email = $2',
      [usuario.id, usuario.email]
    );
    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuario.id]);
  }

  await pool.query(
    `DELETE FROM auditoria
      WHERE usuario_email LIKE $1
         OR detalhes::text LIKE $1`,
    [`%${TEST_PREFIX}%`]
  );

  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await closePool();
});

test('login e área interna são protegidos; recuperação é pública', async () => {
  const loginPage = await fetch(`${baseUrl}/`);
  const html = await loginPage.text();

  assert.equal(loginPage.status, 200);
  assert.match(html, /Bem-vindo de volta/);
  assert.match(html, /\/recuperar-senha\.html/);
  assert.match(html, /id="login-error"/);
  assert.equal(html.includes('Prévia da interface'), false);
  assert.equal(html.includes('Acessar prévia'), false);

  const appPage = await fetch(`${baseUrl}/app.html`, { redirect: 'manual' });
  assert.equal(appPage.status, 302);
  assert.equal(appPage.headers.get('location'), '/');

  const recovery = await fetch(`${baseUrl}/recuperar-senha.html`);
  const recoveryHtml = await recovery.text();

  assert.equal(recovery.status, 200);
  assert.match(recoveryHtml, /id="request-form"/);
  assert.match(recoveryHtml, /id="reset-form"/);
  assert.match(recoveryHtml, /\/js\/recuperar-senha\.js/);
});

test('credenciais inválidas recebem resposta genérica e não expõem dados internos', async () => {
  const senhaErrada = await login({
    endereco: usuarioAdmin.email,
    senha: 'SenhaErrada123!',
  });
  const emailInexistente = await login({
    endereco: email('inexistente'),
    senha: SENHA,
  });

  assert.equal(senhaErrada.resposta.status, 401);
  assert.equal(senhaErrada.dados.error.code, 'INVALID_CREDENTIALS');
  assert.equal(emailInexistente.resposta.status, 401);
  assert.equal(emailInexistente.dados.error.code, 'INVALID_CREDENTIALS');
  assert.equal(
    senhaErrada.dados.error.message,
    emailInexistente.dados.error.message
  );

  const corpo = JSON.stringify(senhaErrada.dados).toLowerCase();
  for (const termo of ['senha_hash', 'tentativas_falhas', 'bloqueado_ate', 'permissoes']) {
    assert.equal(corpo.includes(termo), false, termo);
  }
});

test('login válido cria sessão com cookie protegido e permissões reais', async () => {
  const resultado = await login({
    endereco: usuarioAdmin.email,
    senha: SENHA,
    lembrar: true,
  });

  assert.equal(resultado.resposta.status, 200);
  assert.ok(resultado.dados.csrfToken);
  assert.equal(resultado.dados.usuario.email, usuarioAdmin.email);
  assert.equal(resultado.dados.usuario.perfil, 'Administrador');
  assert.ok(resultado.dados.usuario.permissoes.includes('administracao.visualizar'));
  assert.equal(JSON.stringify(resultado.dados).includes('senha_hash'), false);

  const cookie = resultado.setCookies[0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=(6[0-9]{5}|[7-9][0-9]{5})/);
  assert.equal(resultado.resposta.headers.get('cache-control'), 'no-store');

  const sessao = await requisitar('/api/auth/session', {
    cookie: resultado.cookie,
  });
  assert.equal(sessao.resposta.status, 200);
  assert.equal(sessao.dados.usuario.email, usuarioAdmin.email);

  const appPage = await requisitar('/app.html', {
    cookie: resultado.cookie,
    redirect: 'manual',
  });
  assert.equal(appPage.resposta.status, 200);
  assert.match(appPage.dados, /id="view-outlet"/);
  assert.equal(appPage.dados.includes('preview-banner'), false);
});

test('logout exige token CSRF e revoga a sessão no servidor', async () => {
  const resultado = await login({
    endereco: usuarioAdmin.email,
    senha: SENHA,
  });

  const semCsrf = await requisitar('/api/auth/logout', {
    method: 'POST',
    cookie: resultado.cookie,
  });
  assert.equal(semCsrf.resposta.status, 403);
  assert.equal(semCsrf.dados.error.code, 'CSRF_INVALID');

  const csrfAdulterado = await requisitar('/api/auth/logout', {
    method: 'POST',
    cookie: resultado.cookie,
    csrf: `${resultado.dados.csrfToken}adulterado`,
  });
  assert.equal(csrfAdulterado.resposta.status, 403);

  const logout = await requisitar('/api/auth/logout', {
    method: 'POST',
    cookie: resultado.cookie,
    csrf: resultado.dados.csrfToken,
  });
  assert.equal(logout.resposta.status, 204);
  assert.match(logout.resposta.headers.getSetCookie().join(';'), /imobmanager_sid=;/);

  const sessao = await requisitar('/api/auth/session', {
    cookie: resultado.cookie,
  });
  assert.equal(sessao.resposta.status, 401);
});

test('requisições de outra origem são rejeitadas', async () => {
  const resposta = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://malicioso.example',
    },
    body: JSON.stringify({ email: usuarioAdmin.email, password: SENHA }),
  });
  const dados = await resposta.json();

  assert.equal(resposta.status, 403);
  assert.equal(dados.error.code, 'ORIGIN_INVALID');
});

test('conta é temporariamente bloqueada após tentativas excessivas', async () => {
  for (let tentativa = 1; tentativa <= 4; tentativa += 1) {
    const resultado = await login({
      endereco: usuarioBloqueado.email,
      senha: 'SenhaErrada123!',
    });
    assert.equal(resultado.resposta.status, 401, `tentativa ${tentativa}`);
  }

  const quinta = await login({
    endereco: usuarioBloqueado.email,
    senha: 'SenhaErrada123!',
  });
  assert.equal(quinta.resposta.status, 423);
  assert.equal(quinta.dados.error.code, 'ACCOUNT_LOCKED');
  assert.ok(Number(quinta.resposta.headers.get('retry-after')) > 0);

  const corretaDuranteBloqueio = await login({
    endereco: usuarioBloqueado.email,
    senha: SENHA,
  });
  assert.equal(corretaDuranteBloqueio.resposta.status, 423);

  const { rows } = await pool.query(
    `SELECT count(*)::int AS total
       FROM auditoria
      WHERE usuario_id = $1
        AND tipo_operacao IN ('auth.login_falha', 'auth.login_bloqueado')`,
    [usuarioBloqueado.id]
  );
  assert.ok(rows[0].total >= 5);
});

test('recuperação usa token de uso único e revoga sessões ao redefinir', async () => {
  const sessaoAntiga = await login({
    endereco: usuarioCorretor.email,
    senha: SENHA,
  });
  assert.equal(sessaoAntiga.resposta.status, 200);
  assert.equal(
    sessaoAntiga.dados.usuario.permissoes.includes('usuarios.gerenciar'),
    false
  );

  const solicitacao = await requisitar('/api/auth/forgot-password', {
    method: 'POST',
    body: { email: usuarioCorretor.email },
  });
  assert.equal(solicitacao.resposta.status, 200);
  assert.match(solicitacao.dados.message, /Se o e-mail informado estiver cadastrado/);

  const desconhecido = await requisitar('/api/auth/forgot-password', {
    method: 'POST',
    body: { email: email('nao-cadastrado') },
  });
  assert.equal(desconhecido.resposta.status, 200);
  assert.equal(desconhecido.dados.message, solicitacao.dados.message);

  const { rows: recuperacoes } = await pool.query(
    `SELECT token_hash, usado_em
       FROM recuperacoes_senha
      WHERE usuario_id = $1
      ORDER BY id DESC
      LIMIT 1`,
    [usuarioCorretor.id]
  );
  assert.equal(recuperacoes.length, 1);
  assert.match(recuperacoes[0].token_hash, /^[a-f0-9]{64}$/);
  assert.equal(recuperacoes[0].usado_em, null);

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await pool.query(
    `INSERT INTO recuperacoes_senha (usuario_id, token_hash, expira_em)
     VALUES ($1, $2, now() + interval '30 minutes')`,
    [usuarioCorretor.id, tokenHash]
  );

  const fraca = await requisitar('/api/auth/reset-password', {
    method: 'POST',
    body: { token, novaSenha: '123' },
  });
  assert.equal(fraca.resposta.status, 422);
  assert.equal(fraca.dados.error.code, 'WEAK_PASSWORD');

  const redefinicao = await requisitar('/api/auth/reset-password', {
    method: 'POST',
    body: { token, novaSenha: SENHA_NOVA },
  });
  assert.equal(redefinicao.resposta.status, 200);

  const sessaoRevogada = await requisitar('/api/auth/session', {
    cookie: sessaoAntiga.cookie,
  });
  assert.equal(sessaoRevogada.resposta.status, 401);

  const reutilizacao = await requisitar('/api/auth/reset-password', {
    method: 'POST',
    body: { token, novaSenha: 'OutraSenhaSegura789!' },
  });
  assert.equal(reutilizacao.resposta.status, 400);
  assert.equal(reutilizacao.dados.error.code, 'INVALID_RESET_TOKEN');

  const senhaAntiga = await login({
    endereco: usuarioCorretor.email,
    senha: SENHA,
  });
  assert.equal(senhaAntiga.resposta.status, 401);

  const senhaNova = await login({
    endereco: usuarioCorretor.email,
    senha: SENHA_NOVA,
  });
  assert.equal(senhaNova.resposta.status, 200);
});

test('cabeçalhos de segurança são aplicados e CSP não permite scripts inline', async () => {
  const resposta = await fetch(`${baseUrl}/`);
  const csp = resposta.headers.get('content-security-policy');

  assert.equal(resposta.headers.get('x-powered-by'), null);
  assert.equal(resposta.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(resposta.headers.get('referrer-policy'), 'no-referrer');
  assert.ok(csp);
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(csp.includes('unsafe-inline'), false);
  assert.equal(csp.includes('unsafe-eval'), false);
});

test('middlewares de autenticação e autorização negam acesso corretamente', async () => {
  const semSessao = await new Promise((resolve) => {
    requireAuth({}, {}, (error) => resolve(error));
  });
  assert.equal(semSessao.status, 401);
  assert.equal(semSessao.code, 'UNAUTHENTICATED');

  const semPermissao = await new Promise((resolve) => {
    requirePermission('usuarios.gerenciar')(
      { auth: { usuario: { permissoes: ['dashboard.visualizar'] } } },
      {},
      (error) => resolve(error)
    );
  });
  assert.equal(semPermissao.status, 403);
  assert.equal(semPermissao.code, 'FORBIDDEN');
});
