# Bloco 7 - Validacao operacional manual

Data: 2026-07-01

## Escopo

Este relatorio cobre o Bloco 7: validacao operacional/manual dos fluxos ja implementados nos blocos anteriores.

Nenhuma funcionalidade nova foi implementada. Como nao havia aparelho Android conectado nem AVD cadastrado, nenhum teste manual em dispositivo/emulador foi declarado como executado.

## Bloco 7.1 - ambiente seguro e reproduzivel

Status: implementado para preparacao local; validacao manual ainda depende de
device fisico ou AVD.

Alteracoes do Bloco 7.1:

- `EXPO_PUBLIC_APP_ENV` passou a ser obrigatorio (`development`, `staging` ou
  `production`).
- `EXPO_PUBLIC_USE_FIREBASE_EMULATOR` passou a ser obrigatorio e explicito.
- `development` com Emulator conecta Auth, Firestore e Storage Emulator.
- `production` com Emulator e `development` apontando para `fju-championship`
  sem Emulator falham cedo.
- Auth Emulator foi configurado em `firebase.json` na porta `9099`.
- O app exibe badge discreto de ambiente em builds non-production.
- Seed de Auth Emulator foi separado em `scripts/seedAuthEmulator.js`.
- Seeds recusam project id com cara de producao.
- Scripts adicionados: `emulators:start`, `emulators:seed`,
  `emulators:auth-seed`, `dev:prepare`, `dev:reset`, `dev:android`.
- Setup operacional detalhado em `docs/local-emulator-setup.md`.
- `npm run dev:prepare` executado com sucesso: Auth Emulator resetado, 16
  usuarios `ov_*` criados, Firestore resetado e 135 documentos recriados.
- Idempotencia validada: Auth seed rodado duas vezes no mesmo emulator
  (`16 criados`, depois `16 atualizados`) e seed operacional rodado duas vezes
  gravando o mesmo resumo de 135 documentos.

Nao foi criado AVD e nenhum smoke/manual foi declarado.

## Ambiente

| Item | Disponivel? | Configuracao | Bloqueio | Acao necessaria |
| --- | --- | --- | --- | --- |
| Sistema operacional | Sim | Microsoft Windows NT 10.0.26200.0 | Nenhum | N/A |
| Android Studio | Sim | `C:\Program Files\Android\Android Studio\bin\studio64.exe` existe | Nenhum | N/A |
| Android SDK | Sim | `ANDROID_HOME=C:\Users\Home\AppData\Local\Android\Sdk` | Nenhum | N/A |
| Java/JDK | Sim | OpenJDK 21.0.10 via Android Studio JBR | Nenhum | N/A |
| ADB | Sim | `adb` 37.0.0 em `platform-tools` | Nenhum | N/A |
| Aparelho fisico via ADB | Nao | `adb devices -l` retornou lista vazia | Sem alvo real para smoke/manual | Conectar device com depuracao USB autorizada |
| Emulador Android | Parcial | Binario `emulator` 36.6.11 existe | `emulator -list-avds` retornou vazio | Criar AVD no Android Studio |
| Expo Go | Nao verificado em device | Sem device/AVD | Nao ha onde validar compatibilidade | Verificar apos conectar device/AVD |
| Development build | Parcial | Projeto tem pasta `android` e APK historico no workspace | Nao instalado em device/AVD nesta etapa | Instalar build em device/AVD quando disponivel |
| Firebase Emulator | Sim | Auth 9099, Firestore 8080 e Storage 9199 configurados | Precisa iniciar localmente para manual | `npm run emulators:start` ou `npm run dev:prepare` |
| Projeto Firebase de desenvolvimento | Sim para local | `fju-operational-emulator` definido nos scripts e `.env.example` | Staging real ainda precisa projeto confirmado | Usar staging somente com project id de staging |
| Variaveis de ambiente | Sim para exemplo | `.env.example` declara `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_USE_FIREBASE_EMULATOR`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID` e host opcional | Criar `.env` local antes do app manual | Copiar valores de `.env.example` e ajustar host para device fisico |
| Modo mock | Desligado no shell | `EXPO_PUBLIC_USE_MOCK` nao definido; `.env.example` recomenda `false` | Nenhum para automacao; manual mock nao executado | Ativar apenas para validacao visual complementar |
| Expo SDK | Sim | `expo` `~56.0.9`; CLI `56.1.14`; docs SDK 56 inspecionados | Nenhum | N/A |
| Node | Sim | Node `v22.16.0`, npm `10.9.2` | Nenhum | N/A |
| Comandos package.json | Sim | `start`, `android`, `web`, `typecheck`, `lint`, `test`, `test:rules`, `test:migrations`, migracoes e seed operacional | Nenhum | N/A |

## Documentos inspecionados

- `CLAUDE.md`
- `AGENTS.md`
- `docs/security-and-env.md`
- `docs/pre-production-pending.md`
- `docs/data-migration-guide.md`
- Expo SDK 56 versionado: `https://docs.expo.dev/versions/v56.0.0/`
- `package.json`
- `app.json`
- `firebase.json`
- `src/types/index.ts`
- `src/services/matchStatusService.ts`
- `src/services/matchCorrectionService.ts`
- `src/services/convocationService.ts`
- `src/services/attendanceService.ts`
- `scripts/migration/firestoreAdmin.js`

