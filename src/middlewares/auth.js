'use strict';

const authService = require('../services/auth.service');
const { csrfTokenForSession, safeEqualText } = require('../utils/tokens');
const HttpError = require('../utils/http-error');
const config = require('../config/env');

async function authenticateSession(req, res, next) {
  req.auth = null;
  req.sessionToken = null;

  const token = req.cookies?.[config.session.cookieName];

  if (!token || typeof token !== 'string') {
    return next();
  }

  try {
    const sessao = await authService.obterSessao(token);

    if (sessao) {
      req.auth = sessao;
      req.sessionToken = token;
    }
  } catch (error) {
    console.error('[auth] Falha ao validar sessão:', error.message);
  }

  return next();
}

function requireAuth(req, res, next) {
  if (!req.auth) {
    return next(
      new HttpError(401, 'UNAUTHENTICATED', 'Autenticação necessária para acessar este recurso.')
    );
  }
  return next();
}

function requireAdministrativeProfile(req, res, next) {
  if (!req.auth) {
    return next(
      new HttpError(401, 'UNAUTHENTICATED', 'Autenticação necessária para acessar este recurso.')
    );
  }

  if (!req.auth.usuario.administrativo) {
    return next(
      new HttpError(
        403,
        'FORBIDDEN',
        'Acesso restrito a administradores.'
      )
    );
  }

  return next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.auth) {
      return next(
        new HttpError(401, 'UNAUTHENTICATED', 'Autenticação necessária para acessar este recurso.')
      );
    }

    if (!req.auth.usuario.permissoes.includes(permission)) {
      return next(
        new HttpError(403, 'FORBIDDEN', 'Você não possui permissão para acessar este recurso.')
      );
    }

    return next();
  };
}

function requireAnyPermission(permissions) {
  return (req, res, next) => {
    if (!req.auth) {
      return next(
        new HttpError(401, 'UNAUTHENTICATED', 'Autenticação necessária para acessar este recurso.')
      );
    }

    const permitido = permissions.some((permission) =>
      req.auth.usuario.permissoes.includes(permission)
    );

    if (!permitido) {
      return next(
        new HttpError(403, 'FORBIDDEN', 'Você não possui permissão para acessar este recurso.')
      );
    }

    return next();
  };
}

function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  if (!req.auth) {
    return next();
  }

  const recebido = req.get('x-csrf-token');
  const esperado = csrfTokenForSession(req.sessionToken);

  if (!safeEqualText(recebido, esperado)) {
    return next(
      new HttpError(403, 'CSRF_INVALID', 'Requisição inválida. Atualize a página e tente novamente.')
    );
  }

  return next();
}

function requireAuthPage(req, res, next) {
  if (req.auth) return next();

  const possuiaCookie = Boolean(req.cookies?.[config.session.cookieName]);

  if (possuiaCookie) {
    res.clearCookie(config.session.cookieName, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      path: '/',
    });
  }

  return res.redirect(302, possuiaCookie ? '/?sessao=expirada' : '/');
}

function redirectIfAuthenticated(req, res, next) {
  if (req.auth) return res.redirect(302, '/app.html');
  return next();
}

module.exports = {
  authenticateSession,
  requireAuth,
  requireAdministrativeProfile,
  requirePermission,
  requireAnyPermission,
  csrfProtection,
  requireAuthPage,
  redirectIfAuthenticated,
};
