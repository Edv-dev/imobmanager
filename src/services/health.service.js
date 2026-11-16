'use strict';

const config = require('../config/env');
const { checkDatabase } = require('../config/database');

async function getHealthStatus() {
  const database = await checkDatabase();
  const healthy = database.status === 'up';

  return {
    healthy,
    payload: {
      status: healthy ? 'ok' : 'degraded',
      service: 'imobmanager-api',
      environment: config.env,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: {
        database,
      },
    },
  };
}

module.exports = { getHealthStatus };
