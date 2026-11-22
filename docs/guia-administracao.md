# Guia de administração

Guia para administradores do ImobManager 1.0. Ele descreve as rotinas da área
**Administração**; detalhes técnicos ficam em [administracao.md](administracao.md) e
[lgpd-auditoria.md](lgpd-auditoria.md).

## Perfis e acesso

- **Administrador**: perfil administrativo com todas as permissões do catálogo.
- **Corretor**: usuário de negócio, sem acesso administrativo por padrão.
- Permissões gerais vêm do perfil; exceções individuais podem conceder ou negar uma
  permissão específica para um usuário.
- A interface esconde o que o usuário não pode acessar, mas a decisão final é sempre
  do servidor.

Recomendações:

- Mantenha pelo menos dois administradores ativos, mas o sistema impede remover o
  último administrador ativo.
- Use contas individuais; não compartilhe logins.
- Desative imediatamente usuários desligados; a desativação revoga as sessões.

## Usuários e corretores

Na aba **Usuários** é possível:

- criar, editar, ativar e desativar contas;
- redefinir a senha de outro usuário, exigindo troca no próximo acesso;
- consultar e editar o corretor vinculado;
- consultar sessões e acessos;
- ajustar permissões individuais e exceções por imóvel/cliente.

Desativação, redefinição de senha e alteração de permissões são registradas na
auditoria. O sistema não permite autodesativação nem alterar as próprias permissões
pela área administrativa.

## Permissões

- A permissão efetiva combina o perfil e a exceção individual.
- Uma exceção explícita prevalece sobre a regra geral, inclusive para negar.
- Permissões do módulo Administração só podem ser atribuídas a perfis/usuários
  administrativos.
- O perfil Administrador mantém permissões essenciais; elas não podem ser removidas.

Revise as permissões por função: consulta, criação, edição, exclusão, exportação,
auditoria e LGPD. Conceda o mínimo necessário.

## Visibilidade de imóveis e clientes

A aba **Visibilidade** define, separadamente para imóveis e clientes:

- todos veem todos os registros; ou
- cada corretor vê apenas os registros vinculados.

Exceções individuais permitem liberar ou bloquear registros específicos. A regra vale
para listagens, detalhes, operações, relatórios, histórico, imagens e arquivos; não é
possível contornar por acesso direto à API.

Revise as exceções periodicamente e remova concessões temporárias que não são mais
necessárias.

## Histórico e retenção

A aba **Histórico** permite:

- filtrar por busca, tipo, resultado, entidade e período;
- abrir detalhes de um evento;
- configurar a retenção da auditoria (30 a 3650 dias; padrão 365);
- executar o expurgo dos eventos além do prazo.

Eventos de login, logout, falhas, bloqueios, alterações, exclusões, permissões,
visibilidade, LGPD e negações de acesso são registrados. A tabela é imutável por
trigger; expurgo e redação LGPD usam rotinas internas controladas.

Recomendações:

- Não aumente a retenção sem necessidade documentada.
- Preserve evidências em caso de investigação/incidente.
- A retenção deve estar alinhada à política de privacidade e às obrigações legais.

## LGPD

Na aba **LGPD**:

- busque o titular por nome, CPF ou e-mail;
- baixe os dados pessoais em JSON;
- anonimize o cadastro com confirmação e motivo.

A anonimização é **irreversível** e:

- substitui nome e CPF por identificadores;
- remove telefone, WhatsApp, e-mail, endereço, observações, faixa de preço e
  localização desejada;
- limpa descrições/observações de atendimentos e remove vínculos do titular;
- marca o cliente como excluído logicamente;
- redige dados pessoais nos eventos de auditoria e registra um protocolo.

Antes de anonimizar, confirme se não há obrigação legal de guarda. O pedido deve ser
registrado no canal de atendimento ao titular. A exportação e a anonimização são
auditadas.

## Rotinas recomendadas

- **Diária**: conferir alertas de backup e healthcheck; revisar bloqueios e falhas de
  login anormais.
- **Semanal**: revisar usuários ativos, permissões, exceções e logs de segurança.
- **Mensal**: revisar perfis, contas inativas, retenção, solicitações LGPD e backups.
- **Trimestral**: revisar dependências, certificados, firewall e credenciais.

## Boas práticas de segurança

- Senhas longas e exclusivas; use um gerenciador de senhas.
- Ative HTTPS e nunca acesse o sistema por HTTP em produção.
- Não envie senhas, tokens ou dados de titulares por canais inseguros.
- Desconfie de pedidos de exportação/anonimização sem validação de identidade.
- Em caso de incidente, preserve logs e acione o responsável por dados.
