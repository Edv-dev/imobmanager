'use strict';

const { pool } = require('../config/database');
const config = require('../config/env');
const imovelModel = require('../models/imovel.model');
const corretorModel = require('../models/corretor.model');
const auditoriaModel = require('../models/auditoria.model');
const acessoService = require('./acesso.service');
const imagemService = require('./imagem.service');
const { registrarAdmin } = require('./admin-audit.service');
const { garantirPermissao } = require('../utils/authorization');
const {
  normalizeOptionalText,
} = require('../utils/validators');
const HttpError = require('../utils/http-error');

const LIMITE_MAXIMO = 50;
const LIMITE_HISTORICO = 50;

const TIPOS = new Set(['apartamento', 'casa', 'terreno', 'comercial', 'rural', 'outro']);
const FINALIDADES = new Set(['venda', 'aluguel']);
const SITUACOES = new Set(['disponivel', 'reservado', 'vendido', 'alugado', 'inativo']);
const UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

function numeroPositivo(valor) {
  const numero = Number.parseInt(valor, 10);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

function dataIso(valor) {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

function valorInformado(dados, chave, base, chaveBase = chave) {
  if (dados && Object.prototype.hasOwnProperty.call(dados, chave)) {
    return dados[chave];
  }

  return base?.[chaveBase];
}

function textoObrigatorio(valor, rotulo, maxLength) {
  if (typeof valor !== 'string') {
    throw new HttpError(422, 'VALIDATION_ERROR', `Informe ${rotulo}.`);
  }

  const texto = valor.trim().replace(/\s+/g, ' ');

  if (texto.length < 1) {
    throw new HttpError(422, 'VALIDATION_ERROR', `Informe ${rotulo}.`);
  }

  if (texto.length > maxLength) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      `${rotulo.charAt(0).toUpperCase()}${rotulo.slice(1)} deve ter no máximo ${maxLength} caracteres.`
    );
  }

  return texto;
}

function textoOpcional(valor, maxLength) {
  if (valor === undefined || valor === null || valor === '') return null;
  return normalizeOptionalText(valor, maxLength);
}

function normalizarDescricao(valor) {
  if (valor === undefined || valor === null || valor === '') return null;

  if (typeof valor !== 'string') {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe uma descrição válida.');
  }

  const texto = valor.trim();

  if (!texto) return null;

  if (texto.length > 4000) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'A descrição deve ter no máximo 4000 caracteres.'
    );
  }

  return texto;
}

function normalizarCodigo(valor) {
  if (typeof valor !== 'string') {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe o código interno do imóvel.');
  }

  const codigo = valor.trim().toUpperCase();

  if (!codigo) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe o código interno do imóvel.');
  }

  if (codigo.length > 40) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'O código interno deve ter no máximo 40 caracteres.'
    );
  }

  if (!/^[A-Z0-9][A-Z0-9._/-]*$/.test(codigo)) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'O código interno deve conter apenas letras, números, ponto, hífen, barra ou sublinhado.'
    );
  }

  return codigo;
}

function normalizarEnum(valor, rotulo, permitidos) {
  const normalizado = typeof valor === 'string' ? valor.trim().toLowerCase() : '';

  if (!permitidos.has(normalizado)) {
    throw new HttpError(422, 'VALIDATION_ERROR', `Informe um ${rotulo} válido.`);
  }

  return normalizado;
}

function normalizarCep(valor) {
  if (valor === undefined || valor === null || valor === '') return null;

  if (typeof valor !== 'string' && typeof valor !== 'number') {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe um CEP válido.');
  }

  const digitos = String(valor).replace(/\D/g, '');

  if (!digitos) return null;

  if (!/^\d{8}$/.test(digitos)) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe um CEP com 8 dígitos.');
  }

  return digitos;
}

function normalizarEstado(valor) {
  if (valor === undefined || valor === null || valor === '') return null;

  if (typeof valor !== 'string') {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe uma UF válida.');
  }

  const estado = valor.trim().toUpperCase();

  if (!estado) return null;

  if (!UFS.has(estado)) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe uma UF válida.');
  }

  return estado;
}

function normalizarNumero(valor, rotulo, { max = 999999999999.99 } = {}) {
  if (valor === undefined || valor === null || valor === '') return null;

  const texto = typeof valor === 'string' ? valor.trim().replace(',', '.') : valor;
  const numero = Number(texto);

  if (!Number.isFinite(numero) || numero < 0 || numero > max) {
    throw new HttpError(422, 'VALIDATION_ERROR', `Informe um ${rotulo} válido e não negativo.`);
  }

  return Math.round(numero * 100) / 100;
}

