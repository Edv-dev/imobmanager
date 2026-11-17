'use strict';

const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const { pool } = require('../src/config/database');
const usuarioModel = require('../src/models/usuario.model');
const auditoria = require('../src/models/auditoria.model');
const { hashPassword } = require('../src/utils/password');
const {
  normalizeEmail,
  isValidEmail,
  normalizeName,
  isValidName,
  passwordPolicyError,
} = require('../src/utils/validators');

function perguntarSenha(label) {
  return new Promise((resolve) => {
    stdout.write(label);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let valor = '';

    const finalizar = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', aoDigitar);
    };

    const aoDigitar = (entrada) => {
      for (const caractere of entrada) {
        if (caractere === '\n' || caractere === '\r' || caractere === '\u0004') {
          finalizar();
          stdout.write('\n');
          resolve(valor);
          return;
        }

        if (caractere === '\u0003') {
          finalizar();
          stdout.write('\n');
          process.exit(130);
        }

        if (caractere === '\u007f' || caractere === '\b') {
          if (valor.length > 0) {
            valor = valor.slice(0, -1);
            stdout.write('\b \b');
          }
          continue;
        }

        valor += caractere;
        stdout.write('*');
      }
    };

    stdin.on('data', aoDigitar);
  });
}

async function main() {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error(
      'Este comando deve ser executado em um terminal interativo para não expor a senha em histórico ou logs.'
    );
  }

  console.log('ImobManager · criação do administrador inicial');
  console.log('Nenhuma credencial padrão é criada automaticamente.\n');

  const rl = readline.createInterface({ input: stdin, output: stdout });

  let nome;
  let email;
  let senha;
  let confirmacao;

  try {
    nome = normalizeName(await rl.question('Nome completo: '));
    email = normalizeEmail(await rl.question('E-mail: '));
    senha = await perguntarSenha('Senha (mínimo de 12 caracteres, com letras e números): ');
    confirmacao = await perguntarSenha('Confirme a senha: ');
  } finally {
    rl.close();
  }

  if (!isValidName(nome)) {
    throw new Error('Informe um nome completo com pelo menos 3 caracteres.');
  }

  if (!isValidEmail(email)) {
    throw new Error('Informe um e-mail válido.');
  }

  const politica = passwordPolicyError(senha);

  if (politica) {
    throw new Error(politica);
  }

  if (senha !== confirmacao) {
    throw new Error('A confirmação de senha não confere.');
  }

  const existente = await usuarioModel.buscarPorEmail(email);

  if (existente) {
    throw new Error(`Já existe um usuário com o e-mail ${email}.`);
  }

  const senhaHash = await hashPassword(senha);
  const criado = await usuarioModel.criarAdministrador({
    nome,
    email,
    senhaHash,
  });

  if (!criado) {
    throw new Error('Perfil Administrador não encontrado. Execute npm run migrate:up.');
  }

  await auditoria.registrarSeguro({
    usuarioId: criado.id,
    usuarioEmail: criado.email,
    tipoOperacao: 'auth.administrador_inicial_criado',
    entidade: 'usuarios',
    registroId: String(criado.id),
    resultado: 'sucesso',
    detalhes: { origem: 'script_cli' },
  });

  console.log(`\nAdministrador criado: ${criado.nome_completo} <${criado.email}>`);
  console.log('Acesse o sistema e altere a senha quando necessário.');
}

main()
  .catch((error) => {
    console.error(`\n[admin:create] ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
