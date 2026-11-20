'use strict';

const { query } = require('../config/database');

const COLUNAS_DISTRIBUICAO = new Set(['situacao', 'finalidade', 'tipo_imovel']);

function aplicarVisibilidade(condicoes, visibilidade) {
  if (visibilidade?.sql) {
    condicoes.push(`(${visibilidade.sql})`);
  }
}

function aplicarPeriodo(condicoes, params, { inicio, fim }, coluna) {
  if (inicio) {
    params.push(inicio);
    condicoes.push(`${coluna} >= $${params.length}::date`);
  }

  if (fim) {
    params.push(fim);
    condicoes.push(`${coluna} < ($${params.length}::date + INTERVAL '1 day')`);
  }
}

function filtrosImovel({ visibilidade, finalidade, corretorId, inicio, fim }) {
  const condicoes = ['i.excluido_em IS NULL'];
  const params = [...(visibilidade?.params || [])];
  aplicarVisibilidade(condicoes, visibilidade);

  if (finalidade) {
    params.push(finalidade);
    condicoes.push(`i.finalidade = $${params.length}`);
  }

  if (corretorId) {
    params.push(corretorId);
    condicoes.push(`EXISTS (
      SELECT 1
        FROM imoveis_corretores ic
       WHERE ic.imovel_id = i.id
         AND ic.corretor_id = $${params.length}
    )`);
  }

  aplicarPeriodo(condicoes, params, { inicio, fim }, 'i.criado_em');

  return { where: condicoes.join(' AND '), params };
}

function filtrosCliente({ visibilidade, finalidade, corretorId, inicio, fim }) {
  const condicoes = ['cl.excluido_em IS NULL'];
  const params = [...(visibilidade?.params || [])];
  aplicarVisibilidade(condicoes, visibilidade);

  if (finalidade) {
    params.push(finalidade);
    condicoes.push(`cl.finalidade_desejada IN ($${params.length}, 'ambos')`);
  }

  if (corretorId) {
    params.push(corretorId);
    condicoes.push(`EXISTS (
      SELECT 1
        FROM clientes_corretores cc
       WHERE cc.cliente_id = cl.id
         AND cc.corretor_id = $${params.length}
    )`);
  }

  aplicarPeriodo(condicoes, params, { inicio, fim }, 'cl.criado_em');

  return { where: condicoes.join(' AND '), params };
}

function filtrosAtendimento({
  visibilidade,
  busca,
  corretorId,
  tipo,
  status,
  inicio,
  fim,
}) {
  const condicoes = ['cl.excluido_em IS NULL'];
  const params = [...(visibilidade?.params || [])];
  aplicarVisibilidade(condicoes, visibilidade);

  if (busca) {
    params.push(`%${busca}%`);
    const referencia = `$${params.length}`;
    condicoes.push(`(
      cl.nome_completo ILIKE ${referencia}
      OR c.nome_completo ILIKE ${referencia}
      OR i.codigo_interno ILIKE ${referencia}
      OR i.titulo ILIKE ${referencia}
      OR a.descricao ILIKE ${referencia}
    )`);
  }

  if (corretorId) {
    params.push(corretorId);
    condicoes.push(`a.corretor_id = $${params.length}`);
  }

  if (tipo) {
    params.push(tipo);
    condicoes.push(`a.tipo = $${params.length}`);
  }

  if (status) {
    params.push(status);
    condicoes.push(`a.status = $${params.length}`);
  }

  aplicarPeriodo(condicoes, params, { inicio, fim }, 'a.data_atendimento');

  return { where: condicoes.join(' AND '), params };
}

async function resumoImoveis(visibilidade, filtros = {}) {
  const { where, params } = filtrosImovel({ visibilidade, ...filtros });

  const { rows } = await query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE i.situacao = 'disponivel')::int AS disponiveis,
            count(*) FILTER (WHERE i.situacao = 'reservado')::int AS reservados,
            count(*) FILTER (WHERE i.situacao = 'vendido')::int AS vendidos,
            count(*) FILTER (WHERE i.situacao = 'alugado')::int AS alugados,
            count(*) FILTER (WHERE i.situacao = 'inativo')::int AS inativos
       FROM imoveis i
      WHERE ${where}`,
    params
  );

  return rows[0];
}

async function resumoClientes(visibilidade, filtros = {}) {
  const { where, params } = filtrosCliente({ visibilidade, ...filtros });

  const { rows } = await query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE cl.criado_em >= now() - INTERVAL '30 days')::int AS novos_30_dias
       FROM clientes cl
      WHERE ${where}`,
    params
  );

  return rows[0];
}