function normalizarInteiro(valor, rotulo) {
  if (valor === undefined || valor === null || valor === '') return 0;

  const numero = Number.parseInt(String(valor).trim(), 10);

  if (!Number.isInteger(numero) || numero < 0 || numero > 999) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      `Informe ${rotulo} como um número inteiro entre 0 e 999.`
    );
  }

  return numero;
}

function normalizarBooleano(valor, rotulo, padrao = false) {
  if (valor === undefined || valor === null) return padrao;

  if (typeof valor !== 'boolean') {
    throw new HttpError(422, 'VALIDATION_ERROR', `Informe ${rotulo} como booleano.`);
  }

  return valor;
}

function normalizarCaracteristicas(valor) {
  if (valor === undefined || valor === null || valor === '') return [];

  const itens = Array.isArray(valor) ? valor : String(valor).split(',');
  const vistos = new Set();
  const resultado = [];

  for (const item of itens) {
    const texto = typeof item === 'string' ? item.trim().replace(/\s+/g, ' ') : '';

    if (!texto) continue;

    if (texto.length > 40) {
      throw new HttpError(
        422,
        'VALIDATION_ERROR',
        'Cada característica adicional deve ter no máximo 40 caracteres.'
      );
    }

    const chave = texto.toLowerCase();

    if (vistos.has(chave)) continue;

    vistos.add(chave);
    resultado.push(texto);
  }

  if (resultado.length > 30) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'Informe no máximo 30 características adicionais.'
    );
  }

  return resultado;
}

function validarDados(dados, base = null) {
  const tipo = normalizarEnum(
    valorInformado(dados, 'tipo', base, 'tipo_imovel'),
    'tipo de imóvel',
    TIPOS
  );
  const finalidade = normalizarEnum(
    valorInformado(dados, 'finalidade', base),
    'finalidade',
    FINALIDADES
  );
  const situacaoInformada = valorInformado(dados, 'situacao', base);
  const situacao =
    situacaoInformada === undefined || situacaoInformada === null || situacaoInformada === ''
      ? 'disponivel'
      : normalizarEnum(situacaoInformada, 'situação', SITUACOES);

  return {
    codigo: normalizarCodigo(valorInformado(dados, 'codigo', base, 'codigo_interno')),
    titulo: textoObrigatorio(valorInformado(dados, 'titulo', base), 'um título', 160),
    descricao: normalizarDescricao(valorInformado(dados, 'descricao', base)),
    tipo,
    finalidade,
    cep: normalizarCep(valorInformado(dados, 'cep', base)),
    estado: normalizarEstado(valorInformado(dados, 'estado', base)),
    cidade: textoOpcional(valorInformado(dados, 'cidade', base), 120),
    bairro: textoOpcional(valorInformado(dados, 'bairro', base), 120),
    logradouro: textoOpcional(valorInformado(dados, 'logradouro', base), 180),
    numero: textoOpcional(valorInformado(dados, 'numero', base), 20),
    complemento: textoOpcional(valorInformado(dados, 'complemento', base), 120),
    areaTotal: normalizarNumero(valorInformado(dados, 'areaTotal', base, 'area_total'), 'área total', {
      max: 9999999999.99,
    }),
    areaConstruida: normalizarNumero(
      valorInformado(dados, 'areaConstruida', base, 'area_construida'),
      'área construída',
      { max: 9999999999.99 }
    ),
    quartos: normalizarInteiro(valorInformado(dados, 'quartos', base), 'a quantidade de quartos'),
    banheiros: normalizarInteiro(
      valorInformado(dados, 'banheiros', base),
      'a quantidade de banheiros'
    ),
    suites: normalizarInteiro(valorInformado(dados, 'suites', base), 'a quantidade de suítes'),
    vagasGaragem: normalizarInteiro(
      valorInformado(dados, 'vagasGaragem', base, 'vagas_garagem'),
      'a quantidade de vagas'
    ),
    mobiliado: normalizarBooleano(
      valorInformado(dados, 'mobiliado', base),
      'se o imóvel é mobiliado'
    ),
    caracteristicas: normalizarCaracteristicas(
      valorInformado(dados, 'caracteristicas', base)
    ),
    valorVenda: normalizarNumero(
      valorInformado(dados, 'valorVenda', base, 'valor_venda'),
      'valor de venda'
    ),
    valorAluguel: normalizarNumero(
      valorInformado(dados, 'valorAluguel', base, 'valor_aluguel'),
      'valor de aluguel'
    ),
    valorCondominio: normalizarNumero(
      valorInformado(dados, 'valorCondominio', base, 'valor_condominio'),
      'valor de condomínio',
      { max: 9999999999.99 }
    ),
    valorIptu: normalizarNumero(
      valorInformado(dados, 'valorIptu', base, 'valor_iptu'),
      'valor de IPTU',
      { max: 9999999999.99 }
    ),
    situacao,
  };
}

