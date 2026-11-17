'use strict';

const { pool, query } = require('../config/database');

async function listarExcecoesDoUsuario(usuarioId) {
  const [imoveis, clientes] = await Promise.all([
    query(
      `SELECT ai.imovel_id, ai.permitido
         FROM acessos_imoveis ai
        WHERE ai.usuario_id = $1`,
      [usuarioId]
    ),
    query(
      `SELECT ac.cliente_id, ac.permitido
         FROM acessos_clientes ac
        WHERE ac.usuario_id = $1`,
      [usuarioId]
    ),
  ]);

  return {
    imoveis: imoveis.rows,
    clientes: clientes.rows,
  };
}

async function substituirExcecoes(usuarioId, { imoveis = [], clientes = [] }, concedidoPorUsuarioId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM acessos_imoveis WHERE usuario_id = $1', [
      usuarioId,
    ]);
    await client.query('DELETE FROM acessos_clientes WHERE usuario_id = $1', [
      usuarioId,
    ]);

    for (const item of imoveis) {
      await client.query(
        `INSERT INTO acessos_imoveis
           (usuario_id, imovel_id, permitido, concedido_por_usuario_id)
         VALUES ($1, $2, $3, $4)`,
        [usuarioId, item.id, item.permitido, concedidoPorUsuarioId]
      );
    }

    for (const item of clientes) {
      await client.query(
        `INSERT INTO acessos_clientes
           (usuario_id, cliente_id, permitido, concedido_por_usuario_id)
         VALUES ($1, $2, $3, $4)`,
        [usuarioId, item.id, item.permitido, concedidoPorUsuarioId]
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

async function listarImoveis({ limite = 200 } = {}) {
  const { rows } = await query(
    `SELECT i.id,
            i.codigo_interno,
            i.titulo,
            i.cidade,
            i.bairro,
            i.situacao,
            COALESCE(
              jsonb_agg(DISTINCT jsonb_build_object('id', c.id, 'nome', c.nome_completo))
                FILTER (WHERE c.id IS NOT NULL),
              '[]'::jsonb
            ) AS corretores
       FROM imoveis i
       LEFT JOIN imoveis_corretores ic ON ic.imovel_id = i.id
       LEFT JOIN corretores c
         ON c.id = ic.corretor_id
        AND c.excluido_em IS NULL
      WHERE i.excluido_em IS NULL
      GROUP BY i.id
      ORDER BY i.criado_em DESC, i.id DESC
      LIMIT $1`,
    [limite]
  );
  return rows;
}

async function listarClientes({ limite = 200 } = {}) {
  const { rows } = await query(
    `SELECT cl.id,
            cl.nome_completo,
            cl.finalidade_desejada,
            COALESCE(
              jsonb_agg(DISTINCT jsonb_build_object('id', c.id, 'nome', c.nome_completo))
                FILTER (WHERE c.id IS NOT NULL),
              '[]'::jsonb
            ) AS corretores
       FROM clientes cl
       LEFT JOIN clientes_corretores cc ON cc.cliente_id = cl.id
       LEFT JOIN corretores c
         ON c.id = cc.corretor_id
        AND c.excluido_em IS NULL
      WHERE cl.excluido_em IS NULL
      GROUP BY cl.id
      ORDER BY cl.criado_em DESC, cl.id DESC
      LIMIT $1`,
    [limite]
  );
  return rows;
}

async function idsExistentes(tipo, ids) {
  if (ids.length === 0) return new Set();

  const tabela = tipo === 'imovel' ? 'imoveis' : 'clientes';
  const { rows } = await query(
    `SELECT id FROM ${tabela}
      WHERE id = ANY($1::bigint[])
        AND excluido_em IS NULL`,
    [ids]
  );
  return new Set(rows.map((row) => String(row.id)));
}

module.exports = {
  listarExcecoesDoUsuario,
  substituirExcecoes,
  listarImoveis,
  listarClientes,
  idsExistentes,
};
