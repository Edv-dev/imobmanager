'use strict';

const { pool, query } = require('../config/database');

async function criar({ usuarioId, tokenHash, expiraEm, ip = null }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE recuperacoes_senha
          SET usado_em = now()
        WHERE usuario_id = $1
          AND usado_em IS NULL`,
      [usuarioId]
    );

    const { rows } = await client.query(
      `INSERT INTO recuperacoes_senha (usuario_id, token_hash, expira_em, ip)
       VALUES ($1, $2, $3, $4)
       RETURNING id, expira_em`,
      [usuarioId, tokenHash, expiraEm, ip]
    );

    await client.query('COMMIT');
    return rows[0];
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function redefinirSenhaComToken({ tokenHash, senhaHash }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: tokens } = await client.query(
      `SELECT r.id AS recuperacao_id,
              u.id AS usuario_id,
              u.email,
              u.nome_completo
         FROM recuperacoes_senha r
         JOIN usuarios u ON u.id = r.usuario_id
        WHERE r.token_hash = $1
          AND r.usado_em IS NULL
          AND r.expira_em > now()
          AND u.ativo = true
          AND u.excluido_em IS NULL
        FOR UPDATE OF r, u`,
      [tokenHash]
    );

    const token = tokens[0];

    if (!token) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(
      `UPDATE usuarios
          SET senha_hash = $2,
              senha_alterada_em = now(),
              deve_trocar_senha = false,
              tentativas_falhas = 0,
              bloqueado_ate = NULL
        WHERE id = $1`,
      [token.usuario_id, senhaHash]
    );

    await client.query(
      `UPDATE recuperacoes_senha
          SET usado_em = now()
        WHERE id = $1`,
      [token.recuperacao_id]
    );

    await client.query(
      `UPDATE recuperacoes_senha
          SET usado_em = now()
        WHERE usuario_id = $1
          AND usado_em IS NULL`,
      [token.usuario_id]
    );

    await client.query(
      `UPDATE sessoes
          SET revogado_em = now(),
              revogado_motivo = 'senha_redefinida'
        WHERE usuario_id = $1
          AND revogado_em IS NULL`,
      [token.usuario_id]
    );

    await client.query('COMMIT');
    return token;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function limparExpiradasParaUsuario(usuarioId) {
  await query(
    `UPDATE recuperacoes_senha
        SET usado_em = now()
      WHERE usuario_id = $1
        AND usado_em IS NULL
        AND expira_em <= now()`,
    [usuarioId]
  );
}

module.exports = {
  criar,
  redefinirSenhaComToken,
  limparExpiradasParaUsuario,
};
