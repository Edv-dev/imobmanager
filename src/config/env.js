'use strict';

const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env'), quiet: true });

function toInt(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

const nodeEnv = process.env.NODE_ENV || 'development';
const databaseUrl = process.env.DATABASE_URL || '';

const config = {
  env: nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  server: {
    port: toInt(process.env.PORT, 3000),
    host: process.env.HOST || '0.0.0.0',
  },
  db: {
    url: databaseUrl,
    host: process.env.DB_HOST || 'localhost',
    port: toInt(process.env.DB_PORT, 5432),
    name: process.env.DB_NAME || 'imobmanager',
    user: process.env.DB_USER || 'imobmanager',
    password: process.env.DB_PASSWORD || '',
    ssl: toBool(process.env.DB_SSL, false),
    poolMax: toInt(process.env.DB_POOL_MAX, 10),
  },
};

function assertConfig() {
  const { port, host } = config.server;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Configuração inválida: PORT deve ser um número entre 1 e 65535.');
  }

  if (!host) {
    throw new Error('Configuração inválida: HOST não pode ser vazio.');
  }

  if (!config.db.url) {
    if (!config.db.name || !config.db.user) {
      throw new Error('Configuração inválida: DB_NAME e DB_USER são obrigatórios.');
    }

    if (!Number.isInteger(config.db.port) || config.db.port < 1 || config.db.port > 65535) {
      throw new Error('Configuração inválida: DB_PORT deve ser um número entre 1 e 65535.');
    }

    if (config.isProduction && !config.db.password) {
      throw new Error('Configuração inválida: DB_PASSWORD é obrigatório em produção.');
    }
  }
}

assertConfig();

module.exports = config;
