'use strict';

const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(value) {
  if (typeof value !== 'string') return false;
  if (value.length < 3 || value.length > EMAIL_MAX_LENGTH) return false;
  if (/[\u0000-\u001f\u007f\s]/.test(value)) return false;
  return /^[^@]+@[^@]+\.[^@]+$/.test(value);
}

function passwordPolicyError(password) {
  if (typeof password !== 'string') {
    return 'Informe uma senha válida.';
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return `A senha deve ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`;
  }

  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) {
    return 'A senha deve conter letras e números.';
  }

  if (/^\s|\s$/.test(password)) {
    return 'A senha não deve começar nem terminar com espaços.';
  }

  return null;
}

function normalizeName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function isValidName(value) {
  return value.length >= 3 && value.length <= 150;
}

function sanitizeUserAgent(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 300) : null;
}

function isTokenFormatValid(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(value);
}

function normalizeCpf(value) {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

function isValidCpf(value) {
  const cpf = normalizeCpf(value);

  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split('').map(Number);

  const primeiroDigito = (() => {
    const soma = digits.slice(0, 9).reduce((total, digito, indice) => {
      return total + digito * (10 - indice);
    }, 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  })();

  const segundoDigito = (() => {
    const soma = digits.slice(0, 10).reduce((total, digito, indice) => {
      return total + digito * (11 - indice);
    }, 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  })();

  return digits[9] === primeiroDigito && digits[10] === segundoDigito;
}

function normalizeCreci(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function isValidCreci(value) {
  const creci = normalizeCreci(value);
  return creci.length >= 3 && creci.length <= 40 && /^[A-Za-z0-9./\-\s]+$/.test(creci);
}

function normalizePhone(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function isValidPhone(value) {
  const telefone = normalizePhone(value);
  if (!telefone) return false;
  if (telefone.length < 8 || telefone.length > 20) return false;
  if (!/^[0-9+()\-\s]+$/.test(telefone)) return false;
  return (telefone.match(/\d/g) || []).length >= 8;
}

function normalizeOptionalText(value, maxLength = 255) {
  if (typeof value !== 'string') return null;
  const texto = value.trim().replace(/\s+/g, ' ');
  if (!texto) return null;
  return texto.slice(0, maxLength);
}

module.exports = {
  EMAIL_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  normalizeEmail,
  isValidEmail,
  passwordPolicyError,
  normalizeName,
  isValidName,
  sanitizeUserAgent,
  isTokenFormatValid,
  normalizeCpf,
  isValidCpf,
  normalizeCreci,
  isValidCreci,
  normalizePhone,
  isValidPhone,
  normalizeOptionalText,
};
