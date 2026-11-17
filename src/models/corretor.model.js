'use strict';

const { query } = require('../config/database');

const CORRETOR_COLUMNS = `
  c.id,
  c.usuario_id,
  c.nome_completo,
  c.cpf,
  c.creci,
  c.telefone,
  c.whatsapp,
  c.email,
  c.endereco,
  c.ativo,
  c.criado_em,
  c.atualizado_em
`;

async function buscarPorUsuario(usuarioId) {
  const { rows } = await query(
    `SELECT ${CORRETOR_COLUMNS}
       FROM corretores c
      WHERE c.usuario_id = $1
        AND c.excluido_em IS NULL
      LIMIT 1`,
    [usuarioId]
  );
  return rows[0] || null;
}

async function buscarPorCpf(cpf, ignorarUsuarioId = null) {
  const { rows } = await query(
    `SELECT id, usuario_id FROM corretores
      WHERE cpf = $1
        AND excluido_em IS NULL
        AND ($2::bigint IS NULL OR usuario_id <> $2)
      LIMIT 1`,
    [cpf, ignorarUsuarioId]
  );
  return rows[0] || null;
}

async function buscarPorCreci(creci, ignorarUsuarioId = null) {
  const { rows } = await query(
    `SELECT id, usuario_id FROM corretores
      WHERE lower(btrim(creci)) = lower(btrim($1))
        AND excluido_em IS NULL
        AND ($2::bigint IS NULL OR usuario_id <> $2)
      LIMIT 1`,
    [creci, ignorarUsuarioId]
  );
  return rows[0] || null;
}

async function buscarPorEmail(email, ignorarUsuarioId = null) {
  if (!email) return null;

  const { rows } = await query(
    `SELECT id, usuario_id FROM corretores
      WHERE email = $1
        AND excluido_em IS NULL
        AND ($2::bigint IS NULL OR usuario_id <> $2)
      LIMIT 1`,
    [email, ignorarUsuarioId]
  );
  return rows[0] || null;
}

async function criar(client, dados) {
  const { rows } = await client.query(
    `INSERT INTO corretores
       (usuario_id, nome_completo, cpf, creci, telefone, whatsapp, email, endereco, ativo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, usuario_id, cpf, creci`,
    [
      dados.usuarioId,
      dados.nomeCompleto,
      dados.cpf,
      dados.creci,
      dados.telefone,
      dados.whatsapp,
      dados.email,
      dados.endereco,
      dados.ativo,
    ]
  );
  return rows[0];
}

async function atualizar(client, corretorId, dados) {
  const { rows } = await client.query(
    `UPDATE corretores
        SET nome_completo = $2,
            cpf = $3,
            creci = $4,
            telefone = $5,
            whatsapp = $6,
            email = $7,
            endereco = $8,
            ativo = $9
      WHERE id = $1
        AND excluido_em IS NULL
      RETURNING id, usuario_id, cpf, creci`,
    [
      corretorId,
      dados.nomeCompleto,
      dados.cpf,
      dados.creci,
      dados.telefone,
      dados.whatsapp,
      dados.email,
      dados.endereco,
      dados.ativo,
    ]
  );
  return rows[0] || null;
}

module.exports = {
  buscarPorUsuario,
  buscarPorCpf,
  buscarPorCreci,
  buscarPorEmail,
  criar,
  atualizar,
};
