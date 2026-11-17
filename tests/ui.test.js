'use strict';

process.env.NODE_ENV = 'test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');

const createApp = require('../src/app');
const { closePool } = require('../src/config/database');

let server;
let baseUrl;

before(async () => {
  const app = createApp();
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await closePool();
});

test('tela de login é servida na raiz com a identidade visual', async () => {
  const response = await fetch(`${baseUrl}/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(html, /Bem-vindo de volta/);
  assert.match(html, /ImobManager/);
  assert.match(html, /\/css\/base\.css/);
  assert.match(html, /\/js\/login\.js/);
  assert.match(html, /\/recuperar-senha\.html/);
  assert.match(html, /id="login-error"/);
  assert.equal(html.includes('/css/styles.css'), false);
  assert.equal(html.includes('Prévia da interface'), false);
  assert.equal(html.includes('Acessar prévia'), false);
});

test('área interna não é servida sem sessão autenticada', async () => {
  const response = await fetch(`${baseUrl}/app.html`, { redirect: 'manual' });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/');
});

test('shell autenticado mantém menu, outlet SPA e região de avisos', async () => {
  const html = await fs.readFile(
    path.join(__dirname, '..', 'public', 'app.html'),
    'utf8'
  );

  assert.match(html, /id="sidebar"/);
  assert.match(html, /id="view-outlet"/);
  assert.match(html, /id="toast-region"/);
  assert.match(html, /data-page-label/);
  assert.match(html, /\/css\/pages\.css/);
  assert.match(html, /\/js\/app\.js/);
  assert.equal(html.includes('preview-banner'), false);
  assert.equal(html.includes('Ambiente de pré-visualização'), false);
});

test('página de recuperação de senha é pública e possui os dois fluxos', async () => {
  const response = await fetch(`${baseUrl}/recuperar-senha.html`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(html, /Esqueceu sua senha/);
  assert.match(html, /id="request-form"/);
  assert.match(html, /id="reset-form"/);
  assert.match(html, /\/js\/recuperar-senha\.js/);
  assert.equal(html.includes('Prévia'), false);
});

test('folhas de estilo da interface são servidas como CSS', async () => {
  for (const file of ['base.css', 'layout.css', 'components.css', 'pages.css']) {
    const response = await fetch(`${baseUrl}/css/${file}`);
    const css = await response.text();

    assert.equal(response.status, 200, file);
    assert.match(response.headers.get('content-type'), /text\/css/, file);
    assert.ok(css.length > 500, `${file} deve ter conteúdo relevante`);
  }

  const base = await (await fetch(`${baseUrl}/css/base.css`)).text();
  assert.match(base, /--azul-marinho:\s*#14283f/);
  assert.match(base, /--dourado:\s*#c5a66a/);
  assert.match(base, /prefers-reduced-motion/);
});

test('módulos JavaScript da interface são servidos', async () => {
  const modules = [
    '/js/app.js',
    '/js/login.js',
    '/js/recuperar-senha.js',
    '/js/core/router.js',
    '/js/core/api.js',
    '/js/core/session.js',
    '/js/components/shell.js',
    '/js/components/modal.js',
    '/js/components/toast.js',
    '/js/views/dashboard.js',
    '/js/views/imoveis.js',
    '/js/views/corretores.js',
    '/js/views/clientes.js',
    '/js/views/atendimentos.js',
    '/js/views/relatorios.js',
    '/js/views/administracao.js',
  ];

  for (const file of modules) {
    const response = await fetch(`${baseUrl}${file}`);
    const body = await response.text();

    assert.equal(response.status, 200, file);
    assert.match(response.headers.get('content-type'), /javascript|ecmascript/, file);
    assert.ok(body.length > 0, `${file} não deve estar vazio`);
  }
});

test('favicon da identidade visual é servido como SVG', async () => {
  const response = await fetch(`${baseUrl}/assets/favicon.svg`);
  const svg = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /image\/svg\+xml/);
  assert.match(svg, /#14283f/);
  assert.match(svg, /#c5a66a/);
});

test('arquivos legados da etapa 01 não são mais publicados', async () => {
  for (const file of ['/css/styles.css', '/js/health-status.js']) {
    const response = await fetch(`${baseUrl}${file}`);
    assert.equal(response.status, 404, file);
  }
});