function normalizarFiltroEnum(valor, rotulo, permitidos) {
  if (valor === undefined || valor === null || valor === '') return '';
  return normalizarEnum(valor, rotulo, permitidos);
}

function normalizarFiltroPreco(valor, rotulo) {
  if (valor === undefined || valor === null || valor === '') return undefined;
  return normalizarNumero(valor, rotulo);
}

function normalizarListaIds(valor, mensagemLista, mensagemItem) {
  if (!Array.isArray(valor)) {
    throw new HttpError(422, 'VALIDATION_ERROR', mensagemLista);
  }

  const vistos = new Set();
  const ids = [];

  for (const item of valor) {
    const id = numeroPositivo(item);

    if (!id) {
      throw new HttpError(422, 'VALIDATION_ERROR', mensagemItem);
    }

    if (vistos.has(id)) continue;

    vistos.add(id);
    ids.push(id);
  }

  return ids;
}

function normalizarListaCorretores(valor) {
  if (valor === undefined || valor === null) return [];

  return normalizarListaIds(
    valor,
    'Informe os corretores responsáveis como uma lista de identificadores.',
    'Corretor inválido na lista de responsáveis.'
  );
}

async function resolverCorretores(dados, contexto, padrao = null) {
  const informado = Boolean(
    dados && Object.prototype.hasOwnProperty.call(dados, 'corretores')
  );

  if (informado && !contexto.ator?.usuario?.administrativo) {
    throw new HttpError(
      403,
      'FORBIDDEN',
      'Somente administradores podem alterar os corretores responsáveis.'
    );
  }

  if (!informado) {
    if (!padrao) return null;

    return [{ id: padrao.id, principal: true }];
  }

  const ids = normalizarListaCorretores(dados.corretores);

  if (ids.length === 0) {
    if (dados.corretorPrincipalId !== undefined && dados.corretorPrincipalId !== null) {
      throw new HttpError(
        422,
        'VALIDATION_ERROR',
        'Selecione o corretor principal entre os responsáveis informados.'
      );
    }

    return [];
  }

  const existentes = await imovelModel.buscarCorretoresPorIds(ids);

  if (existentes.length !== ids.length) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'Um ou mais corretores informados não existem ou estão inativos.'
    );
  }

  if (existentes.some((corretor) => !corretor.ativo)) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'Um ou mais corretores informados não existem ou estão inativos.'
    );
  }

  const principalInformado = numeroPositivo(dados.corretorPrincipalId);
  const principal = principalInformado && ids.includes(principalInformado)
    ? principalInformado
    : ids[0];

  if (principalInformado && !ids.includes(principalInformado)) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'O corretor principal deve estar entre os responsáveis informados.'
    );
  }

  return ids.map((id) => ({ id, principal: id === principal }));
}

function numeroOuNull(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  return Number.isNaN(numero) ? null : numero;
}

function imagemPublica(imovelId, row) {
  return {
    id: row.id,
    nomeOriginal: row.nome_original,
    mimeType: row.mime_type,
    tamanhoBytes: Number(row.tamanho_bytes),
    ordem: row.ordem,
    principal: row.principal,
    criadoEm: dataIso(row.criado_em),
    urlArquivo: `/api/imoveis/${imovelId}/imagens/${row.id}/arquivo`,
  };
}

function imovelBase(row) {
  return {
    id: row.id,
    codigo: row.codigo_interno,
    titulo: row.titulo,
    descricao: row.descricao,
    tipo: row.tipo_imovel,
    finalidade: row.finalidade,
    situacao: row.situacao,
    endereco: {
      cep: row.cep,
      estado: row.estado,
      cidade: row.cidade,
      bairro: row.bairro,
      logradouro: row.logradouro,
      numero: row.numero,
      complemento: row.complemento,
    },
    caracteristicas: {
      areaTotal: numeroOuNull(row.area_total),
      areaConstruida: numeroOuNull(row.area_construida),
      quartos: row.quartos,
      banheiros: row.banheiros,
      suites: row.suites,
      vagasGaragem: row.vagas_garagem,
      mobiliado: row.mobiliado,
      adicionais: Array.isArray(row.caracteristicas) ? row.caracteristicas : [],
    },
    valores: {
      venda: numeroOuNull(row.valor_venda),
      aluguel: numeroOuNull(row.valor_aluguel),
      condominio: numeroOuNull(row.valor_condominio),
      iptu: numeroOuNull(row.valor_iptu),
    },
    criadoEm: dataIso(row.criado_em),
    atualizadoEm: dataIso(row.atualizado_em),
  };
}

