'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '1';
process.env.DB_PASSWORD = 'senha-invalida-para-teste';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');

const { checkDatabase, closePool } = require('../src/config/database');

after(async () => {
  await closePool();
});

test('checkDatabase informa indisponibilidade sem lançar exceção', async () => {
  const result = await checkDatabase();

  assert.equal(result.status, 'down');
  assert.equal(result.latencyMs, undefined);
});
