'use strict';

const multer = require('multer');
const config = require('../config/env');
const HttpError = require('../utils/http-error');

const MIMES_ACEITOS = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.uploads.maxImageBytes,
    files: config.uploads.maxImagesPerProperty,
    fields: 10,
  },
  fileFilter(req, file, callback) {
    if (!MIMES_ACEITOS.has(file.mimetype)) {
      return callback(
        new HttpError(
          422,
          'INVALID_IMAGE',
          'Envie apenas imagens JPEG, PNG ou WebP.'
        )
      );
    }

    return callback(null, true);
  },
});

function traduzirErroMulter(error) {
  if (!(error instanceof multer.MulterError)) return error;

  if (error.code === 'LIMIT_FILE_SIZE') {
    const limiteMb = Math.round((config.uploads.maxImageBytes / (1024 * 1024)) * 10) / 10;
    return new HttpError(
      413,
      'IMAGE_TOO_LARGE',
      `Cada imagem deve ter no máximo ${limiteMb} MB.`
    );
  }

  if (['LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE'].includes(error.code)) {
    return new HttpError(
      422,
      'IMAGE_LIMIT',
      `Envie no máximo ${config.uploads.maxImagesPerProperty} imagens por vez.`
    );
  }

  return new HttpError(422, 'INVALID_UPLOAD', 'Não foi possível processar o envio de imagens.');
}

function uploadImagens(req, res, next) {
  upload.array('imagens', config.uploads.maxImagesPerProperty)(req, res, (error) => {
    if (error) return next(traduzirErroMulter(error));
    return next();
  });
}

module.exports = {
  uploadImagens,
};
