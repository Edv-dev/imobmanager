'use strict';

const { Router } = require('express');
const atendimentoController = require('../controllers/atendimento.controller');
const { requireAuth, requirePermission } = require('../middlewares/auth');

const router = Router();

router.use(requireAuth);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get(
  '/',
  requirePermission('atendimentos.visualizar'),
  atendimentoController.listarAtendimentos
);

module.exports = router;
