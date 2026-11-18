'use strict';

const { Router } = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const adminRoutes = require('./admin.routes');
const corretorRoutes = require('./corretores.routes');
const imovelRoutes = require('./imoveis.routes');
const { apiLimiter } = require('../middlewares/rateLimiters');

const router = Router();

router.use(apiLimiter);
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/administracao', adminRoutes);
router.use('/corretores', corretorRoutes);
router.use('/imoveis', imovelRoutes);

module.exports = router;
