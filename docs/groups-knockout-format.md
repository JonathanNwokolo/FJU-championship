# Groups + Knockout Format

This document records the approved domain decisions for Block 10. Sub-block A
defined the format. Sub-block B added structural read models, deterministic
future IDs, compatibility normalizers, selectors, snapshot contracts, and pure
validation. Sub-block C adds deterministic, auditable assignment of approved
teams into groups A and B. Block 10.1 adds deterministic group fixtures plus
pure group standings and tiebreakers.

Transition to knockout, qualifier snapshots, knockout bracket generation, UI,
notifications, pending items, operational seed, migrations, and Firestore Rules
remain out of scope for Block 10.1.

## Supported Structure

- Exactly 2 fixed groups.
- Balanced group distribution, with a maximum difference of 1 team.
- One match per pair inside each group.
- Qualification by group position.
- Transition from group stage to knockout.
- Structural byes are allowed when the total qualifiers count is not a power of
  2, because the existing bracket generator supports byes.
- Dynamic group counts are deliberately not supported in this block.

The architecture may evolve later, but the current UI, validation, and services
must only accept `groupCount = 2`.

## Limits

- Minimum approved teams: 4.
- Maximum teams: reuse the championship `maxTeams` value.
- Minimum per group: 2 teams.
- Maximum difference between groups: 1 team.
- `qualifiersPerGroup` must be at least 1.
- `qualifiersPerGroup` must not exceed the smallest group size.
- Total qualifiers must be at least 2.
- Total qualifiers do not need to be a power of 2.

## Best Third Placed

Best third placed teams are intentionally out of scope.

The only supported values are:

```ts
includeBestThirdPlaced: false
bestThirdPlacedCount: 0
```

No UI should expose this option during this block.

## Draw

The initial supported draw method is:

```ts
drawMethod: 'random'
```

The draw must be executed once per administrative operation, persisted,
auditable, stable after persistence, idempotent, and impossible to redo after
any match has started. `Math.random()` must not be used during render,
selectors, or read paths. If controlled randomness is used, it belongs only to
the administrative operation that persists the result.

Sub-block C implements distribution and assignment persistence only. It does not
create matches.

The pure algorithm is `distributeTeamsIntoGroups` in
`src/utils/groupStageDistribution.ts`.

- Inputs are `championshipId`, approved `teamIds`, explicit `drawSeed`, and
  `groupCount = 2`.
- The input list is copied and sorted before deterministic ordering, so the
  result does not depend on the received array order.
- Each team receives a stable hash key derived from
  `championshipId|drawSeed|teamId`.
- Teams are assigned alternately into deterministic group IDs:

```ts
getGroupId(championshipId, 'A')
getGroupId(championshipId, 'B')
```

- `groupSeed` starts at 1 inside each group.
- `assignmentOrder` records the deterministic draw order.
- Every team appears exactly once.
- Group sizes differ by at most 1 and never fall below 2 teams.
- The algorithm never calls `Math.random()`.

The returned contract is:

```ts
type GroupAssignment = {
  teamId: string
  groupId: string
  groupSeed: number
  assignmentOrder: number
}

type GroupDistributionResult = {
  championshipId: string
  generationVersion: number
  algorithmVersion: 1
  drawSeed: string
  groupA: GroupAssignment[]
  groupB: GroupAssignment[]
  assignments: GroupAssignment[]
}
```

## Draw Seed

The persisted administrative operation creates one seed with
`createGroupDrawSeed()` when the caller does not provide one. It uses
`globalThis.crypto.getRandomValues` when available in the runtime and falls back
to a timestamp/counter-based value without adding a dependency.

The seed is not recalculated on retry. It is stored in the immutable
`group_assignment_logs/{logId}` document and returned by idempotent reads of the
persisted assignment.

Preview may create a temporary `preview-group-draw-*` seed, but preview does not
write the seed, teams, championship, versions, or logs.

## Administrative Persistence

The administrative service is `generateAndPersistGroupAssignments` in
`src/services/groupStageService.ts`.

It performs:

1. Organizer ownership validation.
2. Championship load and format validation.
3. Group config normalization/validation through the existing group-stage
   rules.
4. Approved-team filtering through the existing `canTeamParticipate` rule.
5. Structural checks for duplicates, championship ownership, `maxTeams`, and
   minimum teams.
6. State and match/event locks.
7. Seed selection.
8. Pure deterministic distribution.
9. Post-distribution validation.
10. Single Firestore transaction for team assignments, championship versioning,
    and the audit log.

Team updates:

```ts
groupId
groupSeed
groupAssignmentVersion
```