function corretorPublico(row) {
  return {
    id: row.id,
    nome: row.nome_completo,
    creci: row.creci,
    email: row.email,
    telefone: row.telefone,
    ativo: row.ativo,
    principal: row.principal,
  };
}

function imovelListaPublico(row) {
  const corretores = Array.isArray(row.corretores)
    ? row.corretores.map((corretor) => ({
        id: corretor.id,
        nome: corretor.nome,
        creci: corretor.creci,
        principal: corretor.principal,
      }))
    : [];

  return {
    ...imovelBase(row),
    capa: row.capa_id
      ? {
          id: row.capa_id,
          urlArquivo: `/api/imoveis/${row.id}/imagens/${row.capa_id}/arquivo`,
        }
      : null,
    corretores,
  };
}

function imovelDetalhePublico(row, imagens, corretores) {
  const imagensPublicas = imagens.map((imagem) => imagemPublica(row.id, imagem));
  const principal = imagensPublicas.find((imagem) => imagem.principal) || imagensPublicas[0] || null;

  return {
    ...imovelBase(row),
    capa: principal
      ? { id: principal.id, urlArquivo: principal.urlArquivo }
      : null,
    imagens: imagensPublicas,
    corretores: corretores.map(corretorPublico),
  };
}

async function carregarDetalheInterno(imovelId) {
  const row = await imovelModel.buscarPorId(imovelId);

  if (!row) {
    throw new HttpError(404, 'IMOVEL_NOT_FOUND', 'Imóvel não encontrado.');
  }

  const [imagens, corretores] = await Promise.all([
    imovelModel.listarImagens(imovelId),
    imovelModel.listarCorretores(imovelId),
  ]);

  return imovelDetalhePublico(row, imagens, corretores);
}

async function garantirAcessoImovel(imovelId, contexto, code = 'IMOVEL_NOT_FOUND') {
  const permitido = await acessoService.podeAcessarRegistro(
    contexto.ator.usuario.id,
    'imovel',
    imovelId
  );

  if (!permitido) {
    throw new HttpError(404, code, 'Imóvel não encontrado.');
  }
}

function traduzirErroBanco(error) {
  if (error.code !== '23505') return error;

  if (error.constraint === 'uq_imoveis_codigo_ativo') {
    return new HttpError(
      409,
      'CODIGO_IN_USE',
      'Já existe um imóvel cadastrado com este código interno.'
    );
  }

  if (error.constraint === 'uq_imagens_imoveis_principal') {
    return new HttpError(
      409,
      'IMAGEM_PRINCIPAL_CONFLITO',
      'Não foi possível alterar a imagem principal. Atualize a página e tente novamente.'
    );
  }

  return error;
}

async function registrarEvento(contexto, tipoOperacao, imovelId, detalhes) {
  await registrarAdmin({
    ...contexto,
    tipoOperacao,
    entidade: 'imoveis',
    registroId: String(imovelId),
    detalhes,
  });
}

function camposAlterados(anterior, atual) {
  const campos = [];
  const comparacoes = [
    ['codigo', anterior.codigo_interno, atual.codigo],
    ['titulo', anterior.titulo, atual.titulo],
    ['descricao', anterior.descricao, atual.descricao],
    ['tipo', anterior.tipo_imovel, atual.tipo],
    ['finalidade', anterior.finalidade, atual.finalidade],
    ['cep', anterior.cep, atual.cep],
    ['estado', anterior.estado, atual.estado],
    ['cidade', anterior.cidade, atual.cidade],
    ['bairro', anterior.bairro, atual.bairro],
    ['logradouro', anterior.logradouro, atual.logradouro],
    ['numero', anterior.numero, atual.numero],
    ['complemento', anterior.complemento, atual.complemento],
    ['areaTotal', numeroOuNull(anterior.area_total), atual.areaTotal],
    ['areaConstruida', numeroOuNull(anterior.area_construida), atual.areaConstruida],
    ['quartos', anterior.quartos, atual.quartos],
    ['banheiros', anterior.banheiros, atual.banheiros],
    ['suites', anterior.suites, atual.suites],
    ['vagasGaragem', anterior.vagas_garagem, atual.vagasGaragem],
    ['mobiliado', anterior.mobiliado, atual.mobiliado],
    ['valorVenda', numeroOuNull(anterior.valor_venda), atual.valorVenda],
    ['valorAluguel', numeroOuNull(anterior.valor_aluguel), atual.valorAluguel],
    ['valorCondominio', numeroOuNull(anterior.valor_condominio), atual.valorCondominio],
    ['valorIptu', numeroOuNull(anterior.valor_iptu), atual.valorIptu],
    ['situacao', anterior.situacao, atual.situacao],
  ];

  for (const [campo, antes, depois] of comparacoes) {
    if ((antes ?? null) !== (depois ?? null)) campos.push(campo);
  }

  if (JSON.stringify(anterior.caracteristicas || []) !== JSON.stringify(atual.caracteristicas)) {
    campos.push('caracteristicas');
  }

  return campos;
}

