'use strict';

const usuariosService = require('../services/admin-usuarios.service');
const permissoesService = require('../services/admin-permissoes.service');
const configuracoesService = require('../services/configuracoes.service');
const acessoService = require('../services/acesso.service');
const auditoriaService = require('../services/auditoria.service');
const lgpdService = require('../services/lgpd.service');
const HttpError = require('../utils/http-error');

function contexto(req) {
  return {
    ator: req.auth,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };
}

async function resumo(req, res) {
  res.json(await usuariosService.obterResumo());
}

async function listarUsuarios(req, res) {
  const { busca, perfilId, status, pagina, limite } = req.query;
  res.json(await usuariosService.listarUsuarios({ busca, perfilId, status, pagina, limite }));
}

async function listarOpcoesUsuarios(req, res) {
  const somenteNaoAdministrativos = ['1', 'true', 'sim'].includes(
    String(req.query.somenteNaoAdministrativos || '').toLowerCase()
  );
  res.json({
    usuarios: await usuariosService.listarOpcoes({ somenteNaoAdministrativos }),
  });
}

async function listarOpcoesPerfis(req, res) {
  res.json({ perfis: await usuariosService.listarOpcoesPerfis() });
}

async function obterUsuario(req, res) {
  res.json({ usuario: await usuariosService.obterUsuario(req.params.id) });
}

async function criarUsuario(req, res) {
  const usuario = await usuariosService.criarUsuario(req.body, contexto(req));
  res.status(201).json({ usuario });
}

async function atualizarUsuario(req, res) {
  const usuario = await usuariosService.atualizarUsuario(
    req.params.id,
    req.body,
    contexto(req)
  );
  res.json({ usuario });
}

async function atualizarStatusUsuario(req, res) {
  if (typeof req.body?.ativo !== 'boolean') {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe o campo "ativo" como booleano.');
  }

  const usuario = await usuariosService.atualizarStatus(
    req.params.id,
    req.body.ativo,
    contexto(req)
  );
  res.json({ usuario });
}

async function redefinirSenhaUsuario(req, res) {
  const resultado = await usuariosService.redefinirSenhaUsuario(
    req.params.id,
    req.body?.novaSenha,
    contexto(req)
  );
  res.json(resultado);
}

async function listarPerfis(req, res) {
  res.json(await permissoesService.obterMatrizPerfis());
}

async function salvarPermissoesPerfil(req, res) {
  const resultado = await permissoesService.salvarPermissoesPerfil(
    req.params.id,
    req.body?.permissoes,
    contexto(req)
  );
  res.json(resultado);
}

async function obterPermissoesUsuario(req, res) {
  res.json(await permissoesService.obterPermissoesUsuario(req.params.id));
}

async function salvarPermissoesUsuario(req, res) {
  const resultado = await permissoesService.salvarPermissoesUsuario(
    req.params.id,
    req.body?.excecoes,
    contexto(req)
  );
  res.json(resultado);
}

async function obterConfiguracoes(req, res) {
  res.json(await configuracoesService.obterConfiguracoes());
}

async function salvarVisibilidade(req, res) {
  const configuracoes = await configuracoesService.salvarVisibilidade(
    req.body,
    contexto(req)
  );
  res.json(configuracoes);
}

async function obterAcessosUsuario(req, res) {
  res.json(await acessoService.obterAcessosUsuario(req.params.id));
}

async function salvarAcessosUsuario(req, res) {
  const resultado = await acessoService.salvarAcessosUsuario(
    req.params.id,
    req.body,
    contexto(req)
  );
  res.json(resultado);
}

async function listarRecursos(req, res) {
  res.json(await acessoService.listarRecursosParaExcecoes());
}

async function listarAuditoria(req, res) {
  res.json(await auditoriaService.listarHistorico(req.query));
}

async function obterRetencaoAuditoria(req, res) {
  res.json(await auditoriaService.obterRetencao(contexto(req)));
}

async function salvarRetencaoAuditoria(req, res) {
  res.json(await auditoriaService.salvarRetencao(req.body?.dias, contexto(req)));
}

async function executarRetencaoAuditoria(req, res) {
  res.json(await auditoriaService.executarRetencao(contexto(req)));
}

async function obterResumoLgpd(req, res) {
  res.json(await lgpdService.obterResumo(contexto(req)));
}

async function buscarClientesLgpd(req, res) {
  res.json(await lgpdService.buscarClientes(req.query?.busca, contexto(req)));
}

async function exportarDadosLgpd(req, res) {
  const arquivo = await lgpdService.exportarDadosCliente(req.params.id, contexto(req));

  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${arquivo.nomeArquivo}"`);
  res.send(arquivo.conteudo);
}

async function anonimizarClienteLgpd(req, res) {
  res.json({
    resultado: await lgpdService.anonimizarCliente(req.params.id, req.body, contexto(req)),
  });
}

module.exports = {
  resumo,
  listarUsuarios,
  listarOpcoesUsuarios,
  listarOpcoesPerfis,
  obterUsuario,
  criarUsuario,
  atualizarUsuario,
  atualizarStatusUsuario,
  redefinirSenhaUsuario,
  listarPerfis,
  salvarPermissoesPerfil,
  obterPermissoesUsuario,
  salvarPermissoesUsuario,
  obterConfiguracoes,
  salvarVisibilidade,
  obterAcessosUsuario,
  salvarAcessosUsuario,
  listarRecursos,
  listarAuditoria,
  obterRetencaoAuditoria,
  salvarRetencaoAuditoria,
  executarRetencaoAuditoria,
  obterResumoLgpd,
  buscarClientesLgpd,
  exportarDadosLgpd,
  anonimizarClienteLgpd,
};
