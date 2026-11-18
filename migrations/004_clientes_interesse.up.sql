-- Etapa 08: imóveis de interesse vinculados ao cliente.

CREATE TABLE clientes_imoveis_interesse (
  cliente_id BIGINT NOT NULL,
  imovel_id BIGINT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_clientes_imoveis_interesse PRIMARY KEY (cliente_id, imovel_id),
  CONSTRAINT fk_clientes_imoveis_interesse_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_clientes_imoveis_interesse_imovel FOREIGN KEY (imovel_id)
    REFERENCES imoveis (id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX idx_clientes_imoveis_interesse_imovel
  ON clientes_imoveis_interesse (imovel_id);
