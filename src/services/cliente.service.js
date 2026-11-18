'use strict';

const { pool } = require('../config/database');
const clienteModel = require('../models/cliente.model');
const imovelModel = require('../models/imovel.model');
const corretorModel = require('../models/corretor.model');
const auditoriaModel = require('../models/auditoria.model');
const acessoService = require('./acesso.service');
const { registrarAdmin } = require('./admin-audit.service');
const { garantirPermissao } = require('../utils/authorization');
const {
  normalizeName,
  isValidName,
  normalizeCpf,
  isValidCpf,
  normalizePhone,
  isValidPhone,
  normalizeEmail,
  isValidEmail,
  normalizeOptionalText,
} = require('../utils/validators');
const HttpError = require('../utils/http-error');

const LIMITE_MAXIMO = 50;
const LIMITE_ATENDIMENTOS = 50;
const LIMITE_INTERESSES = 50;

const TIPOS_INTERESSE = new Set([
  'comprador',
  'vendedor',
  'locatario',
  'proprietario',
  'investidor',
  'outro',
]);
const FINALIDADES = new Set(['venda', 'aluguel', 'ambos']);
const TIPOS_ATENDIMENTO = new Set([
  'ligacao',
  'whatsapp',
  'email',
  'visita',
  'reuniao',
  'outro',
]);
const STATUS_ATENDIMENTO = new Set(['agendado', 'realizado', 'cancelado']);

function numeroPositivo(valor) {
  const numero = Number.parseInt(valor, 10);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

function dataIso(valor) {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

function numeroOuNull(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  return Number.isNaN(numero) ? null : numero;
}

function valorInformado(dados, chave, base, chaveBase = chave) {
  if (dados && Object.prototype.hasOwnProperty.call(dados, chave)) {
    return dados[chave];
  }

  return base?.[chaveBase];
}

function textoOpcional(valor, maxLength) {
  if (valor === undefined || valor === null || valor === '') return null;
  return normalizeOptionalText(valor, maxLength);
}

function normalizarTelefoneOpcional(valor, rotulo) {
  if (valor === undefined || valor === null || valor === '') return null;

  if (typeof valor !== 'string') {
    throw new HttpError(422, 'VALIDATION_ERROR', `Informe um ${rotulo} válido.`);
  }

  const telefone = normalizePhone(valor);

  if (!telefone) return null;

  if (!isValidPhone(telefone)) {
    throw new HttpError(422, 'VALIDATION_ERROR', `Informe um ${rotulo} válido.`);
  }

  return telefone;
}

function normalizarEmailOpcional(valor) {
  if (valor === undefined || valor === null || valor === '') return null;

  if (typeof valor !== 'string') {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe um e-mail válido.');
  }

  const email = normalizeEmail(valor);

  if (!email) return null;

  if (!isValidEmail(email)) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe um e-mail válido.');
  }

  return email;
}

function normalizarEnumOpcional(valor, rotulo, permitidos) {
  if (valor === undefined || valor === null || valor === '') return null;

  const normalizado = typeof valor === 'string' ? valor.trim().toLowerCase() : '';

  if (!permitidos.has(normalizado)) {
    throw new HttpError(422, 'VALIDATION_ERROR', `Informe um ${rotulo} válido.`);
  }

  return normalizado;
}

function normalizarValorOpcional(valor, rotulo) {
  if (valor === undefined || valor === null || valor === '') return null;

  const texto = typeof valor === 'string' ? valor.trim().replace(',', '.') : valor;
  const numero = Number(texto);

  if (!Number.isFinite(numero) || numero < 0 || numero > 999999999999.99) {
    throw new HttpError(422, 'VALIDATION_ERROR', `Informe um ${rotulo} válido e não negativo.`);
  }

  return Math.round(numero * 100) / 100;
}

function validarDados(dados, base = null) {
  const nome = normalizeName(valorInformado(dados, 'nome', base, 'nome_completo'));
  const cpf = normalizeCpf(valorInformado(dados, 'cpf', base));

  if (!isValidName(nome)) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'Informe o nome completo com pelo menos 3 caracteres.'
    );
  }

  if (!isValidCpf(cpf)) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe um CPF válido com 11 dígitos.');
  }

  const faixaPrecoMin = normalizarValorOpcional(
    valorInformado(dados, 'faixaPrecoMin', base, 'faixa_preco_min'),
    'valor mínimo'
  );
  const faixaPrecoMax = normalizarValorOpcional(
    valorInformado(dados, 'faixaPrecoMax', base, 'faixa_preco_max'),
    'valor máximo'
  );

  if (faixaPrecoMin !== null && faixaPrecoMax !== null && faixaPrecoMin > faixaPrecoMax) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'A faixa de preço mínima não pode ser maior que a máxima.'
    );
  }

  return {
    nome,
    cpf,
    telefone: normalizarTelefoneOpcional(
      valorInformado(dados, 'telefone', base),
      'telefone'
    ),
    whatsapp: normalizarTelefoneOpcional(
      valorInformado(dados, 'whatsapp', base),
      'WhatsApp'
    ),
    email: normalizarEmailOpcional(valorInformado(dados, 'email', base)),
    endereco: textoOpcional(valorInformado(dados, 'endereco', base), 255),
    tipoInteresse: normalizarEnumOpcional(
      valorInformado(dados, 'tipoInteresse', base, 'tipo_interesse'),
      'tipo de interesse',
      TIPOS_INTERESSE
    ),
    finalidadeDesejada: normalizarEnumOpcional(
      valorInformado(dados, 'finalidadeDesejada', base, 'finalidade_desejada'),
      'finalidade desejada',
      FINALIDADES
    ),
    faixaPrecoMin,
    faixaPrecoMax,
    localizacaoDesejada: textoOpcional(
      valorInformado(dados, 'localizacaoDesejada', base, 'localizacao_desejada'),
      180
    ),
    observacoes: textoOpcional(valorInformado(dados, 'observacoes', base), 4000),
  };
}

