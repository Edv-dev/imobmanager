'use strict';

const atendimentoService = require('../services/atendimento.service');

function contexto(req) {
  return {
    ator: req.auth,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };
}

async function listarAtendimentos(req, res) {
  const { busca, tipo, status, corretor, inicio, fim, pagina, limite } = req.query;

  res.json(
    await atendimentoService.listarAtendimentos(
      { busca, tipo, status, corretor, inicio, fim, pagina, limite },
      contexto(req)
    )
  );
}

module.exports = {
  listarAtendimentos,
};
