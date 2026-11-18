'use strict';

const corretorService = require('../services/corretor.service');
const HttpError = require('../utils/http-error');

function contexto(req) {
  return {
    ator: req.auth,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };
}

async function listarCorretores(req, res) {
  const { busca, status, pagina, limite } = req.query;
  res.json(
    await corretorService.listarCorretores(
      { busca, status, pagina, limite },
      contexto(req)
    )
  );
}

async function listarUsuariosDisponiveis(req, res) {
  res.json({
    usuarios: await corretorService.listarUsuariosDisponiveis(contexto(req)),
  });
}

async function obterResumo(req, res) {
  res.json(await corretorService.obterResumo(contexto(req)));
}

async function obterCorretor(req, res) {
  res.json(await corretorService.obterCorretor(req.params.id, contexto(req)));
}

async function criarCorretor(req, res) {
  const corretor = await corretorService.criarCorretor(req.body, contexto(req));
  res.status(201).json({ corretor });
}

async function atualizarCorretor(req, res) {
  const corretor = await corretorService.atualizarCorretor(
    req.params.id,
    req.body,
    contexto(req)
  );
  res.json({ corretor });
}

async function atualizarStatusCorretor(req, res) {
  if (typeof req.body?.ativo !== 'boolean') {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe o campo "ativo" como booleano.');
  }

  const corretor = await corretorService.atualizarStatusCorretor(
    req.params.id,
    req.body.ativo,
    contexto(req)
  );
  res.json({ corretor });
}

module.exports = {
  listarCorretores,
  listarUsuariosDisponiveis,
  obterResumo,
  obterCorretor,
  criarCorretor,
  atualizarCorretor,
  atualizarStatusCorretor,
};
