'use strict';

process.env.NODE_ENV = 'test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const createApp = require('../src/app');
const { pool, closePool } = require('../src/config/database');
const { hashPassword } = require('../src/utils/password');
const { expurgarAuditoriaTeste } = require('./helpers/auditoria');

const SENHA = 'SenhaSegura123!';
const PREFIX = `lgpd.${process.pid}.${Date.now()}`;

let server;
let baseUrl;
let admin;
let corretor;
let usuarioRestrito;
let perfilRestrito;
let corretorId;
let clienteId;
let imovelId;
let inicioTeste;
let retencaoOriginal;

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

async function criarUsuario({ nome, endereco, perfilId, administrativo = false }) {
  const senhaHash = await hashPassword(SENHA);
  const { rows } = await pool.query(
    `INSERT INTO usuarios (perfil_id, nome_completo, email, senha_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email`,
    [perfilId, nome, endereco, senhaHash]
  );
  const usuario = rows[0];
  usuario.administrativo = administrativo;
  return usuario;
}

async function requisitar(path, options = {}) {
  const { method = 'GET', body, cookie, csrf, headers = {} } = options;
  const resposta = await fetch(`${baseUrl}${path}`, {
    method,
    redirect: 'follow',
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

async function consultarAuditoria(sessao, params) {
  const query = new URLSearchParams(params);
  const { resposta, dados } = await requisitar(
    `/api/administracao/auditoria?${query.toString()}`,
    { cookie: sessao.cookie }
  );
  assert.equal(resposta.status, 200);
  return dados.eventos;
}

before(async () => {
  inicioTeste = new Date();

  const app = createApp();
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const { rows: retencao } = await pool.query(
    `SELECT valor FROM configuracoes WHERE chave = 'auditoria.retencao_dias'`
  );
  retencaoOriginal = Number(retencao[0]?.valor || 365);

  const { rows: perfis } = await pool.query(
    `SELECT id, nome, administrativo FROM perfis WHERE nome IN ('Administrador', 'Corretor')`
  );
  const perfilAdmin = perfis.find((perfil) => perfil.nome === 'Administrador');
  const perfilCorretor = perfis.find((perfil) => perfil.nome === 'Corretor');

  admin = await criarUsuario({
    nome: 'Admin LGPD',
    endereco: email('admin'),
    perfilId: perfilAdmin.id,
    administrativo: true,
  });

  corretor = await criarUsuario({
    nome: 'Corretor LGPD',
    endereco: email('corretor'),
    perfilId: perfilCorretor.id,
  });

  const { rows: perfisRestritos } = await pool.query(
    `INSERT INTO perfis (nome, descricao, administrativo)
     VALUES ($1, 'Perfil administrativo sem permissões para teste.', true)
     RETURNING id`,
    [`Perfil restrito ${PREFIX}`]
  );
  perfilRestrito = perfisRestritos[0];

  usuarioRestrito = await criarUsuario({
    nome: 'Administrador restrito',
    endereco: email('restrito'),
    perfilId: perfilRestrito.id,
    administrativo: true,
  });

  const { rows: corretores } = await pool.query(
    `INSERT INTO corretores (usuario_id, nome_completo, cpf, creci, email)
     VALUES ($1, 'Corretor LGPD', $2, $3, $4)
     RETURNING id`,
    [
      corretor.id,
      gerarCpf(baseCpf('corretor')),
      `${PREFIX}-CRECI`,
      email('corretor'),
    ]
  );
  corretorId = corretores[0].id;

  const { rows: imoveis } = await pool.query(
    `INSERT INTO imoveis
       (codigo_interno, titulo, tipo_imovel, finalidade, cidade, bairro, valor_venda, criado_por_usuario_id)
     VALUES ($1, 'Imóvel de teste LGPD', 'apartamento', 'venda', 'São Paulo', 'Centro', 400000, $2)
     RETURNING id`,
    [`${PREFIX}-IMOVEL`, admin.id]
  );
  imovelId = imoveis[0].id;

  const { rows: clientes } = await pool.query(
    `INSERT INTO clientes
       (nome_completo, cpf, telefone, whatsapp, email, endereco, finalidade_desejada, observacoes, criado_por_usuario_id)
     VALUES ($1, $2, '11999990000', '11999990000', $3, 'Rua Sigilosa, 10', 'venda', 'Preferência por bairro central', $4)
     RETURNING id`,
    [
      `${PREFIX} Maria Titular`,
      gerarCpf(baseCpf('titular')),
      email('titular'),
      admin.id,
    ]
  );
  clienteId = clientes[0].id;

  await pool.query(
    `INSERT INTO clientes_corretores (cliente_id, corretor_id, principal)
     VALUES ($1, $2, true)`,
    [clienteId, corretorId]
  );

  await pool.query(
    `INSERT INTO acessos_clientes (usuario_id, cliente_id, permitido, concedido_por_usuario_id)
     VALUES ($1, $2, true, $3)`,
    [corretor.id, clienteId, admin.id]
  );

  await pool.query(
    `INSERT INTO atendimentos
       (cliente_id, corretor_id, imovel_id, tipo, descricao, observacoes, criado_por_usuario_id)
     VALUES ($1, $2, $3, 'visita', 'Cliente deseja visitar o imóvel.', 'Telefone pessoal 11999990000', $4)`,
    [clienteId, corretorId, imovelId, admin.id]
  );

  await pool.query(
    `INSERT INTO clientes_imoveis_interesse (cliente_id, imovel_id) VALUES ($1, $2)`,
    [clienteId, imovelId]
  );

  await pool.query(
    `INSERT INTO auditoria
       (usuario_email, tipo_operacao, entidade, registro_id, resultado, detalhes)
     VALUES ($1, 'cliente.criado', 'clientes', $2, 'sucesso', $3)`,
    [
      admin.email,
      String(clienteId),
      JSON.stringify({
        nome: 'Maria Titular',
        cpf: '12345678909',
        email: email('titular'),
        telefone: '11999990000',
      }),
    ]
  );
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

  await pool.query(
    `UPDATE configuracoes SET valor = to_jsonb($1::int), atualizado_em = now()
      WHERE chave = 'auditoria.retencao_dias'`,
    [retencaoOriginal]
  );

  await pool.query('DELETE FROM atendimentos WHERE cliente_id = $1', [clienteId]);
  await pool.query('DELETE FROM clientes WHERE id = $1', [clienteId]);
  await pool.query('DELETE FROM imoveis WHERE id = $1', [imovelId]);
  await pool.query('DELETE FROM corretores WHERE id = $1', [corretorId]);

  await expurgarAuditoriaTeste(
    `usuario_email LIKE $1
       OR detalhes::text LIKE $1
       OR (tipo_operacao = 'seguranca.origem_invalida' AND data_hora >= $2)`,
    [`%${PREFIX}%`, inicioTeste]
  );

  await pool.query('DELETE FROM usuarios WHERE id = ANY($1::int[])', [
    [admin.id, corretor.id, usuarioRestrito.id],
  ]);
  await pool.query('DELETE FROM perfis WHERE id = $1', [perfilRestrito.id]);

  await closePool();
});

test('LGPD e retenção exigem autenticação, permissão e CSRF', async () => {
  const semSessao = await requisitar('/api/administracao/lgpd');
  assert.equal(semSessao.resposta.status, 401);
  assert.equal(semSessao.dados.error.code, 'UNAUTHENTICATED');

  const sessaoCorretor = await login(corretor.email);
  assert.equal(sessaoCorretor.resposta.status, 200);

  const semPermissao = await requisitar('/api/administracao/lgpd', {
    cookie: sessaoCorretor.cookie,
  });
  assert.equal(semPermissao.resposta.status, 403);
  assert.equal(semPermissao.dados.error.code, 'FORBIDDEN');

  const retencaoSemPermissao = await requisitar('/api/administracao/auditoria/retencao', {
    cookie: sessaoCorretor.cookie,
  });
  assert.equal(retencaoSemPermissao.resposta.status, 403);

  const sessaoAdmin = await login(admin.email);
  assert.equal(sessaoAdmin.resposta.status, 200);

  const semCsrf = await requisitar(
    `/api/administracao/lgpd/clientes/${clienteId}/anonimizar`,
    {
      method: 'POST',
      cookie: sessaoAdmin.cookie,
      body: { motivo: 'Solicitação válida para teste.', confirmar: true },
    }
  );
  assert.equal(semCsrf.resposta.status, 403);
  assert.equal(semCsrf.dados.error.code, 'CSRF_INVALID');

  const origemInvalida = await requisitar('/api/auth/login', {
    method: 'POST',
    headers: { Origin: 'https://invasor.test' },
    body: { email: admin.email, password: SENHA },
  });
  assert.equal(origemInvalida.resposta.status, 403);
  assert.equal(origemInvalida.dados.error.code, 'ORIGIN_INVALID');
});

test('acessos negados, CSRF e origem inválida são registrados na auditoria', async () => {
  const sessaoAdmin = await login(admin.email);
  const sessaoCorretor = await login(corretor.email);
  const sessaoRestrita = await login(usuarioRestrito.email);

  const negado = await requisitar('/api/administracao/auditoria', {
    cookie: sessaoCorretor.cookie,
  });
  assert.equal(negado.resposta.status, 403);

  const negadoPorPermissao = await requisitar('/api/administracao/auditoria', {
    cookie: sessaoRestrita.cookie,
  });
  assert.equal(negadoPorPermissao.resposta.status, 403);

  const semCsrf = await requisitar('/api/administracao/resumo', {
    method: 'POST',
    cookie: sessaoCorretor.cookie,
  });
  assert.equal(semCsrf.resposta.status, 403);
  assert.equal(semCsrf.dados.error.code, 'CSRF_INVALID');

  const eventosPerfil = await consultarAuditoria(sessaoAdmin, {
    tipo: 'seguranca.acesso_negado',
    busca: corretor.email,
    resultado: 'falha',
  });

  assert.ok(eventosPerfil.length >= 1);
  const perfilNegado = eventosPerfil.find(
    (evento) => evento.detalhes?.motivo === 'perfil_nao_administrativo'
  );
  assert.ok(perfilNegado);
  assert.equal(perfilNegado.entidade, 'api');
  assert.equal(perfilNegado.detalhes.status, 403);

  const eventosPermissao = await consultarAuditoria(sessaoAdmin, {
    tipo: 'seguranca.acesso_negado',
    busca: usuarioRestrito.email,
    resultado: 'falha',
  });

  assert.ok(eventosPermissao.length >= 1);
  const permissaoNegada = eventosPermissao.find(
    (evento) => evento.detalhes?.motivo === 'permissao_ausente'
  );
  assert.ok(permissaoNegada);
  assert.equal(permissaoNegada.detalhes.permissao, 'auditoria.visualizar');

  const eventosCsrf = await consultarAuditoria(sessaoAdmin, {
    tipo: 'seguranca.csrf_invalido',
    busca: corretor.email,
  });

  assert.ok(eventosCsrf.length >= 1);
  assert.equal(eventosCsrf[0].detalhes.metodo, 'POST');

  const eventosOrigem = await consultarAuditoria(sessaoAdmin, {
    tipo: 'seguranca.origem_invalida',
    entidade: 'api',
  });

  const origemEvento = eventosOrigem.find(
    (evento) =>
      evento.detalhes?.metodo === 'POST' && evento.detalhes?.rota === '/api/auth/login'
  );
  assert.ok(origemEvento);
});

test('administrador exporta os dados pessoais do titular', async () => {
  const sessaoAdmin = await login(admin.email);

  const busca = await requisitar(
    `/api/administracao/lgpd/clientes?${new URLSearchParams({ busca: PREFIX })}`,
    { cookie: sessaoAdmin.cookie }
  );
  assert.equal(busca.resposta.status, 200);
  assert.ok(busca.dados.clientes.some((cliente) => cliente.id === clienteId));

  const exportacao = await requisitar(
    `/api/administracao/lgpd/clientes/${clienteId}/dados`,
    { cookie: sessaoAdmin.cookie }
  );

  assert.equal(exportacao.resposta.status, 200);
  assert.match(exportacao.resposta.headers.get('content-type'), /application\/json/);
  assert.match(exportacao.resposta.headers.get('content-disposition'), /lgpd-cliente-/);

  assert.equal(exportacao.dados.titular.id, clienteId);
  assert.equal(exportacao.dados.titular.email, email('titular'));
  assert.equal(exportacao.dados.titular.telefone, '11999990000');
  assert.ok(exportacao.dados.titular.criadoEm);
  assert.equal(exportacao.dados.atendimentos.length, 1);
  assert.equal(exportacao.dados.imoveisInteresse.length, 1);
  assert.ok(exportacao.dados.atendimentos[0].descricao.includes('visitar'));

  const { rows } = await pool.query(
    `SELECT detalhes FROM auditoria
      WHERE tipo_operacao = 'lgpd.cliente_exportado'
        AND registro_id = $1
      ORDER BY id DESC
      LIMIT 1`,
    [String(clienteId)]
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].detalhes.formato, 'json');
  assert.equal(String(rows[0].detalhes.clienteId), String(clienteId));
});

test('anonimização exige confirmação explícita e motivo válido', async () => {
  const sessaoAdmin = await login(admin.email);

  const semConfirmacao = await requisitar(
    `/api/administracao/lgpd/clientes/${clienteId}/anonimizar`,
    {
      method: 'POST',
      cookie: sessaoAdmin.cookie,
      csrf: sessaoAdmin.csrf,
      body: { motivo: 'Solicitação de eliminação do titular.' },
    }
  );

  assert.equal(semConfirmacao.resposta.status, 422);
  assert.equal(semConfirmacao.dados.error.code, 'CONFIRMATION_REQUIRED');

  const motivoCurto = await requisitar(
    `/api/administracao/lgpd/clientes/${clienteId}/anonimizar`,
    {
      method: 'POST',
      cookie: sessaoAdmin.cookie,
      csrf: sessaoAdmin.csrf,
      body: { motivo: 'curto', confirmar: true },
    }
  );

  assert.equal(motivoCurto.resposta.status, 422);
  assert.equal(motivoCurto.dados.error.code, 'VALIDATION_ERROR');

  const { rows } = await pool.query('SELECT email FROM clientes WHERE id = $1', [
    clienteId,
  ]);
  assert.equal(rows[0].email, email('titular'));
});

test('anonimização remove dados pessoais, limpa atendimentos e redige auditoria', async () => {
  const sessaoAdmin = await login(admin.email);

  const anonimizacao = await requisitar(
    `/api/administracao/lgpd/clientes/${clienteId}/anonimizar`,
    {
      method: 'POST',
      cookie: sessaoAdmin.cookie,
      csrf: sessaoAdmin.csrf,
      body: {
        motivo: 'Solicitação de eliminação recebida e verificada pelo atendimento.',
        confirmar: true,
      },
    }
  );

  assert.equal(anonimizacao.resposta.status, 200);
  assert.equal(
    String(anonimizacao.dados.resultado.clienteId),
    String(clienteId)
  );
  assert.match(anonimizacao.dados.resultado.protocolo, /^LGPD-\d+-\d+$/);
  assert.ok(anonimizacao.dados.resultado.atendimentosAnonimizados >= 1);

  const { rows: clientes } = await pool.query(
    `SELECT nome_completo, cpf, telefone, whatsapp, email, endereco, observacoes, excluido_em
       FROM clientes WHERE id = $1`,
    [clienteId]
  );
  const cliente = clientes[0];

  assert.equal(cliente.nome_completo, `Cliente anonimizado #${clienteId}`);
  assert.equal(cliente.cpf, String(clienteId).padStart(11, '0'));
  assert.equal(cliente.telefone, null);
  assert.equal(cliente.whatsapp, null);
  assert.equal(cliente.email, null);
  assert.equal(cliente.endereco, null);
  assert.equal(cliente.observacoes, null);
  assert.ok(cliente.excluido_em);

  const { rows: atendimentos } = await pool.query(
    `SELECT descricao, observacoes FROM atendimentos WHERE cliente_id = $1`,
    [clienteId]
  );
  assert.equal(atendimentos.length, 1);
  assert.match(atendimentos[0].descricao, /anonimizado/i);
  assert.equal(atendimentos[0].observacoes, null);

  const { rows: vinculos } = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM clientes_imoveis_interesse WHERE cliente_id = $1) AS imoveis,
       (SELECT count(*)::int FROM clientes_corretores WHERE cliente_id = $1) AS corretores,
       (SELECT count(*)::int FROM acessos_clientes WHERE cliente_id = $1) AS acessos`,
    [clienteId]
  );
  assert.equal(vinculos[0].imoveis, 0);
  assert.equal(vinculos[0].corretores, 0);
  assert.equal(vinculos[0].acessos, 0);

  const { rows: auditoria } = await pool.query(
    `SELECT tipo_operacao, detalhes FROM auditoria
      WHERE entidade = 'clientes' AND registro_id = $1
      ORDER BY id ASC`,
    [String(clienteId)]
  );

  const criacao = auditoria.find((evento) => evento.tipo_operacao === 'cliente.criado');
  assert.ok(criacao);
  assert.equal(criacao.detalhes.cpf, undefined);
  assert.equal(criacao.detalhes.nome, undefined);
  assert.equal(criacao.detalhes.telefone, undefined);
  assert.equal(criacao.detalhes.email, undefined);

  const eventoLgpd = auditoria.find(
    (evento) => evento.tipo_operacao === 'lgpd.cliente_anonimizado'
  );
  assert.ok(eventoLgpd);
  assert.equal(eventoLgpd.detalhes.protocolo, anonimizacao.dados.resultado.protocolo);

  const busca = await requisitar(
    `/api/administracao/lgpd/clientes?${new URLSearchParams({ busca: cliente.cpf })}`,
    { cookie: sessaoAdmin.cookie }
  );
  const clienteAnonimizado = busca.dados.clientes.find((item) => item.id === clienteId);
  assert.ok(clienteAnonimizado);
  assert.equal(clienteAnonimizado.excluido, true);
});

test('retenção valida o prazo, expurga eventos antigos e registra a operação', async () => {
  const sessaoAdmin = await login(admin.email);

  const consulta = await requisitar('/api/administracao/auditoria/retencao', {
    cookie: sessaoAdmin.cookie,
  });
  assert.equal(consulta.resposta.status, 200);
  assert.equal(consulta.dados.retencao.minimo, 30);
  assert.equal(consulta.dados.retencao.maximo, 3650);

  const invalida = await requisitar('/api/administracao/auditoria/retencao', {
    method: 'PUT',
    cookie: sessaoAdmin.cookie,
    csrf: sessaoAdmin.csrf,
    body: { dias: 10 },
  });
  assert.equal(invalida.resposta.status, 422);

  const atualizada = await requisitar('/api/administracao/auditoria/retencao', {
    method: 'PUT',
    cookie: sessaoAdmin.cookie,
    csrf: sessaoAdmin.csrf,
    body: { dias: 3650 },
  });
  assert.equal(atualizada.resposta.status, 200);
  assert.equal(atualizada.dados.retencao.dias, 3650);

  const { rows: antigos } = await pool.query(
    `INSERT INTO auditoria
       (usuario_email, tipo_operacao, entidade, registro_id, resultado, data_hora, detalhes)
     VALUES ($1, 'teste.retencao', 'auditoria', $2, 'sucesso', now() - INTERVAL '4000 days', $3)
     RETURNING id`,
    [admin.email, `antigo-${PREFIX}`, JSON.stringify({ prefixo: PREFIX })]
  );

  const { rows: recentes } = await pool.query(
    `INSERT INTO auditoria
       (usuario_email, tipo_operacao, entidade, registro_id, resultado, detalhes)
     VALUES ($1, 'teste.retencao', 'auditoria', $2, 'sucesso', $3)
     RETURNING id`,
    [admin.email, `recente-${PREFIX}`, JSON.stringify({ prefixo: PREFIX })]
  );

  const expurgo = await requisitar('/api/administracao/auditoria/retencao/executar', {
    method: 'POST',
    cookie: sessaoAdmin.cookie,
    csrf: sessaoAdmin.csrf,
  });

  assert.equal(expurgo.resposta.status, 200);
  assert.equal(expurgo.dados.dias, 3650);
  assert.ok(expurgo.dados.removidos >= 1);

  const { rows: restantes } = await pool.query(
    `SELECT id FROM auditoria WHERE id = ANY($1::bigint[])`,
    [[antigos[0].id, recentes[0].id]]
  );
  const idsRestantes = new Set(restantes.map((row) => String(row.id)));

  assert.equal(idsRestantes.has(String(antigos[0].id)), false);
  assert.equal(idsRestantes.has(String(recentes[0].id)), true);

  const eventos = await consultarAuditoria(sessaoAdmin, {
    tipo: 'admin.auditoria_expurgada',
    entidade: 'auditoria',
  });
  assert.ok(eventos.length >= 1);
  assert.equal(eventos[0].detalhes.origem, 'administracao');

  const eventosRetencao = await consultarAuditoria(sessaoAdmin, {
    tipo: 'admin.retencao_auditoria_atualizada',
  });
  assert.ok(eventosRetencao.length >= 1);
  assert.equal(eventosRetencao[0].detalhes.novo, 3650);
});

test('consulta de auditoria aplica filtros combinados e valida datas', async () => {
  const sessaoAdmin = await login(admin.email);
  const { rows: datas } = await pool.query('SELECT current_date::text AS hoje');
  const hoje = datas[0].hoje;

  const eventos = await consultarAuditoria(sessaoAdmin, {
    tipo: 'lgpd.cliente_exportado',
    resultado: 'sucesso',
    entidade: 'clientes',
    inicio: hoje,
    fim: hoje,
    busca: String(clienteId),
  });

  assert.ok(eventos.length >= 1);
  assert.ok(eventos.every((evento) => evento.tipo_operacao === 'lgpd.cliente_exportado'));
  assert.ok(eventos.every((evento) => evento.resultado === 'sucesso'));
  assert.equal(eventos[0].ip !== undefined, true);

  const dataInvalida = await requisitar(
    '/api/administracao/auditoria?inicio=2026-13-40',
    { cookie: sessaoAdmin.cookie }
  );
  assert.equal(dataInvalida.resposta.status, 422);

  const intervaloInvalido = await requisitar(
    '/api/administracao/auditoria?inicio=2026-11-20&fim=2026-11-01',
    { cookie: sessaoAdmin.cookie }
  );
  assert.equal(intervaloInvalido.resposta.status, 422);

  const resultadoInvalido = await requisitar(
    '/api/administracao/auditoria?resultado=parcial',
    { cookie: sessaoAdmin.cookie }
  );
  assert.equal(resultadoInvalido.resposta.status, 422);
});
