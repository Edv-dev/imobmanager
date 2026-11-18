'use strict';

const HttpError = require('./http-error');

const CORE_ADMIN_PERMISSIONS = [
  'administracao.visualizar',
  'usuarios.gerenciar',
  'permissoes.gerenciar',
];

const ADMIN_MODULE = 'administracao';

function garantirAdministrador(ator) {
  if (!ator?.usuario?.administrativo) {
    throw new HttpError(
      403,
      'ADMIN_REQUIRED',
      'Apenas administradores podem alterar usuários, permissões e configurações.'
    );
  }
}

function garantirPermissao(ator, permissao, mensagem = 'Você não possui permissão para esta ação.') {
  if (!ator?.usuario?.permissoes?.includes(permissao)) {
    throw new HttpError(403, 'FORBIDDEN', mensagem);
  }
}

function garantirNaoProprio(ator, alvoId, code = 'SELF_OPERATION') {
  if (Number(ator?.usuario?.id) === Number(alvoId)) {
    throw new HttpError(
      403,
      code,
      'Você não pode alterar as próprias permissões ou o próprio acesso por esta área.'
    );
  }
}

module.exports = {
  CORE_ADMIN_PERMISSIONS,
  ADMIN_MODULE,
  garantirAdministrador,
  garantirPermissao,
  garantirNaoProprio,
};
