const DEFAULT_ERROR_MESSAGE = 'Não foi possível concluir a solicitação.';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

let csrfToken = null;

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function definirCsrfToken(token) {
  csrfToken = typeof token === 'string' && token ? token : null;
}

export function limparCsrfToken() {
  csrfToken = null;
}

async function interpretarResposta(response) {
  let data = null;
  const text = await response.text();

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      data?.error?.message || DEFAULT_ERROR_MESSAGE,
      response.status,
      data?.error?.code
    );
  }

  return data;
}

export async function request(path, options = {}) {
  const { method = 'GET', body, headers = {} } = options;
  const methodUpper = method.toUpperCase();
  const enviarCsrf = csrfToken && !SAFE_METHODS.has(methodUpper);

  const response = await fetch(path, {
    method: methodUpper,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(enviarCsrf ? { 'X-CSRF-Token': csrfToken } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return interpretarResposta(response);
}

export async function requestForm(path, formData, options = {}) {
  const { method = 'POST', headers = {} } = options;
  const methodUpper = method.toUpperCase();
  const enviarCsrf = csrfToken && !SAFE_METHODS.has(methodUpper);

  const response = await fetch(path, {
    method: methodUpper,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(enviarCsrf ? { 'X-CSRF-Token': csrfToken } : {}),
      ...headers,
    },
    body: formData,
  });

  return interpretarResposta(response);
}

export function sinalizarSaidaKeepalive() {
  if (!csrfToken) return;

  fetch('/api/auth/leave', {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: '{}',
  }).catch(() => {});
}

export async function getHealth() {
  try {
    const response = await fetch('/api/health', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}
