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
  requirePermission('dashboard.visualizar'),
  relatorioController.obterDashboard
);

module.exports = router;
