'use strict';

const auditoria = require('../models/auditoria.model');

const ADMIN_ENTITY = 'administracao';

function contexto(ator) {
  return {
    usuarioId: ator?.usuario?.id ?? null,
    usuarioEmail: ator?.usuario?.email ?? null,
  };
}

async function registrarAdmin({
  ator,
  ip,
  userAgent,
  tipoOperacao,
  entidade = ADMIN_ENTITY,
  registroId = null,
  resultado = 'sucesso',
  detalhes = {},
}) {
  await auditoria.registrarSeguro({
    ...contexto(ator),
    tipoOperacao,
    entidade,
    registroId,
    resultado,
    ip,
    userAgent,
    detalhes,
  });
}

module.exports = {
  registrarAdmin,
};
