import { request, definirCsrfToken, limparCsrfToken } from './api.js';

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

export function possuiPermissao(sessao, permissao) {
  if (!permissao) return true;
  return Boolean(sessao?.usuario?.permissoes?.includes(permissao));
}

export function obterSessao() {
  return sessaoAtual;
}
