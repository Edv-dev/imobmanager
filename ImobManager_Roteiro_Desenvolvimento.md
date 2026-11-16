# ImobManager --- Roteiro de desenvolvimento com IA

**Projeto:** ImobManager\
**Objetivo:** sistema web de gestão para uma única imobiliária\
**Identidade visual:** corporativa e elegante\
**Frontend:** HTML5, CSS3 e JavaScript\
**Backend:** Node.js + Express\
**Banco de dados:** PostgreSQL\
**Arquitetura:** cliente-servidor com API REST\
**Interface:** web responsiva\
**Controle de acesso:** RBAC, permissões gerais e exceções individuais

------------------------------------------------------------------------

## Como utilizar este documento

1.  Envie os prompts individualmente à IA de programação.
2.  Execute e valide cada etapa antes de avançar.
3.  Mantenha o projeto sob controle de versão com Git.
4.  Faça backup antes de alterações estruturais.
5.  Não considere uma etapa concluída sem executar os testes
    correspondentes.

A IA deverá trabalhar incrementalmente, preservar funcionalidades já
validadas e informar os arquivos criados ou modificados.

------------------------------------------------------------------------

# 1. Ordem de desenvolvimento

  Etapa   Entrega
  ------- -------------------------------
  01      Planejamento e arquitetura
  02      Modelagem do banco de dados
  03      Identidade visual e interface
  04      Autenticação e segurança
  05      Administração e permissões
  06      Gestão de corretores
  07      Gestão de imóveis
  08      Gestão de clientes
  09      Dashboard e relatórios
  10      Auditoria e LGPD
  11      Testes e implantação

------------------------------------------------------------------------

# Prompt 01 --- Arquitetura e estrutura inicial

``` text
Atue como arquiteto de software e desenvolvedor full-stack sênior.

Vamos desenvolver uma aplicação web chamada ImobManager, destinada à gestão de uma única imobiliária.

OBJETIVO:
Criar uma plataforma para gerenciamento de imóveis, corretores, clientes e administração.

TECNOLOGIAS OBRIGATÓRIAS:
- Frontend: HTML5, CSS3 e JavaScript.
- Backend: Node.js com Express.
- Banco de dados: PostgreSQL.
- API: REST.
- Comunicação: JSON via HTTPS.
- Versionamento: Git.

IDENTIDADE VISUAL:
- Azul-marinho: #14283F.
- Dourado: #C5A66A.
- Cinza claro: #F3F4F6.
- Branco: #FFFFFF.
- Estilo corporativo, elegante e minimalista.

REQUISITOS:
1. Arquitetura cliente-servidor.
2. Separação entre frontend, backend e banco de dados.
3. Código modular e reutilizável.
4. Organização por controllers, services, models, routes e middlewares.
5. Preparação para autenticação e controle de permissões.
6. Interface responsiva para computadores e celulares.
7. Configuração de variáveis de ambiente.
8. Preparação para testes automatizados.

TAREFAS:
- Apresente a arquitetura proposta.
- Crie a estrutura completa de diretórios.
- Inicialize o projeto Node.js.
- Configure o Express.
- Configure a conexão com PostgreSQL.
- Crie um endpoint de verificação de saúde da aplicação.
- Documente como instalar e executar o projeto.

REGRAS:
Não implemente todos os módulos de uma vez.
Não utilize dados fictícios como se fossem dados reais.
Não sobrescreva funcionalidades existentes.
Explique cada arquivo criado.

Ao finalizar, apresente os comandos de instalação, inicialização e os testes realizados.
```

# Prompt 02 --- Modelagem do banco de dados

``` text
Continue o desenvolvimento do ImobManager a partir da estrutura já criada.

Implemente a modelagem inicial do banco de dados PostgreSQL.

TABELAS:
1. usuarios
2. perfis
3. permissoes
4. perfis_permissoes
5. permissoes_usuarios
6. corretores
7. clientes
8. imoveis
9. imagens_imoveis
10. imoveis_corretores
11. clientes_corretores
12. atendimentos
13. configuracoes
14. auditoria

REQUISITOS:
- Definir chaves primárias e estrangeiras.
- Criar índices adequados.
- Utilizar timestamps.
- Criar migrations.
- Definir integridade referencial.
- Preparar relacionamentos entre usuários, corretores, clientes e imóveis.
- Implementar exclusão lógica quando apropriado.
- Evitar duplicidade de registros.

O administrador deve possuir acesso administrativo independente dos corretores.

IMPORTANTE:
As permissões gerais e individuais devem ser armazenadas separadamente.

Crie um diagrama ER, os arquivos SQL ou migrations e os scripts para inicializar o banco.

Ao finalizar, execute testes de integridade e apresente a estrutura criada.
```

