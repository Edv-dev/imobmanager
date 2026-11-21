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
const PREFIX = `cliente.${process.pid}.${Date.now()}`;

let server;
let baseUrl;
let perfilAdmin;
let perfilCorretor;
let admin;
let corretorA;
let corretorB;
let visibilidadeAnterior;
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

function dadosCliente(sobrescritas = {}) {
  contador += 1;
  const numero = String(contador).padStart(3, '0');

  return {
    nome: `${PREFIX} Cliente ${numero}`,
    cpf: gerarCpf(baseCpf(`cliente-${numero}`)),
    telefone: '(11) 99999-0000',
    whatsapp: '(11) 98888-0000',
    email: `${PREFIX}.cliente${numero}@exemplo.test`,
    endereco: 'Rua de Teste, 100',
    tipoInteresse: 'comprador',
    finalidadeDesejada: 'venda',
    faixaPrecoMin: 200000,
    faixaPrecoMax: 500000,
    localizacaoDesejada: 'Campinas, SP',
    observacoes: 'Observações criadas pela suíte de testes.',
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
  return dados;
}

async function criarImovelViaApi(sessao, sobrescritas = {}) {
  contador += 1;
  const numero = String(contador).padStart(3, '0');

  const { resposta, dados } = await requisitar('/api/imoveis', {
    method: 'POST',
    cookie: sessao.cookie,
    csrf: sessao.csrf,
    body: {
      codigo: `${PREFIX}-IM-${numero}`,
      titulo: `${PREFIX} Imóvel ${numero}`,
      tipo: 'casa',
      finalidade: 'venda',
      cidade: 'Campinas',
      bairro: 'Centro',
      situacao: 'disponivel',
      ...sobrescritas,
    },
  });

  assert.equal(resposta.status, 201, JSON.stringify(dados));
  return dados.imovel;
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
    nome: 'Admin Clientes',
    endereco: email('admin'),
    perfilId: perfilAdmin,
  });
  corretorA = await criarUsuario({
    nome: `${PREFIX} Corretor A`,
    endereco: email('a'),
    perfilId: perfilCorretor,
    corretor: { cpf: gerarCpf(baseCpf('corretor-a')), creci: `${PREFIX}-A` },
  });
  corretorB = await criarUsuario({
    nome: `${PREFIX} Corretor B`,
    endereco: email('b'),
    perfilId: perfilCorretor,
    corretor: { cpf: gerarCpf(baseCpf('corretor-b')), creci: `${PREFIX}-B` },
  });

  for (const usuario of [admin, corretorA, corretorB]) {
    const sessao = await login(usuario.email);
    assert.equal(sessao.resposta.status, 200, JSON.stringify(sessao.dados));
    usuario.cookie = sessao.cookie;
    usuario.csrf = sessao.csrf;
  }

  const { rows } = await pool.query(
    `SELECT valor FROM configuracoes WHERE chave = 'clientes.visibilidade'`
  );
  visibilidadeAnterior = rows[0]?.valor || 'todos';
  await pool.query(
    `UPDATE configuracoes SET valor = to_jsonb('todos'::text) WHERE chave = 'clientes.visibilidade'`
  );
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

  await pool.query(
    `UPDATE configuracoes SET valor = to_jsonb($1::text) WHERE chave = 'clientes.visibilidade'`,
    [visibilidadeAnterior]
  );
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

test('rotas de clientes exigem autenticação e respeitam permissões', async () => {
  const semSessao = await requisitar('/api/clientes');
  assert.equal(semSessao.resposta.status, 401);
  assert.equal(semSessao.dados.error.code, 'UNAUTHENTICATED');

  const lista = await requisitar('/api/clientes?limite=50', {
    cookie: corretorA.cookie,
  });
  assert.equal(lista.resposta.status, 200);
  assert.ok(Array.isArray(lista.dados.clientes));

  const opcoesCorretor = await requisitar('/api/clientes/corretores-opcoes', {
    cookie: corretorA.cookie,
  });
  assert.equal(opcoesCorretor.resposta.status, 403);
  assert.equal(opcoesCorretor.dados.error.code, 'FORBIDDEN');

  const opcoesAdmin = await requisitar('/api/clientes/corretores-opcoes', {
    cookie: admin.cookie,
  });
  assert.equal(opcoesAdmin.resposta.status, 200);
  const ids = opcoesAdmin.dados.corretores.map((corretor) => corretor.id);
  assert.ok(ids.includes(corretorA.corretorId));
  assert.ok(ids.includes(corretorB.corretorId));

  const imoveis = await requisitar('/api/clientes/imoveis-opcoes', {
    cookie: corretorA.cookie,
  });
  assert.equal(imoveis.resposta.status, 200);
  assert.ok(Array.isArray(imoveis.dados.imoveis));

  const excluirSemPermissao = await requisitar('/api/clientes/1', {
    method: 'DELETE',
    cookie: corretorA.cookie,
    csrf: corretorA.csrf,
  });
  assert.equal(excluirSemPermissao.resposta.status, 403);
  assert.equal(excluirSemPermissao.dados.error.code, 'FORBIDDEN');
});