Championship updates:

```ts
groupStageStatus = 'groups_generated'
groupGenerationVersion = previous + 1
groupStructureVersion = 1
knockoutStageStatus = existing value ?? 'not_generated'
```

Conservative stage decision: Sub-block C does not set `stage = 'group_stage'`.
The championship may remain in `registration` after assignment because no group
fixtures exist yet. Sub-block D, which creates fixtures, owns the transition to
an active group-stage runtime state. No fake start dates are written.

## Assignment History

Sub-block C writes immutable logs to:

```text
group_assignment_logs/{group_assignment_<championshipId>_<generationVersion>}
```

The log contract is:

```ts
type GroupAssignmentLog = {
  id: string
  championshipId: string
  generationVersion: number
  algorithmVersion: 1
  drawSeed: string
  assignments: GroupAssignment[]
  createdBy: string
  createdAt: Timestamp
}
```

The log ID is deterministic per championship and generation version. The service
does not overwrite prior versions and does not create a duplicate log on retry.

## Idempotency And Concurrency

`groupGenerationVersion` is the optimistic version. A fresh generation expects
version `0` for legacy/not-generated championships and writes version `1`.

- Same persisted version and complete assignments: return the persisted
  distribution.
- Stale `expectedGenerationVersion`: throw `stale_generation_version`.
- Already generated but incomplete/corrupt assignments: throw
  `group_assignments_already_generated`.
- Redraw is deliberately not implemented; `requestGroupRedraw()` throws
  `group_redraw_not_implemented`.

The commit transaction rereads the championship, checks owner, format, status,
version, generated groups, knockout locks, and the deterministic log document
before writing. Team assignment updates, championship versioning, and the log are
committed together; a mid-transaction failure leaves no partial writes.

Two simultaneous calls cannot both persist different assignments. The first
commit wins; the later transaction sees a changed version/generated state and
fails with a typed version/generated error.

## Generation Blocks

Group assignment is blocked when:

- Format is not `grupos_e_mata_mata`.
- Group config is invalid.
- Fewer than 4 approved teams exist.
- Approved teams exceed `maxTeams`.
- Team IDs are duplicated.
- Any approved team is inconsistent or outside the championship.
- The championship has already started.
- Group matches already exist.
- A group match already has a persisted event.
- Any match is live, final, or W.O.
- Knockout has already been generated.
- Groups were already generated but persisted assignments are incomplete.
- The caller is not the owning organizer.
- The expected generation version is stale.

These are all typed service errors, not loose UI strings.

## Group Fixtures

Block 10.1 implements group fixture generation in
`src/utils/groupStageFixtures.ts` and persistence in
`generateAndPersistGroupFixtures`.

Fixtures are generated only for `grupos_e_mata_mata` championships that already
have valid persisted assignments:

- `groupStageConfig` must validate.
- `groupGenerationVersion` must be greater than 0.
- `group_assignment_logs/{group_assignment_<championshipId>_<version>}` must
  exist.
- Every approved active team must have `groupId`, `groupSeed`, and the current
  `groupAssignmentVersion`.
- Groups must be balanced and have at least 2 teams each.
- No group fixture partial structure may exist.
- No knockout match may exist.
- The championship must not have started group play or generated knockout.

Teams are ordered inside each group by:

1. `groupSeed`.
2. `teamId`.

The algorithm is a deterministic circle-method round-robin per group. Groups A
and B are generated independently. For `n` teams, each group creates
`n * (n - 1) / 2` matches.

Round count:

- Even group size: `n - 1` rounds.
- Odd group size: `n` rounds.
- Odd groups use a structural BYE slot. BYE never creates a match document,
  score, winner, or placeholder team.

`groupRound` starts at 1 inside each group. The global `round` field is kept
equal to `groupRound` for compatibility, but standings and group flows must use
`groupId + groupRound`, not only `round`. Groups A and B may both have
`groupRound = 1`.

Home/away is deterministic from the circle-method slot order. The first pair is
alternated by round parity, while the other pairs use the opposite parity. This
keeps the same input producing the same home/away assignment and avoids making a
fixed seed the home team in every possible match.

IDs are generated with:

```ts
getGroupFixtureId(championshipId, groupId, homeTeamId, awayTeamId)
```

The ID normalizes the pair order so an inverted duplicate cannot exist under a
different ID. The persisted `homeTeamId` and `awayTeamId` remain the deterministic
orientation chosen by the algorithm. No UUID, timestamp, auto ID, or
`Math.random()` is used.

The fixture contract is:

