'use strict';

const { pool } = require('../config/database');
const auditoriaModel = require('../models/auditoria.model');
const lgpdModel = require('../models/lgpd.model');
const HttpError = require('../utils/http-error');
const { garantirPermissao } = require('../utils/authorization');

const LIMITE_ATENDIMENTOS = 500;
const CHAVES_PESSOAIS_AUDITORIA = [
  'nome',
  'cpf',
  'cliente',
  'email',
  'telefone',
  'whatsapp',
  'endereco',
  'observacoes',
];

function numeroPositivo(valor) {
  const numero = Number.parseInt(valor, 10);
  return Number.isInteger(numero) && numero > 0 && String(numero) === String(valor)
    ? numero
    : null;
}

function dataIso(valor) {
  return valor ? new Date(valor).toISOString() : null;
}

function protocolo(clienteId) {
  const agora = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '')
    .slice(0, 14);
  return `LGPD-${agora}-${clienteId}`;
}

function clienteTitular(row) {
  return {
    id: row.id,
    nome: row.nome_completo,
    cpf: row.cpf,
    telefone: row.telefone,
    whatsapp: row.whatsapp,
    email: row.email,
    endereco: row.endereco,
    tipoInteresse: row.tipo_interesse,
    finalidadeDesejada: row.finalidade_desejada,
    faixaPrecoMin: row.faixa_preco_min !== null ? Number(row.faixa_preco_min) : null,
    faixaPrecoMax: row.faixa_preco_max !== null ? Number(row.faixa_preco_max) : null,
    localizacaoDesejada: row.localizacao_desejada,
    observacoes: row.observacoes,
    criadoEm: dataIso(row.criado_em),
    atualizadoEm: dataIso(row.atualizado_em),
    excluidoEm: dataIso(row.excluido_em),
  };
}

async function obterResumo(contexto) {
  garantirPermissao(contexto.ator, 'lgpd.gerenciar');

  const eventos = await auditoriaModel.listarEventosLgpd(10);

  return {
    eventos: eventos.map((evento) => ({
      id: evento.id,
      dataHora: dataIso(evento.data_hora),
      tipoOperacao: evento.tipo_operacao,
      usuarioEmail: evento.usuario_email,
      registroId: evento.registro_id,
      resultado: evento.resultado,
      detalhes: evento.detalhes,
    })),
  };
}

async function buscarClientes(termo, contexto) {
  garantirPermissao(contexto.ator, 'lgpd.gerenciar');

  const busca = typeof termo === 'string' ? termo.trim().slice(0, 100) : '';

  if (busca.length < 2) {
    return { clientes: [] };
  }

  const clientes = await lgpdModel.buscarClientes(busca);

  return {
    clientes: clientes.map((cliente) => ({
      id: cliente.id,
      nome: cliente.nome_completo,
      cpf: cliente.cpf,
      email: cliente.email,
      telefone: cliente.telefone,
      excluido: Boolean(cliente.excluido_em),
    })),
  };
}