async function resumoCorretores() {
  const { rows } = await query(
    `SELECT count(*) FILTER (WHERE c.ativo AND u.ativo)::int AS ativos,
            count(*)::int AS total
       FROM corretores c
       JOIN usuarios u ON u.id = c.usuario_id
       JOIN perfis p ON p.id = u.perfil_id
      WHERE c.excluido_em IS NULL
        AND u.excluido_em IS NULL
        AND p.administrativo = false`
  );

  return rows[0];
}

async function resumoAtendimentos(visibilidade) {
  const condicoes = ['cl.excluido_em IS NULL'];
  const params = [...(visibilidade?.params || [])];
  aplicarVisibilidade(condicoes, visibilidade);

  const { rows } = await query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE a.data_atendimento >= now() - INTERVAL '30 days')::int AS ultimos_30_dias,
            count(*) FILTER (WHERE a.status = 'agendado')::int AS agendados
       FROM atendimentos a
       JOIN clientes cl ON cl.id = a.cliente_id
      WHERE ${condicoes.join(' AND ')}`,
    params
  );

  return rows[0];
}

async function distribuicaoImoveis(visibilidade, coluna, filtros = {}) {
  if (!COLUNAS_DISTRIBUICAO.has(coluna)) {
    throw new Error('Coluna de distribuição inválida.');
  }

  const { where, params } = filtrosImovel({ visibilidade, ...filtros });

  const { rows } = await query(
    `SELECT i.${coluna} AS chave,
            count(*)::int AS total,
            round(avg(i.valor_venda) FILTER (WHERE i.valor_venda IS NOT NULL), 2)::float8 AS valor_medio_venda,
            round(avg(i.valor_aluguel) FILTER (WHERE i.valor_aluguel IS NOT NULL), 2)::float8 AS valor_medio_aluguel
       FROM imoveis i
      WHERE ${where}
      GROUP BY i.${coluna}
      ORDER BY total DESC, chave ASC`,
    params
  );

  return rows;
}

async function imoveisPorCorretor(visibilidade, filtros = {}) {
  const { where, params } = filtrosImovel({ visibilidade, ...filtros });

  const { rows } = await query(
    `SELECT c.id AS corretor_id,
            c.nome_completo AS corretor,
            c.creci,
            count(DISTINCT i.id)::int AS total,
            count(DISTINCT i.id) FILTER (WHERE i.situacao = 'disponivel')::int AS disponiveis,
            count(DISTINCT i.id) FILTER (WHERE i.situacao = 'vendido')::int AS vendidos,
            count(DISTINCT i.id) FILTER (WHERE i.situacao = 'alugado')::int AS alugados
       FROM imoveis i
       LEFT JOIN imoveis_corretores ic ON ic.imovel_id = i.id
       LEFT JOIN corretores c
         ON c.id = ic.corretor_id
        AND c.excluido_em IS NULL
      WHERE ${where}
      GROUP BY c.id, c.nome_completo, c.creci
      ORDER BY total DESC, c.nome_completo ASC NULLS LAST`,
    params
  );

  return rows;
}

async function clientesPorCorretor(visibilidade, filtros = {}) {
  const { where, params } = filtrosCliente({ visibilidade, ...filtros });

  const { rows } = await query(
    `SELECT c.id AS corretor_id,
            c.nome_completo AS corretor,
            c.creci,
            count(DISTINCT cl.id)::int AS total,
            count(DISTINCT cl.id) FILTER (WHERE cl.criado_em >= now() - INTERVAL '30 days')::int AS novos_30_dias,
            count(DISTINCT a.id)::int AS atendimentos
       FROM clientes cl
       LEFT JOIN clientes_corretores cc ON cc.cliente_id = cl.id
       LEFT JOIN corretores c
         ON c.id = cc.corretor_id
        AND c.excluido_em IS NULL
       LEFT JOIN atendimentos a
         ON a.cliente_id = cl.id
        AND a.corretor_id = c.id
      WHERE ${where}
      GROUP BY c.id, c.nome_completo, c.creci
      ORDER BY total DESC, c.nome_completo ASC NULLS LAST`,
    params
  );

  return rows;
}

const ATENDIMENTO_SELECT = `
  a.id,
  a.data_atendimento,
  a.tipo,
  a.status,
  a.descricao,
  cl.nome_completo AS cliente,
  c.nome_completo AS corretor,
  i.codigo_interno AS imovel_codigo,
  i.titulo AS imovel_titulo
