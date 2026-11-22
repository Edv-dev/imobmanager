# Operação, backup e recuperação

Rotinas operacionais do ImobManager 1.0. Este documento complementa
[implantacao.md](implantacao.md) e [lgpd-auditoria.md](lgpd-auditoria.md).

## Rotinas recomendadas

| Frequência | Rotina |
| --- | --- |
| Diária | Conferir healthcheck, falhas de backup e espaço em disco. |
| Diária | Backup automático do banco e uploads (timer `imobmanager-backup`). |
| Diária | Manutenção de sessões, recuperações e retenção de auditoria (timer `imobmanager-maintenance`). |
| Semanal | Copiar backups para armazenamento externo criptografado. |
| Semanal | Revisar acessos administrativos, bloqueios e eventos de segurança. |
| Mensal | Testar restauração em ambiente isolado. |
| Mensal | Revisar retenção de auditoria e bases legais com o responsável por dados. |
| Trimestral | Revisar certificados, firewall, dependências e credenciais. |

## Backup

### O que é incluído

- Dump lógico do PostgreSQL em formato customizado (`pg_dump`).
- Arquivo `.tar.gz` do diretório de uploads, quando ele existe.
- Política de retenção padrão de 30 dias (`BACKUP_RETENTION_DAYS`).

O `.env` não é incluído no backup automático. Guarde uma cópia segura das variáveis
de ambiente e dos segredos em um cofre de senhas; nunca os coloque no repositório.

### Manual

```bash
sudo -u imobmanager BACKUP_DIR=/var/backups/imobmanager npm run backup
```

O comando usa `pg_dump` e `tar`; ambos precisam estar instalados. O diretório de destino
é criado com permissão `0700` e os arquivos com `0600`. A saída informa os caminhos e o
tamanho dos arquivos.

### Automático

O timer `imobmanager-backup.timer` executa diariamente por volta das 03:15, com atraso
aleatório de até 15 minutos. Para acompanhar:

```bash
systemctl list-timers imobmanager-backup.timer
sudo systemctl start imobmanager-backup.service
sudo journalctl -u imobmanager-backup -n 50 --no-pager
```

### Proteção e cópia externa

- Restrinja o acesso a `/var/backups/imobmanager` ao usuário de sistema.
- Criptografe os backups antes de enviá-los para fora do servidor.
- Mantenha pelo menos uma cópia em local físico/serviço diferente.
- Teste a restauração periodicamente; um backup não testado não é confiável.
- O dump contém dados pessoais e hashes de senha; trate-o como dado sensível.

### Verificação de integridade

```bash
pg_restore --list /var/backups/imobmanager/imobmanager-AAAA...dump | head
```

A listagem deve conter as tabelas do sistema, incluindo `usuarios`, `clientes`,
`auditoria` e `schema_migrations`.

## Restauração

> **Atenção:** a restauração substitui os dados atuais. Execute em janela de manutenção,
> com a aplicação parada, e confirme o arquivo e o ambiente antes de continuar.

1. Pare a aplicação e faça um backup do estado atual:

```bash
sudo systemctl stop imobmanager
sudo -u imobmanager BACKUP_DIR=/var/backups/imobmanager npm run backup
```

2. Recrie o banco (destrutivo):

```bash
sudo -u postgres dropdb --if-exists imobmanager
sudo -u postgres createdb -O imobmanager imobmanager
sudo -u postgres pg_restore --no-owner --no-privileges \
  -d imobmanager /var/backups/imobmanager/ARQUIVO.dump
```

3. Restaure os uploads, se o arquivo tiver sido gerado:

```bash
sudo rm -rf /var/lib/imobmanager/uploads
sudo tar -xzf /var/backups/imobmanager/ARQUIVO-uploads.tar.gz \
  -C /var/lib/imobmanager
sudo chown -R imobmanager:imobmanager /var/lib/imobmanager/uploads
sudo chmod -R u=rwX,g=rX,o= /var/lib/imobmanager/uploads
```

