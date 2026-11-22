'use strict';

const config = require('./config/env');
const { closePool } = require('./config/database');
const createApp = require('./app');

const app = createApp();

const server = app.listen(config.server.port, config.server.host, () => {
  console.log(
    `[server] ImobManager API ouvindo em http://${config.server.host}:${config.server.port} (${config.env}); URL pública: ${config.app.url}`
  );

  if (config.isProduction && !config.smtp.host) {
    console.warn(
      '[server] SMTP não configurado; a recuperação de senha não enviará e-mails em produção.'
    );
  }
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[server] A porta ${config.server.port} já está em uso.`);
  } else {
    console.error('[server] Falha ao iniciar o servidor:', error.message);
  }
  process.exit(1);
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[server] Recebido ${signal}. Encerrando com segurança...`);

  const forceExit = setTimeout(() => {
    console.error('[server] Encerramento forçado após tempo limite.');
    process.exit(1);
  }, 10000);
  forceExit.unref();

  server.close(async () => {
    try {
      await closePool();
      console.log('[server] Servidor e pool de conexões encerrados.');
      process.exit(0);
    } catch (error) {
      console.error('[server] Erro ao encerrar pool de conexões:', error.message);
      process.exit(1);
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error(
    '[server] Promise rejeitada sem tratamento:',
    reason instanceof Error ? reason.message : reason
  );
});

process.on('uncaughtException', (error) => {
  console.error('[server] Exceção não capturada:', error);
  shutdown('uncaughtException');
});
