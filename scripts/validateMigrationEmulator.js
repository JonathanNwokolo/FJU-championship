const fs = require('fs');
const path = require('path');

const { docs } = require('./seedMigrationEmulatorData');
const {
  auditLegacyData,
  buildBackfillPlan,
  toMarkdownReport,
  toManualReviewMarkdown,
} = require('./migration/legacyDataCore');
const {
  assertSafety,
  initializeFirestore,
  fetchDataset,
  applyChanges,
} = require('./migration/firestoreAdmin');
const { timestampForFile } = require('./auditLegacyData');

function parseProjectId(argv) {
  const arg = argv.find((item) => item.startsWith('--project-id='));
  return arg ? arg.split('=')[1] : process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'fju-migration-emulator';
}

function writeReportFiles(report, outDir, prefix = 'migration-audit') {
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = timestampForFile(new Date(report.generatedAt));
  const jsonPath = path.join(outDir, `${prefix}-${stamp}.json`);
  const mdPath = path.join(outDir, `${prefix}-${stamp}.md`);
  const manualPath = path.join(outDir, `manual-review-${stamp}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(mdPath, toMarkdownReport(report), 'utf8');
  fs.writeFileSync(manualPath, toManualReviewMarkdown(report), 'utf8');
  return { jsonPath, mdPath, manualPath };
}

async function clearKnownDocs(db) {
  const refs = Object.keys(docs).map((docPath) => db.doc(docPath));
  for (let i = 0; i < refs.length; i += 450) {
    const batch = db.batch();
    refs.slice(i, i + 450).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

async function seed(db) {
  await clearKnownDocs(db);
  const batch = db.batch();
  for (const [docPath, data] of Object.entries(docs)) {
    batch.set(db.doc(docPath), data);
  }
  await batch.commit();
}

async function main() {
  const projectId = parseProjectId(process.argv.slice(2));
  const args = { projectId, apply: true, nonInteractive: true };
  const { environment } = assertSafety(args);
  if (environment.name !== 'emulator') {
    throw new Error('validateMigrationEmulator deve rodar somente com FIRESTORE_EMULATOR_HOST.');
  }
  const db = initializeFirestore(projectId);
  const outDir = path.join(process.cwd(), 'reports', 'migration-emulator-validation');

  await seed(db);
  const dryDataset = await fetchDataset(db, {});
  const dryReport = auditLegacyData(dryDataset, { projectId, environment: environment.name, apply: false });
  const dryPaths = writeReportFiles(dryReport, outDir, 'migration-audit-dry-run');

  const plan = buildBackfillPlan(dryDataset, dryReport, {});
  const applied = await applyChanges(db, plan.changes);
  const afterDataset = await fetchDataset(db, {});
  const afterReport = auditLegacyData(afterDataset, { projectId, environment: environment.name, apply: true });
  afterReport.appliedChanges = plan.changes;
  const afterPaths = writeReportFiles(afterReport, outDir, 'migration-audit-after-apply');

  const secondPlan = buildBackfillPlan(afterDataset, afterReport, {});
  console.log(`[validate:migrations:emulator] documentos simulados=${Object.keys(docs).length}`);
  console.log(`[validate:migrations:emulator] dry-run problemas=${dryReport.summary.totalIssues} propostas=${plan.changes.length}`);
  console.log(`[validate:migrations:emulator] apply documentos_alterados=${applied}`);
  console.log(`[validate:migrations:emulator] segunda_execucao_mudancas=${secondPlan.changes.length}`);
  console.log(`[validate:migrations:emulator] dry-run JSON=${dryPaths.jsonPath}`);
  console.log(`[validate:migrations:emulator] after-apply JSON=${afterPaths.jsonPath}`);
  if (secondPlan.changes.length !== 0) {
    throw new Error('Idempotencia falhou: segunda execucao ainda possui mudancas.');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[validate:migrations:emulator] falha:', error.stack || error.message);
    process.exitCode = 1;
  });
}
