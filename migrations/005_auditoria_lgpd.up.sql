------------------------------------------------------------------------------
-- Etapa 10: auditoria reforcada e atendimento aos direitos LGPD.
--
-- - Novas permissoes administrativas para retencao da auditoria e LGPD.
-- - Configuracao do prazo de retencao dos eventos de auditoria.
-- - Bloqueio de alteracao/remocao da auditoria, exceto pelas rotinas
--   controladas de expurgo e redacao (variavel local de manutencao).
------------------------------------------------------------------------------

INSERT INTO permissoes (chave, nome, modulo, descricao) VALUES
  (
    'auditoria.gerenciar',
    'Gerenciar auditoria',
    'administracao',
    'Configurar a retencao e executar o expurgo dos registros de auditoria.'
  ),
  (
    'lgpd.gerenciar',
    'Atender direitos LGPD',
    'administracao',
    'Exportar e anonimizar dados pessoais de titulares.'
  )
ON CONFLICT (chave) DO NOTHING;

INSERT INTO perfis_permissoes (perfil_id, permissao_id)
SELECT p.id, perm.id
  FROM perfis p
  JOIN permissoes perm
    ON perm.chave IN ('auditoria.gerenciar', 'lgpd.gerenciar')
 WHERE p.nome = 'Administrador'
   AND p.administrativo
ON CONFLICT (perfil_id, permissao_id) DO NOTHING;

INSERT INTO configuracoes (chave, valor, descricao) VALUES
  (
    'auditoria.retencao_dias',
    '365'::jsonb,
    'Prazo de retencao dos eventos de auditoria, em dias (30 a 3650).'
  )
ON CONFLICT (chave) DO NOTHING;

------------------------------------------------------------------------------
-- Imutabilidade da auditoria.
--
-- A aplicacao nunca altera ou remove eventos. As unicas excecoes sao as
-- rotinas de manutencao (expurgo por retencao e redacao de dados pessoais
-- em atendimento a LGPD), que habilitam a variavel local abaixo dentro da
-- propria transacao:
--   SELECT set_config('imobmanager.auditoria_manutencao', 'on', true);
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_auditoria_somente_inclusao()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('imobmanager.auditoria_manutencao', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'A auditoria e somente inclusao; alteracoes exigem rotina de manutencao.'
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER trg_auditoria_somente_inclusao
  BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_somente_inclusao();

COMMENT ON FUNCTION fn_auditoria_somente_inclusao() IS
  'Bloqueia alteracao/remocao da auditoria, exceto pelo expurgo e pela redacao LGPD.';
COMMENT ON COLUMN configuracoes.valor IS
  'Valor JSONB da configuracao; inclui a politica de retencao da auditoria.';
