------------------------------------------------------------------------------
-- Excecoes individuais de acesso a registros
--
-- A visibilidade geral de imoveis e clientes e definida nas configuracoes do
-- sistema ("todos" ou "vinculados"). Estas tabelas permitem que o
-- administrador conceda ou negue acesso a registros especificos, sempre com
-- precedencia sobre a regra geral.
--   permitido = true  -> concede acesso a um registro
--   permitido = false -> nega acesso mesmo quando a visibilidade e "todos"
------------------------------------------------------------------------------
CREATE TABLE acessos_imoveis (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  usuario_id BIGINT NOT NULL,
  imovel_id BIGINT NOT NULL,
  permitido BOOLEAN NOT NULL,
  concedido_por_usuario_id BIGINT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_acessos_imoveis PRIMARY KEY (id),
  CONSTRAINT uq_acessos_imoveis_usuario_imovel UNIQUE (usuario_id, imovel_id),
  CONSTRAINT fk_acessos_imoveis_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_acessos_imoveis_imovel FOREIGN KEY (imovel_id)
    REFERENCES imoveis (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_acessos_imoveis_concedido_por FOREIGN KEY (concedido_por_usuario_id)
    REFERENCES usuarios (id) ON UPDATE RESTRICT ON DELETE SET NULL
);

CREATE INDEX idx_acessos_imoveis_imovel
  ON acessos_imoveis (imovel_id);
CREATE INDEX idx_acessos_imoveis_concedido_por
  ON acessos_imoveis (concedido_por_usuario_id);

CREATE TABLE acessos_clientes (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  usuario_id BIGINT NOT NULL,
  cliente_id BIGINT NOT NULL,
  permitido BOOLEAN NOT NULL,
  concedido_por_usuario_id BIGINT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_acessos_clientes PRIMARY KEY (id),
  CONSTRAINT uq_acessos_clientes_usuario_cliente UNIQUE (usuario_id, cliente_id),
  CONSTRAINT fk_acessos_clientes_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_acessos_clientes_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_acessos_clientes_concedido_por FOREIGN KEY (concedido_por_usuario_id)
    REFERENCES usuarios (id) ON UPDATE RESTRICT ON DELETE SET NULL
);

CREATE INDEX idx_acessos_clientes_cliente
  ON acessos_clientes (cliente_id);
CREATE INDEX idx_acessos_clientes_concedido_por
  ON acessos_clientes (concedido_por_usuario_id);

CREATE TRIGGER trg_acessos_imoveis_atualizado_em
  BEFORE UPDATE ON acessos_imoveis
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_acessos_clientes_atualizado_em
  BEFORE UPDATE ON acessos_clientes
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

COMMENT ON TABLE acessos_imoveis IS
  'Excecoes individuais de acesso a imoveis; prevalecem sobre a visibilidade geral.';
COMMENT ON TABLE acessos_clientes IS
  'Excecoes individuais de acesso a clientes; prevalecem sobre a visibilidade geral.';