async function listarImoveis(
  { busca = '', tipo = '', finalidade = '', situacao = '', cidade = '', bairro = '', valorMin, valorMax, pagina = 1, limite = 10 } = {},
  contexto
) {
  garantirPermissao(contexto.ator, 'imoveis.visualizar');

  const paginaNormalizada = numeroPositivo(pagina) || 1;
  const limiteNormalizado = Math.min(numeroPositivo(limite) || 10, LIMITE_MAXIMO);
  const visibilidade = await acessoService.filtroVisibilidade(
    contexto.ator.usuario.id,
    'imovel',
    'i',
    0
  );

  const resultado = await imovelModel.listar({
    filtros: {
      busca: typeof busca === 'string' ? busca.trim().slice(0, 100) : '',
      tipo: normalizarFiltroEnum(tipo, 'tipo de imóvel', TIPOS),
      finalidade: normalizarFiltroEnum(finalidade, 'finalidade', FINALIDADES),
      situacao: normalizarFiltroEnum(situacao, 'situação', SITUACOES),
      cidade: typeof cidade === 'string' ? cidade.trim().slice(0, 120) : '',
      bairro: typeof bairro === 'string' ? bairro.trim().slice(0, 120) : '',
      valorMin: normalizarFiltroPreco(valorMin, 'valor mínimo'),
      valorMax: normalizarFiltroPreco(valorMax, 'valor máximo'),
    },
    visibilidade,
    pagina: paginaNormalizada,
    limite: limiteNormalizado,
  });

  return {
    imoveis: resultado.imoveis.map(imovelListaPublico),
    total: resultado.total,
    pagina: paginaNormalizada,
    limite: limiteNormalizado,
    totalPaginas: Math.max(1, Math.ceil(resultado.total / limiteNormalizado)),
  };
}

async function obterImovel(id, contexto) {
  garantirPermissao(contexto.ator, 'imoveis.visualizar');

  const imovelId = numeroPositivo(id);

  if (!imovelId) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Imóvel inválido.');
  }

  const row = await imovelModel.buscarPorId(imovelId);

  if (!row) {
    throw new HttpError(404, 'IMOVEL_NOT_FOUND', 'Imóvel não encontrado.');
  }

  await garantirAcessoImovel(imovelId, contexto);

  const [imagens, corretores] = await Promise.all([
    imovelModel.listarImagens(imovelId),
    imovelModel.listarCorretores(imovelId),
  ]);

  return { imovel: imovelDetalhePublico(row, imagens, corretores) };
}

async function obterHistorico(id, contexto) {
  garantirPermissao(contexto.ator, 'auditoria.visualizar');

  const imovelId = numeroPositivo(id);

  if (!imovelId) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Imóvel inválido.');
  }

  const row = await imovelModel.buscarPorId(imovelId);

  if (!row) {
    throw new HttpError(404, 'IMOVEL_NOT_FOUND', 'Imóvel não encontrado.');
  }

  await garantirAcessoImovel(imovelId, contexto);

  const eventos = await auditoriaModel.listarPorRegistro(
    'imoveis',
    imovelId,
    LIMITE_HISTORICO
  );

  return {
    eventos: eventos.map((evento) => ({
      id: evento.id,
      usuarioEmail: evento.usuario_email,
      dataHora: dataIso(evento.data_hora),
      tipoOperacao: evento.tipo_operacao,
      resultado: evento.resultado,
      detalhes: evento.detalhes,
    })),
  };
}

async function listarCorretoresOpcoes(contexto) {
  garantirPermissao(contexto.ator, 'imoveis.visualizar');

  if (!contexto.ator.usuario.administrativo) {
    throw new HttpError(
      403,
      'FORBIDDEN',
      'Somente administradores podem consultar os corretores responsáveis.'
    );
  }

  const corretores = await imovelModel.listarCorretoresDisponiveis();

  return {
    corretores: corretores.map((corretor) => ({
      id: corretor.id,
      nome: corretor.nome_completo,
      creci: corretor.creci,
      email: corretor.email,
      usuarioEmail: corretor.usuario_email,
    })),
  };
}

