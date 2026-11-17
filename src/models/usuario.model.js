'use strict';

const { query, pool } = require('../config/database');
const corretorModel = require('./corretor.model');

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

const ADMIN_COLUMNS = `
  u.id,
  u.nome_completo,
  u.email,
  u.ativo,
  u.deve_trocar_senha,
  u.ultimo_acesso_em,
  u.criado_em,
  u.atualizado_em,
  p.id AS perfil_id,
  p.nome AS perfil,
  p.administrativo,
  c.id AS corretor_id,
  c.cpf AS corretor_cpf,
  c.creci AS corretor_creci,
  c.telefone AS corretor_telefone,
  c.whatsapp AS corretor_whatsapp,
  c.email AS corretor_email,
  c.endereco AS corretor_endereco,
  c.ativo AS corretor_ativo,
  (SELECT count(*)::int
     FROM permissoes_usuarios pu
    WHERE pu.usuario_id = u.id) AS excecoes_permissao
`;

function filtrosAdministrativos({ busca, perfilId, status }) {
  const filtros = ['u.excluido_em IS NULL'];
  const params = [];

  if (busca) {
    params.push(`%${busca}%`);
    filtros.push(
      `(u.nome_completo ILIKE $${params.length} OR u.email ILIKE $${params.length})`
    );
  }

  if (perfilId) {
    params.push(perfilId);
    filtros.push(`u.perfil_id = $${params.length}`);
  }

  if (status === 'ativos') {
    filtros.push('u.ativo = true');
  } else if (status === 'inativos') {
    filtros.push('u.ativo = false');
  }

  return { where: `WHERE ${filtros.join(' AND ')}`, params };
}

async function listarAdministrativo({
  busca = '',
  perfilId = null,
  status = '',
  pagina = 1,
  limite = 10,
} = {}) {
  const { where, params } = filtrosAdministrativos({ busca, perfilId, status });
  const { rows: totais } = await query(
    `SELECT count(*)::int AS total
       FROM usuarios u
       ${where}`,
    params
  );

  const consultaParams = [...params, limite, (pagina - 1) * limite];
  const { rows } = await query(
    `SELECT ${ADMIN_COLUMNS}
       FROM usuarios u
       JOIN perfis p ON p.id = u.perfil_id
       LEFT JOIN corretores c
         ON c.usuario_id = u.id
        AND c.excluido_em IS NULL
       ${where}
      ORDER BY u.nome_completo, u.id
      LIMIT $${consultaParams.length - 1} OFFSET $${consultaParams.length}`,
    consultaParams
  );

  return { usuarios: rows, total: totais[0].total };
}

