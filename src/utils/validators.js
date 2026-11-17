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
};
