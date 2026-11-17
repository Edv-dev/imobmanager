'use strict';

const auditoria = require('../models/auditoria.model');
const HttpError = require('../utils/http-error');

const LIMITE_MAXIMO = 50;

async function listarHistorico({ busca = '', tipo = '', pagina = 1, limite = 20 } = {}) {
  const paginaNormalizada = Math.max(1, Number.parseInt(pagina, 10) || 1);
  const limiteNormalizado = Math.min(
    Math.max(1, Number.parseInt(limite, 10) || 20),
    LIMITE_MAXIMO
  );
  const buscaNormalizada = typeof busca === 'string' ? busca.trim().slice(0, 100) : '';
  const tipoNormalizado = typeof tipo === 'string' ? tipo.trim().slice(0, 80) : '';

  if (tipoNormalizado && !/^[a-z][a-z0-9_.]*$/.test(tipoNormalizado)) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Tipo de evento inválido.');
  }

  const [resultado, tipos] = await Promise.all([
    auditoria.listar({
      busca: buscaNormalizada,
      tipo: tipoNormalizado,
      pagina: paginaNormalizada,
      limite: limiteNormalizado,
    }),
    auditoria.listarTipos(),
  ]);

  return {
    eventos: resultado.eventos,
    total: resultado.total,
    pagina: paginaNormalizada,
    limite: limiteNormalizado,
    totalPaginas: Math.max(1, Math.ceil(resultado.total / limiteNormalizado)),
    tipos,
  };
}

module.exports = {
  listarHistorico,
};
