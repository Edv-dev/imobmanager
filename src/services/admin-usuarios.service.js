'use strict';

const usuarioModel = require('../models/usuario.model');
const perfilModel = require('../models/perfil.model');
const corretorModel = require('../models/corretor.model');
const sessaoModel = require('../models/sessao.model');
const configuracaoModel = require('../models/configuracao.model');
const { hashPassword } = require('../utils/password');
const {
  normalizeEmail,
  isValidEmail,
  normalizeName,
  isValidName,
  normalizeCpf,
  isValidCpf,
  normalizeCreci,
  isValidCreci,
  normalizePhone,
  isValidPhone,
  normalizeOptionalText,
  passwordPolicyError,
} = require('../utils/validators');
const HttpError = require('../utils/http-error');
const { garantirAdministrador } = require('../utils/authorization');
const { registrarAdmin } = require('./admin-audit.service');

const LIMITE_MAXIMO = 50;

function numeroPositivo(valor) {
  const numero = Number.parseInt(valor, 10);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

function dataIso(valor) {
  return valor ? new Date(valor).toISOString() : null;
}

function usuarioPublico(usuario) {
  return {
    id: usuario.id,
    nome: usuario.nome_completo,
    email: usuario.email,
    ativo: usuario.ativo,
    deveTrocarSenha: usuario.deve_trocar_senha,
    ultimoAcessoEm: dataIso(usuario.ultimo_acesso_em),
    criadoEm: dataIso(usuario.criado_em),
    excecoesPermissao: usuario.excecoes_permissao ?? 0,
    perfil: {
      id: usuario.perfil_id,
      nome: usuario.perfil,
      administrativo: usuario.administrativo,
    },
    corretor: usuario.corretor_id
      ? {
          id: usuario.corretor_id,
          cpf: usuario.corretor_cpf,
          creci: usuario.corretor_creci,
          telefone: usuario.corretor_telefone,
          whatsapp: usuario.corretor_whatsapp,
          email: usuario.corretor_email,
          endereco: usuario.corretor_endereco,
          ativo: usuario.corretor_ativo,
        }
      : null,
  };
}

function traduzirErroBanco(error) {
  if (error.code !== '23505') return error;

  const mensagens = {
    uq_usuarios_email_ativo: ['EMAIL_IN_USE', 'Já existe um usuário ativo com este e-mail.'],
    uq_corretores_cpf_ativo: ['CPF_IN_USE', 'Já existe um corretor ativo com este CPF.'],
    uq_corretores_creci_ativo: ['CRECI_IN_USE', 'Já existe um corretor ativo com este CRECI.'],
    uq_corretores_email_ativo: ['EMAIL_IN_USE', 'Já existe um corretor ativo com este e-mail.'],
    uq_corretores_usuario_ativo: ['CONFLICT', 'Este usuário já possui um cadastro de corretor.'],
  };

  const entrada = mensagens[error.constraint];

  if (!entrada) return error;

  return new HttpError(409, entrada[0], entrada[1]);
}

function validarDadosBasicos({ nome, email }) {
  const nomeNormalizado = normalizeName(nome);
  const emailNormalizado = normalizeEmail(email);

  if (!isValidName(nomeNormalizado)) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'Informe o nome completo com pelo menos 3 caracteres.'
    );
  }

  if (!isValidEmail(emailNormalizado)) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe um e-mail válido.');
  }

  return { nome: nomeNormalizado, email: emailNormalizado };
}

function obterPerfil(perfilId) {
  const id = numeroPositivo(perfilId);

  if (!id) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Selecione um perfil válido.');
  }

  return id;
}

