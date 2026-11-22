# Testes e validação

Estratégia de testes do ImobManager 1.0, cobertura automatizada e checklist de
validação para produção.

## Como executar

```bash
npm test          # suíte completa (Node.js test runner)
npm run db:ping   # conectividade com o PostgreSQL
npm run db:check  # integridade do schema, seeds, triggers e constraints
npm run migrate:status
npm run backup    # requer pg_dump e tar
```

A suíte usa `node --test --test-concurrency=1 tests/*.test.js`, com testes de API,
integração com PostgreSQL real, autenticação, permissões, isolamento, uploads,
auditoria/LGPD, backup, manutenção, produção e interface. Cada arquivo roda em um
processo separado, em ordem alfabética.

### Banco de testes isolado (recomendado)

Os testes usam as variáveis de conexão do `.env` e criam/removem dados temporários com
prefixos únicos. Ainda assim, prefira um banco dedicado para não misturar dados de
desenvolvimento:

```bash
sudo -u postgres createdb -O imobmanager imobmanager_test
DB_NAME=imobmanager_test npm run migrate:up
DB_NAME=imobmanager_test npm test
```

> Nunca execute a suíte apontando para o banco de produção. Os testes fazem limpeza,
> mas o processo cria e remove registros reais.

## Cobertura por área

| Arquivo | Foco | Testes |
| --- | --- | ---: |
| `tests/api.test.js` | healthcheck, 404, JSON inválido, estáticos e ausência de vazamentos | 5 |
| `tests/auth.test.js` | login/logout, sessão, CSRF, origem, bloqueio, recuperação, headers e middlewares | 9 |
| `tests/admin.test.js` | usuários, corretores, permissões, exceções, visibilidade e auditoria | 8 |
| `tests/corretores.test.js` | CRUD, status, conta/sessões, autorização e visibilidade | 7 |
| `tests/imoveis.test.js` | CRUD, filtros, imagens, arquivos, visibilidade e auditoria | 10 |
| `tests/clientes.test.js` | CRUD, CPF, vínculos, atendimentos, visibilidade e auditoria | 9 |
| `tests/relatorios.test.js` | dashboard, relatórios, filtros, atendimentos e exportações CSV/PDF | 6 |
| `tests/lgpd.test.js` | permissões, CSRF, exportação, anonimização, redação, retenção e filtros | 7 |
| `tests/database.test.js` | indisponibilidade do banco sem exceção | 1 |
| `tests/ui.test.js` | login, shell, recuperação, módulos, CSS, viewport, breakpoints e favicon | 10 |
| `tests/production.test.js` | HSTS/no-store/CSP, origem canônica, trust proxy e validação de env | 4 |
| `tests/maintenance.test.js` | limpeza de sessões/recuperações antigas e auditoria da rotina | 1 |
| `tests/backup.test.js` | dump válido, uploads, `pg_restore --list` e retenção | 2 |

Ajudantes: `tests/helpers/auditoria.js` remove eventos de teste com a variável
transacional de manutenção exigida pelo trigger de imutabilidade.

## Requisitos cobertos

- **API e erros**: healthcheck, 404, JSON inválido, limites e ausência de stack/detalhes
  internos.
- **Autenticação**: credenciais genéricas, cookie protegido, CSRF, origem, bloqueio,
  recuperação de uso único e revogação de sessões.
- **Permissões**: perfil administrativo, permissões gerais, exceções individuais com
  precedência, autoproteção e isolamento entre corretores.
- **Dados**: CPF/e-mail/código únicos, validações, exclusão lógica, cascatas e
  reutilização após exclusão.
- **Uploads**: magic bytes, limites, autorização no download, ordenação, imagem
  principal e remoção.
- **Auditoria/LGPD**: eventos de login/negação/CSRF/origem, imutabilidade, filtros,
  retenção, exportação, anonimização e redação de PII.
- **Produção**: HSTS, `Cache-Control: no-store`, CSP sem inline, `TRUST_PROXY`,
  `APP_URL` canônica/HTTPS e validação de segredos.
- **Operação**: dump real do banco, arquivo de uploads, retenção de backups, manutenção
  de sessões e recuperações expiradas.
- **Interface**: páginas, módulos, identidade visual, viewport e breakpoints.

## Segurança testada

- CSP restritiva e headers Helmet.
- Cookie `HttpOnly`/`SameSite=Lax` (e `Secure` em produção).
- CSRF em mutações autenticadas.
- Rejeição de origem externa e registro do evento.
- Rate limiting e bloqueio temporário.
- Consultas parametrizadas e erros sem vazamento.
- Limites de upload e validação de conteúdo.
- Imutabilidade da auditoria e rotinas controladas de expurgo/redação.
- Trust proxy limitado a uma camada, atrás do Nginx.

## Responsividade e acessibilidade

A suíte verifica `viewport`, breakpoints de 1024/760/720/640/560 px e a regra de
movimento reduzido. A conferência visual continua sendo manual. Checklist sugerido:

- [ ] Login, dashboard, tabelas, formulários e modais em 360, 768, 1024 e 1440 px.
- [ ] Sem rolagem horizontal inesperada; tabelas largas roláveis quando necessário.
- [ ] Navegação por teclado e foco visível em botões, campos, abas e modais.
- [ ] Zoom de 200% sem sobreposição de conteúdo.
- [ ] Mensagens de erro/sucesso compreensíveis e associadas aos campos.
- [ ] Contraste e legibilidade nos temas claros e componentes dourados.

Testes automatizados de acessibilidade (axe) e E2E em navegador não fazem parte da
suíte atual; recomenda-se executá-los em homologação antes de grandes mudanças.

## Validação de referência

Execução em **20/11/2026**, com Node.js 22, PostgreSQL 18 e banco de desenvolvimento:

```text
npm test                -> 79 testes aprovados, 0 falhas
npm run db:check        -> 27 verificações aprovadas, 0 falhas
npm run migrate:status  -> 5 migrations aplicadas, 0 pendentes
```

Observações:

- Os testes de backup são pulados automaticamente se `pg_dump`/`pg_restore` não estiverem
  instalados; na validação acima foram executados.
- A suíte não mede carga, latência, penetração ou conformidade jurídica.
- Testes de restauração de backup devem ser feitos em ambiente isolado, nunca no banco
  de produção.

## Limitações

- Sem testes E2E com navegador real, teste de carga ou teste de intrusão automatizado.
- Sem verificação automática de acessibilidade WCAG.
- Rate limiting em memória; múltiplas instâncias exigem store compartilhado.
- A restauração de backup é um procedimento operacional documentado, não um teste
  destrutivo automático.
