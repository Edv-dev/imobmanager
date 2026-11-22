# Implantação em produção

Guia de referência para implantar o ImobManager 1.0 em um servidor Linux com
Nginx, PostgreSQL e HTTPS. Os comandos assumem Ubuntu 24.04/26.04 LTS ou Debian 12+
e devem ser executados primeiro em um ambiente de homologação.

Premissas:

- Domínio apontando para o servidor (exemplo: `imobmanager.example.com`).
- Acesso `sudo` e portas 80/443 liberadas.
- Node.js 20+ (recomendado 22 LTS), PostgreSQL 14+, Nginx e Certbot.
- Código do projeto em `/opt/imobmanager`, executado pelo usuário de sistema
  `imobmanager`.
- Uploads em `/var/lib/imobmanager/uploads`, fora de `public/`.
- Backups em `/var/backups/imobmanager`.

## 1. Checklist inicial

- [ ] DNS do domínio aponta para o IP do servidor.
- [ ] Relógio do servidor sincronizado (NTP).
- [ ] Porta 22 restrita aos endereços administrativos.
- [ ] PostgreSQL não exposto na internet.
- [ ] Repositório Git acessível ao usuário de implantação.
- [ ] Backup e restauração testados antes de abrir o sistema ao público.
- [ ] Responsável técnico e responsável por dados (DPO/encarregado) definidos.

## 2. Pacotes e usuário

```bash
sudo apt update
sudo apt install -y postgresql nginx certbot python3-certbot-nginx git curl tar

# Node.js 22 LTS via NodeSource (confira a versão suportada pela sua distribuição)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
```

Crie o usuário de sistema e os diretórios:

```bash
sudo useradd --system --home-dir /opt/imobmanager --shell /usr/sbin/nologin imobmanager
sudo install -d -o imobmanager -g imobmanager -m 0750 /opt/imobmanager
sudo install -d -o imobmanager -g imobmanager -m 0750 /var/lib/imobmanager/uploads
sudo install -d -o imobmanager -g imobmanager -m 0700 /var/backups/imobmanager
```

## 3. PostgreSQL

Crie um usuário e um banco dedicados. Use uma senha forte e exclusiva:

```bash
sudo -u postgres psql
```

```sql
CREATE ROLE imobmanager LOGIN PASSWORD 'SUBSTITUA_POR_SENHA_FORTE';
CREATE DATABASE imobmanager OWNER imobmanager;
\q
```

Boas práticas:

- Não reutilize a senha do banco em outros serviços.
- Mantenha o PostgreSQL escutando apenas em `localhost` ou na rede privada.
- Configure backup do banco antes de liberar o acesso externo.
- Para conexão TLS com o banco, ajuste `DB_SSL=true` e a cadeia de certificados.

## 4. Código e dependências

```bash
sudo -u imobmanager git clone <URL_DO_REPOSITORIO> /opt/imobmanager
sudo -u imobmanager npm ci --omit=dev
```

Se o diretório já existir, clone em outro local e mova os arquivos, mantendo o
proprietário `imobmanager:imobmanager`.

## 5. Configuração de ambiente

```bash
sudo -u imobmanager cp /opt/imobmanager/deploy/env.production.example /opt/imobmanager/.env
sudo -u imobmanager chmod 600 /opt/imobmanager/.env
```

Edite `/opt/imobmanager/.env` e ajuste no mínimo:

- `APP_URL=https://SEU_DOMINIO` — deve ser a URL canônica, com HTTPS e sem barra final.
- `TRUST_PROXY=1` — há uma camada de proxy (Nginx) na frente do Node.
- `HOST=127.0.0.1` — o Node não deve ficar exposto diretamente.
- `SESSION_SECRET` — gere com o comando abaixo e nunca reutilize.
- `DB_PASSWORD` — a mesma senha criada no PostgreSQL.
- `SMTP_*` — necessário para recuperação de senha por e-mail em produção.
- `UPLOAD_DIR=/var/lib/imobmanager/uploads`.

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

A aplicação valida a configuração ao iniciar. Em produção ela recusa:

- `SESSION_SECRET` ausente ou com menos de 32 caracteres;
- `APP_URL` inválida, com caminho/credenciais ou sem HTTPS;
- `DB_PASSWORD` ausente;
- limites numéricos inválidos.

## 6. Migrations e administrador inicial

```bash
sudo -u imobmanager npm run migrate:status
sudo -u imobmanager npm run migrate:up
sudo -u imobmanager npm run db:check
sudo -u imobmanager npm run admin:create
```

O primeiro administrador é criado interativamente, sem credenciais padrão. A senha
precisa ter pelo menos 12 caracteres, com letras e números.

## 7. systemd

```bash
sudo cp /opt/imobmanager/deploy/systemd/imobmanager.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now imobmanager
sudo systemctl status imobmanager --no-pager
sudo journalctl -u imobmanager -n 50 --no-pager
```

A unidade aplica isolamento do sistema de arquivos (`ProtectSystem=strict`), diretório
temporário privado, restrição de capabilities e reinício automático em falha. O único
diretório gravável pela aplicação é `/var/lib/imobmanager/uploads`.

Verifique o healthcheck local:

```bash
curl -fsS http://127.0.0.1:3000/api/health
```

## 8. Nginx e HTTPS