function validarCorretor(dados, existente = null, { obrigatorio = false } = {}) {
  const base = existente || {};
  const possuiDados =
    dados !== undefined && dados !== null && typeof dados === 'object';

  if (!possuiDados && !existente) {
    if (obrigatorio) {
      throw new HttpError(
        422,
        'CORRETOR_REQUIRED',
        'Informe os dados do corretor para o perfil selecionado.'
      );
    }
    return null;
  }

  const cpf = normalizeCpf(dados?.cpf ?? base.cpf);
  const creci = normalizeCreci(dados?.creci ?? base.creci);

  if (!isValidCpf(cpf)) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe um CPF válido com 11 dígitos.');
  }

  if (!isValidCreci(creci)) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe um CRECI válido.');
  }

  const telefone = normalizePhone(dados?.telefone ?? base.telefone ?? '');
  const whatsapp = normalizePhone(dados?.whatsapp ?? base.whatsapp ?? '');

  if (telefone && !isValidPhone(telefone)) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe um telefone válido.');
  }

  if (whatsapp && !isValidPhone(whatsapp)) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe um WhatsApp válido.');
  }

  const emailBruto = dados?.email ?? base.email ?? '';
  const email = emailBruto ? normalizeEmail(emailBruto) : null;

  if (email && !isValidEmail(email)) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe um e-mail válido para o corretor.');
  }

  const endereco = normalizeOptionalText(dados?.endereco ?? base.endereco ?? '', 255);

  return {
    cpf,
    creci,
    telefone: telefone || null,
    whatsapp: whatsapp || null,
    email,
    endereco,
    ativo: dados?.ativo === false ? false : base.ativo !== false,
  };
}

async function validarConflitosCorretor(corretor, ignorarUsuarioId) {
  const [cpf, creci, email] = await Promise.all([
    corretorModel.buscarPorCpf(corretor.cpf, ignorarUsuarioId),
    corretorModel.buscarPorCreci(corretor.creci, ignorarUsuarioId),
    corretorModel.buscarPorEmail(corretor.email, ignorarUsuarioId),
  ]);

  if (cpf) {
    throw new HttpError(409, 'CPF_IN_USE', 'Já existe um corretor ativo com este CPF.');
  }

  if (creci) {
    throw new HttpError(409, 'CRECI_IN_USE', 'Já existe um corretor ativo com este CRECI.');
  }

  if (email) {
    throw new HttpError(
      409,
      'EMAIL_IN_USE',
      'Já existe um corretor ativo com este e-mail.'
    );
  }
}

async function listarUsuarios({ busca = '', perfilId = '', status = '', pagina = 1, limite = 10 }) {
  const paginaNormalizada = numeroPositivo(pagina) || 1;
  const limiteNormalizado = Math.min(numeroPositivo(limite) || 10, LIMITE_MAXIMO);
  const idPerfil = numeroPositivo(perfilId);
  const statusNormalizado = ['ativos', 'inativos'].includes(status) ? status : '';

  const resultado = await usuarioModel.listarAdministrativo({
    busca: typeof busca === 'string' ? busca.trim().slice(0, 100) : '',
    perfilId: idPerfil,
    status: statusNormalizado,
    pagina: paginaNormalizada,
    limite: limiteNormalizado,
  });

  return {
    usuarios: resultado.usuarios.map(usuarioPublico),
    total: resultado.total,
    pagina: paginaNormalizada,
    limite: limiteNormalizado,
    totalPaginas: Math.max(1, Math.ceil(resultado.total / limiteNormalizado)),
  };
}

