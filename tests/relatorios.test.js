'use strict';

process.env.NODE_ENV = 'test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const createApp = require('../src/app');
const { pool, closePool } = require('../src/config/database');
const { expurgarAuditoriaTeste } = require('./helpers/auditoria');
const { hashPassword } = require('../src/utils/password');

const SENHA = 'SenhaSegura123!';
const PREFIX = `relatorio.${process.pid}.${Date.now()}`;
const DATA_ATENDIMENTO = '2026-01-15T12:00:00.000Z';

let server;
let baseUrl;
let perfilAdmin;
let perfilCorretor;
let admin;
let corretorA;
let corretorB;
let imovelA;
let imovelB;
let imovelC;
let clienteA;
let clienteB;
let visibilidadeImoveis;
let visibilidadeClientes;
let contador = 0;

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

function proximoCodigo() {
  contador += 1;
  return `${PREFIX}-${String(contador).padStart(3, '0')}`;
}

async function criarUsuario({ nome, endereco, perfilId, corretor = null }) {
  const senhaHash = await hashPassword(SENHA);
  const { rows } = await pool.query(
    `INSERT INTO usuarios (perfil_id, nome_completo, email, senha_hash, ativo)
     VALUES ($1, $2, $3, $4, true)
     RETURNING id, email`,
    [perfilId, nome, endereco, senhaHash]
  );
  const usuario = rows[0];

  if (corretor) {
    const { rows: corretores } = await pool.query(
      `INSERT INTO corretores
         (usuario_id, nome_completo, cpf, creci, email, ativo)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id`,
      [usuario.id, nome, corretor.cpf, corretor.creci, endereco]
    );
    usuario.corretorId = corretores[0].id;
  }

  return usuario;
}