# Prompt 03 --- Interface e identidade visual

``` text
Desenvolva a interface visual do ImobManager.

IDENTIDADE:
Sistema corporativo e elegante, utilizando:
- Azul-marinho #14283F.
- Dourado #C5A66A.
- Cinza #F3F4F6.
- Branco #FFFFFF.

REQUISITOS VISUAIS:
1. Tela de login.
2. Menu lateral com navegação.
3. Cabeçalho com identificação do usuário.
4. Dashboard principal.
5. Cards de indicadores.
6. Tabelas com paginação.
7. Formulários padronizados.
8. Modais de confirmação.
9. Alertas de sucesso e erro.
10. Layout responsivo.

MENU PRINCIPAL:
- Dashboard.
- Imóveis.
- Corretores.
- Clientes.
- Atendimentos.
- Relatórios.
- Administração.

A opção Administração deverá aparecer somente para usuários autorizados.

Utilize componentes reutilizáveis, CSS organizado e JavaScript modular.

Não utilize frameworks frontend pesados sem necessidade.

Nesta etapa, priorize a construção visual e a integração com os endpoints existentes, sem simular segurança apenas ocultando elementos da interface.

Apresente todas as telas e valide o funcionamento em diferentes resoluções.
```

# Prompt 04 --- Autenticação e segurança

``` text
Implemente o sistema de autenticação do ImobManager.

FUNCIONALIDADES:
1. Login por usuário e senha.
2. Logout.
3. Controle de sessão.
4. Recuperação de senha por fluxo seguro.
5. Bloqueio temporário após tentativas excessivas.
6. Verificação de usuários ativos.
7. Proteção de rotas.
8. Middleware de autenticação.
9. Middleware de autorização.
10. Registro de eventos de autenticação.

SEGURANÇA:
- Utilizar Argon2id ou bcrypt para senhas.
- Utilizar cookies HttpOnly, Secure e SameSite quando aplicável.
- Implementar proteção CSRF conforme o mecanismo de sessão adotado.
- Utilizar Helmet.
- Validar entradas.
- Utilizar consultas parametrizadas.
- Implementar rate limiting.
- Nunca armazenar senhas em texto puro.
- Não expor informações administrativas na resposta de endpoints não autorizados.

Criar usuários com os perfis:
- Administrador.
- Corretor.

O primeiro administrador deverá ser criado por procedimento seguro de inicialização, sem credenciais padrão públicas.

Teste acessos autorizados e não autorizados.

Não prossiga para outros módulos antes de validar a autenticação.
```

# Prompt 05 --- Administração e controle de permissões

``` text
Implemente o módulo administrativo do ImobManager.

O administrador deverá controlar os usuários, os corretores e as permissões de acesso.

FUNCIONALIDADES:
1. Cadastro de usuários.
2. Edição de usuários.
3. Ativação e desativação.
4. Cadastro de corretores vinculados a usuários.
5. Configuração de permissões gerais.
6. Configuração de permissões individuais.
7. Histórico de alterações.

CONFIGURAÇÕES DE VISIBILIDADE:

IMÓVEIS:
- Todos os corretores visualizam todos os imóveis.
- Cada corretor visualiza somente seus imóveis vinculados.

CLIENTES:
- Todos os corretores visualizam todos os clientes.
- Cada corretor visualiza somente seus clientes vinculados.

O administrador deverá poder combinar as duas configurações.

PERMISSÕES INDIVIDUAIS:
Permitir que o administrador configure exceções para cada corretor, inclusive permitindo acesso a determinados imóveis ou clientes de outros corretores.

REGRAS:
- Permissões individuais devem ter prioridade quando explicitamente configuradas.
- O administrador pode alterar as regras a qualquer momento.
- A alteração deve ser registrada na auditoria.
- As regras devem ser verificadas no backend.
- Nenhuma informação restrita poderá ser obtida por acesso direto à API.
- Implementar testes de isolamento entre corretores.
- Impedir que um corretor altere suas próprias permissões.

Crie uma interface administrativa clara e funcional.

Documente a precedência entre permissões gerais, individuais e exceções de acesso.
```

# Prompt 06 --- Cadastro de corretores

``` text
Desenvolva o módulo de gerenciamento de corretores do ImobManager.

CAMPOS:
- Nome completo.
- CPF.
- CRECI.
- Telefone.
- WhatsApp.
- E-mail.
- Endereço.
- Data de cadastro.
- Situação.
- Usuário vinculado.

FUNCIONALIDADES:
- Cadastrar.
- Editar.
- Consultar.
- Pesquisar.
- Filtrar.
- Ativar.
- Desativar.
- Consultar imóveis vinculados.
- Consultar clientes vinculados.

REQUISITOS:
- Validar CPF.
- Validar e-mail.
- Evitar cadastros duplicados.
- Controlar acesso conforme perfil.
- Registrar alterações na auditoria.
- Respeitar as configurações de visibilidade definidas pelo administrador.

Criar interface com listagem, formulário e detalhes do corretor.

Realizar testes completos de CRUD e autorização.
```

