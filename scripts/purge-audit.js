'use strict';

const auditoriaService = require('../src/services/auditoria.service');
const { closePool } = require('../src/config/database');

async function main() {
  const resultado = await auditoriaService.executarRetencaoAutomatica({ origem: 'cli' });
  console.log(
    `[auditoria] ${resultado.removidos} evento(s) com mais de ${resultado.dias} dia(s) removido(s).`
  );
}

main()
  .catch((error) => {
    console.error(`[auditoria] Falha ao aplicar a retenção: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => {});
  });
