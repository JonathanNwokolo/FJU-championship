# Pendencias obrigatorias antes de producao

## registeredTeamsCount em rejeicao/remocao

- Status: pendente.
- Escopo: fluxo futuro de arquivamento e gestao de times.
- Observacao: nao corrigir no Bloco 3. A atualizacao de `registeredTeamsCount` em rejeicao/remocao deve ser revisada antes de producao para nao divergir da regra final de times ativos, rejeitados, removidos e arquivados.

## Bloco 6 - migracoes, backfills e auditoria de dados legados

- Status: ferramentas criadas; migracao ainda nao executada em producao.
- Scripts:
  - `npm run audit:data`
  - `npm run migrate:data:dry`
  - `npm run migrate:data`
  - `npm run seed:migrations`
  - `npm run test:migrations`
- Backfill pendente em producao ate dry-run, backup externo, revisao manual e confirmacao explicita.
- Validacao manual pendente para itens `CRITICAL` e `HIGH` dos relatorios.
- Reprocessamento de `championship_results`, `career_stats`, `player_history`, `all_time_rankings`, Hall da Fama e achievements permanece fora deste bloco.

## Bloco 7 - validacao operacional manual

- Status: bloqueado para release; preparacao operacional e ambiente local seguro preparados.
- Relatorio: `docs/operational-validation-report.md`.
- Setup local: `docs/local-emulator-setup.md`.
- Seed criado: `npm run dev:prepare`, usando o projeto `fju-operational-emulator` e resetando Auth, Firestore e Storage Emulator.
- Resultado do seed: 135 documentos deterministicos `ov_*` gravados no Emulator.
- Auth Emulator: configurado e semeado com usuarios `ov_*` deterministicos.
- Client app: development + Emulator conecta explicitamente Auth, Firestore e Storage; production + Emulator e development + producao sao bloqueados.
- Validacao automatizada: `typecheck`, `lint`, Jest, Rules e migrations passaram.
- Validacao manual real: nao executada.
- Bloqueio: nenhum aparelho fisico conectado via ADB e nenhum AVD cadastrado.
- Pendente antes de release: criar AVD ou conectar device fisico, iniciar `npm run emulators:start`, rodar `npm run dev:reset`, instalar/abrir o app e executar o roteiro manual completo do Bloco 7 com inspecao Firestore apos cada fluxo.
- Observacao: nao declarar smoke, UX, listeners em tempo real, offline, autenticacao, papeis, equipes, partidas, convocacao, presenca ou notificacoes como validados ate haver device/emulador e interacao real.

## Bloco 9 - notificacoes, deep links e pending actions

- Status: pipeline automatizado implementado; validacao real de push ainda pendente.
- Documento: `docs/notification-action-pipeline.md`.
- Validacao automatizada cobre parser, normalizacao legado/v1, deep links, listeners, singleton, cleanup, deduplicacao e expiracao.
- Push remoto real nao deve ser declarado validado sem development build em device fisico ou emulador compativel.

## Bloco 10.3 - status de partida, correcao controlada e convocacao/presenca

- Status: logica e testes automatizados concluidos; validacao manual em device/AVD ainda pendente.
- Cobertura automatizada: W.O. (grupo e mata-mata), adiamento, reativacao, cancelamento (grupo e mata-mata), correcao antes/depois da transicao de grupos, correcao de mata-mata, preservacao de campos estruturais, logs/versionamento, convocacao apos W.O./cancelamento, reconfirmacao apos adiamento, bloqueio de novas respostas, erros tipados e integracao com `canCompleteGroupStage`.
- Pendente antes de release (somente manual/real):
  - Executar em device fisico ou AVD o roteiro de W.O., adiamento, reativacao, cancelamento e correcao com inspecao Firestore apos cada fluxo.
  - Confirmar manualmente a reconfirmacao de presenca apos adiamento (capitao e atleta reais) e o bloqueio de novas respostas apos W.O./cancelamento.
  - Validar navegacao real (deep link/notification action) para PreMatch/Correcao a partir da notificacao.
  - Push remoto real de W.O., adiamento e cancelamento so pode ser declarado validado com development build em device fisico/emulador compativel.
- Observacao: nao ha disparo de notificacao dedicado para correcao de resultado (o log de auditoria e criado, mas nenhuma notificacao e enviada aos times). Item de backlog de produto — nao implementado neste bloco por ser funcionalidade nova fora do escopo da auditoria.

## Bloco 10.4 - UI grupos + mata-mata (Fase 4)