# Prompt 07 --- Cadastro de imóveis

``` text
Desenvolva o módulo de gerenciamento de imóveis do ImobManager.

CAMPOS:

IDENTIFICAÇÃO:
- Código interno.
- Título.
- Descrição.
- Tipo de imóvel.
- Finalidade: venda ou aluguel.

LOCALIZAÇÃO:
- CEP.
- Estado.
- Cidade.
- Bairro.
- Logradouro.
- Número.
- Complemento.

CARACTERÍSTICAS:
- Área total.
- Área construída.
- Quantidade de quartos.
- Banheiros.
- Suítes.
- Vagas de garagem.
- Mobiliado.
- Características adicionais.

COMERCIAL:
- Valor de venda.
- Valor de aluguel.
- Condomínio.
- IPTU.
- Situação do imóvel.

RELACIONAMENTOS:
- Um ou mais corretores responsáveis, conforme regra administrativa.
- Imagens vinculadas.
- Histórico de alterações.

FUNCIONALIDADES:
- Cadastro.
- Edição.
- Exclusão lógica.
- Upload de imagens.
- Pesquisa por código.
- Filtros por cidade, bairro, tipo, finalidade e preço.
- Controle de disponibilidade.
- Visualização detalhada.

SEGURANÇA:
- Respeitar as permissões de visualização e edição.
- Validar arquivos enviados.
- Restringir tamanho e quantidade de imagens.
- Proteger o armazenamento dos arquivos.

Implemente API, banco, frontend e testes.
```

# Prompt 08 --- Cadastro de clientes

``` text
Desenvolva o módulo de gerenciamento de clientes do ImobManager.

CAMPOS:
- Nome completo.
- CPF.
- Telefone.
- WhatsApp.
- E-mail.
- Endereço.
- Tipo de interesse.
- Finalidade desejada.
- Faixa de preço.
- Localização desejada.
- Observações.

FUNCIONALIDADES:
- Cadastrar clientes.
- Editar dados.
- Pesquisar.
- Filtrar.
- Vincular clientes a corretores.
- Vincular clientes a imóveis de interesse.
- Registrar histórico de atendimento.
- Consultar atividades anteriores.

REGRAS:
- Respeitar a visibilidade definida pelo administrador.
- Evitar duplicidade de CPF.
- Proteger dados pessoais.
- Registrar alterações.
- Controlar acesso aos registros.

Implemente frontend, backend, banco de dados e testes de autorização.
```

# Prompt 09 --- Dashboard e relatórios

``` text
Desenvolva o dashboard e os relatórios do ImobManager.

INDICADORES:
- Total de imóveis.
- Imóveis disponíveis.
- Imóveis vendidos.
- Imóveis alugados.
- Total de corretores ativos.
- Total de clientes cadastrados.
- Novos clientes.
- Atendimentos registrados.

DASHBOARD ADMINISTRATIVO:
Apresentar visão geral da imobiliária, gráficos, indicadores e movimentações.

DASHBOARD DO CORRETOR:
Apresentar somente informações que o usuário tenha permissão para consultar.

RELATÓRIOS:
- Imóveis por situação.
- Imóveis por finalidade.
- Imóveis por corretor.
- Clientes por corretor.
- Histórico de atendimentos.

Implementar filtros por período e exportação PDF e CSV.

Todos os indicadores devem ser calculados a partir dos dados reais do banco.

Respeitar integralmente as permissões de acesso.
```

# Prompt 10 --- Auditoria e LGPD

``` text
Implemente o módulo de auditoria e adequação à LGPD no ImobManager.

REGISTRAR:
- Login e logout.
- Tentativas de acesso negadas.
- Criação de registros.
- Alterações.
- Exclusões lógicas.
- Alterações de permissões.
- Operações administrativas.

CADA EVENTO DEVE CONTER:
- Usuário responsável.
- Data e horário.
- Tipo de operação.
- Registro afetado.
- Resultado da operação.

REGRAS:
- Os registros de auditoria não podem ser alterados por corretores.
- Não armazenar senhas, tokens ou dados sensíveis desnecessários nos logs.
- Implementar política de retenção.
- Implementar controle de acesso.
- Permitir consulta administrativa.
- Criar procedimentos para atendimento aos direitos dos titulares dos dados.

Documentar as medidas de proteção e os pontos pendentes para conformidade jurídica.
```