test('administrador cadastra cliente completo com vínculos e auditoria', async () => {
  const imovelA = await criarImovelViaApi(admin);
  const imovelB = await criarImovelViaApi(admin);
  const payload = dadosCliente({
    corretores: [corretorA.corretorId, corretorB.corretorId],
    corretorPrincipalId: corretorB.corretorId,
    imoveisInteresse: [imovelA.id, imovelB.id],
  });

  const { resposta, dados } = await requisitar('/api/clientes', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: payload,
  });

  assert.equal(resposta.status, 201, JSON.stringify(dados));
  const cliente = dados.cliente;

  assert.equal(cliente.nome, payload.nome);
  assert.equal(cliente.cpf, payload.cpf.replace(/\D/g, ''));
  assert.equal(cliente.tipoInteresse, 'comprador');
  assert.equal(cliente.finalidadeDesejada, 'venda');
  assert.equal(cliente.faixaPrecoMin, 200000);
  assert.equal(cliente.faixaPrecoMax, 500000);
  assert.equal(dados.corretores.length, 2);
  assert.equal(
    dados.corretores.find((corretor) => corretor.principal).id,
    corretorB.corretorId
  );
  assert.deepEqual(
    dados.imoveisInteresse.map((imovel) => imovel.id).sort(),
    [imovelA.id, imovelB.id].sort()
  );
  assert.deepEqual(dados.atendimentos, []);

  const { rows } = await pool.query(
    `SELECT tipo_operacao, entidade, registro_id, detalhes
       FROM auditoria
      WHERE entidade = 'clientes'
        AND registro_id = $1
        AND tipo_operacao = 'cliente.criado'`,
    [String(cliente.id)]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].detalhes.cpf, cliente.cpf);

  const historico = await requisitar(`/api/clientes/${cliente.id}/historico`, {
    cookie: admin.cookie,
  });
  assert.equal(historico.resposta.status, 200);
  assert.ok(
    historico.dados.eventos.some((evento) => evento.tipoOperacao === 'cliente.criado')
  );
});