async function criarImovel(dados, contexto) {
  garantirPermissao(contexto.ator, 'imoveis.criar');

  const campos = validarDados(dados);
  const existente = await imovelModel.buscarPorCodigo(campos.codigo);

  if (existente) {
    throw new HttpError(
      409,
      'CODIGO_IN_USE',
      'Já existe um imóvel cadastrado com este código interno.'
    );
  }

  const corretorPadrao = contexto.ator.usuario.administrativo
    ? null
    : await corretorModel.buscarPorUsuario(contexto.ator.usuario.id);
  const corretores = await resolverCorretores(dados, contexto, corretorPadrao);

  const client = await pool.connect();
  let imovelId;

  try {
    await client.query('BEGIN');

    const criado = await imovelModel.criar(client, {
      ...campos,
      criadoPorUsuarioId: contexto.ator.usuario.id,
    });

    imovelId = criado.id;

    if (corretores && corretores.length > 0) {
      await imovelModel.substituirCorretores(client, imovelId, corretores);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw traduzirErroBanco(error);
  } finally {
    client.release();
  }

  await registrarEvento(contexto, 'imovel.criado', imovelId, {
    codigo: campos.codigo,
    titulo: campos.titulo,
    tipo: campos.tipo,
    finalidade: campos.finalidade,
    situacao: campos.situacao,
    corretores: (corretores || []).map((corretor) => corretor.id),
  });

  return carregarDetalheInterno(imovelId);
}

async function atualizarImovel(id, dados, contexto) {
  garantirPermissao(contexto.ator, 'imoveis.editar');

  const imovelId = numeroPositivo(id);

  if (!imovelId) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Imóvel inválido.');
  }

  const anterior = await imovelModel.buscarPorId(imovelId);

  if (!anterior) {
    throw new HttpError(404, 'IMOVEL_NOT_FOUND', 'Imóvel não encontrado.');
  }

  await garantirAcessoImovel(imovelId, contexto);

  const campos = validarDados(dados, anterior);

  if (campos.codigo !== anterior.codigo_interno) {
    const existente = await imovelModel.buscarPorCodigo(campos.codigo, imovelId);

    if (existente) {
      throw new HttpError(
        409,
        'CODIGO_IN_USE',
        'Já existe um imóvel cadastrado com este código interno.'
      );
    }
  }

  const corretores = await resolverCorretores(dados, contexto, null);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const atualizado = await imovelModel.atualizar(client, imovelId, campos);

    if (!atualizado) {
      throw new HttpError(404, 'IMOVEL_NOT_FOUND', 'Imóvel não encontrado.');
    }

    if (corretores !== null) {
      await imovelModel.substituirCorretores(client, imovelId, corretores);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw traduzirErroBanco(error);
  } finally {
    client.release();
  }

  const alterados = camposAlterados(anterior, campos);

  if (corretores !== null) alterados.push('corretores');

  await registrarEvento(contexto, 'imovel.atualizado', imovelId, {
    codigo: campos.codigo,
    titulo: campos.titulo,
    campos: alterados,
    situacaoAnterior: anterior.situacao,
    situacaoNova: campos.situacao,
    corretores: corretores ? corretores.map((corretor) => corretor.id) : undefined,
  });

  return carregarDetalheInterno(imovelId);
}

