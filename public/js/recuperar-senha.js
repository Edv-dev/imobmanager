import { getHealth, request } from './core/api.js';
import { icon } from './components/icons.js';

document.querySelectorAll('[data-icon]').forEach((element) => {
  element.innerHTML = icon(element.dataset.icon, Number(element.dataset.iconSize) || 18);
});

const parametros = new URLSearchParams(window.location.search);
const token = parametros.get('token');

const requestSection = document.getElementById('request-section');
const resetSection = document.getElementById('reset-section');
const successSection = document.getElementById('success-section');
const requestForm = document.getElementById('request-form');
const resetForm = document.getElementById('reset-form');
const requestError = document.getElementById('request-error');
const resetError = document.getElementById('reset-error');
const requestSubmit = document.getElementById('request-submit');
const resetSubmit = document.getElementById('reset-submit');
const requestLabel = requestSubmit.innerHTML;
const resetLabel = resetSubmit.innerHTML;

function mostrarErro(elemento, mensagem) {
  elemento.textContent = mensagem;
  elemento.hidden = false;
}

function limparErro(elemento) {
  elemento.textContent = '';
  elemento.hidden = true;
}

function definirCarregando(botao, rotulo, carregando, mensagem) {
  botao.disabled = carregando;
  botao.setAttribute('aria-busy', String(carregando));
  botao.innerHTML = carregando ? mensagem : rotulo;
}

function exibirSecao(secao) {
  for (const item of [requestSection, resetSection, successSection]) {
    item.hidden = item !== secao;
  }

  const titulo = secao.querySelector('h1');
  if (titulo) {
    titulo.setAttribute('tabindex', '-1');
    titulo.focus({ preventScroll: true });
  }
}

document.querySelectorAll('[data-toggle-password]').forEach((button) => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.target);
    if (!input) return;

    const mostrando = input.type === 'text';
    input.type = mostrando ? 'password' : 'text';
    button.setAttribute('aria-pressed', String(!mostrando));
    button.setAttribute('aria-label', mostrando ? 'Mostrar senha' : 'Ocultar senha');
    button.innerHTML = icon(mostrando ? 'eye' : 'eye-off', 17);
  });
});

function validarPoliticaSenha(senha) {
  if (senha.length < 12) return 'A senha deve ter pelo menos 12 caracteres.';
  if (senha.length > 128) return 'A senha deve ter no máximo 128 caracteres.';
  if (!/[A-Za-zÀ-ÿ]/.test(senha) || !/\d/.test(senha)) {
    return 'A senha deve conter letras e números.';
  }
  if (/^\s|\s$/.test(senha)) {
    return 'A senha não deve começar nem terminar com espaços.';
  }
  return null;
}

if (token) {
  exibirSecao(resetSection);
  document.getElementById('reset-password').focus({ preventScroll: true });
} else {
  exibirSecao(requestSection);
  document.getElementById('recovery-email').focus({ preventScroll: true });
}

requestForm.addEventListener('input', () => limparErro(requestError));

requestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  limparErro(requestError);

  if (!requestForm.reportValidity()) return;

  const email = document.getElementById('recovery-email').value.trim();
  definirCarregando(requestSubmit, requestLabel, true, 'Enviando instruções...');

  try {
    await request('/api/auth/forgot-password', {
      method: 'POST',
      body: { email },
    });

    document.getElementById('success-title').textContent = 'Verifique seu e-mail';
    document.getElementById('success-message').textContent =
      'Se o e-mail informado estiver cadastrado, enviaremos as instruções de recuperação. O link expira em 30 minutos e só pode ser usado uma vez.';
    document.getElementById('success-action').href = '/';
    exibirSecao(successSection);
  } catch (error) {
    const mensagem =
      error.status === 0
        ? 'Não foi possível conectar ao servidor. Tente novamente.'
        : error.message;

    mostrarErro(requestError, mensagem);
    definirCarregando(requestSubmit, requestLabel, false);
  }
});

resetForm.addEventListener('input', () => limparErro(resetError));

resetForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  limparErro(resetError);

  if (!resetForm.reportValidity()) return;

  const novaSenha = document.getElementById('reset-password').value;
  const confirmacao = document.getElementById('reset-confirm').value;
  const politica = validarPoliticaSenha(novaSenha);

  if (politica) {
    mostrarErro(resetError, politica);
    document.getElementById('reset-password').focus();
    return;
  }

  if (novaSenha !== confirmacao) {
    mostrarErro(resetError, 'A confirmação de senha não confere.');
    document.getElementById('reset-confirm').focus();
    return;
  }

  definirCarregando(resetSubmit, resetLabel, true, 'Redefinindo senha...');

  try {
    await request('/api/auth/reset-password', {
      method: 'POST',
      body: { token, novaSenha },
    });

    window.history.replaceState({}, '', '/recuperar-senha.html');

    document.getElementById('success-title').textContent = 'Senha redefinida';
    document.getElementById('success-message').textContent =
      'Sua senha foi alterada e todas as sessões anteriores foram encerradas. Entre novamente com a nova senha.';
    document.getElementById('success-action').href = '/?senha=redefinida';
    document.getElementById('success-action').innerHTML = `
      Entrar com a nova senha
      ${icon('arrow-right', 17)}
    `;
    exibirSecao(successSection);
  } catch (error) {
    const mensagem =
      error.status === 0
        ? 'Não foi possível conectar ao servidor. Tente novamente.'
        : error.message;

    mostrarErro(resetError, mensagem);
    definirCarregando(resetSubmit, resetLabel, false);
  }
});

async function updateServiceStatus() {
  const container = document.getElementById('login-status');
  const dot = container.querySelector('.status-dot');
  const label = container.querySelector('span:last-child');

  const { ok, data } = await getHealth();
  const databaseUp = data?.checks?.database?.status === 'up';

  if (ok && databaseUp) {
    dot.className = 'status-dot status-dot--ok';
    label.textContent = 'Serviços operacionais';
    return;
  }

  if (data) {
    dot.className = 'status-dot status-dot--warn';
    label.textContent = 'Banco de dados indisponível';
    return;
  }

  dot.className = 'status-dot status-dot--error';
  label.textContent = 'Servidor indisponível';
}

updateServiceStatus();