async function requisitar(caminho, options = {}) {
  const { method = 'GET', body, cookie, csrf, headers = {} } = options;

  const resposta = await fetch(`${baseUrl}${caminho}`, {
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

  return { resposta, dados, texto };
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

function dadosImovel(sobrescritas = {}) {
  return {
    codigo: proximoCodigo(),
    titulo: `${PREFIX} Imóvel de teste`,
    descricao: 'Imóvel criado pela suíte de relatórios.',
    tipo: 'apartamento',
    finalidade: 'venda',
    cep: '01001-000',
    estado: 'SP',
    cidade: 'São Paulo',
    bairro: 'Centro',
    logradouro: 'Rua de Teste',
    numero: '100',
    areaTotal: 80,
    areaConstruida: 70,
    quartos: 2,
    banheiros: 2,
    suites: 1,
    vagasGaragem: 1,
    mobiliado: false,
    caracteristicas: ['elevador'],
    valorVenda: 500000,
    valorAluguel: 2500,
    situacao: 'disponivel',
    ...sobrescritas,
  };
}

async function criarImovelViaApi(sessao, sobrescritas = {}) {
  const { resposta, dados } = await requisitar('/api/imoveis', {
    method: 'POST',
    cookie: sessao.cookie,
    csrf: sessao.csrf,
    body: dadosImovel(sobrescritas),
  });

  assert.equal(resposta.status, 201, JSON.stringify(dados));
  return dados.imovel;
}

function dadosCliente(sobrescritas = {}) {
  return {
    nome: `${PREFIX} Cliente de teste`,
    cpf: gerarCpf(baseCpf(`cliente-${proximoCodigo()}`)),
    telefone: '11999990000',
    whatsapp: '11999990000',
    email: `${PREFIX}.cliente.${proximoCodigo()}@exemplo.test`,
    endereco: 'Rua do Cliente, 10',
    tipoInteresse: 'comprador',
    finalidadeDesejada: 'venda',
    faixaPrecoMin: 300000,
    faixaPrecoMax: 800000,
    localizacaoDesejada: 'São Paulo',
    observacoes: 'Cliente criado pela suíte de relatórios.',
    ...sobrescritas,
  };
}

async function criarClienteViaApi(sessao, sobrescritas = {}) {
  const { resposta, dados } = await requisitar('/api/clientes', {
    method: 'POST',
    cookie: sessao.cookie,
    csrf: sessao.csrf,
    body: dadosCliente(sobrescritas),
  });

  assert.equal(resposta.status, 201, JSON.stringify(dados));
  return dados.cliente;
}

async function criarAtendimentoViaApi(sessao, clienteId, sobrescritas = {}) {
  const { resposta, dados } = await requisitar(
    `/api/clientes/${clienteId}/atendimentos`,
    {
      method: 'POST',
      cookie: sessao.cookie,
      csrf: sessao.csrf,
      body: {
        tipo: 'visita',
        status: 'realizado',
        dataAtendimento: DATA_ATENDIMENTO,
        descricao: `${PREFIX} Atendimento de teste`,
        ...sobrescritas,
      },
    }
  );

  assert.equal(resposta.status, 201, JSON.stringify(dados));
  return dados.atendimento;
}

async function definirVisibilidade(imoveis, clientes) {
  await pool.query(
    `UPDATE configuracoes SET valor = to_jsonb($1::text) WHERE chave = 'imoveis.visibilidade'`,
    [imoveis]
  );
  await pool.query(
    `UPDATE configuracoes SET valor = to_jsonb($1::text) WHERE chave = 'clientes.visibilidade'`,
    [clientes]
  );
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
    nome: 'Admin Relatórios',
    endereco: email('admin'),
    perfilId: perfilAdmin,
  });
  corretorA = await criarUsuario({
    nome: `${PREFIX} Corretor A`,
    endereco: email('a'),
    perfilId: perfilCorretor,
    corretor: { cpf: gerarCpf(baseCpf('a')), creci: `${PREFIX}-A` },
  });
  corretorB = await criarUsuario({
    nome: `${PREFIX} Corretor B`,
    endereco: email('b'),
    perfilId: perfilCorretor,
    corretor: { cpf: gerarCpf(baseCpf('b')), creci: `${PREFIX}-B` },
  });

  for (const usuario of [admin, corretorA, corretorB]) {
    const sessao = await login(usuario.email);
    assert.equal(sessao.resposta.status, 200, JSON.stringify(sessao.dados));
    usuario.cookie = sessao.cookie;
    usuario.csrf = sessao.csrf;
  }

  const { rows: configImoveis } = await pool.query(
    `SELECT valor FROM configuracoes WHERE chave = 'imoveis.visibilidade'`
  );
  const { rows: configClientes } = await pool.query(
    `SELECT valor FROM configuracoes WHERE chave = 'clientes.visibilidade'`
  );
  visibilidadeImoveis = configImoveis[0]?.valor || 'todos';
  visibilidadeClientes = configClientes[0]?.valor || 'todos';
  await definirVisibilidade('todos', 'todos');

  imovelA = await criarImovelViaApi(admin, {
    titulo: `${PREFIX} Apartamento A`,
    situacao: 'disponivel',
    finalidade: 'venda',
    valorVenda: 500000,
    corretores: [corretorA.corretorId],
    corretorPrincipalId: corretorA.corretorId,
  });
  imovelB = await criarImovelViaApi(admin, {
    titulo: `${PREFIX} Casa B`,
    tipo: 'casa',
    situacao: 'vendido',
    finalidade: 'venda',
    valorVenda: 700000,
    corretores: [corretorB.corretorId],
    corretorPrincipalId: corretorB.corretorId,
  });
  imovelC = await criarImovelViaApi(admin, {
    titulo: `${PREFIX} Sala C`,
    tipo: 'comercial',
    situacao: 'alugado',
    finalidade: 'aluguel',
    valorVenda: null,
    valorAluguel: 2500,
    corretores: [corretorA.corretorId],
    corretorPrincipalId: corretorA.corretorId,
  });

  clienteA = await criarClienteViaApi(admin, {
    nome: `${PREFIX} Cliente A`,
    finalidadeDesejada: 'venda',
    corretores: [corretorA.corretorId],
    corretorPrincipalId: corretorA.corretorId,
    imoveisInteresse: [imovelA.id],
  });
  clienteB = await criarClienteViaApi(admin, {
    nome: `${PREFIX} Cliente B`,
    finalidadeDesejada: 'aluguel',
    corretores: [corretorB.corretorId],
    corretorPrincipalId: corretorB.corretorId,
    imoveisInteresse: [imovelC.id],
  });

  await criarAtendimentoViaApi(admin, clienteA.id, {
    tipo: 'visita',
    status: 'realizado',
    imovelId: imovelA.id,
    corretorId: corretorA.corretorId,
    descricao: `${PREFIX} Visita ao imóvel A`,
  });
  await criarAtendimentoViaApi(admin, clienteA.id, {
    tipo: 'ligacao',
    status: 'agendado',
    corretorId: corretorA.corretorId,
    descricao: `${PREFIX} Retorno para o cliente A`,
  });
  await criarAtendimentoViaApi(admin, clienteB.id, {
    tipo: 'email',
    status: 'realizado',
    imovelId: imovelC.id,
    corretorId: corretorB.corretorId,
    descricao: `${PREFIX} Proposta para o cliente B`,
  });
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

  await definirVisibilidade(visibilidadeImoveis, visibilidadeClientes);
  await pool.query(
    `DELETE FROM atendimentos
      WHERE descricao LIKE $1
         OR cliente_id IN (SELECT id FROM clientes WHERE nome_completo LIKE $1)`,
    [`%${PREFIX}%`]
  );
  await pool.query(`DELETE FROM clientes WHERE nome_completo LIKE $1`, [`${PREFIX}%`]);
  await pool.query(`DELETE FROM imoveis WHERE upper(codigo_interno) LIKE upper($1)`, [
    `${PREFIX}%`,
  ]);
  await pool.query(`DELETE FROM corretores WHERE creci LIKE $1`, [`${PREFIX}%`]);
  await expurgarAuditoriaTeste('usuario_email LIKE $1 OR detalhes::text LIKE $1', [
    `%${PREFIX}%`,
  ]);
  await pool.query(`DELETE FROM usuarios WHERE email LIKE $1`, [`${PREFIX}%`]);

  await closePool();
});

