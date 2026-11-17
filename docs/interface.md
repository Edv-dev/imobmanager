# Interface e identidade visual

Documentação da etapa 03 do ImobManager: sistema visual, componentes reutilizáveis,
estrutura do frontend e critérios de responsividade e acessibilidade. As seções afetadas
pela etapa 04 foram atualizadas para refletir a autenticação real; os fluxos de segurança
estão em [autenticacao.md](autenticacao.md).

## Objetivo da etapa

Construir a interface visual completa do sistema, integrada apenas aos endpoints já
existentes na etapa 03 (naquele momento, `/api/health`), sem simular autenticação ou
autorização.

> **Atualização da etapa 04:** a tela de login passou a autenticar de verdade, a área
> interna exige sessão válida e a interface consome `GET /api/auth/session`. A sessão de
> pré-visualização, o banner e o chip de "Prévia" foram removidos. O detalhamento dos
> fluxos de autenticação está em [autenticacao.md](autenticacao.md).

## Identidade visual

| Token | Valor | Uso |
| --- | --- | --- |
| Azul-marinho | `#14283F` | Marca, menu lateral, títulos e ações primárias |
| Dourado | `#C5A66A` | Detalhes, ícones, estados ativos e destaques |
| Cinza claro | `#F3F4F6` | Fundo geral das telas internas |
| Branco | `#FFFFFF` | Cartões, tabelas e superfícies |
| Texto principal | `#1B2A3A` | Conteúdo |
| Texto secundário | `#667085` | Apoio, legendas e metadados |

- Tipografia de interface: `Segoe UI`, `Helvetica Neue`, Arial, sans-serif.
- Tipografia de marca (wordmark e títulos do login): Georgia, Times New Roman, serif.
- Raios: 6 px, 10 px e 16 px; sombras discretas em três níveis.
- Os tokens ficam em `public/css/base.css` no seletor `:root`.

## Estrutura do frontend

```text
public/
├── index.html              # tela de login
├── app.html                # shell da aplicação (SPA por hash)
├── recuperar-senha.html    # solicitação e redefinição de senha
├── assets/
│   └── favicon.svg         # marca IM em azul-marinho e dourado
├── css/
│   ├── base.css            # tokens, reset, tipografia e utilitários
│   ├── layout.css          # login, shell, sidebar, header, responsividade
│   ├── components.css      # botões, formulários, tabelas, modais, toasts etc.
│   └── pages.css           # dashboard, relatórios, administração e ajustes
└── js/
    ├── login.js            # login real, erros e status dos serviços
    ├── recuperar-senha.js  # solicitação e redefinição de senha
    ├── app.js              # bootstrap da SPA e tabela de rotas
    ├── core/
    │   ├── api.js          # fetch da API, erro padronizado e CSRF
    │   ├── router.js       # rotas por hash e verificação visual de permissão
    │   ├── session.js      # sessão autenticada e permissões efetivas
    │   └── utils.js        # escape, iniciais, datas e uptime
    ├── components/
    │   ├── icons.js        # ícones SVG inline
    │   ├── shell.js        # menu lateral, cabeçalho, banner e logout
    │   ├── page.js         # cabeçalho padrão das páginas
    │   ├── module-view.js  # fábrica das telas de módulo (tabela + filtros + formulário)
    │   ├── toolbar.js      # busca e filtros
    │   ├── table.js        # tabela e paginação
    │   ├── form.js         # formulários em modal
    │   ├── modal.js        # modal e confirmação
    │   ├── toast.js        # alertas de sucesso, erro, aviso e informação
    │   └── empty-state.js  # estado vazio reutilizável
    └── views/
        ├── dashboard.js
        ├── imoveis.js
        ├── corretores.js
        ├── clientes.js
        ├── atendimentos.js
        ├── relatorios.js
        └── administracao.js
```

O frontend usa JavaScript modular nativo (`type="module"`), sem frameworks. Não há etapa
de build: os arquivos são servidos diretamente pelo Express.

## Telas

### Login (`/`)

- Layout dividido: painel institucional azul-marinho e painel de acesso claro.
- Formulário com validação nativa, alternância de visibilidade da senha e erro genérico
  para credenciais inválidas.
- Login real via `POST /api/auth/login`, com redirecionamento para `/app.html` e aviso de
  sessão expirada ou senha redefinida.
- Link "Esqueci minha senha" para `/recuperar-senha.html`.
- Indicador de serviços consulta `/api/health` em tempo real.
- Em telas menores, o painel institucional vira uma faixa compacta com a marca.

### Recuperação de senha (`/recuperar-senha.html`)

- Fluxo de solicitação por e-mail com resposta sempre genérica.
- Com `?token=` na URL, exibe o formulário de nova senha com confirmação e política
  mínima de 12 caracteres.
- Após o sucesso, informa que as sessões foram encerradas e leva ao login.

### Shell (`/app.html`)

