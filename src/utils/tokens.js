'use strict';

const crypto = require('node:crypto');
const config = require('../config/env');

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function csrfTokenForSession(sessionToken) {
  return crypto
    .createHmac('sha256', config.session.secret)
    .update(`csrf:${sessionToken}`)
    .digest('base64url');
}

function safeEqualText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;

  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

module.exports = {
  generateToken,
  hashToken,
  csrfTokenForSession,
  safeEqualText,
};
