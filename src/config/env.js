'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
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

function toTrustProxy(value) {
  if (value === undefined || value === null || value === '') return false;

  const normalizado = String(value).trim().toLowerCase();

  if (['false', 'off', 'no', '0'].includes(normalizado)) return false;
  if (['true', 'on', 'yes'].includes(normalizado)) return true;
  if (/^\d+$/.test(normalizado)) return Number.parseInt(normalizado, 10);

  return normalizado;
}

function validarAppUrl(url) {
  let parsed;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Configuração inválida: APP_URL deve ser uma URL absoluta.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Configuração inválida: APP_URL deve usar http ou https.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('Configuração inválida: APP_URL não deve conter credenciais.');
  }

  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Configuração inválida: APP_URL deve apontar para a raiz do site.');
  }

  if (config.isProduction && parsed.protocol !== 'https:') {
    throw new Error('Configuração inválida: APP_URL deve usar https em produção.');
  }
}

const nodeEnv = process.env.NODE_ENV || 'development';
const databaseUrl = process.env.DATABASE_URL || '';
const port = toInt(process.env.PORT, 3000);
const host = process.env.HOST || '0.0.0.0';
const uploadsDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(__dirname, '..', '..', 'uploads');

const config = {
  env: nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  server: {
    port,
    host,
    trustProxy: toTrustProxy(process.env.TRUST_PROXY),
  },
  app: {
    url: (process.env.APP_URL || `http://localhost:${port}`).replace(/\/$/, ''),
  },
  session: {
    cookieName: 'imobmanager_sid',
    secret: process.env.SESSION_SECRET || '',
    ttlMinutes: toInt(process.env.SESSION_TTL_MINUTES, 480),
    rememberDays: toInt(process.env.SESSION_REMEMBER_DAYS, 7),
  },
  auth: {
    maxAttempts: toInt(process.env.AUTH_MAX_ATTEMPTS, 5),
    lockMinutes: toInt(process.env.AUTH_LOCK_MINUTES, 15),
    resetTtlMinutes: toInt(process.env.PASSWORD_RESET_TTL_MINUTES, 30),
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: toInt(process.env.SMTP_PORT, 587),
    secure: toBool(process.env.SMTP_SECURE, toInt(process.env.SMTP_PORT, 587) === 465),
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || '',
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
  uploads: {
    dir: uploadsDir,
    maxImageBytes: toInt(process.env.UPLOAD_MAX_IMAGE_BYTES, 5 * 1024 * 1024),
    maxImagesPerProperty: toInt(process.env.UPLOAD_MAX_IMAGES_PER_PROPERTY, 10),
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

  validarAppUrl(config.app.url);

  if (!config.session.secret) {
    if (config.isProduction) {
      throw new Error('Configuração inválida: SESSION_SECRET é obrigatório em produção.');
    }

    config.session.secret = crypto.randomBytes(32).toString('hex');
    console.warn(
      '[config] SESSION_SECRET ausente; usando segredo efêmero nesta execução. Defina a variável no .env.'
    );
  } else if (config.isProduction && config.session.secret.length < 32) {
    throw new Error('Configuração inválida: SESSION_SECRET deve ter pelo menos 32 caracteres em produção.');
  }

  if (!Number.isInteger(config.session.ttlMinutes) || config.session.ttlMinutes < 5) {
    throw new Error('Configuração inválida: SESSION_TTL_MINUTES deve ser pelo menos 5.');
  }

  if (!Number.isInteger(config.auth.maxAttempts) || config.auth.maxAttempts < 3) {
    throw new Error('Configuração inválida: AUTH_MAX_ATTEMPTS deve ser pelo menos 3.');
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

  if (!config.uploads.dir) {
    throw new Error('Configuração inválida: UPLOAD_DIR não pode ser vazio.');
  }

  if (!Number.isInteger(config.uploads.maxImageBytes) || config.uploads.maxImageBytes < 1024) {
    throw new Error(
      'Configuração inválida: UPLOAD_MAX_IMAGE_BYTES deve ser pelo menos 1024.'
    );
  }

  if (
    !Number.isInteger(config.uploads.maxImagesPerProperty) ||
    config.uploads.maxImagesPerProperty < 1 ||
    config.uploads.maxImagesPerProperty > 50
  ) {
    throw new Error(
      'Configuração inválida: UPLOAD_MAX_IMAGES_PER_PROPERTY deve estar entre 1 e 50.'
    );
  }
}

assertConfig();

module.exports = config;
