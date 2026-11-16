-- ImobManager - Etapa 02: modelagem inicial do banco de dados.
--
-- Convencoes:
--   * Chaves primarias BIGINT GENERATED ALWAYS AS IDENTITY.
--   * Timestamps em TIMESTAMPTZ (criado_em / atualizado_em / excluido_em).
--   * Exclusao logica via excluido_em nas entidades de negocio.
--   * Unicidade garantida por indices parciais que ignoram registros excluidos.
--   * Permissoes gerais (perfis_permissoes) e individuais (permissoes_usuarios)
--     armazenadas em tabelas separadas.

------------------------------------------------------------------------------
-- Funcao reutilizavel para manter atualizado_em
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

------------------------------------------------------------------------------
-- Perfis de acesso
------------------------------------------------------------------------------
CREATE TABLE perfis (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  nome TEXT NOT NULL,
  descricao TEXT,
  administrativo BOOLEAN NOT NULL DEFAULT false,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_perfis PRIMARY KEY (id),
  CONSTRAINT uq_perfis_nome UNIQUE (nome),
  CONSTRAINT ck_perfis_nome_nao_vazio CHECK (btrim(nome) <> '')
);

------------------------------------------------------------------------------
-- Usuarios (administrador e corretores)
------------------------------------------------------------------------------
CREATE TABLE usuarios (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  perfil_id BIGINT NOT NULL,
  nome_completo TEXT NOT NULL,
  email TEXT NOT NULL,
  senha_hash TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  deve_trocar_senha BOOLEAN NOT NULL DEFAULT false,
  tentativas_falhas INTEGER NOT NULL DEFAULT 0,
  bloqueado_ate TIMESTAMPTZ,
  ultimo_acesso_em TIMESTAMPTZ,
  senha_alterada_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  excluido_em TIMESTAMPTZ,
  CONSTRAINT pk_usuarios PRIMARY KEY (id),
  CONSTRAINT fk_usuarios_perfil FOREIGN KEY (perfil_id)
    REFERENCES perfis (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ck_usuarios_nome_nao_vazio CHECK (btrim(nome_completo) <> ''),
  CONSTRAINT ck_usuarios_email CHECK (
    email = lower(btrim(email))
    AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  CONSTRAINT ck_usuarios_senha_hash_nao_vazio CHECK (btrim(senha_hash) <> ''),
  CONSTRAINT ck_usuarios_tentativas_falhas CHECK (tentativas_falhas >= 0)
);

CREATE UNIQUE INDEX uq_usuarios_email_ativo
  ON usuarios (email)
  WHERE excluido_em IS NULL;

CREATE INDEX idx_usuarios_perfil ON usuarios (perfil_id);
CREATE INDEX idx_usuarios_ativo ON usuarios (ativo) WHERE excluido_em IS NULL;

------------------------------------------------------------------------------
-- Catalogo de permissoes
------------------------------------------------------------------------------
CREATE TABLE permissoes (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  chave TEXT NOT NULL,
  nome TEXT NOT NULL,
  modulo TEXT NOT NULL,
  descricao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_permissoes PRIMARY KEY (id),
  CONSTRAINT uq_permissoes_chave UNIQUE (chave),
  CONSTRAINT ck_permissoes_chave CHECK (chave ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  CONSTRAINT ck_permissoes_modulo CHECK (modulo ~ '^[a-z][a-z0-9_]*$')
);

------------------------------------------------------------------------------
-- Permissoes gerais por perfil
------------------------------------------------------------------------------
CREATE TABLE perfis_permissoes (
  perfil_id BIGINT NOT NULL,
  permissao_id BIGINT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_perfis_permissoes PRIMARY KEY (perfil_id, permissao_id),
  CONSTRAINT fk_perfis_permissoes_perfil FOREIGN KEY (perfil_id)
    REFERENCES perfis (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_perfis_permissoes_permissao FOREIGN KEY (permissao_id)
    REFERENCES permissoes (id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX idx_perfis_permissoes_permissao
  ON perfis_permissoes (permissao_id);

------------------------------------------------------------------------------
-- Permissoes individuais (excecoes por usuario)
-- permitido = true  -> concede uma permissao que o perfil nao possui
-- permitido = false -> revoga uma permissao concedida pelo perfil
------------------------------------------------------------------------------
CREATE TABLE permissoes_usuarios (
  usuario_id BIGINT NOT NULL,
  permissao_id BIGINT NOT NULL,
  permitido BOOLEAN NOT NULL,
  concedido_por_usuario_id BIGINT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_permissoes_usuarios PRIMARY KEY (usuario_id, permissao_id),
  CONSTRAINT fk_permissoes_usuarios_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_permissoes_usuarios_permissao FOREIGN KEY (permissao_id)
    REFERENCES permissoes (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_permissoes_usuarios_concedido_por FOREIGN KEY (concedido_por_usuario_id)
    REFERENCES usuarios (id) ON UPDATE RESTRICT ON DELETE SET NULL
);

CREATE INDEX idx_permissoes_usuarios_permissao
  ON permissoes_usuarios (permissao_id);
CREATE INDEX idx_permissoes_usuarios_concedido_por
  ON permissoes_usuarios (concedido_por_usuario_id);

------------------------------------------------------------------------------
-- Corretores (vinculados a um usuario, sem acesso administrativo)
------------------------------------------------------------------------------
CREATE TABLE corretores (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  usuario_id BIGINT NOT NULL,
  nome_completo TEXT NOT NULL,
  cpf CHAR(11) NOT NULL,
  creci TEXT NOT NULL,
  telefone TEXT,
  whatsapp TEXT,
  email TEXT,
  endereco TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  excluido_em TIMESTAMPTZ,
  CONSTRAINT pk_corretores PRIMARY KEY (id),
  CONSTRAINT fk_corretores_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ck_corretores_nome_nao_vazio CHECK (btrim(nome_completo) <> ''),
  CONSTRAINT ck_corretores_cpf_formato CHECK (cpf ~ '^[0-9]{11}$'),
  CONSTRAINT ck_corretores_creci_nao_vazio CHECK (btrim(creci) <> ''),
  CONSTRAINT ck_corretores_email CHECK (
    email IS NULL
    OR (email = lower(btrim(email))
        AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  )
);

CREATE UNIQUE INDEX uq_corretores_usuario_ativo
  ON corretores (usuario_id)
  WHERE excluido_em IS NULL;
CREATE UNIQUE INDEX uq_corretores_cpf_ativo
  ON corretores (cpf)
  WHERE excluido_em IS NULL;
CREATE UNIQUE INDEX uq_corretores_creci_ativo
  ON corretores (lower(btrim(creci)))
  WHERE excluido_em IS NULL;
CREATE UNIQUE INDEX uq_corretores_email_ativo
  ON corretores (email)
  WHERE excluido_em IS NULL AND email IS NOT NULL;

CREATE INDEX idx_corretores_nome ON corretores (lower(nome_completo));
CREATE INDEX idx_corretores_ativo ON corretores (ativo) WHERE excluido_em IS NULL;

------------------------------------------------------------------------------
-- Clientes
------------------------------------------------------------------------------
CREATE TABLE clientes (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  nome_completo TEXT NOT NULL,
  cpf CHAR(11) NOT NULL,
  telefone TEXT,
  whatsapp TEXT,
  email TEXT,
  endereco TEXT,
  tipo_interesse TEXT,
  finalidade_desejada TEXT,
  faixa_preco_min NUMERIC(14, 2),
  faixa_preco_max NUMERIC(14, 2),
  localizacao_desejada TEXT,
  observacoes TEXT,
  criado_por_usuario_id BIGINT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  excluido_em TIMESTAMPTZ,
  CONSTRAINT pk_clientes PRIMARY KEY (id),
  CONSTRAINT fk_clientes_criado_por FOREIGN KEY (criado_por_usuario_id)
    REFERENCES usuarios (id) ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT ck_clientes_nome_nao_vazio CHECK (btrim(nome_completo) <> ''),
  CONSTRAINT ck_clientes_cpf_formato CHECK (cpf ~ '^[0-9]{11}$'),
  CONSTRAINT ck_clientes_email CHECK (
    email IS NULL
    OR (email = lower(btrim(email))
        AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  ),
  CONSTRAINT ck_clientes_finalidade_desejada CHECK (
    finalidade_desejada IS NULL
    OR finalidade_desejada IN ('venda', 'aluguel', 'ambos')
  ),
  CONSTRAINT ck_clientes_faixa_preco CHECK (
    (faixa_preco_min IS NULL OR faixa_preco_min >= 0)
    AND (faixa_preco_max IS NULL OR faixa_preco_max >= 0)
    AND (faixa_preco_min IS NULL OR faixa_preco_max IS NULL OR faixa_preco_min <= faixa_preco_max)
  )
);

CREATE UNIQUE INDEX uq_clientes_cpf_ativo
  ON clientes (cpf)
  WHERE excluido_em IS NULL;

CREATE INDEX idx_clientes_nome ON clientes (lower(nome_completo));
CREATE INDEX idx_clientes_email ON clientes (email) WHERE email IS NOT NULL;
CREATE INDEX idx_clientes_criado_por ON clientes (criado_por_usuario_id);

------------------------------------------------------------------------------
-- Imoveis
------------------------------------------------------------------------------
CREATE TABLE imoveis (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  codigo_interno TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  tipo_imovel TEXT NOT NULL,
  finalidade TEXT NOT NULL,
  cep CHAR(8),
  estado CHAR(2),
  cidade TEXT,
  bairro TEXT,
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  area_total NUMERIC(12, 2),
  area_construida NUMERIC(12, 2),
  quartos SMALLINT NOT NULL DEFAULT 0,
  banheiros SMALLINT NOT NULL DEFAULT 0,
  suites SMALLINT NOT NULL DEFAULT 0,
  vagas_garagem SMALLINT NOT NULL DEFAULT 0,
  mobiliado BOOLEAN NOT NULL DEFAULT false,
  caracteristicas TEXT[] NOT NULL DEFAULT '{}'::text[],
  valor_venda NUMERIC(14, 2),
  valor_aluguel NUMERIC(14, 2),
  valor_condominio NUMERIC(12, 2),
  valor_iptu NUMERIC(12, 2),
  situacao TEXT NOT NULL DEFAULT 'disponivel',
  criado_por_usuario_id BIGINT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  excluido_em TIMESTAMPTZ,
  CONSTRAINT pk_imoveis PRIMARY KEY (id),
  CONSTRAINT fk_imoveis_criado_por FOREIGN KEY (criado_por_usuario_id)
    REFERENCES usuarios (id) ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT ck_imoveis_codigo_nao_vazio CHECK (btrim(codigo_interno) <> ''),
  CONSTRAINT ck_imoveis_titulo_nao_vazio CHECK (btrim(titulo) <> ''),
  CONSTRAINT ck_imoveis_tipo CHECK (
    tipo_imovel IN ('apartamento', 'casa', 'terreno', 'comercial', 'rural', 'outro')
  ),
  CONSTRAINT ck_imoveis_finalidade CHECK (finalidade IN ('venda', 'aluguel')),
  CONSTRAINT ck_imoveis_situacao CHECK (
    situacao IN ('disponivel', 'reservado', 'vendido', 'alugado', 'inativo')
  ),
  CONSTRAINT ck_imoveis_cep CHECK (cep IS NULL OR cep ~ '^[0-9]{8}$'),
  CONSTRAINT ck_imoveis_estado CHECK (estado IS NULL OR estado ~ '^[A-Z]{2}$'),
  CONSTRAINT ck_imoveis_areas_nao_negativas CHECK (
    (area_total IS NULL OR area_total >= 0)
    AND (area_construida IS NULL OR area_construida >= 0)
  ),
  CONSTRAINT ck_imoveis_contadores_nao_negativos CHECK (
    quartos >= 0 AND banheiros >= 0 AND suites >= 0 AND vagas_garagem >= 0
  ),
  CONSTRAINT ck_imoveis_valores_nao_negativos CHECK (
    (valor_venda IS NULL OR valor_venda >= 0)
    AND (valor_aluguel IS NULL OR valor_aluguel >= 0)
    AND (valor_condominio IS NULL OR valor_condominio >= 0)
    AND (valor_iptu IS NULL OR valor_iptu >= 0)
  )
);

CREATE UNIQUE INDEX uq_imoveis_codigo_ativo
  ON imoveis (codigo_interno)
  WHERE excluido_em IS NULL;

CREATE INDEX idx_imoveis_tipo ON imoveis (tipo_imovel) WHERE excluido_em IS NULL;
CREATE INDEX idx_imoveis_finalidade ON imoveis (finalidade) WHERE excluido_em IS NULL;
CREATE INDEX idx_imoveis_situacao ON imoveis (situacao) WHERE excluido_em IS NULL;
CREATE INDEX idx_imoveis_cidade ON imoveis (cidade) WHERE excluido_em IS NULL;
CREATE INDEX idx_imoveis_bairro ON imoveis (bairro) WHERE excluido_em IS NULL;
CREATE INDEX idx_imoveis_cidade_bairro ON imoveis (cidade, bairro) WHERE excluido_em IS NULL;
CREATE INDEX idx_imoveis_finalidade_situacao ON imoveis (finalidade, situacao) WHERE excluido_em IS NULL;
CREATE INDEX idx_imoveis_valor_venda ON imoveis (valor_venda) WHERE excluido_em IS NULL;
CREATE INDEX idx_imoveis_valor_aluguel ON imoveis (valor_aluguel) WHERE excluido_em IS NULL;
CREATE INDEX idx_imoveis_titulo ON imoveis (lower(titulo)) WHERE excluido_em IS NULL;
CREATE INDEX idx_imoveis_caracteristicas ON imoveis USING GIN (caracteristicas);
CREATE INDEX idx_imoveis_criado_por ON imoveis (criado_por_usuario_id);

------------------------------------------------------------------------------
-- Imagens dos imoveis
------------------------------------------------------------------------------
CREATE TABLE imagens_imoveis (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  imovel_id BIGINT NOT NULL,
  caminho_arquivo TEXT NOT NULL,
  nome_original TEXT,
  mime_type TEXT NOT NULL,
  tamanho_bytes BIGINT NOT NULL,
  ordem SMALLINT NOT NULL DEFAULT 0,
  principal BOOLEAN NOT NULL DEFAULT false,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_imagens_imoveis PRIMARY KEY (id),
  CONSTRAINT uq_imagens_imoveis_caminho UNIQUE (caminho_arquivo),
  CONSTRAINT fk_imagens_imoveis_imovel FOREIGN KEY (imovel_id)
    REFERENCES imoveis (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT ck_imagens_mime_type CHECK (
    mime_type IN ('image/jpeg', 'image/png', 'image/webp')
  ),
  CONSTRAINT ck_imagens_tamanho CHECK (tamanho_bytes > 0),
  CONSTRAINT ck_imagens_ordem CHECK (ordem >= 0)
);

CREATE UNIQUE INDEX uq_imagens_imoveis_principal
  ON imagens_imoveis (imovel_id)
  WHERE principal;
CREATE INDEX idx_imagens_imoveis_imovel_ordem
  ON imagens_imoveis (imovel_id, ordem);

------------------------------------------------------------------------------
-- Vinculo entre imoveis e corretores
------------------------------------------------------------------------------
CREATE TABLE imoveis_corretores (
  imovel_id BIGINT NOT NULL,
  corretor_id BIGINT NOT NULL,
  principal BOOLEAN NOT NULL DEFAULT false,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_imoveis_corretores PRIMARY KEY (imovel_id, corretor_id),
  CONSTRAINT fk_imoveis_corretores_imovel FOREIGN KEY (imovel_id)
    REFERENCES imoveis (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_imoveis_corretores_corretor FOREIGN KEY (corretor_id)
    REFERENCES corretores (id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_imoveis_corretores_principal
  ON imoveis_corretores (imovel_id)
  WHERE principal;
CREATE INDEX idx_imoveis_corretores_corretor
  ON imoveis_corretores (corretor_id);

------------------------------------------------------------------------------
-- Vinculo entre clientes e corretores
------------------------------------------------------------------------------
CREATE TABLE clientes_corretores (
  cliente_id BIGINT NOT NULL,
  corretor_id BIGINT NOT NULL,
  principal BOOLEAN NOT NULL DEFAULT false,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_clientes_corretores PRIMARY KEY (cliente_id, corretor_id),
  CONSTRAINT fk_clientes_corretores_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_clientes_corretores_corretor FOREIGN KEY (corretor_id)
    REFERENCES corretores (id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_clientes_corretores_principal
  ON clientes_corretores (cliente_id)
  WHERE principal;
CREATE INDEX idx_clientes_corretores_corretor
  ON clientes_corretores (corretor_id);

------------------------------------------------------------------------------
-- Atendimentos (historico de relacionamento com clientes)
------------------------------------------------------------------------------
CREATE TABLE atendimentos (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  cliente_id BIGINT NOT NULL,
  corretor_id BIGINT NOT NULL,
  imovel_id BIGINT,
  tipo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'realizado',
  data_atendimento TIMESTAMPTZ NOT NULL DEFAULT now(),
  descricao TEXT NOT NULL,
  observacoes TEXT,
  criado_por_usuario_id BIGINT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_atendimentos PRIMARY KEY (id),
  CONSTRAINT fk_atendimentos_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_atendimentos_corretor FOREIGN KEY (corretor_id)
    REFERENCES corretores (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_atendimentos_imovel FOREIGN KEY (imovel_id)
    REFERENCES imoveis (id) ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT fk_atendimentos_criado_por FOREIGN KEY (criado_por_usuario_id)
    REFERENCES usuarios (id) ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT ck_atendimentos_tipo CHECK (
    tipo IN ('ligacao', 'whatsapp', 'email', 'visita', 'reuniao', 'outro')
  ),
  CONSTRAINT ck_atendimentos_status CHECK (
    status IN ('agendado', 'realizado', 'cancelado')
  ),
  CONSTRAINT ck_atendimentos_descricao_nao_vazia CHECK (btrim(descricao) <> '')
);

CREATE INDEX idx_atendimentos_cliente_data
  ON atendimentos (cliente_id, data_atendimento DESC);
CREATE INDEX idx_atendimentos_corretor_data
  ON atendimentos (corretor_id, data_atendimento DESC);
CREATE INDEX idx_atendimentos_imovel ON atendimentos (imovel_id);
CREATE INDEX idx_atendimentos_data ON atendimentos (data_atendimento DESC);
CREATE INDEX idx_atendimentos_status ON atendimentos (status);

------------------------------------------------------------------------------
-- Configuracoes do sistema (chave/valor)
------------------------------------------------------------------------------
CREATE TABLE configuracoes (
  chave TEXT NOT NULL,
  valor JSONB NOT NULL,
  descricao TEXT,
  atualizado_por_usuario_id BIGINT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_configuracoes PRIMARY KEY (chave),
  CONSTRAINT fk_configuracoes_atualizado_por FOREIGN KEY (atualizado_por_usuario_id)
    REFERENCES usuarios (id) ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT ck_configuracoes_chave CHECK (
    chave ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
  )
);

CREATE INDEX idx_configuracoes_atualizado_por
  ON configuracoes (atualizado_por_usuario_id);

------------------------------------------------------------------------------
-- Auditoria (somente inclusao; nunca UPDATE/DELETE pela aplicacao)
------------------------------------------------------------------------------
CREATE TABLE auditoria (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  usuario_id BIGINT,
  usuario_email TEXT,
  data_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
  tipo_operacao TEXT NOT NULL,
  entidade TEXT,
  registro_id TEXT,
  resultado TEXT NOT NULL,
  ip INET,
  user_agent TEXT,
  detalhes JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT pk_auditoria PRIMARY KEY (id),
  CONSTRAINT fk_auditoria_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT ck_auditoria_tipo_operacao CHECK (tipo_operacao ~ '^[a-z][a-z0-9_.]*$'),
  CONSTRAINT ck_auditoria_resultado CHECK (resultado IN ('sucesso', 'falha')),
  CONSTRAINT ck_auditoria_registro CHECK (registro_id IS NULL OR btrim(registro_id) <> '')
);

CREATE INDEX idx_auditoria_data ON auditoria (data_hora DESC);
CREATE INDEX idx_auditoria_usuario_data ON auditoria (usuario_id, data_hora DESC);
CREATE INDEX idx_auditoria_entidade_registro ON auditoria (entidade, registro_id);
CREATE INDEX idx_auditoria_tipo ON auditoria (tipo_operacao);
CREATE INDEX idx_auditoria_falhas ON auditoria (data_hora DESC) WHERE resultado = 'falha';

------------------------------------------------------------------------------
-- Triggers de atualizado_em
------------------------------------------------------------------------------
CREATE TRIGGER trg_perfis_atualizado_em
  BEFORE UPDATE ON perfis
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_usuarios_atualizado_em
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_permissoes_usuarios_atualizado_em
  BEFORE UPDATE ON permissoes_usuarios
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_corretores_atualizado_em
  BEFORE UPDATE ON corretores
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_clientes_atualizado_em
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_imoveis_atualizado_em
  BEFORE UPDATE ON imoveis
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_atendimentos_atualizado_em
  BEFORE UPDATE ON atendimentos
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_configuracoes_atualizado_em
  BEFORE UPDATE ON configuracoes
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

------------------------------------------------------------------------------
-- Dados de referencia (nao sao dados de negocio)
------------------------------------------------------------------------------
INSERT INTO perfis (nome, descricao, administrativo) VALUES
  ('Administrador', 'Acesso administrativo completo ao sistema.', true),
  ('Corretor', 'Acesso operacional as rotinas da imobiliaria.', false);

INSERT INTO permissoes (chave, nome, modulo, descricao) VALUES
  ('dashboard.visualizar', 'Visualizar dashboard', 'dashboard', 'Acessar o painel principal.'),
  ('imoveis.visualizar', 'Visualizar imoveis', 'imoveis', 'Consultar a lista e os detalhes dos imoveis.'),
  ('imoveis.criar', 'Cadastrar imoveis', 'imoveis', 'Criar novos imoveis.'),
  ('imoveis.editar', 'Editar imoveis', 'imoveis', 'Alterar dados dos imoveis.'),
  ('imoveis.excluir', 'Excluir imoveis', 'imoveis', 'Excluir logicamente imoveis.'),
  ('imoveis.imagens.gerenciar', 'Gerenciar imagens de imoveis', 'imoveis', 'Enviar, ordenar e remover imagens.'),
  ('corretores.visualizar', 'Visualizar corretores', 'corretores', 'Consultar a lista e os detalhes dos corretores.'),
  ('corretores.criar', 'Cadastrar corretores', 'corretores', 'Criar novos corretores.'),
  ('corretores.editar', 'Editar corretores', 'corretores', 'Alterar dados dos corretores.'),
  ('corretores.desativar', 'Ativar ou desativar corretores', 'corretores', 'Alterar a situacao dos corretores.'),
  ('clientes.visualizar', 'Visualizar clientes', 'clientes', 'Consultar a lista e os detalhes dos clientes.'),
  ('clientes.criar', 'Cadastrar clientes', 'clientes', 'Criar novos clientes.'),
  ('clientes.editar', 'Editar clientes', 'clientes', 'Alterar dados dos clientes.'),
  ('clientes.excluir', 'Excluir clientes', 'clientes', 'Excluir logicamente clientes.'),
  ('atendimentos.visualizar', 'Visualizar atendimentos', 'atendimentos', 'Consultar o historico de atendimentos.'),
  ('atendimentos.criar', 'Registrar atendimentos', 'atendimentos', 'Registrar novos atendimentos.'),
  ('atendimentos.editar', 'Editar atendimentos', 'atendimentos', 'Alterar atendimentos registrados.'),
  ('relatorios.visualizar', 'Visualizar relatorios', 'relatorios', 'Acessar os relatorios gerenciais.'),
  ('relatorios.exportar', 'Exportar relatorios', 'relatorios', 'Exportar relatorios em PDF e CSV.'),
  ('administracao.visualizar', 'Acessar a area administrativa', 'administracao', 'Acessar as telas administrativas.'),
  ('usuarios.gerenciar', 'Gerenciar usuarios', 'administracao', 'Criar, editar e desativar usuarios.'),
  ('permissoes.gerenciar', 'Gerenciar permissoes', 'administracao', 'Configurar permissoes gerais e individuais.'),
  ('configuracoes.gerenciar', 'Gerenciar configuracoes', 'administracao', 'Alterar as configuracoes do sistema.'),
  ('auditoria.visualizar', 'Consultar auditoria', 'administracao', 'Consultar os registros de auditoria.');

INSERT INTO perfis_permissoes (perfil_id, permissao_id)
SELECT p.id, perm.id
FROM perfis p
CROSS JOIN permissoes perm
WHERE p.nome = 'Administrador';

INSERT INTO perfis_permissoes (perfil_id, permissao_id)
SELECT p.id, perm.id
FROM perfis p
JOIN permissoes perm ON perm.chave = ANY (ARRAY[
  'dashboard.visualizar',
  'imoveis.visualizar',
  'imoveis.criar',
  'imoveis.editar',
  'imoveis.imagens.gerenciar',
  'corretores.visualizar',
  'clientes.visualizar',
  'clientes.criar',
  'clientes.editar',
  'atendimentos.visualizar',
  'atendimentos.criar',
  'atendimentos.editar',
  'relatorios.visualizar',
  'relatorios.exportar'
])
WHERE p.nome = 'Corretor';

INSERT INTO configuracoes (chave, valor, descricao) VALUES
  (
    'imoveis.visibilidade',
    to_jsonb('todos'::text),
    'Visibilidade de imoveis para corretores: "todos" ou "vinculados".'
  ),
  (
    'clientes.visibilidade',
    to_jsonb('todos'::text),
    'Visibilidade de clientes para corretores: "todos" ou "vinculados".'
  );

------------------------------------------------------------------------------
-- Documentacao do schema
------------------------------------------------------------------------------
COMMENT ON TABLE perfis IS 'Perfis de acesso (Administrador e Corretor).';
COMMENT ON TABLE usuarios IS 'Usuarios do sistema; administradores nao precisam de registro de corretor.';
COMMENT ON TABLE permissoes IS 'Catalogo de permissoes funcionais do sistema.';
COMMENT ON TABLE perfis_permissoes IS 'Permissoes gerais concedidas por perfil.';
COMMENT ON TABLE permissoes_usuarios IS 'Excecoes individuais; prevalecem sobre as permissoes do perfil.';
COMMENT ON TABLE corretores IS 'Corretores vinculados a um usuario, com dados profissionais.';
COMMENT ON TABLE clientes IS 'Clientes da imobiliaria e preferencias de compra ou locacao.';
COMMENT ON TABLE imoveis IS 'Imoveis administrados, com localizacao, caracteristicas e valores.';
COMMENT ON TABLE imagens_imoveis IS 'Imagens dos imoveis; no maximo uma principal por imovel.';
COMMENT ON TABLE imoveis_corretores IS 'Vinculo N:N entre imoveis e corretores responsaveis.';
COMMENT ON TABLE clientes_corretores IS 'Vinculo N:N entre clientes e corretores responsaveis.';
COMMENT ON TABLE atendimentos IS 'Historico de atendimentos realizados pelos corretores.';
COMMENT ON TABLE configuracoes IS 'Configuracoes chave/valor do sistema.';
COMMENT ON TABLE auditoria IS 'Registro imutavel de eventos relevantes para seguranca e LGPD.';
