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

module.exports = {
  registrar,
  registrarSeguro,
};
