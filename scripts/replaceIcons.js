/**
 * replaceIcons.js — Gera todos os assets de ícone/splash a partir de UMA imagem fonte.
 *
 * Fonte:  assets/source-icon.png  (escudo FJU dourado, fundo escuro, quadrado)
 *
 * Gera:
 *   - assets/icon.png                    1024x1024  (ícone principal iOS + geral)
 *   - assets/splash-icon.png             1024x1024  (imagem da splash, plugin expo-splash-screen)
 *   - assets/favicon.png                 48x48      (ícone web)
 *   - assets/android-icon-foreground.png 1024x1024  (foreground do adaptive icon, escudo com padding)
 *
 * O fundo Android (#080E17) e o monochrome são definidos no app.json — não são gerados aqui.
 *
 * Uso:  node scripts/replaceIcons.js   (ou: npm run icons)
 */

const path = require('path');
const fs = require('fs');

const ASSETS = path.join(__dirname, '..', 'assets');
const SOURCE = path.join(ASSETS, 'source-icon.png');
const BG = '#080E17'; // fundo escuro assinatura FJU

// sharp é obrigatório para redimensionar com qualidade.
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.error('\n❌ sharp não está instalado.');
  console.error('   Instale com:  npm install sharp --save-dev\n');
  process.exit(1);
}

function fail(msg) {
  console.error('\n❌ ' + msg + '\n');
  process.exit(1);
}

async function run() {
  if (!fs.existsSync(SOURCE)) {
    fail(
      'Imagem fonte não encontrada: assets/source-icon.png\n' +
        '   Coloque o escudo FJU (quadrado, fundo escuro) nesse caminho e rode de novo.'
    );
  }

  const meta = await sharp(SOURCE).metadata();
  console.log(`\n🎨 Fonte: assets/source-icon.png (${meta.width}x${meta.height})\n`);

  // 1) icon.png — 1024x1024 (mantém o fundo escuro próprio da imagem)
  await sharp(SOURCE)
    .resize(1024, 1024, { fit: 'cover' })
    .png()
    .toFile(path.join(ASSETS, 'icon.png'));
  console.log('✓ icon.png                    1024x1024');

  // 2) splash-icon.png — 1024x1024 (centralizado sobre fundo escuro na splash via app.json)
  await sharp(SOURCE)
    .resize(1024, 1024, { fit: 'cover' })
    .png()
    .toFile(path.join(ASSETS, 'splash-icon.png'));
  console.log('✓ splash-icon.png             1024x1024');

  // 3) favicon.png — 48x48 (web)
  await sharp(SOURCE)
    .resize(48, 48, { fit: 'cover' })
    .png()
    .toFile(path.join(ASSETS, 'favicon.png'));
  console.log('✓ favicon.png                 48x48');

  // 4) android-icon-foreground.png — escudo a ~66% sobre canvas transparente,
  //    respeitando a "safe zone" do adaptive icon (o sistema corta as bordas).
  const FRAME = 1024;
  const INNER = Math.round(FRAME * 0.66); // ~676px
  const shield = await sharp(SOURCE)
    .resize(INNER, INNER, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: FRAME,
      height: FRAME,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: shield, gravity: 'center' }])
    .png()
    .toFile(path.join(ASSETS, 'android-icon-foreground.png'));
  console.log('✓ android-icon-foreground.png 1024x1024  (escudo com padding na safe zone)');

  console.log(`\n✅ Concluído. Fundo Android: ${BG} (definido no app.json).`);
  console.log('   Próximo passo: eas build --platform android --profile preview\n');
}

run().catch((err) => fail(err.message));
