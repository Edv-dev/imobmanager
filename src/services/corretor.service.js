'use strict';

const { pool } = require('../config/database');
const corretorModel = require('../models/corretor.model');
const sessaoModel = require('../models/sessao.model');
const acessoService = require('./acesso.service');
const { registrarAdmin } = require('./admin-audit.service');
const { garantirPermissao } = require('../utils/authorization');
const {
  normalizeName,
  isValidName,
  normalizeCpf,
  isValidCpf,
  normalizeCreci,
  isValidCreci,
  normalizePhone,
  isValidPhone,
  normalizeEmail,
  isValidEmail,
  normalizeOptionalText,
} = require('../utils/validators');
const HttpError = require('../utils/http-error');

const LIMITE_MAXIMO = 50;
const LIMITE_VINCULOS = 50;

function numeroPositivo(valor) {
  const numero = Number.parseInt(valor, 10);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

function dataIso(valor) {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

function normalizarStatusFiltro(status) {
  const valor = typeof status === 'string' ? status.trim().toLowerCase() : '';
  if (valor === 'ativo' || valor === 'ativos') return true;
  if (valor === 'inativo' || valor === 'inativos') return false;
  return '';
}

function lerAtivo(dados) {
  if (dados?.ativo !== undefined) {
    if (typeof dados.ativo !== 'boolean') {
      throw new HttpError(422, 'VALIDATION_ERROR', 'Informe o campo "ativo" como booleano.');
    }
    return dados.ativo;
  }

  if (dados?.situacao !== undefined) {
    if (dados.situacao === 'ativo') return true;
    if (dados.situacao === 'inativo') return false;

    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'Informe a situação como "ativo" ou "inativo".'
    );
  }

  return undefined;
}

function normalizarTelefoneOpcional(valor, rotulo) {
  if (valor === undefined || valor === null || valor === '') return null;

  if (typeof valor !== 'string') {
    throw new HttpError(422, 'VALIDATION_ERROR', `Informe um ${rotulo} válido.`);
  }

  const telefone = normalizePhone(valor);

  if (!telefone) return null;

  if (!isValidPhone(telefone)) {
    throw new HttpError(422, 'VALIDATION_ERROR', `Informe um ${rotulo} válido.`);
  }

  return telefone;
}

function normalizarEmailOpcional(valor) {
  if (valor === undefined || valor === null || valor === '') return null;

  if (typeof valor !== 'string') {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe um e-mail válido.');
  }

  const email = normalizeEmail(valor);

  if (!email) return null;

  if (!isValidEmail(email)) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe um e-mail válido.');
  }

  return email;
}

function valorInformado(dados, chave, base, chaveBase = chave) {
  if (dados && Object.prototype.hasOwnProperty.call(dados, chave)) {
    return dados[chave];
  }

  return base?.[chaveBase];
}

function validarDados(dados, base = null) {
  const nome = normalizeName(valorInformado(dados, 'nome', base, 'nome_completo'));
  const cpf = normalizeCpf(valorInformado(dados, 'cpf', base));
  const creci = normalizeCreci(valorInformado(dados, 'creci', base));

  if (!isValidName(nome)) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'Informe o nome completo com pelo menos 3 caracteres.'
    );
  }

  if (!isValidCpf(cpf)) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe um CPF válido com 11 dígitos.');
  }

  if (!isValidCreci(creci)) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe um CRECI válido.');
  }

  const email = normalizarEmailOpcional(valorInformado(dados, 'email', base));

  return {
    nome,
    cpf,
    creci,
    telefone: normalizarTelefoneOpcional(
      valorInformado(dados, 'telefone', base),
      'telefone'
    ),
    whatsapp: normalizarTelefoneOpcional(
      valorInformado(dados, 'whatsapp', base),
      'WhatsApp'
    ),
    email,
    endereco: normalizeOptionalText(
      valorInformado(dados, 'endereco', base) ?? '',
      255
    ),
  };
}

async function validarConflitos(corretor, ignorarUsuarioId = null) {
  const [cpf, creci, email] = await Promise.all([
    corretorModel.buscarPorCpf(corretor.cpf, ignorarUsuarioId),
    corretorModel.buscarPorCreci(corretor.creci, ignorarUsuarioId),
    corretorModel.buscarPorEmail(corretor.email, ignorarUsuarioId),
  ]);

  if (cpf) {
    throw new HttpError(409, 'CPF_IN_USE', 'Já existe um corretor cadastrado com este CPF.');
  }

  if (creci) {
    throw new HttpError(409, 'CRECI_IN_USE', 'Já existe um corretor cadastrado com este CRECI.');
  }

  if (email) {
    throw new HttpError(409, 'EMAIL_IN_USE', 'Já existe um corretor cadastrado com este e-mail.');
  }
}

