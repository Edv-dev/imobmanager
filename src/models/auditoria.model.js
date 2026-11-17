'use strict';

const { query } = require('../config/database');

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

async function listar({ busca = '', tipo = '', pagina = 1, limite = 20 } = {}) {
  const filtros = [];
  const params = [];

  if (busca) {
    params.push(`%${busca}%`);
    filtros.push(
      `(a.tipo_operacao ILIKE $${params.length} OR a.usuario_email ILIKE $${params.length} OR a.entidade ILIKE $${params.length})`
    );
  }

  if (tipo) {
    params.push(tipo);
    filtros.push(`a.tipo_operacao = $${params.length}`);
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
            a.detalhes
       FROM auditoria a
       ${where}
      ORDER BY a.data_hora DESC, a.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { eventos: rows, total: totais[0].total };
}

async function listarTipos() {
  const { rows } = await query(
    `SELECT DISTINCT tipo_operacao
       FROM auditoria
      ORDER BY tipo_operacao`
  );
  return rows.map((row) => row.tipo_operacao);
}

module.exports = {
  registrar,
  registrarSeguro,
  listar,
  listarTipos,
};
