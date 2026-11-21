'use strict';

const { pool, query } = require('../config/database');

function normalizarIp(ip) {
  if (typeof ip !== 'string' || ip.trim() === '') return null;
  const normalizado = ip.trim().replace(/^::ffff:/i, '');
  return normalizado.length <= 64 ? normalizado : null;
}

async function registrar({
  usuarioId = null,
  usuarioEmail = null,
  tipoOperacao,
  entidade = 'auth',
  registroId = null,
  resultado,
  ip = null,
  userAgent = null,
  detalhes = {},
}) {
  await query(
    `INSERT INTO auditoria
       (usuario_id, usuario_email, tipo_operacao, entidade, registro_id, resultado, ip, user_agent, detalhes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      usuarioId,
      usuarioEmail,
      tipoOperacao,
      entidade,
      registroId,
      resultado,
      normalizarIp(ip),
      userAgent,
      JSON.stringify(detalhes),
    ]
  );
}

async function registrarSeguro(evento) {
  try {
    await registrar(evento);
  } catch (error) {
    console.error(`[auditoria] Falha ao registrar ${evento.tipoOperacao}:`, error.message);
  }
}

async function listar({
  busca = '',
  tipo = '',
  resultado = '',
  entidade = '',
  usuarioId = null,
  inicio = null,
  fim = null,
  pagina = 1,
  limite = 20,
} = {}) {
  const filtros = [];
  const params = [];

  if (busca) {
    params.push(`%${busca}%`);
    filtros.push(
      `(a.tipo_operacao ILIKE $${params.length} OR a.usuario_email ILIKE $${params.length} OR a.entidade ILIKE $${params.length} OR a.registro_id ILIKE $${params.length})`
    );
  }

  if (tipo) {
    params.push(tipo);
    filtros.push(`a.tipo_operacao = $${params.length}`);
  }

  if (resultado) {
    params.push(resultado);
    filtros.push(`a.resultado = $${params.length}`);
  }

  if (entidade) {
    params.push(entidade);
    filtros.push(`a.entidade = $${params.length}`);
  }

  if (usuarioId) {
    params.push(usuarioId);
    filtros.push(`a.usuario_id = $${params.length}`);
  }

  if (inicio) {
    params.push(inicio);
    filtros.push(`a.data_hora >= $${params.length}::date`);
  }

  if (fim) {
    params.push(fim);
    filtros.push(`a.data_hora < ($${params.length}::date + INTERVAL '1 day')`);
  }

  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const offset = (pagina - 1) * limite;

  const countParams = [...params];
  const { rows: totais } = await query(
    `SELECT count(*)::int AS total FROM auditoria a ${where}`,
    countParams
  );

  params.push(limite, offset);
  const { rows } = await query(
    `SELECT a.id,
            a.usuario_id,
            a.usuario_email,
            a.data_hora,
            a.tipo_operacao,
            a.entidade,
            a.registro_id,
            a.resultado,
            a.ip,
            a.user_agent,
            a.detalhes
       FROM auditoria a
       ${where}
      ORDER BY a.data_hora DESC, a.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { eventos: rows, total: totais[0].total };
}

async function listarPorRegistro(entidade, registroId, limite = 50) {
  const { rows } = await query(
    `SELECT a.id,
            a.usuario_email,
            a.data_hora,
            a.tipo_operacao,
            a.resultado,
            a.detalhes
       FROM auditoria a
      WHERE a.entidade = $1
        AND a.registro_id = $2
      ORDER BY a.data_hora DESC, a.id DESC
      LIMIT $3`,
    [entidade, String(registroId), limite]
  );
  return rows;
}

async function listarTipos() {
  const { rows } = await query(
    `SELECT DISTINCT tipo_operacao
       FROM auditoria
      ORDER BY tipo_operacao`
  );
  return rows.map((row) => row.tipo_operacao);
}

async function listarEventosLgpd(limite = 10) {
  const { rows } = await query(
    `SELECT a.id,
            a.usuario_email,
            a.data_hora,
            a.tipo_operacao,
            a.registro_id,
            a.resultado,
            a.detalhes
       FROM auditoria a
      WHERE a.tipo_operacao IN ('lgpd.cliente_exportado', 'lgpd.cliente_anonimizado')
      ORDER BY a.data_hora DESC, a.id DESC
      LIMIT $1`,
    [limite]
  );
  return rows;
}

async function contarAnteriores(dias) {
  const { rows } = await query(
    `SELECT count(*)::int AS total
       FROM auditoria
      WHERE data_hora < now() - ($1::int * INTERVAL '1 day')`,
    [dias]
  );
  return rows[0].total;
}

async function expurgarAntigos(dias) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT set_config('imobmanager.auditoria_manutencao', 'on', true)"
    );
    const { rows } = await client.query(
      `DELETE FROM auditoria
        WHERE data_hora < now() - ($1::int * INTERVAL '1 day')
       RETURNING id`,
      [dias]
    );
    await client.query('COMMIT');
    return rows.length;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function redigirDetalhesCliente(client, clienteId, chaves) {
  await client.query(
    "SELECT set_config('imobmanager.auditoria_manutencao', 'on', true)"
  );
  const { rowCount } = await client.query(
    `UPDATE auditoria
        SET detalhes = detalhes - $2::text[]
      WHERE entidade = 'clientes'
        AND registro_id = $1
        AND detalhes <> '{}'::jsonb`,
    [String(clienteId), chaves]
  );
  return rowCount;
}

module.exports = {
  registrar,
  registrarSeguro,
  listar,
  listarPorRegistro,
  listarTipos,
  listarEventosLgpd,
  contarAnteriores,
  expurgarAntigos,
  redigirDetalhesCliente,
};
