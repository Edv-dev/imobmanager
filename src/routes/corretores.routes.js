'use strict';

const { Router } = require('express');
const corretorController = require('../controllers/corretor.controller');
const { requireAuth, requirePermission } = require('../middlewares/auth');

const router = Router();

router.use(requireAuth);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get(
  '/',
  requirePermission('corretores.visualizar'),
  corretorController.listarCorretores
);

router.get(
  '/resumo',
  requirePermission('corretores.visualizar'),
  corretorController.obterResumo
);

router.get(
  '/usuarios-disponiveis',
  requirePermission('corretores.criar'),
  corretorController.listarUsuariosDisponiveis
);

router.get(
  '/:id',
  requirePermission('corretores.visualizar'),
  corretorController.obterCorretor
);

router.post('/', requirePermission('corretores.criar'), corretorController.criarCorretor);

router.patch(
  '/:id',
  requirePermission('corretores.editar'),
  corretorController.atualizarCorretor
);

router.patch(
  '/:id/status',
  requirePermission('corretores.desativar'),
  corretorController.atualizarStatusCorretor
);

module.exports = router;
