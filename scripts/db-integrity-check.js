'use strict';

const { pool } = require('../src/config/database');

const EXPECTED_TABLES = [
  'acessos_clientes',
  'acessos_imoveis',
  'auditoria',
  'atendimentos',
  'clientes',
  'clientes_corretores',
  'clientes_imoveis_interesse',
  'configuracoes',
  'corretores',
  'imagens_imoveis',
  'imoveis',
  'imoveis_corretores',
  'perfis',
  'perfis_permissoes',
  'permissoes',
  'permissoes_usuarios',
  'recuperacoes_senha',
  'sessoes',
  'usuarios',
];

const EXPECTED_FKS = [
  'fk_usuarios_perfil',
  'fk_perfis_permissoes_perfil',
  'fk_perfis_permissoes_permissao',
  'fk_permissoes_usuarios_usuario',
  'fk_permissoes_usuarios_permissao',
  'fk_permissoes_usuarios_concedido_por',
  'fk_corretores_usuario',
  'fk_clientes_criado_por',
  'fk_imoveis_criado_por',
  'fk_imagens_imoveis_imovel',
  'fk_imoveis_corretores_imovel',
  'fk_imoveis_corretores_corretor',
  'fk_clientes_corretores_cliente',
  'fk_clientes_corretores_corretor',
  'fk_clientes_imoveis_interesse_cliente',
  'fk_clientes_imoveis_interesse_imovel',
  'fk_atendimentos_cliente',
  'fk_atendimentos_corretor',
  'fk_atendimentos_imovel',
  'fk_atendimentos_criado_por',
  'fk_configuracoes_atualizado_por',
  'fk_auditoria_usuario',
  'fk_sessoes_usuario',
  'fk_recuperacoes_senha_usuario',
  'fk_acessos_imoveis_usuario',
  'fk_acessos_imoveis_imovel',
  'fk_acessos_imoveis_concedido_por',
  'fk_acessos_clientes_usuario',
  'fk_acessos_clientes_cliente',
  'fk_acessos_clientes_concedido_por',
];

const EXPECTED_UNIQUE_INDEXES = [
  'uq_usuarios_email_ativo',
  'uq_corretores_usuario_ativo',
  'uq_corretores_cpf_ativo',
  'uq_corretores_creci_ativo',
  'uq_corretores_email_ativo',
  'uq_clientes_cpf_ativo',
  'uq_imoveis_codigo_ativo',
  'uq_imagens_imoveis_principal',
  'uq_imoveis_corretores_principal',
  'uq_clientes_corretores_principal',
  'uq_acessos_imoveis_usuario_imovel',
  'uq_acessos_clientes_usuario_cliente',
];

const EXPECTED_UPDATED_AT_TRIGGERS = [
  'trg_acessos_clientes_atualizado_em',
  'trg_acessos_imoveis_atualizado_em',
  'trg_atendimentos_atualizado_em',
  'trg_clientes_atualizado_em',
  'trg_configuracoes_atualizado_em',
  'trg_corretores_atualizado_em',
  'trg_imoveis_atualizado_em',
  'trg_perfis_atualizado_em',
  'trg_permissoes_usuarios_atualizado_em',
  'trg_usuarios_atualizado_em',
];

const TEST_EMAILS = [
  'integracao.admin@exemplo.test',
  'integracao.corretor@exemplo.test',
  'integracao.corretor2@exemplo.test',
];

