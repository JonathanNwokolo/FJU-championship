# Local Emulator Setup

Este guia prepara o Bloco 7.1 para teste manual futuro sem escrita acidental
em producao. Ele nao substitui a validacao real em device ou AVD.

## Pre-requisitos

- Node e npm instalados.
- Dependencias do projeto instaladas.
- Java disponivel para Firebase Emulator.
- Android Studio instalado para teste Android.
- Android SDK com `adb` e `emulator`.

Estado verificado neste Windows:

- Android Studio existe em `C:\Program Files\Android\Android Studio\bin\studio64.exe`.
- Android SDK existe em `C:\Users\Home\AppData\Local\Android\Sdk`.
- `adb devices -l` nao listou devices.
- `emulator -list-avds` nao listou AVDs.

## Env local

Crie `.env` a partir de `.env.example`:

```env
EXPO_PUBLIC_APP_ENV=development
EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true
EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=fju-operational-emulator
EXPO_PUBLIC_USE_MOCK=false
EXPO_PUBLIC_ALLOW_ORGANIZER_SELF_ASSIGN=false
```

Nao coloque segredo em `EXPO_PUBLIC_*`.

## Host do Emulator

- Web/desktop: deixe `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST` vazio. O app usa
  `127.0.0.1`.
- Android Emulator: deixe vazio. O app usa `10.0.2.2`.
- Device fisico: defina o IP LAN da maquina, por exemplo
  `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=192.168.1.50`.

## Comandos

Preparar estado reproduzivel em uma execucao temporaria dos emulators:

```bash
npm run dev:prepare
```

Rodar emulators para teste manual persistente:

```bash
npm run emulators:start
```

Com os emulators rodando em outro terminal, resetar dados:

```bash
npm run dev:reset
```

Iniciar Android quando houver AVD/device:

```bash
npm run dev:android
```

## Seeds

Auth Emulator:

```bash
npm run emulators:auth-seed
```

Firestore/operacional:

```bash
npm run emulators:seed
```

Reset completo do estado local:

```bash
npm run dev:reset
```

O reset recria os usuarios Auth `ov_*`, `organizer_allowlist` e os 135
documentos operacionais deterministicos.

## Usuarios de teste

Os emails seguem o padrao:

```text
<uid>@operational.fju.local
```

Principais UIDs:

- `ov_org_owner`: organizador autorizado.
- `ov_org_external`: usuario nao autorizado na allowlist.
- `ov_cap_alpha`: capitao.
- `ov_cap_beta`: capitao.
- `ov_ath_01` a `ov_ath_08`: atletas ativos.
- `ov_ath_free`: atleta sem time.
- `ov_ath_removed`: atleta removido do elenco.

A senha de teste e definida pelo seed local. Use `FJU_TEST_PASSWORD` para
sobrescrever em ambiente local. O seed nao imprime a senha no log.

## Como provar que nao esta em producao

- `.env` deve ter `EXPO_PUBLIC_APP_ENV=development`.
- `.env` deve ter `EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true`.
- O app deve exibir o badge `DEV EMULATOR`.
- Os logs de seed devem mostrar projeto `fju-operational-emulator`.
- `firebase.json` deve iniciar Auth `9099`, Firestore `8080` e Storage `9199`.
- Seeds recusam `fju-championship` como project id.

## AVD

Como nenhum AVD existe neste ambiente, crie um pelo Android Studio:

1. Abra Android Studio.
2. Entre em Device Manager.
3. Crie um Virtual Device.
4. Use um Pixel recente.
5. Use uma imagem Android atual x86_64 compativel com o SDK instalado.
6. Mantenha pelo menos 2 GB de RAM para o AVD.
7. Inicie o AVD e confirme:

```bash
adb devices -l
```

Nao foi feito download de imagem Android nem criacao de AVD por terminal neste
bloco.

## Problemas comuns

- App em device fisico nao acessa emulator: defina
  `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST` com o IP LAN da maquina.
- App em Android Emulator nao acessa localhost: deixe o host vazio para usar
  `10.0.2.2`.
- Config fatal ao abrir app: confira `EXPO_PUBLIC_APP_ENV`,
  `EXPO_PUBLIC_USE_FIREBASE_EMULATOR` e `EXPO_PUBLIC_FIREBASE_PROJECT_ID`.
- Seed recusado por producao: use `fju-operational-emulator`.
