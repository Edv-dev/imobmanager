'use strict';

const auditoria = require('../models/auditoria.model');
const configuracaoModel = require('../models/configuracao.model');
const HttpError = require('../utils/http-error');
const { garantirPermissao } = require('../utils/authorization');

const LIMITE_MAXIMO = 50;
const RETENCAO_PADRAO = 365;
const RETENCAO_MINIMA = 30;
const RETENCAO_MAXIMA = 3650;
const RESULTADOS = new Set(['sucesso', 'falha']);

function texto(valor, limite) {
  return typeof valor === 'string' ? valor.trim().slice(0, limite) : '';
}

function normalizarData(valor, rotulo) {
  if (valor === undefined || valor === null || valor === '') return null;

  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new HttpError(422, 'VALIDATION_ERROR', `${rotulo} inválida.`);
  }

  const data = new Date(`${valor}T00:00:00.000Z`);

  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor) {
    throw new HttpError(422, 'VALIDATION_ERROR', `${rotulo} inválida.`);
  }

  return valor;
}

function normalizarFiltros(filtros = {}) {
  const inicio = normalizarData(filtros.inicio, 'Data inicial');
  const fim = normalizarData(filtros.fim, 'Data final');

  if (inicio && fim && inicio > fim) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'A data inicial não pode ser posterior à data final.'
    );
  }

  const resultado = texto(filtros.resultado, 10);

  if (resultado && !RESULTADOS.has(resultado)) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Resultado do evento inválido.');
  }

  const entidade = texto(filtros.entidade, 60);

  if (entidade && !/^[a-z][a-z0-9_.]*$/.test(entidade)) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Entidade do evento inválida.');
  }

  let usuarioId = null;

  if (filtros.usuarioId !== undefined && filtros.usuarioId !== null && filtros.usuarioId !== '') {
    usuarioId = Number.parseInt(filtros.usuarioId, 10);

    if (!Number.isInteger(usuarioId) || usuarioId < 1) {
      throw new HttpError(422, 'VALIDATION_ERROR', 'Usuário inválido.');
    }
  }

  return {
    busca: texto(filtros.busca, 100),
    tipo: texto(filtros.tipo, 80),
    resultado,
    entidade,
    usuarioId,
    inicio,
    fim,
  };
}

function caminhoSeguro(req) {
  const caminho = typeof req.originalUrl === 'string' ? req.originalUrl : '';
  return caminho.split('?')[0].slice(0, 160) || null;
}