test('dashboard e relatórios exigem autenticação', async () => {
  const dashboard = await requisitar('/api/dashboard');
  assert.equal(dashboard.resposta.status, 401);

  const relatorio = await requisitar('/api/relatorios/imoveis-situacao');
  assert.equal(relatorio.resposta.status, 401);

  const atendimentos = await requisitar('/api/atendimentos');
  assert.equal(atendimentos.resposta.status, 401);
});

test('dashboard calcula indicadores reais e respeita permissões', async () => {
  const { resposta, dados } = await requisitar('/api/dashboard', {
    cookie: admin.cookie,
  });
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.get('cache-control'), 'no-store');
  assert.ok(dados.imoveis.total >= 3);
  assert.ok(dados.corretores.ativos >= 2);
  assert.ok(dados.clientes.total >= 2);
  assert.ok(dados.atendimentos.total >= 3);
  assert.equal(dados.imoveis.porSituacao.length > 0, true);
  assert.equal(dados.atendimentos.serieMensal.length, 6);
  assert.equal(dados.clientes.serieMensal.length, 6);

  const situacao = dados.imoveis.porSituacao.find((item) => item.chave === 'vendido');
  assert.ok(situacao);
  assert.ok(situacao.total >= 1);

  const corretorDashboard = await requisitar('/api/dashboard', {
    cookie: corretorA.cookie,
  });
  assert.equal(corretorDashboard.resposta.status, 200);
  assert.ok(corretorDashboard.dados.imoveis.total >= 2);
  assert.ok(corretorDashboard.dados.clientes.total >= 1);

  await pool.query(
    `INSERT INTO permissoes_usuarios (usuario_id, permissao_id, permitido)
     SELECT $1, id, false FROM permissoes WHERE chave = 'dashboard.visualizar'
     ON CONFLICT (usuario_id, permissao_id)
     DO UPDATE SET permitido = false`,
    [corretorA.id]
  );

  const semPermissao = await requisitar('/api/dashboard', {
    cookie: corretorA.cookie,
  });
  assert.equal(semPermissao.resposta.status, 403);
  assert.equal(semPermissao.dados.error.code, 'FORBIDDEN');

  await pool.query(
    `DELETE FROM permissoes_usuarios
      WHERE usuario_id = $1
        AND permissao_id IN (SELECT id FROM permissoes WHERE chave = 'dashboard.visualizar')`,
    [corretorA.id]
  );
});

