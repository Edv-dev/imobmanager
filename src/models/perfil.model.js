'use strict';

const { pool, query } = require('../config/database');

async function listar() {
  const { rows } = await query(
    `SELECT p.id,
            p.nome,
            p.descricao,
            p.administrativo,
            count(u.id) FILTER (WHERE u.excluido_em IS NULL)::int AS usuarios
       FROM perfis p
       LEFT JOIN usuarios u ON u.perfil_id = p.id
      GROUP BY p.id
      ORDER BY p.administrativo DESC, p.nome`
  );
  return rows;
}

async function buscarPorId(id) {
  const { rows } = await query(
    `SELECT id, nome, descricao, administrativo
       FROM perfis
      WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function listarOpcoes() {
  const { rows } = await query(
    `SELECT id, nome, administrativo
       FROM perfis
      ORDER BY administrativo DESC, nome`
  );
  return rows;
}

async function listarPermissoes() {
  const { rows } = await query(
    `SELECT id, chave, nome, modulo, descricao
       FROM permissoes
      ORDER BY modulo, chave`
  );
  return rows;
}

async function listarPermissoesDoPerfil(perfilId) {
  const { rows } = await query(
    `SELECT perm.chave
       FROM perfis_permissoes pp
       JOIN permissoes perm ON perm.id = pp.permissao_id
      WHERE pp.perfil_id = $1
      ORDER BY perm.chave`,
    [perfilId]
  );
  return rows.map((row) => row.chave);
}

async function listarPermissoesPorPerfil() {
  const { rows } = await query(
    `SELECT pp.perfil_id, perm.chave
       FROM perfis_permissoes pp
       JOIN permissoes perm ON perm.id = pp.permissao_id
      ORDER BY pp.perfil_id, perm.chave`
  );
  return rows;
}

async function definirPermissoes(perfilId, chaves) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: permissoes } = await client.query(
      `SELECT id, chave FROM permissoes WHERE chave = ANY($1::text[])`,
      [chaves]
    );

    if (permissoes.length !== chaves.length) {
      const encontradas = new Set(permissoes.map((item) => item.chave));
      const invalidas = chaves.filter((chave) => !encontradas.has(chave));
      throw Object.assign(
        new Error(`Permissões inválidas: ${invalidas.join(', ')}`),
        { code: 'INVALID_PERMISSION', invalidas }
      );
    }

    await client.query('DELETE FROM perfis_permissoes WHERE perfil_id = $1', [
      perfilId,
    ]);

    for (const permissao of permissoes) {
      await client.query(
        `INSERT INTO perfis_permissoes (perfil_id, permissao_id)
         VALUES ($1, $2)`,
        [perfilId, permissao.id]
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
  listar,
  listarOpcoes,
  buscarPorId,
  listarPermissoes,
  listarPermissoesDoPerfil,
  listarPermissoesPorPerfil,
  definirPermissoes,
};
