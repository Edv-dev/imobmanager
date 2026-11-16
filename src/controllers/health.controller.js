'use strict';

const healthService = require('../services/health.service');

async function getHealth(req, res, next) {
  try {
    const { healthy, payload } = await healthService.getHealthStatus();
    res.status(healthy ? 200 : 503).json(payload);
  } catch (error) {
    next(error);
  }
}

module.exports = { getHealth };