# Prompt 11 --- Testes e implantação

``` text
Prepare o ImobManager para implantação em ambiente de produção Linux.

EXECUTAR:
1. Testes unitários.
2. Testes de integração.
3. Testes de API.
4. Testes de autenticação.
5. Testes de permissões.
6. Testes de isolamento entre corretores.
7. Testes de upload de imagens.
8. Testes de responsividade.
9. Testes de segurança.

IMPLANTAÇÃO:
- Configurar ambiente de produção.
- Configurar PostgreSQL.
- Configurar variáveis de ambiente.
- Configurar HTTPS com certificado válido.
- Configurar Nginx como proxy reverso.
- Configurar serviço Node.js com reinicialização automática.
- Configurar backups.
- Configurar logs.
- Documentar atualização e restauração.

CRIAR:
- README.md.
- Guia de instalação.
- Guia de administração.
- Guia de utilização.
- Procedimento de backup e recuperação.

Não declarar o sistema pronto se existirem falhas críticas ou testes essenciais não executados.

Preservar todas as funcionalidades já validadas.
```

------------------------------------------------------------------------

# 2. Prompt permanente de controle de qualidade

Utilize este prompt depois de cada etapa, antes de avançar.

``` text
Atue como engenheiro de software responsável pela revisão técnica do ImobManager.

Analise o código desenvolvido até o momento.

Verifique:
1. Integridade da arquitetura.
2. Funcionamento dos módulos.
3. Integridade do banco de dados.
4. Segurança da API.
5. Controle de autenticação.
6. Controle de permissões.
7. Possíveis erros de programação.
8. Duplicidade de código.
9. Compatibilidade entre frontend e backend.
10. Regressões em funcionalidades anteriormente implementadas.

Execute os testes possíveis.

REGRAS:
- Não reescrever partes funcionais sem necessidade.
- Não remover funcionalidades existentes.
- Corrigir problemas encontrados.
- Documentar cada alteração.
- Informar testes aprovados e reprovados.
- Não afirmar que um teste foi executado se não foi.

Ao final, apresente um relatório de validação e indique se o projeto está apto para avançar à próxima etapa.
```

# 3. Regras permanentes do projeto

Estas instruções devem acompanhar todos os prompts enviados à IA de
programação.

``` text
REGRAS PERMANENTES DO PROJETO IMOBMANAGER

1. Preservar todas as funcionalidades já implementadas e validadas.
2. Não substituir arquivos completos sem analisar suas dependências.
3. Não alterar a arquitetura sem justificar tecnicamente.
4. Trabalhar incrementalmente.
5. Comentar códigos complexos.
6. Manter frontend, backend e banco organizados.
7. Validar todas as operações no servidor.
8. Nunca confiar exclusivamente nas permissões da interface.
9. Não utilizar credenciais padrão inseguras.
10. Manter documentação atualizada.
11. Executar testes após cada implementação.
12. Informar todos os arquivos criados ou modificados.
13. Não avançar automaticamente para a próxima etapa.
14. Sempre apresentar instruções para executar e validar a versão atual.
15. Utilizar Git para registrar cada versão estável.
```

------------------------------------------------------------------------

# 4. Estratégia de versões

  Versão   Funcionalidades
  -------- --------------------------------------------------------
  0.1      Estrutura, banco e autenticação
  0.2      Administração e permissões
  0.3      Gestão de corretores
  0.4      Gestão de imóveis e imagens
  0.5      Gestão de clientes e atendimentos
  0.6      Dashboard e relatórios
  1.0      Segurança revisada, testes, documentação e implantação

## 5. Recomendações técnicas

-   **Git:** criar uma versão de segurança antes de cada etapa
    importante.
-   **PostgreSQL:** utilizar migrations para controlar as mudanças no
    banco.
-   **Testes de permissões:** testar desde cedo se um corretor consegue
    acessar dados de outro indevidamente.
-   **Arquitetura:** como o sistema será destinado inicialmente a uma
    única imobiliária, não é necessário implementar multiempresa nesta
    primeira versão. A estrutura poderá evoluir futuramente para SaaS.

## 6. Critério de conclusão

Uma etapa só deverá ser considerada concluída quando:

-   O código estiver implementado.
-   A aplicação iniciar sem erros.
-   Os testes previstos forem executados.
-   As permissões estiverem validadas quando aplicável.
-   A documentação estiver atualizada.
-   As funcionalidades anteriores continuarem funcionando.

**Primeiro passo:** executar o Prompt 01, criar a estrutura do
ImobManager e validar o ambiente antes de implementar qualquer módulo de
negócio.
