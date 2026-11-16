-- Reverte a migration 001_initial_schema.
-- A ordem respeita as dependencias de chaves estrangeiras.

DROP TABLE auditoria;
DROP TABLE configuracoes;
DROP TABLE atendimentos;
DROP TABLE clientes_corretores;
DROP TABLE imoveis_corretores;
DROP TABLE imagens_imoveis;
DROP TABLE imoveis;
DROP TABLE clientes;
DROP TABLE corretores;
DROP TABLE permissoes_usuarios;
DROP TABLE perfis_permissoes;
DROP TABLE permissoes;
DROP TABLE usuarios;
DROP TABLE perfis;

DROP FUNCTION set_atualizado_em();