async function listarHistorico(filtros = {}) {
  const normalizados = normalizarFiltros(filtros);
  const paginaNormalizada = Math.max(1, Number.parseInt(filtros.pagina, 10) || 1);
  const limiteNormalizado = Math.min(
    Math.max(1, Number.parseInt(filtros.limite, 10) || 20),
    LIMITE_MAXIMO
  );

  if (normalizados.tipo && !/^[a-z][a-z0-9_.]*$/.test(normalizados.tipo)) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Tipo de evento inválido.');
  }

  const [resultado, tipos] = await Promise.all([
    auditoria.listar({
      ...normalizados,
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

async function registrarAcessoNegado(req, { motivo, permissao = null, status, code = null }) {
  const rota = caminhoSeguro(req);

  await auditoria.registrarSeguro({
    usuarioId: req.auth?.usuario?.id ?? null,
    usuarioEmail: req.auth?.usuario?.email ?? null,
    tipoOperacao: 'seguranca.acesso_negado',
    entidade: 'api',
    registroId: rota,
    resultado: 'falha',
    ip: req.ip,
    userAgent: req.get('user-agent'),
    detalhes: {
      metodo: req.method,
      rota,
      motivo,
      permissao,
      status,
      codigo: code,
    },
  });
}

async function registrarCsrfInvalido(req) {
  const rota = caminhoSeguro(req);

  await auditoria.registrarSeguro({
    usuarioId: req.auth?.usuario?.id ?? null,
    usuarioEmail: req.auth?.usuario?.email ?? null,
    tipoOperacao: 'seguranca.csrf_invalido',
    entidade: 'api',
    registroId: rota,
    resultado: 'falha',
    ip: req.ip,
    userAgent: req.get('user-agent'),
    detalhes: { metodo: req.method, rota },
  });
}

async function registrarOrigemInvalida(req) {
  const rota = caminhoSeguro(req);

  await auditoria.registrarSeguro({
    usuarioId: req.auth?.usuario?.id ?? null,
    usuarioEmail: req.auth?.usuario?.email ?? null,
    tipoOperacao: 'seguranca.origem_invalida',
    entidade: 'api',
    registroId: rota,
    resultado: 'falha',
    ip: req.ip,
    userAgent: req.get('user-agent'),
    detalhes: { metodo: req.method, rota },
  });
}

function normalizarRetencao(valor) {
  const dias = Number.parseInt(valor, 10);

  if (!Number.isInteger(dias) || dias < RETENCAO_MINIMA || dias > RETENCAO_MAXIMA) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      `A retenção deve estar entre ${RETENCAO_MINIMA} e ${RETENCAO_MAXIMA} dias.`
    );
  }

  return dias;
}

async function lerRetencaoDias() {
  const valor = await configuracaoModel.obterValor(
    configuracaoModel.CHAVE_RETENCAO_AUDITORIA,
    RETENCAO_PADRAO
  );
  const dias = Number.parseInt(valor, 10);

  if (!Number.isInteger(dias) || dias < RETENCAO_MINIMA || dias > RETENCAO_MAXIMA) {
    return RETENCAO_PADRAO;
  }

  return dias;
}

async function obterRetencao(contexto) {
  garantirPermissao(contexto.ator, 'auditoria.gerenciar');

  const dias = await lerRetencaoDias();
  const expirados = await auditoria.contarAnteriores(dias);

  return {
    retencao: {
      dias,
      minimo: RETENCAO_MINIMA,
      maximo: RETENCAO_MAXIMA,
      expirados,
    },
  };
}

async function salvarRetencao(dias, contexto) {
  garantirPermissao(contexto.ator, 'auditoria.gerenciar');

  const normalizado = normalizarRetencao(dias);
  const anterior = await lerRetencaoDias();

  await configuracaoModel.definir(
    configuracaoModel.CHAVE_RETENCAO_AUDITORIA,
    normalizado,
    {
      descricao: 'Prazo de retencao dos eventos de auditoria, em dias (30 a 3650).',
      atualizadoPorUsuarioId: contexto.ator.usuario.id,
    }
  );

  await auditoria.registrarSeguro({
    usuarioId: contexto.ator.usuario.id,
    usuarioEmail: contexto.ator.usuario.email,
    tipoOperacao: 'admin.retencao_auditoria_atualizada',
    entidade: 'configuracoes',
    registroId: configuracaoModel.CHAVE_RETENCAO_AUDITORIA,
    resultado: 'sucesso',
    ip: contexto.ip,
    userAgent: contexto.userAgent,
    detalhes: { anterior, novo: normalizado },
  });

  return obterRetencao(contexto);
}

async function executarRetencao(contexto) {
  garantirPermissao(contexto.ator, 'auditoria.gerenciar');

  const dias = await lerRetencaoDias();
  const removidos = await auditoria.expurgarAntigos(dias);

  await auditoria.registrarSeguro({
    usuarioId: contexto.ator.usuario.id,
    usuarioEmail: contexto.ator.usuario.email,
    tipoOperacao: 'admin.auditoria_expurgada',
    entidade: 'auditoria',
    registroId: null,
    resultado: 'sucesso',
    ip: contexto.ip,
    userAgent: contexto.userAgent,
    detalhes: { dias, removidos, origem: 'administracao' },
  });

  return { removidos, dias, executadoEm: new Date().toISOString() };
}

async function executarRetencaoAutomatica({ origem = 'cli' } = {}) {
  const dias = await lerRetencaoDias();
  const removidos = await auditoria.expurgarAntigos(dias);

  await auditoria.registrarSeguro({
    tipoOperacao: 'admin.auditoria_expurgada',
    entidade: 'auditoria',
    registroId: null,
    resultado: 'sucesso',
    detalhes: { dias, removidos, origem },
  });

  return { removidos, dias, executadoEm: new Date().toISOString() };
}

module.exports = {
  RETENCAO_MINIMA,
  RETENCAO_MAXIMA,
  listarHistorico,
  registrarAcessoNegado,
  registrarCsrfInvalido,
  registrarOrigemInvalida,
  obterRetencao,
  salvarRetencao,
  executarRetencao,
  executarRetencaoAutomatica,
};