test('cadastro valida campos, CPF único, faixa e vínculos', async () => {
  const base = dadosCliente();

  const criado = await requisitar('/api/clientes', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: base,
  });
  assert.equal(criado.resposta.status, 201, JSON.stringify(criado.dados));

  const duplicado = await requisitar('/api/clientes', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: dadosCliente({ cpf: base.cpf }),
  });
  assert.equal(duplicado.resposta.status, 409);
  assert.equal(duplicado.dados.error.code, 'CPF_IN_USE');

  const semNome = await requisitar('/api/clientes', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: dadosCliente({ nome: 'A' }),
  });
  assert.equal(semNome.resposta.status, 422);
  assert.equal(semNome.dados.error.code, 'VALIDATION_ERROR');

  const cpfInvalido = await requisitar('/api/clientes', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: dadosCliente({ cpf: '11111111111' }),
  });
  assert.equal(cpfInvalido.resposta.status, 422);

  const faixaInvalida = await requisitar('/api/clientes', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: dadosCliente({ faixaPrecoMin: 900000, faixaPrecoMax: 100000 }),
  });
  assert.equal(faixaInvalida.resposta.status, 422);

  const tipoInvalido = await requisitar('/api/clientes', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: dadosCliente({ tipoInteresse: 'curioso' }),
  });
  assert.equal(tipoInvalido.resposta.status, 422);

  const corretorInexistente = await requisitar('/api/clientes', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: dadosCliente({
      corretores: [999999999],
      corretorPrincipalId: 999999999,
    }),
  });
  assert.equal(corretorInexistente.resposta.status, 422);

  const principalForaDaLista = await requisitar('/api/clientes', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: dadosCliente({
      corretores: [corretorA.corretorId],
      corretorPrincipalId: corretorB.corretorId,
    }),
  });
  assert.equal(principalForaDaLista.resposta.status, 422);

  const imovelInexistente = await requisitar('/api/clientes', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: dadosCliente({ imoveisInteresse: [999999999] }),
  });
  assert.equal(imovelInexistente.resposta.status, 422);

  const corretorTentandoVincular = await requisitar('/api/clientes', {
    method: 'POST',
    cookie: corretorA.cookie,
    csrf: corretorA.csrf,
    body: dadosCliente({
      corretores: [corretorA.corretorId],
      corretorPrincipalId: corretorA.corretorId,
    }),
  });
  assert.equal(corretorTentandoVincular.resposta.status, 403);
  assert.equal(corretorTentandoVincular.dados.error.code, 'FORBIDDEN');

  const autoVinculo = await requisitar('/api/clientes', {
    method: 'POST',
    cookie: corretorA.cookie,
    csrf: corretorA.csrf,
    body: dadosCliente(),
  });
  assert.equal(autoVinculo.resposta.status, 201, JSON.stringify(autoVinculo.dados));
  assert.equal(autoVinculo.dados.corretores.length, 1);
  assert.equal(autoVinculo.dados.corretores[0].id, corretorA.corretorId);
  assert.equal(autoVinculo.dados.corretores[0].principal, true);
});

test('listagem aplica busca, filtros e paginação', async () => {
  const comprador = await criarClienteViaApi(admin, {
    nome: `${PREFIX} FILTRO Comprador`,
    tipoInteresse: 'comprador',
    finalidadeDesejada: 'venda',
    localizacaoDesejada: `${PREFIX} Campinas`,
  });
  const locatario = await criarClienteViaApi(admin, {
    nome: `${PREFIX} FILTRO Locatário`,
    tipoInteresse: 'locatario',
    finalidadeDesejada: 'aluguel',
    localizacaoDesejada: `${PREFIX} Santos`,
  });
  await criarClienteViaApi(admin, {
    nome: `${PREFIX} FILTRO Vendedor`,
    tipoInteresse: 'vendedor',
    finalidadeDesejada: 'ambos',
    localizacaoDesejada: `${PREFIX} Campinas`,
  });

  const busca = await requisitar(
    `/api/clientes?busca=${encodeURIComponent(`${PREFIX} FILTRO`)}&limite=50`,
    { cookie: admin.cookie }
  );
  assert.equal(busca.resposta.status, 200);
  assert.equal(busca.dados.total, 3);

  const porCpf = await requisitar(
    `/api/clientes?busca=${encodeURIComponent(comprador.cliente.cpf)}&limite=50`,
    { cookie: admin.cookie }
  );
  assert.equal(porCpf.resposta.status, 200);
  assert.ok(porCpf.dados.clientes.some((cliente) => cliente.id === comprador.cliente.id));

  const porTipo = await requisitar('/api/clientes?tipo=locatario&limite=50', {
    cookie: admin.cookie,
  });
  assert.equal(porTipo.resposta.status, 200);
  assert.equal(porTipo.dados.total, 1);
  assert.equal(porTipo.dados.clientes[0].id, locatario.cliente.id);

  const porFinalidade = await requisitar('/api/clientes?finalidade=ambos&limite=50', {
    cookie: admin.cookie,
  });
  assert.equal(porFinalidade.resposta.status, 200);
  assert.equal(porFinalidade.dados.total, 1);

  const porLocalizacao = await requisitar(
    `/api/clientes?localizacao=${encodeURIComponent(`${PREFIX} Campinas`)}&limite=50`,
    { cookie: admin.cookie }
  );
  assert.equal(porLocalizacao.resposta.status, 200);
  assert.equal(porLocalizacao.dados.total, 2);

  const paginado = await requisitar(
    `/api/clientes?busca=${encodeURIComponent(`${PREFIX} FILTRO`)}&limite=1&pagina=2`,
    { cookie: admin.cookie }
  );
  assert.equal(paginado.resposta.status, 200);
  assert.equal(paginado.dados.total, 3);
  assert.equal(paginado.dados.totalPaginas, 3);
  assert.equal(paginado.dados.clientes.length, 1);

  const filtroInvalido = await requisitar('/api/clientes?tipo=curioso', {
    cookie: admin.cookie,
  });
  assert.equal(filtroInvalido.resposta.status, 422);
});