```bash
sudo mkdir -p /var/www/certbot
sudo cp /opt/imobmanager/deploy/nginx-imobmanager.conf /etc/nginx/sites-available/imobmanager
sudo ln -s /etc/nginx/sites-available/imobmanager /etc/nginx/sites-enabled/imobmanager
sudo sed -i 's/imobmanager.example.com/SEU_DOMINIO/g' /etc/nginx/sites-available/imobmanager
sudo nginx -t
sudo systemctl reload nginx
```

Remova o site padrão, se necessário, e emita o certificado:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo certbot --nginx -d SEU_DOMINIO --redirect
sudo nginx -t
sudo systemctl reload nginx
```

O Certbot adiciona o bloco TLS, o redirecionamento HTTP→HTTPS e a renovação automática.
Confirme que `/opt/imobmanager/.env` contém `APP_URL=https://SEU_DOMINIO` e reinicie a
aplicação após qualquer alteração de ambiente:

```bash
sudo systemctl restart imobmanager
curl -fsS https://SEU_DOMINIO/api/health
```

Valide também:

- cabeçalho `Strict-Transport-Security` presente nas respostas HTTPS;
- cookie de sessão com `Secure`, `HttpOnly` e `SameSite=Lax`;
- renovação do certificado: `sudo certbot renew --dry-run`.

## 9. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Não abra a porta 3000 nem a 5432 para a internet. O Nginx acessa o Node em
`127.0.0.1:3000`.

## 10. Backups e manutenção

Instale as unidades e timers:

```bash
sudo cp /opt/imobmanager/deploy/systemd/imobmanager-backup.* /etc/systemd/system/
sudo cp /opt/imobmanager/deploy/systemd/imobmanager-maintenance.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now imobmanager-backup.timer
sudo systemctl enable --now imobmanager-maintenance.timer
```

Execute uma vez para validar:

```bash
sudo systemctl start imobmanager-backup.service
sudo systemctl start imobmanager-maintenance.service
sudo journalctl -u imobmanager-backup -n 30 --no-pager
sudo journalctl -u imobmanager-maintenance -n 30 --no-pager
```

O backup diário gera um dump customizado do PostgreSQL e um arquivo `.tar.gz` dos
uploads, com retenção padrão de 30 dias. Copie os arquivos para armazenamento externo
criptografado. O procedimento completo está em [operacao.md](operacao.md).

## 11. Logs e monitoramento

- Aplicação: `journalctl -u imobmanager -f` (logs em stdout/stderr, sem arquivos locais).
- Nginx: `/var/log/nginx/access.log` e `/var/log/nginx/error.log` (logrotate da distro).
- Backups/manutenção: `journalctl -u imobmanager-backup` e `journalctl -u imobmanager-maintenance`.
- Healthcheck: `GET /api/health` retorna `503` quando o banco está indisponível.
- Monitore espaço em disco de `/var/lib/imobmanager`, `/var/backups/imobmanager` e do
  PostgreSQL; monitore a validade do certificado TLS.

Nunca registre senhas, tokens ou dados pessoais completos em logs operacionais.

## 12. Atualização

```bash
sudo systemctl stop imobmanager
sudo -u imobmanager npm run backup
sudo -u imobmanager git -C /opt/imobmanager fetch --all --tags
sudo -u imobmanager git -C /opt/imobmanager checkout <TAG_OU_COMMIT>
sudo -u imobmanager npm ci --omit=dev
sudo -u imobmanager npm run migrate:up
sudo systemctl start imobmanager
curl -fsS https://SEU_DOMINIO/api/health
```

As migrations são aplicadas em transação, com checksum. Nunca altere um arquivo já
aplicado; crie uma nova migration. Se houver incompatibilidade de schema, restaure o
backup anterior conforme [operacao.md](operacao.md).

## 13. Verificação final

- [ ] `systemctl is-enabled imobmanager` e `systemctl is-active imobmanager` OK.
- [ ] `https://SEU_DOMINIO/api/health` responde `200` e `database: up`.
- [ ] Login administrativo funciona e a senha inicial foi trocada.
- [ ] Cookie de sessão está `Secure`, `HttpOnly` e `SameSite=Lax`.
- [ ] CSP não permite scripts inline; HSTS está presente.
- [ ] Upload de imagem funciona e o arquivo não é servido por `public/`.
- [ ] Permissões e visibilidade foram revisadas com dados reais.
- [ ] Backup manual e restauração foram testados em ambiente isolado.
- [ ] Timers de backup e manutenção estão ativos.
- [ ] Firewall e acesso ao PostgreSQL estão restritos.
- [ ] SMTP envia a recuperação de senha.
- [ ] Responsável por dados e canal de atendimento LGPD estão publicados.

## 14. Limitações e pendências

- O rate limiting usa memória do processo. Para múltiplas instâncias, use um store
  compartilhado (por exemplo, Redis) ou rate limiting no proxy.
- Não há MFA, SSO ou integração com provedor de identidade.
- A conformidade jurídica com a LGPD depende de políticas, contratos, base legal,
  treinamento, atendimento aos titulares e revisão por profissional jurídico. Este
  projeto implementa controles técnicos, não substitui essa análise.
- Testes de carga, teste de intrusão e auditoria de acessibilidade devem ser executados
  antes de uma operação de grande porte.