async function atualizarSituacaoImovel(id, situacao, contexto) {
  garantirPermissao(contexto.ator, 'imoveis.editar');

  const imovelId = numeroPositivo(id);

  if (!imovelId) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Imóvel inválido.');
  }

  const situacaoNormalizada = normalizarEnum(situacao, 'situação', SITUACOES);
  const anterior = await imovelModel.buscarPorId(imovelId);

  if (!anterior) {
    throw new HttpError(404, 'IMOVEL_NOT_FOUND', 'Imóvel não encontrado.');
  }

  await garantirAcessoImovel(imovelId, contexto);

  if (anterior.situacao === situacaoNormalizada) {
    return carregarDetalheInterno(imovelId);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const atualizado = await imovelModel.atualizarSituacao(
      client,
      imovelId,
      situacaoNormalizada
    );

    if (!atualizado) {
      throw new HttpError(404, 'IMOVEL_NOT_FOUND', 'Imóvel não encontrado.');
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  await registrarEvento(contexto, 'imovel.situacao_alterada', imovelId, {
    codigo: anterior.codigo_interno,
    titulo: anterior.titulo,
    situacaoAnterior: anterior.situacao,
    situacaoNova: situacaoNormalizada,
  });

  return carregarDetalheInterno(imovelId);
}

async function excluirImovel(id, contexto) {
  garantirPermissao(contexto.ator, 'imoveis.excluir');

  const imovelId = numeroPositivo(id);

  if (!imovelId) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Imóvel inválido.');
  }

  const anterior = await imovelModel.buscarPorId(imovelId);

  if (!anterior) {
    throw new HttpError(404, 'IMOVEL_NOT_FOUND', 'Imóvel não encontrado.');
  }

  await garantirAcessoImovel(imovelId, contexto);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const excluido = await imovelModel.excluirLogicamente(client, imovelId);

    if (!excluido) {
      throw new HttpError(404, 'IMOVEL_NOT_FOUND', 'Imóvel não encontrado.');
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  await registrarEvento(contexto, 'imovel.excluido', imovelId, {
    codigo: anterior.codigo_interno,
    titulo: anterior.titulo,
  });

  return { id: imovelId };
}

async function enviarImagens(id, arquivos, contexto) {
  garantirPermissao(contexto.ator, 'imoveis.imagens.gerenciar');

  const imovelId = numeroPositivo(id);

  if (!imovelId) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Imóvel inválido.');
  }

  const imovel = await imovelModel.buscarPorId(imovelId);

  if (!imovel) {
    throw new HttpError(404, 'IMOVEL_NOT_FOUND', 'Imóvel não encontrado.');
  }

  await garantirAcessoImovel(imovelId, contexto);

  if (!Array.isArray(arquivos) || arquivos.length === 0) {
    throw new HttpError(422, 'INVALID_IMAGE', 'Selecione ao menos uma imagem para enviar.');
  }

  const existentes = await imovelModel.contarImagens(imovelId);
  const limite = config.uploads.maxImagesPerProperty;

  if (existentes + arquivos.length > limite) {
    throw new HttpError(
      422,
      'IMAGE_LIMIT',
      `Cada imóvel pode ter no máximo ${limite} imagens.`
    );
  }

  const salvos = [];

  try {
    for (const arquivo of arquivos) {
      const salvo = await imagemService.salvar(imovelId, arquivo.buffer);
      salvos.push({
        ...salvo,
        nomeOriginal: (arquivo.originalname || '')
          .replace(/[/\\\u0000-\u001f\u007f]/g, '')
          .trim()
          .slice(0, 200) || null,
      });
    }
  } catch (error) {
    await imagemService.removerVarios(salvos.map((item) => item.caminhoArquivo));
    throw error;
  }

  const client = await pool.connect();
  const inseridas = [];

  try {
    await client.query('BEGIN');

    const ordemInicial = await imovelModel.proximaOrdem(imovelId);

    for (const [indice, salvo] of salvos.entries()) {
      const imagem = await imovelModel.criarImagem(client, {
        imovelId,
        caminhoArquivo: salvo.caminhoArquivo,
        nomeOriginal: salvo.nomeOriginal,
        mimeType: salvo.mimeType,
        tamanhoBytes: salvo.tamanhoBytes,
        ordem: ordemInicial + indice,
        principal: existentes === 0 && indice === 0,
      });

      inseridas.push(imagem);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    await imagemService.removerVarios(salvos.map((item) => item.caminhoArquivo));
    throw traduzirErroBanco(error);
  } finally {
    client.release();
  }

  await registrarEvento(contexto, 'imovel.imagens_enviadas', imovelId, {
    codigo: imovel.codigo_interno,
    quantidade: inseridas.length,
    imagens: inseridas.map((imagem) => imagem.id),
  });

  return {
    imagens: inseridas.map((imagem) => imagemPublica(imovelId, imagem)),
  };
}

async function definirImagemPrincipal(id, imagemId, contexto) {
  garantirPermissao(contexto.ator, 'imoveis.imagens.gerenciar');

  const imovelId = numeroPositivo(id);
  const imagemNormalizada = numeroPositivo(imagemId);

  if (!imovelId || !imagemNormalizada) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Imagem inválida.');
  }

  const imovel = await imovelModel.buscarPorId(imovelId);

  if (!imovel) {
    throw new HttpError(404, 'IMOVEL_NOT_FOUND', 'Imóvel não encontrado.');
  }

  await garantirAcessoImovel(imovelId, contexto);

  const imagem = await imovelModel.buscarImagem(imovelId, imagemNormalizada);

  if (!imagem) {
    throw new HttpError(404, 'IMAGEM_NOT_FOUND', 'Imagem não encontrada.');
  }

  const client = await pool.connect();
  let atualizada;

  try {
    await client.query('BEGIN');
    atualizada = await imovelModel.definirImagemPrincipal(
      client,
      imovelId,
      imagemNormalizada
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw traduzirErroBanco(error);
  } finally {
    client.release();
  }

  await registrarEvento(contexto, 'imovel.imagem_principal_alterada', imovelId, {
    codigo: imovel.codigo_interno,
    imagem: imagemNormalizada,
  });

  return { imagem: imagemPublica(imovelId, atualizada) };
}

async function reordenarImagens(id, ids, contexto) {
  garantirPermissao(contexto.ator, 'imoveis.imagens.gerenciar');

  const imovelId = numeroPositivo(id);

  if (!imovelId) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Imóvel inválido.');
  }

  const imovel = await imovelModel.buscarPorId(imovelId);

  if (!imovel) {
    throw new HttpError(404, 'IMOVEL_NOT_FOUND', 'Imóvel não encontrado.');
  }

  await garantirAcessoImovel(imovelId, contexto);

  const ordem = normalizarListaIds(
    ids,
    'Informe a nova ordem como uma lista de identificadores de imagens.',
    'Imagem inválida na nova ordem.'
  );
  const atuais = await imovelModel.listarImagens(imovelId);

  if (ordem.length !== atuais.length) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'A nova ordem deve incluir todas as imagens do imóvel.'
    );
  }

  const idsAtuais = new Set(atuais.map((imagem) => Number(imagem.id)));
  const idsInformados = new Set(ordem);

  if (
    idsInformados.size !== idsAtuais.size ||
    [...idsAtuais].some((imagemId) => !idsInformados.has(imagemId))
  ) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'A nova ordem deve incluir exatamente as imagens do imóvel.'
    );
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await imovelModel.atualizarOrdens(client, imovelId, ordem);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  await registrarEvento(contexto, 'imovel.imagens_reordenadas', imovelId, {
    codigo: imovel.codigo_interno,
    ordem,
  });

  const imagens = await imovelModel.listarImagens(imovelId);

  return { imagens: imagens.map((imagem) => imagemPublica(imovelId, imagem)) };
}