test('detalhe, atualização parcial e alteração de vínculos', async () => {
  const imovelA = await criarImovelViaApi(admin);
  const imovelB = await criarImovelViaApi(admin);
  const criado = await criarClienteViaApi(admin, {
    corretores: [corretorA.corretorId, corretorB.corretorId],
    corretorPrincipalId: corretorA.corretorId,
    imoveisInteresse: [imovelA.id],
  });

  const detalhe = await requisitar(`/api/clientes/${criado.cliente.id}`, {
    cookie: admin.cookie,
  });
  assert.equal(detalhe.resposta.status, 200);
  assert.equal(detalhe.dados.corretores.length, 2);
  assert.equal(detalhe.dados.imoveisInteresse.length, 1);

  const parcial = await requisitar(`/api/clientes/${criado.cliente.id}`, {
    method: 'PATCH',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: { telefone: '(11) 97777-0000' },
  });
  assert.equal(parcial.resposta.status, 200, JSON.stringify(parcial.dados));
  assert.equal(parcial.dados.cliente.telefone, '(11) 97777-0000');
  assert.equal(parcial.dados.cliente.nome, criado.cliente.nome);
  assert.equal(parcial.dados.cliente.cpf, criado.cliente.cpf);
  assert.equal(parcial.dados.corretores.length, 2);
  assert.equal(parcial.dados.imoveisInteresse.length, 1);

  const vinculos = await requisitar(`/api/clientes/${criado.cliente.id}`, {
    method: 'PATCH',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: {
      corretores: [corretorB.corretorId],
      corretorPrincipalId: corretorB.corretorId,
      imoveisInteresse: [imovelB.id],
    },
  });
  assert.equal(vinculos.resposta.status, 200, JSON.stringify(vinculos.dados));
  assert.equal(vinculos.dados.corretores.length, 1);
  assert.equal(vinculos.dados.corretores[0].id, corretorB.corretorId);
  assert.equal(vinculos.dados.corretores[0].principal, true);
  assert.deepEqual(
    vinculos.dados.imoveisInteresse.map((imovel) => imovel.id),
    [imovelB.id]
  );

  const corretorAlterandoVinculo = await requisitar(
    `/api/clientes/${criado.cliente.id}`,
    {
      method: 'PATCH',
      cookie: corretorA.cookie,
      csrf: corretorA.csrf,
      body: { corretores: [corretorA.corretorId] },
    }
  );
  assert.equal(corretorAlterandoVinculo.resposta.status, 403);
  assert.equal(corretorAlterandoVinculo.dados.error.code, 'FORBIDDEN');
});

