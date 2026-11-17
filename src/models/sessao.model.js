'use strict';

const { query } = require('../config/database');

async function criar({ usuarioId, tokenHash, expiraEm, ip = null, userAgent = null }) {
  const { rows } = await query(
    `INSERT INTO sessoes (usuario_id, token_hash, expira_em, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, expira_em`,
    [usuarioId, tokenHash, expiraEm, ip, userAgent]
  );
  return rows[0];
}

async function buscarValidaPorHash(tokenHash) {
  const { rows } = await query(
    `SELECT s.id AS sessao_id,
            s.expira_em,
            u.id AS usuario_id,
            u.nome_completo,
            u.email,
            u.ativo,
            u.deve_trocar_senha,
            u.excluido_em,
            u.perfil_id,
            p.nome AS perfil,
            p.administrativo
       FROM sessoes s
       JOIN usuarios u ON u.id = s.usuario_id
       JOIN perfis p ON p.id = u.perfil_id
      WHERE s.token_hash = $1
        AND s.revogado_em IS NULL
        AND s.expira_em > now()
        AND u.ativo = true
        AND u.excluido_em IS NULL
      LIMIT 1`,
    [tokenHash]
  );
  return rows[0] || null;
}

async function registrarAcesso(sessaoId) {
  await query(
    `UPDATE sessoes
        SET ultimo_acesso_em = now()
      WHERE id = $1
        AND ultimo_acesso_em < now() - interval '5 minutes'`,
    [sessaoId]
  );
}

async function revogarPorHash(tokenHash, motivo) {
  const { rows } = await query(
    `UPDATE sessoes
        SET revogado_em = now(),
            revogado_motivo = $2
      WHERE token_hash = $1
        AND revogado_em IS NULL
      RETURNING id, usuario_id`,
    [tokenHash, motivo]
  );
  return rows[0] || null;
}

async function revogarTodasDoUsuario(usuarioId, motivo) {
  const { rows } = await query(
    `UPDATE sessoes
        SET revogado_em = now(),
            revogado_motivo = $2
      WHERE usuario_id = $1
        AND revogado_em IS NULL
      RETURNING id`,
    [usuarioId, motivo]
  );
  return rows.length;
}

async function contarAtivas() {
  const { rows } = await query(
    `SELECT count(*)::int AS total
       FROM sessoes
      WHERE revogado_em IS NULL
        AND expira_em > now()`
  );
  return rows[0].total;
}

module.exports = {
  criar,
  buscarValidaPorHash,
  registrarAcesso,
  revogarPorHash,
  revogarTodasDoUsuario,
  contarAtivas,
};
