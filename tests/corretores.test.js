'use strict';

process.env.NODE_ENV = 'test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const createApp = require('../src/app');
const { pool, closePool } = require('../src/config/database');
const { hashPassword } = require('../src/utils/password');

const SENHA = 'SenhaSegura123!';
const PREFIX = `corretor.${process.pid}.${Date.now()}`;

let server;
let baseUrl;
let perfilCorretor;
let perfilAdmin;
let admin;
let corretorA;
let corretorB;
let candidatoNovo;
let candidatoDuplicado;
let imovelA1;
let imovelA2;
let imovelB;
let clienteA;
let clienteB;
let criado;

function email(nome) {
  return `${PREFIX}.${nome}@exemplo.test`;
}

function baseCpf(salt) {
  let hash = 0;
  const texto = `${PREFIX}:${salt}`;
  for (const caractere of texto) {
    hash = (hash * 31 + caractere.charCodeAt(0)) % 1000000000;
  }
  return String(hash).padStart(9, '0');
}

function gerarCpf(base) {
  const digitos = base.split('').map(Number);
  const calcular = (numeros) => {
    const soma = numeros.reduce(
      (total, digito, indice) => total + digito * (numeros.length + 1 - indice),
      0
    );
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const primeiro = calcular(digitos);
  const segundo = calcular([...digitos, primeiro]);
  return `${base}${primeiro}${segundo}`;
}

async function criarUsuario({
  nome,
  endereco,
  perfilId,
  ativo = true,
  corretor = null,
}) {
  const senhaHash = await hashPassword(SENHA);
  const { rows } = await pool.query(
    `INSERT INTO usuarios (perfil_id, nome_completo, email, senha_hash, ativo)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email`,
    [perfilId, nome, endereco, senhaHash, ativo]
  );
  const usuario = rows[0];

  if (corretor) {
    const { rows: corretores } = await pool.query(
      `INSERT INTO corretores
         (usuario_id, nome_completo, cpf, creci, telefone, whatsapp, email, endereco, ativo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        usuario.id,
        nome,
        corretor.cpf,
        corretor.creci,
        corretor.telefone || null,
        corretor.whatsapp || null,
        corretor.email || endereco,
        corretor.endereco || null,
        ativo,
      ]
    );
    usuario.corretorId = corretores[0].id;
  }

  return usuario;
}

async function criarImovel({ codigo, titulo, corretorId, criadoPor }) {
  const { rows } = await pool.query(
    `INSERT INTO imoveis
       (codigo_interno, titulo, tipo_imovel, finalidade, cidade, bairro, valor_venda, criado_por_usuario_id)
     VALUES ($1, $2, 'apartamento', 'venda', 'São Paulo', 'Centro', 450000, $3)
     RETURNING id`,
    [codigo, titulo, criadoPor]
  );
  const imovel = rows[0];

  if (corretorId) {
    await pool.query(
      `INSERT INTO imoveis_corretores (imovel_id, corretor_id, principal)
       VALUES ($1, $2, true)`,
      [imovel.id, corretorId]
    );
  }

  return imovel;
}

async function criarCliente({ nome, cpf, corretorId, criadoPor }) {
  const { rows } = await pool.query(
    `INSERT INTO clientes
       (nome_completo, cpf, finalidade_desejada, localizacao_desejada, criado_por_usuario_id)
     VALUES ($1, $2, 'venda', 'São Paulo', $3)
     RETURNING id`,
    [nome, cpf, criadoPor]
  );
  const cliente = rows[0];

  if (corretorId) {
    await pool.query(
      `INSERT INTO clientes_corretores (cliente_id, corretor_id, principal)
       VALUES ($1, $2, true)`,
      [cliente.id, corretorId]
    );
  }

  return cliente;
}

async function requisitar(path, options = {}) {
  const { method = 'GET', body, cookie, csrf, headers = {} } = options;
  const resposta = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const texto = await resposta.text();
  let dados = null;

  if (texto) {
    try {
      dados = JSON.parse(texto);
    } catch {
      dados = texto;
    }
  }

  return { resposta, dados };
}

async function login(endereco) {
  const { resposta, dados } = await requisitar('/api/auth/login', {
    method: 'POST',
    body: { email: endereco, password: SENHA },
  });
  const setCookies = resposta.headers.getSetCookie();

  return {
    resposta,
    dados,
    cookie: setCookies.map((item) => item.split(';')[0]).join('; '),
    csrf: dados?.csrfToken,
  };
}

before(async () => {
  const app = createApp();
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const { rows: perfis } = await pool.query(
    `SELECT id, nome FROM perfis WHERE nome IN ('Administrador', 'Corretor')`
  );
  perfilAdmin = perfis.find((perfil) => perfil.nome === 'Administrador').id;
  perfilCorretor = perfis.find((perfil) => perfil.nome === 'Corretor').id;

  admin = await criarUsuario({
    nome: 'Admin Corretores',
    endereco: email('admin'),
    perfilId: perfilAdmin,
  });

  corretorA = await criarUsuario({
    nome: `${PREFIX} Corretor A`,
    endereco: email('a'),
    perfilId: perfilCorretor,
    corretor: {
      cpf: gerarCpf(baseCpf('a')),
      creci: `${PREFIX}-A`,
      telefone: '(11) 99999-0001',
    },
  });

  corretorB = await criarUsuario({
    nome: `${PREFIX} Corretor B`,
    endereco: email('b'),
    perfilId: perfilCorretor,
    corretor: {
      cpf: gerarCpf(baseCpf('b')),
      creci: `${PREFIX}-B`,
      telefone: '(11) 99999-0002',
    },
  });

  candidatoNovo = await criarUsuario({
    nome: `${PREFIX} Candidato Novo`,
    endereco: email('candidato-novo'),
    perfilId: perfilCorretor,
  });

  candidatoDuplicado = await criarUsuario({
    nome: `${PREFIX} Candidato Duplicado`,
    endereco: email('candidato-duplicado'),
    perfilId: perfilCorretor,
  });

  imovelA1 = await criarImovel({
    codigo: `${PREFIX}-IMOVEL-A1`,
    titulo: `${PREFIX} Imóvel A1`,
    corretorId: corretorA.corretorId,
    criadoPor: corretorA.id,
  });
  imovelA2 = await criarImovel({
    codigo: `${PREFIX}-IMOVEL-A2`,
    titulo: `${PREFIX} Imóvel A2`,
    corretorId: corretorA.corretorId,
    criadoPor: corretorA.id,
  });
  imovelB = await criarImovel({
    codigo: `${PREFIX}-IMOVEL-B`,
    titulo: `${PREFIX} Imóvel B`,
    corretorId: corretorB.corretorId,
    criadoPor: corretorB.id,
  });
  clienteA = await criarCliente({
    nome: `${PREFIX} Cliente A`,
    cpf: gerarCpf(baseCpf('cliente-a')),
    corretorId: corretorA.corretorId,
    criadoPor: corretorA.id,
  });
  clienteB = await criarCliente({
    nome: `${PREFIX} Cliente B`,
    cpf: gerarCpf(baseCpf('cliente-b')),
    corretorId: corretorB.corretorId,
    criadoPor: corretorB.id,
  });
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

  await pool.query(`DELETE FROM imoveis WHERE codigo_interno LIKE $1`, [`${PREFIX}%`]);
  await pool.query(`DELETE FROM clientes WHERE cpf = ANY($1::char(11)[])`, [
    [gerarCpf(baseCpf('cliente-a')), gerarCpf(baseCpf('cliente-b'))],
  ]);
  await pool.query(`DELETE FROM corretores WHERE creci LIKE $1`, [`${PREFIX}%`]);
  await pool.query(`DELETE FROM usuarios WHERE email LIKE $1`, [`${PREFIX}%`]);
  await pool.query(
    `DELETE FROM auditoria
      WHERE usuario_email LIKE $1
         OR detalhes::text LIKE $1`,
    [`%${PREFIX}%`]
  );

  await closePool();
});

test('rotas de corretores exigem autenticação e permissões adequadas', async () => {
  const semSessao = await requisitar('/api/corretores');
  assert.equal(semSessao.resposta.status, 401);
  assert.equal(semSessao.dados.error.code, 'UNAUTHENTICATED');

  const sessaoA = await login(corretorA.email);
  assert.equal(sessaoA.resposta.status, 200);

  const listaA = await requisitar('/api/corretores?limite=50', {
    cookie: sessaoA.cookie,
  });
  assert.equal(listaA.resposta.status, 200);
  assert.ok(listaA.dados.corretores.some((item) => item.id === corretorA.corretorId));

  const criarSemPermissao = await requisitar('/api/corretores', {
    method: 'POST',
    cookie: sessaoA.cookie,
    csrf: sessaoA.csrf,
    body: {
      usuarioId: candidatoNovo.id,
      nome: 'Tentativa',
      cpf: gerarCpf(baseCpf('tentativa')),
      creci: `${PREFIX}-TENTATIVA`,
    },
  });
  assert.equal(criarSemPermissao.resposta.status, 403);
  assert.equal(criarSemPermissao.dados.error.code, 'FORBIDDEN');

  const opcoesSemPermissao = await requisitar(
    '/api/corretores/usuarios-disponiveis',
    { cookie: sessaoA.cookie }
  );
  assert.equal(opcoesSemPermissao.resposta.status, 403);

  const sessaoAdmin = await login(admin.email);
  assert.equal(sessaoAdmin.resposta.status, 200);
  admin.cookie = sessaoAdmin.cookie;
  admin.csrf = sessaoAdmin.csrf;
});

test('administrador cadastra corretor para usuário disponível', async () => {
  const disponiveis = await requisitar('/api/corretores/usuarios-disponiveis', {
    cookie: admin.cookie,
  });
  assert.equal(disponiveis.resposta.status, 200);
  assert.ok(disponiveis.dados.usuarios.some((item) => item.id === candidatoNovo.id));

  const criacao = await requisitar('/api/corretores', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: {
      usuarioId: candidatoNovo.id,
      nome: `${PREFIX} Novo Corretor`,
      cpf: gerarCpf(baseCpf('novo')),
      creci: `${PREFIX}-NOVO`,
      telefone: '(11) 98888-0000',
      whatsapp: '(11) 97777-0000',
      email: email('novo.corretor'),
      endereco: 'Rua dos Corretores, 100',
      ativo: true,
    },
  });

  assert.equal(criacao.resposta.status, 201);
  criado = criacao.dados.corretor;
  assert.equal(criado.nome, `${PREFIX} Novo Corretor`);
  assert.equal(criado.creci, `${PREFIX}-NOVO`);
  assert.equal(criado.email, email('novo.corretor'));
  assert.equal(criado.situacao, 'ativo');
  assert.equal(criado.usuario.id, candidatoNovo.id);
  assert.ok(criado.criadoEm);

  const lista = await requisitar(
    `/api/corretores?busca=${encodeURIComponent(`${PREFIX}-NOVO`)}`,
    { cookie: admin.cookie }
  );
  assert.equal(lista.resposta.status, 200);
  assert.ok(lista.dados.corretores.some((item) => item.id === criado.id));

  const buscaCpf = await requisitar(
    `/api/corretores?busca=${criado.cpf}`,
    { cookie: admin.cookie }
  );
  assert.equal(buscaCpf.resposta.status, 200);
  assert.ok(buscaCpf.dados.corretores.some((item) => item.id === criado.id));

  const usuarioAtualizado = await pool.query(
    `SELECT nome_completo FROM usuarios WHERE id = $1`,
    [candidatoNovo.id]
  );
  assert.equal(usuarioAtualizado.rows[0].nome_completo, `${PREFIX} Novo Corretor`);
});

test('cadastro impede duplicidades e dados inválidos', async () => {
  const cpfDuplicado = await requisitar('/api/corretores', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: {
      usuarioId: candidatoDuplicado.id,
      nome: `${PREFIX} CPF Duplicado`,
      cpf: criado.cpf,
      creci: `${PREFIX}-CPF-DUP`,
      email: email('cpf-duplicado'),
    },
  });
  assert.equal(cpfDuplicado.resposta.status, 409);
  assert.equal(cpfDuplicado.dados.error.code, 'CPF_IN_USE');

  const creciDuplicado = await requisitar('/api/corretores', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: {
      usuarioId: candidatoDuplicado.id,
      nome: `${PREFIX} CRECI Duplicado`,
      cpf: gerarCpf(baseCpf('creci-duplicado')),
      creci: `${PREFIX}-NOVO`,
      email: email('creci-duplicado'),
    },
  });
  assert.equal(creciDuplicado.resposta.status, 409);
  assert.equal(creciDuplicado.dados.error.code, 'CRECI_IN_USE');

  const emailDuplicado = await requisitar('/api/corretores', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: {
      usuarioId: candidatoDuplicado.id,
      nome: `${PREFIX} E-mail Duplicado`,
      cpf: gerarCpf(baseCpf('email-duplicado')),
      creci: `${PREFIX}-EMAIL-DUP`,
      email: email('novo.corretor'),
    },
  });
  assert.equal(emailDuplicado.resposta.status, 409);
  assert.equal(emailDuplicado.dados.error.code, 'EMAIL_IN_USE');

  const usuarioJaVinculado = await requisitar('/api/corretores', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: {
      usuarioId: candidatoNovo.id,
      nome: `${PREFIX} Já Vinculado`,
      cpf: gerarCpf(baseCpf('ja-vinculado')),
      creci: `${PREFIX}-JA-VINCULADO`,
    },
  });
  assert.equal(usuarioJaVinculado.resposta.status, 409);
  assert.equal(usuarioJaVinculado.dados.error.code, 'USER_ALREADY_LINKED');

  const cpfInvalido = await requisitar('/api/corretores', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: {
      usuarioId: candidatoDuplicado.id,
      nome: `${PREFIX} CPF Inválido`,
      cpf: '11111111111',
      creci: `${PREFIX}-INVALIDO`,
    },
  });
  assert.equal(cpfInvalido.resposta.status, 422);
  assert.equal(cpfInvalido.dados.error.code, 'VALIDATION_ERROR');

  const emailInvalido = await requisitar('/api/corretores', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: {
      usuarioId: candidatoDuplicado.id,
      nome: `${PREFIX} E-mail Inválido`,
      cpf: gerarCpf(baseCpf('email-invalido')),
      creci: `${PREFIX}-EMAIL-INVALIDO`,
      email: 'invalido',
    },
  });
  assert.equal(emailInvalido.resposta.status, 422);

  const semUsuario = await requisitar('/api/corretores', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: {
      nome: `${PREFIX} Sem Usuário`,
      cpf: gerarCpf(baseCpf('sem-usuario')),
      creci: `${PREFIX}-SEM-USUARIO`,
    },
  });
  assert.equal(semUsuario.resposta.status, 422);

  const adminComoCorretor = await requisitar('/api/corretores', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: {
      usuarioId: admin.id,
      nome: `${PREFIX} Admin`,
      cpf: gerarCpf(baseCpf('admin-corretor')),
      creci: `${PREFIX}-ADMIN`,
    },
  });
  assert.equal(adminComoCorretor.resposta.status, 422);
  assert.equal(adminComoCorretor.dados.error.code, 'ADMIN_CORRETOR');
});

test('edição, ativação e desativação mantêm conta e sessões sincronizadas', async () => {
  const sessaoCriado = await login(candidatoNovo.email);
  assert.equal(sessaoCriado.resposta.status, 200);

  const edicao = await requisitar(`/api/corretores/${criado.id}`, {
    method: 'PATCH',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: {
      nome: `${PREFIX} Corretor Editado`,
      telefone: '(11) 95555-0000',
      email: email('editado'),
      endereco: 'Rua Editada, 200',
    },
  });

  assert.equal(edicao.resposta.status, 200);
  assert.equal(edicao.dados.corretor.nome, `${PREFIX} Corretor Editado`);
  assert.equal(edicao.dados.corretor.telefone, '(11) 95555-0000');
  assert.equal(edicao.dados.corretor.email, email('editado'));
  assert.equal(edicao.dados.corretor.creci, criado.creci);

  const desativacao = await requisitar(`/api/corretores/${criado.id}/status`, {
    method: 'PATCH',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: { ativo: false },
  });

  assert.equal(desativacao.resposta.status, 200);
  assert.equal(desativacao.dados.corretor.ativo, false);
  assert.equal(desativacao.dados.corretor.situacao, 'inativo');
  assert.equal(desativacao.dados.corretor.usuario.ativo, false);

  const sessaoRevogada = await requisitar('/api/auth/session', {
    cookie: sessaoCriado.cookie,
  });
  assert.equal(sessaoRevogada.resposta.status, 401);

  const inativos = await requisitar(
    `/api/corretores?status=inativos&busca=EDITADO`,
    { cookie: admin.cookie }
  );
  assert.equal(inativos.resposta.status, 200);
  assert.ok(inativos.dados.corretores.some((item) => item.id === criado.id));

  const reativacao = await requisitar(`/api/corretores/${criado.id}/status`, {
    method: 'PATCH',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: { ativo: true },
  });

  assert.equal(reativacao.resposta.status, 200);
  assert.equal(reativacao.dados.corretor.ativo, true);
  assert.equal(reativacao.dados.corretor.usuario.ativo, true);

  const novoLogin = await login(candidatoNovo.email);
  assert.equal(novoLogin.resposta.status, 200);
});

test('detalhe exibe vínculos respeitando permissões e exceções de acesso', async () => {
  await pool.query(
    `INSERT INTO acessos_imoveis
       (usuario_id, imovel_id, permitido, concedido_por_usuario_id)
     VALUES ($1, $2, false, $3)`,
    [corretorA.id, imovelA1.id, admin.id]
  );
  await pool.query(
    `INSERT INTO acessos_clientes
       (usuario_id, cliente_id, permitido, concedido_por_usuario_id)
     VALUES ($1, $2, false, $3)`,
    [corretorA.id, clienteA.id, admin.id]
  );

  const sessaoA = await login(corretorA.email);
  const detalheA = await requisitar(`/api/corretores/${corretorA.corretorId}`, {
    cookie: sessaoA.cookie,
  });

  assert.equal(detalheA.resposta.status, 200);
  assert.equal(detalheA.dados.corretor.id, corretorA.corretorId);
  assert.equal(detalheA.dados.resumo.imoveis, 1);
  assert.equal(detalheA.dados.resumo.clientes, 0);
  assert.equal(detalheA.dados.imoveis[0].id, imovelA2.id);
  assert.ok(detalheA.dados.imoveis.every((item) => item.id !== imovelA1.id));
  assert.ok(detalheA.dados.clientes.every((item) => item.id !== clienteA.id));

  const detalheAdmin = await requisitar(`/api/corretores/${corretorA.corretorId}`, {
    cookie: admin.cookie,
  });
  assert.equal(detalheAdmin.resposta.status, 200);
  assert.equal(detalheAdmin.dados.resumo.imoveis, 2);
  assert.equal(detalheAdmin.dados.resumo.clientes, 1);
  assert.ok(detalheAdmin.dados.imoveis.some((item) => item.id === imovelA1.id));

  const detalheB = await requisitar(`/api/corretores/${corretorB.corretorId}`, {
    cookie: sessaoA.cookie,
  });
  assert.equal(detalheB.resposta.status, 200);
  assert.equal(detalheB.dados.corretor.id, corretorB.corretorId);

  const detalheInexistente = await requisitar('/api/corretores/999999', {
    cookie: admin.cookie,
  });
  assert.equal(detalheInexistente.resposta.status, 404);
  assert.equal(detalheInexistente.dados.error.code, 'CORRETOR_NOT_FOUND');
});

test('corretor sem permissões administrativas não altera cadastros', async () => {
  const sessaoA = await login(corretorA.email);

  const edicao = await requisitar(`/api/corretores/${corretorB.corretorId}`, {
    method: 'PATCH',
    cookie: sessaoA.cookie,
    csrf: sessaoA.csrf,
    body: { nome: 'Alteração indevida' },
  });
  assert.equal(edicao.resposta.status, 403);
  assert.equal(edicao.dados.error.code, 'FORBIDDEN');

  const status = await requisitar(`/api/corretores/${corretorB.corretorId}/status`, {
    method: 'PATCH',
    cookie: sessaoA.cookie,
    csrf: sessaoA.csrf,
    body: { ativo: false },
  });
  assert.equal(status.resposta.status, 403);
  assert.equal(status.dados.error.code, 'FORBIDDEN');

  const resumoAdmin = await requisitar('/api/corretores/resumo', {
    cookie: admin.cookie,
  });
  assert.equal(resumoAdmin.resposta.status, 200);
  assert.ok(resumoAdmin.dados.total >= 3);
  assert.equal(typeof resumoAdmin.dados.ativos, 'number');
});

test('operações de corretores são registradas na auditoria', async () => {
  const { rows } = await pool.query(
    `SELECT tipo_operacao
       FROM auditoria
      WHERE entidade = 'corretores'
        AND registro_id = $1
      ORDER BY id`,
    [String(criado.id)]
  );

  const tipos = rows.map((row) => row.tipo_operacao);
  assert.ok(tipos.includes('corretor.criado'));
  assert.ok(tipos.includes('corretor.atualizado'));
  assert.ok(tipos.includes('corretor.status_alterado'));
});
