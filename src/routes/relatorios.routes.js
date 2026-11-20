'use strict';

const { Router } = require('express');
const relatorioController = require('../controllers/relatorio.controller');
const { requireAuth, requirePermission } = require('../middlewares/auth');

const router = Router();

router.use(requireAuth);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get(
  '/',
  requirePermission('relatorios.visualizar'),
  relatorioController.listarCatalogo
);

router.get(
  '/opcoes',
  requirePermission('relatorios.visualizar'),
  relatorioController.obterOpcoes
);

router.get(
  '/:relatorio/exportacao',
  requirePermission('relatorios.exportar'),
  relatorioController.exportarRelatorio
);

router.get(
  '/:relatorio',
  requirePermission('relatorios.visualizar'),
  relatorioController.obterRelatorio
);

module.exports = router;
