const fs = require('fs');
const path = require('path');

const { auditLegacyData, toMarkdownReport } = require('./migration/legacyDataCore');
const {
  parseArgs,
  assertSafety,
  initializeFirestore,
  fetchDataset,
} = require('./migration/firestoreAdmin');

function timestampForFile(date = new Date()) {
  return date.toISOString().slice(0, 16).replace('T', '-').replace(':', '-');
}

function writeReports(report, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = timestampForFile(new Date(report.generatedAt));
  const jsonPath = path.join(outDir, `migration-audit-${stamp}.json`);
  const mdPath = path.join(outDir, `migration-audit-${stamp}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(mdPath, toMarkdownReport(report), 'utf8');
  return { jsonPath, mdPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  args.apply = false;
  args.dryRun = true;
  const { projectId, environment } = assertSafety(args);
  const db = initializeFirestore(projectId);
  const dataset = await fetchDataset(db, args);
  const report = auditLegacyData(dataset, {
    projectId,
    environment: environment.name,
    apply: false,
    categories: args.categories,
    limit: args.limit,
  });
  const paths = writeReports(report, args.outDir || path.join(process.cwd(), 'reports'));
  console.log(`[audit:data] dry-run concluido. JSON: ${paths.jsonPath}`);
  console.log(`[audit:data] Markdown: ${paths.mdPath}`);
  console.log(`[audit:data] problemas=${report.summary.totalIssues} autoFix=${report.summary.autoFixable} manual=${report.summary.manualReview}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[audit:data] falha:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { writeReports, timestampForFile };