test('relatórios retornam dados consolidados e filtros validados', async () => {
  const catalogo = await requisitar('/api/relatorios', { cookie: admin.cookie });
  assert.equal(catalogo.resposta.status, 200);
  assert.equal(catalogo.dados.relatorios.length, 5);

  const opcoesAdmin = await requisitar('/api/relatorios/opcoes', {
    cookie: admin.cookie,
  });
  assert.equal(opcoesAdmin.resposta.status, 200);
  const ids = opcoesAdmin.dados.corretores.map((corretor) => corretor.id);
  assert.ok(ids.includes(corretorA.corretorId));
  assert.ok(ids.includes(corretorB.corretorId));

  const opcoesCorretor = await requisitar('/api/relatorios/opcoes', {
    cookie: corretorA.cookie,
  });
  assert.equal(opcoesCorretor.resposta.status, 200);
  assert.equal(opcoesCorretor.dados.corretores.length, 1);
  assert.equal(opcoesCorretor.dados.corretores[0].id, corretorA.corretorId);

  const situacao = await requisitar(
    `/api/relatorios/imoveis-situacao?corretor=${corretorA.corretorId}`,
    { cookie: admin.cookie }
  );
  assert.equal(situacao.resposta.status, 200);
  assert.equal(situacao.dados.relatorio.total, 2);
  assert.equal(situacao.dados.relatorio.resumo[0].valor, '2');
  assert.ok(
    situacao.dados.relatorio.linhas.some((linha) => linha.situacao === 'Disponível')
  );
  assert.ok(
    situacao.dados.relatorio.linhas.some((linha) => linha.situacao === 'Alugado')
  );

  const finalidade = await requisitar(
    `/api/relatorios/imoveis-finalidade?corretor=${corretorA.corretorId}`,
    { cookie: admin.cookie }
  );
  assert.equal(finalidade.resposta.status, 200);
  assert.equal(finalidade.dados.relatorio.total, 2);
  assert.ok(
    finalidade.dados.relatorio.linhas.some((linha) => linha.finalidade === 'Venda')
  );
  assert.ok(
    finalidade.dados.relatorio.linhas.some((linha) => linha.finalidade === 'Aluguel')
  );

  const porCorretor = await requisitar(
    `/api/relatorios/imoveis-corretor?corretor=${corretorA.corretorId}`,
    { cookie: admin.cookie }
  );
  assert.equal(porCorretor.resposta.status, 200);
  assert.equal(porCorretor.dados.relatorio.linhas.length, 1);
  assert.equal(porCorretor.dados.relatorio.linhas[0].total, 2);
  assert.equal(porCorretor.dados.relatorio.linhas[0].disponiveis, 1);
  assert.equal(porCorretor.dados.relatorio.linhas[0].alugados, 1);

  const clientes = await requisitar(
    `/api/relatorios/clientes-corretor?corretor=${corretorA.corretorId}`,
    { cookie: admin.cookie }
  );
  assert.equal(clientes.resposta.status, 200);
  assert.equal(clientes.dados.relatorio.linhas.length, 1);
  assert.equal(clientes.dados.relatorio.linhas[0].total, 1);
  assert.equal(clientes.dados.relatorio.linhas[0].atendimentos, 2);

  const atendimentos = await requisitar(
    `/api/relatorios/atendimentos?corretor=${corretorA.corretorId}`,
    { cookie: admin.cookie }
  );
  assert.equal(atendimentos.resposta.status, 200);
  assert.equal(atendimentos.dados.relatorio.total, 2);
  assert.equal(atendimentos.dados.relatorio.linhas.length, 2);
  assert.ok(atendimentos.dados.relatorio.filtros.some((item) => item.includes('Período')));

  const porPeriodo = await requisitar(
    `/api/relatorios/atendimentos?corretor=${corretorA.corretorId}&inicio=2026-01-01&fim=2026-01-31`,
    { cookie: admin.cookie }
  );
  assert.equal(porPeriodo.resposta.status, 200);
  assert.equal(porPeriodo.dados.relatorio.total, 2);

  const foraDoPeriodo = await requisitar(
    `/api/relatorios/atendimentos?corretor=${corretorA.corretorId}&inicio=2026-02-01`,
    { cookie: admin.cookie }
  );
  assert.equal(foraDoPeriodo.resposta.status, 200);
  assert.equal(foraDoPeriodo.dados.relatorio.total, 0);

  const dataInvalida = await requisitar(
    '/api/relatorios/imoveis-situacao?inicio=31-01-2026',
    { cookie: admin.cookie }
  );
  assert.equal(dataInvalida.resposta.status, 422);
  assert.equal(dataInvalida.dados.error.code, 'VALIDATION_ERROR');

  const periodoInvertido = await requisitar(
    '/api/relatorios/imoveis-situacao?inicio=2026-02-01&fim=2026-01-01',
    { cookie: admin.cookie }
  );
  assert.equal(periodoInvertido.resposta.status, 422);

  const inexistente = await requisitar('/api/relatorios/inexistente', {
    cookie: admin.cookie,
  });
  assert.equal(inexistente.resposta.status, 404);
  assert.equal(inexistente.dados.error.code, 'REPORT_NOT_FOUND');

  const formatoInvalido = await requisitar(
    '/api/relatorios/imoveis-situacao/exportacao?formato=xlsx',
    { cookie: admin.cookie }
  );
  assert.equal(formatoInvalido.resposta.status, 422);
});

