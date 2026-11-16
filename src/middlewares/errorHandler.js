'use strict';

const config = require('../config/env');

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Erro interno do servidor.';

  if (error.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Corpo da requisição contém JSON inválido.';
  } else if (error.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Corpo da requisição excede o tamanho permitido.';
  }

  console.error(
    `[erro] ${req.method} ${req.originalUrl} -> ${status} ${code}:`,
    error.message
  );

  if (!config.isProduction) {
    console.error(error.stack);
  }

  res.status(status).json({
    error: {
      code,
      message,
    },
  });
}

module.exports = errorHandler;
