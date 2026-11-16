'use strict';

const apiStatus = document.getElementById('api-status');
const dbStatus = document.getElementById('db-status');
const environment = document.getElementById('environment');
const uptime = document.getElementById('uptime');
const lastChecked = document.getElementById('last-checked');
const refreshButton = document.getElementById('refresh-button');

function setState(element, state, text) {
  element.dataset.state = state;
  element.textContent = text;
}

function formatUptime(seconds) {
  if (typeof seconds !== 'number' || Number.isNaN(seconds)) return '—';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) return `${hours}h ${minutes}min`;
  if (minutes > 0) return `${minutes}min ${secs}s`;
  return `${secs}s`;
}

async function checkHealth() {
  refreshButton.disabled = true;

  try {
    const response = await fetch('/api/health', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    const data = await response.json();

    const apiOnline = response.status === 200 || response.status === 503;
    setState(apiStatus, apiOnline ? 'ok' : 'error', apiOnline ? 'Online' : 'Indisponível');

    const database = data?.checks?.database;
    if (database?.status === 'up') {
      const latency = typeof database.latencyMs === 'number' ? ` (${database.latencyMs} ms)` : '';
      setState(dbStatus, 'ok', `Conectado${latency}`);
    } else {
      setState(dbStatus, 'error', 'Sem conexão');
    }

    environment.textContent = data?.environment || '—';
    uptime.textContent = formatUptime(data?.uptimeSeconds);
  } catch (error) {
    setState(apiStatus, 'error', 'Sem resposta');
    setState(dbStatus, 'error', 'Desconhecido');
    environment.textContent = '—';
    uptime.textContent = '—';
  } finally {
    lastChecked.textContent = `Última verificação: ${new Date().toLocaleTimeString('pt-BR')}`;
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener('click', checkHealth);

checkHealth();