## Seed operacional

Arquivo criado:

- `scripts/seedOperationalValidation.js`

Comando adicionado:

```bash
npm run seed:operational
```

Execucao validada no Firestore Emulator:

```bash
npm run dev:prepare
```

Resultado:

- Reset: 135 documentos deterministicos removidos no Emulator.
- Escrita: 135 documentos gravados no Emulator.
- Projeto alvo: `fju-operational-emulator`.
- Auth Emulator: usado no Bloco 7.1 para usuarios `ov_*`.
- Producao: nao usada.

Resumo gravado:

| Colecao | Docs |
| --- | ---: |
| users | 16 |
| organizer_allowlist | 2 |
| championships | 3 |
| teams | 14 |
| players | 32 |
| team_memberships | 23 |
| matches | 13 |
| match_events | 7 |
| match_status_changes | 3 |
| match_convocations | 1 |
| match_attendance | 3 |
| match_corrections | 1 |
| championship_results | 1 |
| player_history | 1 |
| career_stats | 1 |
| all_time_rankings | 1 |
| round_awards | 1 |
| notifications | 6 |
| in_app_notifications | 6 |

O seed inclui:

- 1 organizador autorizado e 1 organizador externo nao autorizado.
- 2 capitaes.
- 8 atletas ativos, 1 suspenso, 1 lesionado, 1 removido e 1 sem time.
- Campeonato A em pontos corridos com partida agendada, finalizada, adiada, cancelada, W.O. e convocacao aberta.
- Campeonato B mata-mata com 6 times, byes estruturais, partidas de primeira rodada, proxima partida agendada, proxima ao vivo e partida finalizada corrigivel.
- Campeonato C encerrado com `championship_results`, historico, carreira e rankings.
- Dados de apoio em `match_events`, `match_corrections`, `match_status_changes`, `match_convocations`, `match_attendance`, `round_awards`, notificacoes e memberships.

Protecoes do script:

- Requer `--project-id` ou env equivalente.
- Recusa alvo com cara de producao quando nao ha `FIRESTORE_EMULATOR_HOST`.
- Usa IDs deterministicos `ov_*`.
- Suporta `--reset`.
- Suporta `--seed-auth` apenas se `FIREBASE_AUTH_EMULATOR_HOST` estiver definido.

## Smoke/manual

Nao executado.

Motivo:

- Nenhum device fisico conectado via ADB.
- Nenhum AVD cadastrado.
- App nao foi instalado/aberto em device ou emulador.
- Nao houve interacao real nem inspecao visual.

Itens pendentes:

- App inicia sem crash.
- Autenticacao real.
- Troca de papel.
- Navegacao inicial.
- Listeners em tempo real em duas sessoes.
- Validacao visual/UX em tela pequena.
- Offline/rede instavel.
- Inspecao Firestore apos cada fluxo manual.

## Cenarios