async function exportarDadosCliente(id, contexto) {
  garantirPermissao(contexto.ator, 'lgpd.gerenciar');

  const clienteId = numeroPositivo(id);

  if (!clienteId) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Cliente inválido.');
  }

  const cliente = await lgpdModel.buscarCliente(clienteId);

  if (!cliente) {
    throw new HttpError(404, 'CLIENTE_NOT_FOUND', 'Cliente não encontrado.');
  }

  const [corretores, imoveisInteresse, atendimentos] = await Promise.all([
    lgpdModel.listarCorretores(clienteId),
    lgpdModel.listarImoveisInteresse(clienteId),
    lgpdModel.listarAtendimentos(clienteId, LIMITE_ATENDIMENTOS),
  ]);

  const dados = {
    geradoEm: new Date().toISOString(),
    finalidade:
      'Gestão do relacionamento imobiliário, atendimento de interesses de compra ou locação e registro do histórico de atendimentos.',
    baseLegal:
      'Execução de contrato ou procedimentos preliminares (art. 7º, V, LGPD) e legítimo interesse para segurança e histórico de atendimento, quando aplicável.',
    titular: clienteTitular(cliente),
    corretores: corretores.map((corretor) => ({
      nome: corretor.nome_completo,
      creci: corretor.creci,
      principal: corretor.principal,
    })),
    imoveisInteresse: imoveisInteresse.map((imovel) => ({
      id: imovel.id,
      codigo: imovel.codigo_interno,
      titulo: imovel.titulo,
      tipo: imovel.tipo_imovel,
      finalidade: imovel.finalidade,
      cidade: imovel.cidade,
      bairro: imovel.bairro,
      situacao: imovel.situacao,
      vinculadoEm: dataIso(imovel.criado_em),
    })),
    atendimentos: atendimentos.map((atendimento) => ({
      id: atendimento.id,
      tipo: atendimento.tipo,
      status: atendimento.status,
      dataAtendimento: dataIso(atendimento.data_atendimento),
      descricao: atendimento.descricao,
      observacoes: atendimento.observacoes,
      corretor: atendimento.corretor,
      imovel: atendimento.imovel_codigo
        ? { codigo: atendimento.imovel_codigo, titulo: atendimento.imovel_titulo }
        : null,
    })),
  };

  await auditoriaModel.registrarSeguro({
    usuarioId: contexto.ator.usuario.id,
    usuarioEmail: contexto.ator.usuario.email,
    tipoOperacao: 'lgpd.cliente_exportado',
    entidade: 'clientes',
    registroId: String(clienteId),
    resultado: 'sucesso',
    ip: contexto.ip,
    userAgent: contexto.userAgent,
    detalhes: {
      clienteId,
      atendimentos: atendimentos.length,
      corretores: corretores.length,
      imoveisInteresse: imoveisInteresse.length,
      formato: 'json',
    },
  });

  return {
    nomeArquivo: `lgpd-cliente-${clienteId}-${Date.now()}.json`,
    conteudo: Buffer.from(JSON.stringify(dados, null, 2), 'utf8'),
  };
}

function validarMotivo(motivo) {
  const texto = typeof motivo === 'string' ? motivo.trim() : '';

  if (texto.length < 10 || texto.length > 300) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'Informe o motivo da anonimização com 10 a 300 caracteres.'
    );
  }

  return texto;
}

async function anonimizarCliente(id, dados, contexto) {
  garantirPermissao(contexto.ator, 'lgpd.gerenciar');

  const clienteId = numeroPositivo(id);

  if (!clienteId) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Cliente inválido.');
  }

  if (dados?.confirmar !== true) {
    throw new HttpError(
      422,
      'CONFIRMATION_REQUIRED',
      'Confirme explicitamente a anonimização irreversível dos dados.'
    );
  }

  const motivo = validarMotivo(dados?.motivo);
  const client = await pool.connect();
  let resultado;

  try {
    await client.query('BEGIN');

    const cliente = await lgpdModel.bloquearCliente(client, clienteId);

    if (!cliente) {
      throw new HttpError(404, 'CLIENTE_NOT_FOUND', 'Cliente não encontrado.');
    }

    const atendimentos = await lgpdModel.anonimizarAtendimentos(client, clienteId);
    const vinculosRemovidos = await lgpdModel.removerVinculos(client, clienteId);

    await lgpdModel.anonimizarCliente(client, clienteId);

    const registrosAuditoriaRedigidos = await auditoriaModel.redigirDetalhesCliente(
      client,
      clienteId,
      CHAVES_PESSOAIS_AUDITORIA
    );

    await client.query('COMMIT');

    resultado = {
      clienteId,
      protocolo: protocolo(clienteId),
      atendimentosAnonimizados: atendimentos,
      vinculosRemovidos,
      registrosAuditoriaRedigidos,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  await auditoriaModel.registrarSeguro({
    usuarioId: contexto.ator.usuario.id,
    usuarioEmail: contexto.ator.usuario.email,
    tipoOperacao: 'lgpd.cliente_anonimizado',
    entidade: 'clientes',
    registroId: String(clienteId),
    resultado: 'sucesso',
    ip: contexto.ip,
    userAgent: contexto.userAgent,
    detalhes: {
      protocolo: resultado.protocolo,
      atendimentosAnonimizados: resultado.atendimentosAnonimizados,
      vinculosRemovidos: resultado.vinculosRemovidos,
      registrosAuditoriaRedigidos: resultado.registrosAuditoriaRedigidos,
      motivo,
    },
  });

  return resultado;
}

module.exports = {
  obterResumo,
  buscarClientes,
  exportarDadosCliente,
  anonimizarCliente,
};
