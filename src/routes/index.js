'use strict';

const { Router } = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const adminRoutes = require('./admin.routes');
const corretorRoutes = require('./corretores.routes');
const imovelRoutes = require('./imoveis.routes');
const clienteRoutes = require('./clientes.routes');
const atendimentoRoutes = require('./atendimentos.routes');
const dashboardRoutes = require('./dashboard.routes');
const relatorioRoutes = require('./relatorios.routes');
const { apiLimiter } = require('../middlewares/rateLimiters');

const router = Router();

router.use(apiLimiter);
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/administracao', adminRoutes);
router.use('/corretores', corretorRoutes);
router.use('/imoveis', imovelRoutes);
router.use('/clientes', clienteRoutes);
router.use('/atendimentos', atendimentoRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/relatorios', relatorioRoutes);

module.exports = router;
