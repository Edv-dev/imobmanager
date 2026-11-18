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

const DETALHE_COLUMNS = `
  ${CORRETOR_COLUMNS},
  u.nome_completo AS usuario_nome,
  u.email AS usuario_email,
  u.ativo AS usuario_ativo,
  u.criado_em AS usuario_criado_em,
  p.nome AS perfil
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

function filtrosListagem({ busca = '', status = '' } = {}) {
  const filtros = [
    'c.excluido_em IS NULL',
    'u.excluido_em IS NULL',
    'p.administrativo = false',
  ];
  const params = [];
  const termo = typeof busca === 'string' ? busca.trim() : '';

  if (termo) {
    params.push(`%${termo}%`);
    const condicoes = [
      `c.nome_completo ILIKE $${params.length}`,
      `c.creci ILIKE $${params.length}`,
      `c.email ILIKE $${params.length}`,
      `u.email ILIKE $${params.length}`,
      `u.nome_completo ILIKE $${params.length}`,
    ];
    const digitos = termo.replace(/\D/g, '');

    if (digitos) {
      params.push(`%${digitos}%`);
      condicoes.push(`c.cpf ILIKE $${params.length}`);
    }

    filtros.push(`(${condicoes.join(' OR ')})`);
  }

  if (typeof status === 'boolean') {
    params.push(status);
    filtros.push(`c.ativo = $${params.length}`);
  }

  return { where: filtros.join(' AND '), params };
}

async function listar({ busca = '', status = '', pagina = 1, limite = 10 } = {}) {
  const { where, params } = filtrosListagem({ busca, status });

  const { rows: totais } = await query(
    `SELECT count(*)::int AS total
       FROM corretores c
       JOIN usuarios u ON u.id = c.usuario_id
       JOIN perfis p ON p.id = u.perfil_id
      WHERE ${where}`,
    params
  );

  const dadosParams = [...params, limite, (pagina - 1) * limite];
  const { rows } = await query(
    `SELECT ${DETALHE_COLUMNS}
       FROM corretores c
       JOIN usuarios u ON u.id = c.usuario_id
       JOIN perfis p ON p.id = u.perfil_id
      WHERE ${where}
      ORDER BY c.ativo DESC, c.nome_completo ASC, c.id ASC
      LIMIT $${dadosParams.length - 1}
     OFFSET $${dadosParams.length}`,
    dadosParams
  );

  return { corretores: rows, total: totais[0].total };
}

async function buscarDetalhadoPorId(id) {
  const { rows } = await query(
    `SELECT ${DETALHE_COLUMNS}
       FROM corretores c
       JOIN usuarios u ON u.id = c.usuario_id
       JOIN perfis p ON p.id = u.perfil_id
      WHERE c.id = $1
        AND c.excluido_em IS NULL
        AND u.excluido_em IS NULL
        AND p.administrativo = false
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function listarUsuariosDisponiveis() {
  const { rows } = await query(
    `SELECT u.id, u.nome_completo, u.email, u.ativo, p.nome AS perfil
       FROM usuarios u
       JOIN perfis p ON p.id = u.perfil_id
       LEFT JOIN corretores c
         ON c.usuario_id = u.id
        AND c.excluido_em IS NULL
      WHERE u.excluido_em IS NULL
        AND p.administrativo = false
        AND c.id IS NULL
      ORDER BY u.ativo DESC, u.nome_completo ASC, u.id ASC
      LIMIT 200`
  );
  return rows;
}