let passed = 0;
let failed = 0;
let savepointCounter = 0;

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`[OK]    ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`[FALHA] ${name}: ${error.message}`);
  }
}

async function fetchOne(client, sql, params = []) {
  const { rows } = await client.query(sql, params);
  return rows[0];
}

async function expectDbError(client, { sql, params = [], code, constraint }) {
  const savepoint = `sp_integridade_${(savepointCounter += 1)}`;
  await client.query(`SAVEPOINT ${savepoint}`);

  try {
    await client.query(sql, params);
    throw new Error(
      `Esperava erro ${code}${constraint ? ` (${constraint})` : ''}, mas a operacao foi aceita.`
    );
  } catch (error) {
    const isExpectedFailure = error.message.startsWith('Esperava erro ');
    if (isExpectedFailure) throw error;

    if (error.code !== code) {
      throw new Error(`Esperava erro ${code}, recebido ${error.code || 'sem codigo'}: ${error.message}`);
    }

    if (constraint && error.constraint !== constraint) {
      throw new Error(
        `Esperava a constraint ${constraint}, recebido ${error.constraint || 'nenhuma'}.`
      );
    }
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  }
}

async function main() {
  const client = await pool.connect();
  let dataChecksCompleted = false;

  try {
    const { rows: tables } = await client.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])`,
      [EXPECTED_TABLES]
    );
    const existingTables = new Set(tables.map((row) => row.table_name));
    const missingTables = EXPECTED_TABLES.filter((table) => !existingTables.has(table));

    await check('Todas as 19 tabelas existem no schema public', async () => {
      if (missingTables.length > 0) {
        throw new Error(`Tabelas ausentes: ${missingTables.join(', ')}. Execute npm run migrate:up.`);
      }
    });

    if (missingTables.length > 0) {
      throw new Error('Schema incompleto; testes de dados nao executados.');
    }

    await check('Tabela de controle de migrations existe', async () => {
      const row = await fetchOne(
        client,
        `SELECT 1 AS ok FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'schema_migrations'`
      );
      if (!row) throw new Error('Tabela schema_migrations ausente.');
    });

    await check('Todas as chaves estrangeiras esperadas existem', async () => {
      const { rows } = await client.query(
        `SELECT conname FROM pg_constraint
          WHERE contype = 'f' AND connamespace = 'public'::regnamespace`
      );
      const found = new Set(rows.map((row) => row.conname));
      const missing = EXPECTED_FKS.filter((name) => !found.has(name));
      if (missing.length > 0) throw new Error(`FKs ausentes: ${missing.join(', ')}.`);
    });

    await check('Indices unicos parciais esperados existem', async () => {
      const { rows } = await client.query(
        `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`
      );
      const found = new Set(rows.map((row) => row.indexname));
      const missing = EXPECTED_UNIQUE_INDEXES.filter((name) => !found.has(name));
      if (missing.length > 0) throw new Error(`Indices ausentes: ${missing.join(', ')}.`);
    });

    await check('Triggers de atualizado_em existem', async () => {
      const { rows } = await client.query(
        `SELECT tgname FROM pg_trigger
          WHERE NOT tgisinternal
            AND tgname LIKE 'trg_%_atualizado_em'`
      );
      const found = new Set(rows.map((row) => row.tgname));
      const missing = EXPECTED_UPDATED_AT_TRIGGERS.filter((name) => !found.has(name));
      if (missing.length > 0) throw new Error(`Triggers ausentes: ${missing.join(', ')}.`);
    });

    await check('Perfis de referencia foram criados corretamente', async () => {
      const admin = await fetchOne(
        client,
        `SELECT administrativo FROM perfis WHERE nome = 'Administrador'`
      );
      const corretor = await fetchOne(
        client,
        `SELECT administrativo FROM perfis WHERE nome = 'Corretor'`
      );

      if (!admin) throw new Error('Perfil Administrador ausente.');
      if (!corretor) throw new Error('Perfil Corretor ausente.');
      if (admin.administrativo !== true) throw new Error('Perfil Administrador sem flag administrativo.');
      if (corretor.administrativo !== false) throw new Error('Perfil Corretor marcado como administrativo.');
    });

    await check('Permissoes gerais e individuais estao em tabelas separadas', async () => {
      const gerais = await fetchOne(
        client,
        `SELECT count(*)::int AS total FROM perfis_permissoes`
      );
      const individuais = await fetchOne(
        client,
        `SELECT count(*)::int AS total FROM permissoes_usuarios`
      );

      if (gerais.total < 1) throw new Error('Nenhuma permissao geral cadastrada.');
      if (typeof individuais.total !== 'number') throw new Error('Tabela de permissoes individuais inacessivel.');
    });

    await check('Administrador recebe todas as permissoes do catalogo', async () => {
      const total = await fetchOne(client, `SELECT count(*)::int AS total FROM permissoes`);
      const adminTotal = await fetchOne(
        client,
        `SELECT count(*)::int AS total
           FROM perfis_permissoes pp
           JOIN perfis p ON p.id = pp.perfil_id
          WHERE p.nome = 'Administrador'`
      );
      const corretorTotal = await fetchOne(
        client,
        `SELECT count(*)::int AS total
           FROM perfis_permissoes pp
           JOIN perfis p ON p.id = pp.perfil_id
          WHERE p.nome = 'Corretor'`
      );

      if (total.total !== 24) throw new Error(`Esperadas 24 permissoes, encontradas ${total.total}.`);
      if (adminTotal.total !== total.total) {
        throw new Error(`Administrador deveria ter ${total.total} permissoes, possui ${adminTotal.total}.`);
      }
      if (corretorTotal.total < 1) throw new Error('Corretor sem permissoes operacionais iniciais.');
    });

    await check('Configuracoes de visibilidade existem com valores validos', async () => {
      const { rows } = await client.query(
        `SELECT chave, valor FROM configuracoes
          WHERE chave IN ('imoveis.visibilidade', 'clientes.visibilidade')`
      );
      const values = new Map(rows.map((row) => [row.chave, row.valor]));

      for (const key of ['imoveis.visibilidade', 'clientes.visibilidade']) {
        if (!values.has(key)) throw new Error(`Configuracao ${key} ausente.`);
        if (!['todos', 'vinculados'].includes(values.get(key))) {
          throw new Error(`Valor invalido para ${key}: ${values.get(key)}.`);
        }
      }
    });

    await client.query('BEGIN');

    const adminProfile = await fetchOne(
      client,
      `SELECT id FROM perfis WHERE nome = 'Administrador'`
    );
    const corretorProfile = await fetchOne(
      client,
      `SELECT id FROM perfis WHERE nome = 'Corretor'`
    );
    const visualizarImoveis = await fetchOne(
      client,
      `SELECT id FROM permissoes WHERE chave = 'imoveis.visualizar'`
    );
    const editarImoveis = await fetchOne(
      client,
      `SELECT id FROM permissoes WHERE chave = 'imoveis.editar'`
    );
    const excluirImoveis = await fetchOne(
      client,
      `SELECT id FROM permissoes WHERE chave = 'imoveis.excluir'`
    );

    const adminUser = await fetchOne(
      client,
      `INSERT INTO usuarios (perfil_id, nome_completo, email, senha_hash)
       VALUES ($1, 'Usuario Admin de Teste', $2, 'hash::teste')
       RETURNING id`,
      [adminProfile.id, TEST_EMAILS[0]]
    );
    const corretorUser = await fetchOne(
      client,
      `INSERT INTO usuarios (perfil_id, nome_completo, email, senha_hash)
       VALUES ($1, 'Usuario Corretor de Teste', $2, 'hash::teste')
       RETURNING id`,
      [corretorProfile.id, TEST_EMAILS[1]]
    );
    const corretorUser2 = await fetchOne(
      client,
      `INSERT INTO usuarios (perfil_id, nome_completo, email, senha_hash)
       VALUES ($1, 'Usuario Corretor 2 de Teste', $2, 'hash::teste')
       RETURNING id`,
      [corretorProfile.id, TEST_EMAILS[2]]
    );

    await check('Administrador existe sem registro de corretor', async () => {
      const row = await fetchOne(
        client,
        `SELECT u.id, p.administrativo
           FROM usuarios u JOIN perfis p ON p.id = u.perfil_id
          WHERE u.id = $1`,
        [adminUser.id]
      );
      if (!row || row.administrativo !== true) {
        throw new Error('Usuario administrador nao foi criado com perfil administrativo.');
      }
      const corretor = await fetchOne(
        client,
        `SELECT 1 AS existe FROM corretores WHERE usuario_id = $1`,
        [adminUser.id]
      );
      if (corretor) throw new Error('Administrador nao deveria possuir registro de corretor.');
    });

    const corretor = await fetchOne(
      client,
      `INSERT INTO corretores (usuario_id, nome_completo, cpf, creci, email)
       VALUES ($1, 'Corretor de Teste', '11144477735', 'CRECI-TESTE-001', 'integracao.corretor@exemplo.test')
       RETURNING id`,
      [corretorUser.id]
    );

    const cliente = await fetchOne(
      client,
      `INSERT INTO clientes
         (nome_completo, cpf, finalidade_desejada, faixa_preco_min, faixa_preco_max, criado_por_usuario_id)
       VALUES ('Cliente de Teste', '52998224725', 'venda', 100000, 500000, $1)
       RETURNING id`,
      [corretorUser.id]
    );

    const imovel = await fetchOne(
      client,
      `INSERT INTO imoveis
         (codigo_interno, titulo, tipo_imovel, finalidade, cep, estado, cidade, bairro, valor_venda, criado_por_usuario_id)
       VALUES ('TESTE-INT-001', 'Imovel de Teste', 'apartamento', 'venda', '01001000', 'SP', 'Sao Paulo', 'Centro', 500000.00, $1)
       RETURNING id`,
      [adminUser.id]
    );

    await client.query(
      `INSERT INTO imagens_imoveis
         (imovel_id, caminho_arquivo, nome_original, mime_type, tamanho_bytes, ordem, principal)
       VALUES ($1, 'teste/fachada.jpg', 'fachada.jpg', 'image/jpeg', 2048, 0, true)`,
      [imovel.id]
    );

    await client.query(
      `INSERT INTO imoveis_corretores (imovel_id, corretor_id, principal)
       VALUES ($1, $2, true)`,
      [imovel.id, corretor.id]
    );

    await client.query(
      `INSERT INTO atendimentos (cliente_id, corretor_id, imovel_id, tipo, descricao, criado_por_usuario_id)
       VALUES ($1, $2, $3, 'visita', 'Atendimento de teste de integridade', $4)`,
      [cliente.id, corretor.id, imovel.id, corretorUser.id]
    );

    await client.query(
      `INSERT INTO auditoria
         (usuario_id, usuario_email, tipo_operacao, entidade, registro_id, resultado, detalhes)
       VALUES ($1, $2, 'login', 'usuarios', $3, 'sucesso', '{"origem":"teste"}'::jsonb)`,
      [adminUser.id, TEST_EMAILS[0], String(adminUser.id)]
    );

    await client.query(
      `INSERT INTO acessos_imoveis (usuario_id, imovel_id, permitido, concedido_por_usuario_id)
       VALUES ($1, $2, true, $3)`,
      [corretorUser.id, imovel.id, adminUser.id]
    );

    await check('Excecao de acesso a imovel e unica por usuario e registro', async () => {
      await expectDbError(client, {
        sql: `INSERT INTO acessos_imoveis (usuario_id, imovel_id, permitido)
              VALUES ($1, $2, false)`,
        params: [corretorUser.id, imovel.id],
        code: '23505',
        constraint: 'uq_acessos_imoveis_usuario_imovel',
      });
    });

    await check('Permissao individual coexiste com a permissao geral do perfil', async () => {
      await client.query(
        `INSERT INTO permissoes_usuarios (usuario_id, permissao_id, permitido, concedido_por_usuario_id)
         VALUES ($1, $2, false, $3)`,
        [corretorUser.id, visualizarImoveis.id, adminUser.id]
      );

      const geral = await fetchOne(
        client,
        `SELECT 1 AS existe FROM perfis_permissoes
          WHERE perfil_id = $1 AND permissao_id = $2`,
        [corretorProfile.id, visualizarImoveis.id]
      );
      const individual = await fetchOne(
        client,
        `SELECT permitido FROM permissoes_usuarios
          WHERE usuario_id = $1 AND permissao_id = $2`,
        [corretorUser.id, visualizarImoveis.id]
      );

      if (!geral) throw new Error('Permissao geral do perfil nao encontrada.');
      if (!individual || individual.permitido !== false) {
        throw new Error('Excecao individual nao foi armazenada separadamente.');
      }
    });

    await check('Excecao individual pode conceder permissao extra', async () => {
      await client.query(
        `INSERT INTO permissoes_usuarios (usuario_id, permissao_id, permitido, concedido_por_usuario_id)
         VALUES ($1, $2, true, $3)`,
        [corretorUser.id, excluirImoveis.id, adminUser.id]
      );

      const row = await fetchOne(
        client,
        `SELECT permitido FROM permissoes_usuarios
          WHERE usuario_id = $1 AND permissao_id = $2`,
        [corretorUser.id, excluirImoveis.id]
      );
      if (!row || row.permitido !== true) {
        throw new Error('Excecao individual de concessao nao foi registrada.');
      }
    });

    await check('E-mail duplicado de usuario ativo e rejeitado', async () => {
      await expectDbError(client, {
        sql: `INSERT INTO usuarios (perfil_id, nome_completo, email, senha_hash)
              VALUES ($1, 'Duplicado', $2, 'hash::teste')`,
        params: [adminProfile.id, TEST_EMAILS[0]],
        code: '23505',
        constraint: 'uq_usuarios_email_ativo',
      });
    });

    await check('CPF duplicado de corretor ativo e rejeitado', async () => {
      await expectDbError(client, {
        sql: `INSERT INTO corretores (usuario_id, nome_completo, cpf, creci)
              VALUES ($1, 'Corretor Duplicado', '11144477735', 'CRECI-TESTE-002')`,
        params: [corretorUser2.id],
        code: '23505',
        constraint: 'uq_corretores_cpf_ativo',
      });
    });

    await check('Codigo interno duplicado de imovel ativo e rejeitado', async () => {
      await expectDbError(client, {
        sql: `INSERT INTO imoveis (codigo_interno, titulo, tipo_imovel, finalidade)
              VALUES ('TESTE-INT-001', 'Outro imovel', 'casa', 'aluguel')`,
        code: '23505',
        constraint: 'uq_imoveis_codigo_ativo',
      });
    });

    await check('Apenas uma imagem principal por imovel', async () => {
      await expectDbError(client, {
        sql: `INSERT INTO imagens_imoveis
                (imovel_id, caminho_arquivo, mime_type, tamanho_bytes, principal)
              VALUES ($1, 'teste/segunda-principal.jpg', 'image/jpeg', 1024, true)`,
        params: [imovel.id],
        code: '23505',
        constraint: 'uq_imagens_imoveis_principal',
      });

      await client.query(
        `INSERT INTO imagens_imoveis
           (imovel_id, caminho_arquivo, mime_type, tamanho_bytes, ordem, principal)
         VALUES ($1, 'teste/secundaria.jpg', 'image/webp', 512, 1, false)`,
        [imovel.id]
      );
    });

    await check('Violacao de chave estrangeira e rejeitada', async () => {
      await expectDbError(client, {
        sql: `INSERT INTO corretores (usuario_id, nome_completo, cpf, creci)
              VALUES (999999999, 'Corretor Fantasma', '39053344705', 'CRECI-FANTASMA')`,
        code: '23503',
        constraint: 'fk_corretores_usuario',
      });
    });

    await check('Exclusao de usuario com corretor vinculado e bloqueada', async () => {
      await expectDbError(client, {
        sql: 'DELETE FROM usuarios WHERE id = $1',
        params: [corretorUser.id],
        code: '23001',
        constraint: 'fk_corretores_usuario',
      });
    });

    await check('Valores negativos e finalidade invalida sao rejeitados', async () => {
      await expectDbError(client, {
        sql: `INSERT INTO imoveis (codigo_interno, titulo, tipo_imovel, finalidade, valor_venda)
              VALUES ('TESTE-INT-002', 'Imovel com valor negativo', 'casa', 'venda', -1)`,
        code: '23514',
        constraint: 'ck_imoveis_valores_nao_negativos',
      });

      await expectDbError(client, {
        sql: `INSERT INTO imoveis (codigo_interno, titulo, tipo_imovel, finalidade)
              VALUES ('TESTE-INT-003', 'Imovel com finalidade invalida', 'casa', 'permuta')`,
        code: '23514',
        constraint: 'ck_imoveis_finalidade',
      });
    });

    await check('Formato invalido de CPF e e-mail e rejeitado', async () => {
      await expectDbError(client, {
        sql: `INSERT INTO corretores (usuario_id, nome_completo, cpf, creci)
              VALUES ($1, 'Corretor CPF Invalido', '123', 'CRECI-INVALIDO')`,
        params: [corretorUser2.id],
        code: '23514',
        constraint: 'ck_corretores_cpf_formato',
      });

      await expectDbError(client, {
        sql: `INSERT INTO usuarios (perfil_id, nome_completo, email, senha_hash)
              VALUES ($1, 'Usuario Email Invalido', 'EMAIL-MAIUSCULO@EXEMPLO.TEST', 'hash::teste')`,
        params: [adminProfile.id],
        code: '23514',
        constraint: 'ck_usuarios_email',
      });
    });

    await check('Auditoria aceita evento e rejeita resultado invalido', async () => {
      await expectDbError(client, {
        sql: `INSERT INTO auditoria (tipo_operacao, resultado)
              VALUES ('login', 'talvez')`,
        code: '23514',
        constraint: 'ck_auditoria_resultado',
      });
    });

    await check('Exclusao logica libera reutilizacao do e-mail', async () => {
      await client.query(
        `UPDATE usuarios SET excluido_em = now() WHERE id = $1`,
        [adminUser.id]
      );

      const novoUsuario = await fetchOne(
        client,
        `INSERT INTO usuarios (perfil_id, nome_completo, email, senha_hash)
         VALUES ($1, 'Novo Admin de Teste', $2, 'hash::teste')
         RETURNING id`,
        [adminProfile.id, TEST_EMAILS[0]]
      );

      if (!novoUsuario) throw new Error('Nao foi possivel reutilizar o e-mail apos exclusao logica.');
    });

    await check('Exclusao fisica do imovel remove vinculos e imagens em cascata', async () => {
      await client.query('DELETE FROM imoveis WHERE id = $1', [imovel.id]);

      const imagens = await fetchOne(
        client,
        `SELECT count(*)::int AS total FROM imagens_imoveis WHERE imovel_id = $1`,
        [imovel.id]
      );
      const vinculos = await fetchOne(
        client,
        `SELECT count(*)::int AS total FROM imoveis_corretores WHERE imovel_id = $1`,
        [imovel.id]
      );
      const acessos = await fetchOne(
        client,
        `SELECT count(*)::int AS total FROM acessos_imoveis WHERE imovel_id = $1`,
        [imovel.id]
      );
      const atendimento = await fetchOne(
        client,
        `SELECT imovel_id FROM atendimentos WHERE cliente_id = $1`,
        [cliente.id]
      );

      if (imagens.total !== 0) throw new Error('Imagens nao foram removidas em cascata.');
      if (vinculos.total !== 0) throw new Error('Vinculos imovel-corretor nao foram removidos em cascata.');
      if (acessos.total !== 0) throw new Error('Excecoes de acesso nao foram removidas em cascata.');
      if (atendimento.imovel_id !== null) throw new Error('Atendimento deveria manter o historico com imovel_id nulo.');
    });

    dataChecksCompleted = true;
  } catch (error) {
    failed += 1;
    console.error(`[FALHA] Execucao dos testes de dados: ${error.message}`);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }

  try {
    await check('Nenhum dado de teste permaneceu no banco', async () => {
      const usuarios = await pool.query(
        `SELECT count(*)::int AS total FROM usuarios WHERE email = ANY($1::text[])`,
        [TEST_EMAILS]
      );
      const imoveis = await pool.query(
        `SELECT count(*)::int AS total FROM imoveis WHERE codigo_interno LIKE 'TESTE-INT-%'`
      );

      if (usuarios.rows[0].total !== 0) throw new Error('Usuarios de teste encontrados apos rollback.');
      if (imoveis.rows[0].total !== 0) throw new Error('Imoveis de teste encontrados apos rollback.');
    });
  } finally {
    await pool.end();
  }

  console.log('');
  console.log(`[integridade] ${passed} verificacao(oes) aprovada(s), ${failed} falha(s).`);

  if (!dataChecksCompleted && failed > 0) {
    console.error('[integridade] Os testes de dados nao foram concluidos.');
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(`[integridade] Erro inesperado: ${error.message}`);
  await pool.end().catch(() => {});
  process.exitCode = 1;
});
