# Guia de utilização

Guia rápido para usuários do ImobManager 1.0. O que cada pessoa vê depende das
permissões e das regras de visibilidade configuradas pelo administrador.

## Acesso

1. Abra `https://SEU_DOMINIO`.
2. Informe e-mail e senha.
3. Se necessário, use **Esqueceu sua senha?** para solicitar um link de recuperação.
4. Ao terminar, use **Sair**. Em computadores compartilhados, não marque
   "Lembrar de mim".

A sessão expira conforme a configuração do servidor. Se você não receber o e-mail de
recuperação, procure o administrador.

## Dashboard

O painel resume a operação conforme o seu perfil:

- totais de imóveis, disponíveis, vendidos e alugados;
- corretores ativos e clientes cadastrados;
- novos clientes e atendimentos do período;
- gráficos, movimentações e atividade recente.

Usuários com visibilidade restrita veem apenas os dados permitidos. Os números são
calculados a partir do banco, não são exemplos.

## Imóveis

- Consulte a lista, use busca e filtros por tipo, finalidade, cidade, bairro, situação
  e faixa de valor.
- Abra um imóvel para ver detalhes, corretores vinculados, histórico e galeria.
- Com permissão, cadastre/edite, altere a situação e gerencie imagens.
- A primeira imagem ou a imagem marcada como principal aparece nos cards/listagens.
- A exclusão é lógica: o registro sai da operação, mas mantém histórico.

Envie imagens JPEG, PNG ou WebP dentro dos limites configurados. A ordem e a imagem
principal podem ser alteradas no detalhe do imóvel.

## Corretores

- Consulte dados profissionais, situação, conta vinculada, imóveis e clientes.
- Com permissão, cadastre/edite, ative/desative e gerencie vínculos.
- Desativar um corretor encerra o acesso e revoga sessões, sem apagar o histórico.

## Clientes e atendimentos

- Cadastre clientes com dados de contato, interesse, faixa de preço e localização.
- Vincule corretores responsáveis e imóveis de interesse.
- Registre atendimentos com tipo, status, data e observações.
- Consulte o histórico e as atividades anteriores do cliente.
- A exclusão é lógica; o CPF permanece protegido contra duplicidade enquanto ativo.

Evite registrar dados sensíveis desnecessários nas observações. A LGPD recomenda
minimização: registre apenas o necessário para o atendimento.

## Relatórios

- Escolha o relatório: imóveis por situação/finalidade/corretor, clientes por corretor
  ou histórico de atendimentos.
- Aplique filtros de período, corretor, tipo, finalidade e status.
- Exporte em CSV (para planilhas) ou PDF (para leitura/compartilhamento).
- As exportações respeitam permissões e visibilidade.

## Administração

Disponível apenas para perfis autorizados. Permite gerenciar usuários, corretores,
permissões, visibilidade, auditoria e solicitações LGPD. Consulte o
[guia de administração](guia-administracao.md).

## Problemas comuns

| Situação | O que fazer |
| --- | --- |
| Login não funciona | Confira e-mail/senha; após várias tentativas a conta pode ficar bloqueada temporariamente. |
| Não vejo um imóvel/cliente | A visibilidade pode ser restrita; solicite revisão ao administrador. |
| Não recebi o e-mail de recuperação | Verifique spam e confirme o e-mail cadastrado; acione o administrador. |
| Erro ao enviar imagem | Verifique formato (JPEG/PNG/WebP) e tamanho máximo. |
| Sessão encerrada | Entre novamente; a duração é definida pelo administrador. |
| Preciso dos meus dados ou exclusão | Procure o canal de privacidade da imobiliária. |

## Privacidade

Os dados de clientes são pessoais. Use apenas para a finalidade do atendimento, não
compartilhe fora da imobiliária sem base legal e siga a política de privacidade. O
sistema registra operações para auditoria e segurança.
