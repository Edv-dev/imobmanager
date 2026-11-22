# Gestão de imóveis

Etapa 07 — cadastro, consulta, filtros, imagens, situação e vínculo de corretores responsáveis.

## Visão geral

A tela `#/imoveis` exige a permissão `imoveis.visualizar` e opera com a API real. A
listagem oferece busca por código interno, título, cidade e bairro, filtros por tipo,
finalidade e situação, faixa de valor e paginação. Cada registro pode ser consultado,
editado ou excluído conforme as permissões efetivas do usuário.

Campos do imóvel:

- código interno único;
- título e descrição;
- tipo (`apartamento`, `casa`, `terreno`, `comercial`, `rural` ou `outro`);
- finalidade (`venda` ou `aluguel`);
- endereço: CEP, UF, cidade, bairro, logradouro, número e complemento;
- áreas total e construída;
- quartos, banheiros, suítes e vagas de garagem;
- mobiliado e características adicionais;
- valores de venda, aluguel, condomínio e IPTU;
- situação (`disponivel`, `reservado`, `vendido`, `alugado` ou `inativo`);
- corretores vinculados, com um principal opcional.

## Interface

- Cabeçalho com ação **Novo imóvel** para quem possui `imoveis.criar`.
- Busca, filtros principais e painel de filtros avançados (cidade, bairro e faixa de valor).
- Tabela com miniatura da imagem principal, código, título, localização, tipo, finalidade,
  valor, situação e corretores, com paginação e estados de carregamento, erro e vazio.
- Formulário em seções: identificação, endereço, características, valores, situação e
  corretores responsáveis.
- Detalhe com dados completos, galeria de imagens, vínculos e histórico de auditoria.
- Galeria com envio de imagens, definição da principal, reordenação e remoção, disponível
  apenas com `imoveis.imagens.gerenciar`.
- Alteração de situação em modal dedicado, com confirmação e registro de auditoria.
- Exclusão lógica com confirmação.

## API

Base: `/api/imoveis`. Todas as rotas exigem sessão, respondem com
`Cache-Control: no-store` e as mutações exigem `X-CSRF-Token`.

| Método | Rota                                   | Permissão                   |
| ------ | -------------------------------------- | --------------------------- |
| GET    | `/`                                    | `imoveis.visualizar`        |
| GET    | `/corretores-opcoes`                   | `imoveis.visualizar` (somente administradores) |
| GET    | `/:id`                                 | `imoveis.visualizar`        |
| GET    | `/:id/historico`                       | `auditoria.visualizar`      |
| POST   | `/`                                    | `imoveis.criar`             |
| PATCH  | `/:id`                                 | `imoveis.editar`            |
| PATCH  | `/:id/situacao`                        | `imoveis.editar`            |
| DELETE | `/:id`                                 | `imoveis.excluir`           |
| POST   | `/:id/imagens`                         | `imoveis.imagens.gerenciar` |
| PUT    | `/:id/imagens/ordem`                   | `imoveis.imagens.gerenciar` |
| PATCH  | `/:id/imagens/:imagemId/principal`     | `imoveis.imagens.gerenciar` |
| DELETE | `/:id/imagens/:imagemId`               | `imoveis.imagens.gerenciar` |
| GET    | `/:id/imagens/:imagemId/arquivo`       | `imoveis.visualizar`        |

Filtros da listagem: `busca`, `tipo`, `finalidade`, `situacao`, `cidade`, `bairro`,
`valorMin`, `valorMax`, `pagina` e `limite` (máximo de 50). A busca é limitada a 100
caracteres. A faixa de valor usa `COALESCE(valor_venda, valor_aluguel, 0)`.

A criação e a edição recebem os campos do imóvel em camelCase (`codigo`, `titulo`,
`descricao`, `tipo`, `finalidade`, `cep`, `estado`, `cidade`, `bairro`, `logradouro`,
`numero`, `complemento`, `areaTotal`, `areaConstruida`, `quartos`, `banheiros`, `suites`,
`vagasGaragem`, `mobiliado`, `caracteristicas`, `valorVenda`, `valorAluguel`,
`valorCondominio`, `valorIptu`, `situacao`). A edição é parcial: campos ausentes mantêm o
valor atual.

Administradores também enviam `corretores` como lista de identificadores e, opcionalmente,
`corretorPrincipalId` (padrão: primeiro da lista). A rota de situação recebe
`{ "situacao": "..." }`.

As imagens são enviadas como `multipart/form-data` no campo `imagens` (até o limite
configurado por propriedade). Reordenação usa `{ "ids": [1, 2, 3] }`; as demais rotas de
imagem não têm corpo.

## Regras de negócio

- Código interno é normalizado para maiúsculas e aceita letras, números, ponto, hífen,
  barra e sublinhado, com no máximo 40 caracteres.
- Código interno de imóveis não excluídos é único; a violação retorna `CODIGO_IN_USE`.
- Tipo, finalidade e situação são obrigatórios e restritos aos valores previstos.
- A situação inicial padrão é `disponivel`.
- CEP é normalizado para 8 dígitos e UF é validada contra as 27 unidades federativas.
- Áreas, quantidades e valores não podem ser negativos; quartos, banheiros, suítes e vagas
  aceitam inteiros de 0 a 999.
