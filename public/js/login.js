import { getHealth } from './core/api.js';
import { icon } from './components/icons.js';
import { showToast } from './components/toast.js';

document.querySelectorAll('[data-icon]').forEach((element) => {
  element.innerHTML = icon(element.dataset.icon, Number(element.dataset.iconSize) || 18);
});

const form = document.getElementById('login-form');
const passwordInput = document.getElementById('login-password');
const togglePassword = document.querySelector('[data-toggle-password]');

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

form.addEventListener('submit', (event) => {
  event.preventDefault();

  if (!form.reportValidity()) return;

  showToast({
    type: 'info',
    title: 'Login em pré-visualização',
    message:
      'A autenticação será implementada na etapa 04. Para explorar as telas, use o link "Acessar prévia do sistema".',
    timeout: 7000,
  });
});

document.querySelector('[data-action="forgot-password"]').addEventListener('click', (event) => {
  event.preventDefault();
  showToast({
    type: 'info',
    title: 'Recuperação de senha',
    message:
      'A recuperação de senha será disponibilizada junto com a autenticação, na etapa 04.',
  });
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
