const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

const { COLLECTIONS } = require('./legacyDataCore');

function parseArgs(argv) {
  const parsed = {
    categories: [],
    apply: false,
    dryRun: true,
    nonInteractive: false,
    confirmProduction: false,
    requireBackupConfirmation: false,
    backupConfirmed: false,
  };
  for (const arg of argv) {
    if (arg === '--apply') {
      parsed.apply = true;
      parsed.dryRun = false;
    } else if (arg === '--dry-run') {
      parsed.dryRun = true;
      parsed.apply = false;
    } else if (arg === '--non-interactive') {
      parsed.nonInteractive = true;
    } else if (arg === '--confirm-production') {
      parsed.confirmProduction = true;
    } else if (arg === '--require-backup-confirmation') {
      parsed.requireBackupConfirmation = true;
    } else if (arg === '--backup-confirmed') {
      parsed.backupConfirmed = true;
    } else if (arg.startsWith('--category=')) {
      parsed.categories.push(arg.split('=')[1]);
    } else if (arg.startsWith('--championship-id=')) {
      parsed.championshipId = arg.split('=')[1];
    } else if (arg.startsWith('--team-id=')) {
      parsed.teamId = arg.split('=')[1];
    } else if (arg.startsWith('--limit=')) {
      parsed.limit = Number(arg.split('=')[1]);
    } else if (arg.startsWith('--project-id=')) {
      parsed.projectId = arg.split('=')[1];
    } else if (arg.startsWith('--out-dir=')) {
      parsed.outDir = arg.split('=')[1];
    }
  }
  return parsed;
}

function getProjectId(args) {
  return args.projectId || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
}

function getEnvironment(projectId) {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const productionLike = !emulatorHost && /prod|production|fju-championship/i.test(projectId || '');
  return {
    emulatorHost,
    name: emulatorHost ? 'emulator' : productionLike ? 'production-like' : 'admin',
    productionLike,
  };
}

function assertSafety(args) {
  const projectId = getProjectId(args);
  if (!projectId) {
    throw new Error('Informe --project-id=<id> ou FIREBASE_PROJECT_ID/GCLOUD_PROJECT.');
  }
  const environment = getEnvironment(projectId);
  if (args.apply) {
    console.warn('[backup] Antes do --apply, exporte o Firestore. Sugestao: firebase firestore:export gs://<bucket>/backups/block-6 --project', projectId);
    if (args.requireBackupConfirmation && !args.backupConfirmed) {
      throw new Error('Backup exigido, mas --backup-confirmed nao foi informado.');
    }
    if (environment.productionLike && !args.confirmProduction) {
      throw new Error('Ambiente parece producao. Use --confirm-production apenas apos dry-run, backup e revisao manual.');
    }
    if (!environment.emulatorHost && !process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.APPLICATION_DEFAULT_CREDENTIALS) {
      throw new Error('Credencial administrativa externa ausente. Configure GOOGLE_APPLICATION_CREDENTIALS ou use o Emulator.');
    }
  }
  return { projectId, environment };
}

function initializeFirestore(projectId) {
  try {
    admin.app();
  } catch {
    admin.initializeApp({ projectId });
  }
  return getFirestore();
}

function mapDocs(snapshot) {
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function fetchDataset(db, filters = {}) {
  const dataset = {};
  for (const collection of COLLECTIONS) {
    let ref = db.collection(collection);
    if (filters.championshipId && ['teams', 'players', 'matches', 'match_events', 'match_convocations', 'match_attendance', 'round_awards'].includes(collection)) {
      ref = ref.where('championshipId', '==', filters.championshipId);
    }
    if (filters.teamId && ['players', 'match_convocations', 'match_attendance'].includes(collection)) {
      ref = ref.where('teamId', '==', filters.teamId);
    }
    const snap = await ref.get();
    dataset[collection] = mapDocs(snap);
  }
  let legacyQuery = db.collectionGroup('convocations');
  const legacySnap = await legacyQuery.get();
  dataset.legacyConvocations = legacySnap.docs.map((doc) => {
    const teamRef = doc.ref.parent.parent;
    return {
      id: doc.id,
      round: doc.id,
      teamId: teamRef ? teamRef.id : undefined,
      path: doc.ref.path,
      ...doc.data(),
    };
  }).filter((doc) => !filters.teamId || doc.teamId === filters.teamId);
  return dataset;
}

async function applyChanges(db, changes) {
  const batches = [];
  let current = db.batch();
  let opCount = 0;
  for (const change of changes) {
    const ref = db.collection(change.collection).doc(change.id);
    if (change.operation === 'set') current.set(ref, change.after, { merge: false });
    else if (change.operation === 'update') current.update(ref, change.after);
    opCount += 1;
    if (opCount % 450 === 0) {
      batches.push(current);
      current = db.batch();
    }
  }
  batches.push(current);
  for (const batch of batches) {
    await batch.commit();
  }
  return opCount;
}

module.exports = {
  parseArgs,
  assertSafety,
  initializeFirestore,
  fetchDataset,
  applyChanges,
  getProjectId,
  getEnvironment,
};
