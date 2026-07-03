const admin = require('firebase-admin');
const { buildDocs } = require('./seedOperationalValidation');

const DEFAULT_PROJECT_ID = 'fju-operational-emulator';
const DEFAULT_TEST_PASSWORD = 'FjuBlock7!2026';
const PREFIX = 'ov_';

function parseArgs(argv) {
  const args = {
    reset: false,
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || DEFAULT_PROJECT_ID,
  };

  for (const arg of argv) {
    if (arg === '--reset') args.reset = true;
    else if (arg.startsWith('--project-id=')) args.projectId = arg.split('=')[1];
  }

  return args;
}

function getAuthEmulatorHost() {
  return process.env.FIREBASE_AUTH_EMULATOR_HOST || null;
}

function assertAuthEmulatorTarget(projectId, authEmulatorHost = getAuthEmulatorHost()) {
  if (!authEmulatorHost) {
    throw new Error('seedAuthEmulator deve rodar somente com FIREBASE_AUTH_EMULATOR_HOST definido.');
  }

  if (!projectId) {
    throw new Error('Informe --project-id=<id> para o Auth Emulator.');
  }

  const lower = projectId.toLowerCase();
  if (lower === 'fju-championship' || lower.includes('prod') || lower.includes('production')) {
    throw new Error(`Recusado: alvo "${projectId}" parece projeto de producao.`);
  }

  return { projectId, authEmulatorHost };
}

function getTestPassword() {
  return process.env.FJU_TEST_PASSWORD || DEFAULT_TEST_PASSWORD;
}

function buildTestAuthUsers(password = getTestPassword()) {
  return Object.values(buildDocs())
    .filter((doc) => doc && doc.id && doc.email && doc.id.startsWith(PREFIX))
    .map((doc) => ({
      uid: doc.id,
      email: doc.email,
      emailVerified: true,
      displayName: doc.name,
      password,
    }));
}

function initialize(projectId) {
  try {
    admin.app();
  } catch {
    admin.initializeApp({ projectId });
  }
  const { getAuth } = require('firebase-admin/auth');
  return getAuth();
}

async function resetAuthEmulator(projectId, authEmulatorHost) {
  const response = await fetch(`http://${authEmulatorHost}/emulator/v1/projects/${projectId}/accounts`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Falha ao resetar Auth Emulator: HTTP ${response.status}`);
  }
}

async function seedAuthUsers(auth, users = buildTestAuthUsers()) {
  let created = 0;
  let updated = 0;

  for (const user of users) {
    try {
      await auth.createUser(user);
      created += 1;
    } catch (error) {
      if (error.code !== 'auth/uid-already-exists' && error.code !== 'auth/email-already-exists') {
        throw error;
      }

      await auth.updateUser(user.uid, {
        email: user.email,
        emailVerified: user.emailVerified,
        displayName: user.displayName,
        password: user.password,
      });
      updated += 1;
    }
  }

  return { created, updated, total: users.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const environment = assertAuthEmulatorTarget(args.projectId);

  console.log(`[seed:auth] projeto=${environment.projectId}`);
  console.log(`[seed:auth] authEmulator=${environment.authEmulatorHost}`);
  console.log(`[seed:auth] reset=${args.reset ? 'sim' : 'nao'}`);

  if (args.reset) {
    await resetAuthEmulator(environment.projectId, environment.authEmulatorHost);
    console.log('[seed:auth] reset concluido.');
  }

  const auth = initialize(environment.projectId);
  const result = await seedAuthUsers(auth);
  console.log(`[seed:auth] usuarios alvo=${result.total} criados=${result.created} atualizados=${result.updated}`);
  console.log('[seed:auth] senha de teste nao registrada no log.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[seed:auth] falha:', error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  assertAuthEmulatorTarget,
  buildTestAuthUsers,
  parseArgs,
  resetAuthEmulator,
  seedAuthUsers,
};