function normalizarListaIds(valor, mensagemLista, mensagemItem, limite = LIMITE_INTERESSES) {
  if (!Array.isArray(valor)) {
    throw new HttpError(422, 'VALIDATION_ERROR', mensagemLista);
  }

  const vistos = new Set();
  const ids = [];

  for (const item of valor) {
    const id = Number.parseInt(item, 10);

    if (!Number.isInteger(id) || id < 1) {
      throw new HttpError(422, 'VALIDATION_ERROR', mensagemItem);
    }

    if (vistos.has(id)) continue;
    vistos.add(id);

    if (ids.length >= limite) {
      throw new HttpError(
        422,
        'VALIDATION_ERROR',
        `Informe no máximo ${limite} registros na lista.`
      );
    }

    ids.push(id);
  }

  return ids;
}

function normalizarListaCorretores(valor) {
  if (valor === undefined || valor === null) return [];

  return normalizarListaIds(
    valor,
    'Informe os corretores responsáveis como uma lista de identificadores.',
    'Corretor inválido na lista de responsáveis.',
    20
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

  const existentes = await clienteModel.buscarCorretoresPorIds(ids);

  if (existentes.length !== ids.length || existentes.some((corretor) => !corretor.ativo)) {
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

async function resolverImoveisInteresse(dados, contexto) {
  if (!dados || !Object.prototype.hasOwnProperty.call(dados, 'imoveisInteresse')) {
    return null;
  }

  const ids = normalizarListaIds(
    dados.imoveisInteresse,
    'Informe os imóveis de interesse como uma lista de identificadores.',
    'Imóvel inválido na lista de interesse.',
    LIMITE_INTERESSES
  );

  if (ids.length === 0) return [];

  const existentes = await clienteModel.buscarImoveisPorIds(ids);

  if (existentes.length !== ids.length) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'Um ou mais imóveis informados não existem ou foram excluídos.'
    );
  }

  if (!contexto.ator?.usuario?.administrativo) {
    const permitidos = await Promise.all(
      ids.map((id) =>
        acessoService.podeAcessarRegistro(contexto.ator.usuario.id, 'imovel', id)
      )
    );

    if (permitidos.some((permitido) => !permitido)) {
      throw new HttpError(
        422,
        'VALIDATION_ERROR',
        'Um ou mais imóveis informados não estão disponíveis para o seu acesso.'
      );
    }
  }

  return ids;
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

function imovelInteressePublico(row) {
  return {
    id: row.id,
    codigo: row.codigo_interno,
    titulo: row.titulo,
    tipo: row.tipo_imovel,
    finalidade: row.finalidade,
    cidade: row.cidade,
    bairro: row.bairro,
    situacao: row.situacao,
    valorVenda: numeroOuNull(row.valor_venda),
    valorAluguel: numeroOuNull(row.valor_aluguel),
  };
}

function clientePublico(row) {
  return {
    id: row.id,
    nome: row.nome_completo,
    cpf: row.cpf,
    telefone: row.telefone,
    whatsapp: row.whatsapp,
    email: row.email,
    endereco: row.endereco,
    tipoInteresse: row.tipo_interesse,
    finalidadeDesejada: row.finalidade_desejada,
    faixaPrecoMin: numeroOuNull(row.faixa_preco_min),
    faixaPrecoMax: numeroOuNull(row.faixa_preco_max),
    localizacaoDesejada: row.localizacao_desejada,
    observacoes: row.observacoes,
    criadoEm: dataIso(row.criado_em),
    atualizadoEm: dataIso(row.atualizado_em),
  };
}

function clienteListaPublico(row) {
  return {
    ...clientePublico(row),
    corretores: Array.isArray(row.corretores)
      ? row.corretores.map((corretor) => ({
          id: corretor.id,
          nome: corretor.nome,
          creci: corretor.creci,
          principal: corretor.principal,
        }))
      : [],
  };
}

function atendimentoPublico(row) {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    corretorId: row.corretor_id,
    imovelId: row.imovel_id,
    tipo: row.tipo,
    status: row.status,
    dataAtendimento: dataIso(row.data_atendimento),
    descricao: row.descricao,
    observacoes: row.observacoes,
    criadoEm: dataIso(row.criado_em),
    corretor: row.corretor_nome
      ? {
          id: row.corretor_id,
          nome: row.corretor_nome,
          creci: row.corretor_creci,
        }
      : null,
    imovel: row.imovel_id
      ? {
          id: row.imovel_id,
          codigo: row.imovel_codigo,
          titulo: row.imovel_titulo,
        }
      : null,
  };
}

function traduzirErroBanco(error) {
  if (error.code !== '23505') return error;

  if (error.constraint === 'uq_clientes_cpf_ativo') {
    return new HttpError(409, 'CPF_IN_USE', 'Já existe um cliente cadastrado com este CPF.');
  }

  return error;
}

async function registrarEvento(contexto, tipoOperacao, clienteId, detalhes) {
  await registrarAdmin({
    ...contexto,
    tipoOperacao,
    entidade: 'clientes',
    registroId: String(clienteId),
    detalhes,
  });
}

function camposAlterados(anterior, atual) {
  const campos = [];
  const comparacoes = [
    ['nome', anterior.nome_completo, atual.nome],
    ['cpf', anterior.cpf, atual.cpf],
    ['telefone', anterior.telefone, atual.telefone],
    ['whatsapp', anterior.whatsapp, atual.whatsapp],
    ['email', anterior.email, atual.email],
    ['endereco', anterior.endereco, atual.endereco],
    ['tipoInteresse', anterior.tipo_interesse, atual.tipoInteresse],
    ['finalidadeDesejada', anterior.finalidade_desejada, atual.finalidadeDesejada],
    ['faixaPrecoMin', numeroOuNull(anterior.faixa_preco_min), atual.faixaPrecoMin],
    ['faixaPrecoMax', numeroOuNull(anterior.faixa_preco_max), atual.faixaPrecoMax],
    ['localizacaoDesejada', anterior.localizacao_desejada, atual.localizacaoDesejada],
    ['observacoes', anterior.observacoes, atual.observacoes],
  ];

  for (const [campo, antes, depois] of comparacoes) {
    if ((antes ?? null) !== (depois ?? null)) campos.push(campo);
  }

  return campos;
}

async function garantirAcessoCliente(clienteId, contexto) {
  const permitido = await acessoService.podeAcessarRegistro(
    contexto.ator.usuario.id,
    'cliente',
    clienteId
  );

  if (!permitido) {
    throw new HttpError(404, 'CLIENTE_NOT_FOUND', 'Cliente não encontrado.');
  }
}

async function carregarDetalhe(clienteId, contexto, { verificarAcesso = true } = {}) {
  const row = await clienteModel.buscarPorId(clienteId);

  if (!row) {
    throw new HttpError(404, 'CLIENTE_NOT_FOUND', 'Cliente não encontrado.');
  }

  if (verificarAcesso) {
    await garantirAcessoCliente(clienteId, contexto);
  }

  const visibilidadeImoveis = await acessoService.filtroVisibilidade(
    contexto.ator.usuario.id,
    'imovel',
    'i',
    1
  );

  const [corretores, imoveisInteresse] = await Promise.all([
    clienteModel.listarCorretores(clienteId),
    clienteModel.listarImoveisInteresse(clienteId, visibilidadeImoveis),
  ]);

  let atendimentos = [];
  let totalAtendimentos = 0;

  if (contexto.ator?.usuario?.permissoes?.includes('atendimentos.visualizar')) {
    [atendimentos, totalAtendimentos] = await Promise.all([
      clienteModel.listarAtendimentos(clienteId, LIMITE_ATENDIMENTOS),
      clienteModel.contarAtendimentos(clienteId),
    ]);
  }

  return {
    cliente: clientePublico(row),
    corretores: corretores.map(corretorPublico),
    imoveisInteresse: imoveisInteresse.map(imovelInteressePublico),
    atendimentos: atendimentos.map(atendimentoPublico),
    resumo: {
      atendimentos: totalAtendimentos,
      limiteAtendimentos: LIMITE_ATENDIMENTOS,
    },
  };
}

async function listarClientes(
  { busca = '', tipo = '', finalidade = '', localizacao = '', pagina = 1, limite = 10 } = {},
  contexto
) {
  garantirPermissao(contexto.ator, 'clientes.visualizar');

  const paginaNormalizada = numeroPositivo(pagina) || 1;
  const limiteNormalizado = Math.min(numeroPositivo(limite) || 10, LIMITE_MAXIMO);
  const visibilidade = await acessoService.filtroVisibilidade(
    contexto.ator.usuario.id,
    'cliente',
    'cl',
    0
  );

  const resultado = await clienteModel.listar({
    filtros: {
      busca: typeof busca === 'string' ? busca.trim().slice(0, 100) : '',
      tipo: normalizarEnumOpcional(tipo, 'tipo de interesse', TIPOS_INTERESSE) || '',
      finalidade:
        normalizarEnumOpcional(finalidade, 'finalidade desejada', FINALIDADES) || '',
      localizacao: typeof localizacao === 'string' ? localizacao.trim().slice(0, 120) : '',
    },
    visibilidade,
    pagina: paginaNormalizada,
    limite: limiteNormalizado,
  });

  return {
    clientes: resultado.clientes.map(clienteListaPublico),
    total: resultado.total,
    pagina: paginaNormalizada,
    limite: limiteNormalizado,
    totalPaginas: Math.max(1, Math.ceil(resultado.total / limiteNormalizado)),
  };
}

async function obterCliente(id, contexto) {
  garantirPermissao(contexto.ator, 'clientes.visualizar');

  const clienteId = numeroPositivo(id);

  if (!clienteId) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Cliente inválido.');
  }

  return carregarDetalhe(clienteId, contexto);
}

