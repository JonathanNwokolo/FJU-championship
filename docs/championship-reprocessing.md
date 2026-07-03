# Championship Reprocessing

## Scope

Block 11 Phase 3 allows a closed championship to be reprocessed only as part of a
controlled match correction. There is no manual reprocess button in this phase.

The supported trigger is:

1. The owning organizer opens the existing correction flow for a finalized match.
2. The app detects an existing `championship_results` document or finalized
   championship state.
3. The correction is validated and persisted through `match_corrections`.
4. The persisted match is reloaded and must contain
   `lastCorrectionId == sourceCorrectionId`.
5. `reprocessClosedChampionship` runs immediately.
6. A deterministic immutable `championship_reprocess_logs/{reprocessId}` entry
   links the reprocess to the correction.

Out of scope for this phase:

- dedicated reprocess UI;
- visual review screen;
- notifications, push, deep links;
- seed, migration, E2E, release;
- group-stage reprocessing after knockout transition;
- knockout bracket-key reprocessing.

## Blocking Conditions

Closed-championship correction remains blocked when:

- `championship_results` is missing;
- caller is not the owning organizer;
- match is missing or outside the championship;
- format is unsupported by `reprocessClosedChampionship`;
- group-stage match was already frozen by snapshot/knockout generation;
- reason is missing or too short;
- `expectedCorrectionVersion` is stale;
- `expectedReprocessVersion` is stale and no deterministic retry log exists;
- reprocessing cannot confirm the corrected match's `lastCorrectionId`;
- reprocessing cannot compute a valid outcome.

Important typed errors include:

```text
championship_results_missing
closed_championship_reprocess_required
closed_championship_reprocess_unavailable
stale_reprocess_version
group_stage_locked_after_knockout_generation
```

## Data Loaded

The integrated service loads championship-scoped data where possible:

- teams;
- players;
- matches;
- match events;
- round awards;
- `championship_results`;
- `player_history` for the championship;
- achievements for players in the championship, queried by `collectionGroup`.

Global data is still loaded for:

- all `player_history`;
- all `career_stats`;
- all `championship_results`.

This global load is required by current all-time ranking rebuild logic. Expected
production volume should stay modest for the current app limits: tens of matches,
events, and players per championship, four end-of-championship achievement types,
one history row per user per championship, and five global ranking documents. If
the app moves toward hundreds of players or many seasons, this path should be
moved to a backend/admin worker before release.

## Consistency And Recovery

Correction and reprocessing are not one Firestore transaction. The correction
transaction must commit first so the reprocessor can reload the persisted match
and verify `lastCorrectionId`.

Recovery contract:

- retry uses the same `sourceCorrectionId`;
- reprocess log ID is deterministic from championship, correction, and version;
- retry does not duplicate logs;
- achievements are set/update by deterministic achievement ID;
- revocation is soft, never delete;
- no failure is hidden from the UI.

No `reprocessPending` field was added in Phase 3. The deterministic
`sourceCorrectionId` plus typed error is enough for retry; adding a new pending
state would require a broader operational UI that is explicitly out of scope.

## Achievements

Only end-of-championship achievements are reconciled:

- `campeao`;
- `vice_campeao`;
- `artilheiro_campeonato`;
- `fair_play_campeonato`.

Newly valid achievements are granted with `sourceReprocessId`. Previously valid
but no-longer-valid achievements are preserved and marked revoked with
`revoked`, `revokedAt`, `revokedBy`, `revokedReason`, and `sourceReprocessId`.
Achievements unrelated to the championship are not touched.

When the recomputed outcome has no change, a reprocess log is still written and
achievements are not touched. `reprocess_no_effect` is not fatal for the normal
integrated path.

## Rules

Phase 3 added the minimum Rules surface needed by the real client path:

- `championship_reprocess_logs`: owning-organizer create, required shape,
  correction link, immutable after creation;
- `player_history`: update by owning organizer for the same championship.

Existing organizer write rules continue to cover `championship_results`,
`career_stats`, `all_time_rankings`, and player achievement subcollections. The
ranking collections are global by design, so owner scoping is limited by the
current data model.

## Manual Validation Pending

Manual validation has not been executed. Before release, run the app on a real
device or AVD, perform a closed-championship correction, and inspect:

- `match_corrections`;
- `championship_reprocess_logs`;
- `championship_results`;
- `player_history`;
- `career_stats`;
- `all_time_rankings`;
- `players/{playerId}/achievements`.

Also repeat the same correction/retry and confirm no duplicate logs or
achievements are created.
