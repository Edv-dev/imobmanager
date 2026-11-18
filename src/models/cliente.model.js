'use strict';

const { query } = require('../config/database');

const CLIENTE_COLUMNS = `
  cl.id,
  cl.nome_completo,
  cl.cpf,
  cl.telefone,
  cl.whatsapp,
  cl.email,
  cl.endereco,
  cl.tipo_interesse,
  cl.finalidade_desejada,
  cl.faixa_preco_min,
  cl.faixa_preco_max,
  cl.localizacao_desejada,
  cl.observacoes,
  cl.criado_por_usuario_id,
  cl.criado_em,
  cl.atualizado_em
`;

const ATENDIMENTO_COLUMNS = `
  a.id,
  a.cliente_id,
  a.corretor_id,
  a.imovel_id,
  a.tipo,
  a.status,
  a.data_atendimento,
  a.descricao,
  a.observacoes,
  a.criado_por_usuario_id,
  a.criado_em,
  a.atualizado_em
`;

function condicoesListagem({ filtros = {}, visibilidade }) {
  const condicoes = ['cl.excluido_em IS NULL'];
  const params = [...(visibilidade?.params || [])];

  if (visibilidade?.sql) {
    condicoes.push(`(${visibilidade.sql})`);
  }

  if (filtros.busca) {
    params.push(`%${filtros.busca}%`);
    const termos = [
      `cl.nome_completo ILIKE $${params.length}`,
      `cl.email ILIKE $${params.length}`,
      `cl.telefone ILIKE $${params.length}`,
      `cl.whatsapp ILIKE $${params.length}`,
      `cl.localizacao_desejada ILIKE $${params.length}`,
    ];
    const digitos = filtros.busca.replace(/\D/g, '');

    if (digitos) {
      params.push(`%${digitos}%`);
      termos.push(`cl.cpf ILIKE $${params.length}`);
    }

    condicoes.push(`(${termos.join(' OR ')})`);
  }

  if (filtros.tipo) {
    params.push(filtros.tipo);
    condicoes.push(`cl.tipo_interesse = $${params.length}`);
  }

  if (filtros.finalidade) {
    params.push(filtros.finalidade);
    condicoes.push(`cl.finalidade_desejada = $${params.length}`);
  }

  if (filtros.localizacao) {
    params.push(`%${filtros.localizacao}%`);
    condicoes.push(`cl.localizacao_desejada ILIKE $${params.length}`);
  }

  return { where: condicoes.join(' AND '), params };
}

async function listar({ filtros, visibilidade, pagina = 1, limite = 10 }) {
  const { where, params } = condicoesListagem({ filtros, visibilidade });
  const { rows: totais } = await query(
    `SELECT count(*)::int AS total FROM clientes cl WHERE ${where}`,
    params
  );

  const dadosParams = [...params, limite, (pagina - 1) * limite];
  const { rows } = await query(
    `SELECT ${CLIENTE_COLUMNS},
            COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'id', c.id,
                  'nome', c.nome_completo,
                  'creci', c.creci,
                  'principal', cc.principal
                )
                ORDER BY cc.principal DESC, c.nome_completo ASC
              ) FILTER (WHERE c.id IS NOT NULL),
              '[]'::jsonb
            ) AS corretores
       FROM clientes cl
       LEFT JOIN clientes_corretores cc ON cc.cliente_id = cl.id
       LEFT JOIN corretores c
         ON c.id = cc.corretor_id
        AND c.excluido_em IS NULL
      WHERE ${where}
      GROUP BY cl.id
      ORDER BY cl.atualizado_em DESC, cl.id DESC
      LIMIT $${dadosParams.length - 1}
     OFFSET $${dadosParams.length}`,
    dadosParams
  );

  return { clientes: rows, total: totais[0].total };
}

