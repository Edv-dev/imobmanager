import { request, definirCsrfToken, limparCsrfToken } from './api.js';

export const CHAVE_SAIDA = 'imobmanager:saida';

let sessaoAtual = null;

export async function carregarSessao() {
  const sessao = await request('/api/auth/session');

  sessaoAtual = sessao;
  definirCsrfToken(sessao.csrfToken);

  return sessao;
}

export function encerrarSessaoLocal() {
  sessaoAtual = null;
  limparCsrfToken();
}

export async function encerrarSessaoRemota() {
  await request('/api/auth/logout', { method: 'POST' }).catch(() => {});
  encerrarSessaoLocal();
}

export async function retomarSessaoRemota() {
  await request('/api/auth/resume', { method: 'POST' }).catch(() => {});
}

export function possuiPermissao(sessao, permissao) {
  if (!permissao) return true;
  return Boolean(sessao?.usuario?.permissoes?.includes(permissao));
}

export function obterSessao() {
  return sessaoAtual;
}