test('visibilidade vinculada restringe relatórios e atendimentos', async () => {
  await definirVisibilidade('vinculados', 'vinculados');

  try {
    const imoveisA = await requisitar('/api/relatorios/imoveis-corretor', {
      cookie: corretorA.cookie,
    });
    assert.equal(imoveisA.resposta.status, 200);
    assert.equal(
      imoveisA.dados.relatorio.linhas.reduce((soma, linha) => soma + linha.total, 0),
      2
    );
    assert.equal(
      imoveisA.dados.relatorio.linhas.some(
        (linha) => linha.corretor === `${PREFIX} Corretor B`
      ),
      false
    );

    const imoveisB = await requisitar('/api/relatorios/imoveis-corretor', {
      cookie: corretorB.cookie,
    });
    assert.equal(imoveisB.resposta.status, 200);
    assert.equal(
      imoveisB.dados.relatorio.linhas.reduce((soma, linha) => soma + linha.total, 0),
      1
    );

    const clientesA = await requisitar('/api/relatorios/clientes-corretor', {
      cookie: corretorA.cookie,
    });
    assert.equal(clientesA.resposta.status, 200);
    assert.equal(
      clientesA.dados.relatorio.linhas.reduce((soma, linha) => soma + linha.total, 0),
      1
    );

    const atendimentosA = await requisitar('/api/atendimentos', {
      cookie: corretorA.cookie,
    });
    assert.equal(atendimentosA.resposta.status, 200);
    assert.equal(atendimentosA.dados.total, 2);
    assert.ok(
      atendimentosA.dados.atendimentos.every(
        (atendimento) => atendimento.corretor === `${PREFIX} Corretor A`
      )
    );

    const atendimentosB = await requisitar('/api/atendimentos', {
      cookie: corretorB.cookie,
    });
    assert.equal(atendimentosB.resposta.status, 200);
    assert.equal(atendimentosB.dados.total, 1);

    const dashboardA = await requisitar('/api/dashboard', {
      cookie: corretorA.cookie,
    });
    assert.equal(dashboardA.resposta.status, 200);
    assert.equal(dashboardA.dados.imoveis.total, 2);
    assert.equal(dashboardA.dados.clientes.total, 1);
    assert.equal(dashboardA.dados.atendimentos.total, 2);

    const adminImoveis = await requisitar('/api/relatorios/imoveis-corretor', {
      cookie: admin.cookie,
    });
    assert.equal(adminImoveis.resposta.status, 200);
    assert.equal(
      adminImoveis.dados.relatorio.linhas.reduce((soma, linha) => soma + linha.total, 0),
      3
    );
  } finally {
    await definirVisibilidade('todos', 'todos');
  }
});

