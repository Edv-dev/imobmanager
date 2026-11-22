'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config/env');

const PREFIXO_ARQUIVO = 'imobmanager-';
const RETENCAO_PADRAO = 30;

function carimbo(data) {
  return data
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('.', '');
}

function ambientePg() {
  const env = { ...process.env };

  if (config.db.url) {
    const parsed = new URL(config.db.url);
    env.PGHOST = parsed.hostname;
    env.PGPORT = parsed.port || '5432';
    env.PGDATABASE = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    env.PGUSER = decodeURIComponent(parsed.username);
    env.PGPASSWORD = decodeURIComponent(parsed.password);

    const sslmode = parsed.searchParams.get('sslmode');
    if (sslmode) env.PGSSLMODE = sslmode;
  } else {
    env.PGHOST = config.db.host;
    env.PGPORT = String(config.db.port);
    env.PGDATABASE = config.db.name;
    env.PGUSER = config.db.user;
    env.PGPASSWORD = config.db.password;
  }

  if (config.db.ssl && !env.PGSSLMODE) {
    env.PGSSLMODE = 'require';
  }

  if (!env.PGDATABASE) {
    throw new Error('Banco de dados não configurado para o backup.');
  }

  return env;
}

function executar(comando, argumentos, env) {
  const resultado = spawnSync(comando, argumentos, {
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (resultado.error) {
    throw new Error(`Não foi possível executar ${comando}: ${resultado.error.message}`);
  }

  if (resultado.status !== 0) {
    const detalhe = (resultado.stderr || '').trim();
    throw new Error(`${comando} falhou${detalhe ? `: ${detalhe}` : ''}`);
  }
}

function removerArquivo(caminho) {
  try {
    fs.unlinkSync(caminho);
  } catch {
    // Arquivo temporário já removido ou inexistente.
  }
}

function removerAntigos(destino, retencaoDias, agora) {
  const limite = agora.getTime() - retencaoDias * 24 * 60 * 60 * 1000;
  const padrao = new RegExp(`^${PREFIXO_ARQUIVO}.*(?:\\.dump|-uploads\\.tar\\.gz)$`);
  let removidos = 0;

  for (const nome of fs.readdirSync(destino)) {
    if (!padrao.test(nome)) continue;

    const caminho = path.join(destino, nome);
    const stat = fs.lstatSync(caminho);

    if (!stat.isFile() || stat.mtimeMs >= limite) continue;

    fs.unlinkSync(caminho);
    removidos += 1;
  }

  return removidos;
}

function criarBackup({
  destino = process.env.BACKUP_DIR || '/var/backups/imobmanager',
  retencaoDias = Number.parseInt(process.env.BACKUP_RETENTION_DAYS, 10) || RETENCAO_PADRAO,
  uploadsDir = config.uploads.dir,
  agora = new Date(),
} = {}) {
  const dias = Number.isInteger(retencaoDias) && retencaoDias > 0
    ? retencaoDias
    : RETENCAO_PADRAO;

  process.umask(0o077);
  fs.mkdirSync(destino, { recursive: true, mode: 0o700 });

  const env = ambientePg();
  const base = `${PREFIXO_ARQUIVO}${carimbo(agora)}`;
  const arquivoBanco = path.join(destino, `${base}.dump`);
  const temporarioBanco = `${arquivoBanco}.tmp`;

  try {
    executar(
      'pg_dump',
      [
        '--format=custom',
        '--compress=9',
        '--no-owner',
        '--no-privileges',
        '--file',
        temporarioBanco,
        `--dbname=${env.PGDATABASE}`,
      ],
      env
    );
    fs.renameSync(temporarioBanco, arquivoBanco);
  } catch (error) {
    removerArquivo(temporarioBanco);
    throw error;
  }

  let arquivoUploads = null;

  if (fs.existsSync(uploadsDir)) {
    const raiz = path.resolve(uploadsDir);
    arquivoUploads = path.join(destino, `${base}-uploads.tar.gz`);
    const temporarioUploads = `${arquivoUploads}.tmp`;

    try {
      executar(
        'tar',
        ['-czf', temporarioUploads, '-C', path.dirname(raiz), path.basename(raiz)],
        process.env
      );
      fs.renameSync(temporarioUploads, arquivoUploads);
    } catch (error) {
      removerArquivo(temporarioUploads);
      removerArquivo(arquivoBanco);
      throw error;
    }
  }

  const removidos = removerAntigos(destino, dias, agora);

  return {
    arquivoBanco,
    arquivoUploads,
    bytesBanco: fs.statSync(arquivoBanco).size,
    bytesUploads: arquivoUploads ? fs.statSync(arquivoUploads).size : 0,
    removidos,
    retencaoDias: dias,
    executadoEm: agora.toISOString(),
  };
}

module.exports = {
  RETENCAO_PADRAO,
  criarBackup,
};