async function buscarPorId(id) {
  const { rows } = await query(
    `SELECT ${CLIENTE_COLUMNS}
       FROM clientes cl
      WHERE cl.id = $1
        AND cl.excluido_em IS NULL
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function buscarPorCpf(cpf, ignorarId = null) {
  const { rows } = await query(
    `SELECT id FROM clientes
      WHERE cpf = $1
        AND excluido_em IS NULL
        AND ($2::bigint IS NULL OR id <> $2)
      LIMIT 1`,
    [cpf, ignorarId]
  );
  return rows[0] || null;
}

async function criar(client, dados) {
  const { rows } = await client.query(
    `INSERT INTO clientes
       (nome_completo, cpf, telefone, whatsapp, email, endereco,
        tipo_interesse, finalidade_desejada, faixa_preco_min, faixa_preco_max,
        localizacao_desejada, observacoes, criado_por_usuario_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id`,
    [
      dados.nome,
      dados.cpf,
      dados.telefone,
      dados.whatsapp,
      dados.email,
      dados.endereco,
      dados.tipoInteresse,
      dados.finalidadeDesejada,
      dados.faixaPrecoMin,
      dados.faixaPrecoMax,
      dados.localizacaoDesejada,
      dados.observacoes,
      dados.criadoPorUsuarioId,
    ]
  );
  return rows[0];
}

async function atualizar(client, clienteId, dados) {
  const { rows } = await client.query(
    `UPDATE clientes
        SET nome_completo = $2,
            cpf = $3,
            telefone = $4,
            whatsapp = $5,
            email = $6,
            endereco = $7,
            tipo_interesse = $8,
            finalidade_desejada = $9,
            faixa_preco_min = $10,
            faixa_preco_max = $11,
            localizacao_desejada = $12,
            observacoes = $13
      WHERE id = $1
        AND excluido_em IS NULL
      RETURNING id`,
    [
      clienteId,
      dados.nome,
      dados.cpf,
      dados.telefone,
      dados.whatsapp,
      dados.email,
      dados.endereco,
      dados.tipoInteresse,
      dados.finalidadeDesejada,
      dados.faixaPrecoMin,
      dados.faixaPrecoMax,
      dados.localizacaoDesejada,
      dados.observacoes,
    ]
  );
  return rows[0] || null;
}

async function excluirLogicamente(client, clienteId) {
  const { rows } = await client.query(
    `UPDATE clientes
        SET excluido_em = now()
      WHERE id = $1
        AND excluido_em IS NULL
      RETURNING id`,
    [clienteId]
  );
  return rows[0] || null;
}

async function listarCorretores(clienteId) {
  const { rows } = await query(
    `SELECT c.id,
            c.nome_completo,
            c.creci,
            c.email,
            c.telefone,
            c.ativo,
            cc.principal
       FROM clientes_corretores cc
       JOIN corretores c ON c.id = cc.corretor_id
      WHERE cc.cliente_id = $1
        AND c.excluido_em IS NULL
      ORDER BY cc.principal DESC, c.nome_completo ASC`,
    [clienteId]
  );
  return rows;
}

async function buscarCorretoresPorIds(ids) {
  if (ids.length === 0) return [];

  const { rows } = await query(
    `SELECT c.id, c.nome_completo, c.ativo
       FROM corretores c
       JOIN usuarios u ON u.id = c.usuario_id
       JOIN perfis p ON p.id = u.perfil_id
      WHERE c.id = ANY($1::bigint[])
        AND c.excluido_em IS NULL
        AND u.excluido_em IS NULL
        AND p.administrativo = false`,
    [ids]
  );
  return rows;
}

async function listarCorretoresDisponiveis() {
  const { rows } = await query(
    `SELECT c.id,
            c.nome_completo,
            c.creci,
            c.email,
            c.ativo,
            u.email AS usuario_email
       FROM corretores c
       JOIN usuarios u ON u.id = c.usuario_id
       JOIN perfis p ON p.id = u.perfil_id
      WHERE c.excluido_em IS NULL
        AND u.excluido_em IS NULL
        AND p.administrativo = false
        AND c.ativo
        AND u.ativo
      ORDER BY c.nome_completo ASC, c.id ASC
      LIMIT 500`
  );
  return rows;
}

async function substituirCorretores(client, clienteId, corretores) {
  await client.query('DELETE FROM clientes_corretores WHERE cliente_id = $1', [clienteId]);

  for (const corretor of corretores) {
    await client.query(
      `INSERT INTO clientes_corretores (cliente_id, corretor_id, principal)
       VALUES ($1, $2, $3)`,
      [clienteId, corretor.id, corretor.principal]
    );
  }
}

async function contarAtendimentos(clienteId) {
  const { rows } = await query(
    `SELECT count(*)::int AS total FROM atendimentos WHERE cliente_id = $1`,
    [clienteId]
  );
  return rows[0].total;
}

async function listarImoveisInteresse(clienteId, visibilidade = null) {
  const condicoes = ['ci.cliente_id = $1', 'i.excluido_em IS NULL'];
  const params = [clienteId];

  if (visibilidade?.sql) {
    condicoes.push(`(${visibilidade.sql})`);
    params.push(...(visibilidade.params || []));
  }

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
            ci.criado_em
       FROM clientes_imoveis_interesse ci
       JOIN imoveis i ON i.id = ci.imovel_id
      WHERE ${condicoes.join(' AND ')}
      ORDER BY ci.criado_em DESC, i.id DESC`,
    params
  );
  return rows;
}

async function buscarImoveisPorIds(ids) {
  if (ids.length === 0) return [];

  const { rows } = await query(
    `SELECT id, codigo_interno, titulo
       FROM imoveis
      WHERE id = ANY($1::bigint[])
        AND excluido_em IS NULL`,
    [ids]
  );
  return rows;
}

async function substituirImoveisInteresse(client, clienteId, ids) {
  await client.query('DELETE FROM clientes_imoveis_interesse WHERE cliente_id = $1', [
    clienteId,
  ]);

  for (const imovelId of ids) {
    await client.query(
      `INSERT INTO clientes_imoveis_interesse (cliente_id, imovel_id)
       VALUES ($1, $2)`,
      [clienteId, imovelId]
    );
  }
}

async function listarImoveisDisponiveis(visibilidade) {
  const condicoes = ['i.excluido_em IS NULL'];
  const params = [...(visibilidade?.params || [])];

  if (visibilidade?.sql) {
    condicoes.push(`(${visibilidade.sql})`);
  }

  const { rows } = await query(
    `SELECT i.id,
            i.codigo_interno,
            i.titulo,
            i.tipo_imovel,
            i.cidade,
            i.bairro,
            i.situacao
       FROM imoveis i
      WHERE ${condicoes.join(' AND ')}
      ORDER BY i.atualizado_em DESC, i.id DESC
      LIMIT 500`,
    params
  );
  return rows;
}

async function buscarCorretorAtivoPorId(corretorId) {
  const { rows } = await query(
    `SELECT c.id, c.nome_completo, c.ativo
       FROM corretores c
       JOIN usuarios u ON u.id = c.usuario_id
       JOIN perfis p ON p.id = u.perfil_id
      WHERE c.id = $1
        AND c.excluido_em IS NULL
        AND u.excluido_em IS NULL
        AND p.administrativo = false
        AND c.ativo
        AND u.ativo
      LIMIT 1`,
    [corretorId]
  );
  return rows[0] || null;
}

async function criarAtendimento(client, dados) {
  const { rows } = await client.query(
    `INSERT INTO atendimentos
       (cliente_id, corretor_id, imovel_id, tipo, status, data_atendimento,
        descricao, observacoes, criado_por_usuario_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${ATENDIMENTO_COLUMNS.replace(/\ba\./g, '')}`,
    [
      dados.clienteId,
      dados.corretorId,
      dados.imovelId,
      dados.tipo,
      dados.status,
      dados.dataAtendimento,
      dados.descricao,
      dados.observacoes,
      dados.criadoPorUsuarioId,
    ]
  );
  return rows[0];
}

async function buscarAtendimentoPorId(atendimentoId) {
  const { rows } = await query(
    `SELECT ${ATENDIMENTO_COLUMNS},
            c.nome_completo AS corretor_nome,
            c.creci AS corretor_creci,
            i.codigo_interno AS imovel_codigo,
            i.titulo AS imovel_titulo
       FROM atendimentos a
       LEFT JOIN corretores c ON c.id = a.corretor_id
       LEFT JOIN imoveis i ON i.id = a.imovel_id
      WHERE a.id = $1
      LIMIT 1`,
    [atendimentoId]
  );
  return rows[0] || null;
}

async function listarAtendimentos(clienteId, limite = 50) {
  const { rows } = await query(
    `SELECT ${ATENDIMENTO_COLUMNS},
            c.nome_completo AS corretor_nome,
            c.creci AS corretor_creci,
            i.codigo_interno AS imovel_codigo,
            i.titulo AS imovel_titulo
       FROM atendimentos a
       LEFT JOIN corretores c ON c.id = a.corretor_id
       LEFT JOIN imoveis i ON i.id = a.imovel_id
      WHERE a.cliente_id = $1
      ORDER BY a.data_atendimento DESC, a.id DESC
      LIMIT $2`,
    [clienteId, limite]
  );
  return rows;
}

module.exports = {
  listar,
  buscarPorId,
  buscarPorCpf,
  criar,
  atualizar,
  excluirLogicamente,
  listarCorretores,
  buscarCorretoresPorIds,
  listarCorretoresDisponiveis,
  substituirCorretores,
  contarAtendimentos,
  listarImoveisInteresse,
  buscarImoveisPorIds,
  substituirImoveisInteresse,
  listarImoveisDisponiveis,
  buscarCorretorAtivoPorId,
  criarAtendimento,
  buscarAtendimentoPorId,
  listarAtendimentos,
};
