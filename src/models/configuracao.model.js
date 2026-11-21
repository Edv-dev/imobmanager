'use strict';

const { pool, query } = require('../config/database');

const CHAVES_VISIBILIDADE = ['imoveis.visibilidade', 'clientes.visibilidade'];
const CHAVE_RETENCAO_AUDITORIA = 'auditoria.retencao_dias';

async function listar(chaves = CHAVES_VISIBILIDADE) {
  const { rows } = await query(
    `SELECT chave, valor, descricao
       FROM configuracoes
      WHERE chave = ANY($1::text[])
      ORDER BY chave`,
    [chaves]
  );
  return rows;
}

async function obterMapa(chaves = CHAVES_VISIBILIDADE) {
  const rows = await listar(chaves);
  return new Map(rows.map((row) => [row.chave, row.valor]));
}

async function obterValor(chave, padrao = null) {
  const mapa = await obterMapa([chave]);
  return mapa.has(chave) ? mapa.get(chave) : padrao;
}

async function definir(chave, valor, { descricao = null, atualizadoPorUsuarioId = null } = {}) {
  await query(
    `UPDATE configuracoes
        SET valor = $2::jsonb,
            descricao = COALESCE($3, descricao),
            atualizado_por_usuario_id = $4
      WHERE chave = $1`,
    [chave, JSON.stringify(valor), descricao, atualizadoPorUsuarioId]
  );
}

async function definirVisibilidade({ imoveis, clientes, atualizadoPorUsuarioId }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const [chave, valor] of [
      ['imoveis.visibilidade', imoveis],
      ['clientes.visibilidade', clientes],
    ]) {
      await client.query(
        `UPDATE configuracoes
            SET valor = to_jsonb($2::text),
                atualizado_por_usuario_id = $3
          WHERE chave = $1`,
        [chave, valor, atualizadoPorUsuarioId]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  CHAVES_VISIBILIDADE,
  CHAVE_RETENCAO_AUDITORIA,
  listar,
  obterMapa,
  obterValor,
  definir,
  definirVisibilidade,
};
