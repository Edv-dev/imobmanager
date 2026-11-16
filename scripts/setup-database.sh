#!/usr/bin/env bash
#
# Cria o usuario e o banco do ImobManager no PostgreSQL local.
# Uso: ./scripts/setup-database.sh
# Requer acesso administrativo ao PostgreSQL (sudo -u postgres ou root).

set -euo pipefail

DB_NAME="${DB_NAME:-imobmanager}"
DB_USER="${DB_USER:-imobmanager}"

if [[ ! "${DB_NAME}" =~ ^[a-z_][a-z0-9_]*$ ]]; then
  echo "Nome de banco invalido: ${DB_NAME}" >&2
  exit 1
fi

if [[ ! "${DB_USER}" =~ ^[a-z_][a-z0-9_]*$ ]]; then
  echo "Nome de usuario invalido: ${DB_USER}" >&2
  exit 1
fi

for command in psql createuser createdb; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "Comando ${command} nao encontrado. Instale o cliente PostgreSQL." >&2
    exit 1
  fi
done

if [[ "${EUID}" -ne 0 ]] && ! command -v sudo >/dev/null 2>&1; then
  echo "Execute como root ou instale o sudo." >&2
  exit 1
fi

run_as_postgres() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  else
    sudo -u postgres "$@"
  fi
}

role_exists="$(run_as_postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}'")"
if [[ "${role_exists}" == "1" ]]; then
  echo "Usuario ${DB_USER} ja existe no PostgreSQL."
else
  echo "Criando usuario ${DB_USER} (a senha sera solicitada)..."
  run_as_postgres createuser --pwprompt "${DB_USER}"
fi

db_exists="$(run_as_postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'")"
if [[ "${db_exists}" == "1" ]]; then
  echo "Banco ${DB_NAME} ja existe."
else
  echo "Criando banco ${DB_NAME} com owner ${DB_USER}..."
  run_as_postgres createdb --owner="${DB_USER}" "${DB_NAME}"
fi

echo ""
echo "Banco configurado. Proximos passos:"
echo "  1. Preencha DB_NAME, DB_USER e DB_PASSWORD no arquivo .env"
echo "  2. npm run migrate:up"
echo "  3. npm run db:check"
