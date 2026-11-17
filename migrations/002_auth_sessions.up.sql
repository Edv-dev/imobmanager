------------------------------------------------------------------------------
-- Sessoes autenticadas
--
-- O identificador da sessao e um token aleatorio enviado apenas no cookie
-- HttpOnly. O banco armazena somente o hash SHA-256 do token, nunca o valor
-- utilizavel. A revogacao e explicita e a expiracao e absoluta.
------------------------------------------------------------------------------
CREATE TABLE sessoes (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  usuario_id BIGINT NOT NULL,
  token_hash TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_acesso_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em TIMESTAMPTZ NOT NULL,
  revogado_em TIMESTAMPTZ,
  revogado_motivo TEXT,
  ip INET,
  user_agent TEXT,
  CONSTRAINT pk_sessoes PRIMARY KEY (id),
  CONSTRAINT uq_sessoes_token_hash UNIQUE (token_hash),
  CONSTRAINT fk_sessoes_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT ck_sessoes_token_hash CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT ck_sessoes_expira_em CHECK (expira_em > criado_em),
  CONSTRAINT ck_sessoes_revogacao CHECK (
    (revogado_em IS NULL AND revogado_motivo IS NULL)
    OR (revogado_em IS NOT NULL AND revogado_motivo IS NOT NULL)
  )
);

CREATE INDEX idx_sessoes_usuario ON sessoes (usuario_id);
CREATE INDEX idx_sessoes_expira ON sessoes (expira_em);
CREATE INDEX idx_sessoes_ativas ON sessoes (expira_em)
  WHERE revogado_em IS NULL;

------------------------------------------------------------------------------
-- Recuperacao de senha
--
-- O token enviado por e-mail tambem e armazenado apenas como hash SHA-256,
-- possui validade curta e uso unico.
------------------------------------------------------------------------------
CREATE TABLE recuperacoes_senha (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  usuario_id BIGINT NOT NULL,
  token_hash TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em TIMESTAMPTZ NOT NULL,
  usado_em TIMESTAMPTZ,
  ip INET,
  CONSTRAINT pk_recuperacoes_senha PRIMARY KEY (id),
  CONSTRAINT uq_recuperacoes_senha_token_hash UNIQUE (token_hash),
  CONSTRAINT fk_recuperacoes_senha_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT ck_recuperacoes_senha_token_hash CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT ck_recuperacoes_senha_expira_em CHECK (expira_em > criado_em)
);

CREATE INDEX idx_recuperacoes_senha_usuario
  ON recuperacoes_senha (usuario_id, criado_em DESC);
CREATE INDEX idx_recuperacoes_senha_pendentes
  ON recuperacoes_senha (expira_em)
  WHERE usado_em IS NULL;

COMMENT ON TABLE sessoes IS 'Sessoes autenticadas; somente hashes de tokens sao persistidos.';
COMMENT ON TABLE recuperacoes_senha IS 'Tokens de recuperacao de senha com uso unico e validade curta.';
