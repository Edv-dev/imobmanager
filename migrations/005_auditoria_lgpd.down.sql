DROP TRIGGER IF EXISTS trg_auditoria_somente_inclusao ON auditoria;
DROP FUNCTION IF EXISTS fn_auditoria_somente_inclusao();

DELETE FROM configuracoes WHERE chave = 'auditoria.retencao_dias';

DELETE FROM permissoes
 WHERE chave IN ('auditoria.gerenciar', 'lgpd.gerenciar');