```ts
{
  championshipId,
  stage: 'group',
  groupId,
  groupRound,
  round: groupRound,
  homeTeamId,
  awayTeamId,
  homeScore: null,
  awayScore: null,
  status: 'agendado',
  structureVersion: 1,
  groupGenerationVersion,
  originSnapshotVersion: null,
  nextMatchId: null,
}
```

Fixtures do not set `winnerId`, fake scores, `knockoutRound`, advancement, BYE
documents, or fake dates. Dates remain absent unless a future explicit schedule
operation supplies them.

After a successful commit, the championship is updated with:

```ts
stage = 'group_stage'
groupStageStatus = 'fixtures_generated'
groupStructureVersion = 1
groupFixturesVersion = 1
groupFixturesGeneratedAt = serverTimestamp()
```

The operation writes immutable logs to:

```text
group_fixture_logs/{group_fixtures_<championshipId>_<fixturesVersion>}
```

The log stores `fixtureIds`, `fixtureCount`, counts per group, the group
generation version, structure version, creator, and timestamp.

Idempotency:

- Complete persisted fixtures matching the deterministic version are returned.
- Retry does not invert home/away, change rounds, increment version, or duplicate
  logs.
- Partial group fixtures throw `partial_group_fixtures_detected`.

Concurrency:

- The Firestore transaction rereads the championship, assignment log, fixture
  log, and every deterministic fixture document before writing.
- Matches, log, and championship update commit together.
- The expected operating volume is the championship match count, well below the
  Firestore transaction write limit for the current app limits. If future limits
  increase near transaction limits, this must be redesigned before enabling the
  larger format.

The legacy `fixturesService.buildFixtures` path now throws
`groups_knockout_requires_group_fixture_service` for `grupos_e_mata_mata`.
It must never fall back to global round-robin or generate A x B group matches.

## Validation And Tests

Sub-block C and Block 10.1 add focused tests:

- `src/__tests__/groupStageDistribution.test.ts`
- `src/__tests__/groupStageService.test.ts`
- `src/__tests__/groupStageFixturesGeneration.test.ts`
- `src/__tests__/groupStandings.test.ts`
- `src/__tests__/fixturesService.groups.test.ts`

The pure tests cover sizes 4 through 10, same seed, different seed, input order
independence, no duplicate/lost teams, balance, minimum group size, sequential
seeds, non-mutating input, duplicate teams, fewer than 4 teams, and championship
ID as part of the deterministic ordering.

The service tests cover preview, valid organizer, permission denial, wrong
format, invalid config, even/odd team counts, rejected/removed teams ignored,
duplicate teams, persistence, audit log, idempotent retry, stale version, groups
already generated, match/status/event locks, concurrency, and transaction
atomicity on failure.

Block 10.1 fixture tests cover groups with 2 through 8 teams, A+B combinations
2x2 through 5x4, formula counts, round counts, no self-match, no duplicates, no
persisted BYE, one match per team per group round, stable home/away, shuffled
input stability, non-mutating input, deterministic IDs, service idempotency,
partial detection, concurrency, and legacy fallback protection.

Firestore Rules are unchanged in Sub-block C. If a future client path needs new
write permission for these fields, that must be proposed as a minimal organizer
only Rules change with dedicated Rules tests.

## Group Standings And Tiebreakers

Block 10.1 implements pure group standings in `src/utils/groupStandings.ts`.
Standings are derived from in-memory inputs and are not persisted as a primary
source of truth.

The source of truth is:

- Approved teams from the requested group.
- Matches with `stage = 'group'`.
- The same normalized `groupId`.
- Valid final or W.O. results.
- Current corrected match scores.
- Active card events only; soft-deleted events are ignored.

Counted matches:

- `finalizado`
- `wo`

Ignored matches:

- `agendado`
- `ao_vivo`
- `adiado`
- `cancelado`
- other group
- knockout
- league
- missing participants

W.O. uses the administrative score already written by `matchStatusService`
(`3x0` or `0x3`), counts for points and goal difference, and does not create
individual goals or assists.

Cancelled and postponed matches do not count in the table. Corrected matches are
read through the current match document score; removed events do not count for
cards.

The approved order is:

1. Points.
2. Wins.
3. Goal difference.
4. Goals for.
5. Head-to-head by mini-table.
6. Fewest cards.
7. Deterministic technical draw.

For ties involving three or more teams, head-to-head must use only the mini-table
between the tied teams. A simple two-team head-to-head rule must not be applied
to a multi-team tie.

The final technical draw must be deterministic and stable.

For two tied teams, head-to-head uses only matches between those two. For three
or more tied teams, the helper builds a mini-table using only matches among the
tied teams and compares mini-table points, wins, goal difference, and goals for.
Matches against teams outside the tie are not part of the mini-table.

