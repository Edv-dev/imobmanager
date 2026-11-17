'use strict';

const { pool, query } = require('../config/database');

const CHAVES_VISIBILIDADE = ['imoveis.visibilidade', 'clientes.visibilidade'];

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
  listar,
  obterMapa,
  definirVisibilidade,
};
