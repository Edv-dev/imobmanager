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

test('páginas HTML não são armazenadas no cache do navegador', async () => {
  for (const pagina of ['/', '/index.html', '/recuperar-senha.html']) {
    const response = await fetch(`${baseUrl}${pagina}`);

    assert.equal(response.status, 200, pagina);
    assert.equal(response.headers.get('cache-control'), 'no-store', pagina);
  }

  const protegida = await fetch(`${baseUrl}/app.html`, { redirect: 'manual' });
  assert.equal(protegida.headers.get('cache-control'), 'no-store');

  const css = await fetch(`${baseUrl}/css/base.css`);
  assert.notEqual(css.headers.get('cache-control'), 'no-store');
});

test('restauração pelo cache do navegador revalida a sessão', async () => {
  const app = await (await fetch(`${baseUrl}/js/app.js`)).text();
  assert.match(app, /addEventListener\('pageshow'/);
  assert.match(app, /event\.persisted/);
  assert.match(app, /carregarSessao\(\)/);
  assert.match(app, /sessao=expirada/);

  const login = await (await fetch(`${baseUrl}/js/login.js`)).text();
  assert.match(login, /addEventListener\('pageshow'/);
  assert.match(login, /passwordInput\.value = ''/);
});

test('sair do app encerra a sessão e exige novo login', async () => {
  const app = await (await fetch(`${baseUrl}/js/app.js`)).text();
  assert.match(app, /addEventListener\('pagehide'/);
  assert.match(app, /sinalizarSaidaKeepalive/);
  assert.match(app, /saidaPendente/);
  assert.match(app, /recarregouPagina/);
  assert.match(app, /performance\.getEntriesByType/);
  assert.match(app, /retomarSessaoRemota/);
  assert.match(app, /CHAVE_SAIDA/);
  assert.match(app, /sessao=encerrada/);

  const api = await (await fetch(`${baseUrl}/js/core/api.js`)).text();
  assert.match(api, /\/api\/auth\/leave/);
  assert.match(api, /keepalive: true/);
  assert.match(api, /X-CSRF-Token/);

  const login = await (await fetch(`${baseUrl}/js/login.js`)).text();
  assert.match(login, /sessionStorage\.removeItem\(CHAVE_SAIDA\)/);
  assert.match(login, /motivoSessao === 'encerrada'/);
  assert.equal(login.includes("window.location.replace('/app.html')"), false);
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

test('tela administrativa utiliza a API real e oferece as áreas de gestão', async () => {
  const response = await fetch(`${baseUrl}/js/views/administracao.js`);
  const script = await response.text();

  assert.equal(response.status, 200);
  assert.match(script, /\/api\/administracao\/resumo/);
  assert.match(script, /\/api\/administracao\/usuarios/);
  assert.match(script, /\/api\/administracao\/perfis/);
  assert.match(script, /\/api\/administracao\/configuracoes\/visibilidade/);
  assert.match(script, /\/api\/administracao\/auditoria/);
  assert.match(script, /\/api\/administracao\/auditoria\/retencao/);
  assert.match(script, /\/api\/administracao\/lgpd/);
  assert.match(script, /admin-permissoes-usuario/);
  assert.match(script, /admin-acessos-usuario/);
  assert.match(script, /data-admin-visibilidade/);
  assert.match(script, /data-admin-retencao/);
  assert.match(script, /data-admin-lgpd-busca/);
  assert.match(script, /Histórico/);
  assert.equal(script.includes('serão implementadas na etapa 05'), false);

  const css = await (await fetch(`${baseUrl}/css/pages.css`)).text();
  assert.match(css, /\.permission-row/);
  assert.match(css, /\.access-row/);
  assert.match(css, /\.admin-loading/);
});

test('páginas e CSS mantêm viewport e breakpoints responsivos', async () => {
  for (const pagina of ['/', '/recuperar-senha.html']) {
    const html = await (await fetch(`${baseUrl}${pagina}`)).text();
    assert.match(html, /name="viewport"/, pagina);
    assert.match(html, /width=device-width/, pagina);
  }

  const appHtml = await fs.readFile(
    path.join(__dirname, '..', 'public', 'app.html'),
    'utf8'
  );
  assert.match(appHtml, /name="viewport"/);
  assert.match(appHtml, /width=device-width/);

  const layout = await (await fetch(`${baseUrl}/css/layout.css`)).text();
  assert.match(layout, /@media \(max-width: 1024px\)/);
  assert.match(layout, /@media \(max-width: 720px\)/);
  assert.match(layout, /@media \(max-width: 560px\)/);

  const pages = await (await fetch(`${baseUrl}/css/pages.css`)).text();
  assert.match(pages, /@media \(max-width: 760px\)/);
  assert.match(pages, /@media \(max-width: 640px\)/);

  const components = await (await fetch(`${baseUrl}/css/components.css`)).text();
  assert.match(components, /@media \(max-width: 640px\)/);
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
