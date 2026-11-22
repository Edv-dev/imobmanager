'use strict';

const authService = require('../services/auth.service');
const config = require('../config/env');
const { csrfTokenForSession } = require('../utils/tokens');
const HttpError = require('../utils/http-error');

function opcoesCookie() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
  };
}

function definirCookieSessao(res, token, expiraEm) {
  const maxAge = Math.max(0, new Date(expiraEm).getTime() - Date.now());

  res.cookie(config.session.cookieName, token, {
    ...opcoesCookie(),
    maxAge,
  });
}

function limparCookieSessao(res) {
  res.clearCookie(config.session.cookieName, opcoesCookie());
}

function respostaSessao(sessao) {
  return {
    usuario: sessao.usuario,
    csrfToken: csrfTokenForSession(sessao.token),
    expiraEm: sessao.expiraEm,
    saidaPendente: Boolean(sessao.saidaPendente),
  };
}

async function login(req, res) {
  const { email, password, lembrar } = req.body || {};
  const sessao = await authService.login({
    email,
    password,
    lembrar: lembrar === true,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  definirCookieSessao(res, sessao.token, sessao.expiraEm);

  res.status(200).json({
    usuario: sessao.usuario,
    csrfToken: sessao.csrfToken,
    expiraEm: sessao.expiraEm,
  });
}

async function session(req, res) {
  if (!req.auth) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Sessão não encontrada ou expirada.');
  }

  res.status(200).json(respostaSessao(req.auth));
}

async function logout(req, res) {
  if (!req.auth) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Sessão não encontrada ou expirada.');
  }

  await authService.logout({
    token: req.sessionToken,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  limparCookieSessao(res);
  res.status(204).end();
}

async function leave(req, res) {
  if (!req.auth) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Sessão não encontrada ou expirada.');
  }

  await authService.solicitarSaida({ token: req.sessionToken });
  res.status(204).end();
}

async function resume(req, res) {
  if (!req.auth) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Sessão não encontrada ou expirada.');
  }

  await authService.retomarSessao({ token: req.sessionToken });
  res.status(204).end();
}

async function forgotPassword(req, res) {
  const resultado = await authService.solicitarRecuperacaoSenha({
    email: req.body?.email,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.status(200).json(resultado);
}

async function resetPassword(req, res) {
  const resultado = await authService.redefinirSenha({
    token: req.body?.token,
    novaSenha: req.body?.novaSenha,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.status(200).json(resultado);
}

module.exports = {
  login,
  session,
  logout,
  leave,
  resume,
  forgotPassword,
  resetPassword,
};