| Etapa | Resultado | Observacao |
| --- | --- | --- |
| 1 - Verificar ambiente | Parcial | Ambiente de desenvolvimento existe, mas sem device/AVD. |
| 2 - Preparar dados de teste | Aprovado no Emulator | Seed operacional criado e executado. |
| 3 - Smoke test do aplicativo | Nao executavel | Bloqueado por falta de device/AVD. |
| 4 - Autenticacao e papeis | Nao executavel | Exige app rodando e Firebase/Auth dev definido. |
| 5 - Times e elencos | Nao executavel manualmente | Dataset preparado para execucao futura. |
| 6 - Mata-mata com byes | Nao executavel manualmente | Dataset de 6 times criado; 3/5/7/9 ainda exigem execucao futura. |
| 7 - Correcao de partida finalizada | Nao executavel manualmente | Dataset preparado com pontos corridos, mata-mata e campeonato encerrado. |
| 8 - W.O. | Nao executavel manualmente | Dataset contem partida W.O. e log. |
| 9 - Adiamento | Nao executavel manualmente | Dataset contem partida adiada e log. |
| 10 - Cancelamento | Nao executavel manualmente | Dataset contem partida cancelada e log. |
| 11 - Convocacao | Nao executavel manualmente | Dataset contem convocacao aberta. |
| 12 - Presenca | Nao executavel manualmente | Dataset contem confirmado, recusado e pendente. |
| 13 - Prematch/registro de eventos | Nao executavel manualmente | Dataset contem elegiveis e inelegiveis. |
| 14 - Notificacoes | Nao executavel manualmente | Dataset contem notificacoes nas colecoes atual e legada. |
| 15 - UX/dispositivo | Nao executavel | Sem device/AVD. |
| 16 - Inspecao Firestore | Parcial | Seed inspecionado por resumo de escrita; nao houve inspecao pos-fluxo manual. |
| 17 - Offline/rede instavel | Nao executavel | Sem app rodando em device/AVD. |
| 18 - Correcoes | Nenhuma | Nenhum bug manual foi encontrado porque manual nao executou. |
| 19 - Regressao automatizada | Aprovado | Todos os comandos obrigatorios passaram. |
| 20 - Relatorio | Aprovado | Este documento criado. |

## Bugs

Nenhum bug de fluxo manual foi encontrado ou corrigido neste bloco, porque a validacao manual real ficou bloqueada antes do smoke test.

## Arquivos alterados neste bloco

- `.env.example`
- `App.tsx`
- `eas.json`
- `firebase.json`
- `jest.setup.js`
- `scripts/seedAuthEmulator.js`
- `scripts/seedOperationalValidation.js`
- `src/__tests__/appConfig.test.ts`
- `src/__tests__/firebaseEmulatorInit.test.ts`
- `src/config/appConfig.ts`
- `src/services/firebase.ts`
- `scripts/__tests__/seedAuthEmulator.test.js`
- `docs/local-emulator-setup.md`
- `docs/security-and-env.md`
- `package.json`
- `docs/operational-validation-report.md`
- `docs/pre-production-pending.md`

## Testes automatizados

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | Passou |
| `npm run lint` | Passou com 57 warnings preexistentes/fora do seed, 0 errors |
| `npm test -- --runInBand` | Passou: 30 suites, 444 testes |
| `npm run test:rules` | Passou: 2 suites, 63 testes |
| `npm run test:migrations` | Passou: 1 suite, 5 testes |
| `npm test -- appConfig firebaseEmulatorInit seedAuthEmulator --runInBand` | Passou: 3 suites, 22 testes |
| `npm run dev:prepare` | Passou: Auth 16 usuarios, Firestore 135 docs |
| `firebase emulators:exec --project fju-operational-emulator --only auth,firestore,storage "npm.cmd run emulators:auth-seed && npm.cmd run emulators:auth-seed && npm.cmd run emulators:seed && npm.cmd run emulators:seed"` | Passou: segunda execucao do Auth atualizou 16 usuarios; operacional gravou 135 docs duas vezes |

## Limitacoes

- Sem device fisico.
- Sem AVD.
- Auth Emulator configurado no `firebase.json`.
- App conecta client-side Auth, Firestore e Storage Emulator quando `development` + Emulator estao explicitamente habilitados.
- Projeto Firebase de staging real ainda nao foi confirmado.
- Nenhum fluxo manual, visual, offline ou multi-sessao foi executado.
- O seed prepara 6 times para mata-mata, mas os cenarios visuais de 3, 5, 7 e 9 times ainda precisam ser criados/executados durante a validacao manual.

