const fs = require('fs');
const path = require('path');
const readline = require('readline');

const {
  auditLegacyData,
  buildBackfillPlan,
  toMarkdownReport,
  toManualReviewMarkdown,
} = require('./migration/legacyDataCore');
const {
  parseArgs,
  assertSafety,
  initializeFirestore,
  fetchDataset,
  applyChanges,
} = require('./migration/firestoreAdmin');
const { timestampForFile } = require('./auditLegacyData');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function writeMigrationReports(report, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = timestampForFile(new Date(report.generatedAt));
  const jsonPath = path.join(outDir, `migration-audit-${stamp}.json`);
  const mdPath = path.join(outDir, `migration-audit-${stamp}.md`);
  const manualPath = path.join(outDir, `manual-review-${stamp}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(mdPath, toMarkdownReport(report), 'utf8');
  fs.writeFileSync(manualPath, toManualReviewMarkdown(report), 'utf8');
  return { jsonPath, mdPath, manualPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { projectId, environment } = assertSafety(args);
  const db = initializeFirestore(projectId);
  const beforeDataset = await fetchDataset(db, args);
  const beforeReport = auditLegacyData(beforeDataset, {
    projectId,
    environment: environment.name,
    apply: args.apply,
    categories: args.categories,
    limit: args.limit,
  });
  const plan = buildBackfillPlan(beforeDataset, beforeReport, {
    categories: args.categories,
    limit: args.limit,
  });
  beforeReport.proposedChanges = plan.changes;
  beforeReport.summary.totalProposedChanges = plan.changes.length;
  const paths = writeMigrationReports(beforeReport, args.outDir || path.join(process.cwd(), 'reports'));

  console.log(`[migrate:data] modo=${args.apply ? 'apply' : 'dry-run'} projeto=${projectId} ambiente=${environment.name}`);
  console.log(`[migrate:data] relatorio antes: ${paths.jsonPath}`);
  console.log(`[migrate:data] mudancas propostas: ${plan.changes.length}`);

  if (!args.apply) {
    console.log('[migrate:data] dry-run: nenhuma escrita executada.');
    return;
  }
  if (plan.changes.length === 0) {
    console.log('[migrate:data] apply: zero mudancas.');
    return;
  }
  if (!args.nonInteractive) {
    const answer = await ask(`Digite APPLY ${projectId} para confirmar a escrita: `);
    if (answer !== `APPLY ${projectId}`) {
      throw new Error('Confirmacao textual invalida. Nenhuma escrita executada.');
    }
  }

  const applied = await applyChanges(db, plan.changes);
  const afterDataset = await fetchDataset(db, args);
  const afterReport = auditLegacyData(afterDataset, {
    projectId,
    environment: environment.name,
    apply: true,
    categories: args.categories,
    limit: args.limit,
  });
  afterReport.appliedChanges = plan.changes.map((change) => ({
    category: change.category,
    documentPath: change.documentPath,
    before: change.before,
    after: change.after,
    migrationVersion: change.migrationVersion,
  }));
  const afterPaths = writeMigrationReports(afterReport, args.outDir || path.join(process.cwd(), 'reports'));
  console.log(`[migrate:data] apply concluido. documentos alterados=${applied}`);
  console.log(`[migrate:data] relatorio depois: ${afterPaths.jsonPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[migrate:data] falha:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { writeMigrationReports };
