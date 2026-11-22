'use strict';

const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const {
  loginLimiter,
  recoveryLimiter,
  resetLimiter,
} = require('../middlewares/rateLimiters');

const router = Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.post('/login', loginLimiter, authController.login);
router.get('/session', authController.session);
router.post('/logout', authController.logout);
router.post('/leave', authController.leave);
router.post('/resume', authController.resume);
router.post('/forgot-password', recoveryLimiter, authController.forgotPassword);
router.post('/reset-password', resetLimiter, authController.resetPassword);

module.exports = router;
