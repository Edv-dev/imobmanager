import { getHealth, request } from './core/api.js';
import { icon } from './components/icons.js';
import { showToast } from './components/toast.js';

document.querySelectorAll('[data-icon]').forEach((element) => {
  element.innerHTML = icon(element.dataset.icon, Number(element.dataset.iconSize) || 18);
});

const form = document.getElementById('login-form');
const passwordInput = document.getElementById('login-password');
const togglePassword = document.querySelector('[data-toggle-password]');
const errorBox = document.getElementById('login-error');
const submitButton = form.querySelector('button[type="submit"]');
const submitLabel = submitButton.innerHTML;

function mostrarErro(mensagem) {
  errorBox.textContent = mensagem;
  errorBox.hidden = false;
}

function limparErro() {
  errorBox.textContent = '';
  errorBox.hidden = true;
}

function definirCarregando(carregando) {
  submitButton.disabled = carregando;
  submitButton.setAttribute('aria-busy', String(carregando));
  submitButton.innerHTML = carregando
    ? 'Verificando acesso...'
    : submitLabel;
}

togglePassword.addEventListener('click', () => {
  const showing = passwordInput.type === 'text';
  passwordInput.type = showing ? 'password' : 'text';
  togglePassword.setAttribute('aria-pressed', String(!showing));
  togglePassword.setAttribute(
    'aria-label',
    showing ? 'Mostrar senha' : 'Ocultar senha'
  );
  togglePassword.innerHTML = icon(showing ? 'eye' : 'eye-off', 17);
});

form.addEventListener('input', limparErro);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  limparErro();

  if (!form.reportValidity()) return;

  const email = document.getElementById('login-email').value.trim();
  const password = passwordInput.value;
  const lembrar = document.getElementById('login-remember').checked;

  definirCarregando(true);

  try {
    await request('/api/auth/login', {
      method: 'POST',
      body: { email, password, lembrar },
    });

    window.location.assign('/app.html');
  } catch (error) {
    const mensagem =
      error.status === 0
        ? 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
        : error.message;

    mostrarErro(mensagem || 'Não foi possível entrar. Verifique os dados e tente novamente.');
    passwordInput.focus();
    passwordInput.select();
    definirCarregando(false);
  }
});

const parametros = new URLSearchParams(window.location.search);

if (parametros.get('sessao') === 'expirada') {
  showToast({
    type: 'warning',
    title: 'Sessão encerrada',
    message: 'Sua sessão expirou. Entre novamente para continuar.',
    timeout: 7000,
  });
}

if (parametros.get('senha') === 'redefinida') {
  showToast({
    type: 'success',
    title: 'Senha redefinida',
    message: 'Entre com sua nova senha para acessar o sistema.',
    timeout: 7000,
  });
}

if (parametros.has('sessao') || parametros.has('senha')) {
  window.history.replaceState({}, '', window.location.pathname);
}

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
