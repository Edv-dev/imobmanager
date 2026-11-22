------------------------------------------------------------------------------
-- Etapa 11: controle de saida do aplicativo.
--
-- Registra quando o cliente saiu de /app.html para exigir nova autenticacao
-- ao retornar. Recarregamentos (F5) cancelam a saida via /api/auth/resume.
------------------------------------------------------------------------------

ALTER TABLE sessoes
  ADD COLUMN IF NOT EXISTS saida_solicitada_em TIMESTAMPTZ;