async function buscarUsuarioVinculavel(usuarioId) {
  const { rows } = await query(
    `SELECT u.id,
            u.nome_completo,
            u.email,
            u.ativo,
            p.nome AS perfil,
            p.administrativo,
            EXISTS (
              SELECT 1
                FROM corretores c
               WHERE c.usuario_id = u.id
                 AND c.excluido_em IS NULL
            ) AS possui_corretor
       FROM usuarios u
       JOIN perfis p ON p.id = u.perfil_id
      WHERE u.id = $1
        AND u.excluido_em IS NULL
      LIMIT 1`,
    [usuarioId]
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

async function atualizarStatus(client, corretorId, ativo) {
  const { rows } = await client.query(
    `UPDATE corretores
        SET ativo = $2
      WHERE id = $1
        AND excluido_em IS NULL
      RETURNING id, usuario_id`,
    [corretorId, ativo]
  );
  return rows[0] || null;
}

async function atualizarNomeUsuario(client, usuarioId, nomeCompleto) {
  await client.query(
    `UPDATE usuarios
        SET nome_completo = $2
      WHERE id = $1
        AND excluido_em IS NULL`,
    [usuarioId, nomeCompleto]
  );
}

async function atualizarAtivoUsuario(client, usuarioId, ativo) {
  await client.query(
    `UPDATE usuarios
        SET ativo = $2
      WHERE id = $1
        AND excluido_em IS NULL`,
    [usuarioId, ativo]
  );
}

async function listarImoveisVinculados(corretorId, filtro, limite = 50) {
  const { rows } = await query(
    `SELECT i.id,
            i.codigo_interno,
            i.titulo,
            i.tipo_imovel,
            i.finalidade,
            i.cidade,
            i.bairro,
            i.situacao,
            i.valor_venda,
            i.valor_aluguel,
            i.criado_em,
            ic.principal
       FROM imoveis_corretores ic
       JOIN imoveis i ON i.id = ic.imovel_id
      WHERE ic.corretor_id = $1
        AND i.excluido_em IS NULL
        AND (${filtro.sql})
      ORDER BY ic.principal DESC, i.criado_em DESC, i.id DESC
      LIMIT ${limite}`,
    [corretorId, ...filtro.params]
  );
  return rows;
}

async function contarImoveisVinculados(corretorId, filtro) {
  const { rows } = await query(
    `SELECT count(*)::int AS total
       FROM imoveis_corretores ic
       JOIN imoveis i ON i.id = ic.imovel_id
      WHERE ic.corretor_id = $1
        AND i.excluido_em IS NULL
        AND (${filtro.sql})`,
    [corretorId, ...filtro.params]
  );
  return rows[0].total;
}

async function listarClientesVinculados(corretorId, filtro, limite = 50) {
  const { rows } = await query(
    `SELECT cl.id,
            cl.nome_completo,
            cl.telefone,
            cl.whatsapp,
            cl.email,
            cl.finalidade_desejada,
            cl.localizacao_desejada,
            cl.criado_em,
            cc.principal
       FROM clientes_corretores cc
       JOIN clientes cl ON cl.id = cc.cliente_id
      WHERE cc.corretor_id = $1
        AND cl.excluido_em IS NULL
        AND (${filtro.sql})
      ORDER BY cc.principal DESC, cl.criado_em DESC, cl.id DESC
      LIMIT ${limite}`,
    [corretorId, ...filtro.params]
  );
  return rows;
}

async function contarClientesVinculados(corretorId, filtro) {
  const { rows } = await query(
    `SELECT count(*)::int AS total
       FROM clientes_corretores cc
       JOIN clientes cl ON cl.id = cc.cliente_id
      WHERE cc.corretor_id = $1
        AND cl.excluido_em IS NULL
        AND (${filtro.sql})`,
    [corretorId, ...filtro.params]
  );
  return rows[0].total;
}

async function contarResumo() {
  const { rows } = await query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE c.ativo)::int AS ativos,
            count(*) FILTER (WHERE NOT c.ativo)::int AS inativos
       FROM corretores c
       JOIN usuarios u ON u.id = c.usuario_id
       JOIN perfis p ON p.id = u.perfil_id
      WHERE c.excluido_em IS NULL
        AND u.excluido_em IS NULL
        AND p.administrativo = false`
  );
  return rows[0];
}

module.exports = {
  buscarPorUsuario,
  buscarPorCpf,
  buscarPorCreci,
  buscarPorEmail,
  listar,
  buscarDetalhadoPorId,
  listarUsuariosDisponiveis,
  buscarUsuarioVinculavel,
  criar,
  atualizar,
  atualizarStatus,
  atualizarNomeUsuario,
  atualizarAtivoUsuario,
  listarImoveisVinculados,
  contarImoveisVinculados,
  listarClientesVinculados,
  contarClientesVinculados,
  contarResumo,
};
