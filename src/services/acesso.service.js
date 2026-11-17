'use strict';

const { query } = require('../config/database');
const acessoModel = require('../models/acesso.model');
const usuarioModel = require('../models/usuario.model');
const HttpError = require('../utils/http-error');
const { garantirAdministrador, garantirNaoProprio } = require('../utils/authorization');
const { registrarAdmin } = require('./admin-audit.service');

const TIPOS = {
  imovel: {
    tabelaRecurso: 'imoveis',
    tabelaAcesso: 'acessos_imoveis',
    tabelaVinculo: 'imoveis_corretores',
    coluna: 'imovel_id',
    configuracao: 'imoveis.visibilidade',
    rotulo: 'Imóvel',
  },
  cliente: {
    tabelaRecurso: 'clientes',
    tabelaAcesso: 'acessos_clientes',
    tabelaVinculo: 'clientes_corretores',
    coluna: 'cliente_id',
    configuracao: 'clientes.visibilidade',
    rotulo: 'Cliente',
  },
};

function obterTipo(tipo) {
  const meta = TIPOS[tipo];

  if (!meta) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Tipo de recurso inválido.');
  }

  return meta;
}

function validarAlias(alias) {
  if (typeof alias !== 'string' || !/^[a-z_][a-z0-9_]*$/i.test(alias)) {
    throw new Error('Alias SQL inválido para o filtro de visibilidade.');
  }

  return alias;
}

async function carregarContexto(usuarioId) {
  const { rows } = await query(
    `SELECT u.id,
            u.ativo,
            p.administrativo,
            c.id AS corretor_id
       FROM usuarios u
       JOIN perfis p ON p.id = u.perfil_id
       LEFT JOIN corretores c
         ON c.usuario_id = u.id
        AND c.excluido_em IS NULL
      WHERE u.id = $1
        AND u.excluido_em IS NULL
      LIMIT 1`,
    [usuarioId]
  );
  return rows[0] || null;
}

async function modoVisibilidade(tipo) {
  const meta = obterTipo(tipo);
  const { rows } = await query(
    `SELECT valor FROM configuracoes WHERE chave = $1`,
    [meta.configuracao]
  );
  const valor = rows[0]?.valor;
  return valor === 'vinculados' ? 'vinculados' : 'todos';
}

async function buscarExcecao(usuarioId, tipo, recursoId) {
  const meta = obterTipo(tipo);
  const { rows } = await query(
    `SELECT permitido
       FROM ${meta.tabelaAcesso}
      WHERE usuario_id = $1
        AND ${meta.coluna} = $2
      LIMIT 1`,
    [usuarioId, recursoId]
  );
  return rows[0]?.permitido ?? null;
}

async function estaVinculado(tipo, corretorId, recursoId) {
  const meta = obterTipo(tipo);

  if (!corretorId) return false;

  const { rows } = await query(
    `SELECT 1 AS existe
       FROM ${meta.tabelaVinculo}
      WHERE ${meta.coluna} = $1
        AND corretor_id = $2
      LIMIT 1`,
    [recursoId, corretorId]
  );
  return Boolean(rows[0]);
}

async function podeAcessarRegistro(usuarioId, tipo, recursoId) {
  const meta = obterTipo(tipo);
  const id = Number.parseInt(recursoId, 10);

  if (!Number.isInteger(id) || id < 1) return false;

  const contexto = await carregarContexto(usuarioId);

  if (!contexto || !contexto.ativo) return false;
  if (contexto.administrativo) return true;

  const [excecao, modo] = await Promise.all([
    buscarExcecao(usuarioId, tipo, id),
    modoVisibilidade(tipo),
  ]);

  if (excecao !== null) return excecao;
  if (modo === 'todos') return true;

  return estaVinculado(tipo, contexto.corretor_id, id);
}

async function garantirAcessoRegistro(usuarioId, tipo, recursoId) {
  const permitido = await podeAcessarRegistro(usuarioId, tipo, recursoId);

  if (!permitido) {
    const meta = obterTipo(tipo);
    throw new HttpError(404, 'RESOURCE_NOT_FOUND', `${meta.rotulo} não encontrado.`);
  }
}

/**
 * Monta uma condição SQL de visibilidade para ser usada em consultas futuras.
 * Os placeholders começam em `offset + 1`, permitindo combinar com outros
 * parâmetros da consulta. O alias deve identificar a tabela de recursos.
 */
async function filtroVisibilidade(usuarioId, tipo, alias = 'r', offset = 0) {
  const meta = obterTipo(tipo);
  const tabela = validarAlias(alias);
  const base = Math.max(0, Number.parseInt(offset, 10) || 0);
  const contexto = await carregarContexto(usuarioId);

  if (!contexto || !contexto.ativo) {
    return { sql: 'FALSE', params: [] };
  }

  if (contexto.administrativo) {
    return { sql: 'TRUE', params: [] };
  }

  const parametroUsuario = `$${base + 1}`;
  const negacao = `NOT EXISTS (
    SELECT 1
      FROM ${meta.tabelaAcesso} ax
     WHERE ax.${meta.coluna} = ${tabela}.id
       AND ax.usuario_id = ${parametroUsuario}
       AND ax.permitido = false
  )`;
  const modo = await modoVisibilidade(tipo);

  if (modo === 'todos') {
    return { sql: negacao, params: [usuarioId] };
  }

  const concessao = `EXISTS (
    SELECT 1
      FROM ${meta.tabelaAcesso} ax
     WHERE ax.${meta.coluna} = ${tabela}.id
       AND ax.usuario_id = ${parametroUsuario}
       AND ax.permitido = true
  )`;

  if (!contexto.corretor_id) {
    return {
      sql: `${negacao} AND (${concessao})`,
      params: [usuarioId],
    };
  }

  const parametroCorretor = `$${base + 2}`;
  const vinculo = `EXISTS (
    SELECT 1
      FROM ${meta.tabelaVinculo} v
     WHERE v.${meta.coluna} = ${tabela}.id
       AND v.corretor_id = ${parametroCorretor}
  )`;

  return {
    sql: `${negacao} AND (${concessao} OR ${vinculo})`,
    params: [usuarioId, contexto.corretor_id],
  };
}

