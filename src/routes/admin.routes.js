'use strict';

const { Router } = require('express');
const adminController = require('../controllers/admin.controller');
const {
  requireAuth,
  requireAdministrativeProfile,
  requirePermission,
  requireAnyPermission,
} = require('../middlewares/auth');

const router = Router();

router.use(requireAuth);
router.use(requireAdministrativeProfile);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get(
  '/resumo',
  requirePermission('administracao.visualizar'),
  adminController.resumo
);

router.get(
  '/usuarios/opcoes',
  requireAnyPermission([
    'usuarios.gerenciar',
    'permissoes.gerenciar',
    'configuracoes.gerenciar',
  ]),
  adminController.listarOpcoesUsuarios
);

router.get(
  '/usuarios',
  requirePermission('usuarios.gerenciar'),
  adminController.listarUsuarios
);
router.post(
  '/usuarios',
  requirePermission('usuarios.gerenciar'),
  adminController.criarUsuario
);
router.get(
  '/usuarios/:id',
  requirePermission('usuarios.gerenciar'),
  adminController.obterUsuario
);
router.patch(
  '/usuarios/:id',
  requirePermission('usuarios.gerenciar'),
  adminController.atualizarUsuario
);
router.patch(
  '/usuarios/:id/status',
  requirePermission('usuarios.gerenciar'),
  adminController.atualizarStatusUsuario
);
router.post(
  '/usuarios/:id/redefinir-senha',
  requirePermission('usuarios.gerenciar'),
  adminController.redefinirSenhaUsuario
);
router.get(
  '/usuarios/:id/permissoes',
  requirePermission('permissoes.gerenciar'),
  adminController.obterPermissoesUsuario
);
router.put(
  '/usuarios/:id/permissoes',
  requirePermission('permissoes.gerenciar'),
  adminController.salvarPermissoesUsuario
);
router.get(
  '/usuarios/:id/acessos',
  requirePermission('permissoes.gerenciar'),
  adminController.obterAcessosUsuario
);
router.put(
  '/usuarios/:id/acessos',
  requirePermission('permissoes.gerenciar'),
  adminController.salvarAcessosUsuario
);

router.get(
  '/perfis/opcoes',
  requirePermission('usuarios.gerenciar'),
  adminController.listarOpcoesPerfis
);
router.get(
  '/perfis',
  requirePermission('permissoes.gerenciar'),
  adminController.listarPerfis
);
router.put(
  '/perfis/:id/permissoes',
  requirePermission('permissoes.gerenciar'),
  adminController.salvarPermissoesPerfil
);

router.get(
  '/recursos',
  requirePermission('permissoes.gerenciar'),
  adminController.listarRecursos
);

router.get(
  '/configuracoes',
  requirePermission('configuracoes.gerenciar'),
  adminController.obterConfiguracoes
);
router.put(
  '/configuracoes/visibilidade',
  requirePermission('configuracoes.gerenciar'),
  adminController.salvarVisibilidade
);

router.get(
  '/auditoria',
  requirePermission('auditoria.visualizar'),
  adminController.listarAuditoria
);

module.exports = router;