Cards use conservative total count: yellow + red. No hidden red-card weight is
invented for group standings. If the product later approves weighted fair play,
this document and tests must be updated.

The final technical draw uses a stable hash from:

```text
championshipId + groupId + teamId
```

Rows include a structured `tiebreakReason`, one of:

```ts
points
wins
goal_difference
goals_for
head_to_head
fewest_cards
deterministic_draw
```

Selectors are pure and listener-free:

- `getGroupStandings`
- `getAllGroupStandings`
- `getGroupLeader`
- `getProvisionalQualifiers`

`qualifiedStatus` may be `qualified`, `not_qualified`, or `undecided`. Block
10.1 only marks qualified/not qualified when all matches in that group are
resolved. It does not create snapshots, advance teams, or project probabilities.

Structural validation rejects duplicate teams, missing/invalid groups, group
matches without explicit stage/group, cross-group participants, invalid scores,
W.O. without valid winner, duplicate match IDs, and self-matches. It does not
repair corrupt input automatically.

## Cancelled Group Matches

A cancelled group match must not:

- Count in standings.
- Generate points.
- Generate a winner.
- Be treated automatically as a draw.
- Allow group-stage completion.

It must block `canCompleteGroupStage` until an administrative resolution or a
reschedule exists. This block does not invent an automatic resolution.

## Corrections Before Transition

Before knockout generation, the system must allow auditable correction,
recalculate standings, recalculate positions, allow qualifier changes, and update
derived pending items.

## Corrections After Transition

After the qualifiers snapshot or knockout bracket is generated, every group
stage match correction must be blocked with this typed error:

```text
group_stage_locked_after_knockout_generation
```

The system must not try to detect whether a correction would or would not change
qualifiers. Post-transition corrections belong to Block 11.

## Block 11 Phase 3 - Closed Championship Corrections

Block 11 Phase 3 integrates closed-championship reprocessing only through the
controlled match correction flow. It does not add a manual reprocess button, a
review screen, notifications, push, deep links, seed, migration, E2E, release, or
post-transition group/bracket reprocessing.

For closed championships, correction is allowed only when `championship_results`
exists, the caller is the owning organizer, the match belongs to the
championship, the format is supported by `reprocessClosedChampionship`, the
correction reason and correction version are valid, and the expected
`reprocessVersion` can be reconciled immediately.

Group-stage matches after the qualifier snapshot or knockout bracket was
generated remain blocked with:

```text
group_stage_locked_after_knockout_generation
```

The Phase 3 flow order is:

1. Persist the controlled correction and immutable `match_corrections` log.
2. Reload the corrected match and confirm `lastCorrectionId`.
3. Run `reprocessClosedChampionship` with `sourceCorrectionId`.
4. Persist `championship_reprocess_logs`.
5. Reconcile `championship_results`, `player_history`, `career_stats`,
   `all_time_rankings`, and end-of-championship achievements.

Achievements are reconciled by granting newly valid achievements and soft
revoking no-longer-valid achievements. Revoked achievements are preserved with
`revoked`, `revokedAt`, `revokedBy`, `revokedReason`, and `sourceReprocessId`.
Achievements unrelated to the championship are not touched.

## Source Of Truth

- Matches are the source of truth for results.
- Standings are a pure derivation.
- The qualifiers snapshot is the frozen source of truth for transition.
- The bracket is a consequence of the snapshot.
- No per-group standings document is persisted as the primary source.

## Legacy Compatibility

- Missing `format` must preserve current legacy behavior.
- Missing championship `stage` is inferred conservatively during reads:
  - `pontos_corridos` in progress resolves to the read-only `league` stage.
  - `mata_mata` in progress resolves to `knockout`.
  - `grupos_e_mata_mata` resolves to `registration` until groups are generated,
    then `group_stage`, `group_stage_completed`, or `knockout` according to
    structural status fields.
- Missing `groupStageConfig` must not break reads.
- Existing championships are not converted automatically.
- Defaults are not persisted during read normalization.
- Legacy matches without `stage` emit a structural warning. They may be read as
  `league` or `knockout` for old formats, but group matches in
  `grupos_e_mata_mata` are not assigned to a group by round inference.

## Sub-block B Structural Fields

Championships may now carry optional structural fields:

```ts
stage?: ChampionshipStage
groupStageConfig?: GroupStageConfig
groupStageStatus?: GroupStageStatus
knockoutStageStatus?: KnockoutStageStatus
groupStructureVersion?: 1
groupGenerationVersion?: number
groupStageLockedAt?: Date | Timestamp | null
knockoutGeneratedAt?: Date | Timestamp | null
```

