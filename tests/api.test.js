'use strict';

process.env.NODE_ENV = 'test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

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

test('GET /api/health retorna estado coerente com o banco de dados', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();

  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('x-powered-by'), null);

  assert.equal(body.service, 'imobmanager-api');
  assert.equal(body.environment, 'test');
  assert.equal(typeof body.timestamp, 'string');
  assert.equal(typeof body.uptimeSeconds, 'number');

  assert.ok(['up', 'down'].includes(body.checks.database.status));

  if (body.checks.database.status === 'up') {
    assert.equal(response.status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(typeof body.checks.database.latencyMs, 'number');
  } else {
    assert.equal(response.status, 503);
    assert.equal(body.status, 'degraded');
    assert.equal(body.checks.database.latencyMs, undefined);
  }
});

test('GET /api/health não expõe detalhes internos ou credenciais', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const rawBody = await response.text();

  for (const term of ['password', 'DB_PASSWORD', 'stack', 'postgresql://']) {
    assert.equal(rawBody.toLowerCase().includes(term.toLowerCase()), false);
  }
});

test('rotas desconhecidas da API retornam 404 em JSON', async () => {
  const response = await fetch(`${baseUrl}/api/rota-inexistente`);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
  assert.equal(typeof body.error.message, 'string');
});

test('JSON inválido no corpo retorna 400 sem quebrar o servidor', async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"invalido":',
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'INVALID_JSON');
});

test('a página inicial estática é servida na raiz', async () => {
  const response = await fetch(`${baseUrl}/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(html, /ImobManager/);
});
