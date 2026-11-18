# Interface e identidade visual

Documentação da etapa 03 do ImobManager: sistema visual, componentes reutilizáveis,
estrutura do frontend e critérios de responsividade e acessibilidade. As seções afetadas
pela etapa 04 foram atualizadas para refletir a autenticação real; a etapa 05 trouxe a
área administrativa, a etapa 06 ativou o módulo de corretores, a etapa 07 ativou o módulo
de imóveis e a etapa 08 ativou o módulo de clientes com atendimentos. Os fluxos de
segurança estão em [autenticacao.md](autenticacao.md).

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

### Corretores (`#/corretores`)

- Listagem real com busca por nome, CPF, CRECI ou e-mail, filtro por situação e
  paginação, com estados de carregamento, erro e vazio.
- Criação vinculada a um usuário operacional disponível; edição dos dados profissionais
  e alteração de situação conforme permissão.
- Detalhe com conta vinculada, imóveis e clientes filtrados pela visibilidade do ator.
- Ações de editar, ativar e desativar aparecem apenas com as permissões correspondentes;
  a desativação informa a revogação das sessões da conta.
- O módulo usa a API real e não compartilha mais a fábrica `module-view.js`.

### Imóveis (`#/imoveis`)

- Listagem real com busca por código, título, cidade ou bairro, filtros por tipo,
  finalidade e situação, faixa de valor e paginação, com estados de carregamento, erro
  e vazio.
- Painel de filtros avançados com cidade, bairro e valores mínimo e máximo.
- Tabela com miniatura da imagem principal, código, título, localização, tipo,
  finalidade, valor, situação e corretores responsáveis.
- Formulário em seções (identificação, endereço, características, valores, situação e
  corretores), com seletor de responsáveis e indicação do principal para administradores.
- Detalhe com dados completos, galeria de imagens, vínculos e histórico de auditoria.
- Galeria com envio múltiplo, definição da principal, reordenação e remoção conforme
  `imoveis.imagens.gerenciar`; as imagens são carregadas por rota autenticada.
- Alteração de situação e exclusão lógica com confirmação.
- O módulo usa a API real e não compartilha mais a fábrica `module-view.js`.

### Clientes (`#/clientes`)

- Listagem real com busca por nome, CPF, e-mail, telefone, WhatsApp e localização,
  filtros por tipo de interesse e finalidade, com paginação e estados de carregamento,
  erro e vazio.
- Tabela com identificação, contato, interesse, localização e corretor responsável.
- Formulário em seções (identificação, interesse, corretores e imóveis de interesse), com
  seletor pesquisável de imóveis e vínculo de responsáveis para administradores.
- Detalhe com contato, interesse, corretores, imóveis de interesse, atendimentos e
  histórico de auditoria.
- Modal de registro de atendimento com tipo, status, data, corretor, imóvel, descrição e
  observações; a seção de atendimentos depende de `atendimentos.visualizar`.
- Exclusão lógica com confirmação.
- O módulo usa a API real e não compartilha mais a fábrica `module-view.js`.

### Módulos operacionais pendentes

- Atendimentos continua usando a fábrica `module-view.js` como tela informativa;
  nesta etapa, o registro e a consulta ocorrem no detalhe do cliente.
- Relatórios permanecem informativos até a etapa 09.
- Nenhum registro fictício é apresentado como dado real.

### Relatórios (`#/relatorios`)

- Filtros por período, corretor e tipo.
- Seis cartões de relatórios com botão de geração; a ação informa que os dados reais
  entram na etapa 09.
- Textos indicam PDF e CSV como formatos previstos.

### Administração (`#/administracao`)

- Abas Visão geral, Usuários, Perfis e permissões, Visibilidade e Histórico, exibidas
  conforme as permissões efetivas do usuário.
- Visão geral com contagens reais de contas, administradores, corretores e sessões.
- Usuários: busca, filtros por perfil/status, paginação, criação e edição de conta,
  cadastro de corretor vinculado, ativação/desativação e redefinição de senha.
- Permissões individuais com opções Herdar, Permitir e Negar e indicação do que é
  herdado do perfil; regras essenciais e módulo administrativo são protegidos.
- Perfis: cartões com permissões por módulo e editor completo do catálogo.
- Visibilidade: regra geral para imóveis e clientes e exceções por registro, com filtro
  local, indicação de vínculo e precedência da negação.
- Histórico: consulta paginada da auditoria com busca, tipo de evento, resultado e
  detalhes em JSON.
- Formulários usam modais, validação nativa e mensagens de erro do servidor sem perder
  os dados digitados.

## Componentes

- **Botões:** primário, acento dourado, contorno (ghost), perigo e tamanho pequeno.
- **Formulários:** campos de texto, e-mail, telefone, número, data, seleção, textarea,
  checkbox e grupo de input com ícone/ação.
- **Tabelas:** cabeçalho fixo visual, alinhamento à direita, rolagem horizontal e
  paginação; as telas de corretores, imóveis e clientes usam paginação real e as demais
  mantêm o estado vazio.
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
- A área administrativa, o cadastro de corretores, a gestão de imóveis e a gestão de
  clientes já operam com a API real; a tela isolada de atendimentos e os relatórios
  recebem persistência/dados na etapa 09.
- A matriz de permissões e as exceções por registro são carregadas do backend e aplicadas
  no roteador apenas para usabilidade; o servidor mantém a decisão final.

## Validação executada

- `npm test`: 58 testes aprovados, incluindo `tests/ui.test.js`, `tests/auth.test.js`,
  `tests/admin.test.js`, `tests/corretores.test.js`, `tests/imoveis.test.js` e
  `tests/clientes.test.js`.
- Serviços estáticos e módulos JavaScript retornando `200`.
- Login, shell, dashboard, módulos, relatórios e administração verificados em três
  resoluções, incluindo abertura de modal, menu mobile, toasts e status real da API.
- A tela administrativa é verificada por teste de interface quanto ao uso da API real e
  à presença das áreas de usuários, permissões, visibilidade e histórico. Os módulos de
  corretores, imóveis e clientes são validados pelos testes de API e autorização das
  etapas 06, 07 e 08.
