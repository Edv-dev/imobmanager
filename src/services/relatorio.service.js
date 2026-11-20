'use strict';

const acessoService = require('./acesso.service');
const atendimentoService = require('./atendimento.service');
const relatorioModel = require('../models/relatorio.model');
const corretorModel = require('../models/corretor.model');
const { garantirPermissao } = require('../utils/authorization');
const { formatarValor, gerarCsv, gerarPdf } = require('../utils/export');
const HttpError = require('../utils/http-error');

const ROTULOS_SITUACAO = {
  disponivel: 'Disponível',
  reservado: 'Reservado',
  vendido: 'Vendido',
  alugado: 'Alugado',
  inativo: 'Inativo',
};

const ROTULOS_FINALIDADE = {
  venda: 'Venda',
  aluguel: 'Aluguel',
};

const ROTULOS_TIPO_ATENDIMENTO = {
  ligacao: 'Ligação',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  visita: 'Visita',
  reuniao: 'Reunião',
  outro: 'Outro',
};

const ROTULOS_STATUS_ATENDIMENTO = {
  agendado: 'Agendado',
  realizado: 'Realizado',
  cancelado: 'Cancelado',
};

const MESES_CURTOS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

const RELATORIOS = [
  {
    id: 'imoveis-situacao',
    titulo: 'Imóveis por situação',
    descricao: 'Distribuição da carteira de imóveis conforme a situação cadastrada.',
  },
  {
    id: 'imoveis-finalidade',
    titulo: 'Imóveis por finalidade',
    descricao: 'Quantidade e valores médios dos imóveis para venda e para aluguel.',
  },
  {
    id: 'imoveis-corretor',
    titulo: 'Imóveis por corretor',
    descricao: 'Carteira de imóveis sob responsabilidade de cada corretor.',
  },
  {
    id: 'clientes-corretor',
    titulo: 'Clientes por corretor',
    descricao: 'Base de clientes e atendimentos vinculados a cada corretor.',
  },
  {
    id: 'atendimentos',
    titulo: 'Histórico de atendimentos',
    descricao: 'Atendimentos realizados no período, com cliente, corretor e imóvel.',
  },
];

const IDS_RELATORIOS = new Set(RELATORIOS.map((item) => item.id));

function possuiPermissao(ator, chave) {
  return Boolean(ator?.usuario?.permissoes?.includes(chave));
}

function garantirPermissaoDados(ator, chave) {
  if (!possuiPermissao(ator, chave)) {
    throw new HttpError(
      403,
      'FORBIDDEN',
      'Você não possui permissão para consultar os dados deste relatório.'
    );
  }
}

function normalizarFiltros(filtros = {}) {
  const base = atendimentoService.normalizarFiltros({
    inicio: filtros.inicio,
    fim: filtros.fim,
    corretor: filtros.corretor,
    tipo: filtros.tipo,
    status: filtros.status,
  });

  let finalidade = null;

  if (filtros.finalidade !== undefined && filtros.finalidade !== null && filtros.finalidade !== '') {
    if (typeof filtros.finalidade !== 'string' || !ROTULOS_FINALIDADE[filtros.finalidade]) {
      throw new HttpError(422, 'VALIDATION_ERROR', 'Finalidade inválida.');
    }

    finalidade = filtros.finalidade;
  }

  return { ...base, finalidade };
}

function formatarDataCurta(valor) {
  if (!valor) return '';
  const [ano, mes, dia] = valor.split('-');
  return `${dia}/${mes}/${ano}`;
}