- Status: UI ligada e coberta por testes automatizados; validacao manual real ainda pendente.
- Flag: `GROUPS_FORMAT_UI_ENABLED` passou a `true` apos os gates da Fase 4 (criacao, dashboard, grupos, fixtures, revisao, chave, pendencias e notificacoes cobertos por Jest).
- Documento: `docs/groups-knockout-format.md` (secao "Block 10.4 - Group + Knockout UI").
- Cobertura automatizada: flag on/off, criacao com `groupStageConfig` valida/invalida, formatos antigos preservados, acessibilidade de GroupsOverview/GroupFixtures/GroupStageReview (status textual, filtros, BYE, CTA bloqueado/pronto), apresentacao pura, pendencias e roteamento de notificacoes.
- Pendente antes de release (somente manual/real):
  - Validar em device fisico ou AVD a jornada completa do formato grupos + mata-mata: criar, sortear grupos, gerar fixtures, registrar resultados, revisar, concluir e gerar a chave, com inspecao Firestore apos cada etapa.
  - Validar navegacao real (deep link / notification action) para GroupsOverview e GroupStageReview a partir das notificacoes `groups_generated`, `group_fixtures_generated` e `group_stage_started`.
  - Push remoto real dos eventos de fase de grupos so pode ser declarado validado com development build em device/emulador compativel.
  - Acessibilidade com leitor de tela real (TalkBack/VoiceOver) nas telas e cards do formato.
  - Fluxo completo organizador / capitao / atleta no formato grupos + mata-mata.
- Observacao: Firestore Rules e migracoes nao foram tocadas na Fase 4; ficam para o gate final do Bloco 10.5. Nenhuma validacao manual em device foi declarada nesta fase.

## Bloco 10.5 - mocks, seed, auditoria, migracao e Rules do formato de grupos

- Status: fechamento automatizado concluido; validacao manual real ainda pendente.
- Rules: adicionadas `group_assignment_logs` e `group_fixture_logs` (organizador dono, imutaveis) — fechava um gap real (o cliente gravava esses logs mas nao havia regra, entao producao negaria). Cobertas por `rules/firestore.rules.test.js`.
- Auditoria: nova categoria `groups` em `legacyDataCore.js`, com severidades e auto-fix conservador apenas de `stage`. Sem conversao automatica de formato antigo.
- Mock: campeonatos D (grupos em andamento) e E (transicao concluida) em `mockData.ts`. Diagnostico invalido (F) no seed operacional.
- Seed: `ov_champ_d/e/f` em `seedOperationalValidation.js`, determinista e idempotente; validado pela auditoria via `seedOperationalGroups.test.js` (D/E limpos, F sinalizado com CRITICAL).
- Pendente antes de release (somente manual/real):
  - Rodar `npm run dev:prepare` com o Emulator ativo (reset + Auth seed + seed operacional) e conferir as contagens `ov_*` incluindo D/E/F.
  - Rodar `npm run audit:data` e `npm run migrate:data:dry` contra o Emulator com os dados semeados e revisar os relatorios (esperado: F com issues CRITICAL/HIGH de grupos; D/E limpos).
  - Executar em device/AVD a jornada completa do formato grupos + mata-mata (criar, sortear, gerar fixtures, registrar, revisar, concluir, gerar chave) com inspecao Firestore.
  - Push real e navegacao real por notificacoes de fase de grupos; acessibilidade com leitor de tela real.
- Observacao: nesta sessao nao ha processo do Emulator nem device; `dev:prepare` e os scripts contra o Emulator nao foram executados; a consistencia seed/auditoria foi provada por teste Jest determinista.

## Bloco 11 Fase 3 - reprocessamento via correcao controlada

- Status: integracao automatizada implementada; validacao manual real ainda pendente.
- Documento: `docs/championship-reprocessing.md`.
- Escopo: somente correcao controlada de partida em campeonato encerrado com `championship_results` existente, seguida imediatamente de `reprocessClosedChampionship`.
- Fora de escopo: UI dedicada, tela de revisao visual, notificacoes, push, deep links, seed, migracao, E2E, release, reprocessamento de grupo pos-transicao e reprocessamento de chave de mata-mata.
- Rules: adicionadas regras minimas para `championship_reprocess_logs` imutavel e update de `player_history` pelo organizador dono. `career_stats` e `all_time_rankings` permanecem no contrato global ja existente de organizador, porque os rankings sao globais.
- Recovery: se a correcao foi aplicada e o reprocessamento falhar, o retry usa o mesmo `sourceCorrectionId`/log deterministico; falha nao deve ser escondida da UI.
- Pendente antes de release (somente manual/real):
  - Em device fisico ou AVD, corrigir uma partida de campeonato encerrado e inspecionar `match_corrections`, `championship_reprocess_logs`, `championship_results`, `player_history`, `career_stats`, `all_time_rankings` e achievements.
  - Repetir a mesma correcao/retry e confirmar que logs e achievements nao duplicam.
  - Validar mensagem amigavel na UI para erro tipado (`championship_results_missing`, `stale_reprocess_version`, permission denied).
  - Validar caso sem mudanca de outcome: log criado, achievements nao tocados.
- Observacao: nao declarar esta validacao manual como concluida ate haver execucao real em device/AVD e inspecao Firestore.
- Observacao: nesta sessao nao ha processo do Emulator nem device; `dev:prepare` e os scripts contra o Emulator nao foram executados — a consistencia seed↔auditoria foi provada por teste Jest determinista.
