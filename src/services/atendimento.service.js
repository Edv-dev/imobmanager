'use strict';

const acessoService = require('./acesso.service');
const relatorioModel = require('../models/relatorio.model');
const { garantirPermissao } = require('../utils/authorization');
const HttpError = require('../utils/http-error');

const TIPOS = new Set(['ligacao', 'whatsapp', 'email', 'visita', 'reuniao', 'outro']);
const STATUS = new Set(['agendado', 'realizado', 'cancelado']);

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

function normalizarId(valor, rotulo) {
  if (valor === undefined || valor === null || valor === '') return null;

  const numero = Number.parseInt(valor, 10);

  if (!Number.isInteger(numero) || numero < 1 || String(numero) !== String(valor)) {
    throw new HttpError(422, 'VALIDATION_ERROR', `${rotulo} inválido.`);
  }

  return numero;
}

function normalizarEnum(valor, rotulo, permitidos) {
  if (valor === undefined || valor === null || valor === '') return null;

  if (typeof valor !== 'string' || !permitidos.has(valor)) {
    throw new HttpError(422, 'VALIDATION_ERROR', `${rotulo} inválido.`);
  }

  return valor;
}

function normalizarFiltros({
  busca = '',
  tipo = '',
  status = '',
  corretor = '',
  corretorId = '',
  inicio = '',
  fim = '',
} = {}) {
  const dataInicio = normalizarData(inicio, 'Data inicial');
  const dataFim = normalizarData(fim, 'Data final');

  if (dataInicio && dataFim && dataInicio > dataFim) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'A data inicial não pode ser posterior à data final.'
    );
  }

  return {
    busca: texto(busca, 100),
    tipo: normalizarEnum(tipo, 'Tipo de atendimento', TIPOS),
    status: normalizarEnum(status, 'Status do atendimento', STATUS),
    corretorId: normalizarId(corretor || corretorId, 'Corretor'),
    inicio: dataInicio,
    fim: dataFim,
  };
}

function atendimentoPublico(row) {
  return {
    id: row.id,
    dataAtendimento: new Date(row.data_atendimento).toISOString(),
    tipo: row.tipo,
    status: row.status,
    descricao: row.descricao,
    cliente: row.cliente,
    corretor: row.corretor,
    imovel: row.imovel_codigo
      ? { codigo: row.imovel_codigo, titulo: row.imovel_titulo }
      : null,
  };
}

async function listarAtendimentos(filtros = {}, contexto, { limiteMaximo = 100 } = {}) {
  garantirPermissao(contexto.ator, 'atendimentos.visualizar');

  const normalizados = normalizarFiltros(filtros);
  const pagina = Math.max(1, Number.parseInt(filtros.pagina, 10) || 1);
  const limite = Math.min(
    Math.max(1, Number.parseInt(filtros.limite, 10) || 20),
    limiteMaximo
  );
  const visibilidade = await acessoService.filtroVisibilidade(
    contexto.ator.usuario.id,
    'cliente',
    'cl',
    0
  );

  const resultado = await relatorioModel.listarAtendimentos(
    visibilidade,
    normalizados,
    pagina,
    limite
  );

  return {
    atendimentos: resultado.atendimentos.map(atendimentoPublico),
    total: resultado.total,
    pagina,
    limite,
    totalPaginas: Math.max(1, Math.ceil(resultado.total / limite)),
  };
}

module.exports = {
  TIPOS,
  STATUS,
  normalizarFiltros,
  atendimentoPublico,
  listarAtendimentos,
};
