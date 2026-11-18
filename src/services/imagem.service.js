'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const config = require('../config/env');
const HttpError = require('../utils/http-error');

const TIPOS = {
  jpeg: { mime: 'image/jpeg', extensao: 'jpg' },
  png: { mime: 'image/png', extensao: 'png' },
  webp: { mime: 'image/webp', extensao: 'webp' },
};

function detectarTipo(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return TIPOS.jpeg;
  }

  const assinaturaPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  if (buffer.subarray(0, 8).equals(assinaturaPng)) {
    return TIPOS.png;
  }

  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return TIPOS.webp;
  }

  return null;
}

function raizUploads() {
  return path.resolve(config.uploads.dir);
}

function caminhoAbsoluto(caminhoRelativo) {
  const raiz = raizUploads();
  const absoluto = path.resolve(raiz, caminhoRelativo);

  if (absoluto !== raiz && !absoluto.startsWith(`${raiz}${path.sep}`)) {
    throw new Error('Caminho de imagem inválido.');
  }

  return absoluto;
}

async function salvar(imovelId, buffer) {
  const tipo = detectarTipo(buffer);

  if (!tipo) {
    throw new HttpError(
      422,
      'INVALID_IMAGE',
      'O arquivo enviado não é uma imagem JPEG, PNG ou WebP válida.'
    );
  }

  const caminhoRelativo = path.posix.join(
    'imoveis',
    String(imovelId),
    `${crypto.randomUUID()}.${tipo.extensao}`
  );
  const destino = caminhoAbsoluto(caminhoRelativo);

  await fs.mkdir(path.dirname(destino), { recursive: true });
  await fs.writeFile(destino, buffer, { mode: 0o600, flag: 'wx' });

  return {
    caminhoArquivo: caminhoRelativo,
    mimeType: tipo.mime,
    tamanhoBytes: buffer.length,
  };
}

async function remover(caminhoRelativo) {
  try {
    await fs.unlink(caminhoAbsoluto(caminhoRelativo));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`[imagens] Falha ao remover ${caminhoRelativo}:`, error.message);
    }
  }
}

async function removerVarios(caminhos) {
  await Promise.all(caminhos.map((caminho) => remover(caminho)));
}

module.exports = {
  detectarTipo,
  caminhoAbsoluto,
  salvar,
  remover,
  removerVarios,
};
