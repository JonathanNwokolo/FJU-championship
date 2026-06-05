# Como atualizar os ícones e a splash do FJU Championship

Este projeto gera **todos** os assets de ícone/splash a partir de **uma única imagem fonte**:
`assets/source-icon.png` (o escudo FJU dourado, quadrado, fundo escuro `#080E17`).

## Passo a passo

1. Substitua **apenas** o arquivo `assets/source-icon.png` pela nova arte (quadrada, ≥ 1024×1024px).
2. Rode:
   ```bash
   npm run icons
   ```
3. Gere um novo build:
   ```bash
   eas build --platform android --profile preview
   ```
4. O novo ícone e a nova splash aparecerão no APK gerado.

## O que `npm run icons` gera (a partir de source-icon.png)

| Arquivo gerado | Tamanho | Uso |
|---|---|---|
| `assets/icon.png` | 1024×1024 | Ícone principal (iOS + geral) |
| `assets/splash-icon.png` | 1024×1024 | Imagem da splash (plugin `expo-splash-screen`) |
| `assets/favicon.png` | 48×48 | Ícone web |
| `assets/android-icon-foreground.png` | 1024×1024 | Foreground do adaptive icon Android (escudo com padding na *safe zone*) |

O fundo do adaptive icon Android e a cor de fundo da splash (`#080E17`) são definidos no
`app.json` — não são arquivos de imagem.

## Observações

- A imagem fonte deve ser **quadrada** e ter **fundo escuro `#080E17`** (sem transparência).
  Como o adaptive icon do Android corta as bordas, o escudo é reduzido a ~66% e centralizado
  automaticamente pelo script — então deixe respiro/margem na arte.
- A splash usa `resizeMode: contain` sobre fundo `#080E17`, então o escudo aparece centralizado.
- Após trocar os ícones, **sempre gere um novo APK** — o Expo Go **não** reflete mudanças de
  ícone nem de splash.
- Requer `sharp` (já em devDependencies). Se faltar: `npm install sharp --save-dev`.

## Setup atual (mantido — não foi rebaixado)

- `version: 1.1.0`, Android `versionCode: 2` (preservados para não quebrar updates na Play Store).
- Adaptive icon de 2 camadas (foreground + cor de fundo) + monochrome para ícones temáticos.
- Splash via plugin `expo-splash-screen` (padrão atual do SDK 56), não o campo `splash` legado.
