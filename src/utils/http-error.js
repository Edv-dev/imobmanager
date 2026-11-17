'use strict';

class HttpError extends Error {
  constructor(status, code, message, { headers = {} } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

module.exports = HttpError;
