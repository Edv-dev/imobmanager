'use strict';

const { checkDatabase, closePool } = require('../src/config/database');

async function main() {
  const result = await checkDatabase();

  if (result.status === 'up') {
    console.log(`Banco de dados acessível (latência: ${result.latencyMs} ms).`);
  } else {
    console.error('Banco de dados inacessível. Verifique as variáveis DB_* no arquivo .env.');
  }

  await closePool();
  process.exit(result.status === 'up' ? 0 : 1);
}

main().catch(async (error) => {
  console.error('Falha ao verificar o banco de dados:', error.message);
  process.exit(1);
});
