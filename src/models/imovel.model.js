'use strict';

const { query } = require('../config/database');

const IMOVEL_COLUMNS = `
  i.id,
  i.codigo_interno,
  i.titulo,
  i.descricao,
  i.tipo_imovel,
  i.finalidade,
  i.cep,
  i.estado,
  i.cidade,
  i.bairro,
  i.logradouro,
  i.numero,
  i.complemento,
  i.area_total,
  i.area_construida,
  i.quartos,
  i.banheiros,
  i.suites,
  i.vagas_garagem,
  i.mobiliado,
  i.caracteristicas,
  i.valor_venda,
  i.valor_aluguel,
  i.valor_condominio,
  i.valor_iptu,
  i.situacao,
  i.criado_por_usuario_id,
  i.criado_em,
  i.atualizado_em
`;

const IMAGEM_COLUMNS = `
  img.id,
  img.imovel_id,
  img.caminho_arquivo,
  img.nome_original,
  img.mime_type,
  img.tamanho_bytes,
  img.ordem,
  img.principal,
  img.criado_em
`;

const IMAGEM_RETURNING = `
  id,
  imovel_id,
  caminho_arquivo,
  nome_original,
  mime_type,
  tamanho_bytes,
  ordem,
  principal,
  criado_em
`;

function condicoesListagem({ filtros = {}, visibilidade }) {
  const condicoes = ['i.excluido_em IS NULL'];
  const params = [...(visibilidade?.params || [])];

  if (visibilidade?.sql) {
    condicoes.push(`(${visibilidade.sql})`);
  }

  if (filtros.busca) {
    params.push(`%${filtros.busca}%`);
    condicoes.push(`(
      i.codigo_interno ILIKE $${params.length}
      OR i.titulo ILIKE $${params.length}
      OR i.cidade ILIKE $${params.length}
      OR i.bairro ILIKE $${params.length}
      OR i.logradouro ILIKE $${params.length}
    )`);
  }

  if (filtros.tipo) {
    params.push(filtros.tipo);
    condicoes.push(`i.tipo_imovel = $${params.length}`);
  }

  if (filtros.finalidade) {
    params.push(filtros.finalidade);
    condicoes.push(`i.finalidade = $${params.length}`);
  }

  if (filtros.situacao) {
    params.push(filtros.situacao);
    condicoes.push(`i.situacao = $${params.length}`);
  }

  if (filtros.cidade) {
    params.push(`%${filtros.cidade}%`);
    condicoes.push(`i.cidade ILIKE $${params.length}`);
  }

  if (filtros.bairro) {
    params.push(`%${filtros.bairro}%`);
    condicoes.push(`i.bairro ILIKE $${params.length}`);
  }

  if (filtros.valorMin !== undefined) {
    params.push(filtros.valorMin);
    condicoes.push(`COALESCE(i.valor_venda, i.valor_aluguel, 0) >= $${params.length}`);
  }

  if (filtros.valorMax !== undefined) {
    params.push(filtros.valorMax);
    condicoes.push(`COALESCE(i.valor_venda, i.valor_aluguel, 0) <= $${params.length}`);
  }

  return { where: condicoes.join(' AND '), params };
}

async function listar({ filtros, visibilidade, pagina = 1, limite = 10 }) {
  const { where, params } = condicoesListagem({ filtros, visibilidade });
  const { rows: totais } = await query(
    `SELECT count(*)::int AS total FROM imoveis i WHERE ${where}`,
    params
  );

  const dadosParams = [...params, limite, (pagina - 1) * limite];
  const { rows } = await query(
    `SELECT ${IMOVEL_COLUMNS},
            capa.id AS capa_id,
            capa.caminho_arquivo AS capa_caminho,
            capa.mime_type AS capa_mime,
            COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'id', c.id,
                  'nome', c.nome_completo,
                  'creci', c.creci,
                  'principal', ic.principal
                )
                ORDER BY ic.principal DESC, c.nome_completo ASC
              ) FILTER (WHERE c.id IS NOT NULL),
              '[]'::jsonb
            ) AS corretores
       FROM imoveis i
       LEFT JOIN LATERAL (
         SELECT img.id, img.caminho_arquivo, img.mime_type
           FROM imagens_imoveis img
          WHERE img.imovel_id = i.id
          ORDER BY img.principal DESC, img.ordem ASC, img.id ASC
          LIMIT 1
       ) capa ON true
       LEFT JOIN imoveis_corretores ic ON ic.imovel_id = i.id
       LEFT JOIN corretores c
         ON c.id = ic.corretor_id
        AND c.excluido_em IS NULL
      WHERE ${where}
      GROUP BY i.id, capa.id, capa.caminho_arquivo, capa.mime_type
      ORDER BY i.atualizado_em DESC, i.id DESC
      LIMIT $${dadosParams.length - 1}
     OFFSET $${dadosParams.length}`,
    dadosParams
  );

  return { imoveis: rows, total: totais[0].total };
}

