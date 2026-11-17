'use strict';

const perfilModel = require('../models/perfil.model');
const permissaoModel = require('../models/permissao.model');
const usuarioModel = require('../models/usuario.model');
const HttpError = require('../utils/http-error');
const {
  garantirAdministrador,
  garantirNaoProprio,
  CORE_ADMIN_PERMISSIONS,
  ADMIN_MODULE,
} = require('../utils/authorization');
const { registrarAdmin } = require('./admin-audit.service');

function normalizarListaDeChaves(chaves) {
  if (!Array.isArray(chaves)) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'Envie a lista de permissões no formato esperado.'
    );
  }

  const normalizadas = chaves.filter((chave) => typeof chave === 'string' && chave.trim());
  const unicas = [...new Set(normalizadas)];

  if (unicas.length !== normalizadas.length) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Existem permissões duplicadas na lista.');
  }

  return unicas;
}

function normalizarExcecoes(excecoes) {
  if (!Array.isArray(excecoes)) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'Envie as exceções no formato esperado.'
    );
  }

  const chaves = new Set();
  const resultado = [];

  for (const item of excecoes) {
    const chave = typeof item?.chave === 'string' ? item.chave.trim() : '';

    if (!chave || typeof item?.permitido !== 'boolean') {
      throw new HttpError(
        422,
        'VALIDATION_ERROR',
        'Cada exceção deve informar a permissão e se ela é permitida ou negada.'
      );
    }

    if (chaves.has(chave)) {
      throw new HttpError(422, 'VALIDATION_ERROR', `Permissão duplicada: ${chave}.`);
    }

    chaves.add(chave);
    resultado.push({ chave, permitido: item.permitido });
  }

  return resultado;
}

async function obterCatalogo() {
  const permissoes = await perfilModel.listarPermissoes();
  return {
    permissoes,
    porChave: new Map(permissoes.map((permissao) => [permissao.chave, permissao])),
  };
}

async function obterMatrizPerfis() {
  const [perfis, catalogo, vinculos] = await Promise.all([
    perfilModel.listar(),
    obterCatalogo(),
    perfilModel.listarPermissoesPorPerfil(),
  ]);

  const porPerfil = new Map();

  for (const vinculo of vinculos) {
    if (!porPerfil.has(String(vinculo.perfil_id))) {
      porPerfil.set(String(vinculo.perfil_id), []);
    }
    porPerfil.get(String(vinculo.perfil_id)).push(vinculo.chave);
  }

  return {
    perfis: perfis.map((perfil) => ({
      id: perfil.id,
      nome: perfil.nome,
      descricao: perfil.descricao,
      administrativo: perfil.administrativo,
      usuarios: perfil.usuarios,
      permissoes: porPerfil.get(String(perfil.id)) || [],
    })),
    permissoes: catalogo.permissoes,
    nucleoAdministrativo: CORE_ADMIN_PERMISSIONS,
  };
}

async function salvarPermissoesPerfil(perfilId, chaves, contexto) {
  garantirAdministrador(contexto.ator);

  const id = Number.parseInt(perfilId, 10);

  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Perfil inválido.');
  }

  const perfil = await perfilModel.buscarPorId(id);

  if (!perfil) {
    throw new HttpError(404, 'PROFILE_NOT_FOUND', 'Perfil não encontrado.');
  }

  const lista = normalizarListaDeChaves(chaves);
  const catalogo = await obterCatalogo();
  const invalidas = lista.filter((chave) => !catalogo.porChave.has(chave));

  if (invalidas.length > 0) {
    throw new HttpError(
      422,
      'INVALID_PERMISSION',
      `Permissões inexistentes: ${invalidas.join(', ')}.`
    );
  }

  if (perfil.administrativo) {
    const ausentes = CORE_ADMIN_PERMISSIONS.filter((chave) => !lista.includes(chave));

    if (ausentes.length > 0) {
      throw new HttpError(
        422,
        'CORE_PERMISSION_REQUIRED',
        `O perfil administrativo deve manter as permissões essenciais: ${ausentes.join(', ')}.`
      );
    }
  } else {
    const administrativas = lista.filter((chave) => {
      return catalogo.porChave.get(chave).modulo === ADMIN_MODULE;
    });

    if (administrativas.length > 0) {
      throw new HttpError(
        422,
        'ADMIN_PERMISSION_NOT_ALLOWED',
        'Permissões da área administrativa só podem ser atribuídas a perfis administrativos.'
      );
    }
  }

  const antes = await perfilModel.listarPermissoesDoPerfil(perfil.id);
  const adicionadas = lista.filter((chave) => !antes.includes(chave));
  const removidas = antes.filter((chave) => !lista.includes(chave));

  await perfilModel.definirPermissoes(perfil.id, lista);

  await registrarAdmin({
    ...contexto,
    tipoOperacao: 'admin.permissoes_perfil_atualizadas',
    entidade: 'perfis',
    registroId: String(perfil.id),
    detalhes: {
      perfil: perfil.nome,
      adicionadas,
      removidas,
      total: lista.length,
    },
  });

  return obterMatrizPerfis();
}

