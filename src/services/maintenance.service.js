'use strict';

const { pool } = require('../config/database');
const auditoria = require('../models/auditoria.model');

const RETENCAO_DIAS = 7;

async function executarManutencao({ origem = 'cli' } = {}) {
  const client = await pool.connect();
  let sessoesRemovidas = 0;
  let recuperacoesRemovidas = 0;

  try {
    await client.query('BEGIN');

    const sessoes = await client.query(
      `DELETE FROM sessoes
        WHERE expira_em < now() - ($1::int * INTERVAL '1 day')
           OR (
             revogado_em IS NOT NULL
             AND revogado_em < now() - ($1::int * INTERVAL '1 day')
           )`,
      [RETENCAO_DIAS]
    );

    const recuperacoes = await client.query(
      `DELETE FROM recuperacoes_senha
        WHERE COALESCE(usado_em, expira_em) < now() - ($1::int * INTERVAL '1 day')`,
      [RETENCAO_DIAS]
    );

    await client.query('COMMIT');
    sessoesRemovidas = sessoes.rowCount;
    recuperacoesRemovidas = recuperacoes.rowCount;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  await auditoria.registrarSeguro({
    tipoOperacao: 'sistema.manutencao',
    entidade: 'sistema',
    resultado: 'sucesso',
    detalhes: {
      sessoesRemovidas,
      recuperacoesRemovidas,
      retencaoDias: RETENCAO_DIAS,
      origem,
    },
  });

  return {
    sessoesRemovidas,
    recuperacoesRemovidas,
    retencaoDias: RETENCAO_DIAS,
    executadoEm: new Date().toISOString(),
  };
}

module.exports = {
  RETENCAO_DIAS,
  executarManutencao,
};
