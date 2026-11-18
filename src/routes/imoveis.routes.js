'use strict';

const { Router } = require('express');
const imovelController = require('../controllers/imovel.controller');
const { requireAuth, requirePermission } = require('../middlewares/auth');
const { uploadImagens } = require('../middlewares/upload');

const router = Router();

router.use(requireAuth);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get(
  '/',
  requirePermission('imoveis.visualizar'),
  imovelController.listarImoveis
);

router.get(
  '/corretores-opcoes',
  requirePermission('imoveis.visualizar'),
  imovelController.listarCorretoresOpcoes
);

router.get(
  '/:id/historico',
  requirePermission('auditoria.visualizar'),
  imovelController.obterHistorico
);

router.get(
  '/:id/imagens/:imagemId/arquivo',
  requirePermission('imoveis.visualizar'),
  imovelController.obterArquivoImagem
);

router.get('/:id', requirePermission('imoveis.visualizar'), imovelController.obterImovel);

router.post('/', requirePermission('imoveis.criar'), imovelController.criarImovel);

router.patch(
  '/:id',
  requirePermission('imoveis.editar'),
  imovelController.atualizarImovel
);

router.patch(
  '/:id/situacao',
  requirePermission('imoveis.editar'),
  imovelController.atualizarSituacaoImovel
);

router.delete(
  '/:id',
  requirePermission('imoveis.excluir'),
  imovelController.excluirImovel
);

router.post(
  '/:id/imagens',
  requirePermission('imoveis.imagens.gerenciar'),
  uploadImagens,
  imovelController.enviarImagens
);

router.put(
  '/:id/imagens/ordem',
  requirePermission('imoveis.imagens.gerenciar'),
  imovelController.reordenarImagens
);

router.patch(
  '/:id/imagens/:imagemId/principal',
  requirePermission('imoveis.imagens.gerenciar'),
  imovelController.definirImagemPrincipal
);

router.delete(
  '/:id/imagens/:imagemId',
  requirePermission('imoveis.imagens.gerenciar'),
  imovelController.removerImagem
);

module.exports = router;
