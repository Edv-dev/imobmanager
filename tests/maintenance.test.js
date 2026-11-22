'use strict';

process.env.NODE_ENV = 'test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { pool, closePool } = require('../src/config/database');
const { executarManutencao, RETENCAO_DIAS } = require('../src/services/maintenance.service');
const { expurgarAuditoriaTeste } = require('./helpers/auditoria');
const { hashPassword } = require('../src/utils/password');

const PREFIXO = `manutencao.${process.pid}.${Date.now()}`;

let usuarioId;
let inicio;
const sessoes = {};
const recuperacoes = {};

function token() {
  return crypto.randomBytes(32).toString('hex');
}

before(async () => {
  inicio = new Date();

  const { rows: perfis } = await pool.query(
    "SELECT id FROM perfis WHERE nome = 'Corretor' AND NOT administrativo"
  );
  const senhaHash = await hashPassword('SenhaManutencao123!');
  const { rows } = await pool.query(
    `INSERT INTO usuarios (perfil_id, nome_completo, email, senha_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [perfis[0].id, 'Usuario Manutencao', `${PREFIXO}@exemplo.test`, senhaHash]
  );
  usuarioId = rows[0].id;

  sessoes.expirada = token();
  sessoes.ativa = token();
  sessoes.revogadaAntiga = token();
  sessoes.revogadaRecente = token();

  await pool.query(
    `INSERT INTO sessoes
       (usuario_id, token_hash, criado_em, expira_em, revogado_em, revogado_motivo)
     VALUES
       ($1, $2, now() - INTERVAL '60 days', now() - INTERVAL '30 days', NULL, NULL),
       ($1, $3, now() - INTERVAL '1 hour', now() + INTERVAL '1 day', NULL, NULL),
       (
         $1, $4, now() - INTERVAL '60 days', now() + INTERVAL '1 day',
         now() - INTERVAL '30 days', 'teste'
       ),
       (
         $1, $5, now() - INTERVAL '2 days', now() + INTERVAL '1 day',
         now() - INTERVAL '1 day', 'teste'
       )`,
    [
      usuarioId,
      sessoes.expirada,
      sessoes.ativa,
      sessoes.revogadaAntiga,
      sessoes.revogadaRecente,
    ]
  );

  recuperacoes.usadaAntiga = token();
  recuperacoes.expirada = token();
  recuperacoes.usadaRecente = token();
  recuperacoes.ativa = token();

  await pool.query(
    `INSERT INTO recuperacoes_senha
       (usuario_id, token_hash, criado_em, expira_em, usado_em)
     VALUES
       (
         $1, $2, now() - INTERVAL '60 days',
         now() - INTERVAL '29 days', now() - INTERVAL '30 days'
       ),
       ($1, $3, now() - INTERVAL '60 days', now() - INTERVAL '30 days', NULL),
       (
         $1, $4, now() - INTERVAL '2 days',
         now() + INTERVAL '1 day', now() - INTERVAL '1 day'
       ),
       ($1, $5, now() - INTERVAL '1 hour', now() + INTERVAL '1 day', NULL)`,
    [
      usuarioId,
      recuperacoes.usadaAntiga,
      recuperacoes.expirada,
      recuperacoes.usadaRecente,
      recuperacoes.ativa,
    ]
  );
});

after(async () => {
  await expurgarAuditoriaTeste(
    `tipo_operacao = $1 AND data_hora >= $2`,
    ['sistema.manutencao', inicio]
  );
  await pool.query('DELETE FROM sessoes WHERE usuario_id = $1', [usuarioId]);
  await pool.query('DELETE FROM recuperacoes_senha WHERE usuario_id = $1', [usuarioId]);
  await pool.query('DELETE FROM usuarios WHERE id = $1', [usuarioId]);
  await closePool();
});

test('manutenção remove registros antigos e preserva os recentes', async () => {
  const resultado = await executarManutencao({ origem: 'teste' });

  assert.equal(resultado.retencaoDias, RETENCAO_DIAS);
  assert.ok(resultado.sessoesRemovidas >= 2);
  assert.ok(resultado.recuperacoesRemovidas >= 2);

  const { rows: sessoesRestantes } = await pool.query(
    'SELECT token_hash FROM sessoes WHERE usuario_id = $1',
    [usuarioId]
  );
  const hashesSessoes = new Set(sessoesRestantes.map((row) => row.token_hash));

  assert.equal(hashesSessoes.has(sessoes.expirada), false);
  assert.equal(hashesSessoes.has(sessoes.revogadaAntiga), false);
  assert.equal(hashesSessoes.has(sessoes.ativa), true);
  assert.equal(hashesSessoes.has(sessoes.revogadaRecente), true);

  const { rows: recuperacoesRestantes } = await pool.query(
    'SELECT token_hash FROM recuperacoes_senha WHERE usuario_id = $1',
    [usuarioId]
  );
  const hashesRecuperacoes = new Set(
    recuperacoesRestantes.map((row) => row.token_hash)
  );

  assert.equal(hashesRecuperacoes.has(recuperacoes.usadaAntiga), false);
  assert.equal(hashesRecuperacoes.has(recuperacoes.expirada), false);
  assert.equal(hashesRecuperacoes.has(recuperacoes.usadaRecente), true);
  assert.equal(hashesRecuperacoes.has(recuperacoes.ativa), true);

  const { rows: eventos } = await pool.query(
    `SELECT detalhes
       FROM auditoria
      WHERE tipo_operacao = 'sistema.manutencao'
        AND data_hora >= $1
      ORDER BY id DESC
      LIMIT 1`,
    [inicio]
  );

  assert.equal(eventos[0].detalhes.origem, 'teste');
  assert.ok(eventos[0].detalhes.sessoesRemovidas >= 2);
  assert.ok(eventos[0].detalhes.recuperacoesRemovidas >= 2);
});