function traduzirErroBanco(error) {
  if (error.code !== '23505') return error;

  const mensagens = {
    uq_corretores_cpf_ativo: ['CPF_IN_USE', 'Já existe um corretor cadastrado com este CPF.'],
    uq_corretores_creci_ativo: ['CRECI_IN_USE', 'Já existe um corretor cadastrado com este CRECI.'],
    uq_corretores_email_ativo: ['EMAIL_IN_USE', 'Já existe um corretor cadastrado com este e-mail.'],
    uq_corretores_usuario_ativo: [
      'USER_ALREADY_LINKED',
      'Este usuário já possui um cadastro de corretor.',
    ],
  };

  const entrada = mensagens[error.constraint];

  return entrada ? new HttpError(409, entrada[0], entrada[1]) : error;
}

function corretorPublico(row) {
  return {
    id: row.id,
    nome: row.nome_completo,
    cpf: row.cpf,
    creci: row.creci,
    telefone: row.telefone,
    whatsapp: row.whatsapp,
    email: row.email,
    endereco: row.endereco,
    ativo: row.ativo,
    situacao: row.ativo ? 'ativo' : 'inativo',
    criadoEm: dataIso(row.criado_em),
    atualizadoEm: dataIso(row.atualizado_em),
    usuario: {
      id: row.usuario_id,
      nome: row.usuario_nome,
      email: row.usuario_email,
      ativo: row.usuario_ativo,
      perfil: row.perfil,
      criadoEm: dataIso(row.usuario_criado_em),
    },
  };
}

function imovelPublico(row) {
  return {
    id: row.id,
    codigoInterno: row.codigo_interno,
    titulo: row.titulo,
    tipoImovel: row.tipo_imovel,
    finalidade: row.finalidade,
    cidade: row.cidade,
    bairro: row.bairro,
    situacao: row.situacao,
    valorVenda: row.valor_venda,
    valorAluguel: row.valor_aluguel,
    principal: row.principal,
    criadoEm: dataIso(row.criado_em),
  };
}

function clientePublico(row) {
  return {
    id: row.id,
    nome: row.nome_completo,
    telefone: row.telefone,
    whatsapp: row.whatsapp,
    email: row.email,
    finalidadeDesejada: row.finalidade_desejada,
    localizacaoDesejada: row.localizacao_desejada,
    principal: row.principal,
    criadoEm: dataIso(row.criado_em),
  };
}

async function listarCorretores(
  { busca = '', status = '', pagina = 1, limite = 10 } = {},
  contexto
) {
  garantirPermissao(contexto.ator, 'corretores.visualizar');

  const paginaNormalizada = numeroPositivo(pagina) || 1;
  const limiteNormalizado = Math.min(numeroPositivo(limite) || 10, LIMITE_MAXIMO);
  const resultado = await corretorModel.listar({
    busca: typeof busca === 'string' ? busca.trim().slice(0, 100) : '',
    status: normalizarStatusFiltro(status),
    pagina: paginaNormalizada,
    limite: limiteNormalizado,
  });

  return {
    corretores: resultado.corretores.map(corretorPublico),
    total: resultado.total,
    pagina: paginaNormalizada,
    limite: limiteNormalizado,
    totalPaginas: Math.max(1, Math.ceil(resultado.total / limiteNormalizado)),
  };
}

async function obterCorretor(id, contexto) {
  garantirPermissao(contexto.ator, 'corretores.visualizar');

  const corretorId = numeroPositivo(id);

  if (!corretorId) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Corretor inválido.');
  }

  const row = await corretorModel.buscarDetalhadoPorId(corretorId);

  if (!row) {
    throw new HttpError(404, 'CORRETOR_NOT_FOUND', 'Corretor não encontrado.');
  }

  const [filtroImoveis, filtroClientes] = await Promise.all([
    acessoService.filtroVisibilidade(contexto.ator.usuario.id, 'imovel', 'i', 1),
    acessoService.filtroVisibilidade(contexto.ator.usuario.id, 'cliente', 'cl', 1),
  ]);

  const [imoveis, totalImoveis, clientes, totalClientes] = await Promise.all([
    corretorModel.listarImoveisVinculados(corretorId, filtroImoveis, LIMITE_VINCULOS),
    corretorModel.contarImoveisVinculados(corretorId, filtroImoveis),
    corretorModel.listarClientesVinculados(corretorId, filtroClientes, LIMITE_VINCULOS),
    corretorModel.contarClientesVinculados(corretorId, filtroClientes),
  ]);

  return {
    corretor: corretorPublico(row),
    imoveis: imoveis.map(imovelPublico),
    clientes: clientes.map(clientePublico),
    resumo: {
      imoveis: totalImoveis,
      clientes: totalClientes,
      limiteVinculos: LIMITE_VINCULOS,
    },
  };
}

