'use strict';

const path = require('node:path');
const express = require('express');
const routes = require('./routes');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', false);

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use('/api', routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