O `tar` foi criado com `-C <diretório-pai> <uploads>`, portanto extraia em
`/var/lib/imobmanager` para recriar `uploads/`.

4. Confira o schema e reinicie:

```bash
sudo -u imobmanager npm run migrate:status
sudo -u imobmanager npm run db:check
sudo systemctl start imobmanager
curl -fsS https://SEU_DOMINIO/api/health
```

5. Valide login administrativo, listagens, imagens e relatórios. Preserve o backup
utilizado e registre a ocorrência.

## Manutenção diária

O script `npm run maintenance`:

- remove sessões expiradas ou revogadas há mais de 7 dias;
- remove recuperações de senha usadas/expiradas há mais de 7 dias;
- aplica a retenção configurada da auditoria (padrão 365 dias, entre 30 e 3650);
- registra eventos `sistema.manutencao` e `admin.auditoria_expurgada` na auditoria.

```bash
sudo -u imobmanager npm run maintenance
sudo systemctl start imobmanager-maintenance.service
sudo journalctl -u imobmanager-maintenance -n 50 --no-pager
```

O expurgo manual da auditoria continua disponível:

```bash
sudo -u imobmanager npm run audit:purge
```

A retenção pode ser alterada na aba **Histórico** da administração por quem possui
`auditoria.gerenciar`. Revise o prazo com o responsável jurídico/DPO; a retenção deve
estar alinhada à finalidade, à base legal e às obrigações de guarda.

## Logs e monitoramento

- Aplicação: `journalctl -u imobmanager -f`.
- Backup: `journalctl -u imobmanager-backup`.
- Manutenção: `journalctl -u imobmanager-maintenance`.
- Nginx: `/var/log/nginx/access.log` e `/var/log/nginx/error.log`.
- Healthcheck: `GET /api/health`; use um monitor externo com alerta para `503`.

Alertas mínimos recomendados:

- healthcheck indisponível por mais de 2 minutos;
- falha no timer de backup;
- disco acima de 80%;
- certificado TLS expirando em menos de 30 dias;
- aumento anormal de falhas de login ou eventos `seguranca.*`.

Não copie tokens, senhas ou corpos de requisição para logs. A auditoria de negócio já
registra os eventos necessários sem credenciais.

## Incidentes de segurança

Em caso de suspeita de vazamento ou acesso indevido:

1. Preserve os logs e a auditoria; não apague evidências.
2. Revogue sessões ativas e redefina senhas dos usuários afetados.
3. Se o segredo de sessão foi comprometido, troque `SESSION_SECRET` e reinicie a
   aplicação; isso invalida cookies e tokens CSRF emitidos antes.
4. Restrinja acessos de rede e rotacione credenciais do banco/SMTP.
5. Comunique o responsável por dados e siga o plano jurídico de notificação.
6. Registre causa, impacto, contenção e ações corretivas.

Consulta útil para revogar sessões (execute como administrador do banco, com cautela):

```sql
UPDATE sessoes
   SET revogado_em = now(),
       revogado_motivo = 'incidente_seguranca'
 WHERE revogado_em IS NULL;
```

## Atualização e rollback

Siga a seção 12 de [implantacao.md](implantacao.md). Antes de atualizar:

- gere e valide um backup;
- leia as migrations da versão;
- teste a atualização em homologação;
- tenha um plano de retorno com backup compatível.

Migrations são aplicadas apenas para frente (forward-only); reverter somente o código
pode ser incompatível com um schema novo. O rollback seguro é restaurar o backup
anterior em uma janela de manutenção.

## Pendências de conformidade

O sistema oferece controles técnicos de segurança, auditoria, retenção e atendimento
aos titulares, mas a conformidade com a LGPD também exige: base legal documentada,
política de privacidade, contratos com operadores, designação de encarregado, canal de
atendimento, treinamento, gestão de incidentes e revisão jurídica periódica.
