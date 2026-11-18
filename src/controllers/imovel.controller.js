'use strict';

const imovelService = require('../services/imovel.service');
const HttpError = require('../utils/http-error');

function contexto(req) {
  return {
    ator: req.auth,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };
}

async function listarImoveis(req, res) {
  const { busca, tipo, finalidade, situacao, cidade, bairro, valorMin, valorMax, pagina, limite } =
    req.query;

  res.json(
    await imovelService.listarImoveis(
      { busca, tipo, finalidade, situacao, cidade, bairro, valorMin, valorMax, pagina, limite },
      contexto(req)
    )
  );
}

async function listarCorretoresOpcoes(req, res) {
  res.json(await imovelService.listarCorretoresOpcoes(contexto(req)));
}

async function obterImovel(req, res) {
  res.json(await imovelService.obterImovel(req.params.id, contexto(req)));
}

async function obterHistorico(req, res) {
  res.json(await imovelService.obterHistorico(req.params.id, contexto(req)));
}

async function criarImovel(req, res) {
  const imovel = await imovelService.criarImovel(req.body, contexto(req));
  res.status(201).json({ imovel });
}

async function atualizarImovel(req, res) {
  const imovel = await imovelService.atualizarImovel(
    req.params.id,
    req.body,
    contexto(req)
  );
  res.json({ imovel });
}

async function atualizarSituacaoImovel(req, res) {
  if (typeof req.body?.situacao !== 'string' || !req.body.situacao.trim()) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe a situação do imóvel.');
  }

  const imovel = await imovelService.atualizarSituacaoImovel(
    req.params.id,
    req.body.situacao,
    contexto(req)
  );
  res.json({ imovel });
}

async function excluirImovel(req, res) {
  res.json(await imovelService.excluirImovel(req.params.id, contexto(req)));
}

async function enviarImagens(req, res) {
  res.status(201).json(
    await imovelService.enviarImagens(req.params.id, req.files, contexto(req))
  );
}

async function definirImagemPrincipal(req, res) {
  res.json(
    await imovelService.definirImagemPrincipal(
      req.params.id,
      req.params.imagemId,
      contexto(req)
    )
  );
}

async function reordenarImagens(req, res) {
  res.json(
    await imovelService.reordenarImagens(
      req.params.id,
      req.body?.ids,
      contexto(req)
    )
  );
}

async function removerImagem(req, res) {
  res.json(
    await imovelService.removerImagem(
      req.params.id,
      req.params.imagemId,
      contexto(req)
    )
  );
}

async function obterArquivoImagem(req, res, next) {
  const arquivo = await imovelService.obterArquivoImagem(
    req.params.id,
    req.params.imagemId,
    contexto(req)
  );

  res.set('Cache-Control', 'private, max-age=300');
  res.type(arquivo.mimeType);
  res.sendFile(arquivo.caminhoAbsoluto, (error) => {
    if (error && !res.headersSent) next(error);
  });
}

module.exports = {
  listarImoveis,
  listarCorretoresOpcoes,
  obterImovel,
  obterHistorico,
  criarImovel,
  atualizarImovel,
  atualizarSituacaoImovel,
  excluirImovel,
  enviarImagens,
  definirImagemPrincipal,
  reordenarImagens,
  removerImagem,
  obterArquivoImagem,
};