async function obterUsuario(id) {
  const usuario = await usuarioModel.buscarAdministrativoPorId(numeroPositivo(id));

  if (!usuario) {
    throw new HttpError(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
  }

  return usuarioPublico(usuario);
}

async function criarUsuario(dados, contexto) {
  garantirAdministrador(contexto.ator);

  const { nome, email } = validarDadosBasicos({
    nome: dados?.nome,
    email: dados?.email,
  });
  const perfilId = obterPerfil(dados?.perfilId);
  const perfil = await perfilModel.buscarPorId(perfilId);

  if (!perfil) {
    throw new HttpError(404, 'PROFILE_NOT_FOUND', 'Perfil não encontrado.');
  }

  const politica = passwordPolicyError(dados?.senha);

  if (politica) {
    throw new HttpError(422, 'WEAK_PASSWORD', politica);
  }

  const ativo = dados?.ativo !== false;
  const corretor = perfil.administrativo
    ? null
    : validarCorretor(dados?.corretor, null, { obrigatorio: true });

  if (corretor) {
    corretor.ativo = ativo && corretor.ativo !== false;
    await validarConflitosCorretor(corretor, null);
  }

  const existente = await usuarioModel.buscarPorEmail(email);

  if (existente) {
    throw new HttpError(409, 'EMAIL_IN_USE', 'Já existe um usuário ativo com este e-mail.');
  }

  let criado;

  try {
    criado = await usuarioModel.criarComCorretor({
      usuario: {
        perfilId,
        nomeCompleto: nome,
        email,
        senhaHash: await hashPassword(dados.senha),
        ativo,
        deveTrocarSenha: dados?.deveTrocarSenha !== false,
      },
      corretor,
    });
  } catch (error) {
    throw traduzirErroBanco(error);
  }

  await registrarAdmin({
    ...contexto,
    tipoOperacao: 'admin.usuario_criado',
    entidade: 'usuarios',
    registroId: String(criado.id),
    detalhes: {
      perfil: perfil.nome,
      ativo,
      corretor: Boolean(corretor),
    },
  });

  return obterUsuario(criado.id);
}

async function atualizarUsuario(id, dados, contexto) {
  garantirAdministrador(contexto.ator);

  const usuarioId = numeroPositivo(id);
  const alvo = await usuarioModel.buscarAdministrativoPorId(usuarioId);

  if (!alvo) {
    throw new HttpError(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
  }

  const { nome, email } = validarDadosBasicos({
    nome: dados?.nome ?? alvo.nome_completo,
    email: dados?.email ?? alvo.email,
  });
  const perfilId = dados?.perfilId ? obterPerfil(dados.perfilId) : alvo.perfil_id;
  const perfil = await perfilModel.buscarPorId(perfilId);

  if (!perfil) {
    throw new HttpError(404, 'PROFILE_NOT_FOUND', 'Perfil não encontrado.');
  }

  const ativo = dados?.ativo === undefined ? alvo.ativo : dados.ativo === true;

  if (Number(alvo.id) === Number(contexto.ator.usuario.id)) {
    if (perfilId !== alvo.perfil_id) {
      throw new HttpError(
        403,
        'SELF_OPERATION',
        'Você não pode alterar o próprio perfil de acesso.'
      );
    }

    if (ativo === false) {
      throw new HttpError(403, 'SELF_OPERATION', 'Você não pode desativar a própria conta.');
    }
  }

  if (alvo.administrativo && alvo.ativo && (ativo === false || !perfil.administrativo)) {
    const outrosAdmins = await usuarioModel.contarAdminsAtivos(alvo.id);

    if (outrosAdmins === 0) {
      throw new HttpError(
        409,
        'LAST_ADMIN',
        'É necessário manter pelo menos um administrador ativo no sistema.'
      );
    }
  }

  const corretorExistente = alvo.corretor_id
    ? {
        id: alvo.corretor_id,
        cpf: alvo.corretor_cpf,
        creci: alvo.corretor_creci,
        telefone: alvo.corretor_telefone,
        whatsapp: alvo.corretor_whatsapp,
        email: alvo.corretor_email,
        endereco: alvo.corretor_endereco,
        ativo: alvo.corretor_ativo,
      }
    : null;

  let corretor = null;

  if (!perfil.administrativo) {
    corretor = validarCorretor(dados?.corretor, corretorExistente, {
      obrigatorio: !corretorExistente,
    });
    corretor.ativo = ativo;
    await validarConflitosCorretor(corretor, alvo.id);
  } else if (corretorExistente) {
    corretor = {
      cpf: corretorExistente.cpf,
      creci: corretorExistente.creci,
      telefone: corretorExistente.telefone,
      whatsapp: corretorExistente.whatsapp,
      email: corretorExistente.email,
      endereco: corretorExistente.endereco,
      ativo: false,
    };
  }

  try {
    const atualizado = await usuarioModel.atualizarComCorretor({
      usuarioId: alvo.id,
      usuario: {
        perfilId,
        nomeCompleto: nome,
        email,
        ativo,
      },
      corretor,
      corretorExistenteId: corretorExistente?.id || null,
    });

    if (!atualizado) {
      throw new HttpError(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
    }
  } catch (error) {
    throw traduzirErroBanco(error);
  }

  if (alvo.ativo && ativo === false) {
    await sessaoModel.revogarTodasDoUsuario(alvo.id, 'usuario_desativado');
  }

  const campos = [];

  if (nome !== alvo.nome_completo) campos.push('nome');
  if (email !== alvo.email) campos.push('email');
  if (perfilId !== alvo.perfil_id) campos.push('perfil');
  if (ativo !== alvo.ativo) campos.push('ativo');
  if (corretor) campos.push('corretor');

  await registrarAdmin({
    ...contexto,
    tipoOperacao: 'admin.usuario_atualizado',
    entidade: 'usuarios',
    registroId: String(alvo.id),
    detalhes: {
      campos,
      perfilAnterior: alvo.perfil,
      perfilNovo: perfil.nome,
      ativoAnterior: alvo.ativo,
      ativoNovo: ativo,
    },
  });

  return obterUsuario(alvo.id);
}

async function atualizarStatus(id, ativo, contexto) {
  garantirAdministrador(contexto.ator);

  const usuarioId = numeroPositivo(id);
  const alvo = await usuarioModel.buscarAdministrativoPorId(usuarioId);

  if (!alvo) {
    throw new HttpError(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
  }

  if (Number(alvo.id) === Number(contexto.ator.usuario.id) && ativo === false) {
    throw new HttpError(403, 'SELF_OPERATION', 'Você não pode desativar a própria conta.');
  }

  if (alvo.administrativo && alvo.ativo && ativo === false) {
    const outrosAdmins = await usuarioModel.contarAdminsAtivos(alvo.id);

    if (outrosAdmins === 0) {
      throw new HttpError(
        409,
        'LAST_ADMIN',
        'É necessário manter pelo menos um administrador ativo no sistema.'
      );
    }
  }

  const atualizado = await usuarioModel.atualizarStatus(alvo.id, ativo);

  if (!atualizado) {
    throw new HttpError(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
  }

  if (ativo === false) {
    await sessaoModel.revogarTodasDoUsuario(alvo.id, 'usuario_desativado');
  }

  await registrarAdmin({
    ...contexto,
    tipoOperacao: 'admin.usuario_status',
    entidade: 'usuarios',
    registroId: String(alvo.id),
    detalhes: { ativoAnterior: alvo.ativo, ativoNovo: ativo },
  });

  return obterUsuario(alvo.id);
}

async function redefinirSenhaUsuario(id, novaSenha, contexto) {
  garantirAdministrador(contexto.ator);

  const usuarioId = numeroPositivo(id);
  const alvo = await usuarioModel.buscarAdministrativoPorId(usuarioId);

  if (!alvo) {
    throw new HttpError(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
  }

  if (Number(alvo.id) === Number(contexto.ator.usuario.id)) {
    throw new HttpError(
      403,
      'SELF_OPERATION',
      'Use a recuperação de senha para alterar a própria senha.'
    );
  }

  const politica = passwordPolicyError(novaSenha);

  if (politica) {
    throw new HttpError(422, 'WEAK_PASSWORD', politica);
  }

  const atualizado = await usuarioModel.redefinirSenhaAdministrativa(
    alvo.id,
    await hashPassword(novaSenha)
  );

  if (!atualizado) {
    throw new HttpError(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
  }

  await registrarAdmin({
    ...contexto,
    tipoOperacao: 'admin.usuario_senha_redefinida',
    entidade: 'usuarios',
    registroId: String(alvo.id),
    detalhes: { sessoesRevogadas: true, deveTrocarSenha: true },
  });

  return {
    message:
      'Senha redefinida com sucesso. As sessões do usuário foram encerradas e ele deverá trocar a senha.',
  };
}

async function obterResumo() {
  const [contagem, sessoesAtivas, configuracoes] = await Promise.all([
    usuarioModel.contarResumo(),
    sessaoModel.contarAtivas(),
    configuracaoModel.obterMapa(),
  ]);

  return {
    usuarios: contagem,
    sessoesAtivas,
    visibilidade: {
      imoveis: configuracoes.get('imoveis.visibilidade') || 'todos',
      clientes: configuracoes.get('clientes.visibilidade') || 'todos',
    },
  };
}

async function listarOpcoesPerfis() {
  const perfis = await perfilModel.listarOpcoes();

  return perfis.map((perfil) => ({
    id: perfil.id,
    nome: perfil.nome,
    administrativo: perfil.administrativo,
  }));
}

async function listarOpcoes({ somenteNaoAdministrativos = false } = {}) {
  const usuarios = await usuarioModel.listarOpcoes({ somenteNaoAdministrativos });

  return usuarios.map((usuario) => ({
    id: usuario.id,
    nome: usuario.nome_completo,
    email: usuario.email,
    ativo: usuario.ativo,
    perfil: usuario.perfil,
    administrativo: usuario.administrativo,
  }));
}

module.exports = {
  listarUsuarios,
  obterUsuario,
  criarUsuario,
  atualizarUsuario,
  atualizarStatus,
  redefinirSenhaUsuario,
  obterResumo,
  listarOpcoes,
  listarOpcoesPerfis,
};
