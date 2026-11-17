'use strict';

const configuracaoModel = require('../models/configuracao.model');
const usuarioModel = require('../models/usuario.model');
const HttpError = require('../utils/http-error');
const { garantirAdministrador } = require('../utils/authorization');
const { registrarAdmin } = require('./admin-audit.service');

const VALORES_VISIBILIDADE = ['todos', 'vinculados'];

function validarVisibilidade(valor, campo) {
  if (!VALORES_VISIBILIDADE.includes(valor)) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      `A visibilidade de ${campo} deve ser "todos" ou "vinculados".`
    );
  }

  return valor;
}

async function obterConfiguracoes() {
  const [mapa, usuarios] = await Promise.all([
    configuracaoModel.obterMapa(),
    usuarioModel.listarOpcoes({ somenteNaoAdministrativos: true }),
  ]);

  return {
    visibilidade: {
      imoveis: mapa.get('imoveis.visibilidade') || 'todos',
      clientes: mapa.get('clientes.visibilidade') || 'todos',
    },
    usuarios: usuarios.map((usuario) => ({
      id: usuario.id,
      nome: usuario.nome_completo,
      email: usuario.email,
      ativo: usuario.ativo,
    })),
  };
}

async function salvarVisibilidade(dados, contexto) {
  garantirAdministrador(contexto.ator);

  const imoveis = validarVisibilidade(dados?.imoveis, 'imóveis');
  const clientes = validarVisibilidade(dados?.clientes, 'clientes');
  const antes = await configuracaoModel.obterMapa();

  await configuracaoModel.definirVisibilidade({
    imoveis,
    clientes,
    atualizadoPorUsuarioId: contexto.ator.usuario.id,
  });

  await registrarAdmin({
    ...contexto,
    tipoOperacao: 'admin.visibilidade_atualizada',
    entidade: 'configuracoes',
    registroId: 'visibilidade',
    detalhes: {
      imoveis: {
        anterior: antes.get('imoveis.visibilidade') || 'todos',
        novo: imoveis,
      },
      clientes: {
        anterior: antes.get('clientes.visibilidade') || 'todos',
        novo: clientes,
      },
    },
  });

  return obterConfiguracoes();
}

module.exports = {
  VALORES_VISIBILIDADE,
  obterConfiguracoes,
  salvarVisibilidade,
};
