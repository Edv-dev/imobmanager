'use strict';

const { rateLimit } = require('express-rate-limit');
const config = require('../config/env');

function mensagemRateLimit(mensagem) {
  return {
    error: {
      code: 'RATE_LIMITED',
      message: mensagem,
    },
  };
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: mensagemRateLimit(
    'Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.'
  ),
});

const recoveryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: mensagemRateLimit(
    'Muitas solicitações de recuperação. Aguarde antes de tentar novamente.'
  ),
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: mensagemRateLimit(
    'Muitas tentativas de redefinição. Aguarde antes de tentar novamente.'
  ),
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 10000 : 1000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: mensagemRateLimit('Limite de requisições excedido. Tente novamente mais tarde.'),
});

module.exports = {
  loginLimiter,
  recoveryLimiter,
  resetLimiter,
  apiLimiter,
};