async function removerImagem(id, imagemId, contexto) {
  garantirPermissao(contexto.ator, 'imoveis.imagens.gerenciar');

  const imovelId = numeroPositivo(id);
  const imagemNormalizada = numeroPositivo(imagemId);

  if (!imovelId || !imagemNormalizada) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Imagem inválida.');
  }

  const imovel = await imovelModel.buscarPorId(imovelId);

  if (!imovel) {
    throw new HttpError(404, 'IMOVEL_NOT_FOUND', 'Imóvel não encontrado.');
  }

  await garantirAcessoImovel(imovelId, contexto);

  const imagem = await imovelModel.buscarImagem(imovelId, imagemNormalizada);

  if (!imagem) {
    throw new HttpError(404, 'IMAGEM_NOT_FOUND', 'Imagem não encontrada.');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const removida = await imovelModel.excluirImagem(client, imovelId, imagemNormalizada);

    if (!removida) {
      throw new HttpError(404, 'IMAGEM_NOT_FOUND', 'Imagem não encontrada.');
    }

    if (removida.principal) {
      const restantes = await imovelModel.listarImagens(imovelId, client);

      if (restantes.length > 0) {
        await imovelModel.definirImagemPrincipal(client, imovelId, restantes[0].id);
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  await imagemService.remover(imagem.caminho_arquivo);

  await registrarEvento(contexto, 'imovel.imagem_removida', imovelId, {
    codigo: imovel.codigo_interno,
    imagem: imagem.id,
  });

  return { id: imagemNormalizada };
}

async function obterArquivoImagem(id, imagemId, contexto) {
  garantirPermissao(contexto.ator, 'imoveis.visualizar');

  const imovelId = numeroPositivo(id);
  const imagemNormalizada = numeroPositivo(imagemId);

  if (!imovelId || !imagemNormalizada) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Imagem inválida.');
  }

  const imovel = await imovelModel.buscarPorId(imovelId);

  if (!imovel) {
    throw new HttpError(404, 'IMOVEL_NOT_FOUND', 'Imóvel não encontrado.');
  }

  await garantirAcessoImovel(imovelId, contexto, 'IMAGEM_NOT_FOUND');

  const imagem = await imovelModel.buscarImagem(imovelId, imagemNormalizada);

  if (!imagem) {
    throw new HttpError(404, 'IMAGEM_NOT_FOUND', 'Imagem não encontrada.');
  }

  return {
    caminhoAbsoluto: imagemService.caminhoAbsoluto(imagem.caminho_arquivo),
    mimeType: imagem.mime_type,
    nomeOriginal: imagem.nome_original,
  };
}

module.exports = {
  listarImoveis,
  obterImovel,
  obterHistorico,
  listarCorretoresOpcoes,
  criarImovel,
  atualizarImovel,
  atualizarSituacaoImovel,
  excluirImovel,
  enviarImagens,
  definirImagemPrincipal,
  reordenarImagens,
  removerImagem,
  obterArquivoImagem,
};
