'use strict';

const config = require('../config/env');
const usuarioModel = require('../models/usuario.model');
const sessaoModel = require('../models/sessao.model');
const recuperacaoModel = require('../models/recuperacao.model');
const auditoria = require('../models/auditoria.model');
const { hashPassword, verifyPassword, verifyDummyPassword } = require('../utils/password');
const { generateToken, hashToken, csrfTokenForSession } = require('../utils/tokens');
const {
  normalizeEmail,
  isValidEmail,
  passwordPolicyError,
  isTokenFormatValid,
} = require('../utils/validators');
const HttpError = require('../utils/http-error');
const emailService = require('./email.service');

const GENERIC_CREDENTIALS_MESSAGE = 'E-mail ou senha incorretos.';
const GENERIC_RECOVERY_MESSAGE =
  'Se o e-mail informado estiver cadastrado, as instruções de recuperação serão enviadas.';

function usuarioPublico(usuario, permissoes) {
  return {
    id: usuario.id,
    nome: usuario.nome_completo,
    email: usuario.email,
    perfil: usuario.perfil,
    administrativo: usuario.administrativo,
    deveTrocarSenha: usuario.deve_trocar_senha,
    permissoes,
  };
}

function segundosAte(data) {
  return Math.max(1, Math.ceil((new Date(data).getTime() - Date.now()) / 1000));
}

async function registrarEvento(evento) {
  await auditoria.registrarSeguro({
    entidade: 'auth',
    ...evento,
  });
}

async function criarSessao({ usuario, ip, userAgent, lembrar }) {
  const duracaoMinutos = lembrar
    ? config.session.rememberDays * 24 * 60
    : config.session.ttlMinutes;
  const expiraEm = new Date(Date.now() + duracaoMinutos * 60 * 1000);
  const token = generateToken();
  const tokenHash = hashToken(token);
  const permissoes = await usuarioModel.buscarPermissoesEfetivas(
    usuario.id,
    usuario.perfil_id
  );

  await sessaoModel.criar({
    usuarioId: usuario.id,
    tokenHash,
    expiraEm,
    ip,
    userAgent,
  });

  return {
    token,
    csrfToken: csrfTokenForSession(token),
    expiraEm: expiraEm.toISOString(),
    usuario: usuarioPublico(usuario, permissoes),
  };
}