test('atendimentos são registrados, listados e auditados', async () => {
  const imovel = await criarImovelViaApi(admin);
  const criado = await criarClienteViaApi(admin, {
    corretores: [corretorA.corretorId],
    corretorPrincipalId: corretorA.corretorId,
    imoveisInteresse: [imovel.id],
  });

  const atendimentoAdmin = await requisitar(
    `/api/clientes/${criado.cliente.id}/atendimentos`,
    {
      method: 'POST',
      cookie: admin.cookie,
      csrf: admin.csrf,
      body: {
        tipo: 'visita',
        status: 'realizado',
        dataAtendimento: new Date().toISOString(),
        descricao: `${PREFIX} Visita ao imóvel de interesse`,
        observacoes: 'Cliente gostou da localização.',
        imovelId: imovel.id,
        corretorId: corretorA.corretorId,
      },
    }
  );
  assert.equal(atendimentoAdmin.resposta.status, 201, JSON.stringify(atendimentoAdmin.dados));
  assert.equal(atendimentoAdmin.dados.atendimento.tipo, 'visita');
  assert.equal(atendimentoAdmin.dados.atendimento.corretorId, corretorA.corretorId);
  assert.equal(atendimentoAdmin.dados.atendimento.imovelId, imovel.id);

  const atendimentoCorretor = await requisitar(
    `/api/clientes/${criado.cliente.id}/atendimentos`,
    {
      method: 'POST',
      cookie: corretorA.cookie,
      csrf: corretorA.csrf,
      body: {
        tipo: 'ligacao',
        status: 'agendado',
        descricao: `${PREFIX} Retorno por telefone`,
      },
    }
  );
  assert.equal(
    atendimentoCorretor.resposta.status,
    201,
    JSON.stringify(atendimentoCorretor.dados)
  );
  assert.equal(atendimentoCorretor.dados.atendimento.corretorId, corretorA.corretorId);

  const corretorEmNomeDeOutro = await requisitar(
    `/api/clientes/${criado.cliente.id}/atendimentos`,
    {
      method: 'POST',
      cookie: corretorA.cookie,
      csrf: corretorA.csrf,
      body: {
        tipo: 'ligacao',
        descricao: `${PREFIX} Tentativa em nome de outro`,
        corretorId: corretorB.corretorId,
      },
    }
  );
  assert.equal(corretorEmNomeDeOutro.resposta.status, 403);
  assert.equal(corretorEmNomeDeOutro.dados.error.code, 'FORBIDDEN');

  const statusInvalido = await requisitar(
    `/api/clientes/${criado.cliente.id}/atendimentos`,
    {
      method: 'POST',
      cookie: admin.cookie,
      csrf: admin.csrf,
      body: {
        tipo: 'ligacao',
        status: 'pendente',
        descricao: `${PREFIX} Status inválido`,
      },
    }
  );
  assert.equal(statusInvalido.resposta.status, 422);

  const semDescricao = await requisitar(
    `/api/clientes/${criado.cliente.id}/atendimentos`,
    {
      method: 'POST',
      cookie: admin.cookie,
      csrf: admin.csrf,
      body: { tipo: 'ligacao', descricao: '' },
    }
  );
  assert.equal(semDescricao.resposta.status, 422);

  const imovelInexistente = await requisitar(
    `/api/clientes/${criado.cliente.id}/atendimentos`,
    {
      method: 'POST',
      cookie: admin.cookie,
      csrf: admin.csrf,
      body: {
        tipo: 'ligacao',
        descricao: `${PREFIX} Imóvel inexistente`,
        imovelId: 999999999,
      },
    }
  );
  assert.equal(imovelInexistente.resposta.status, 422);

  const detalhe = await requisitar(`/api/clientes/${criado.cliente.id}`, {
    cookie: admin.cookie,
  });
  assert.equal(detalhe.resposta.status, 200);
  assert.equal(detalhe.dados.atendimentos.length, 2);
  assert.equal(detalhe.dados.resumo.atendimentos, 2);
  assert.ok(
    detalhe.dados.atendimentos.some(
      (atendimento) => atendimento.imovel?.id === imovel.id
    )
  );

  const { rows } = await pool.query(
    `SELECT tipo_operacao, detalhes
       FROM auditoria
      WHERE entidade = 'clientes'
        AND registro_id = $1
        AND tipo_operacao = 'cliente.atendimento_registrado'`,
    [String(criado.cliente.id)]
  );
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.detalhes.tipo));
});