async function obterResumo(contexto) {
  garantirPermissao(contexto.ator, 'corretores.visualizar');
  return corretorModel.contarResumo();
}

async function listarUsuariosDisponiveis(contexto) {
  garantirPermissao(contexto.ator, 'corretores.criar');

  const usuarios = await corretorModel.listarUsuariosDisponiveis();

  return usuarios.map((usuario) => ({
    id: usuario.id,
    nome: usuario.nome_completo,
    email: usuario.email,
    ativo: usuario.ativo,
    situacao: usuario.ativo ? 'ativo' : 'inativo',
    perfil: usuario.perfil,
  }));
}

async function buscarCorretorBasico(corretorId) {
  const row = await corretorModel.buscarDetalhadoPorId(corretorId);

  if (!row) {
    throw new HttpError(404, 'CORRETOR_NOT_FOUND', 'Corretor não encontrado.');
  }

  return corretorPublico(row);
}

async function criarCorretor(dados, contexto) {
  garantirPermissao(contexto.ator, 'corretores.criar');

  const usuarioId = numeroPositivo(dados?.usuarioId);

  if (!usuarioId) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'Selecione o usuário que será vinculado ao corretor.'
    );
  }

  const usuario = await corretorModel.buscarUsuarioVinculavel(usuarioId);

  if (!usuario) {
    throw new HttpError(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
  }

  if (usuario.administrativo) {
    throw new HttpError(
      422,
      'ADMIN_CORRETOR',
      'Perfis administrativos não possuem cadastro de corretor.'
    );
  }

  if (usuario.possui_corretor) {
    throw new HttpError(
      409,
      'USER_ALREADY_LINKED',
      'Este usuário já possui um cadastro de corretor.'
    );
  }

  const campos = validarDados(dados);
  const ativo = lerAtivo(dados) ?? true;

  await validarConflitos(campos);

  const client = await pool.connect();
  let corretorId;

  try {
    await client.query('BEGIN');

    const criado = await corretorModel.criar(client, {
      usuarioId,
      nomeCompleto: campos.nome,
      cpf: campos.cpf,
      creci: campos.creci,
      telefone: campos.telefone,
      whatsapp: campos.whatsapp,
      email: campos.email,
      endereco: campos.endereco,
      ativo,
    });

    corretorId = criado.id;

    await corretorModel.atualizarNomeUsuario(client, usuarioId, campos.nome);
    await corretorModel.atualizarAtivoUsuario(client, usuarioId, ativo);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw traduzirErroBanco(error);
  } finally {
    client.release();
  }

  if (!ativo) {
    await sessaoModel.revogarTodasDoUsuario(usuarioId, 'corretor_desativado');
  }

  await registrarAdmin({
    ...contexto,
    tipoOperacao: 'corretor.criado',
    entidade: 'corretores',
    registroId: String(corretorId),
    detalhes: {
      nome: campos.nome,
      creci: campos.creci,
      email: campos.email,
      ativo,
      usuario: usuario.email,
    },
  });

  return buscarCorretorBasico(corretorId);
}

function camposAlterados(anterior, atual) {
  const campos = [];

  if (anterior.nome_completo !== atual.nome) campos.push('nome');
  if (anterior.cpf !== atual.cpf) campos.push('cpf');
  if (anterior.creci !== atual.creci) campos.push('creci');
  if ((anterior.telefone || null) !== (atual.telefone || null)) campos.push('telefone');
  if ((anterior.whatsapp || null) !== (atual.whatsapp || null)) campos.push('whatsapp');
  if ((anterior.email || null) !== (atual.email || null)) campos.push('email');
  if ((anterior.endereco || null) !== (atual.endereco || null)) campos.push('endereco');

  return campos;
}

