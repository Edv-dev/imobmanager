'use strict';

process.env.NODE_ENV = 'test';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { criarBackup } = require('../src/services/backup.service');

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'imobmanager-backup-'));
const destino = path.join(raiz, 'backups');
const uploads = path.join(raiz, 'uploads');

fs.mkdirSync(path.join(uploads, 'imoveis', '1'), { recursive: true });
fs.writeFileSync(
  path.join(uploads, 'imoveis', '1', 'foto.jpg'),
  Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00])
);

const pgDumpDisponivel = spawnSync('pg_dump', ['--version']).status === 0;
const pgRestoreDisponivel = spawnSync('pg_restore', ['--version']).status === 0;

after(() => {
  fs.rmSync(raiz, { recursive: true, force: true });
});

test(
  'backup gera dump válido do banco e arquivo dos uploads',
  { skip: !pgDumpDisponivel || !pgRestoreDisponivel },
  () => {
    const resultado = criarBackup({
      destino,
      uploadsDir: uploads,
      retencaoDias: 30,
      agora: new Date('2026-01-02T03:04:05.006Z'),
    });

    assert.ok(fs.existsSync(resultado.arquivoBanco));
    assert.ok(resultado.bytesBanco > 0);
    assert.ok(resultado.arquivoUploads);
    assert.ok(fs.existsSync(resultado.arquivoUploads));
    assert.ok(resultado.bytesUploads > 0);
    assert.equal(resultado.retencaoDias, 30);

    const listagem = spawnSync(
      'pg_restore',
      ['--list', resultado.arquivoBanco],
      { encoding: 'utf8' }
    );

    assert.equal(listagem.status, 0, listagem.stderr);
    assert.match(listagem.stdout, /clientes/);
    assert.match(listagem.stdout, /auditoria/);
  }
);

test(
  'backup remove arquivos além da retenção',
  { skip: !pgDumpDisponivel },
  () => {
    const referencia = new Date();
    const antigo = path.join(destino, 'imobmanager-20200101T000000000Z.dump');
    const recente = path.join(destino, 'imobmanager-20990101T000000000Z.dump');
    const alheio = path.join(destino, 'outro-arquivo.txt');

    fs.writeFileSync(antigo, 'backup antigo');
    fs.writeFileSync(recente, 'backup recente');
    fs.writeFileSync(alheio, 'nao remover');

    const dataAntiga = new Date(referencia.getTime() - 40 * 24 * 60 * 60 * 1000);
    fs.utimesSync(antigo, dataAntiga, dataAntiga);

    const resultado = criarBackup({
      destino,
      uploadsDir: uploads,
      retencaoDias: 30,
      agora: referencia,
    });

    assert.ok(resultado.removidos >= 1);
    assert.equal(fs.existsSync(antigo), false);
    assert.equal(fs.existsSync(recente), true);
    assert.equal(fs.existsSync(alheio), true);
  }
);
