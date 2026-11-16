'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pool } = require('../src/config/database');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations');
const ADVISORY_LOCK_KEY = 741852963;
const UP_PATTERN = /^(\d{3,})_.+\.up\.sql$/;
const COMMANDS = ['up', 'down', 'status'];

function checksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function loadMigrations() {
  const files = fs.readdirSync(MIGRATIONS_DIR);
  const upFiles = files.filter((file) => UP_PATTERN.test(file)).sort();

  if (upFiles.length === 0) {
    throw new Error('Nenhuma migration .up.sql encontrada em migrations/.');
  }

  const seen = new Set();

  return upFiles.map((file) => {
    const version = UP_PATTERN.exec(file)[1];

    if (seen.has(version)) {
      throw new Error(`Versao de migration duplicada: ${version}.`);
    }
    seen.add(version);

    const upPath = path.join(MIGRATIONS_DIR, file);
    const downFile = file.replace(/\.up\.sql$/, '.down.sql');
    const downPath = path.join(MIGRATIONS_DIR, downFile);
    const upSql = fs.readFileSync(upPath, 'utf8');

    return {
      version,
      nome: file.replace(/\.up\.sql$/, ''),
      upSql,
      downSql: fs.existsSync(downPath) ? fs.readFileSync(downPath, 'utf8') : null,
      checksum: checksum(upSql),
    };
  });
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      checksum TEXT NOT NULL,
      executado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function getAppliedMigrations(client) {
  const { rows } = await client.query(
    'SELECT version, nome, checksum, executado_em FROM schema_migrations ORDER BY version'
  );
  return rows;
}

function validateAppliedFiles(migrations, applied) {
  const knownVersions = new Set(migrations.map((migration) => migration.version));

  for (const row of applied) {
    if (!knownVersions.has(row.version)) {
      throw new Error(
        `A migration ${row.version} consta como aplicada no banco, mas o arquivo correspondente nao existe em migrations/.`
      );
    }
  }
}

async function migrateUp(client) {
  const migrations = loadMigrations();
  const applied = await getAppliedMigrations(client);
  validateAppliedFiles(migrations, applied);

  const appliedByVersion = new Map(applied.map((row) => [row.version, row]));
  let appliedCount = 0;

  for (const migration of migrations) {
    const existing = appliedByVersion.get(migration.version);

    if (existing) {
      if (existing.checksum !== migration.checksum) {
        throw new Error(
          `Checksum divergente para ${migration.nome}. O arquivo foi alterado depois de aplicado.`
        );
      }
      continue;
    }

    process.stdout.write(`[migrate] Aplicando ${migration.nome}... `);
    const startedAt = Date.now();

    await client.query('BEGIN');

    try {
      await client.query(migration.upSql);
      await client.query(
        'INSERT INTO schema_migrations (version, nome, checksum) VALUES ($1, $2, $3)',
        [migration.version, migration.nome, migration.checksum]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Falha ao aplicar ${migration.nome}: ${error.message}`);
    }

    console.log(`OK (${Date.now() - startedAt} ms)`);
    appliedCount += 1;
  }

  if (appliedCount === 0) {
    console.log('[migrate] Nenhuma migration pendente.');
  } else {
    console.log(`[migrate] ${appliedCount} migration(s) aplicada(s).`);
  }
}

async function migrateDown(client) {
  const migrations = loadMigrations();
  const applied = await getAppliedMigrations(client);
  validateAppliedFiles(migrations, applied);

  if (applied.length === 0) {
    console.log('[migrate] Nenhuma migration aplicada.');
    return;
  }

  const last = applied[applied.length - 1];
  const migration = migrations.find((item) => item.version === last.version);

  if (!migration.downSql) {
    throw new Error(`A migration ${migration.nome} nao possui arquivo .down.sql.`);
  }

  if (migration.checksum !== last.checksum) {
    throw new Error(
      `Checksum divergente para ${migration.nome}. Reversao cancelada por seguranca.`
    );
  }

  process.stdout.write(`[migrate] Revertendo ${migration.nome}... `);
  const startedAt = Date.now();

  await client.query('BEGIN');

  try {
    await client.query(migration.downSql);
    await client.query('DELETE FROM schema_migrations WHERE version = $1', [migration.version]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw new Error(`Falha ao reverter ${migration.nome}: ${error.message}`);
  }

  console.log(`OK (${Date.now() - startedAt} ms)`);
}

async function showStatus(client) {
  const migrations = loadMigrations();
  const applied = await getAppliedMigrations(client);
  validateAppliedFiles(migrations, applied);

  const appliedByVersion = new Map(applied.map((row) => [row.version, row]));
  let pendingCount = 0;

  console.log('');
  console.log('Versao  Status     Nome');

  for (const migration of migrations) {
    const row = appliedByVersion.get(migration.version);
    const status = row ? 'aplicada' : 'pendente';

    if (!row) pendingCount += 1;

    const executedAt = row
      ? ` (${new Date(row.executado_em).toLocaleString('pt-BR')})`
      : '';
    const checksumWarning = row && row.checksum !== migration.checksum
      ? ' [ATENCAO: checksum divergente]'
      : '';

    console.log(
      `${migration.version.padEnd(7)} ${status.padEnd(10)} ${migration.nome}${executedAt}${checksumWarning}`
    );
  }

  console.log('');
  console.log(
    `[migrate] ${applied.length} aplicada(s), ${pendingCount} pendente(s).`
  );
}

async function main() {
  const command = process.argv[2] || 'status';

  if (!COMMANDS.includes(command)) {
    console.error(`[migrate] Comando invalido: ${command}`);
    console.error('Uso: node scripts/migrate.js <up|down|status>');
    process.exitCode = 1;
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    await ensureMigrationsTable(client);

    if (command === 'up') {
      await migrateUp(client);
    } else if (command === 'down') {
      await migrateDown(client);
    } else {
      await showStatus(client);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => {});
    client.release();
  }
}

main()
  .catch((error) => {
    console.error(`[migrate] Erro: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