async function obterHistorico(id, contexto) {
  garantirPermissao(contexto.ator, 'auditoria.visualizar');

  const clienteId = numeroPositivo(id);

  if (!clienteId) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Cliente inválido.');
  }

  const row = await clienteModel.buscarPorId(clienteId);

  if (!row) {
    throw new HttpError(404, 'CLIENTE_NOT_FOUND', 'Cliente não encontrado.');
  }

  await garantirAcessoCliente(clienteId, contexto);

  const eventos = await auditoriaModel.listarPorRegistro(
    'clientes',
    clienteId,
    LIMITE_ATENDIMENTOS
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
  garantirPermissao(contexto.ator, 'clientes.visualizar');

  if (!contexto.ator.usuario.administrativo) {
    throw new HttpError(
      403,
      'FORBIDDEN',
      'Somente administradores podem consultar os corretores responsáveis.'
    );
  }

  const corretores = await clienteModel.listarCorretoresDisponiveis();

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

async function listarImoveisOpcoes(contexto) {
  garantirPermissao(contexto.ator, 'clientes.visualizar');

  const visibilidade = await acessoService.filtroVisibilidade(
    contexto.ator.usuario.id,
    'imovel',
    'i',
    0
  );
  const imoveis = await clienteModel.listarImoveisDisponiveis(visibilidade);

  return {
    imoveis: imoveis.map((imovel) => ({
      id: imovel.id,
      codigo: imovel.codigo_interno,
      titulo: imovel.titulo,
      tipo: imovel.tipo_imovel,
      cidade: imovel.cidade,
      bairro: imovel.bairro,
      situacao: imovel.situacao,
    })),
  };
}

async function criarCliente(dados, contexto) {
  garantirPermissao(contexto.ator, 'clientes.criar');

  const campos = validarDados(dados);
  const existente = await clienteModel.buscarPorCpf(campos.cpf);

  if (existente) {
    throw new HttpError(409, 'CPF_IN_USE', 'Já existe um cliente cadastrado com este CPF.');
  }

  const corretorPadrao = contexto.ator.usuario.administrativo
    ? null
    : await corretorModel.buscarPorUsuario(contexto.ator.usuario.id);
  const corretores = await resolverCorretores(dados, contexto, corretorPadrao);
  const imoveisInteresse = await resolverImoveisInteresse(dados, contexto);

  const client = await pool.connect();
  let clienteId;

  try {
    await client.query('BEGIN');

    const criado = await clienteModel.criar(client, {
      ...campos,
      criadoPorUsuarioId: contexto.ator.usuario.id,
    });

    clienteId = criado.id;

    if (corretores && corretores.length > 0) {
      await clienteModel.substituirCorretores(client, clienteId, corretores);
    }

    if (imoveisInteresse && imoveisInteresse.length > 0) {
      await clienteModel.substituirImoveisInteresse(client, clienteId, imoveisInteresse);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw traduzirErroBanco(error);
  } finally {
    client.release();
  }

  await registrarEvento(contexto, 'cliente.criado', clienteId, {
    nome: campos.nome,
    cpf: campos.cpf,
    tipoInteresse: campos.tipoInteresse,
    finalidadeDesejada: campos.finalidadeDesejada,
    corretores: (corretores || []).map((corretor) => corretor.id),
    imoveisInteresse: imoveisInteresse || [],
  });

  return carregarDetalhe(clienteId, contexto, { verificarAcesso: false });
}

async function atualizarCliente(id, dados, contexto) {
  garantirPermissao(contexto.ator, 'clientes.editar');

  const clienteId = numeroPositivo(id);

  if (!clienteId) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Cliente inválido.');
  }

  const anterior = await clienteModel.buscarPorId(clienteId);

  if (!anterior) {
    throw new HttpError(404, 'CLIENTE_NOT_FOUND', 'Cliente não encontrado.');
  }

  await garantirAcessoCliente(clienteId, contexto);

  const campos = validarDados(dados, anterior);

  if (campos.cpf !== anterior.cpf) {
    const existente = await clienteModel.buscarPorCpf(campos.cpf, clienteId);

    if (existente) {
      throw new HttpError(409, 'CPF_IN_USE', 'Já existe um cliente cadastrado com este CPF.');
    }
  }

  const corretores = await resolverCorretores(dados, contexto, null);
  const imoveisInteresse = await resolverImoveisInteresse(dados, contexto);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const atualizado = await clienteModel.atualizar(client, clienteId, campos);

    if (!atualizado) {
      throw new HttpError(404, 'CLIENTE_NOT_FOUND', 'Cliente não encontrado.');
    }

    if (corretores !== null) {
      await clienteModel.substituirCorretores(client, clienteId, corretores);
    }

    if (imoveisInteresse !== null) {
      await clienteModel.substituirImoveisInteresse(client, clienteId, imoveisInteresse);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw traduzirErroBanco(error);
  } finally {
    client.release();
  }

  const alterados = camposAlterados(anterior, campos);

  if (corretores !== null) {
    alterados.push('corretores');
  }

  if (imoveisInteresse !== null) {
    alterados.push('imoveisInteresse');
  }

  await registrarEvento(contexto, 'cliente.atualizado', clienteId, {
    nome: campos.nome,
    cpf: campos.cpf,
    campos: alterados,
    corretores: corretores ? corretores.map((corretor) => corretor.id) : null,
    imoveisInteresse,
  });

  return carregarDetalhe(clienteId, contexto);
}

async function excluirCliente(id, contexto) {
  garantirPermissao(contexto.ator, 'clientes.excluir');

  const clienteId = numeroPositivo(id);

  if (!clienteId) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Cliente inválido.');
  }

  const anterior = await clienteModel.buscarPorId(clienteId);

  if (!anterior) {
    throw new HttpError(404, 'CLIENTE_NOT_FOUND', 'Cliente não encontrado.');
  }

  await garantirAcessoCliente(clienteId, contexto);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const excluido = await clienteModel.excluirLogicamente(client, clienteId);

    if (!excluido) {
      throw new HttpError(404, 'CLIENTE_NOT_FOUND', 'Cliente não encontrado.');
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  await registrarEvento(contexto, 'cliente.excluido', clienteId, {
    nome: anterior.nome_completo,
    cpf: anterior.cpf,
  });

  return { id: clienteId };
}

function normalizarIdOpcional(valor, rotulo) {
  if (valor === undefined || valor === null || valor === '') return null;

  const id = numeroPositivo(valor);

  if (!id) {
    throw new HttpError(422, 'VALIDATION_ERROR', `Informe um ${rotulo} válido.`);
  }

  return id;
}

function validarAtendimento(dados) {
  const tipo = normalizarEnumOpcional(dados?.tipo, 'tipo de atendimento', TIPOS_ATENDIMENTO);
  const status =
    normalizarEnumOpcional(dados?.status, 'status do atendimento', STATUS_ATENDIMENTO) ||
    'realizado';
  const descricao = textoOpcional(dados?.descricao, 2000);

  if (!tipo) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Informe o tipo do atendimento.');
  }

  if (!descricao) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Descreva o atendimento realizado.');
  }

  if (descricao.length < 3) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'A descrição do atendimento deve ter pelo menos 3 caracteres.'
    );
  }

  let dataAtendimento = new Date();

  if (dados?.dataAtendimento !== undefined && dados.dataAtendimento !== null && dados.dataAtendimento !== '') {
    dataAtendimento = new Date(dados.dataAtendimento);

    if (Number.isNaN(dataAtendimento.getTime())) {
      throw new HttpError(422, 'VALIDATION_ERROR', 'Informe uma data de atendimento válida.');
    }
  }

  return {
    tipo,
    status,
    dataAtendimento: dataAtendimento.toISOString(),
    descricao,
    observacoes: textoOpcional(dados?.observacoes, 2000),
    imovelId: normalizarIdOpcional(dados?.imovelId, 'imóvel'),
    corretorId: normalizarIdOpcional(dados?.corretorId, 'corretor'),
  };
}

