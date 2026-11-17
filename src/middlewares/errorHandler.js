'use strict';

const HttpError = require('../utils/http-error');
const config = require('../config/env');

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Erro interno do servidor.';
  let headers = {};
  let esperado = false;

  if (error instanceof HttpError) {
    status = error.status;
    code = error.code;
    message = error.message;
    headers = error.headers || {};
    esperado = true;
  } else if (error.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Corpo da requisição contém JSON inválido.';
    esperado = true;
  } else if (error.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Corpo da requisição excede o tamanho permitido.';
    esperado = true;
  }

  if (!esperado) {
    console.error(
      `[erro] ${req.method} ${req.originalUrl} -> ${status} ${code}:`,
      error.message
    );

    if (!config.isProduction) {
      console.error(error.stack);
    }
  }

  res.set(headers).status(status).json({
    error: {
      code,
      message,
    },
  });
}

module.exports = errorHandler;
