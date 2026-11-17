'use strict';

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const routes = require('./routes');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');
const { securityHeaders, originCheck } = require('./middlewares/security');
const {
  authenticateSession,
  csrfProtection,
  requireAuthPage,
  redirectIfAuthenticated,
} = require('./middlewares/auth');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', false);

  app.use(helmet(securityHeaders()));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
  app.use(originCheck);
  app.use(authenticateSession);
  app.use(csrfProtection);

  app.get('/', redirectIfAuthenticated);
  app.get('/index.html', redirectIfAuthenticated);
  app.get('/app.html', requireAuthPage, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'app.html'));
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use('/api', routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