async function resolverCorretorAtendimento(campos, clienteId, contexto) {
  if (contexto.ator.usuario.administrativo) {
    if (campos.corretorId) {
      const corretor = await clienteModel.buscarCorretorAtivoPorId(campos.corretorId);

      if (!corretor) {
        throw new HttpError(
          422,
          'VALIDATION_ERROR',
          'O corretor informado não existe ou está inativo.'
        );
      }

      return corretor.id;
    }

    const vinculados = await clienteModel.listarCorretores(clienteId);
    const principal = vinculados.find((corretor) => corretor.principal) || vinculados[0];

    if (!principal) {
      throw new HttpError(
        422,
        'VALIDATION_ERROR',
        'Vincule um corretor ao cliente antes de registrar o atendimento.'
      );
    }

    return principal.id;
  }

  const proprio = await corretorModel.buscarPorUsuario(contexto.ator.usuario.id);

  if (!proprio) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'Sua conta não possui cadastro de corretor para registrar atendimentos.'
    );
  }

  if (campos.corretorId && Number(campos.corretorId) !== Number(proprio.id)) {
    throw new HttpError(
      403,
      'FORBIDDEN',
      'Somente administradores podem registrar atendimentos em nome de outro corretor.'
    );
  }

  return proprio.id;
}

async function registrarAtendimento(id, dados, contexto) {
  garantirPermissao(contexto.ator, 'atendimentos.criar');

  const clienteId = numeroPositivo(id);

  if (!clienteId) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Cliente inválido.');
  }

  const cliente = await clienteModel.buscarPorId(clienteId);

  if (!cliente) {
    throw new HttpError(404, 'CLIENTE_NOT_FOUND', 'Cliente não encontrado.');
  }

  await garantirAcessoCliente(clienteId, contexto);

  const campos = validarAtendimento(dados);
  const corretorId = await resolverCorretorAtendimento(campos, clienteId, contexto);

  let imovel = null;

  if (campos.imovelId) {
    imovel = await imovelModel.buscarPorId(campos.imovelId);

    if (!imovel) {
      throw new HttpError(
        422,
        'VALIDATION_ERROR',
        'O imóvel informado não existe ou foi excluído.'
      );
    }

    if (!contexto.ator.usuario.administrativo) {
      const permitido = await acessoService.podeAcessarRegistro(
        contexto.ator.usuario.id,
        'imovel',
        campos.imovelId
      );

      if (!permitido) {
        throw new HttpError(
          422,
          'VALIDATION_ERROR',
          'O imóvel informado não está disponível para o seu acesso.'
        );
      }
    }
  }

  const client = await pool.connect();
  let atendimentoId;

  try {
    await client.query('BEGIN');

    const criado = await clienteModel.criarAtendimento(client, {
      clienteId,
      corretorId,
      imovelId: imovel?.id || null,
      tipo: campos.tipo,
      status: campos.status,
      dataAtendimento: campos.dataAtendimento,
      descricao: campos.descricao,
      observacoes: campos.observacoes,
      criadoPorUsuarioId: contexto.ator.usuario.id,
    });

    atendimentoId = criado.id;

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  await registrarEvento(contexto, 'cliente.atendimento_registrado', clienteId, {
    atendimento: atendimentoId,
    cliente: cliente.nome_completo,
    corretorId,
    imovelId: imovel?.id || null,
    tipo: campos.tipo,
    status: campos.status,
    dataAtendimento: campos.dataAtendimento,
  });

  const row = await clienteModel.buscarAtendimentoPorId(atendimentoId);

  return { atendimento: atendimentoPublico(row) };
}

module.exports = {
  listarClientes,
  obterCliente,
  obterHistorico,
  listarCorretoresOpcoes,
  listarImoveisOpcoes,
  criarCliente,
  atualizarCliente,
  excluirCliente,
  registrarAtendimento,
};