- Sidebar fixa com Dashboard, Imóveis, Corretores, Clientes, Atendimentos, Relatórios
  e Administração.
- A opção Administração é exibida conforme a permissão `administracao.visualizar`
  carregada na sessão autenticada. Essa verificação é visual; a autorização definitiva
  é aplicada no backend.
- Cabeçalho com contexto da página, identificação do usuário (nome e perfil) e avatar
  com iniciais.
- Em telas até 1024 px, a sidebar vira drawer com overlay, botão hambúrguer, fechamento
  por clique fora, tecla Escape ou seleção de um item.
- Logout abre um modal de confirmação, chama `POST /api/auth/logout` com CSRF e retorna
  à tela de login.

### Dashboard (`#/dashboard`)

- Quatro cards de indicadores com valores "—" e a etapa em que cada dado será alimentado.
- Card de atividade recente com estado vazio.
- Status do sistema integrado a `/api/health`: banco, API, uptime e ambiente, com
  botão "Verificar novamente".
- Atalhos rápidos para os módulos.

### Módulos operacionais

- Imóveis, Corretores, Clientes e Atendimentos compartilham a fábrica `module-view.js`:
  cabeçalho, busca, filtros, tabela com cabeçalho, estado vazio e paginação.
- O botão de cadastro abre um modal com formulário em seções, validação nativa e aviso
  de que a persistência ocorre na etapa correspondente.
- Nenhum registro fictício é apresentado como dado real.

### Relatórios (`#/relatorios`)

- Filtros por período, corretor e tipo.
- Seis cartões de relatórios com botão de geração; a ação informa que os dados reais
  entram na etapa 09.
- Textos indicam PDF e CSV como formatos previstos.

### Administração (`#/administracao`)

- Perfis Administrador e Corretor com listas de acesso.
- Explicação da precedência: permissão individual → perfil → padrão do sistema.
- Estado vazio para gestão de usuários (etapa 05).
- Formulário visual de visibilidade de imóveis e clientes, com valores iniciais
  documentados. A gravação será conectada na etapa 05.

## Componentes

- **Botões:** primário, acento dourado, contorno (ghost), perigo e tamanho pequeno.
- **Formulários:** campos de texto, e-mail, telefone, número, data, seleção, textarea,
  checkbox e grupo de input com ícone/ação.
- **Tabelas:** cabeçalho fixo visual, alinhamento à direita, rolagem horizontal e
  paginação estática enquanto não há dados.
- **Modais:** `<dialog>` nativo com foco inicial no primeiro campo, fechamento por
  Escape/backdrop/botão e limpeza automática ao trocar de rota.
- **Toasts:** sucesso, erro, aviso e informação, com limite de quatro mensagens e
  fechamento manual ou automático.
- **Estados vazios:** ícone, título, texto explicativo e ação opcional.

## Responsividade

Validado com Firefox headless nas resoluções 1440×900 (desktop), 820×1180 (tablet) e
390×844 (celular), além de 1440×1000/1200 para telas internas.

- `1200 px`: indicadores em duas colunas.
- `1100 px`: dashboard e permissões em uma coluna; relatórios em duas; filtros em duas.
- `1024 px`: sidebar em drawer; cabeçalho e conteúdo com menos padding.
- `960 px`: login em coluna única com faixa de marca compacta.
- `720 px`: texto do usuário oculto no cabeçalho e conteúdo em coluna única.
- `640 px`: indicadores, relatórios e filtros em uma coluna; formulários em uma coluna.
- `560 px`: paddings reduzidos e contexto do cabeçalho simplificado.

## Acessibilidade

- Link "pular para o conteúdo" nas duas páginas.
- Foco visível customizado; títulos focados programaticamente não exibem contorno.
- Rótulos associados aos campos, textos alternativos e ícones com `aria-hidden`.
- Modais com `aria-labelledby`, foco gerenciado e fechamento por Escape.
- Áreas de status com `role="status"`/`role="alert"`.
- Menu lateral com `aria-current="page"`.
- Respeito a `prefers-reduced-motion`.

## Integração com as próximas etapas

- A sessão autenticada é carregada por `core/session.js` em `GET /api/auth/session`, com
  permissões efetivas e token CSRF mantido em memória.
- A verificação visual de permissões no roteador continua existindo para usabilidade;
  a decisão final é sempre do backend.
- Os formulários e filtros já possuem estrutura para receber chamadas reais de API.
- A gestão de usuários e permissões individuais será implementada na etapa 05.
- Os indicadores do dashboard e os relatórios serão alimentados por dados reais
  (etapa 09).

## Validação executada

- `npm test`: 23 testes aprovados, incluindo `tests/ui.test.js` e `tests/auth.test.js`.
- Serviços estáticos e módulos JavaScript retornando `200`.
- Login, shell, dashboard, módulos, relatórios e administração verificados em três
  resoluções, incluindo abertura de modal, menu mobile, toasts e status real da API.