function filtrosTexto(filtros, nomeCorretor) {
  const partes = [];

  if (filtros.inicio || filtros.fim) {
    partes.push(
      `Período: ${filtros.inicio ? formatarDataCurta(filtros.inicio) : 'início'} a ${
        filtros.fim ? formatarDataCurta(filtros.fim) : 'hoje'
      }`
    );
  } else {
    partes.push('Período: todo o histórico');
  }

  if (filtros.corretorId) {
    partes.push(`Corretor: ${nomeCorretor || `#${filtros.corretorId}`}`);
  }

  if (filtros.finalidade) {
    partes.push(`Finalidade: ${ROTULOS_FINALIDADE[filtros.finalidade]}`);
  }

  if (filtros.tipo) {
    partes.push(
      `Tipo de atendimento: ${ROTULOS_TIPO_ATENDIMENTO[filtros.tipo] || filtros.tipo}`
    );
  }

  if (filtros.status) {
    partes.push(
      `Status do atendimento: ${ROTULOS_STATUS_ATENDIMENTO[filtros.status] || filtros.status}`
    );
  }

  return partes;
}

async function resolverNomeCorretor(filtros) {
  if (!filtros.corretorId) return null;
  const corretor = await relatorioModel.buscarCorretorNome(filtros.corretorId);
  return corretor?.nome_completo || null;
}

function completarSerie(rows) {
  const mapa = new Map(rows.map((row) => [row.mes, row.total]));
  const agora = new Date();
  const serie = [];

  for (let indice = 5; indice >= 0; indice -= 1) {
    const data = new Date(agora.getFullYear(), agora.getMonth() - indice, 1);
    const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
    serie.push({
      mes: chave,
      rotulo: `${MESES_CURTOS[data.getMonth()]}/${String(data.getFullYear()).slice(-2)}`,
      total: mapa.get(chave) || 0,
    });
  }

  return serie;
}

function resumoAtendimentoRecente(row) {
  return atendimentoService.atendimentoPublico(row);
}

async function obterDashboard(contexto) {
  garantirPermissao(contexto.ator, 'dashboard.visualizar');

  const usuarioId = contexto.ator.usuario.id;
  const permissoes = new Set(contexto.ator.usuario.permissoes);
  const podeImoveis = permissoes.has('imoveis.visualizar');
  const podeClientes = permissoes.has('clientes.visualizar');
  const podeAtendimentos = permissoes.has('atendimentos.visualizar');
  const podeCorretores = permissoes.has('corretores.visualizar');

  const [visibilidadeImoveis, visibilidadeClientes] = await Promise.all([
    podeImoveis ? acessoService.filtroVisibilidade(usuarioId, 'imovel', 'i', 0) : null,
    podeClientes || podeAtendimentos
      ? acessoService.filtroVisibilidade(usuarioId, 'cliente', 'cl', 0)
      : null,
  ]);

  const resultado = {
    geradoEm: new Date().toISOString(),
    periodoDias: 30,
  };

  const tarefas = [];

  if (podeImoveis) {
    tarefas.push(async () => {
      const [resumo, situacao, finalidade] = await Promise.all([
        relatorioModel.resumoImoveis(visibilidadeImoveis),
        relatorioModel.distribuicaoImoveis(visibilidadeImoveis, 'situacao'),
        relatorioModel.distribuicaoImoveis(visibilidadeImoveis, 'finalidade'),
      ]);

      resultado.imoveis = {
        total: resumo.total,
        disponiveis: resumo.disponiveis,
        reservados: resumo.reservados,
        vendidos: resumo.vendidos,
        alugados: resumo.alugados,
        inativos: resumo.inativos,
        porSituacao: situacao.map((item) => ({
          chave: item.chave,
          rotulo: ROTULOS_SITUACAO[item.chave] || item.chave,
          total: item.total,
        })),
        porFinalidade: finalidade.map((item) => ({
          chave: item.chave,
          rotulo: ROTULOS_FINALIDADE[item.chave] || item.chave,
          total: item.total,
        })),
      };
    });
  }

  if (podeCorretores) {
    tarefas.push(async () => {
      const resumo = await relatorioModel.resumoCorretores();
      resultado.corretores = { ativos: resumo.ativos, total: resumo.total };
    });
  }

  if (podeClientes) {
    tarefas.push(async () => {
      const [resumo, serie] = await Promise.all([
        relatorioModel.resumoClientes(visibilidadeClientes),
        relatorioModel.clientesPorMes(visibilidadeClientes),
      ]);

      resultado.clientes = {
        total: resumo.total,
        novos30Dias: resumo.novos_30_dias,
        serieMensal: completarSerie(serie),
      };
    });
  }

  if (podeAtendimentos) {
    tarefas.push(async () => {
      const [resumo, serie, recentes] = await Promise.all([
        relatorioModel.resumoAtendimentos(visibilidadeClientes),
        relatorioModel.atendimentosPorMes(visibilidadeClientes),
        relatorioModel.atendimentosRecentes(visibilidadeClientes, 6),
      ]);

      resultado.atendimentos = {
        total: resumo.total,
        ultimos30Dias: resumo.ultimos_30_dias,
        agendados: resumo.agendados,
        serieMensal: completarSerie(serie),
        recentes: recentes.map(resumoAtendimentoRecente),
      };
    });
  }

  await Promise.all(tarefas.map((tarefa) => tarefa()));

  return resultado;
}

async function relatorioImoveisSituacao(visibilidade, filtros) {
  const rows = await relatorioModel.distribuicaoImoveis(visibilidade, 'situacao', {
    finalidade: filtros.finalidade,
    corretorId: filtros.corretorId,
    inicio: filtros.inicio,
    fim: filtros.fim,
  });
  const total = rows.reduce((soma, row) => soma + row.total, 0);

  return {
    titulo: 'Imóveis por situação',
    descricao: 'Distribuição da carteira de imóveis conforme a situação cadastrada.',
    colunas: [
      { chave: 'situacao', rotulo: 'Situação', formato: 'texto', largura: 110 },
      { chave: 'quantidade', rotulo: 'Imóveis', formato: 'inteiro', alinhamento: 'right', largura: 80 },
      { chave: 'participacao', rotulo: 'Participação', formato: 'percentual', alinhamento: 'right', largura: 95 },
      { chave: 'valorMedioVenda', rotulo: 'Valor médio de venda', formato: 'moeda', alinhamento: 'right', largura: 130 },
      { chave: 'valorMedioAluguel', rotulo: 'Valor médio de aluguel', formato: 'moeda', alinhamento: 'right', largura: 130 },
    ],
    linhas: rows.map((row) => ({
      situacao: ROTULOS_SITUACAO[row.chave] || row.chave,
      quantidade: row.total,
      participacao: total > 0 ? (row.total / total) * 100 : 0,
      valorMedioVenda: row.valor_medio_venda,
      valorMedioAluguel: row.valor_medio_aluguel,
    })),
    resumo: [
      { label: 'Total de imóveis', valor: formatarValor(total, 'inteiro') },
    ],
    total,
  };
}

async function relatorioImoveisFinalidade(visibilidade, filtros) {
  const rows = await relatorioModel.distribuicaoImoveis(visibilidade, 'finalidade', {
    finalidade: filtros.finalidade,
    corretorId: filtros.corretorId,
    inicio: filtros.inicio,
    fim: filtros.fim,
  });
  const total = rows.reduce((soma, row) => soma + row.total, 0);

  return {
    titulo: 'Imóveis por finalidade',
    descricao: 'Quantidade e valores médios dos imóveis para venda e para aluguel.',
    colunas: [
      { chave: 'finalidade', rotulo: 'Finalidade', formato: 'texto', largura: 110 },
      { chave: 'quantidade', rotulo: 'Imóveis', formato: 'inteiro', alinhamento: 'right', largura: 80 },
      { chave: 'participacao', rotulo: 'Participação', formato: 'percentual', alinhamento: 'right', largura: 95 },
      { chave: 'valorMedioVenda', rotulo: 'Valor médio de venda', formato: 'moeda', alinhamento: 'right', largura: 130 },
      { chave: 'valorMedioAluguel', rotulo: 'Valor médio de aluguel', formato: 'moeda', alinhamento: 'right', largura: 130 },
    ],
    linhas: rows.map((row) => ({
      finalidade: ROTULOS_FINALIDADE[row.chave] || row.chave,
      quantidade: row.total,
      participacao: total > 0 ? (row.total / total) * 100 : 0,
      valorMedioVenda: row.valor_medio_venda,
      valorMedioAluguel: row.valor_medio_aluguel,
    })),
    resumo: [
      { label: 'Total de imóveis', valor: formatarValor(total, 'inteiro') },
    ],
    total,
  };
}

async function relatorioImoveisCorretor(visibilidade, filtros) {
  const [rows, resumo] = await Promise.all([
    relatorioModel.imoveisPorCorretor(visibilidade, {
      finalidade: filtros.finalidade,
      corretorId: filtros.corretorId,
      inicio: filtros.inicio,
      fim: filtros.fim,
    }),
    relatorioModel.resumoImoveis(visibilidade, {
      finalidade: filtros.finalidade,
      corretorId: filtros.corretorId,
      inicio: filtros.inicio,
      fim: filtros.fim,
    }),
  ]);

  return {
    titulo: 'Imóveis por corretor',
    descricao: 'Carteira de imóveis sob responsabilidade de cada corretor.',
    colunas: [
      { chave: 'corretor', rotulo: 'Corretor', formato: 'texto', largura: 150 },
      { chave: 'creci', rotulo: 'CRECI', formato: 'texto', largura: 100 },
      { chave: 'total', rotulo: 'Total', formato: 'inteiro', alinhamento: 'right', largura: 70 },
      { chave: 'disponiveis', rotulo: 'Disponíveis', formato: 'inteiro', alinhamento: 'right', largura: 80 },
      { chave: 'vendidos', rotulo: 'Vendidos', formato: 'inteiro', alinhamento: 'right', largura: 70 },
      { chave: 'alugados', rotulo: 'Alugados', formato: 'inteiro', alinhamento: 'right', largura: 70 },
    ],
    linhas: rows.map((row) => ({
      corretor: row.corretor || 'Sem corretor',
      creci: row.creci || '—',
      total: row.total,
      disponiveis: row.disponiveis,
      vendidos: row.vendidos,
      alugados: row.alugados,
    })),
    resumo: [
      { label: 'Total de imóveis', valor: formatarValor(resumo.total, 'inteiro') },
      { label: 'Corretores na lista', valor: formatarValor(rows.length, 'inteiro') },
    ],
    total: rows.length,
  };
}

async function relatorioClientesCorretor(visibilidade, filtros) {
  const [rows, resumo] = await Promise.all([
    relatorioModel.clientesPorCorretor(visibilidade, {
      finalidade: filtros.finalidade,
      corretorId: filtros.corretorId,
      inicio: filtros.inicio,
      fim: filtros.fim,
    }),
    relatorioModel.resumoClientes(visibilidade, {
      finalidade: filtros.finalidade,
      corretorId: filtros.corretorId,
      inicio: filtros.inicio,
      fim: filtros.fim,
    }),
  ]);

  return {
    titulo: 'Clientes por corretor',
    descricao: 'Base de clientes e atendimentos vinculados a cada corretor.',
    colunas: [
      { chave: 'corretor', rotulo: 'Corretor', formato: 'texto', largura: 150 },
      { chave: 'creci', rotulo: 'CRECI', formato: 'texto', largura: 100 },
      { chave: 'total', rotulo: 'Clientes', formato: 'inteiro', alinhamento: 'right', largura: 80 },
      { chave: 'novos30Dias', rotulo: 'Novos (30 dias)', formato: 'inteiro', alinhamento: 'right', largura: 110 },
      { chave: 'atendimentos', rotulo: 'Atendimentos', formato: 'inteiro', alinhamento: 'right', largura: 100 },
    ],
    linhas: rows.map((row) => ({
      corretor: row.corretor || 'Sem corretor',
      creci: row.creci || '—',
      total: row.total,
      novos30Dias: row.novos_30_dias,
      atendimentos: row.atendimentos,
    })),
    resumo: [
      { label: 'Total de clientes', valor: formatarValor(resumo.total, 'inteiro') },
      { label: 'Corretores na lista', valor: formatarValor(rows.length, 'inteiro') },
    ],
    total: rows.length,
  };
}

async function relatorioAtendimentos(filtros, contexto) {
  const resultado = await atendimentoService.listarAtendimentos(
    { ...filtros, pagina: 1, limite: 500 },
    contexto,
    { limiteMaximo: 500 }
  );

  const linhas = resultado.atendimentos.map((atendimento) => ({
    dataAtendimento: atendimento.dataAtendimento,
    cliente: atendimento.cliente,
    corretor: atendimento.corretor,
    imovel: atendimento.imovel
      ? `${atendimento.imovel.codigo} · ${atendimento.imovel.titulo}`
      : '—',
    tipo: ROTULOS_TIPO_ATENDIMENTO[atendimento.tipo] || atendimento.tipo,
    status: ROTULOS_STATUS_ATENDIMENTO[atendimento.status] || atendimento.status,
    descricao: atendimento.descricao,
  }));

  const resumo = [
    {
      label: 'Atendimentos encontrados',
      valor: formatarValor(resultado.total, 'inteiro'),
    },
  ];

  if (resultado.total > linhas.length) {
    resumo.push({
      label: 'Exibindo',
      valor: `${formatarValor(linhas.length, 'inteiro')} mais recentes`,
    });
  }

  return {
    titulo: 'Histórico de atendimentos',
    descricao: 'Atendimentos realizados no período, com cliente, corretor e imóvel.',
    colunas: [
      { chave: 'dataAtendimento', rotulo: 'Data', formato: 'datahora', largura: 105 },
      { chave: 'cliente', rotulo: 'Cliente', formato: 'texto', largura: 130 },
      { chave: 'corretor', rotulo: 'Corretor', formato: 'texto', largura: 110 },
      { chave: 'imovel', rotulo: 'Imóvel', formato: 'texto', largura: 130 },
      { chave: 'tipo', rotulo: 'Tipo', formato: 'texto', largura: 70 },
      { chave: 'status', rotulo: 'Status', formato: 'texto', largura: 70 },
      { chave: 'descricao', rotulo: 'Descrição', formato: 'texto', largura: 180 },
    ],
    linhas,
    resumo,
    total: resultado.total,
  };
}

async function obterRelatorio(nome, filtros, contexto) {
  garantirPermissao(contexto.ator, 'relatorios.visualizar');

  if (!IDS_RELATORIOS.has(nome)) {
    throw new HttpError(404, 'REPORT_NOT_FOUND', 'Relatório não encontrado.');
  }

  const normalizados = normalizarFiltros(filtros);
  const nomeCorretor = await resolverNomeCorretor(normalizados);
  const usuarioId = contexto.ator.usuario.id;
  let relatorio;

  if (nome === 'atendimentos') {
    relatorio = await relatorioAtendimentos(normalizados, contexto);
  } else if (nome === 'clientes-corretor') {
    garantirPermissaoDados(contexto.ator, 'clientes.visualizar');
    const visibilidade = await acessoService.filtroVisibilidade(
      usuarioId,
      'cliente',
      'cl',
      0
    );
    relatorio = await relatorioClientesCorretor(visibilidade, normalizados);
  } else {
    garantirPermissaoDados(contexto.ator, 'imoveis.visualizar');
    const visibilidade = await acessoService.filtroVisibilidade(
      usuarioId,
      'imovel',
      'i',
      0
    );

    if (nome === 'imoveis-situacao') {
      relatorio = await relatorioImoveisSituacao(visibilidade, normalizados);
    } else if (nome === 'imoveis-finalidade') {
      relatorio = await relatorioImoveisFinalidade(visibilidade, normalizados);
    } else {
      relatorio = await relatorioImoveisCorretor(visibilidade, normalizados);
    }
  }

  return {
    relatorio: {
      id: nome,
      ...relatorio,
      geradoEm: new Date().toISOString(),
      filtros: filtrosTexto(normalizados, nomeCorretor),
    },
  };
}

async function obterOpcoes(contexto) {
  garantirPermissao(contexto.ator, 'relatorios.visualizar');

  if (contexto.ator.usuario.administrativo) {
    const corretores = await relatorioModel.listarCorretoresOpcoes();

    return {
      corretores: corretores.map((corretor) => ({
        id: corretor.id,
        nome: corretor.nome_completo,
        creci: corretor.creci,
      })),
    };
  }

  const corretor = await corretorModel.buscarPorUsuario(contexto.ator.usuario.id);

  return {
    corretores: corretor
      ? [{ id: corretor.id, nome: corretor.nome_completo, creci: corretor.creci }]
      : [],
  };
}

function listarCatalogo(contexto) {
  garantirPermissao(contexto.ator, 'relatorios.visualizar');
  return { relatorios: RELATORIOS };
}

async function exportarRelatorio(nome, filtros, formato, contexto) {
  garantirPermissao(contexto.ator, 'relatorios.exportar');

  if (formato !== 'csv' && formato !== 'pdf') {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'Formato de exportação inválido. Use "csv" ou "pdf".'
    );
  }

  const { relatorio } = await obterRelatorio(nome, filtros, contexto);
  const identificador = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .slice(0, 15);

  if (formato === 'csv') {
    const conteudo = gerarCsv({
      colunas: relatorio.colunas,
      linhas: relatorio.linhas,
    });

    return {
      nomeArquivo: `relatorio-${nome}-${identificador}.csv`,
      contentType: 'text/csv; charset=utf-8',
      conteudo: Buffer.from(conteudo, 'utf8'),
    };
  }

  return {
    nomeArquivo: `relatorio-${nome}-${identificador}.pdf`,
    contentType: 'application/pdf',
    conteudo: gerarPdf({
      titulo: relatorio.titulo,
      subtitulo: relatorio.descricao,
      geradoEm: relatorio.geradoEm,
      filtros: relatorio.filtros,
      resumo: relatorio.resumo,
      colunas: relatorio.colunas,
      linhas: relatorio.linhas,
    }),
  };
}

module.exports = {
  RELATORIOS,
  obterDashboard,
  obterRelatorio,
  obterOpcoes,
  listarCatalogo,
  exportarRelatorio,
};