async function obterPermissoesUsuario(usuarioId) {
  const id = Number.parseInt(usuarioId, 10);

  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Usuário inválido.');
  }

  const usuario = await usuarioModel.buscarAdministrativoPorId(id);

  if (!usuario) {
    throw new HttpError(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
  }

  const linhas = await permissaoModel.listarMatrizUsuario(id);

  return {
    usuario: {
      id: usuario.id,
      nome: usuario.nome_completo,
      email: usuario.email,
      perfil: usuario.perfil,
      administrativo: usuario.administrativo,
    },
    permissoes: linhas.map((linha) => ({
      chave: linha.chave,
      nome: linha.nome,
      modulo: linha.modulo,
      descricao: linha.descricao,
      herdado: linha.herdado,
      excecao: linha.excecao,
      efetiva: linha.excecao === null || linha.excecao === undefined
        ? linha.herdado
        : linha.excecao,
    })),
  };
}

async function salvarPermissoesUsuario(usuarioId, excecoes, contexto) {
  garantirAdministrador(contexto.ator);

  const id = Number.parseInt(usuarioId, 10);

  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Usuário inválido.');
  }

  garantirNaoProprio(contexto.ator, id, 'SELF_PERMISSION_CHANGE');

  const usuario = await usuarioModel.buscarAdministrativoPorId(id);

  if (!usuario) {
    throw new HttpError(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
  }

  const lista = normalizarExcecoes(excecoes);
  const catalogo = await obterCatalogo();
  const invalidas = lista.filter((item) => !catalogo.porChave.has(item.chave));

  if (invalidas.length > 0) {
    throw new HttpError(
      422,
      'INVALID_PERMISSION',
      `Permissões inexistentes: ${invalidas.map((item) => item.chave).join(', ')}.`
    );
  }

  if (!usuario.administrativo) {
    const administrativas = lista.filter((item) => {
      return item.permitido && catalogo.porChave.get(item.chave).modulo === ADMIN_MODULE;
    });

    if (administrativas.length > 0) {
      throw new HttpError(
        422,
        'ADMIN_PERMISSION_NOT_ALLOWED',
        'Permissões da área administrativa não podem ser concedidas a corretores.'
      );
    }
  } else {
    const negadasEssenciais = lista.filter((item) => {
      return !item.permitido && CORE_ADMIN_PERMISSIONS.includes(item.chave);
    });

    if (negadasEssenciais.length > 0) {
      throw new HttpError(
        422,
        'CORE_PERMISSION_REQUIRED',
        'As permissões essenciais do administrador não podem ser negadas individualmente.'
      );
    }
  }

  const antes = await permissaoModel.listarExcecoesDoUsuario(id);
  const antesMapa = new Map(antes.map((item) => [item.chave, item.permitido]));
  const depoisMapa = new Map(lista.map((item) => [item.chave, item.permitido]));
  const adicionadas = lista
    .filter((item) => antesMapa.get(item.chave) !== item.permitido)
    .map((item) => `${item.chave}:${item.permitido ? 'permitir' : 'negar'}`);
  const removidas = antes
    .filter((item) => !depoisMapa.has(item.chave))
    .map((item) => item.chave);

  await permissaoModel.substituirExcecoesUsuario(
    id,
    lista,
    contexto.ator.usuario.id
  );

  await registrarAdmin({
    ...contexto,
    tipoOperacao: 'admin.permissoes_usuario_atualizadas',
    entidade: 'usuarios',
    registroId: String(id),
    detalhes: {
      usuario: usuario.email,
      adicionadas,
      removidas,
    },
  });

  return obterPermissoesUsuario(id);
}

module.exports = {
  obterMatrizPerfis,
  salvarPermissoesPerfil,
  obterPermissoesUsuario,
  salvarPermissoesUsuario,
};
