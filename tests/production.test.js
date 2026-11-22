'use strict';

process.env.NODE_ENV = 'production';
process.env.SESSION_SECRET = 's'.repeat(64);
process.env.APP_URL = 'https://imobmanager.example.test';
process.env.TRUST_PROXY = '1';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const createApp = require('../src/app');
const { pool, closePool } = require('../src/config/database');
const { expurgarAuditoriaTeste } = require('./helpers/auditoria');

const ORIGEM = 'https://imobmanager.example.test';
const PREFIXO = `producao.${process.pid}.${Date.now()}`;

let server;
let baseUrl;
let inicio;

before(async () => {
  inicio = new Date();

  const app = createApp();
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

  await expurgarAuditoriaTeste(
    `(usuario_email LIKE $1 OR (tipo_operacao = $2 AND data_hora >= $3))`,
    [`${PREFIXO}%`, 'seguranca.origem_invalida', inicio]
  );
  await closePool();
});

test('produção envia HSTS, no-store e CSP sem scripts inline', async () => {
  const resposta = await fetch(`${baseUrl}/api/health`);

  assert.match(
    resposta.headers.get('strict-transport-security'),
    /max-age=15552000/
  );
  assert.equal(resposta.headers.get('cache-control'), 'no-store');
  assert.equal(resposta.headers.get('x-powered-by'), null);

  const csp = resposta.headers.get('content-security-policy');
  assert.ok(csp);
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(csp.includes('unsafe-inline'), false);
  assert.equal(csp.includes('unsafe-eval'), false);
});

test('origem canônica é aceita e origem externa é rejeitada', async () => {
  const aceita = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGEM,
    },
    body: JSON.stringify({
      email: `${PREFIXO}.origem@exemplo.test`,
      password: 'SenhaInvalida123!',
    }),
  });
  const dadosAceita = await aceita.json();

  assert.equal(aceita.status, 401);
  assert.equal(dadosAceita.error.code, 'INVALID_CREDENTIALS');

  const rejeitada = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://malicioso.example',
    },
    body: JSON.stringify({
      email: `${PREFIXO}.origem@exemplo.test`,
      password: 'SenhaInvalida123!',
    }),
  });
  const dadosRejeitada = await rejeitada.json();

  assert.equal(rejeitada.status, 403);
  assert.equal(dadosRejeitada.error.code, 'ORIGIN_INVALID');
});

test('trust proxy usa o IP encaminhado pelo proxy reverso', async () => {
  const email = `${PREFIXO}.proxy@exemplo.test`;
  const ip = '198.51.100.42';

  const resposta = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGEM,
      'X-Forwarded-For': ip,
    },
    body: JSON.stringify({ email, password: 'SenhaInvalida123!' }),
  });

  assert.equal(resposta.status, 401);

  const { rows } = await pool.query(
    `SELECT ip
       FROM auditoria
      WHERE usuario_email = $1
        AND tipo_operacao = 'auth.login_falha'
      ORDER BY id DESC
      LIMIT 1`,
    [email]
  );

  assert.equal(rows[0].ip, ip);
});

test('configuração de produção rejeita segredo fraco e APP_URL insegura', () => {
  const cenarios = [
    {
      nome: 'segredo ausente',
      env: { SESSION_SECRET: '' },
      erro: /SESSION_SECRET é obrigatório em produção/,
    },
    {
      nome: 'segredo curto',
      env: { SESSION_SECRET: 'curto' },
      erro: /pelo menos 32 caracteres/,
    },
    {
      nome: 'APP_URL sem HTTPS',
      env: { APP_URL: 'http://imobmanager.example.test' },
      erro: /APP_URL deve usar https em produção/,
    },
  ];

  for (const cenario of cenarios) {
    const resultado = spawnSync(
      process.execPath,
      ['-e', "require('./src/config/env')"],
      {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_ENV: 'production',
          APP_URL: ORIGEM,
          SESSION_SECRET: 'x'.repeat(64),
          ...cenario.env,
        },
      }
    );

    assert.notEqual(resultado.status, 0, cenario.nome);
    assert.match(resultado.stderr, cenario.erro, cenario.nome);
  }
});