async function login({ email, password, ip, userAgent, lembrar = false }) {
  const emailNormalizado = normalizeEmail(email);

  if (
    !isValidEmail(emailNormalizado) ||
    typeof password !== 'string' ||
    password.length === 0 ||
    password.length > 256
  ) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', GENERIC_CREDENTIALS_MESSAGE);
  }

  const usuario = await usuarioModel.buscarPorEmail(emailNormalizado);

  if (!usuario) {
    await verifyDummyPassword(password);
    await registrarEvento({
      usuarioEmail: emailNormalizado,
      tipoOperacao: 'auth.login_falha',
      resultado: 'falha',
      ip,
      userAgent,
      detalhes: { motivo: 'credenciais_invalidas' },
    });
    throw new HttpError(401, 'INVALID_CREDENTIALS', GENERIC_CREDENTIALS_MESSAGE);
  }

  if (usuario.bloqueado_ate && new Date(usuario.bloqueado_ate).getTime() > Date.now()) {
    await verifyDummyPassword(password);
    await registrarEvento({
      usuarioId: usuario.id,
      usuarioEmail: usuario.email,
      tipoOperacao: 'auth.login_bloqueado',
      resultado: 'falha',
      ip,
      userAgent,
      detalhes: { motivo: 'conta_bloqueada' },
    });

    const retryAfter = segundosAte(usuario.bloqueado_ate);
    throw new HttpError(
      423,
      'ACCOUNT_LOCKED',
      'Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.',
      { headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  if (usuario.bloqueado_ate && new Date(usuario.bloqueado_ate).getTime() <= Date.now()) {
    await usuarioModel.limparBloqueioExpirado(usuario.id);
    usuario.tentativas_falhas = 0;
    usuario.bloqueado_ate = null;
  }

  if (!usuario.ativo) {
    await verifyDummyPassword(password);
    await registrarEvento({
      usuarioId: usuario.id,
      usuarioEmail: usuario.email,
      tipoOperacao: 'auth.login_falha',
      resultado: 'falha',
      ip,
      userAgent,
      detalhes: { motivo: 'usuario_inativo' },
    });
    throw new HttpError(401, 'INVALID_CREDENTIALS', GENERIC_CREDENTIALS_MESSAGE);
  }

  const senhaCorreta = await verifyPassword(password, usuario.senha_hash);

  if (!senhaCorreta) {
    const falha = await usuarioModel.registrarFalhaLogin(
      usuario.id,
      config.auth.maxAttempts,
      config.auth.lockMinutes
    );
    const bloqueado =
      falha?.bloqueado_ate && new Date(falha.bloqueado_ate).getTime() > Date.now();

    await registrarEvento({
      usuarioId: usuario.id,
      usuarioEmail: usuario.email,
      tipoOperacao: bloqueado ? 'auth.login_bloqueado' : 'auth.login_falha',
      resultado: 'falha',
      ip,
      userAgent,
      detalhes: {
        motivo: bloqueado ? 'limite_tentativas' : 'credenciais_invalidas',
        tentativas: falha?.tentativas_falhas,
      },
    });

    if (bloqueado) {
      throw new HttpError(
        423,
        'ACCOUNT_LOCKED',
        'Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.',
        { headers: { 'Retry-After': String(segundosAte(falha.bloqueado_ate)) } }
      );
    }

    throw new HttpError(401, 'INVALID_CREDENTIALS', GENERIC_CREDENTIALS_MESSAGE);
  }

  await usuarioModel.registrarLoginSucesso(usuario.id);

  const sessao = await criarSessao({
    usuario,
    ip,
    userAgent,
    lembrar: Boolean(lembrar),
  });

  await registrarEvento({
    usuarioId: usuario.id,
    usuarioEmail: usuario.email,
    tipoOperacao: 'auth.login',
    resultado: 'sucesso',
    ip,
    userAgent,
    detalhes: { lembrar: Boolean(lembrar) },
  });

  return sessao;
}

async function obterSessao(token) {
  if (!isTokenFormatValid(token)) return null;

  const tokenHash = hashToken(token);
  const sessao = await sessaoModel.buscarValidaPorHash(tokenHash);

  if (!sessao) return null;

  const permissoes = await usuarioModel.buscarPermissoesEfetivas(
    sessao.usuario_id,
    sessao.perfil_id
  );

  sessaoModel.registrarAcesso(sessao.sessao_id).catch(() => {});

  return {
    sessaoId: sessao.sessao_id,
    token,
    tokenHash,
    expiraEm: sessao.expira_em,
    usuario: usuarioPublico(
      {
        id: sessao.usuario_id,
        nome_completo: sessao.nome_completo,
        email: sessao.email,
        perfil: sessao.perfil,
        administrativo: sessao.administrativo,
        deve_trocar_senha: sessao.deve_trocar_senha,
      },
      permissoes
    ),
  };
}

async function logout({ token, ip, userAgent }) {
  if (!isTokenFormatValid(token)) return;

  const tokenHash = hashToken(token);
  const sessao = await sessaoModel.revogarPorHash(tokenHash, 'logout');

  if (sessao) {
    await registrarEvento({
      usuarioId: sessao.usuario_id,
      tipoOperacao: 'auth.logout',
      resultado: 'sucesso',
      ip,
      userAgent,
      detalhes: { motivo: 'logout' },
    });
  }
}

async function solicitarRecuperacaoSenha({ email, ip, userAgent }) {
  const emailNormalizado = normalizeEmail(email);

  if (!isValidEmail(emailNormalizado)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Informe um e-mail válido.'
    );
  }

  const usuario = await usuarioModel.buscarPorEmail(emailNormalizado);

  if (!usuario || !usuario.ativo) {
    return { message: GENERIC_RECOVERY_MESSAGE };
  }

  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiraEm = new Date(
    Date.now() + config.auth.resetTtlMinutes * 60 * 1000
  );

  await recuperacaoModel.criar({
    usuarioId: usuario.id,
    tokenHash,
    expiraEm,
    ip,
  });

  const url = `${config.app.url}/recuperar-senha.html?token=${encodeURIComponent(token)}`;
  let emailEnviado = false;

  try {
    emailEnviado = await emailService.enviarRecuperacaoSenha({
      para: usuario.email,
      nome: usuario.nome_completo,
      url,
    });
  } catch (error) {
    console.error('[auth] Falha ao enviar e-mail de recuperação:', error.message);
  }

  await registrarEvento({
    usuarioId: usuario.id,
    usuarioEmail: usuario.email,
    tipoOperacao: 'auth.recuperacao_solicitada',
    resultado: 'sucesso',
    ip,
    userAgent,
    detalhes: { emailEnviado },
  });

  return { message: GENERIC_RECOVERY_MESSAGE };
}

async function redefinirSenha({ token, novaSenha, ip, userAgent }) {
  if (!isTokenFormatValid(token)) {
    throw new HttpError(
      400,
      'INVALID_RESET_TOKEN',
      'O link de recuperação é inválido ou expirou.'
    );
  }

  const politica = passwordPolicyError(novaSenha);

  if (politica) {
    throw new HttpError(422, 'WEAK_PASSWORD', politica);
  }

  const senhaHash = await hashPassword(novaSenha);
  const resultado = await recuperacaoModel.redefinirSenhaComToken({
    tokenHash: hashToken(token),
    senhaHash,
  });

  if (!resultado) {
    await registrarEvento({
      tipoOperacao: 'auth.recuperacao_invalida',
      resultado: 'falha',
      ip,
      userAgent,
      detalhes: { motivo: 'token_invalido_ou_expirado' },
    });
    throw new HttpError(
      400,
      'INVALID_RESET_TOKEN',
      'O link de recuperação é inválido ou expirou.'
    );
  }

  await registrarEvento({
    usuarioId: resultado.usuario_id,
    usuarioEmail: resultado.email,
    tipoOperacao: 'auth.senha_redefinida',
    resultado: 'sucesso',
    ip,
    userAgent,
    detalhes: { sessoesRevogadas: true },
  });

  return {
    message: 'Senha redefinida com sucesso. Entre novamente com a nova senha.',
  };
}

module.exports = {
  GENERIC_CREDENTIALS_MESSAGE,
  GENERIC_RECOVERY_MESSAGE,
  login,
  obterSessao,
  logout,
  solicitarRecuperacaoSenha,
  redefinirSenha,
};