`;

const ATENDIMENTO_FROM = `
  FROM atendimentos a
  JOIN clientes cl ON cl.id = a.cliente_id
  JOIN corretores c ON c.id = a.corretor_id
  LEFT JOIN imoveis i ON i.id = a.imovel_id
`;

async function listarAtendimentos(visibilidade, filtros = {}, pagina = 1, limite = 20) {
  const { where, params } = filtrosAtendimento({ visibilidade, ...filtros });

  const { rows: totais } = await query(
    `SELECT count(*)::int AS total
       ${ATENDIMENTO_FROM}
      WHERE ${where}`,
    params
  );

  const dadosParams = [...params, limite, (pagina - 1) * limite];
  const { rows } = await query(
    `SELECT ${ATENDIMENTO_SELECT}
       ${ATENDIMENTO_FROM}
      WHERE ${where}
      ORDER BY a.data_atendimento DESC, a.id DESC
      LIMIT $${dadosParams.length - 1}
     OFFSET $${dadosParams.length}`,
    dadosParams
  );

  return { atendimentos: rows, total: totais[0].total };
}

async function atendimentosRecentes(visibilidade, limite = 6) {
  const { where, params } = filtrosAtendimento({ visibilidade });
  params.push(limite);

  const { rows } = await query(
    `SELECT ${ATENDIMENTO_SELECT}
       ${ATENDIMENTO_FROM}
      WHERE ${where}
      ORDER BY a.data_atendimento DESC, a.id DESC
      LIMIT $${params.length}`,
    params
  );

  return rows;
}

async function atendimentosPorMes(visibilidade) {
  const condicoes = [
    'cl.excluido_em IS NULL',
    `a.data_atendimento >= date_trunc('month', now()) - INTERVAL '5 months'`,
  ];
  const params = [...(visibilidade?.params || [])];
  aplicarVisibilidade(condicoes, visibilidade);

  const { rows } = await query(
    `SELECT to_char(date_trunc('month', a.data_atendimento), 'YYYY-MM') AS mes,
            count(*)::int AS total
       FROM atendimentos a
       JOIN clientes cl ON cl.id = a.cliente_id
      WHERE ${condicoes.join(' AND ')}
      GROUP BY 1
      ORDER BY 1`,
    params
  );

  return rows;
}

async function clientesPorMes(visibilidade) {
  const condicoes = [
    'cl.excluido_em IS NULL',
    `cl.criado_em >= date_trunc('month', now()) - INTERVAL '5 months'`,
  ];
  const params = [...(visibilidade?.params || [])];
  aplicarVisibilidade(condicoes, visibilidade);

  const { rows } = await query(
    `SELECT to_char(date_trunc('month', cl.criado_em), 'YYYY-MM') AS mes,
            count(*)::int AS total
       FROM clientes cl
      WHERE ${condicoes.join(' AND ')}
      GROUP BY 1
      ORDER BY 1`,
    params
  );

  return rows;
}

async function buscarCorretorNome(corretorId) {
  const { rows } = await query(
    `SELECT id, nome_completo, creci
       FROM corretores
      WHERE id = $1
        AND excluido_em IS NULL
      LIMIT 1`,
    [corretorId]
  );

  return rows[0] || null;
}

async function listarCorretoresOpcoes() {
  const { rows } = await query(
    `SELECT c.id, c.nome_completo, c.creci
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

module.exports = {
  resumoImoveis,
  resumoClientes,
  resumoCorretores,
  resumoAtendimentos,
  distribuicaoImoveis,
  imoveisPorCorretor,
  clientesPorCorretor,
  listarAtendimentos,
  atendimentosRecentes,
  atendimentosPorMes,
  clientesPorMes,
  buscarCorretorNome,
  listarCorretoresOpcoes,
};