Teams may carry:

```ts
groupId?: string | null
groupSeed?: number | null
groupAssignmentVersion?: number
```

Matches may carry:

```ts
stage?: MatchStage
groupId?: string | null
groupRound?: number | null
knockoutRound?: string | number | null
structureVersion?: number
originSnapshotVersion?: number | null
```

All of these fields are optional for legacy documents. Read normalization must
preserve the original document object and must not write implicit defaults.

## Deterministic Future IDs

Sub-block B prepares pure ID helpers only:

```ts
getGroupId(championshipId, 'A')
getGroupFixtureId(championshipId, groupId, teamAId, teamBId)
getKnockoutFixtureId(championshipId, round, slot)
getGroupSnapshotId(championshipId, version)
```

Group fixture IDs normalize team order, sanitize unsafe path characters, and do
not use timestamps, UUIDs, or random values. No legacy match IDs are changed.

## Structural Selectors

The structural helpers are pure and listener-free:

- `getChampionshipTeamsByGroup`
- `getMatchesByStage`
- `getGroupMatches`
- `getKnockoutMatches`
- `getCurrentChampionshipStage`
- `hasGeneratedGroups`
- `hasStartedGroupStage`
- `hasGeneratedKnockout`

These helpers are intentionally not wired into components or services during
Sub-block B.

## Qualification Snapshot Contract

The future transition snapshot is typed but not persisted or generated yet:

```ts
type QualifiedTeamSnapshot = {
  teamId: string
  groupId: string
  position: number
  points: number
  wins: number
  goalDifference: number
  goalsFor: number
  deterministicSeed: string
}

type GroupStageQualificationSnapshot = {
  version: number
  championshipId: string
  generatedAt: Date | Timestamp
  configVersion: 1
  qualifiers: QualifiedTeamSnapshot[]
}
```

Pure validation currently checks snapshot versioning, duplicate teams, positive
positions, and supported group IDs.

## Typed Errors

Sub-block A defines typed error codes for current validation and future service
guards, including:

- `invalid_group_count`
- `insufficient_teams_for_groups`
- `too_many_teams_for_championship`
- `invalid_qualifiers_per_group`
- `best_third_placed_not_supported`
- `missing_tiebreakers`
- `duplicate_tiebreaker`
- `unsupported_tiebreaker_order`
- `invalid_draw_method`
- `invalid_group_stage_config_version`
- `group_stage_already_started`
- `group_stage_not_ready`
- `group_stage_locked_after_knockout_generation`
- `invalid_group_assignment`
- `invalid_group_fixture`

## Block 10.2 - Group Stage Completion And Knockout Transition

Block 10.2 implements the safe transition from completed group fixtures to the
knockout bracket. It does not add UI, notifications, seed/mock data, migrations,
or Block 11 reprocessing.

### Completion Criteria

`canCompleteGroupStage` returns a structured result, not a boolean:

- `allowed`
- `blockers`
- `warnings`
- `resolvedMatchCount`
- `expectedMatchCount`
- `groupSummaries`

The check blocks incompatible format/stage, missing groups, missing fixtures,
invalid config, invalid group sizes, teams without a valid group, assignment
version drift, partial/missing/duplicated fixtures, cross-group matches, live or
unresolved matches, postponed matches, cancelled matches without administrative
resolution, invalid scores, inconsistent W.O., invalid standings, invalid
qualifier counts, existing knockout generation, snapshot conflict, and structure
version drift.

Resolved group matches are only:

- `finalizado`
- valid `wo`

`agendado`, `ao_vivo`, `adiado`, `cancelado`, invalid matches, and matches
without valid scores do not resolve the group stage. Cancelled matches are not
converted into invented results.

Warnings do not block the transition. Current warnings include card tiebreaks,
deterministic technical draw, structural BYEs, one-team group size difference,
and deterministic qualifier notes.

### Standings And Qualifiers

The transition uses only `calculateGroupStandings`, normalized group config,
approved teams, valid group matches, and `qualifiersPerGroup`. It does not
persist derived qualification status on teams as a source of truth. Qualified
and eliminated status is a consequence of the snapshot.

For each group the final ordered standings are calculated, the first
`qualifiersPerGroup` rows are selected, and the selection is rejected if a team
is duplicated, outside its group, missing a valid assignment, or has an invalid
position.

### Snapshot And Digest

Snapshots are persisted in:

```text
group_stage_snapshots/{getGroupSnapshotId(championshipId, version)}
```

