'use strict';

const { query } = require('../config/database');

const CLIENTE_LGPD_COLUMNS = `
  cl.id,
  cl.nome_completo,
  cl.cpf,
  cl.telefone,
  cl.whatsapp,
  cl.email,
  cl.endereco,
  cl.tipo_interesse,
  cl.finalidade_desejada,
  cl.faixa_preco_min,
  cl.faixa_preco_max,
  cl.localizacao_desejada,
  cl.observacoes,
  cl.criado_por_usuario_id,
  cl.criado_em,
  cl.atualizado_em,
  cl.excluido_em
`;

async function buscarCliente(clienteId) {
  const { rows } = await query(
    `SELECT ${CLIENTE_LGPD_COLUMNS}
       FROM clientes cl
      WHERE cl.id = $1
      LIMIT 1`,
    [clienteId]
  );
  return rows[0] || null;
}

async function buscarClientes(termo) {
  const padrao = `%${termo}%`;
  const digitos = termo.replace(/\D/g, '');
  const { rows } = await query(
    `SELECT id, nome_completo, cpf, email, telefone, excluido_em
       FROM clientes
      WHERE nome_completo ILIKE $1
         OR email ILIKE $1
         OR ($2 <> '' AND cpf LIKE $2)
      ORDER BY nome_completo ASC, id ASC
      LIMIT 20`,
    [padrao, digitos ? `%${digitos}%` : '']
  );
  return rows;
}

async function listarCorretores(clienteId) {
  const { rows } = await query(
    `SELECT c.id, c.nome_completo, c.creci, cc.principal
       FROM clientes_corretores cc
       JOIN corretores c ON c.id = cc.corretor_id
      WHERE cc.cliente_id = $1
      ORDER BY cc.principal DESC, c.nome_completo ASC`,
    [clienteId]
  );
  return rows;
}

async function listarImoveisInteresse(clienteId) {
  const { rows } = await query(
    `SELECT i.id,
            i.codigo_interno,
            i.titulo,
            i.tipo_imovel,
            i.finalidade,
            i.cidade,
            i.bairro,
            i.situacao,
            ci.criado_em
       FROM clientes_imoveis_interesse ci
       JOIN imoveis i ON i.id = ci.imovel_id
      WHERE ci.cliente_id = $1
      ORDER BY ci.criado_em DESC, i.id DESC`,
    [clienteId]
  );
  return rows;
}

async function listarAtendimentos(clienteId, limite = 500) {
  const { rows } = await query(
    `SELECT a.id,
            a.tipo,
            a.status,
            a.data_atendimento,
            a.descricao,
            a.observacoes,
            a.criado_em,
            c.nome_completo AS corretor,
            c.creci AS corretor_creci,
            i.codigo_interno AS imovel_codigo,
            i.titulo AS imovel_titulo
       FROM atendimentos a
       LEFT JOIN corretores c ON c.id = a.corretor_id
       LEFT JOIN imoveis i ON i.id = a.imovel_id
      WHERE a.cliente_id = $1
      ORDER BY a.data_atendimento DESC, a.id DESC
      LIMIT $2`,
    [clienteId, limite]
  );
  return rows;
}

async function bloquearCliente(client, clienteId) {
  const { rows } = await client.query(
    `SELECT id, nome_completo, excluido_em
       FROM clientes
      WHERE id = $1
      FOR UPDATE`,
    [clienteId]
  );
  return rows[0] || null;
}

async function anonimizarCliente(client, clienteId) {
  const { rows } = await client.query(
    `UPDATE clientes
        SET nome_completo = 'Cliente anonimizado #' || id::text,
            cpf = lpad(id::text, 11, '0'),
            telefone = NULL,
            whatsapp = NULL,
            email = NULL,
            endereco = NULL,
            tipo_interesse = NULL,
            finalidade_desejada = NULL,
            faixa_preco_min = NULL,
            faixa_preco_max = NULL,
            localizacao_desejada = NULL,
            observacoes = NULL,
            excluido_em = COALESCE(excluido_em, now())
      WHERE id = $1
      RETURNING id`,
    [clienteId]
  );
  return rows[0] || null;
}

async function anonimizarAtendimentos(client, clienteId) {
  const { rowCount } = await client.query(
    `UPDATE atendimentos
        SET descricao = 'Atendimento anonimizado por solicitacao LGPD.',
            observacoes = NULL
      WHERE cliente_id = $1`,
    [clienteId]
  );
  return rowCount;
}

async function removerVinculos(client, clienteId) {
  const acessos = await client.query(
    'DELETE FROM acessos_clientes WHERE cliente_id = $1',
    [clienteId]
  );
  const corretores = await client.query(
    'DELETE FROM clientes_corretores WHERE cliente_id = $1',
    [clienteId]
  );
  const imoveis = await client.query(
    'DELETE FROM clientes_imoveis_interesse WHERE cliente_id = $1',
    [clienteId]
  );

  return acessos.rowCount + corretores.rowCount + imoveis.rowCount;
}

module.exports = {
  buscarCliente,
  buscarClientes,
  listarCorretores,
  listarImoveisInteresse,
  listarAtendimentos,
  bloquearCliente,
  anonimizarCliente,
  anonimizarAtendimentos,
  removerVinculos,
};
