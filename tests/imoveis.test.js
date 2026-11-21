'use strict';

process.env.NODE_ENV = 'test';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imobmanager-imoveis-'));
process.env.UPLOAD_DIR = uploadDir;
process.env.UPLOAD_MAX_IMAGE_BYTES = String(2 * 1024 * 1024);
process.env.UPLOAD_MAX_IMAGES_PER_PROPERTY = '3';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const createApp = require('../src/app');
const { pool, closePool } = require('../src/config/database');
const { expurgarAuditoriaTeste } = require('./helpers/auditoria');
const { hashPassword } = require('../src/utils/password');

const SENHA = 'SenhaSegura123!';
const PREFIX = `imovel.${process.pid}.${Date.now()}`;
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let server;
let baseUrl;
let perfilAdmin;
let perfilCorretor;
let admin;
let corretorA;
let corretorB;
let visibilidadeAnterior;
let contador = 0;

function proximoCodigo() {
  contador += 1;
  return `${PREFIX}-${String(contador).padStart(3, '0')}`;
}

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
  const { method = 'GET', body, form, cookie, csrf, headers = {} } = options;
  const usandoForm = form instanceof FormData;

  const resposta = await fetch(`${baseUrl}${caminho}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(!usandoForm && body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...headers,
    },
    body: usandoForm ? form : body ? JSON.stringify(body) : undefined,
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

function dadosImovel(sobrescritas = {}) {
  return {
    codigo: proximoCodigo(),
    titulo: `${PREFIX} Imóvel de teste`,
    descricao: 'Descrição criada pela suíte de testes.',
    tipo: 'apartamento',
    finalidade: 'venda',
    cep: '01001-000',
    estado: 'SP',
    cidade: 'São Paulo',
    bairro: 'Centro',
    logradouro: 'Rua de Teste',
    numero: '100',
    complemento: 'Apto 12',
    areaTotal: 80.5,
    areaConstruida: 70,
    quartos: 2,
    banheiros: 2,
    suites: 1,
    vagasGaragem: 1,
    mobiliado: true,
    caracteristicas: ['piscina', 'elevador'],
    valorVenda: 500000,
    valorAluguel: 2500,
    valorCondominio: 500,
    valorIptu: 1200,
    situacao: 'disponivel',
    ...sobrescritas,
  };
}

async function criarViaApi(sessao, sobrescritas = {}) {
  const { resposta, dados } = await requisitar('/api/imoveis', {
    method: 'POST',
    cookie: sessao.cookie,
    csrf: sessao.csrf,
    body: dadosImovel(sobrescritas),
  });

  assert.equal(resposta.status, 201, JSON.stringify(dados));
  return dados.imovel;
}

function arquivoPng(nome = 'foto.png', bytes = null) {
  return {
    nome,
    tipo: 'image/png',
    buffer: bytes || Buffer.from(PNG_BASE64, 'base64'),
  };
}

function formImagens(arquivos) {
  const form = new FormData();

  for (const arquivo of arquivos) {
    form.append(
      'imagens',
      new Blob([arquivo.buffer], { type: arquivo.tipo }),
      arquivo.nome
    );
  }

  return form;
}

async function enviarImagens(sessao, imovelId, arquivos) {
  return requisitar(`/api/imoveis/${imovelId}/imagens`, {
    method: 'POST',
    cookie: sessao.cookie,
    csrf: sessao.csrf,
    form: formImagens(arquivos),
  });
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
    nome: 'Admin Imóveis',
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

  const { rows } = await pool.query(
    `SELECT valor FROM configuracoes WHERE chave = 'imoveis.visibilidade'`
  );
  visibilidadeAnterior = rows[0]?.valor || 'todos';
  await pool.query(
    `UPDATE configuracoes SET valor = to_jsonb('todos'::text) WHERE chave = 'imoveis.visibilidade'`
  );
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

  await pool.query(
    `UPDATE configuracoes SET valor = to_jsonb($1::text) WHERE chave = 'imoveis.visibilidade'`,
    [visibilidadeAnterior]
  );
  await pool.query(`DELETE FROM imoveis WHERE upper(codigo_interno) LIKE upper($1)`, [
    `${PREFIX}%`,
  ]);
  await pool.query(`DELETE FROM corretores WHERE creci LIKE $1`, [`${PREFIX}%`]);
  await expurgarAuditoriaTeste('usuario_email LIKE $1 OR detalhes::text LIKE $1', [
    `%${PREFIX}%`,
  ]);
  await pool.query(`DELETE FROM usuarios WHERE email LIKE $1`, [`${PREFIX}%`]);

  await closePool();
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

test('rotas de imóveis exigem autenticação e respeitam permissões', async () => {
  const semSessao = await requisitar('/api/imoveis');
  assert.equal(semSessao.resposta.status, 401);
  assert.equal(semSessao.dados.error.code, 'UNAUTHENTICATED');

  const lista = await requisitar('/api/imoveis?limite=50', {
    cookie: corretorA.cookie,
  });
  assert.equal(lista.resposta.status, 200);
  assert.ok(Array.isArray(lista.dados.imoveis));

  const opcoesCorretor = await requisitar('/api/imoveis/corretores-opcoes', {
    cookie: corretorA.cookie,
  });
  assert.equal(opcoesCorretor.resposta.status, 403);
  assert.equal(opcoesCorretor.dados.error.code, 'FORBIDDEN');

  const opcoesAdmin = await requisitar('/api/imoveis/corretores-opcoes', {
    cookie: admin.cookie,
  });
  assert.equal(opcoesAdmin.resposta.status, 200);
  const ids = opcoesAdmin.dados.corretores.map((corretor) => corretor.id);
  assert.ok(ids.includes(corretorA.corretorId));
  assert.ok(ids.includes(corretorB.corretorId));

  const excluirSemPermissao = await requisitar('/api/imoveis/1', {
    method: 'DELETE',
    cookie: corretorA.cookie,
    csrf: corretorA.csrf,
  });
  assert.equal(excluirSemPermissao.resposta.status, 403);
  assert.equal(excluirSemPermissao.dados.error.code, 'FORBIDDEN');
});

test('administrador cadastra imóvel completo e registra auditoria', async () => {
  const payload = dadosImovel({
    codigo: proximoCodigo().toLowerCase(),
    corretores: [corretorA.corretorId, corretorB.corretorId],
    corretorPrincipalId: corretorB.corretorId,
  });

  const { resposta, dados } = await requisitar('/api/imoveis', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: payload,
  });

  assert.equal(resposta.status, 201, JSON.stringify(dados));
  const imovel = dados.imovel;

  assert.equal(imovel.codigo, payload.codigo.toUpperCase());
  assert.equal(imovel.titulo, payload.titulo);
  assert.equal(imovel.tipo, 'apartamento');
  assert.equal(imovel.finalidade, 'venda');
  assert.equal(imovel.situacao, 'disponivel');
  assert.equal(imovel.endereco.cidade, 'São Paulo');
  assert.equal(imovel.endereco.cep, '01001000');
  assert.equal(imovel.caracteristicas.areaTotal, 80.5);
  assert.deepEqual(imovel.caracteristicas.adicionais, ['piscina', 'elevador']);
  assert.equal(imovel.valores.venda, 500000);
  assert.equal(imovel.valores.aluguel, 2500);
  assert.equal(imovel.corretores.length, 2);
  assert.equal(
    imovel.corretores.find((corretor) => corretor.principal).id,
    corretorB.corretorId
  );
  assert.deepEqual(imovel.imagens, []);
  assert.equal(imovel.capa, null);

  const { rows } = await pool.query(
    `SELECT tipo_operacao, entidade, registro_id, detalhes
       FROM auditoria
      WHERE entidade = 'imoveis'
        AND registro_id = $1
        AND tipo_operacao = 'imovel.criado'`,
    [String(imovel.id)]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].detalhes.codigo, payload.codigo.toUpperCase());

  const historico = await requisitar(`/api/imoveis/${imovel.id}/historico`, {
    cookie: admin.cookie,
  });
  assert.equal(historico.resposta.status, 200);
  assert.ok(
    historico.dados.eventos.some((evento) => evento.tipoOperacao === 'imovel.criado')
  );
});

test('cadastro valida campos, código único e vínculo de corretores', async () => {
  const base = dadosImovel({
    corretores: [corretorA.corretorId],
    corretorPrincipalId: corretorA.corretorId,
  });

  const criado = await requisitar('/api/imoveis', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: base,
  });
  assert.equal(criado.resposta.status, 201);

  const duplicado = await requisitar('/api/imoveis', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: { ...base, codigo: base.codigo.toLowerCase(), titulo: 'Outro título' },
  });
  assert.equal(duplicado.resposta.status, 409);
  assert.equal(duplicado.dados.error.code, 'CODIGO_IN_USE');

  const semTitulo = await requisitar('/api/imoveis', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: dadosImovel({ titulo: '' }),
  });
  assert.equal(semTitulo.resposta.status, 422);
  assert.equal(semTitulo.dados.error.code, 'VALIDATION_ERROR');

  const tipoInvalido = await requisitar('/api/imoveis', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: dadosImovel({ tipo: 'castelo' }),
  });
  assert.equal(tipoInvalido.resposta.status, 422);

  const ufInvalida = await requisitar('/api/imoveis', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: dadosImovel({ estado: 'XX' }),
  });
  assert.equal(ufInvalida.resposta.status, 422);

  const areaNegativa = await requisitar('/api/imoveis', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: dadosImovel({ areaTotal: -10 }),
  });
  assert.equal(areaNegativa.resposta.status, 422);

  const corretorInexistente = await requisitar('/api/imoveis', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: dadosImovel({
      corretores: [999999999],
      corretorPrincipalId: 999999999,
    }),
  });
  assert.equal(corretorInexistente.resposta.status, 422);

  const principalForaDaLista = await requisitar('/api/imoveis', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: dadosImovel({
      corretores: [corretorA.corretorId],
      corretorPrincipalId: corretorB.corretorId,
    }),
  });
  assert.equal(principalForaDaLista.resposta.status, 422);

  const corretorTentandoVincular = await requisitar('/api/imoveis', {
    method: 'POST',
    cookie: corretorA.cookie,
    csrf: corretorA.csrf,
    body: dadosImovel({
      corretores: [corretorA.corretorId],
      corretorPrincipalId: corretorA.corretorId,
    }),
  });
  assert.equal(corretorTentandoVincular.resposta.status, 403);
  assert.equal(corretorTentandoVincular.dados.error.code, 'FORBIDDEN');

  const autoVinculo = await requisitar('/api/imoveis', {
    method: 'POST',
    cookie: corretorA.cookie,
    csrf: corretorA.csrf,
    body: dadosImovel(),
  });
  assert.equal(autoVinculo.resposta.status, 201);
  assert.equal(autoVinculo.dados.imovel.corretores.length, 1);
  assert.equal(autoVinculo.dados.imovel.corretores[0].id, corretorA.corretorId);
  assert.equal(autoVinculo.dados.imovel.corretores[0].principal, true);
});

test('listagem aplica busca, filtros, faixa de valor e paginação', async () => {
  const casa = await criarViaApi(admin, {
    codigo: `${PREFIX}-F-CASA`,
    titulo: `${PREFIX} FILTRO Casa em Campinas`,
    tipo: 'casa',
    finalidade: 'venda',
    cidade: 'Campinas',
    bairro: 'Cambuí',
    valorVenda: 320000,
    valorAluguel: null,
    situacao: 'disponivel',
  });
  const aluguel = await criarViaApi(admin, {
    codigo: `${PREFIX}-F-ALUGUEL`,
    titulo: `${PREFIX} FILTRO Apartamento para locação`,
    tipo: 'apartamento',
    finalidade: 'aluguel',
    cidade: 'Santos',
    bairro: 'Gonzaga',
    valorVenda: null,
    valorAluguel: 1800,
    situacao: 'disponivel',
  });
  const vendido = await criarViaApi(admin, {
    codigo: `${PREFIX}-F-VENDIDO`,
    titulo: `${PREFIX} FILTRO Sobrado vendido`,
    tipo: 'casa',
    finalidade: 'venda',
    cidade: 'Campinas',
    bairro: 'Taquaral',
    valorVenda: 900000,
    situacao: 'vendido',
  });

  const busca = await requisitar(
    `/api/imoveis?busca=${encodeURIComponent(`${PREFIX} FILTRO`)}&limite=50`,
    { cookie: admin.cookie }
  );
  assert.equal(busca.resposta.status, 200);
  assert.equal(busca.dados.total, 3);

  const porTipo = await requisitar(
    `/api/imoveis?busca=${encodeURIComponent(`${PREFIX} FILTRO`)}&tipo=casa&limite=50`,
    { cookie: admin.cookie }
  );
  assert.equal(porTipo.dados.total, 2);
  assert.deepEqual(
    porTipo.dados.imoveis.map((item) => item.id).sort(),
    [casa.id, vendido.id].sort()
  );

  const porFinalidade = await requisitar(
    `/api/imoveis?busca=${encodeURIComponent(`${PREFIX} FILTRO`)}&finalidade=aluguel`,
    { cookie: admin.cookie }
  );
  assert.equal(porFinalidade.dados.total, 1);
  assert.equal(porFinalidade.dados.imoveis[0].id, aluguel.id);

  const porSituacao = await requisitar(
    `/api/imoveis?busca=${encodeURIComponent(`${PREFIX} FILTRO`)}&situacao=vendido`,
    { cookie: admin.cookie }
  );
  assert.equal(porSituacao.dados.total, 1);

  const porCidade = await requisitar(
    `/api/imoveis?busca=${encodeURIComponent(`${PREFIX} FILTRO`)}&cidade=Campinas&limite=50`,
    { cookie: admin.cookie }
  );
  assert.equal(porCidade.dados.total, 2);

  const porBairro = await requisitar(
    `/api/imoveis?busca=${encodeURIComponent(`${PREFIX} FILTRO`)}&bairro=Gonzaga`,
    { cookie: admin.cookie }
  );
  assert.equal(porBairro.dados.total, 1);
  assert.equal(porBairro.dados.imoveis[0].id, aluguel.id);

  const porValor = await requisitar(
    `/api/imoveis?busca=${encodeURIComponent(`${PREFIX} FILTRO`)}&valorMin=1000&valorMax=5000&limite=50`,
    { cookie: admin.cookie }
  );
  assert.equal(porValor.dados.total, 1);
  assert.equal(porValor.dados.imoveis[0].id, aluguel.id);

  const paginado = await requisitar(
    `/api/imoveis?busca=${encodeURIComponent(`${PREFIX} FILTRO`)}&pagina=1&limite=2`,
    { cookie: admin.cookie }
  );
  assert.equal(paginado.dados.total, 3);
  assert.equal(paginado.dados.imoveis.length, 2);
  assert.equal(paginado.dados.totalPaginas, 2);
  assert.equal(paginado.dados.pagina, 1);
  assert.equal(paginado.dados.limite, 2);

  const segundaPagina = await requisitar(
    `/api/imoveis?busca=${encodeURIComponent(`${PREFIX} FILTRO`)}&pagina=2&limite=2`,
    { cookie: admin.cookie }
  );
  assert.equal(segundaPagina.dados.imoveis.length, 1);

  const filtroInvalido = await requisitar('/api/imoveis?tipo=castelo', {
    cookie: admin.cookie,
  });
  assert.equal(filtroInvalido.resposta.status, 422);
});

test('detalhe, atualização parcial e alteração de vínculos', async () => {
  const imovel = await criarViaApi(admin, {
    corretores: [corretorA.corretorId],
    corretorPrincipalId: corretorA.corretorId,
  });

  const detalhe = await requisitar(`/api/imoveis/${imovel.id}`, {
    cookie: corretorA.cookie,
  });
  assert.equal(detalhe.resposta.status, 200);
  assert.equal(detalhe.dados.imovel.id, imovel.id);
  assert.equal(detalhe.dados.imovel.corretores.length, 1);

  const atualizacao = await requisitar(`/api/imoveis/${imovel.id}`, {
    method: 'PATCH',
    cookie: corretorA.cookie,
    csrf: corretorA.csrf,
    body: { titulo: `${PREFIX} Título atualizado` },
  });
  assert.equal(atualizacao.resposta.status, 200, JSON.stringify(atualizacao.dados));
  assert.equal(atualizacao.dados.imovel.titulo, `${PREFIX} Título atualizado`);
  assert.equal(atualizacao.dados.imovel.tipo, 'apartamento');
  assert.equal(atualizacao.dados.imovel.caracteristicas.areaTotal, 80.5);
  assert.deepEqual(atualizacao.dados.imovel.caracteristicas.adicionais, [
    'piscina',
    'elevador',
  ]);
  assert.equal(atualizacao.dados.imovel.corretores.length, 1);
  assert.equal(atualizacao.dados.imovel.corretores[0].id, corretorA.corretorId);

  const semPermissaoVincular = await requisitar(`/api/imoveis/${imovel.id}`, {
    method: 'PATCH',
    cookie: corretorA.cookie,
    csrf: corretorA.csrf,
    body: { corretores: [] },
  });
  assert.equal(semPermissaoVincular.resposta.status, 403);

  const adminAtualiza = await requisitar(`/api/imoveis/${imovel.id}`, {
    method: 'PATCH',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: {
      corretores: [corretorA.corretorId, corretorB.corretorId],
      corretorPrincipalId: corretorB.corretorId,
    },
  });
  assert.equal(adminAtualiza.resposta.status, 200);
  assert.equal(adminAtualiza.dados.imovel.corretores.length, 2);
  assert.equal(
    adminAtualiza.dados.imovel.corretores.find((corretor) => corretor.principal).id,
    corretorB.corretorId
  );

  const auditar = await pool.query(
    `SELECT detalhes
       FROM auditoria
      WHERE entidade = 'imoveis'
        AND registro_id = $1
        AND tipo_operacao = 'imovel.atualizado'
      ORDER BY id DESC
      LIMIT 1`,
    [String(imovel.id)]
  );
  assert.equal(auditar.rows.length, 1);
  assert.ok(auditar.rows[0].detalhes.campos.includes('corretores'));

  const inexistente = await requisitar('/api/imoveis/999999999', {
    cookie: admin.cookie,
  });
  assert.equal(inexistente.resposta.status, 404);
  assert.equal(inexistente.dados.error.code, 'IMOVEL_NOT_FOUND');
});

test('alteração de situação valida e audita o evento', async () => {
  const imovel = await criarViaApi(admin);

  const alteracao = await requisitar(`/api/imoveis/${imovel.id}/situacao`, {
    method: 'PATCH',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: { situacao: 'reservado' },
  });
  assert.equal(alteracao.resposta.status, 200, JSON.stringify(alteracao.dados));
  assert.equal(alteracao.dados.imovel.situacao, 'reservado');

  const { rows } = await pool.query(
    `SELECT detalhes
       FROM auditoria
      WHERE entidade = 'imoveis'
        AND registro_id = $1
        AND tipo_operacao = 'imovel.situacao_alterada'`,
    [String(imovel.id)]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].detalhes.situacaoAnterior, 'disponivel');
  assert.equal(rows[0].detalhes.situacaoNova, 'reservado');

  const invalida = await requisitar(`/api/imoveis/${imovel.id}/situacao`, {
    method: 'PATCH',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: { situacao: 'desaparecido' },
  });
  assert.equal(invalida.resposta.status, 422);
});

test('imagens são enviadas, servidas, reordenadas e removidas com segurança', async () => {
  const imovel = await criarViaApi(admin);

  const envio = await enviarImagens(admin, imovel.id, [
    arquivoPng('primeira.png'),
    arquivoPng('segunda.png'),
  ]);
  assert.equal(envio.resposta.status, 201, JSON.stringify(envio.dados));
  assert.equal(envio.dados.imagens.length, 2);
  assert.equal(envio.dados.imagens[0].principal, true);
  assert.equal(envio.dados.imagens[1].principal, false);
  assert.equal(envio.dados.imagens[0].ordem, 0);
  assert.equal(envio.dados.imagens[1].ordem, 1);

  const detalhe = await requisitar(`/api/imoveis/${imovel.id}`, {
    cookie: admin.cookie,
  });
  assert.equal(detalhe.dados.imovel.imagens.length, 2);
  assert.equal(detalhe.dados.imovel.capa.id, envio.dados.imagens[0].id);

  const arquivo = await fetch(
    `${baseUrl}/api/imoveis/${imovel.id}/imagens/${envio.dados.imagens[0].id}/arquivo`,
    { headers: { Cookie: admin.cookie } }
  );
  assert.equal(arquivo.status, 200);
  assert.match(arquivo.headers.get('content-type'), /image\/png/);
  const bytes = Buffer.from(await arquivo.arrayBuffer());
  assert.deepEqual(bytes, Buffer.from(PNG_BASE64, 'base64'));

  const semSessao = await fetch(
    `${baseUrl}/api/imoveis/${imovel.id}/imagens/${envio.dados.imagens[0].id}/arquivo`
  );
  assert.equal(semSessao.status, 401);

  const arquivoInvalido = await enviarImagens(admin, imovel.id, [
    {
      nome: 'falsa.png',
      tipo: 'image/png',
      buffer: Buffer.from('isto não é uma imagem'),
    },
  ]);
  assert.equal(arquivoInvalido.resposta.status, 422);
  assert.equal(arquivoInvalido.dados.error.code, 'INVALID_IMAGE');

  const grande = Buffer.alloc(2 * 1024 * 1024 + 10);
  grande.set(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const acimaDoLimite = await enviarImagens(admin, imovel.id, [
    arquivoPng('grande.png', grande),
  ]);
  assert.equal(acimaDoLimite.resposta.status, 413);
  assert.equal(acimaDoLimite.dados.error.code, 'IMAGE_TOO_LARGE');

  const excedeQuantidade = await enviarImagens(admin, imovel.id, [
    arquivoPng('terceira.png'),
    arquivoPng('quarta.png'),
  ]);
  assert.equal(excedeQuantidade.resposta.status, 422);
  assert.equal(excedeQuantidade.dados.error.code, 'IMAGE_LIMIT');

  const [primeira, segunda] = envio.dados.imagens;
  const reordenacao = await requisitar(`/api/imoveis/${imovel.id}/imagens/ordem`, {
    method: 'PUT',
    cookie: admin.cookie,
    csrf: admin.csrf,
    body: { ids: [segunda.id, primeira.id] },
  });
  assert.equal(reordenacao.resposta.status, 200, JSON.stringify(reordenacao.dados));
  assert.deepEqual(
    reordenacao.dados.imagens.map((imagem) => imagem.id),
    [segunda.id, primeira.id]
  );

  const principal = await requisitar(
    `/api/imoveis/${imovel.id}/imagens/${segunda.id}/principal`,
    { method: 'PATCH', cookie: admin.cookie, csrf: admin.csrf }
  );
  assert.equal(principal.resposta.status, 200);
  assert.equal(principal.dados.imagem.principal, true);

  const detalhePrincipal = await requisitar(`/api/imoveis/${imovel.id}`, {
    cookie: admin.cookie,
  });
  assert.equal(detalhePrincipal.dados.imovel.capa.id, segunda.id);

  const { rows: caminhos } = await pool.query(
    `SELECT caminho_arquivo FROM imagens_imoveis WHERE id = $1`,
    [segunda.id]
  );
  const caminho = path.join(uploadDir, caminhos[0].caminho_arquivo);
  assert.equal(fs.existsSync(caminho), true);

  const remocao = await requisitar(
    `/api/imoveis/${imovel.id}/imagens/${segunda.id}`,
    { method: 'DELETE', cookie: admin.cookie, csrf: admin.csrf }
  );
  assert.equal(remocao.resposta.status, 200);
  assert.equal(fs.existsSync(caminho), false);

  const detalheFinal = await requisitar(`/api/imoveis/${imovel.id}`, {
    cookie: admin.cookie,
  });
  assert.equal(detalheFinal.dados.imovel.imagens.length, 1);
  assert.equal(detalheFinal.dados.imovel.imagens[0].principal, true);
});

test('visibilidade vinculada restringe lista, detalhe e arquivos de imagem', async () => {
  try {
    const imovelA = await criarViaApi(admin, {
      corretores: [corretorA.corretorId],
      corretorPrincipalId: corretorA.corretorId,
    });
    const imovelB = await criarViaApi(admin, {
      corretores: [corretorB.corretorId],
      corretorPrincipalId: corretorB.corretorId,
    });

    const envio = await enviarImagens(admin, imovelB.id, [arquivoPng()]);
    assert.equal(envio.resposta.status, 201);
    const imagemB = envio.dados.imagens[0];

    await pool.query(
      `UPDATE configuracoes SET valor = to_jsonb('vinculados'::text) WHERE chave = 'imoveis.visibilidade'`
    );

    const listaA = await requisitar('/api/imoveis?limite=50', {
      cookie: corretorA.cookie,
    });
    assert.equal(listaA.resposta.status, 200);
    assert.ok(listaA.dados.imoveis.some((item) => item.id === imovelA.id));
    assert.equal(
      listaA.dados.imoveis.some((item) => item.id === imovelB.id),
      false
    );

    const listaB = await requisitar('/api/imoveis?limite=50', {
      cookie: corretorB.cookie,
    });
    assert.ok(listaB.dados.imoveis.some((item) => item.id === imovelB.id));
    assert.equal(listaB.dados.imoveis.some((item) => item.id === imovelA.id), false);

    const listaAdmin = await requisitar('/api/imoveis?limite=50', {
      cookie: admin.cookie,
    });
    assert.ok(listaAdmin.dados.imoveis.some((item) => item.id === imovelA.id));
    assert.ok(listaAdmin.dados.imoveis.some((item) => item.id === imovelB.id));

    const detalheNegado = await requisitar(`/api/imoveis/${imovelB.id}`, {
      cookie: corretorA.cookie,
    });
    assert.equal(detalheNegado.resposta.status, 404);
    assert.equal(detalheNegado.dados.error.code, 'IMOVEL_NOT_FOUND');

    const imagemNegada = await fetch(
      `${baseUrl}/api/imoveis/${imovelB.id}/imagens/${imagemB.id}/arquivo`,
      { headers: { Cookie: corretorA.cookie } }
    );
    assert.equal(imagemNegada.status, 404);

    const imagemPermitida = await fetch(
      `${baseUrl}/api/imoveis/${imovelB.id}/imagens/${imagemB.id}/arquivo`,
      { headers: { Cookie: corretorB.cookie } }
    );
    assert.equal(imagemPermitida.status, 200);
  } finally {
  await pool.query(
    `UPDATE configuracoes SET valor = to_jsonb('todos'::text) WHERE chave = 'imoveis.visibilidade'`
  );
  }
});

test('histórico exige permissão de auditoria e exclusão é lógica', async () => {
  const imovel = await criarViaApi(admin, {
    corretores: [corretorA.corretorId],
    corretorPrincipalId: corretorA.corretorId,
  });

  const semPermissao = await requisitar(`/api/imoveis/${imovel.id}/historico`, {
    cookie: corretorA.cookie,
  });
  assert.equal(semPermissao.resposta.status, 403);
  assert.equal(semPermissao.dados.error.code, 'FORBIDDEN');

  const historico = await requisitar(`/api/imoveis/${imovel.id}/historico`, {
    cookie: admin.cookie,
  });
  assert.equal(historico.resposta.status, 200);
  assert.ok(Array.isArray(historico.dados.eventos));
  assert.ok(
    historico.dados.eventos.some((evento) => evento.tipoOperacao === 'imovel.criado')
  );

  const exclusaoNegada = await requisitar(`/api/imoveis/${imovel.id}`, {
    method: 'DELETE',
    cookie: corretorA.cookie,
    csrf: corretorA.csrf,
  });
  assert.equal(exclusaoNegada.resposta.status, 403);

  const exclusao = await requisitar(`/api/imoveis/${imovel.id}`, {
    method: 'DELETE',
    cookie: admin.cookie,
    csrf: admin.csrf,
  });
  assert.equal(exclusao.resposta.status, 200);
  assert.equal(String(exclusao.dados.id), String(imovel.id));

  const detalhe = await requisitar(`/api/imoveis/${imovel.id}`, {
    cookie: admin.cookie,
  });
  assert.equal(detalhe.resposta.status, 404);

  const busca = await requisitar(
    `/api/imoveis?busca=${encodeURIComponent(imovel.codigo)}`,
    { cookie: admin.cookie }
  );
  assert.equal(busca.dados.total, 0);

  const evento = await pool.query(
    `SELECT 1
       FROM auditoria
      WHERE entidade = 'imoveis'
        AND registro_id = $1
        AND tipo_operacao = 'imovel.excluido'`,
    [String(imovel.id)]
  );
  assert.equal(evento.rows.length, 1);
});

test('tela de imóveis está conectada à API real', async () => {
  const response = await fetch(`${baseUrl}/js/views/imoveis.js`);
  const script = await response.text();

  assert.equal(response.status, 200);
  assert.match(script, /\/api\/imoveis/);
  assert.match(script, /data-imovel-form/);
  assert.match(script, /requestForm/);
  assert.match(script, /corretores-opcoes/);
  assert.equal(script.includes('createModuleView'), false);
});