Version `1` is used for the first transition. IDs are deterministic; auto IDs
are not used.

The generated snapshot includes:

- championship, structure, config, group generation, and fixture versions
- `qualifiersPerGroup`
- final qualifier rows with points, wins, draws, losses, goals, cards,
  tiebreak reason, group seed, group position, knockout seed, and deterministic
  seed
- `standingsDigest`
- `generatedBy`
- `generatedAt`

The digest is a stable hash of the relevant standings, qualifiers, versions,
team assignments, and resolved group matches. It supports idempotent retries and
conflict detection. A retry with the same digest returns the existing snapshot;
a retry with a different digest fails with `group_stage_snapshot_conflict`.

Snapshots are immutable in service logic and Firestore Rules.

### Seeding, Crossings, And BYEs

`buildKnockoutSeedsFromGroupSnapshot` is pure and deterministic. For two groups:

- 2 qualified teams: `1A x 1B`
- 4 qualified teams: `1A x 2B`, `1B x 2A`
- 8 qualified teams: `1A x 4B`, `2A x 3B`, `1B x 4A`, `2B x 3A`

For other counts, the helper keeps a stable order, preserves group positions,
avoids same-group first-round matches when practical, and records notes when
structural BYEs or unavoidable pairings exist. No random draw is used.

### Bracket Generation

The transition reuses `generateBracketFixtures` for BYEs, `N - 1` competitive
matches, advancement slots, and `nextMatchId`. After generation, temporary IDs
are remapped to:

```ts
getKnockoutFixtureId(championshipId, knockoutRound, slot)
```

Every knockout match starts as:

```ts
{
  championshipId,
  stage: 'knockout',
  groupId: null,
  knockoutRound,
  structureVersion: 1,
  originSnapshotVersion: snapshotVersion,
  status: 'agendado',
  homeTeamId,
  awayTeamId,
  nextMatchId
}
```

BYEs are structural advancement only. The system does not create fake
participants, fake scores, or completed BYE matches. Dates are not invented.

### Transaction, Log, And Versions

`completeGroupStageAndGenerateKnockout` validates organizer ownership, loads the
championship, approved teams, group fixtures, and events, recalculates
standings, checks completion, builds the snapshot, builds seeds, builds the
bracket, validates the bracket, then persists all writes in one transaction.

On success the championship is updated to:

```ts
stage = 'knockout'
groupStageStatus = 'completed'
knockoutStageStatus = 'generated'
groupStageLockedAt = serverTimestamp()
knockoutGeneratedAt = serverTimestamp()
groupSnapshotVersion = 1
knockoutGenerationVersion = 1
groupStageComplete = true
```

The immutable transition log is stored in:

```text
group_transition_logs/group_transition_<championshipId>_<version>
```

It contains the snapshot ID, digest, knockout version, qualifier IDs, fixture
IDs, creator, and creation timestamp.

### Idempotency And Concurrency

Retrying with the same snapshot and same bracket returns the existing
transition. It does not duplicate snapshots, matches, logs, seeds, or versions.

Conflicts are typed and not auto-corrected:

- `group_stage_snapshot_conflict`
- `knockout_structure_conflict`
- `group_stage_already_completed`
- `stale_group_transition_version`

The championship document is the transaction lock. Parallel calls cannot commit
two different snapshots or two different brackets.

### Post-Transition Guards

After transition, group redraw/regeneration and fixture regeneration are blocked
by the existing group/fixture service guards. Group-stage match correction is
blocked with:

```text
group_stage_locked_after_knockout_generation
```

Block 10.2 does not reprocess qualifiers, snapshots, or brackets after a
correction. That belongs to Block 11.

### Rules

Rules were changed only for the new persistence surface:

- organizers who own the championship may create `group_stage_snapshots`
- organizers who own the championship may create `group_transition_logs`
- captains and athletes cannot create them
- both collections are immutable after creation

The existing organizer-only `matches` creation and championship update rules
cover the bracket and championship fields; no broad generic write was added.

## Block 10.3 - Coverage Summary

Block 10.3 closes the groups + knockout lifecycle by validating the final
operational behavior of match status transitions, group completion, snapshot
immutability, and post-transition guard rails.

It includes the coverage expectations that:

- group stage standings derive only from valid `finalizado` and valid `wo`
  matches; `adiado` and `cancelado` do not count
- `canCompleteGroupStage` blocks until unresolved, postponed, or cancelled
  group matches are administratively resolved
- knockout generation is only allowed after a complete, consistent group stage
  and an immutable snapshot is persisted
- corrections before transition are permitted, while corrections after
  transition are blocked with `group_stage_locked_after_knockout_generation`