- Características adicionais são normalizadas, sem duplicatas, com até 30 itens de 40
  caracteres cada.
- O corretor que cria o imóvel é automaticamente vinculado como principal.
- Somente administradores alteram vínculos de corretores; corretores comuns editam apenas
  imóveis acessíveis pela visibilidade configurada.
- Um corretor não pode ser vinculado duas vezes ao mesmo imóvel nem ocupar dois vínculos
  principais.
- Imóveis excluídos não aparecem na lista, no detalhe nem nos vínculos de corretores.
- A exclusão é lógica (`excluido_em`); imagens e vínculos permanecem no banco, mas o
  imóvel deixa de aparecer na lista, no detalhe e nas consultas de vínculos.
- O detalhe retorna no máximo 50 eventos de histórico, do mais recente para o mais antigo.

## Imagens

- Formatos aceitos: JPEG, PNG e WebP, validados pelo conteúdo (magic bytes), não apenas
  pela extensão ou pelo `Content-Type` declarado.
- Limites padrão: 5 MB por imagem e 10 imagens por imóvel, configuráveis por
  `UPLOAD_MAX_IMAGE_BYTES` e `UPLOAD_MAX_IMAGES_PER_PROPERTY`.
- Os arquivos são gravados fora de `public/`, em `uploads/imoveis/<id>/<uuid>.<ext>`, e
  servidos apenas pela rota autenticada `GET /:id/imagens/:imagemId/arquivo`.
- A primeira imagem enviada vira principal; ao remover a principal, a próxima na ordem é
  promovida automaticamente.
- A ordenação é refeita em transação e sempre há no máximo uma imagem principal por imóvel.
- A remoção apaga o registro e o arquivo físico; caminhos fora do diretório de uploads são
  rejeitados.

## Autorização e visibilidade

A permissão efetiva segue a precedência definida na etapa 05: exceção individual, permissão
do perfil e negação por padrão. A interface oculta ações sem permissão, mas o servidor
sempre reaplica a verificação.

A lista, o detalhe e os arquivos de imagem respeitam `imoveis.visibilidade`:

- `todos`: o ator vê os imóveis, exceto negações individuais;
- `vinculados`: o ator vê apenas imóveis ligados a ele, salvo concessões individuais;
- a negação individual prevalece sobre vínculo e concessão;
- administradores mantêm acesso total.

Imóveis inacessíveis respondem `404 IMOVEL_NOT_FOUND`, sem revelar a existência do
registro. As consultas usam `acessoService.filtroVisibilidade`.

## Auditoria

As operações são registradas em `auditoria` com ator, IP, user agent e metadados sem
conteúdo sensível:

- `imovel.criado`;
- `imovel.atualizado`, com a lista de campos alterados;
- `imovel.situacao_alterada`, com situação anterior e nova;
- `imovel.excluido`;
- `imovel.imagens_enviadas`, `imovel.imagem_principal_alterada`,
  `imovel.imagens_reordenadas` e `imovel.imagem_removida`.

A entidade registrada é `imoveis`, com o identificador do imóvel. O histórico do detalhe
exige `auditoria.visualizar` e é retornado por `GET /:id/historico`.

## Erros previstos

| Código                       | HTTP | Situação                                              |
| ---------------------------- | ---- | ----------------------------------------------------- |
| `VALIDATION_ERROR`           | 422  | Dados inválidos, enums, valores ou vínculos inválidos.|
| `IMOVEL_NOT_FOUND`           | 404  | Imóvel inexistente, excluído ou inacessível.          |
| `CODIGO_IN_USE`              | 409  | Código interno já utilizado por imóvel ativo.         |
| `IMAGEM_NOT_FOUND`           | 404  | Imagem inexistente no imóvel.                         |
| `IMAGEM_PRINCIPAL_CONFLITO`  | 409  | Mais de uma imagem principal na mesma operação.       |
| `INVALID_IMAGE`              | 422  | Conteúdo não reconhecido como JPEG, PNG ou WebP.      |
| `INVALID_UPLOAD`             | 422  | Formulário de upload inválido ou arquivo ausente.     |
| `IMAGE_LIMIT`                | 422  | Limite de imagens por imóvel excedido.                |
| `IMAGE_TOO_LARGE`            | 413  | Imagem acima do limite configurado.                   |
| `FORBIDDEN`                  | 403  | Permissão insuficiente ou vínculo não permitido.      |

## Validação

- `node --test tests/imoveis.test.js`: 10 testes aprovados.
- `npm test`: 71 testes aprovados.
- `npm run db:check`: 27 verificações aprovadas.
- `npm run migrate:status`: migrations 001 a 006 aplicadas.

## Limitações

- Não há upload de planta, matrícula ou documentos do imóvel.
- A galeria usa as imagens cadastradas; não há edição de imagem ou geração de miniaturas.
- A exclusão de imagens remove o arquivo físico imediatamente, sem lixeira.
- A exclusão do imóvel é lógica e não remove automaticamente as imagens físicas.
- A visibilidade é global por configuração, combinada com exceções individuais; não há
  configuração por imóvel.
