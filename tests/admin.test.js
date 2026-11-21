'use strict';

process.env.NODE_ENV = 'test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const createApp = require('../src/app');
const { pool, closePool } = require('../src/config/database');
const { hashPassword } = require('../src/utils/password');
const acessoService = require('../src/services/acesso.service');
const configuracaoModel = require('../src/models/configuracao.model');
const { expurgarAuditoriaTeste } = require('./helpers/auditoria');

const SENHA = 'SenhaSegura123!';
const SENHA_NOVA = 'NovaSenhaSegura456!';
const PREFIX = `admin.${process.pid}.${Date.now()}`;

let server;
let baseUrl;
let perfilTeste;
let admin;
let corretorA;
let corretorB;
let imovelA;
let imovelB;
let clienteA;
let clienteB;
let visibilidadeOriginal;

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

async function criarUsuario({ nome, endereco, perfilId, administrativo = false, corretor = null }) {
  const senhaHash = await hashPassword(SENHA);
  const { rows } = await pool.query(
    `INSERT INTO usuarios (perfil_id, nome_completo, email, senha_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email`,
    [perfilId, nome, endereco, senhaHash]
  );
  const usuario = rows[0];

  if (corretor) {
    const { rows: corretores } = await pool.query(
      `INSERT INTO corretores (usuario_id, nome_completo, cpf, creci, email)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [usuario.id, nome, corretor.cpf, corretor.creci, endereco]
    );
    usuario.corretorId = corretores[0].id;
  }

  usuario.administrativo = administrativo;
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
    `INSERT INTO clientes (nome_completo, cpf, finalidade_desejada, criado_por_usuario_id)
     VALUES ($1, $2, 'venda', $3)
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
  const { method = 'GET', body, cookie, csrf, headers = {}, redirect = 'follow' } = options;
  const resposta = await fetch(`${baseUrl}${path}`, {
    method,
    redirect,
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

async function login(endereco, senha = SENHA) {
  const { resposta, dados } = await requisitar('/api/auth/login', {
    method: 'POST',
    body: { email: endereco, password: senha },
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

  visibilidadeOriginal = await configuracaoModel.obterMapa();

  const { rows: perfis } = await pool.query(
    `INSERT INTO perfis (nome, descricao, administrativo)
     VALUES ($1, 'Perfil temporário dos testes da etapa 05.', false)
     RETURNING id`,
    [`Perfil ${PREFIX}`]
  );
  perfilTeste = perfis[0];

  const { rows: perfilAdmin } = await pool.query(
    `SELECT id FROM perfis WHERE nome = 'Administrador'`
  );

  admin = await criarUsuario({
    nome: 'Admin Etapa 05',
    endereco: email('admin'),
    perfilId: perfilAdmin[0].id,
    administrativo: true,
  });

  corretorA = await criarUsuario({
    nome: 'Corretor A',
    endereco: email('corretor.a'),
    perfilId: perfilTeste.id,
    corretor: { cpf: gerarCpf(baseCpf('a')), creci: `${PREFIX}-A` },
  });

  corretorB = await criarUsuario({
    nome: 'Corretor B',
    endereco: email('corretor.b'),
    perfilId: perfilTeste.id,
    corretor: { cpf: gerarCpf(baseCpf('b')), creci: `${PREFIX}-B` },
  });

  imovelA = await criarImovel({
    codigo: `${PREFIX}-IMOVEL-A`,
    titulo: 'Imóvel do corretor A',
    corretorId: corretorA.corretorId,
    criadoPor: corretorA.id,
  });
  imovelB = await criarImovel({
    codigo: `${PREFIX}-IMOVEL-B`,
    titulo: 'Imóvel do corretor B',
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

  await configuracaoModel
    .definirVisibilidade({
      imoveis: visibilidadeOriginal.get('imoveis.visibilidade') || 'todos',
      clientes: visibilidadeOriginal.get('clientes.visibilidade') || 'todos',
      atualizadoPorUsuarioId: null,
    })
    .catch(() => {});

  await pool.query(`DELETE FROM imoveis WHERE codigo_interno LIKE $1`, [`${PREFIX}%`]);
  await pool.query(`DELETE FROM clientes WHERE cpf = ANY($1::char(11)[])`, [
    [gerarCpf(baseCpf('cliente-a')), gerarCpf(baseCpf('cliente-b'))],
  ]);
  await pool.query(`DELETE FROM corretores WHERE creci LIKE $1`, [`${PREFIX}%`]);
  await expurgarAuditoriaTeste('usuario_email LIKE $1 OR detalhes::text LIKE $1', [
    `%${PREFIX}%`,
  ]);
  await pool.query(`DELETE FROM usuarios WHERE email LIKE $1`, [`${PREFIX}%`]);
  await pool.query(`DELETE FROM perfis WHERE nome = $1`, [`Perfil ${PREFIX}`]);

  await closePool();
});

test('rotas administrativas exigem autenticação, permissão e CSRF', async () => {
  const semSessao = await requisitar('/api/administracao/resumo');
  assert.equal(semSessao.resposta.status, 401);
  assert.equal(semSessao.dados.error.code, 'UNAUTHENTICATED');

  const sessaoCorretor = await login(corretorA.email);
  assert.equal(sessaoCorretor.resposta.status, 200);

  const corretorSemPermissao = await requisitar('/api/administracao/resumo', {
    cookie: sessaoCorretor.cookie,
  });
  assert.equal(corretorSemPermissao.resposta.status, 403);
  assert.equal(corretorSemPermissao.dados.error.code, 'FORBIDDEN');

  const sessaoAdmin = await login(admin.email);
  assert.equal(sessaoAdmin.resposta.status, 200);
  admin.cookie = sessaoAdmin.cookie;
  admin.csrf = sessaoAdmin.csrf;

  const resumo = await requisitar('/api/administracao/resumo', {
    cookie: admin.cookie,
  });
  assert.equal(resumo.resposta.status, 200);
  assert.equal(typeof resumo.dados.usuarios.ativos, 'number');
  assert.ok(resumo.dados.sessoesAtivas >= 1);

  const opcoesPerfis = await requisitar('/api/administracao/perfis/opcoes', {
    cookie: admin.cookie,
  });
  assert.equal(opcoesPerfis.resposta.status, 200);
  assert.ok(opcoesPerfis.dados.perfis.some((perfil) => perfil.nome === 'Administrador'));

  const opcoesCorretor = await requisitar('/api/administracao/perfis/opcoes', {
    cookie: sessaoCorretor.cookie,
  });
  assert.equal(opcoesCorretor.resposta.status, 403);

  const semCsrf = await requisitar('/api/administracao/usuarios', {
    method: 'POST',
    cookie: admin.cookie,
    body: { nome: 'Sem CSRF', email: email('sem-csrf'), senha: SENHA },
  });
  assert.equal(semCsrf.resposta.status, 403);
  assert.equal(semCsrf.dados.error.code, 'CSRF_INVALID');
});

test('administrador cria, lista e edita usuário com cadastro de corretor', async () => {
  const novoEmail = email('novo.corretor');
  const criacao = await requisitar('/api/administracao/usuarios', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: {
      nome: 'Novo Corretor',
      email: novoEmail,
      senha: SENHA,
      perfilId: perfilTeste.id,
      ativo: true,
      corretor: {
        cpf: gerarCpf(baseCpf('novo')),
        creci: `${PREFIX}-NOVO`,
        telefone: '(11) 99999-0000',
        whatsapp: '(11) 99999-0000',
        email: novoEmail,
      },
    },
  });

  assert.equal(criacao.resposta.status, 201);
  assert.equal(criacao.dados.usuario.email, novoEmail);
  assert.equal(criacao.dados.usuario.corretor.creci, `${PREFIX}-NOVO`);
  assert.equal(criacao.dados.usuario.deveTrocarSenha, true);

  const duplicado = await requisitar('/api/administracao/usuarios', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: {
      nome: 'Outro Corretor',
      email: novoEmail,
      senha: SENHA,
      perfilId: perfilTeste.id,
      corretor: {
        cpf: gerarCpf(baseCpf('outro')),
        creci: `${PREFIX}-OUTRO`,
      },
    },
  });
  assert.equal(duplicado.resposta.status, 409);
  assert.equal(duplicado.dados.error.code, 'EMAIL_IN_USE');

  const cpfInvalido = await requisitar('/api/administracao/usuarios', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: {
      nome: 'CPF Inválido',
      email: email('cpf.invalido'),
      senha: SENHA,
      perfilId: perfilTeste.id,
      corretor: { cpf: '123', creci: `${PREFIX}-INVALIDO` },
    },
  });
  assert.equal(cpfInvalido.resposta.status, 422);
  assert.equal(cpfInvalido.dados.error.code, 'VALIDATION_ERROR');

  const lista = await requisitar(
    `/api/administracao/usuarios?busca=${encodeURIComponent(novoEmail)}`,
    { cookie: admin.cookie }
  );
  assert.equal(lista.resposta.status, 200);
  assert.equal(lista.dados.total, 1);
  assert.equal(lista.dados.usuarios[0].email, novoEmail);

  const id = criacao.dados.usuario.id;
  const edicao = await requisitar(`/api/administracao/usuarios/${id}`, {
    method: 'PATCH',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: {
      nome: 'Novo Corretor Editado',
      email: novoEmail,
      perfilId: perfilTeste.id,
      ativo: true,
      corretor: {
        cpf: gerarCpf(baseCpf('novo')),
        creci: `${PREFIX}-NOVO`,
        telefone: '(11) 98888-1111',
      },
    },
  });

  assert.equal(edicao.resposta.status, 200);
  assert.equal(edicao.dados.usuario.nome, 'Novo Corretor Editado');
  assert.equal(edicao.dados.usuario.corretor.telefone, '(11) 98888-1111');

  const { rows } = await pool.query(
    `SELECT c.telefone
       FROM corretores c
       JOIN usuarios u ON u.id = c.usuario_id
      WHERE u.email = $1`,
    [novoEmail]
  );
  assert.equal(rows[0].telefone, '(11) 98888-1111');

  corretorA.criado = { id, email: novoEmail };
});

test('admin ativa e desativa usuário, revogando sessões', async () => {
  const id = corretorA.criado.id;
  const loginInicial = await login(corretorA.criado.email);
  assert.equal(loginInicial.resposta.status, 200);

  const desativacao = await requisitar(`/api/administracao/usuarios/${id}/status`, {
    method: 'PATCH',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: { ativo: false },
  });
  assert.equal(desativacao.resposta.status, 200);
  assert.equal(desativacao.dados.usuario.ativo, false);

  const { rows: corretorInativo } = await pool.query(
    `SELECT c.ativo FROM corretores c JOIN usuarios u ON u.id = c.usuario_id WHERE u.id = $1`,
    [id]
  );
  assert.equal(corretorInativo[0].ativo, false);

  const sessaoRevogada = await requisitar('/api/auth/session', {
    cookie: loginInicial.cookie,
  });
  assert.equal(sessaoRevogada.resposta.status, 401);

  const loginInativo = await login(corretorA.criado.email);
  assert.equal(loginInativo.resposta.status, 401);

  const reativacao = await requisitar(`/api/administracao/usuarios/${id}/status`, {
    method: 'PATCH',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: { ativo: true },
  });
  assert.equal(reativacao.resposta.status, 200);
  assert.equal(reativacao.dados.usuario.ativo, true);

  const { rows: corretorAtivo } = await pool.query(
    `SELECT c.ativo FROM corretores c JOIN usuarios u ON u.id = c.usuario_id WHERE u.id = $1`,
    [id]
  );
  assert.equal(corretorAtivo[0].ativo, true);

  const loginReativado = await login(corretorA.criado.email);
  assert.equal(loginReativado.resposta.status, 200);
});

test('admin redefine senha, encerra sessões e exige troca', async () => {
  const id = corretorA.criado.id;
  const sessaoAntiga = await login(corretorA.criado.email);
  assert.equal(sessaoAntiga.resposta.status, 200);

  const redefinicao = await requisitar(
    `/api/administracao/usuarios/${id}/redefinir-senha`,
    {
      method: 'POST',
      cookie: admin.cookie,
      csrf: admin.csrf,
      body: { novaSenha: SENHA_NOVA },
    }
  );
  assert.equal(redefinicao.resposta.status, 200);

  const sessaoRevogada = await requisitar('/api/auth/session', {
    cookie: sessaoAntiga.cookie,
  });
  assert.equal(sessaoRevogada.resposta.status, 401);

  const senhaAntiga = await login(corretorA.criado.email);
  assert.equal(senhaAntiga.resposta.status, 401);

  const senhaNova = await login(corretorA.criado.email, SENHA_NOVA);
  assert.equal(senhaNova.resposta.status, 200);
  assert.equal(senhaNova.dados.usuario.deveTrocarSenha, true);

  const autoatendimento = await requisitar(
    `/api/administracao/usuarios/${admin.id}/redefinir-senha`,
    {
      method: 'POST',
      cookie: admin.cookie,
      csrf: admin.csrf,
      body: { novaSenha: SENHA_NOVA },
    }
  );
  assert.equal(autoatendimento.resposta.status, 403);
  assert.equal(autoatendimento.dados.error.code, 'SELF_OPERATION');
});

test('permissões gerais e exceções individuais são aplicadas com precedência', async () => {
  const perfis = await requisitar('/api/administracao/perfis', {
    cookie: admin.cookie,
  });
  assert.equal(perfis.resposta.status, 200);
  assert.ok(perfis.dados.permissoes.length >= 24);

  const chavesBase = [
    'dashboard.visualizar',
    'imoveis.visualizar',
    'imoveis.criar',
    'clientes.visualizar',
    'relatorios.visualizar',
  ];

  const atualizacaoPerfil = await requisitar(
    `/api/administracao/perfis/${perfilTeste.id}/permissoes`,
    {
      method: 'PUT',
      cookie: admin.cookie,
      csrf: admin.csrf,
      body: { permissoes: chavesBase },
    }
  );
  assert.equal(atualizacaoPerfil.resposta.status, 200);

  const loginCorretorA = await login(corretorA.email);
  assert.equal(loginCorretorA.resposta.status, 200);
  assert.deepEqual(
    [...loginCorretorA.dados.usuario.permissoes].sort(),
    [...chavesBase].sort()
  );

  const excecoes = await requisitar(
    `/api/administracao/usuarios/${corretorA.id}/permissoes`,
    {
      method: 'PUT',
      cookie: admin.cookie,
      csrf: admin.csrf,
      body: {
        excecoes: [
          { chave: 'imoveis.visualizar', permitido: false },
          { chave: 'clientes.criar', permitido: true },
        ],
      },
    }
  );
  assert.equal(excecoes.resposta.status, 200);

  const loginComExcecoes = await login(corretorA.email);
  const permissoes = loginComExcecoes.dados.usuario.permissoes;
  assert.equal(permissoes.includes('imoveis.visualizar'), false);
  assert.equal(permissoes.includes('clientes.criar'), true);

  const negarEssencial = await requisitar(
    `/api/administracao/usuarios/${admin.id}/permissoes`,
    {
      method: 'PUT',
      cookie: admin.cookie,
      csrf: admin.csrf,
      body: {
        excecoes: [{ chave: 'usuarios.gerenciar', permitido: false }],
      },
    }
  );
  assert.equal(negarEssencial.resposta.status, 403);
  assert.equal(negarEssencial.dados.error.code, 'SELF_PERMISSION_CHANGE');

  const autoelevacao = await requisitar(
    `/api/administracao/perfis/${perfilTeste.id}/permissoes`,
    {
      method: 'PUT',
      cookie: loginCorretorA.cookie,
      csrf: loginCorretorA.csrf,
      body: { permissoes: [...chavesBase, 'usuarios.gerenciar'] },
    }
  );
  assert.equal(autoelevacao.resposta.status, 403);

  const administrador = await requisitar(
    `/api/administracao/usuarios/${admin.id}`,
    { cookie: admin.cookie }
  );
  assert.equal(administrador.resposta.status, 200);
  assert.equal(administrador.dados.usuario.perfil.administrativo, true);
});

test('visibilidade geral e exceções por registro isolam corretores', async () => {
  const configurar = await requisitar(
    '/api/administracao/configuracoes/visibilidade',
    {
      method: 'PUT',
      cookie: admin.cookie,
      csrf: admin.csrf,
      body: { imoveis: 'vinculados', clientes: 'vinculados' },
    }
  );
  assert.equal(configurar.resposta.status, 200);
  assert.equal(configurar.dados.visibilidade.imoveis, 'vinculados');
  assert.equal(configurar.dados.visibilidade.clientes, 'vinculados');

  assert.equal(await acessoService.podeAcessarRegistro(corretorA.id, 'imovel', imovelA.id), true);
  assert.equal(await acessoService.podeAcessarRegistro(corretorA.id, 'imovel', imovelB.id), false);
  assert.equal(await acessoService.podeAcessarRegistro(corretorA.id, 'cliente', clienteA.id), true);
  assert.equal(await acessoService.podeAcessarRegistro(corretorA.id, 'cliente', clienteB.id), false);
  assert.equal(await acessoService.podeAcessarRegistro(admin.id, 'imovel', imovelB.id), true);

  const filtroVinculado = await acessoService.filtroVisibilidade(corretorA.id, 'imovel', 'i', 1);
  const { rows: visiveisVinculados } = await pool.query(
    `SELECT i.id FROM imoveis i
      WHERE i.codigo_interno LIKE $1
        AND (${filtroVinculado.sql})
      ORDER BY i.id`,
    [`${PREFIX}%`, ...filtroVinculado.params]
  );
  assert.deepEqual(
    visiveisVinculados.map((row) => String(row.id)),
    [String(imovelA.id)]
  );

  const excecao = await requisitar(
    `/api/administracao/usuarios/${corretorA.id}/acessos`,
    {
      method: 'PUT',
      cookie: admin.cookie,
      csrf: admin.csrf,
      body: {
        imoveis: [{ id: imovelB.id, permitido: true }],
        clientes: [],
      },
    }
  );
  assert.equal(excecao.resposta.status, 200);
  assert.equal(await acessoService.podeAcessarRegistro(corretorA.id, 'imovel', imovelB.id), true);
  assert.equal(await acessoService.podeAcessarRegistro(corretorB.id, 'imovel', imovelA.id), false);

  const filtroComConcessao = await acessoService.filtroVisibilidade(
    corretorA.id,
    'imovel',
    'i',
    1
  );
  const { rows: visiveisComConcessao } = await pool.query(
    `SELECT i.id FROM imoveis i
      WHERE i.codigo_interno LIKE $1
        AND (${filtroComConcessao.sql})
      ORDER BY i.id`,
    [`${PREFIX}%`, ...filtroComConcessao.params]
  );
  assert.deepEqual(
    visiveisComConcessao.map((row) => String(row.id)).sort(),
    [String(imovelA.id), String(imovelB.id)].sort()
  );

  const todos = await requisitar('/api/administracao/configuracoes/visibilidade', {
    method: 'PUT',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: { imoveis: 'todos', clientes: 'todos' },
  });
  assert.equal(todos.resposta.status, 200);

  const negacao = await requisitar(
    `/api/administracao/usuarios/${corretorA.id}/acessos`,
    {
      method: 'PUT',
      cookie: admin.cookie,
      csrf: admin.csrf,
      body: {
        imoveis: [],
        clientes: [{ id: clienteB.id, permitido: false }],
      },
    }
  );
  assert.equal(negacao.resposta.status, 200);

  assert.equal(await acessoService.podeAcessarRegistro(corretorA.id, 'cliente', clienteA.id), true);
  assert.equal(await acessoService.podeAcessarRegistro(corretorA.id, 'cliente', clienteB.id), false);

  const filtroTodos = await acessoService.filtroVisibilidade(corretorA.id, 'cliente', 'c', 1);
  const { rows: visiveisTodos } = await pool.query(
    `SELECT c.id FROM clientes c
      WHERE c.nome_completo LIKE $1
        AND (${filtroTodos.sql})
      ORDER BY c.id`,
    [`${PREFIX}%`, ...filtroTodos.params]
  );
  assert.deepEqual(
    visiveisTodos.map((row) => String(row.id)),
    [String(clienteA.id)]
  );

  const detalhes = await requisitar(
    `/api/administracao/usuarios/${corretorA.id}/acessos`,
    { cookie: admin.cookie }
  );
  assert.equal(detalhes.resposta.status, 200);
  const clienteBDetalhe = detalhes.dados.clientes.find(
    (item) => String(item.id) === String(clienteB.id)
  );
  assert.equal(clienteBDetalhe.excecao, false);
  assert.equal(clienteBDetalhe.vinculado, false);

  const registroInexistente = await requisitar(
    `/api/administracao/usuarios/${corretorA.id}/acessos`,
    {
      method: 'PUT',
      cookie: admin.cookie,
      csrf: admin.csrf,
      body: { imoveis: [{ id: 999999999, permitido: true }], clientes: [] },
    }
  );
  assert.equal(registroInexistente.resposta.status, 422);

  const alvoAdministrador = await requisitar(
    `/api/administracao/usuarios/${admin.id}/acessos`,
    {
      method: 'PUT',
      cookie: admin.cookie,
      csrf: admin.csrf,
      body: { imoveis: [], clientes: [] },
    }
  );
  assert.equal(alvoAdministrador.resposta.status, 403);
});

test('protege contra autodesativação e histórico de auditoria é consultável', async () => {
  const autodesativacao = await requisitar(
    `/api/administracao/usuarios/${admin.id}/status`,
    {
      method: 'PATCH',
      cookie: admin.cookie,
      csrf: admin.csrf,
      body: { ativo: false },
    }
  );
  assert.equal(autodesativacao.resposta.status, 403);
  assert.equal(autodesativacao.dados.error.code, 'SELF_OPERATION');

  const autoPerfil = await requisitar(`/api/administracao/usuarios/${admin.id}`, {
    method: 'PATCH',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: { perfilId: perfilTeste.id },
  });
  assert.equal(autoPerfil.resposta.status, 403);
  assert.equal(autoPerfil.dados.error.code, 'SELF_OPERATION');

  const historico = await requisitar(
    '/api/administracao/auditoria?tipo=admin.usuario_criado',
    { cookie: admin.cookie }
  );
  assert.equal(historico.resposta.status, 200);
  assert.ok(historico.dados.total >= 1);
  assert.ok(historico.dados.eventos.some((evento) => evento.tipo_operacao === 'admin.usuario_criado'));

  const sessaoCorretor = await login(corretorB.email);
  const semPermissao = await requisitar('/api/administracao/auditoria', {
    cookie: sessaoCorretor.cookie,
  });
  assert.equal(semPermissao.resposta.status, 403);
});

test('recursos disponíveis para exceções são retornados ao administrador', async () => {
  const recursos = await requisitar('/api/administracao/recursos', {
    cookie: admin.cookie,
  });
  assert.equal(recursos.resposta.status, 200);
  assert.ok(
    recursos.dados.imoveis.some((imovel) => String(imovel.id) === String(imovelA.id))
  );
  assert.ok(
    recursos.dados.clientes.some((cliente) => String(cliente.id) === String(clienteA.id))
  );

  const opcoes = await requisitar(
    '/api/administracao/usuarios/opcoes?somenteNaoAdministrativos=true',
    { cookie: admin.cookie }
  );
  assert.equal(opcoes.resposta.status, 200);
  assert.ok(opcoes.dados.usuarios.every((usuario) => usuario.administrativo === false));
});