- convocation and attendance reconfirmation flow state is preserved by
  administrative status changes
- notification / pending action normalization remains consistent with match
  status effects

This document is a structural reference; the real implementation validation is
expressed in service layers under `src/services`, pure helpers under
`src/utils`, and focused Jest + Firestore Rules tests.

## Block 10.4 - Group + Knockout UI (Phase 4 closeout)

Block 10.4 wires the already-approved domain (10.1–10.3) into the app UI. It adds
no new business rules: standings, transition, distribution, structure,
completion, snapshots, and bracket generation stay in the tested `utils`/
`services`. The UI layer only turns domain output into labels, screens, and
navigation via the pure `groupStagePresentation` and `groupStageReview` helpers.

### Screens

- Creation (`CreateChampionshipScreen`): the `grupos_e_mata_mata` format card,
  gated by the `GROUPS_FORMAT_UI_ENABLED` flag, plus the group-stage config
  block (2 fixed groups, qualifiers-per-group stepper, random draw, tiebreak
  summary). Config is validated through `buildCreationGroupStageConfig` before
  save; only `groupStageConfig`, `groupStageStatus`, `knockoutStageStatus`, and
  `groupStructureVersion` are persisted for the new format.
- Dashboard (`ChampionshipDashboardScreen` → `GroupStagePanel`): current phase,
  group/knockout status, group count, qualifiers, resolved-match progress, and
  only the actions valid for the real state. Organizer-owner sees administrative
  actions; other profiles see view-only actions. No invalid action is rendered
  as a disabled button.
- Groups (`GroupsOverviewScreen`): per-group standings tables with textual
  qualification status, notable tiebreak reasons, and empty states for
  not-a-groups-format / groups-not-drawn / standings-unavailable.
- Group fixtures (`GroupFixturesScreen`): fixture cards filtered by
  all/A/B/upcoming/finished, each card carrying group, round, teams, and status.
- Review (`GroupStageReviewScreen`): qualifiers/eliminated per group, predicted
  crossings, structural BYE explanation, non-blocking warnings, blocking
  pendings, and the "complete and generate knockout" CTA with double-tap and
  concurrency guards.
- Bracket (`FixturesScreen`): reuses the existing bracket view and labels the
  qualifier origin ("1º Grupo A") read once from the frozen transition snapshot.

### Accessibility

Group screens and cards describe state without relying on color alone:

- standings rows expose `describeStandingRowForAccessibility` (position, team,
  points, played, goal difference, qualification status);
- qualification/severity are also textual (chips, tags), never color-only;
- format cards, filter chips, and the review CTA carry `accessibilityRole`,
  `accessibilityLabel`, and `accessibilityState` (`selected`/`disabled`/`busy`);
- BYE is always "Classificado automaticamente" — never "team × empty" or a fake
  score;
- blockers and warnings use plain language via `getBlockerLabel`/`getWarningLabel`;
- fixture cards label group, round, teams, and status in a single sentence.

### Performance

- No per-group, per-card, or per-team listeners; screens read the existing
  championship/team/match stores and derive with `useMemo`.
- Standings and pending items are computed once per relevant input set, not per
  row.
- The bracket-origin snapshot is a single pointed `getDocument` fetch keyed by
  championship id + snapshot version (memoized), so it does not refetch when
  match scores or events change and does not create a refresh loop.

### Flag

`GROUPS_FORMAT_UI_ENABLED` (in `CreateChampionshipScreen`) gates only the
creation entry point. Phase 4 turns it `true` after creation, dashboard, groups,
fixtures, review, bracket, pending, and notification flows are covered by
automated tests. While `false`, the card stays "Em breve" and no
`groupStageConfig` is written; the old formats are unaffected either way.

### Limitations

- Best-third-placed, dynamic group counts, and non-random draw remain out of
  scope and are not exposed in the UI.
- Post-transition group-match correction stays blocked
  (`group_stage_locked_after_knockout_generation`); reprocessing belongs to
  Block 11.
- The UI is covered by automated Jest tests only. Real device/AVD validation,
  real push, screen-reader validation, and the full organizer/captain/athlete
  journey are pending (see `docs/pre-production-pending.md`).

### Tests

Focused Jest suites for Phase 4:

- `src/__tests__/CreateChampionshipScreen.test.tsx` — flag on, format card not
  "Em breve", config section reveal, valid save writes `groupStageConfig`,
  invalid config blocks, old formats save without `groupStageConfig`.
- `src/__tests__/GroupStageScreens.a11y.test.tsx` — GroupsOverview /
  GroupFixtures / GroupStageReview accessibility labels, filters, BYE label, and
  CTA blocked/ready state.