test('atendimentos listam com busca, filtros e paginação', async () => {
  const lista = await requisitar('/api/atendimentos?limite=100', {
    cookie: admin.cookie,
  });
  assert.equal(lista.resposta.status, 200);
  assert.ok(lista.dados.total >= 3);
  assert.ok(lista.dados.atendimentos.every((item) => item.cliente && item.corretor));

  const busca = await requisitar(
    `/api/atendimentos?busca=${encodeURIComponent(`${PREFIX} Cliente A`)}`,
    { cookie: admin.cookie }
  );
  assert.equal(busca.resposta.status, 200);
  assert.equal(busca.dados.total, 2);

  const porTipo = await requisitar('/api/atendimentos?tipo=visita', {
    cookie: admin.cookie,
  });
  assert.equal(porTipo.resposta.status, 200);
  assert.ok(porTipo.dados.atendimentos.every((item) => item.tipo === 'visita'));

  const porStatus = await requisitar('/api/atendimentos?status=agendado', {
    cookie: admin.cookie,
  });
  assert.equal(porStatus.resposta.status, 200);
  assert.ok(porStatus.dados.atendimentos.every((item) => item.status === 'agendado'));

  const paginado = await requisitar('/api/atendimentos?limite=1&pagina=1', {
    cookie: admin.cookie,
  });
  assert.equal(paginado.resposta.status, 200);
  assert.equal(paginado.dados.limite, 1);
  assert.equal(paginado.dados.atendimentos.length, 1);
  assert.ok(paginado.dados.totalPaginas >= 1);

  const tipoInvalido = await requisitar('/api/atendimentos?tipo=inexistente', {
    cookie: admin.cookie,
  });
  assert.equal(tipoInvalido.resposta.status, 422);
});

test('exportação gera CSV e PDF e exige permissão específica', async () => {
  const csv = await requisitar(
    `/api/relatorios/imoveis-situacao/exportacao?formato=csv&corretor=${corretorA.corretorId}`,
    { cookie: admin.cookie }
  );
  assert.equal(csv.resposta.status, 200);
  assert.match(csv.resposta.headers.get('content-type'), /text\/csv/);
  assert.match(csv.resposta.headers.get('content-disposition'), /attachment; filename=/);
  assert.match(csv.texto, /Situação/);
  assert.match(csv.texto, /Disponível/);

  const pdf = await requisitar(
    `/api/relatorios/imoveis-situacao/exportacao?formato=pdf&corretor=${corretorA.corretorId}`,
    { cookie: admin.cookie }
  );
  assert.equal(pdf.resposta.status, 200);
  assert.match(pdf.resposta.headers.get('content-type'), /application\/pdf/);
  assert.match(pdf.texto.slice(0, 8), /%PDF-1\.4/);

  await pool.query(
    `INSERT INTO permissoes_usuarios (usuario_id, permissao_id, permitido)
     SELECT $1, id, false FROM permissoes WHERE chave = 'relatorios.exportar'
     ON CONFLICT (usuario_id, permissao_id)
     DO UPDATE SET permitido = false`,
    [corretorA.id]
  );

  const semExportar = await requisitar(
    '/api/relatorios/imoveis-situacao/exportacao?formato=csv',
    { cookie: corretorA.cookie }
  );
  assert.equal(semExportar.resposta.status, 403);
  assert.equal(semExportar.dados.error.code, 'FORBIDDEN');

  await pool.query(
    `DELETE FROM permissoes_usuarios
      WHERE usuario_id = $1
        AND permissao_id IN (SELECT id FROM permissoes WHERE chave = 'relatorios.exportar')`,
    [corretorA.id]
  );

  await pool.query(
    `INSERT INTO permissoes_usuarios (usuario_id, permissao_id, permitido)
     SELECT $1, id, false FROM permissoes WHERE chave = 'relatorios.visualizar'
     ON CONFLICT (usuario_id, permissao_id)
     DO UPDATE SET permitido = false`,
    [corretorA.id]
  );

  const semVisualizar = await requisitar('/api/relatorios/imoveis-situacao', {
    cookie: corretorA.cookie,
  });
  assert.equal(semVisualizar.resposta.status, 403);
  assert.equal(semVisualizar.dados.error.code, 'FORBIDDEN');

  await pool.query(
    `DELETE FROM permissoes_usuarios
      WHERE usuario_id = $1
        AND permissao_id IN (SELECT id FROM permissoes WHERE chave = 'relatorios.visualizar')`,
    [corretorA.id]
  );
});
