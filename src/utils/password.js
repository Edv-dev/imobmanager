'use strict';

const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 12;

/*
 * Hash de comparacao usado quando o e-mail nao existe, para reduzir a
 * diferenca de tempo entre credenciais invalidas e usuarios inexistentes.
 * Nao corresponde a nenhuma senha real do sistema.
 */
const DUMMY_HASH = '$2b$12$qLM4.kC6Zf4aWMON.PlByejjG79iorREpQYVwMPEuRM23/sN7.s5S';

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password, hash) {
  if (typeof hash !== 'string' || hash === '') return false;
  return bcrypt.compare(password, hash);
}

async function verifyDummyPassword(password) {
  await bcrypt.compare(typeof password === 'string' ? password : '', DUMMY_HASH);
  return false;
}

module.exports = {
  BCRYPT_ROUNDS,
  hashPassword,
  verifyPassword,
  verifyDummyPassword,
};
