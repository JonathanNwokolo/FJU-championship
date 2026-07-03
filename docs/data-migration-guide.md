# Guia de migracao e auditoria de dados legados

## Objetivo

O Bloco 6 adiciona ferramentas administrativas para auditar e corrigir dados legados do Firestore antes da publicacao. Os scripts nunca executam escrita por padrao e geram relatorios em JSON e Markdown.

## Pre-requisitos

- Node compativel com o projeto Expo SDK 56.
- `firebase-admin` instalado como devDependency.
- Projeto explicitamente informado por `--project-id=<id>` ou `FIREBASE_PROJECT_ID`.
- Para Emulator: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`.
- Para ambiente real: credencial externa via `GOOGLE_APPLICATION_CREDENTIALS` ou ADC. Nunca coloque chave no repositorio.

## Ambiente

Use o Emulator para validacao:

```bash
firebase emulators:start --only firestore,storage
npm run seed:migrations -- --project-id=fju-migration-emulator
npm run audit:data -- --project-id=fju-migration-emulator
```

Em ambiente real, faca primeiro somente dry-run:

```bash
npm run audit:data -- --project-id=<project-id>
```

## Backup

Antes de qualquer `--apply`, exporte o Firestore. Exemplo:

```bash
firebase firestore:export gs://<bucket>/backups/block-6 --project <project-id>
```

O script nao implementa backup falso. Use `--require-backup-confirmation --backup-confirmed` para registrar que o operador confirmou o backup externamente.

## Dry-run

Auditoria completa:

```bash
npm run audit:data -- --project-id=<project-id>
```

Plano de migracao sem escrita:

```bash
npm run migrate:data:dry -- --project-id=<project-id>
```

Filtros disponiveis:

```bash
--category=team-memberships
--category=approved-player-counts
--category=registered-team-counts
--category=legacy-convocations
--championship-id=<id>
--team-id=<id>
--limit=<n>
```

## Apply

Apply deve ser usado primeiro no Emulator:

```bash
npm run migrate:data -- --project-id=fju-migration-emulator --non-interactive
```

Sem `--non-interactive`, o script exige confirmacao textual:

```text
APPLY <project-id>
```

Ambiente parecido com producao e sem Emulator exige `--confirm-production`, credencial administrativa externa e revisao manual previa.

## Relatorios

Os scripts escrevem em `reports/`:

- `migration-audit-YYYY-MM-DD-HH-mm.json`
- `migration-audit-YYYY-MM-DD-HH-mm.md`
- `manual-review-YYYY-MM-DD-HH-mm.md` no fluxo de backfill

O JSON inclui colecoes analisadas, total de documentos, severidade, documentos afetados, reparo sugerido, conflitos, itens manuais, mudancas propostas e `before/after` quando ha backfill.

## Categorias auditadas

- `team_memberships`
- `approvedPlayersCount`
- `registeredTeamsCount`
- jogadores orfaos
- times sem capitao valido
- convocacoes legadas por rodada
- `match_convocations` e `match_attendance`
- partidas, W.O., cancelamento, adiamento e logs
- `round_awards`
- `championship_results` e derivados

## Categorias automaticas

O backfill automatico so planeja:

- criar `team_memberships/{teamId}_{userId}` quando player, user, team e campeonato batem;
- recalcular `approvedPlayersCount` sem conflito estrutural de elenco;
- recalcular `registeredTeamsCount` pela regra atual `team.status !== "rejeitado"` sem conflito impeditivo;
- migrar convocacao legada apenas quando existe exatamente uma partida compativel e nenhum conflito atual.

## Categorias manuais

Nunca corrigir automaticamente:

- player em dois times;
- capitao invalido ou duplicado;
- convocacao ambigua;
- awards conflitantes;
- `championship_results` divergente;
- jogador orfao sem origem confiavel;
- ranking, historico, Hall da Fama ou achievements divergentes.

## Rollback

Use o JSON do relatorio como fonte de rollback:

- `team_memberships`: documentos criados podem ser desativados atualizando `status: "sem_time"`, `active: false` e registrando o relatorio usado.
- `approvedPlayersCount`: restaurar o valor em `before.approvedPlayersCount`.
- `registeredTeamsCount`: restaurar o valor em `before.registeredTeamsCount`.
- convocacoes migradas: preservar o documento, marcar `status: "cancelled"` se a migracao precisar ser desativada, e manter `legacySourcePath`.

O script salva `documentPath`, `before`, `after` e `migrationVersion` para cada mudanca planejada/aplicada.

## Limitacoes

- O Bloco 6 nao reprocessa campeonato encerrado.
- O Bloco 6 nao apaga documentos legados.
- O Bloco 6 nao corrige capitao automaticamente.
- O Bloco 6 nao altera telas, Rules nem contratos de dados aprovados.

## Checklist antes de producao

- Rodar dry-run no Emulator.
- Rodar apply no Emulator.
- Conferir `manual-review`.
- Exportar backup real do Firestore.
- Rodar dry-run no projeto real.
- Confirmar contagens antes/depois.
- Revisar todos os itens `CRITICAL` e `HIGH`.
- Executar apply somente com credencial administrativa externa e confirmacao explicita.

## Bloco 10.5 - categoria `groups` (formato grupos + mata-mata)

A auditoria ganhou a categoria `groups` (`--category=groups`) que detecta
inconsistencias estruturais do formato `grupos_e_mata_mata`:

- `groupStageConfig` ausente ou `groupCount` diferente de 2;
- `groupStageStatus` / `knockoutStageStatus` / `stage` incompativeis;
- time aprovado sem `groupId` ou com `groupId` invalido apos o sorteio;
- `groupSeed` invalido e `groupAssignmentVersion` divergente;
- grupos desbalanceados;
- fixtures ausentes, parciais, duplicadas ou entre grupos; partida de grupo sem `groupId`;
- partida de mata-mata sem `originSnapshotVersion`;
- snapshot ausente (CRITICAL quando o mata-mata existe), `standingsDigest` ausente e digest divergente do log de transicao;
- `groupStageLockedAt` / `knockoutGeneratedAt` ausentes apos a transicao;
- partida de grupo cancelada/adiada bloqueando a conclusao (INFO) e W.O. de grupo inconsistente.

Regras de seguranca do backfill de grupos:

- O unico auto-fix e o preenchimento **conservador** de `stage` ausente quando o
  estado e inequivoco (`group_stage` ou `knockout`). Dry-run por padrao,
  idempotente e reversivel.
- **Nunca** atribui grupo, gera fixture, cria snapshot, regenera bracket nem
  converte um formato antigo (`pontos_corridos`/`mata_mata`) para grupos.
- Campeonatos antigos continuam sendo apenas auditados, sem conversao automatica.

Novas colecoes estruturais lidas pela auditoria: `group_assignment_logs`,
`group_fixture_logs`, `group_stage_snapshots`, `group_transition_logs`.

A consistencia do seed operacional (D/E limpos, F com inconsistencias
controladas) e verificada por `scripts/__tests__/seedOperationalGroups.test.js`,
que roda a auditoria sobre `buildDocs()` sem depender do Emulator.
