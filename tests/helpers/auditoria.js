'use strict';

const { pool } = require('../../src/config/database');

/**
 * Remove eventos de auditoria criados pela suíte.
 * A tabela é protegida por trigger; a manutenção exige a variável local usada
 * também pelas rotinas de retenção e redação LGPD.
 */
async function expurgarAuditoriaTeste(where, params = []) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT set_config('imobmanager.auditoria_manutencao', 'on', true)"
    );
    await client.query(`DELETE FROM auditoria WHERE ${where}`, params);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  expurgarAuditoriaTeste,
};
