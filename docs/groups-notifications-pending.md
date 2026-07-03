# Bloco 10.4 — Fase 3: Pendências e notificações do formato grupos + mata-mata

Integração do formato `grupos_e_mata_mata` aos sistemas existentes de Central de
Pendências (Bloco 8) e pipeline de notificações acionáveis (Bloco 9). Nenhum sistema
paralelo foi criado — tudo reutiliza `pendingRules`, `usePendingItems`,
`notificationActionPipeline` e o orquestrador.

> A flag `GROUPS_FORMAT_UI_ENABLED` permanece `false`. Esta fase não a liga.

## 1. Tipos de pendência (`src/types/pending.ts`)

Organizador (derivados em `deriveGroupStagePendingItems`):

| Tipo | Severidade | Bloqueia | Destino | Quando |
|---|---|---|---|---|
| `group_groups_not_generated` | high | não | `championship_manage` | ≥4 aprovados, inscrições abertas, grupos não sorteados |
| `group_fixtures_not_generated` | high | não | `groups_overview` | grupos sorteados, fixtures ausentes |
| `group_structure_invalid` | critical | sim | `groups_overview` | `validateGroupsKnockoutStructure` acusa erros |
| `group_stage_ready` | high | não | `group_stage_review` | `canCompleteGroupStage().allowed === true` |
| `group_stage_blocked` | high | sim | `group_stage_review` | há blocker **operacional** (adiada/cancelada/placar inválido/W.O. inconsistente) |
| `group_knockout_not_generated` | critical | sim | `group_stage_review` | fase concluída mas chave indisponível |

Capitão e atleta (derivados em `deriveTeamKnockoutItems`, informativos):

| Tipo | Severidade | Destino |
|---|---|---|
| `team_qualified` | info | `knockout_bracket` |
| `team_eliminated` | info | `groups_overview` |
| `knockout_match_defined` | low | `match_prematch` |

Partidas de grupo atrasadas/adiadas/canceladas **reutilizam** os tipos genéricos
(`match_overdue`, `match_postponed_unscheduled`, `captain_match_cancelled`,
`athlete_match_*`), apenas enriquecidos com o contexto de fase (" Grupo A.") via
`matchPhaseLabel`. Nenhum tipo duplicado foi criado.

### IDs determinísticos (evitam duplicação por rerender)

```
group_groups_not_generated_<championshipId>
group_fixtures_not_generated_<championshipId>
group_structure_invalid_<championshipId>
group_stage_ready_<championshipId>
group_stage_blocked_<championshipId>
group_knockout_not_generated_<championshipId>
team_qualified_<championshipId>_<teamId>
team_eliminated_<championshipId>_<teamId>
knockout_match_defined_<matchId>_<teamId|playerId>
```

## 2. Destinos tipados (`PendingDestination` / rotas reais)

| Destino | Rota (FixturesStack) |
|---|---|
| `groups_overview` | `GroupsOverview { championshipId }` |
| `group_fixtures` | `GroupFixtures { championshipId, groupId? }` |
| `group_stage_review` | `GroupStageReview { championshipId }` — **só organizador** |
| `knockout_bracket` | `FixturesMain` (não há rota dedicada de chave) |

`resolvePendingDestination` devolve `null` (fallback seguro) quando o perfil não tem
acesso ao destino.

## 3. Tipos de notificação e mapeamento de destino

`InAppNotificationType` novos: `groups_generated`, `group_fixtures_generated`,
`group_stage_started`, `team_qualified`, `team_eliminated`, `knockout_generated`,
`knockout_match_defined`, `match_corrected`.

`normalizeActionType` mapeia (a navegação sai sempre do `type` + ids, nunca do texto):

| type da notificação | `NotificationActionType` | destino |
|---|---|---|
| `groups_generated`, `group_stage_started` | `groups_overview` | GroupsOverview |
| `group_fixtures_generated` | `group_fixtures` | GroupFixtures |
| `group_stage_ready` | `group_stage_review` | GroupStageReview |
| `knockout_generated`, `team_qualified` | `knockout_bracket` | FixturesMain |
| `team_eliminated` | `groups_overview` | GroupsOverview |
| `knockout_match_defined` | `match_prematch` | PreMatch |
| `match_corrected` | `match_summary` | MatchSummary |

Payload v1 estendido com `groupId` (`A`/`B`), `snapshotVersion`, `correctionVersion`.

## 4. deduplicationKeys (retry não duplica; versão nova gera nova)

```
groups_generated_<championshipId>_<groupGenerationVersion>
group_fixtures_generated_<championshipId>_<groupFixturesVersion>
team_qualified_<championshipId>_<snapshotVersion>_<teamId>
team_eliminated_<championshipId>_<snapshotVersion>_<teamId>
knockout_generated_<championshipId>_<knockoutGenerationVersion>
knockout_match_defined_<matchId>_<originSnapshotVersion>
match_corrected_<matchId>_<correctionVersion>
```

## 5. Emissão

Ponto único e idempotente — sempre **após** a transação e **só quando
`!result.idempotent`**:

- `generateAndPersistGroupAssignments` → `groups_generated`
- `generateAndPersistGroupFixtures` → `group_fixtures_generated`
- `completeGroupStageAndGenerateKnockout` → `team_qualified`/`team_eliminated`
  (por time, após snapshot persistido) + `knockout_generated` + `knockout_match_defined`
  (por confronto com ambos os slots definidos)

Orquestração em `services/groupStageNotifications.ts` (best-effort: falha de
notificação nunca reverte a geração já persistida). Recipientes: capitães dos times +
`userId` dos atletas (uma leitura escopada de `players` por campeonato — **única query
nova** desta fase, documentada aqui).

### Notificação de correção (fecha a ressalva do Bloco 10.3)

`MatchRegistrationScreen` emite `match_corrected` após `applyMatchCorrection` retornar
com sucesso e `!result.idempotent`. Inclui `matchId`, `championshipId`, `stage`,
`groupId` (quando existir), `correctionVersion`. Nunca emite em falha (está no `try`
pós-sucesso) nem em retry idempotente.

## 6. Testes manuais pendentes (Fase 4)

- Navegação real via toque na notificação em device (grupos/fixtures/review/chave).
- Troca de campeonato ao abrir notificação de outro campeonato em device.
- Emissão real no Firebase de desenvolvimento (push + in-app) para os 8 tipos.
- Verificação visual dos novos ícones no NotificationCenter.
