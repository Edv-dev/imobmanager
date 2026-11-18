'use strict';

const clienteService = require('../services/cliente.service');

function contexto(req) {
  return {
    ator: req.auth,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };
}

async function listarClientes(req, res) {
  const { busca, tipo, finalidade, localizacao, pagina, limite } = req.query;
  res.json(
    await clienteService.listarClientes(
      { busca, tipo, finalidade, localizacao, pagina, limite },
      contexto(req)
    )
  );
}

async function listarCorretoresOpcoes(req, res) {
  res.json(await clienteService.listarCorretoresOpcoes(contexto(req)));
}

async function listarImoveisOpcoes(req, res) {
  res.json(await clienteService.listarImoveisOpcoes(contexto(req)));
}

async function obterCliente(req, res) {
  res.json(await clienteService.obterCliente(req.params.id, contexto(req)));
}

async function obterHistorico(req, res) {
  res.json(await clienteService.obterHistorico(req.params.id, contexto(req)));
}

async function criarCliente(req, res) {
  res.status(201).json(await clienteService.criarCliente(req.body, contexto(req)));
}

async function atualizarCliente(req, res) {
  res.json(
    await clienteService.atualizarCliente(req.params.id, req.body, contexto(req))
  );
}

async function excluirCliente(req, res) {
  res.json(await clienteService.excluirCliente(req.params.id, contexto(req)));
}

async function registrarAtendimento(req, res) {
  res.status(201).json(
    await clienteService.registrarAtendimento(
      req.params.id,
      req.body,
      contexto(req)
    )
  );
}

module.exports = {
  listarClientes,
  listarCorretoresOpcoes,
  listarImoveisOpcoes,
  obterCliente,
  obterHistorico,
  criarCliente,
  atualizarCliente,
  excluirCliente,
  registrarAtendimento,
};