function normalizarItens(itens, tipo) {
  if (itens === undefined || itens === null) return [];
  if (!Array.isArray(itens)) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      `A lista de exceções de ${tipo}s deve ser um array.`
    );
  }

  const vistos = new Set();

  return itens.map((item) => {
    const id = Number.parseInt(item?.id, 10);

    if (!Number.isInteger(id) || id < 1 || typeof item?.permitido !== 'boolean') {
      throw new HttpError(
        422,
        'VALIDATION_ERROR',
        'Cada exceção de recurso deve informar o registro e se o acesso é permitido ou negado.'
      );
    }

    if (vistos.has(id)) {
      throw new HttpError(422, 'VALIDATION_ERROR', `Registro duplicado na lista: ${id}.`);
    }

    vistos.add(id);
    return { id, permitido: item.permitido };
  });
}

async function validarRegistrosExistentes(tipo, itens) {
  const ids = await acessoModel.idsExistentes(tipo, itens.map((item) => item.id));
  const ausentes = itens.filter((item) => !ids.has(String(item.id)));

  if (ausentes.length > 0) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      `Registros inexistentes: ${ausentes.map((item) => item.id).join(', ')}.`
    );
  }
}

async function listarRecursosParaExcecoes() {
  const [imoveis, clientes] = await Promise.all([
    acessoModel.listarImoveis(),
    acessoModel.listarClientes(),
  ]);

  return { imoveis, clientes };
}

async function obterAcessosUsuario(usuarioId) {
  const id = Number.parseInt(usuarioId, 10);

  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Usuário inválido.');
  }

  const usuario = await usuarioModel.buscarAdministrativoPorId(id);

  if (!usuario) {
    throw new HttpError(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
  }

  const [excecoes, recursos] = await Promise.all([
    acessoModel.listarExcecoesDoUsuario(id),
    listarRecursosParaExcecoes(),
  ]);

  const mapaImoveis = new Map(
    excecoes.imoveis.map((item) => [String(item.imovel_id), item.permitido])
  );
  const mapaClientes = new Map(
    excecoes.clientes.map((item) => [String(item.cliente_id), item.permitido])
  );
  const corretorId = usuario.corretor_id ? String(usuario.corretor_id) : null;

  function enriquecer(recurso, mapa) {
    return {
      ...recurso,
      vinculado: corretorId
        ? (recurso.corretores || []).some((corretor) => String(corretor.id) === corretorId)
        : false,
      excecao: mapa.has(String(recurso.id)) ? mapa.get(String(recurso.id)) : null,
    };
  }

  return {
    usuario: {
      id: usuario.id,
      nome: usuario.nome_completo,
      email: usuario.email,
      perfil: usuario.perfil,
      administrativo: usuario.administrativo,
    },
    imoveis: recursos.imoveis.map((item) => enriquecer(item, mapaImoveis)),
    clientes: recursos.clientes.map((item) => enriquecer(item, mapaClientes)),
  };
}

async function salvarAcessosUsuario(usuarioId, dados, contexto) {
  garantirAdministrador(contexto.ator);

  const id = Number.parseInt(usuarioId, 10);

  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Usuário inválido.');
  }

  garantirNaoProprio(contexto.ator, id, 'SELF_ACCESS_CHANGE');

  const usuario = await usuarioModel.buscarAdministrativoPorId(id);

  if (!usuario) {
    throw new HttpError(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
  }

  if (usuario.administrativo) {
    throw new HttpError(
      422,
      'ADMIN_TARGET',
      'Exceções de acesso a registros são aplicadas apenas a corretores.'
    );
  }

  const imoveis = normalizarItens(dados?.imoveis, 'imovel');
  const clientes = normalizarItens(dados?.clientes, 'cliente');

  await Promise.all([
    validarRegistrosExistentes('imovel', imoveis),
    validarRegistrosExistentes('cliente', clientes),
  ]);

  const antes = await acessoModel.listarExcecoesDoUsuario(id);

  await acessoModel.substituirExcecoes(
    id,
    { imoveis, clientes },
    contexto.ator.usuario.id
  );

  await registrarAdmin({
    ...contexto,
    tipoOperacao: 'admin.acessos_usuario_atualizados',
    entidade: 'usuarios',
    registroId: String(id),
    detalhes: {
      usuario: usuario.email,
      antes: {
        imoveis: antes.imoveis.length,
        clientes: antes.clientes.length,
      },
      depois: {
        imoveis: imoveis.length,
        clientes: clientes.length,
      },
      imoveis: imoveis.map((item) => ({
        id: item.id,
        permitido: item.permitido,
      })),
      clientes: clientes.map((item) => ({
        id: item.id,
        permitido: item.permitido,
      })),
    },
  });

  return obterAcessosUsuario(id);
}

module.exports = {
  podeAcessarRegistro,
  garantirAcessoRegistro,
  filtroVisibilidade,
  listarRecursosParaExcecoes,
  obterAcessosUsuario,
  salvarAcessosUsuario,
};
