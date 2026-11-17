'use strict';

const { query } = require('../config/database');

const USER_COLUMNS = `
  u.id,
  u.perfil_id,
  u.nome_completo,
  u.email,
  u.senha_hash,
  u.ativo,
  u.deve_trocar_senha,
  u.tentativas_falhas,
  u.bloqueado_ate,
  u.ultimo_acesso_em,
  u.excluido_em,
  p.nome AS perfil,
  p.administrativo
`;

async function buscarPorEmail(email) {
  const { rows } = await query(
    `SELECT ${USER_COLUMNS}
       FROM usuarios u
       JOIN perfis p ON p.id = u.perfil_id
      WHERE u.email = $1
        AND u.excluido_em IS NULL
      LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function buscarPorId(id) {
  const { rows } = await query(
    `SELECT ${USER_COLUMNS}
       FROM usuarios u
       JOIN perfis p ON p.id = u.perfil_id
      WHERE u.id = $1
        AND u.excluido_em IS NULL
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function buscarPermissoesEfetivas(usuarioId, perfilId) {
  const { rows } = await query(
    `WITH efetivas AS (
       SELECT perm.chave
         FROM permissoes perm
         JOIN perfis_permissoes pp
           ON pp.permissao_id = perm.id
          AND pp.perfil_id = $2
         LEFT JOIN permissoes_usuarios pu
           ON pu.usuario_id = $1
          AND pu.permissao_id = perm.id
        WHERE COALESCE(pu.permitido, true) = true
       UNION
       SELECT perm.chave
         FROM permissoes perm
         JOIN permissoes_usuarios pu
           ON pu.permissao_id = perm.id
          AND pu.usuario_id = $1
        WHERE pu.permitido = true
     )
     SELECT chave FROM efetivas ORDER BY chave`,
    [usuarioId, perfilId]
  );
  return rows.map((row) => row.chave);
}

async function limparBloqueioExpirado(usuarioId) {
  await query(
    `UPDATE usuarios
        SET tentativas_falhas = 0,
            bloqueado_ate = NULL
      WHERE id = $1
        AND bloqueado_ate IS NOT NULL
        AND bloqueado_ate <= now()`,
    [usuarioId]
  );
}

async function registrarFalhaLogin(usuarioId, maxAttempts, lockMinutes) {
  const { rows } = await query(
    `UPDATE usuarios
        SET tentativas_falhas = tentativas_falhas + 1,
            bloqueado_ate = CASE
              WHEN tentativas_falhas + 1 >= $2
                THEN now() + ($3::int * interval '1 minute')
              ELSE bloqueado_ate
            END
      WHERE id = $1
      RETURNING tentativas_falhas, bloqueado_ate`,
    [usuarioId, maxAttempts, lockMinutes]
  );
  return rows[0] || null;
}

async function registrarLoginSucesso(usuarioId) {
  await query(
    `UPDATE usuarios
        SET tentativas_falhas = 0,
            bloqueado_ate = NULL,
            ultimo_acesso_em = now()
      WHERE id = $1`,
    [usuarioId]
  );
}

async function atualizarSenha(usuarioId, senhaHash) {
  const { rows } = await query(
    `UPDATE usuarios
        SET senha_hash = $2,
            senha_alterada_em = now(),
            deve_trocar_senha = false,
            tentativas_falhas = 0,
            bloqueado_ate = NULL
      WHERE id = $1
        AND excluido_em IS NULL
      RETURNING id, email`,
    [usuarioId, senhaHash]
  );
  return rows[0] || null;
}

async function criarAdministrador({ nome, email, senhaHash }) {
  const { rows } = await query(
    `INSERT INTO usuarios (perfil_id, nome_completo, email, senha_hash, ativo, senha_alterada_em)
     SELECT p.id, $1, $2, $3, true, now()
       FROM perfis p
      WHERE p.nome = 'Administrador'
     RETURNING id, nome_completo, email`,
    [nome, email, senhaHash]
  );
  return rows[0] || null;
}

module.exports = {
  buscarPorEmail,
  buscarPorId,
  buscarPermissoesEfetivas,
  limparBloqueioExpirado,
  registrarFalhaLogin,
  registrarLoginSucesso,
  atualizarSenha,
  criarAdministrador,
};