test('visibilidade vinculada restringe lista, detalhe e operações', async () => {
  try {
    await pool.query(
      `UPDATE configuracoes SET valor = to_jsonb('vinculados'::text) WHERE chave = 'clientes.visibilidade'`
    );

    const clienteA = await criarClienteViaApi(corretorA);
    const clienteB = await criarClienteViaApi(corretorB);

    const listaA = await requisitar('/api/clientes?limite=50', {
      cookie: corretorA.cookie,
    });
    assert.equal(listaA.resposta.status, 200);
    const nomes = listaA.dados.clientes.map((cliente) => cliente.nome);
    assert.ok(nomes.includes(clienteA.cliente.nome));
    assert.equal(nomes.includes(clienteB.cliente.nome), false);

    const detalheProprio = await requisitar(`/api/clientes/${clienteA.cliente.id}`, {
      cookie: corretorA.cookie,
    });
    assert.equal(detalheProprio.resposta.status, 200);

    const detalheAlheio = await requisitar(`/api/clientes/${clienteB.cliente.id}`, {
      cookie: corretorA.cookie,
    });
    assert.equal(detalheAlheio.resposta.status, 404);
    assert.equal(detalheAlheio.dados.error.code, 'CLIENTE_NOT_FOUND');

    const edicaoAlheia = await requisitar(`/api/clientes/${clienteB.cliente.id}`, {
      method: 'PATCH',
      cookie: corretorA.cookie,
      csrf: corretorA.csrf,
      body: { telefone: '(11) 96666-0000' },
    });
    assert.equal(edicaoAlheia.resposta.status, 404);

    const atendimentoAlheio = await requisitar(
      `/api/clientes/${clienteB.cliente.id}/atendimentos`,
      {
        method: 'POST',
        cookie: corretorA.cookie,
        csrf: corretorA.csrf,
        body: { tipo: 'ligacao', descricao: `${PREFIX} Sem acesso` },
      }
    );
    assert.equal(atendimentoAlheio.resposta.status, 404);

    const listaAdmin = await requisitar('/api/clientes?limite=50', {
      cookie: admin.cookie,
    });
    assert.equal(listaAdmin.resposta.status, 200);
    const nomesAdmin = listaAdmin.dados.clientes.map((cliente) => cliente.nome);
    assert.ok(nomesAdmin.includes(clienteA.cliente.nome));
    assert.ok(nomesAdmin.includes(clienteB.cliente.nome));
  } finally {
    await pool.query(
      `UPDATE configuracoes SET valor = to_jsonb('todos'::text) WHERE chave = 'clientes.visibilidade'`
    );
  }
});

test('histórico exige permissão de auditoria e exclusão é lógica', async () => {
  const imovel = await criarImovelViaApi(admin);
  const criado = await criarClienteViaApi(admin, {
    imoveisInteresse: [imovel.id],
  });

  await requisitar(`/api/clientes/${criado.cliente.id}/atendimentos`, {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: {
      tipo: 'reuniao',
      descricao: `${PREFIX} Reunião antes da exclusão`,
      imovelId: imovel.id,
    },
  });

  const historicoAdmin = await requisitar(
    `/api/clientes/${criado.cliente.id}/historico`,
    { cookie: admin.cookie }
  );
  assert.equal(historicoAdmin.resposta.status, 200);
  assert.ok(
    historicoAdmin.dados.eventos.some(
      (evento) => evento.tipoOperacao === 'cliente.criado'
    )
  );

  const historicoCorretor = await requisitar(
    `/api/clientes/${criado.cliente.id}/historico`,
    { cookie: corretorA.cookie }
  );
  assert.equal(historicoCorretor.resposta.status, 403);
  assert.equal(historicoCorretor.dados.error.code, 'FORBIDDEN');

  const exclusao = await requisitar(`/api/clientes/${criado.cliente.id}`, {
    method: 'DELETE',
    cookie: admin.cookie,
    csrf: admin.csrf,
  });
  assert.equal(exclusao.resposta.status, 200, JSON.stringify(exclusao.dados));
  assert.equal(String(exclusao.dados.id), String(criado.cliente.id));

  const detalhe = await requisitar(`/api/clientes/${criado.cliente.id}`, {
    cookie: admin.cookie,
  });
  assert.equal(detalhe.resposta.status, 404);

  const lista = await requisitar(
    `/api/clientes?busca=${encodeURIComponent(criado.cliente.nome)}`,
    { cookie: admin.cookie }
  );
  assert.equal(lista.resposta.status, 200);
  assert.equal(lista.dados.total, 0);

  const reutilizacao = await requisitar('/api/clientes', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: dadosCliente({ cpf: criado.cliente.cpf, nome: `${PREFIX} CPF Reutilizado` }),
  });
  assert.equal(reutilizacao.resposta.status, 201, JSON.stringify(reutilizacao.dados));
});

test('tela de clientes está conectada à API real', async () => {
  const response = await fetch(`${baseUrl}/js/views/clientes.js`);
  const script = await response.text();

  assert.equal(response.status, 200);
  assert.match(script, /\/api\/clientes/);
  assert.match(script, /data-cliente-form/);
  assert.match(script, /imoveisInteresse/);
  assert.match(script, /atendimentos/);
  assert.equal(script.includes('createModuleView'), false);
});
