'use strict';

const { criarBackup } = require('../src/services/backup.service');

function megabytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

try {
  const resultado = criarBackup();

  console.log(`[backup] Banco: ${resultado.arquivoBanco} (${megabytes(resultado.bytesBanco)})`);
  console.log(
    resultado.arquivoUploads
      ? `[backup] Uploads: ${resultado.arquivoUploads} (${megabytes(resultado.bytesUploads)})`
      : '[backup] Diretório de uploads inexistente; arquivos não incluídos.'
  );
  console.log(
    `[backup] ${resultado.removidos} arquivo(s) antigo(s) removido(s); ` +
      `retenção de ${resultado.retencaoDias} dia(s).`
  );
} catch (error) {
  console.error(`[backup] Falha ao gerar backup: ${error.message}`);
  process.exitCode = 1;
}
