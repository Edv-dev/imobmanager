'use strict';

const { Router } = require('express');
const clienteController = require('../controllers/cliente.controller');
const { requireAuth, requirePermission } = require('../middlewares/auth');

const router = Router();

router.use(requireAuth);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get(
  '/',
  requirePermission('clientes.visualizar'),
  clienteController.listarClientes
);

router.get(
  '/corretores-opcoes',
  requirePermission('clientes.visualizar'),
  clienteController.listarCorretoresOpcoes
);

router.get(
  '/imoveis-opcoes',
  requirePermission('clientes.visualizar'),
  clienteController.listarImoveisOpcoes
);

router.get(
  '/:id/historico',
  requirePermission('auditoria.visualizar'),
  clienteController.obterHistorico
);

router.get(
  '/:id',
  requirePermission('clientes.visualizar'),
  clienteController.obterCliente
);

router.post('/', requirePermission('clientes.criar'), clienteController.criarCliente);

router.patch(
  '/:id',
  requirePermission('clientes.editar'),
  clienteController.atualizarCliente
);

router.delete(
  '/:id',
  requirePermission('clientes.excluir'),
  clienteController.excluirCliente
);

router.post(
  '/:id/atendimentos',
  requirePermission('atendimentos.criar'),
  clienteController.registrarAtendimento
);

module.exports = router;
