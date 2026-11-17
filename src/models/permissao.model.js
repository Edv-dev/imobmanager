'use strict';

const { pool, query } = require('../config/database');

async function listarExcecoesDoUsuario(usuarioId) {
  const { rows } = await query(
    `SELECT perm.chave, pu.permitido
       FROM permissoes_usuarios pu
       JOIN permissoes perm ON perm.id = pu.permissao_id
      WHERE pu.usuario_id = $1
      ORDER BY perm.chave`,
    [usuarioId]
  );
  return rows;
}

async function listarMatrizUsuario(usuarioId) {
  const { rows } = await query(
    `SELECT perm.id,
            perm.chave,
            perm.nome,
            perm.modulo,
            perm.descricao,
            EXISTS (
              SELECT 1
                FROM perfis_permissoes pp
               WHERE pp.perfil_id = u.perfil_id
                 AND pp.permissao_id = perm.id
            ) AS herdado,
            pu.permitido AS excecao
       FROM usuarios u
       JOIN permissoes perm ON true
       LEFT JOIN permissoes_usuarios pu
         ON pu.usuario_id = u.id
        AND pu.permissao_id = perm.id
      WHERE u.id = $1
        AND u.excluido_em IS NULL
      ORDER BY perm.modulo, perm.chave`,
    [usuarioId]
  );
  return rows;
}

async function substituirExcecoesUsuario(
  usuarioId,
  excecoes,
  concedidoPorUsuarioId
) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM permissoes_usuarios WHERE usuario_id = $1', [
      usuarioId,
    ]);

    if (excecoes.length > 0) {
      const chaves = excecoes.map((item) => item.chave);
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

      const idsPorChave = new Map(
        permissoes.map((permissao) => [permissao.chave, permissao.id])
      );

      for (const excecao of excecoes) {
        await client.query(
          `INSERT INTO permissoes_usuarios
             (usuario_id, permissao_id, permitido, concedido_por_usuario_id)
           VALUES ($1, $2, $3, $4)`,
          [usuarioId, idsPorChave.get(excecao.chave), excecao.permitido, concedidoPorUsuarioId]
        );
      }
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
  listarExcecoesDoUsuario,
  listarMatrizUsuario,
  substituirExcecoesUsuario,
};