async function atualizarCorretor(id, dados, contexto) {
  garantirPermissao(contexto.ator, 'corretores.editar');

  const corretorId = numeroPositivo(id);

  if (!corretorId) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Corretor inválido.');
  }

  const anterior = await corretorModel.buscarDetalhadoPorId(corretorId);

  if (!anterior) {
    throw new HttpError(404, 'CORRETOR_NOT_FOUND', 'Corretor não encontrado.');
  }

  const statusSolicitado = lerAtivo(dados);

  if (statusSolicitado !== undefined && statusSolicitado !== anterior.ativo) {
    garantirPermissao(contexto.ator, 'corretores.desativar');

    if (
      statusSolicitado === false &&
      Number(anterior.usuario_id) === Number(contexto.ator.usuario.id)
    ) {
      throw new HttpError(403, 'SELF_OPERATION', 'Você não pode desativar o próprio cadastro.');
    }
  }

  const campos = validarDados(dados, anterior);
  await validarConflitos(campos, anterior.usuario_id);

  const ativo = statusSolicitado === undefined ? anterior.ativo : statusSolicitado;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const atualizado = await corretorModel.atualizar(client, corretorId, {
      nomeCompleto: campos.nome,
      cpf: campos.cpf,
      creci: campos.creci,
      telefone: campos.telefone,
      whatsapp: campos.whatsapp,
      email: campos.email,
      endereco: campos.endereco,
      ativo,
    });

    if (!atualizado) {
      throw new HttpError(404, 'CORRETOR_NOT_FOUND', 'Corretor não encontrado.');
    }

    await corretorModel.atualizarNomeUsuario(
      client,
      anterior.usuario_id,
      campos.nome
    );

    if (statusSolicitado !== undefined) {
      await corretorModel.atualizarAtivoUsuario(
        client,
        anterior.usuario_id,
        statusSolicitado
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw traduzirErroBanco(error);
  } finally {
    client.release();
  }

  if (statusSolicitado === false) {
    await sessaoModel.revogarTodasDoUsuario(anterior.usuario_id, 'corretor_desativado');
  }

  const alterados = camposAlterados(anterior, campos);

  if (statusSolicitado !== undefined && statusSolicitado !== anterior.ativo) {
    alterados.push('ativo');
  }

  await registrarAdmin({
    ...contexto,
    tipoOperacao: 'corretor.atualizado',
    entidade: 'corretores',
    registroId: String(corretorId),
    detalhes: {
      nome: campos.nome,
      creci: campos.creci,
      campos: alterados,
      ativoAnterior: anterior.ativo,
      ativoNovo: ativo,
    },
  });

  return buscarCorretorBasico(corretorId);
}

async function atualizarStatusCorretor(id, ativo, contexto) {
  garantirPermissao(contexto.ator, 'corretores.desativar');

  if (typeof ativo !== 'boolean') {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe o campo "ativo" como booleano.');
  }

  const corretorId = numeroPositivo(id);

  if (!corretorId) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Corretor inválido.');
  }

  const anterior = await corretorModel.buscarDetalhadoPorId(corretorId);

  if (!anterior) {
    throw new HttpError(404, 'CORRETOR_NOT_FOUND', 'Corretor não encontrado.');
  }

  if (ativo === false && Number(anterior.usuario_id) === Number(contexto.ator.usuario.id)) {
    throw new HttpError(403, 'SELF_OPERATION', 'Você não pode desativar o próprio cadastro.');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const atualizado = await corretorModel.atualizarStatus(client, corretorId, ativo);

    if (!atualizado) {
      throw new HttpError(404, 'CORRETOR_NOT_FOUND', 'Corretor não encontrado.');
    }

    await corretorModel.atualizarAtivoUsuario(client, anterior.usuario_id, ativo);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  if (ativo === false) {
    await sessaoModel.revogarTodasDoUsuario(anterior.usuario_id, 'corretor_desativado');
  }

  await registrarAdmin({
    ...contexto,
    tipoOperacao: 'corretor.status_alterado',
    entidade: 'corretores',
    registroId: String(corretorId),
    detalhes: {
      nome: anterior.nome_completo,
      ativoAnterior: anterior.ativo,
      ativoNovo: ativo,
      usuario: anterior.usuario_email,
    },
  });

  return buscarCorretorBasico(corretorId);
}

module.exports = {
  listarCorretores,
  obterCorretor,
  obterResumo,
  listarUsuariosDisponiveis,
  criarCorretor,
  atualizarCorretor,
  atualizarStatusCorretor,
};
