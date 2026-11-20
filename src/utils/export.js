'use strict';

const PDF_PAGE_WIDTH = 595.28;
const PDF_PAGE_HEIGHT = 841.89;
const PDF_MARGIN = 40;
const PDF_CONTENT_WIDTH = PDF_PAGE_WIDTH - PDF_MARGIN * 2;
const PDF_LINE_HEIGHT = 10;

const CORES = {
  azul: '0.078 0.157 0.247',
  dourado: '0.773 0.651 0.416',
  texto: '0.106 0.165 0.227',
  suave: '0.4 0.439 0.49',
  fundo: '0.953 0.957 0.965',
  fundoAlternado: '0.976 0.98 0.984',
  borda: '0.886 0.902 0.922',
};

function formatarValor(valor, formato = 'texto') {
  if (valor === null || valor === undefined || valor === '') return '';

  try {
    switch (formato) {
      case 'inteiro':
        return Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
      case 'decimal':
        return Number(valor).toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      case 'percentual':
        return `${Number(valor).toLocaleString('pt-BR', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}%`;
      case 'moeda':
        return Number(valor).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        });
      case 'data':
        return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(
          new Date(valor)
        );
      case 'datahora':
        return new Intl.DateTimeFormat('pt-BR', {
          dateStyle: 'short',
          timeStyle: 'short',
        }).format(new Date(valor));
      default:
        return String(valor);
    }
  } catch {
    return String(valor);
  }
}

function gerarCsv({ colunas, linhas }) {
  const escapar = (valor) => `"${String(valor ?? '').replaceAll('"', '""')}"`;
  const registros = [
    colunas.map((coluna) => coluna.rotulo),
    ...linhas.map((linha) =>
      colunas.map((coluna) => formatarValor(linha[coluna.chave], coluna.formato))
    ),
  ];

  return `\uFEFF${registros
    .map((registro) => registro.map(escapar).join(';'))
    .join('\r\n')}\r\n`;
}