async function buscarAdministrativoPorId(id) {
  const { rows } = await query(
    `SELECT ${ADMIN_COLUMNS}
       FROM usuarios u
       JOIN perfis p ON p.id = u.perfil_id
       LEFT JOIN corretores c
         ON c.usuario_id = u.id
        AND c.excluido_em IS NULL
      WHERE u.id = $1
        AND u.excluido_em IS NULL
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function listarOpcoes({ somenteNaoAdministrativos = false } = {}) {
  const { rows } = await query(
    `SELECT u.id,
            u.nome_completo,
            u.email,
            u.ativo,
            p.nome AS perfil,
            p.administrativo
       FROM usuarios u
       JOIN perfis p ON p.id = u.perfil_id
      WHERE u.excluido_em IS NULL
        ${somenteNaoAdministrativos ? 'AND p.administrativo = false' : ''}
      ORDER BY u.nome_completo, u.id`
  );
  return rows;
}

async function contarAdminsAtivos(excetoUsuarioId = null) {
  const { rows } = await query(
    `SELECT count(*)::int AS total
       FROM usuarios u
       JOIN perfis p ON p.id = u.perfil_id
      WHERE p.administrativo = true
        AND u.ativo = true
        AND u.excluido_em IS NULL
        AND ($1::bigint IS NULL OR u.id <> $1)`,
    [excetoUsuarioId]
  );
  return rows[0].total;
}

async function criarComCorretor({ usuario, corretor }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO usuarios
         (perfil_id, nome_completo, email, senha_hash, ativo, deve_trocar_senha)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, nome_completo, email`,
      [
        usuario.perfilId,
        usuario.nomeCompleto,
        usuario.email,
        usuario.senhaHash,
        usuario.ativo,
        usuario.deveTrocarSenha,
      ]
    );

    const criado = rows[0];

    if (corretor) {
      await corretorModel.criar(client, {
        usuarioId: criado.id,
        nomeCompleto: usuario.nomeCompleto,
        cpf: corretor.cpf,
        creci: corretor.creci,
        telefone: corretor.telefone,
        whatsapp: corretor.whatsapp,
        email: corretor.email,
        endereco: corretor.endereco,
        ativo: usuario.ativo && corretor.ativo !== false,
      });
    }

    await client.query('COMMIT');
    return criado;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function atualizarComCorretor({
  usuarioId,
  usuario,
  corretor,
  corretorExistenteId = null,
}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE usuarios
          SET perfil_id = $2,
              nome_completo = $3,
              email = $4,
              ativo = $5
        WHERE id = $1
          AND excluido_em IS NULL
        RETURNING id, nome_completo, email, ativo`,
      [usuarioId, usuario.perfilId, usuario.nomeCompleto, usuario.email, usuario.ativo]
    );

    if (!rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    if (corretor) {
      const dadosCorretor = {
        nomeCompleto: usuario.nomeCompleto,
        cpf: corretor.cpf,
        creci: corretor.creci,
        telefone: corretor.telefone,
        whatsapp: corretor.whatsapp,
        email: corretor.email,
        endereco: corretor.endereco,
        ativo: usuario.ativo,
      };

      if (corretorExistenteId) {
        await corretorModel.atualizar(client, corretorExistenteId, dadosCorretor);
      } else {
        await corretorModel.criar(client, {
          usuarioId,
          ...dadosCorretor,
        });
      }
    }

    await client.query('COMMIT');
    return rows[0];
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function atualizarStatus(usuarioId, ativo) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE usuarios
          SET ativo = $2
        WHERE id = $1
          AND excluido_em IS NULL
        RETURNING id, nome_completo, email, ativo`,
      [usuarioId, ativo]
    );

    if (!rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(
      `UPDATE corretores c
          SET ativo = $2
         FROM usuarios u
         JOIN perfis p ON p.id = u.perfil_id
        WHERE c.usuario_id = $1
          AND u.id = $1
          AND c.excluido_em IS NULL
          AND (NOT $2 OR p.administrativo = false)`,
      [usuarioId, ativo]
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

async function redefinirSenhaAdministrativa(usuarioId, senhaHash) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE usuarios
          SET senha_hash = $2,
              senha_alterada_em = now(),
              deve_trocar_senha = true,
              tentativas_falhas = 0,
              bloqueado_ate = NULL
        WHERE id = $1
          AND excluido_em IS NULL
        RETURNING id, nome_completo, email`,
      [usuarioId, senhaHash]
    );

    if (!rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(
      `UPDATE sessoes
          SET revogado_em = now(),
              revogado_motivo = 'senha_redefinida_administrador'
        WHERE usuario_id = $1
          AND revogado_em IS NULL`,
      [usuarioId]
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

async function contarResumo() {
  const { rows } = await query(
    `SELECT
       count(*) FILTER (WHERE u.excluido_em IS NULL)::int AS total,
       count(*) FILTER (WHERE u.excluido_em IS NULL AND u.ativo)::int AS ativos,
       count(*) FILTER (WHERE u.excluido_em IS NULL AND NOT u.ativo)::int AS inativos,
       count(*) FILTER (WHERE u.excluido_em IS NULL AND p.administrativo)::int AS administradores,
       count(DISTINCT c.id) FILTER (WHERE u.excluido_em IS NULL AND c.ativo)::int AS corretores
     FROM usuarios u
     JOIN perfis p ON p.id = u.perfil_id
     LEFT JOIN corretores c
       ON c.usuario_id = u.id
      AND c.excluido_em IS NULL`
  );
  return rows[0];
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
  listarAdministrativo,
  buscarAdministrativoPorId,
  listarOpcoes,
  contarAdminsAtivos,
  criarComCorretor,
  atualizarComCorretor,
  atualizarStatus,
  redefinirSenhaAdministrativa,
  contarResumo,
};