## Gate de producao

Veredito: bloqueado para release.

Motivo: a regressao automatizada e o seed operacional passaram, mas a validacao manual real em dispositivo/emulador nao foi executada. O bloco fica aprovado apenas para continuar preparacao de desenvolvimento, nao para release.

## Adendo Bloco 10.4 - UI grupos + mata-mata (Fase 4)

Data: 2026-07-03

A UI do formato `grupos_e_mata_mata` (criacao, dashboard/painel de fase, grupos,
fixtures, revisao, chave, pendencias e notificacoes) foi ligada via
`GROUPS_FORMAT_UI_ENABLED = true` e esta coberta por testes automatizados Jest
(comportamento da flag, criacao valida/invalida, preservacao dos formatos
antigos e acessibilidade das telas de grupos).

Nao houve validacao manual real. Como no Bloco 7, nao ha device fisico conectado
via ADB nem AVD cadastrado, portanto smoke, UX em tela pequena, leitor de tela,
push real, navegacao real por notificacoes e a jornada organizador/capitao/
atleta do formato continuam **nao validados manualmente**. Esses itens estao
listados em `docs/pre-production-pending.md` (secao Bloco 10.4).

Firestore Rules e migracoes nao foram alteradas na Fase 4; permanecem como
fechadas nos Blocos 10.2/10.3 e serao reexecutadas no gate do Bloco 10.5.

## Adendo Bloco 10.5 - fechamento do formato grupos + mata-mata

Data: 2026-07-03

Fechamento automatizado do Bloco 10: mock (campeonatos D e E), seed operacional
(`ov_champ_d/e/f`), auditoria com categoria `groups`, backfill conservador de
`stage`, e Rules dos logs `group_assignment_logs` / `group_fixture_logs`.

Cobertura automatizada:

- Rules: sucesso/negacao/imutabilidade/id-shape/leitura dos dois logs de grupo.
- Auditoria: deteccao de config ausente, groupId invalido, time sem grupo,
  fixtures parciais, cross-group, snapshot ausente (CRITICAL), W.O.
  inconsistente, e auto-fix conservador idempotente de `stage`.
- Seed: `buildDocs()` determinista; auditoria sobre o seed confirma D/E limpos e
  F sinalizado — sem depender do Emulator.

Nao executado nesta sessao (sem processo do Emulator nem device):

- `npm run dev:prepare` (reset + Auth seed + seed operacional no Emulator);
- `npm run audit:data` / `npm run migrate:data:dry` contra o Emulator com os
  dados `ov_*` semeados;
- qualquer smoke/UX/leitor de tela/push/navegacao real em device/AVD.

Esses itens continuam listados em `docs/pre-production-pending.md` (Bloco 10.5).
Veredito mantido: aprovado para desenvolvimento e teste manual; bloqueado para
release publico ate a validacao manual real.

## Adendo Bloco 11 Fase 3 - reprocessamento via correcao controlada

Data: 2026-07-03

Foi integrada a correcao controlada de partida em campeonato encerrado ao
servico `reprocessClosedChampionship`. O fluxo automatizado agora aplica a
correcao auditada, confirma `lastCorrectionId`, executa o reprocessamento e
retorna resultado composto com `correction` e `reprocess`.

O reprocessamento reconcilia `championship_results`, `player_history`,
`career_stats`, `all_time_rankings` e achievements de fim de campeonato
(concessao e revogacao soft). `championship_reprocess_logs` foi protegido em
Rules como log imutavel criado apenas pelo organizador dono. `player_history`
passou a aceitar update pelo organizador dono para suportar o reprocessamento.

Nao executado nesta sessao:

- validacao manual em device/AVD;
- inspecao manual Firestore apos uma correcao real;
- push, deep links, E2E, seed, migracao ou release;
- reprocessamento de grupo pos-transicao ou chave de mata-mata.

Esses itens seguem pendentes em `docs/pre-production-pending.md` e no documento
especifico `docs/championship-reprocessing.md`.
