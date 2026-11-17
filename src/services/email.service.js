'use strict';

const nodemailer = require('nodemailer');
const config = require('../config/env');

let transporter = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function smtpConfigurado() {
  return Boolean(config.smtp.host && config.smtp.from);
}

function obterTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user
      ? { user: config.smtp.user, pass: config.smtp.password }
      : undefined,
    disableFileAccess: true,
    disableUrlAccess: true,
  });

  return transporter;
}

async function enviarRecuperacaoSenha({ para, nome, url }) {
  const assunto = 'ImobManager · Redefinição de senha';
  const nomeSeguro = escapeHtml(nome || '');
  const urlSegura = escapeHtml(url);

  const texto = [
    `Olá${nome ? `, ${nome}` : ''}.`,
    '',
    'Recebemos uma solicitação para redefinir sua senha no ImobManager.',
    `Acesse o link abaixo para criar uma nova senha. Ele expira em ${config.auth.resetTtlMinutes} minutos e só pode ser usado uma vez:`,
    '',
    url,
    '',
    'Se você não solicitou esta alteração, ignore esta mensagem. Sua senha atual permanece válida.',
  ].join('\n');

  const html = `
    <p>Olá${nomeSeguro ? `, ${nomeSeguro}` : ''}.</p>
    <p>Recebemos uma solicitação para redefinir sua senha no <strong>ImobManager</strong>.</p>
    <p>O link abaixo expira em ${config.auth.resetTtlMinutes} minutos e só pode ser usado uma vez:</p>
    <p><a href="${urlSegura}">Criar uma nova senha</a></p>
    <p>Se você não solicitou esta alteração, ignore esta mensagem. Sua senha atual permanece válida.</p>
  `;

  if (!smtpConfigurado()) {
    if (config.env === 'development') {
      console.info(`[email:dev] Recuperação de senha para ${para}: ${url}`);
    } else if (!config.isTest) {
      console.warn(
        '[email] SMTP não configurado; o e-mail de recuperação de senha não foi enviado.'
      );
    }
    return false;
  }

  await obterTransporter().sendMail({
    from: config.smtp.from,
    to: para,
    subject: assunto,
    text: texto,
    html,
  });

  return true;
}

module.exports = {
  enviarRecuperacaoSenha,
};
