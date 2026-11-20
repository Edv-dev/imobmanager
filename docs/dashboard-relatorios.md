# Dashboard, relatórios e atendimentos

Documentação da etapa 09 do ImobManager. A etapa conectou o dashboard, os relatórios e a
tela isolada de atendimentos aos dados reais, com filtros, visibilidade por registro e
exportação em CSV e PDF. As regras de clientes e atendimentos registrados no detalhe do
cliente continuam em [clientes.md](clientes.md).

## Objetivo

- Exibir indicadores operacionais atualizados a partir do banco.
- Permitir consultas consolidadas de imóveis, clientes e atendimentos.
- Respeitar permissões e a visibilidade configurada para cada usuário.
- Exportar qualquer relatório em CSV (planilhas) ou PDF (impressão), sem dependências
  externas de geração de PDF.

## Permissões

| Permissão | Uso |
| --- | --- |
| `dashboard.visualizar` | Acessa `GET /api/dashboard` e o menu Dashboard |
| `relatorios.visualizar` | Lista o catálogo, carrega opções e gera relatórios |
| `relatorios.exportar` | Baixa relatórios em CSV ou PDF |
| `atendimentos.visualizar` | Acessa a tela e a API de atendimentos |
| `imoveis.visualizar` | Necessária para relatórios de imóveis e bloco de imóveis do dashboard |
| `clientes.visualizar` | Necessária para o relatório de clientes e bloco de clientes |
| `corretores.visualizar` | Necessária para o bloco de corretores do dashboard |

O dashboard monta apenas os blocos permitidos. Se o usuário não possui uma permissão de
módulo, o bloco correspondente é omitido da resposta e a interface não o renderiza. Os
relatórios de imóveis exigem `imoveis.visualizar`; o relatório de clientes exige
`clientes.visualizar`; o relatório de atendimentos usa `atendimentos.visualizar`.

## Visibilidade

- Imóveis: `acessoService.filtroVisibilidade(usuarioId, 'imovel', 'i', 0)`.
- Clientes e atendimentos: `acessoService.filtroVisibilidade(usuarioId, 'cliente', 'cl', 0)`.
- Administradores enxergam todos os registros. Usuários operacionais seguem a regra
  `imoveis.visibilidade`/`clientes.visibilidade` (`todos` ou `vinculados`) e as exceções
  individuais por registro, nas quais a negação prevalece.
- A visibilidade é reaplicada em toda consulta, inclusive nas exportações e na listagem
  de atendimentos. Nenhum filtro é aplicado apenas na interface.

## Dashboard

`GET /api/dashboard` responde com `Cache-Control: no-store`. A resposta inclui
`geradoEm` (ISO 8601) e `periodoDias` (30) e apenas os blocos permitidos:

```json
{
  "geradoEm": "2026-11-19T12:00:00.000Z",
  "periodoDias": 30,
  "imoveis": {
    "total": 42,
    "disponiveis": 25,
    "reservados": 4,
    "vendidos": 8,
    "alugados": 3,
    "inativos": 2,
    "porSituacao": [{ "chave": "disponivel", "rotulo": "Disponível", "total": 25 }],
    "porFinalidade": [{ "chave": "venda", "rotulo": "Venda", "total": 30 }]
  },
  "corretores": { "ativos": 6, "total": 8 },
  "clientes": {
    "total": 120,
    "novos30Dias": 14,
    "serieMensal": [{ "mes": "2026-06", "rotulo": "Jun/26", "total": 9 }]
  },
  "atendimentos": {
    "total": 310,
    "ultimos30Dias": 38,
    "agendados": 12,
    "serieMensal": [{ "mes": "2026-06", "rotulo": "Jun/26", "total": 20 }],
    "recentes": [
      {
        "id": 1,
        "dataAtendimento": "2026-11-19T12:00:00.000Z",
        "tipo": "visita",
        "status": "realizado",
        "descricao": "Visita ao imóvel",
        "cliente": "Maria Silva",
        "corretor": "João Souza",
        "imovel": { "codigo": "IM-001", "titulo": "Apartamento Centro" }
      }
    ]
  }
}
```

As séries mensais sempre possuem seis meses, incluindo meses sem movimento (total zero).
A interface exibe cards de indicadores, barras por situação/finalidade, colunas de
atendimentos e clientes por mês, atividade recente, atalhos e o status real da API via
`GET /api/health`.

## Catálogo de relatórios

`GET /api/relatorios` retorna os cinco relatórios disponíveis:

| ID | Título | Conteúdo |
| --- | --- | --- |
| `imoveis-situacao` | Imóveis por situação | Quantidade, participação e valores médios por situação |
| `imoveis-finalidade` | Imóveis por finalidade | Quantidade, participação e valores médios por finalidade |
| `imoveis-corretor` | Imóveis por corretor | Total, disponíveis, vendidos e alugados por corretor |
| `clientes-corretor` | Clientes por corretor | Clientes, novos em 30 dias e atendimentos por corretor |
| `atendimentos` | Histórico de atendimentos | Data, cliente, corretor, imóvel, tipo, status e descrição |

