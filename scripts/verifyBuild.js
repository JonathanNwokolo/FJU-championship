/**
 * verifyBuild.js — Verifica se o build Android vai passar ANTES de subir pro EAS.
 *
 * O que faz:
 *   1. Roda `expo prebuild --platform android --clean --no-install`
 *   2. Checa todos os recursos críticos que costumam quebrar o Gradle
 *   3. Remove a pasta android/ gerada (não polui o managed workflow)
 *   4. Imprime ✓ / ✗ para cada verificação e sai com código 1 se algo falhou
 *
 * Uso:  node scripts/verifyBuild.js   (ou: npm run verify)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ANDROID = path.join(ROOT, 'android');

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

const ok = (msg) => console.log(`  ${GREEN}✓${RESET} ${msg}`);
const fail = (msg) => console.log(`  ${RED}✗${RESET} ${msg}`);
const warn = (msg) => console.log(`  ${YELLOW}⚠${RESET} ${msg}`);
const section = (msg) => console.log(`\n${BOLD}${msg}${RESET}`);

let errors = 0;

// ─── 1. PREBUILD ────────────────────────────────────────────────────────────

section('1/3  Rodando expo prebuild (android)...');

// expo prebuild sobrescreve scripts.android e scripts.ios no package.json — salva antes
const pkgPath = path.join(ROOT, 'package.json');
const pkgOriginal = fs.readFileSync(pkgPath, 'utf8');

try {
  execSync('npx expo prebuild --platform android --clean --no-install', {
    cwd: ROOT,
    stdio: 'pipe',
  });
  ok('expo prebuild concluído sem erros');
} catch (e) {
  fail('expo prebuild falhou:');
  console.error(e.stderr?.toString() || e.message);
  fs.writeFileSync(pkgPath, pkgOriginal); // restaura antes de sair
  console.log(`\n${RED}✗ Abortando — corrija o erro do prebuild e tente de novo.${RESET}\n`);
  process.exit(1);
} finally {
  // restaura package.json independente do resultado
  fs.writeFileSync(pkgPath, pkgOriginal);
  ok('package.json restaurado (scripts expo start preservados)');
}

// ─── 2. CHECKS ──────────────────────────────────────────────────────────────

section('2/3  Verificando recursos críticos...');

// Splash — o drawable que quebrou o build anterior
const SPLASH_DENSITIES = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
const missingSplash = SPLASH_DENSITIES.filter(
  (d) => !fs.existsSync(path.join(ANDROID, `app/src/main/res/drawable-${d}/splashscreen_logo.png`))
);
if (missingSplash.length === 0) {
  ok('splashscreen_logo.png gerado em todas as densidades');
} else {
  fail(`splashscreen_logo.png ausente em: ${missingSplash.join(', ')}`);
  errors++;
}

// styles.xml referencia splashscreen_logo
const stylesPath = path.join(ANDROID, 'app/src/main/res/values/styles.xml');
if (fs.existsSync(stylesPath)) {
  const styles = fs.readFileSync(stylesPath, 'utf8');
  if (styles.includes('splashscreen_logo')) {
    ok('styles.xml referencia splashscreen_logo');
  } else {
    warn('styles.xml não referencia splashscreen_logo (pode ser novo SDK sem issue)');
  }
} else {
  fail('styles.xml não encontrado');
  errors++;
}

// Ícone principal (SDK 56 gera .webp)
const iconMain = path.join(ANDROID, 'app/src/main/res/mipmap-xxxhdpi/ic_launcher.webp');
if (fs.existsSync(iconMain)) {
  ok('ic_launcher.webp gerado (mipmap-xxxhdpi)');
} else {
  fail('ic_launcher.webp não encontrado em mipmap-xxxhdpi');
  errors++;
}

// Adaptive icon foreground
const iconFg = path.join(ANDROID, 'app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.webp');
if (fs.existsSync(iconFg)) {
  ok('ic_launcher_foreground.webp gerado (adaptive icon)');
} else {
  fail('ic_launcher_foreground.webp não encontrado');
  errors++;
}

// Adaptive icon XML (anydpi-v26)
const iconXml = path.join(ANDROID, 'app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml');
if (fs.existsSync(iconXml)) {
  ok('ic_launcher.xml gerado (adaptive icon anydpi-v26)');
} else {
  fail('ic_launcher.xml não encontrado em mipmap-anydpi-v26');
  errors++;
}

// google-services.json copiado pro android/app
const gsJson = path.join(ANDROID, 'app/google-services.json');
if (fs.existsSync(gsJson)) {
  ok('google-services.json copiado para android/app/');
} else {
  fail('google-services.json ausente em android/app/ — referência no app.json pode estar errada');
  errors++;
}

// app.json pode ser parseado
try {
  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  const projectId = appJson?.expo?.extra?.eas?.projectId;
  if (projectId) {
    ok(`app.json válido — projectId: ${projectId}`);
  } else {
    warn('app.json válido mas extra.eas.projectId não encontrado');
  }
} catch (e) {
  fail(`app.json inválido: ${e.message}`);
  errors++;
}

// ─── 3. CLEANUP ─────────────────────────────────────────────────────────────

section('3/3  Limpando pasta android/ gerada...');
try {
  fs.rmSync(ANDROID, { recursive: true, force: true });
  ok('android/ removida — managed workflow preservado');
} catch (e) {
  warn(`Não foi possível remover android/ automaticamente: ${e.message}`);
  warn('Remova manualmente antes do commit: rm -rf android');
}

// ─── RESULTADO ───────────────────────────────────────────────────────────────

if (errors === 0) {
  console.log(`\n${GREEN}${BOLD}✅ Tudo OK — pode rodar o build com segurança:${RESET}`);
  console.log('   eas build --platform android --profile preview\n');
  process.exit(0);
} else {
  console.log(`\n${RED}${BOLD}✗ ${errors} problema(s) encontrado(s) — corrija antes de subir o build.${RESET}\n`);
  process.exit(1);
}
