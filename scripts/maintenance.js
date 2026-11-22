'use strict';

const { executarManutencao, RETENCAO_DIAS } = require('../src/services/maintenance.service');
const auditoriaService = require('../src/services/auditoria.service');
const { closePool } = require('../src/config/database');

async function main() {
  const resultado = await executarManutencao({ origem: 'cli' });
  const retencao = await auditoriaService.executarRetencaoAutomatica({
    origem: 'manutencao',
  });

  console.log(
    `[manutencao] ${resultado.sessoesRemovidas} sessão(ões) e ` +
      `${resultado.recuperacoesRemovidas} recuperação(ões) com mais de ` +
      `${RETENCAO_DIAS} dia(s) removida(s).`
  );
  console.log(
    `[manutencao] ${retencao.removidos} evento(s) de auditoria com mais de ` +
      `${retencao.dias} dia(s) removido(s).`
  );
}

main()
  .catch((error) => {
    console.error(`[manutencao] Falha na rotina de manutenção: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => {});
  });