- Existing `groupStagePresentation`, `groupStageReview`, `pendingRulesGroups`,
  `notificationActionPipeline`, and `notificationActionOrchestrator` suites cover
  the pure presentation, pending, and notification routing.

Firestore Rules and migrations were not touched in Phase 4; they remain as
closed in Block 10.2/10.3 and are re-run at the Block 10.5 gate.

## Block 10.5 - Mocks, Seed, Audit, Rules Closeout

Block 10.5 closes Block 10 by covering the `grupos_e_mata_mata` format with
realistic mock/seed data, an audit that detects structural inconsistencies, a
conservative backfill, and the last Rules gap. No new business rule is added and
no legacy championship is auto-converted.

### Mock data

`src/mocks/mockData.ts` adds two group championships:

- **Champ D** (`champ-grupos-d`) — group stage in progress: 2 groups × 4 teams,
  fixtures generated, mixed match states (0-0 finished, W.O. 3x0, postponed,
  cancelled, scheduled), a convocation/attendance, plus the assignment and
  fixture logs.
- **Champ E** (`champ-grupos-e`) — transition completed: 2 groups × 2 teams,
  frozen qualifier snapshot with digest, transition log, and a knockout final
  fixture labelled from the snapshot origin (`1º Grupo A`).

Matches use only 0-0 finished or W.O. results so the mock's score↔events
coherence invariant holds; `approvedPlayersCount` matches the active roster. The
group log/snapshot collections are exposed through `mockCollections` for the
mock DB. `mockData.test.ts` asserts D/E structure. The **diagnostic invalid
scenario (Champ F)** lives in the operational seed, where the audit actually
runs, per "prefer a separate diagnostic championship".

### Operational seed

`scripts/seedOperationalValidation.js` adds `ov_champ_d`, `ov_champ_e`, and
`ov_champ_f` with deterministic `ov_` IDs:

- D — complete group fixtures (3 teams/group) in progress, logs.
- E — snapshot + transition log + knockout final + a `group_stage_started`
  notification.
- F — controlled inconsistencies for the audit: missing `groupStageConfig`, a
  team without `groupId`, an invalid `groupId`, a cross-group match, knockout
  generated without snapshot and without `groupStageLockedAt`, and a knockout
  match without `originSnapshotVersion`.

The seed stays deterministic and idempotent (same IDs and counts on re-run) and
refuses production targets. `scripts/__tests__/seedOperationalGroups.test.js`
builds the seed, runs the audit on it, and asserts D/E are clean while F is
flagged (including a CRITICAL missing-snapshot) — this validates the seed
without needing the Emulator running.

### Audit and backfill

`scripts/migration/legacyDataCore.js` adds a `groups` audit category detecting:
missing/invalid config, incompatible `groupStageStatus`/`knockoutStageStatus`/
`stage`, teams without/with invalid `groupId`, invalid `groupSeed`, assignment
version drift, unbalanced groups, missing/partial/duplicated/cross-group
fixtures, group match without `groupId`, knockout without `originSnapshotVersion`,
missing snapshot (CRITICAL when knockout exists), digest divergence, missing
`groupStageLockedAt`/`knockoutGeneratedAt`, cancelled/postponed group matches
blocking completion, and inconsistent group W.O.

Severities: `critical`/`high`/`medium`/`low`/`info`. The only auto-fix is a
conservative fill of a missing `stage` when the state is unambiguous
(`group_stage` or `knockout`) — it never assigns a group, generates fixtures,
creates a snapshot, regenerates a bracket, or converts an old format. Auto-fix is
dry-run by default and idempotent.

### Rules

Block 10.2 already covered `group_stage_snapshots` and `group_transition_logs`.
Block 10.5 adds the missing **`group_assignment_logs`** and
**`group_fixture_logs`** rules (the client writes them but they had no match
block, so production would deny them): owning-organizer create only, required
field shape, deterministic id, immutable after creation, signed-in read.
`rules/firestore.rules.test.js` adds success + denial (captain/athlete/other
organizer), immutability, id/shape, and read cases.

### Limitations / pending manual validation

- `npm run dev:prepare` (reset Emulator + seed Auth + operational seed) and
  `npm run migrate:data:dry` against the running Emulator are **not executed
  here** (no Emulator process / device in this environment); the seed↔audit
  consistency is instead proven by the Jest script test above.
- Real device/AVD journey, real push, notification deep links, and screen-reader
  validation remain pending (see `docs/pre-production-pending.md`).

This closes Block 10 for continued development and manual testing; it does not
authorize a public release.
