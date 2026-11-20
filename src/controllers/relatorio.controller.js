'use strict';

const relatorioService = require('../services/relatorio.service');

function contexto(req) {
  return {
    ator: req.auth,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };
}

function filtrosDaRequisicao(query) {
  const { inicio, fim, corretor, finalidade, tipo, status } = query;
  return { inicio, fim, corretor, finalidade, tipo, status };
}

async function obterDashboard(req, res) {
  res.json(await relatorioService.obterDashboard(contexto(req)));
}

async function listarCatalogo(req, res) {
  res.json(relatorioService.listarCatalogo(contexto(req)));
}

async function obterOpcoes(req, res) {
  res.json(await relatorioService.obterOpcoes(contexto(req)));
}

async function obterRelatorio(req, res) {
  res.json(
    await relatorioService.obterRelatorio(
      req.params.relatorio,
      filtrosDaRequisicao(req.query),
      contexto(req)
    )
  );
}

async function exportarRelatorio(req, res) {
  const arquivo = await relatorioService.exportarRelatorio(
    req.params.relatorio,
    filtrosDaRequisicao(req.query),
    req.query.formato,
    contexto(req)
  );

  res.set({
    'Content-Type': arquivo.contentType,
    'Content-Disposition': `attachment; filename="${arquivo.nomeArquivo}"`,
    'Cache-Control': 'no-store',
  });
  res.send(arquivo.conteudo);
}

module.exports = {
  obterDashboard,
  listarCatalogo,
  obterOpcoes,
  obterRelatorio,
  exportarRelatorio,
};