function sanitizarTexto(valor) {
  return String(valor ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
    .trim();
}

function textoPdf(valor) {
  return `(${sanitizarTexto(valor)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')})`;
}

function larguraTexto(valor, tamanho) {
  return sanitizarTexto(valor).length * tamanho * 0.52;
}

function quebrarTexto(valor, larguraMaxima, tamanho) {
  const palavras = sanitizarTexto(valor).split(' ').filter(Boolean);

  if (palavras.length === 0) return [''];

  const linhas = [];
  let atual = '';

  for (const palavra of palavras) {
    const candidato = atual ? `${atual} ${palavra}` : palavra;

    if (larguraTexto(candidato, tamanho) <= larguraMaxima) {
      atual = candidato;
      continue;
    }

    if (atual) linhas.push(atual);

    if (larguraTexto(palavra, tamanho) <= larguraMaxima) {
      atual = palavra;
      continue;
    }

    let restante = palavra;
    const porLinha = Math.max(1, Math.floor(larguraMaxima / (tamanho * 0.52)));

    while (larguraTexto(restante, tamanho) > larguraMaxima && restante.length > 1) {
      linhas.push(restante.slice(0, porLinha));
      restante = restante.slice(porLinha);
    }

    atual = restante;
  }

  if (atual) linhas.push(atual);

  return linhas.length ? linhas : [''];
}

function criarPaginador({ titulo, subtitulo, geradoEm, filtros, resumo, colunas, linhas }) {
  const paginas = [];
  let operacoes = [];
  let numeroPagina = 0;
  let y = 0;

  function adicionar(conteudo) {
    operacoes.push(conteudo);
  }

  function retangulo(x, topo, largura, altura, cor) {
    adicionar(`${cor} rg`);
    adicionar(
      `${x.toFixed(2)} ${topo.toFixed(2)} ${largura.toFixed(2)} ${altura.toFixed(2)} re f`
    );
  }

  function linha(x1, y1, x2, y2, cor = CORES.borda, espessura = 0.6) {
    adicionar(`${cor} RG ${espessura} w`);
    adicionar(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  function texto(valor, x, base, { tamanho = 9, fonte = 'F1', cor = CORES.texto } = {}) {
    adicionar(`${cor} rg`);
    adicionar(
      `BT /${fonte} ${tamanho} Tf 1 0 0 1 ${x.toFixed(2)} ${base.toFixed(2)} Tm ${textoPdf(valor)} Tj ET`
    );
  }

  function largurasColunas() {
    const base = colunas.map((coluna) => coluna.largura || 100);
    const soma = base.reduce((total, largura) => total + largura, 0);
    return base.map((largura) => (largura / soma) * PDF_CONTENT_WIDTH);
  }

  const larguras = largurasColunas();

  function desenharCabecalhoTabela() {
    const altura = 20;

    if (y - altura < PDF_MARGIN) {
      fecharPagina();
      abrirPagina();
    }

    retangulo(PDF_MARGIN, y - altura, PDF_CONTENT_WIDTH, altura, CORES.fundo);
    let x = PDF_MARGIN;

    colunas.forEach((coluna, indice) => {
      texto(coluna.rotulo, x + 4, y - 13, {
        tamanho: 8,
        fonte: 'F2',
        cor: CORES.azul,
      });
      x += larguras[indice];
    });

    y -= altura;
    linha(PDF_MARGIN, y, PDF_MARGIN + PDF_CONTENT_WIDTH, y, CORES.dourado, 1);
  }

  function desenharCabecalho() {
    retangulo(PDF_MARGIN, PDF_PAGE_HEIGHT - PDF_MARGIN, PDF_CONTENT_WIDTH, 3, CORES.dourado);

    let topo = PDF_PAGE_HEIGHT - PDF_MARGIN - 18;
    texto('ImobManager', PDF_MARGIN, topo, {
      tamanho: 8,
      fonte: 'F2',
      cor: CORES.dourado,
    });

    if (numeroPagina === 1) {
      topo -= 24;
      texto(titulo, PDF_MARGIN, topo, {
        tamanho: 17,
        fonte: 'F2',
        cor: CORES.azul,
      });

      if (subtitulo) {
        topo -= 14;
        texto(subtitulo, PDF_MARGIN, topo, { tamanho: 9, cor: CORES.suave });
      }

      topo -= 16;
      texto(`Gerado em ${formatarValor(geradoEm, 'datahora')}`, PDF_MARGIN, topo, {
        tamanho: 8,
        cor: CORES.suave,
      });

      for (const filtro of filtros || []) {
        topo -= 11;
        texto(filtro, PDF_MARGIN, topo, { tamanho: 8, cor: CORES.suave });
      }

      if (resumo?.length) {
        topo -= 16;
        texto('Resumo', PDF_MARGIN, topo, {
          tamanho: 10,
          fonte: 'F2',
          cor: CORES.azul,
        });

        for (const item of resumo) {
          topo -= 12;
          texto(`${item.label}: ${item.valor}`, PDF_MARGIN + 4, topo, {
            tamanho: 8.5,
            cor: CORES.texto,
          });
        }
      }

      y = topo - 22;
      return;
    }

    topo -= 18;
    texto(`${titulo} (continuação)`, PDF_MARGIN, topo, {
      tamanho: 11,
      fonte: 'F2',
      cor: CORES.azul,
    });
    y = topo - 20;
  }

  function desenharRodape() {
    const base = PDF_MARGIN - 14;
    texto(`ImobManager · Página ${numeroPagina}`, PDF_MARGIN, base, {
      tamanho: 7,
      cor: CORES.suave,
    });
    texto('Documento gerado pelo sistema', PDF_MARGIN + PDF_CONTENT_WIDTH - 110, base, {
      tamanho: 7,
      cor: CORES.suave,
    });
  }

  function abrirPagina() {
    operacoes = [];
    numeroPagina += 1;
    y = PDF_PAGE_HEIGHT - PDF_MARGIN;
    desenharCabecalho();
  }

  function fecharPagina() {
    if (!operacoes.length) return;
    desenharRodape();
    paginas.push(operacoes.join('\n'));
    operacoes = [];
  }

  function desenharTabela(linhas) {
    desenharCabecalhoTabela();

    if (!linhas.length) {
      y -= 24;
      texto('Nenhum registro encontrado para os filtros informados.', PDF_MARGIN + 4, y, {
        tamanho: 9,
        cor: CORES.suave,
      });
      return;
    }

    linhas.forEach((registro, indice) => {
      const celulas = colunas.map((coluna, posicao) =>
        quebrarTexto(
          formatarValor(registro[coluna.chave], coluna.formato),
          larguras[posicao] - 8,
          8
        )
      );
      const alturaLinha = Math.max(
        16,
        Math.max(...celulas.map((celula) => celula.length)) * PDF_LINE_HEIGHT + 6
      );

      if (y - alturaLinha < PDF_MARGIN) {
        fecharPagina();
        abrirPagina();
        desenharCabecalhoTabela();
      }

      if (indice % 2 === 1) {
        retangulo(
          PDF_MARGIN,
          y - alturaLinha,
          PDF_CONTENT_WIDTH,
          alturaLinha,
          CORES.fundoAlternado
        );
      }

      let x = PDF_MARGIN;

      celulas.forEach((celula, posicao) => {
        celula.forEach((linhaTexto, linhaIndice) => {
          texto(linhaTexto, x + 4, y - 12 - linhaIndice * PDF_LINE_HEIGHT, {
            tamanho: 8,
            cor: CORES.texto,
          });
        });
        x += larguras[posicao];
      });

      y -= alturaLinha;
      linha(PDF_MARGIN, y, PDF_MARGIN + PDF_CONTENT_WIDTH, y, CORES.borda, 0.4);
    });
  }

  abrirPagina();
  desenharTabela(linhas);
  fecharPagina();

  return paginas;
}

function montarPdf(paginas) {
  const inicioPaginas = 5;
  const kids = paginas
    .map((_, indice) => `${inicioPaginas + indice * 2} 0 R`)
    .join(' ');

  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${paginas.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];

  paginas.forEach((conteudo, indice) => {
    objetos.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${inicioPaginas + indice * 2 + 1} 0 R >>`
    );
    objetos.push(
      `<< /Length ${Buffer.byteLength(conteudo, 'latin1')} >>\nstream\n${conteudo}\nendstream`
    );
  });

  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const deslocamentos = [];

  objetos.forEach((objeto, indice) => {
    deslocamentos.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${indice + 1} 0 obj\n${objeto}\nendobj\n`;
  });

  const inicioXref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;

  for (const deslocamento of deslocamentos) {
    pdf += `${String(deslocamento).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

function gerarPdf({ titulo, subtitulo, geradoEm, filtros, resumo, colunas, linhas }) {
  const paginas = criarPaginador({
    titulo,
    subtitulo,
    geradoEm,
    filtros,
    resumo,
    colunas,
    linhas,
  });

  return montarPdf(paginas);
}

module.exports = {
  formatarValor,
  gerarCsv,
  gerarPdf,
};