async function buscarPorId(id) {
  const { rows } = await query(
    `SELECT ${IMOVEL_COLUMNS}
       FROM imoveis i
      WHERE i.id = $1
        AND i.excluido_em IS NULL
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function buscarPorCodigo(codigo, ignorarId = null) {
  const { rows } = await query(
    `SELECT id FROM imoveis
      WHERE upper(btrim(codigo_interno)) = upper(btrim($1))
        AND excluido_em IS NULL
        AND ($2::bigint IS NULL OR id <> $2)
      LIMIT 1`,
    [codigo, ignorarId]
  );
  return rows[0] || null;
}

async function criar(client, dados) {
  const { rows } = await client.query(
    `INSERT INTO imoveis
       (codigo_interno, titulo, descricao, tipo_imovel, finalidade,
        cep, estado, cidade, bairro, logradouro, numero, complemento,
        area_total, area_construida, quartos, banheiros, suites, vagas_garagem,
        mobiliado, caracteristicas, valor_venda, valor_aluguel, valor_condominio,
        valor_iptu, situacao, criado_por_usuario_id)
     VALUES ($1, $2, $3, $4, $5,
             $6, $7, $8, $9, $10, $11, $12,
             $13, $14, $15, $16, $17, $18,
             $19, $20::text[], $21, $22, $23,
             $24, $25, $26)
     RETURNING id`,
    [
      dados.codigo,
      dados.titulo,
      dados.descricao,
      dados.tipo,
      dados.finalidade,
      dados.cep,
      dados.estado,
      dados.cidade,
      dados.bairro,
      dados.logradouro,
      dados.numero,
      dados.complemento,
      dados.areaTotal,
      dados.areaConstruida,
      dados.quartos,
      dados.banheiros,
      dados.suites,
      dados.vagasGaragem,
      dados.mobiliado,
      dados.caracteristicas,
      dados.valorVenda,
      dados.valorAluguel,
      dados.valorCondominio,
      dados.valorIptu,
      dados.situacao,
      dados.criadoPorUsuarioId,
    ]
  );
  return rows[0];
}

async function atualizar(client, imovelId, dados) {
  const { rows } = await client.query(
    `UPDATE imoveis
        SET codigo_interno = $2,
            titulo = $3,
            descricao = $4,
            tipo_imovel = $5,
            finalidade = $6,
            cep = $7,
            estado = $8,
            cidade = $9,
            bairro = $10,
            logradouro = $11,
            numero = $12,
            complemento = $13,
            area_total = $14,
            area_construida = $15,
            quartos = $16,
            banheiros = $17,
            suites = $18,
            vagas_garagem = $19,
            mobiliado = $20,
            caracteristicas = $21::text[],
            valor_venda = $22,
            valor_aluguel = $23,
            valor_condominio = $24,
            valor_iptu = $25,
            situacao = $26
      WHERE id = $1
        AND excluido_em IS NULL
      RETURNING id`,
    [
      imovelId,
      dados.codigo,
      dados.titulo,
      dados.descricao,
      dados.tipo,
      dados.finalidade,
      dados.cep,
      dados.estado,
      dados.cidade,
      dados.bairro,
      dados.logradouro,
      dados.numero,
      dados.complemento,
      dados.areaTotal,
      dados.areaConstruida,
      dados.quartos,
      dados.banheiros,
      dados.suites,
      dados.vagasGaragem,
      dados.mobiliado,
      dados.caracteristicas,
      dados.valorVenda,
      dados.valorAluguel,
      dados.valorCondominio,
      dados.valorIptu,
      dados.situacao,
    ]
  );
  return rows[0] || null;
}

async function atualizarSituacao(client, imovelId, situacao) {
  const { rows } = await client.query(
    `UPDATE imoveis
        SET situacao = $2
      WHERE id = $1
        AND excluido_em IS NULL
      RETURNING id`,
    [imovelId, situacao]
  );
  return rows[0] || null;
}

async function excluirLogicamente(client, imovelId) {
  const { rows } = await client.query(
    `UPDATE imoveis
        SET excluido_em = now()
      WHERE id = $1
        AND excluido_em IS NULL
      RETURNING id`,
    [imovelId]
  );
  return rows[0] || null;
}

async function listarImagens(imovelId, client = null) {
  const executor = client || { query };
  const { rows } = await executor.query(
    `SELECT ${IMAGEM_COLUMNS}
       FROM imagens_imoveis img
      WHERE img.imovel_id = $1
      ORDER BY img.ordem ASC, img.id ASC`,
    [imovelId]
  );
  return rows;
}

async function buscarImagem(imovelId, imagemId) {
  const { rows } = await query(
    `SELECT ${IMAGEM_COLUMNS}
       FROM imagens_imoveis img
      WHERE img.imovel_id = $1
        AND img.id = $2
      LIMIT 1`,
    [imovelId, imagemId]
  );
  return rows[0] || null;
}

async function contarImagens(imovelId) {
  const { rows } = await query(
    `SELECT count(*)::int AS total
       FROM imagens_imoveis
      WHERE imovel_id = $1`,
    [imovelId]
  );
  return rows[0].total;
}

async function proximaOrdem(imovelId) {
  const { rows } = await query(
    `SELECT COALESCE(max(ordem), -1) + 1 AS proxima
       FROM imagens_imoveis
      WHERE imovel_id = $1`,
    [imovelId]
  );
  return rows[0].proxima;
}

async function criarImagem(client, dados) {
  const { rows } = await client.query(
    `INSERT INTO imagens_imoveis
       (imovel_id, caminho_arquivo, nome_original, mime_type, tamanho_bytes, ordem, principal)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${IMAGEM_RETURNING}`,
    [
      dados.imovelId,
      dados.caminhoArquivo,
      dados.nomeOriginal,
      dados.mimeType,
      dados.tamanhoBytes,
      dados.ordem,
      dados.principal,
    ]
  );
  return rows[0];
}

async function excluirImagem(client, imovelId, imagemId) {
  const { rows } = await client.query(
    `DELETE FROM imagens_imoveis
      WHERE imovel_id = $1
        AND id = $2
      RETURNING ${IMAGEM_RETURNING}`,
    [imovelId, imagemId]
  );
  return rows[0] || null;
}

async function definirImagemPrincipal(client, imovelId, imagemId) {
  await client.query(
    `UPDATE imagens_imoveis
        SET principal = false
      WHERE imovel_id = $1
        AND principal`,
    [imovelId]
  );

  const { rows } = await client.query(
    `UPDATE imagens_imoveis
        SET principal = true
      WHERE imovel_id = $1
        AND id = $2
      RETURNING ${IMAGEM_RETURNING}`,
    [imovelId, imagemId]
  );
  return rows[0] || null;
}

async function atualizarOrdens(client, imovelId, ids) {
  for (const [indice, imagemId] of ids.entries()) {
    await client.query(
      `UPDATE imagens_imoveis
          SET ordem = $3
        WHERE imovel_id = $1
          AND id = $2`,
      [imovelId, imagemId, indice]
    );
  }
}

async function listarCorretores(imovelId) {
  const { rows } = await query(
    `SELECT c.id,
            c.nome_completo,
            c.creci,
            c.email,
            c.telefone,
            c.ativo,
            ic.principal
       FROM imoveis_corretores ic
       JOIN corretores c ON c.id = ic.corretor_id
      WHERE ic.imovel_id = $1
        AND c.excluido_em IS NULL
      ORDER BY ic.principal DESC, c.nome_completo ASC`,
    [imovelId]
  );
  return rows;
}

async function buscarCorretoresPorIds(ids) {
  if (ids.length === 0) return [];

  const { rows } = await query(
    `SELECT c.id, c.nome_completo, c.ativo
       FROM corretores c
       JOIN usuarios u ON u.id = c.usuario_id
       JOIN perfis p ON p.id = u.perfil_id
      WHERE c.id = ANY($1::bigint[])
        AND c.excluido_em IS NULL
        AND u.excluido_em IS NULL
        AND p.administrativo = false`,
    [ids]
  );
  return rows;
}

async function listarCorretoresDisponiveis() {
  const { rows } = await query(
    `SELECT c.id,
            c.nome_completo,
            c.creci,
            c.email,
            c.ativo,
            u.email AS usuario_email
       FROM corretores c
       JOIN usuarios u ON u.id = c.usuario_id
       JOIN perfis p ON p.id = u.perfil_id
      WHERE c.excluido_em IS NULL
        AND u.excluido_em IS NULL
        AND p.administrativo = false
        AND c.ativo
        AND u.ativo
      ORDER BY c.nome_completo ASC, c.id ASC
      LIMIT 500`
  );
  return rows;
}

async function substituirCorretores(client, imovelId, corretores) {
  await client.query('DELETE FROM imoveis_corretores WHERE imovel_id = $1', [imovelId]);

  for (const corretor of corretores) {
    await client.query(
      `INSERT INTO imoveis_corretores (imovel_id, corretor_id, principal)
       VALUES ($1, $2, $3)`,
      [imovelId, corretor.id, corretor.principal]
    );
  }
}

module.exports = {
  listar,
  buscarPorId,
  buscarPorCodigo,
  criar,
  atualizar,
  atualizarSituacao,
  excluirLogicamente,
  listarImagens,
  buscarImagem,
  contarImagens,
  proximaOrdem,
  criarImagem,
  excluirImagem,
  definirImagemPrincipal,
  atualizarOrdens,
  listarCorretores,
  buscarCorretoresPorIds,
  listarCorretoresDisponiveis,
  substituirCorretores,
};
