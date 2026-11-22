'use strict';

const config = require('../config/env');
const auditoriaService = require('../services/auditoria.service');
const HttpError = require('../utils/http-error');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ORIGEM_CANONICA = new URL(config.app.url).origin;

async function negarOrigem(req, next) {
  await auditoriaService.registrarOrigemInvalida(req).catch(() => {});
  return next(
    new HttpError(403, 'ORIGIN_INVALID', 'Origem da requisição não permitida.')
  );
}

async function originCheck(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const secFetchSite = req.get('sec-fetch-site');

  if (
    secFetchSite &&
    !['same-origin', 'none'].includes(secFetchSite.toLowerCase())
  ) {
    return negarOrigem(req, next);
  }

  const origin = req.get('origin');

  if (origin) {
    let origemRecebida;

    try {
      origemRecebida = new URL(origin);
    } catch {
      return negarOrigem(req, next);
    }

    if (origemRecebida.origin !== ORIGEM_CANONICA) {
      return negarOrigem(req, next);
    }
  }

  return next();
}

function securityHeaders() {
  return {
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'upgrade-insecure-requests': config.isProduction ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: {
      maxAge: 15552000,
      includeSubDomains: false,
      preload: false,
    },
  };
}

module.exports = {
  originCheck,
  securityHeaders,
};