`GET /api/relatorios/opcoes` retorna os corretores disponíveis para o filtro. Para
administradores, lista todos os corretores ativos; para os demais, apenas o corretor
vinculado à própria conta.

`GET /api/relatorios/:relatorio` retorna:

- `relatorio.id`, `titulo`, `descricao` e `geradoEm`;
- `filtros`: descrição legível dos filtros aplicados;
- `colunas`: chave, rótulo, formato (`texto`, `inteiro`, `percentual`, `moeda`,
  `datahora`) e largura sugerida;
- `linhas`: dados já formatados para exibição/exportação;
- `resumo`: pares `label`/`valor` para os cards de resumo;
- `total`: quantidade de linhas ou de registros, conforme o relatório.

### Filtros

| Filtro | Formato | Aplicação |
| --- | --- | --- |
| `inicio` | `YYYY-MM-DD` | Data inicial (inclusiva) |
| `fim` | `YYYY-MM-DD` | Data final (inclusiva) |
| `corretor` | id numérico | Corretor responsável |
| `finalidade` | `venda` ou `aluguel` | Imóveis e clientes |
| `tipo` | `ligacao`, `whatsapp`, `email`, `visita`, `reuniao`, `outro` | Atendimentos |
| `status` | `agendado`, `realizado`, `cancelado` | Atendimentos |

Datas fora do formato, datas inexistentes e períodos com início posterior ao fim
retornam `422 VALIDATION_ERROR`. Relatório desconhecido retorna `404 REPORT_NOT_FOUND`.
O período é aplicado à data de criação de imóveis/clientes e à data do atendimento no
relatório de atendimentos.

## Atendimentos

`GET /api/atendimentos` lista os atendimentos visíveis com paginação:

- `busca`: cliente, corretor, código/título do imóvel ou descrição;
- `tipo`, `status`, `corretor`, `inicio` e `fim`;
- `pagina` (padrão 1) e `limite` (padrão 20, máximo 100).

A resposta contém `atendimentos`, `total`, `pagina`, `limite` e `totalPaginas`. Cada item
inclui cliente, corretor e, quando houver, o imóvel relacionado. O registro de novos
atendimentos continua sendo feito no detalhe do cliente (`POST
/api/clientes/:id/atendimentos`).

## Exportação

`GET /api/relatorios/:relatorio/exportacao?formato=csv|pdf` reaplica todos os filtros e a
visibilidade, exige `relatorios.exportar` e responde como download
(`Content-Disposition: attachment`).

- **CSV:** `text/csv; charset=utf-8`, separador `;`, BOM UTF-8 e todos os campos entre
  aspas, preservando acentos e abrindo corretamente no Excel/LibreOffice.
- **PDF:** `application/pdf`, A4 retrato, fonte Helvetica com `WinAnsiEncoding`, cabeçalho
  com título, descrição, data de geração e filtros, cards de resumo, tabela com cabeçalho
  repetido e paginação automática.
- Formato diferente de `csv` ou `pdf` retorna `422 VALIDATION_ERROR`.
- Sem `relatorios.exportar`, a resposta é `403 FORBIDDEN`.

A geração não usa bibliotecas externas: `src/utils/export.js` monta o CSV e um PDF válido
com objetos, páginas, fontes e tabela de referência cruzada.

## Interface

- `#/dashboard`: cards de imóveis, corretores, clientes e atendimentos; barras por
  situação e finalidade; colunas dos últimos seis meses; atividade recente; saúde da API;
  atalhos para os módulos. Enquanto carrega, usa skeletons.
- `#/relatorios`: filtros de período, corretor, finalidade, tipo e status; cartões dos
  cinco relatórios; resultado com resumo, metadados e tabela; botões CSV e PDF.
- `#/atendimentos`: busca, filtros de tipo/status, período e paginação sobre a API real.
- A interface apenas oculta ações sem permissão; o backend sempre revalida.
- Em telas menores, gráficos, filtros e tabelas se reorganizam e a tabela de atendimentos
  rola horizontalmente.

## Arquivos principais

- `src/models/relatorio.model.js`: consultas agregadas e filtros.
- `src/services/relatorio.service.js`: dashboard, catálogo, relatórios e exportação.
- `src/services/atendimento.service.js`: validação e listagem de atendimentos.
- `src/utils/export.js`: geração de CSV e PDF.
- `src/controllers/relatorio.controller.js` e `src/controllers/atendimento.controller.js`.
- `src/routes/dashboard.routes.js`, `relatorios.routes.js` e `atendimentos.routes.js`.
- `public/js/views/dashboard.js`, `relatorios.js` e `atendimentos.js`.
- `public/css/pages.css`: cards, gráficos, skeletons, atividade, filtros e relatórios.

## Validação

`tests/relatorios.test.js` cobre autenticação, indicadores, permissões, catálogo, opções,
os cinco relatórios, filtros válidos e inválidos, visibilidade `vinculados`, paginação de
atendimentos, exportação CSV/PDF e bloqueio de exportação/consulta sem permissão. A suíte
completa é executada com `npm test`.
