'use strict';

const { Pool } = require('pg');
const config = require('./env');

/**
 * Pool único de conexões com o PostgreSQL.
 * As conexões só são abertas sob demanda (na primeira consulta).
 */
const poolOptions = {
  max: config.db.poolMax,
  connectionTimeoutMillis: 3000,
  idleTimeoutMillis: 30000,
  query_timeout: 5000,
  application_name: 'imobmanager-api',
  ssl: config.db.ssl ? { rejectUnauthorized: true } : false,
};

if (config.db.url) {
  poolOptions.connectionString = config.db.url;
} else {
  poolOptions.host = config.db.host;
  poolOptions.port = config.db.port;
  poolOptions.database = config.db.name;
  poolOptions.user = config.db.user;
  poolOptions.password = config.db.password;
}

const pool = new Pool(poolOptions);

pool.on('error', (error) => {
  console.error('[database] Erro inesperado em cliente ocioso do pool:', error.message);
});

async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Verifica se o banco está acessível sem expor detalhes sensíveis.
 * Retorna `{ status: 'up', latencyMs }` ou `{ status: 'down' }`.
 */
async function checkDatabase() {
  const startedAt = process.hrtime.bigint();

  try {
    await pool.query('SELECT 1 AS ok');
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    return { status: 'up', latencyMs: Math.round(latencyMs * 100) / 100 };
  } catch (error) {
    console.error('[database] Verificação de saúde falhou:', error.message);
    return { status: 'down' };
  }
}

async function closePool() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  checkDatabase,
  closePool,
};
