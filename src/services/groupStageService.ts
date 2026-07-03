import {
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import type {
  Championship,
  GroupAssignment,
  GroupAssignmentErrorCode,
  GroupAssignmentLog,
  GroupDistributionResult,
  GroupFixturesErrorCode,
  GroupFixturesLog,
  GroupStageCompletionCheck,
  GroupStageQualificationSnapshot,
  GroupStageTransitionErrorCode,
  GroupStageTransitionLog,
  KnockoutSeedingPlan,
  MatchEvent,
  MatchModel,
  Team,
} from '../types';
import { MOCK_DATA_ENABLED as USE_MOCK } from '../config/appConfig';
import { getMockDocument, setMockDocument, updateMockDocument } from '../mocks/mockDb';
import { useChampionshipStore } from '../stores/championshipStore';
import { useMatchStore } from '../stores/matchStore';
import { useTeamStore } from '../stores/teamStore';
import { canTeamParticipate } from '../utils/championshipRules';
import {
  GROUP_DISTRIBUTION_ALGORITHM_VERSION,
  distributeTeamsIntoGroups,
  validateGroupDistributionResult,
} from '../utils/groupStageDistribution';
import { getGroupId, getGroupSnapshotId } from '../utils/groupStageIds';
import {
  expectedGroupFixtureCount,
  generateAllGroupRoundRobinFixtures,
} from '../utils/groupStageFixtures';
import {
  buildGroupStageQualificationSnapshot,
  buildKnockoutBracketFromGroupSnapshot,
  buildKnockoutSeedsFromGroupSnapshot,
  calculateAllStandings,
  canCompleteGroupStage,
  sameSnapshotDigest,
  validateKnockoutBracket,
} from '../utils/groupStageTransition';
import { validateGroupStageConfig } from '../utils/groupStageRules';
import {
  GROUP_STRUCTURE_VERSION,
  hasGeneratedGroups,
  hasGeneratedKnockout,
  getGroupMatches,
  getKnockoutMatches,
  normalizeGroupId,
  normalizeMatchStage,
} from '../utils/groupStageStructure';
import { db } from './firebase';
import { getCollection, getDocument } from './firestore';
import {
  emitGroupFixturesGeneratedNotifications,
  emitGroupStageTransitionNotifications,
  emitGroupsGeneratedNotifications,
} from './groupStageNotifications';

let fallbackSeedCounter = 0;

export class GroupAssignmentError extends Error {
  code: GroupAssignmentErrorCode;

  constructor(code: GroupAssignmentErrorCode, message: string) {
    super(message);
    this.name = 'GroupAssignmentError';
    this.code = code;
  }
}

export class GroupFixturesError extends Error {
  code: GroupFixturesErrorCode;

  constructor(code: GroupFixturesErrorCode, message: string) {
    super(message);
    this.name = 'GroupFixturesError';
    this.code = code;
  }
}

export class GroupStageTransitionError extends Error {
  code: GroupStageTransitionErrorCode;

  constructor(code: GroupStageTransitionErrorCode, message: string) {
    super(message);
    this.name = 'GroupStageTransitionError';
    this.code = code;
  }
}

export interface PreviewGroupAssignmentsInput {
  championshipId: string;
  teams: Team[];
  drawSeed?: string;
  generationVersion?: number;
  maxTeams?: number;
}

export interface GenerateGroupAssignmentsInput {
  championshipId: string;
  organizerId: string;
  expectedGenerationVersion?: number;
  drawSeed?: string;
}

export interface GenerateGroupAssignmentsResult extends GroupDistributionResult {
  idempotent: boolean;
  logId: string;
}

export interface GenerateGroupFixturesInput {
  championshipId: string;
  organizerId: string;
  expectedGroupGenerationVersion: number;
  expectedFixturesVersion?: number;
}

export interface GenerateGroupFixturesResult {
  championshipId: string;
  fixturesVersion: number;
  groupGenerationVersion: number;
  structureVersion: 1;
  fixtures: MatchModel[];
  groupCounts: {
    groupA: number;
    groupB: number;
  };
  idempotent: boolean;
  logId: string;
}

export interface CompleteGroupStageInput {
  championshipId: string;
  organizerId: string;
  expectedGroupGenerationVersion: number;
  expectedGroupFixturesVersion: number;
  expectedSnapshotVersion?: number;
  expectedKnockoutVersion?: number;
}

export interface CompleteGroupStageResult {
  championshipId: string;
  snapshot: GroupStageQualificationSnapshot;
  seeding: KnockoutSeedingPlan;
  knockoutMatches: MatchModel[];
  completionCheck: GroupStageCompletionCheck;
  transitionVersion: number;
  knockoutGenerationVersion: number;
  logId: string;
  idempotent: boolean;
}

export function createGroupDrawSeed(prefix = 'group-draw'): string {
  const bytes = new Uint8Array(16);
  const cryptoLike = globalThis.crypto;
  if (cryptoLike?.getRandomValues) {
    cryptoLike.getRandomValues(bytes);
  } else {
    const performanceNow =
      typeof globalThis.performance?.now === 'function'
        ? globalThis.performance.now()
        : 0;
    const fallback = `${Date.now()}-${performanceNow}-${fallbackSeedCounter++}`;
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = fallback.charCodeAt(index % fallback.length) & 0xff;
    }
  }

  return `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function getGroupAssignmentLogId(championshipId: string, generationVersion: number): string {
  return `group_assignment_${encodeLogSegment(championshipId)}_${generationVersion}`;
}

export function getGroupFixturesLogId(championshipId: string, fixturesVersion: number): string {
  return `group_fixtures_${encodeLogSegment(championshipId)}_${fixturesVersion}`;
}

export function getGroupTransitionLogId(championshipId: string, transitionVersion: number): string {
  return `group_transition_${encodeLogSegment(championshipId)}_${transitionVersion}`;
}

export function previewGroupAssignments(
  input: PreviewGroupAssignmentsInput,
): GroupDistributionResult {
  const approvedTeams = getApprovedActiveTeams(input.teams, input.championshipId);
  validateApprovedTeamsForDistribution(approvedTeams, input.championshipId, input.maxTeams);

  return distributeTeamsIntoGroups({
    championshipId: input.championshipId,
    teamIds: approvedTeams.map((team) => team.id),
    drawSeed: input.drawSeed ?? createGroupDrawSeed('preview-group-draw'),
    generationVersion: input.generationVersion ?? 1,
  });
}

export async function generateAndPersistGroupAssignments(
  input: GenerateGroupAssignmentsInput,
): Promise<GenerateGroupAssignmentsResult> {
  const [championship, teams, matches, events] = await Promise.all([
    getDocument<Championship>('championships', input.championshipId),
    getCollection<Team>('teams', [
      { field: 'championshipId', operator: '==', value: input.championshipId },
    ]),
    getCollection<MatchModel>('matches', [
      { field: 'championshipId', operator: '==', value: input.championshipId },
    ]),
    getCollection<MatchEvent>('match_events', [
      { field: 'championshipId', operator: '==', value: input.championshipId },
    ]),
  ]);

  if (!championship) {
    throw new GroupAssignmentError('championship_missing', 'Campeonato nao encontrado.');
  }

  const approvedTeams = getApprovedActiveTeams(teams, championship.id);
  assertCanGenerateGroups(championship, input.organizerId, approvedTeams, matches, events);

  if (hasGeneratedGroups(championship)) {
    return handleExistingDistribution(championship, approvedTeams, input.expectedGenerationVersion);
  }

  const expectedVersion = input.expectedGenerationVersion ?? 0;
  const currentVersion = championship.groupGenerationVersion ?? 0;
  if (expectedVersion !== currentVersion) {
    throw new GroupAssignmentError(
      'stale_generation_version',
      'A versao da distribuicao mudou. Recarregue e tente novamente.',
    );
  }

  const generationVersion = currentVersion + 1;
  const drawSeed = input.drawSeed ?? createGroupDrawSeed();
  const distribution = distributeTeamsIntoGroups({
    championshipId: championship.id,
    teamIds: approvedTeams.map((team) => team.id),
    drawSeed,
    generationVersion,
  });
  validatePostDistribution(distribution, approvedTeams, championship);

  if (USE_MOCK) {
    const mockResult = await commitGroupAssignmentsToMock(input, championship, approvedTeams, distribution);
    if (!mockResult.idempotent) {
      await emitGroupsGeneratedNotifications(championship.id, approvedTeams, mockResult.generationVersion);
    }
    return mockResult;
  }

  const result = await runTransaction<GenerateGroupAssignmentsResult>(db, async (transaction) => {
    const champRef = doc(db, 'championships', championship.id);
    const logRef = doc(db, 'group_assignment_logs', getGroupAssignmentLogId(championship.id, generationVersion));
    const champSnap = await transaction.get(champRef);
    const logSnap = await transaction.get(logRef);

    if (!champSnap.exists()) {
      throw new GroupAssignmentError('championship_missing', 'Campeonato nao encontrado.');
    }

    const persistedChampionship = {
      id: champSnap.id,
      ...champSnap.data(),
    } as Championship;

    if (persistedChampionship.organizerId !== input.organizerId) {
      throw new GroupAssignmentError('not_owner', 'Somente o organizador dono pode distribuir grupos.');
    }
    if (persistedChampionship.format !== 'grupos_e_mata_mata') {
      throw new GroupAssignmentError('unsupported_format', 'Distribuicao de grupos exige grupos + mata-mata.');
    }
    if (
      persistedChampionship.status !== 'inscricoes_abertas' ||
      (persistedChampionship.stage && persistedChampionship.stage !== 'registration') ||
      persistedChampionship.fixturesGenerated === true
    ) {
      throw new GroupAssignmentError('championship_already_started', 'Campeonato ja iniciado.');
    }
    if (hasGeneratedKnockout(persistedChampionship)) {
      throw new GroupAssignmentError('knockout_already_generated', 'Mata-mata ja gerado.');
    }
    if ((persistedChampionship.groupGenerationVersion ?? 0) !== expectedVersion) {
      throw new GroupAssignmentError(
        'stale_generation_version',
        'A versao da distribuicao mudou. Recarregue e tente novamente.',
      );
    }
    if (hasGeneratedGroups(persistedChampionship)) {
      throw new GroupAssignmentError(
        'group_assignments_already_generated',
        'Os grupos ja foram gerados para este campeonato.',
      );
    }
    if (logSnap.exists()) {
      throw new GroupAssignmentError(
        'group_assignments_already_generated',
        'Ja existe log para esta versao de distribuicao.',
      );
    }

    for (const assignment of distribution.assignments) {
      transaction.update(doc(db, 'teams', assignment.teamId), {
        groupId: assignment.groupId,
        groupSeed: assignment.groupSeed,
        groupAssignmentVersion: generationVersion,
      });
    }

    const log = buildGroupAssignmentLog(distribution, input.organizerId);
    transaction.set(logRef, {
      ...log,
      createdAt: serverTimestamp(),
    });
    transaction.update(champRef, {
      groupStageStatus: 'groups_generated',
      groupGenerationVersion: generationVersion,
      groupStructureVersion: GROUP_STRUCTURE_VERSION,
      knockoutStageStatus: persistedChampionship.knockoutStageStatus ?? 'not_generated',
    });

    return {
      ...distribution,
      idempotent: false,
      logId: log.id,
    };
  });

  syncStores(championship.id, distribution, generationVersion);
  if (!result.idempotent) {
    await emitGroupsGeneratedNotifications(championship.id, approvedTeams, result.generationVersion);
  }
  return result;
}

export async function generateAndPersistGroupFixtures(
  input: GenerateGroupFixturesInput,
): Promise<GenerateGroupFixturesResult> {
  const [championship, teams, matches] = await Promise.all([
    getDocument<Championship>('championships', input.championshipId),
    getCollection<Team>('teams', [
      { field: 'championshipId', operator: '==', value: input.championshipId },
    ]),
    getCollection<MatchModel>('matches', [
      { field: 'championshipId', operator: '==', value: input.championshipId },
    ]),
  ]);

  if (!championship) {
    throw new GroupFixturesError('championship_missing', 'Campeonato nao encontrado.');
  }

  const approvedTeams = getApprovedActiveTeams(teams, championship.id);
  const context = await buildGroupFixturesContext(championship, approvedTeams, matches, input);

  if (USE_MOCK) {
    const mockResult = await commitGroupFixturesToMock(input, championship, context.fixtures, context.groupCounts);
    if (!mockResult.idempotent) {
      await emitGroupFixturesGeneratedNotifications(championship.id, approvedTeams, mockResult.fixturesVersion);
    }
    return mockResult;
  }

  const result = await runTransaction<GenerateGroupFixturesResult>(db, async (transaction) => {
    const fixturesVersion = context.fixturesVersion;
    const champRef = doc(db, 'championships', championship.id);
    const assignmentLogRef = doc(
      db,
      'group_assignment_logs',
      getGroupAssignmentLogId(championship.id, context.groupGenerationVersion),
    );
    const fixturesLogRef = doc(db, 'group_fixture_logs', getGroupFixturesLogId(championship.id, fixturesVersion));
    const fixtureRefs = context.fixtures.map((fixture) => doc(db, 'matches', fixture.id));

    const champSnap = await transaction.get(champRef);
    const assignmentLogSnap = await transaction.get(assignmentLogRef);
    const fixturesLogSnap = await transaction.get(fixturesLogRef);
    const fixtureSnaps = await Promise.all(fixtureRefs.map((ref) => transaction.get(ref)));

    if (!champSnap.exists()) {
      throw new GroupFixturesError('championship_missing', 'Campeonato nao encontrado.');
    }

    const persistedChampionship = { id: champSnap.id, ...champSnap.data() } as Championship;
    assertChampionshipAllowsFixtureGeneration(persistedChampionship, input, approvedTeams);
    if (!assignmentLogSnap.exists()) {
      throw new GroupFixturesError('group_assignment_log_missing', 'Log de distribuicao de grupos nao encontrado.');
    }

    const existingFixtures = fixtureSnaps
      .filter((snap) => snap.exists())
      .map((snap) => ({ id: snap.id, ...snap.data() }) as MatchModel);
    const existingState = classifyExistingGroupFixtures(existingFixtures, context.fixtures);
    if (existingState === 'complete') {
      return buildGroupFixturesResult({
        championshipId: championship.id,
        fixtures: context.fixtures,
        groupCounts: context.groupCounts,
        fixturesVersion,
        groupGenerationVersion: context.groupGenerationVersion,
        idempotent: true,
      });
    }
    if (existingState === 'partial' || fixturesLogSnap.exists()) {
      throw new GroupFixturesError(
        'partial_group_fixtures_detected',
        'Estrutura parcial de fixtures de grupo detectada.',
      );
    }

    for (let index = 0; index < context.fixtures.length; index += 1) {
      transaction.set(fixtureRefs[index], {
        ...context.fixtures[index],
        createdAt: serverTimestamp(),
      });
    }

    const log = buildGroupFixturesLog({
      championshipId: championship.id,
      fixtures: context.fixtures,
      groupCounts: context.groupCounts,
      fixturesVersion,
      groupGenerationVersion: context.groupGenerationVersion,
      organizerId: input.organizerId,
    });
    transaction.set(fixturesLogRef, {
      ...log,
      createdAt: serverTimestamp(),
    });
    transaction.update(champRef, {
      stage: 'group_stage',
      groupStageStatus: 'fixtures_generated',
      groupStructureVersion: GROUP_STRUCTURE_VERSION,
      groupFixturesVersion: fixturesVersion,
      groupFixturesGeneratedAt: serverTimestamp(),
    });

    return buildGroupFixturesResult({
      championshipId: championship.id,
      fixtures: context.fixtures,
      groupCounts: context.groupCounts,
      fixturesVersion,
      groupGenerationVersion: context.groupGenerationVersion,
      idempotent: false,
    });
  });

  syncFixtureStores(championship.id, result.fixtures, result.fixturesVersion);
  if (!result.idempotent) {
    await emitGroupFixturesGeneratedNotifications(championship.id, approvedTeams, result.fixturesVersion);
  }
  return result;
}

export async function completeGroupStageAndGenerateKnockout(
  input: CompleteGroupStageInput,
): Promise<CompleteGroupStageResult> {
  const [championship, teams, matches, events] = await Promise.all([
    getDocument<Championship>('championships', input.championshipId),
    getCollection<Team>('teams', [
      { field: 'championshipId', operator: '==', value: input.championshipId },
    ]),
    getCollection<MatchModel>('matches', [
      { field: 'championshipId', operator: '==', value: input.championshipId },
    ]),
    getCollection<MatchEvent>('match_events', [
      { field: 'championshipId', operator: '==', value: input.championshipId },
    ]),
  ]);

  if (!championship) {
    throw new GroupStageTransitionError('championship_missing', 'Campeonato nao encontrado.');
  }

  const existingTransition = await tryBuildExistingTransitionResult(championship, matches, input);
  if (existingTransition) {
    return existingTransition;
  }

  const context = buildTransitionContext(championship, teams, matches, events, input);
  const approvedTransitionTeams = getApprovedActiveTeams(teams, championship.id);

  if (USE_MOCK) {
    const mockResult = await commitGroupStageTransitionToMock(input, championship, context);
    if (!mockResult.idempotent) {
      await emitGroupStageTransitionNotifications({
        championshipId: championship.id,
        teams: approvedTransitionTeams,
        snapshot: mockResult.snapshot,
        knockoutMatches: mockResult.knockoutMatches,
        knockoutGenerationVersion: mockResult.knockoutGenerationVersion,
      });
    }
    return mockResult;
  }

  const result = await runTransaction<CompleteGroupStageResult>(db, async (transaction) => {
    const champRef = doc(db, 'championships', championship.id);
    const snapshotId = context.snapshot.id ?? getGroupSnapshotId(championship.id, context.snapshot.version);
    const snapshotRef = doc(db, 'group_stage_snapshots', snapshotId);
    const logRef = doc(db, 'group_transition_logs', context.log.id);
    const matchRefs = context.knockoutMatches.map((match) => doc(db, 'matches', match.id));

    const champSnap = await transaction.get(champRef);
    const snapshotSnap = await transaction.get(snapshotRef);
    const logSnap = await transaction.get(logRef);
    const matchSnaps = await Promise.all(matchRefs.map((ref) => transaction.get(ref)));

    if (!champSnap.exists()) {
      throw new GroupStageTransitionError('championship_missing', 'Campeonato nao encontrado.');
    }
    const persistedChampionship = { id: champSnap.id, ...champSnap.data() } as Championship;
    assertTransitionVersion(persistedChampionship, input);

    if (persistedChampionship.organizerId !== input.organizerId) {
      throw new GroupStageTransitionError('not_owner', 'Somente o organizador dono pode concluir a fase de grupos.');
    }

    if (snapshotSnap.exists()) {
      const existingSnapshot = { id: snapshotSnap.id, ...snapshotSnap.data() } as GroupStageQualificationSnapshot;
      const existingMatches = matchSnaps
        .filter((snap) => snap.exists())
        .map((snap) => ({ id: snap.id, ...snap.data() }) as MatchModel);
      if (sameSnapshotDigest(existingSnapshot, context.snapshot) && sameKnockoutStructure(existingMatches, context.knockoutMatches)) {
        return buildCompleteResult(context, true);
      }
      throw new GroupStageTransitionError('group_stage_snapshot_conflict', 'Snapshot existente diverge da classificacao atual.');
    }

    const existingMatches = matchSnaps
      .filter((snap) => snap.exists())
      .map((snap) => ({ id: snap.id, ...snap.data() }) as MatchModel);
    if (existingMatches.length > 0 || logSnap.exists()) {
      throw new GroupStageTransitionError('knockout_structure_conflict', 'Chave eliminatoria existente diverge ou esta parcial.');
    }

    transaction.set(snapshotRef, {
      ...context.snapshot,
      generatedAt: serverTimestamp(),
    });
    for (let index = 0; index < context.knockoutMatches.length; index += 1) {
      transaction.set(matchRefs[index], {
        ...context.knockoutMatches[index],
        createdAt: serverTimestamp(),
      });
    }
    transaction.set(logRef, {
      ...context.log,
      createdAt: serverTimestamp(),
    });
    transaction.update(champRef, {
      stage: 'knockout',
      groupStageStatus: 'completed',
      knockoutStageStatus: 'generated',
      groupStageLockedAt: serverTimestamp(),
      knockoutGeneratedAt: serverTimestamp(),
      groupSnapshotVersion: context.snapshot.version,
      knockoutGenerationVersion: context.knockoutGenerationVersion,
      groupStageComplete: true,
    });

    return buildCompleteResult(context, false);
  });

  syncTransitionStores(championship.id, result.knockoutMatches, result.snapshot.version, result.knockoutGenerationVersion);
  if (!result.idempotent) {
    await emitGroupStageTransitionNotifications({
      championshipId: championship.id,
      teams: approvedTransitionTeams,
      snapshot: result.snapshot,
      knockoutMatches: result.knockoutMatches,
      knockoutGenerationVersion: result.knockoutGenerationVersion,
    });
  }
  return result;
}

export function requestGroupRedraw(): never {
  throw new GroupAssignmentError(
    'group_redraw_not_implemented',
    'Redraw sera tratado em operacao administrativa futura.',
  );
}

function buildTransitionContext(
  championship: Championship,
  teams: Team[],
  matches: MatchModel[],
  events: MatchEvent[],
  input: CompleteGroupStageInput,
) {
  if (championship.organizerId !== input.organizerId) {
    throw new GroupStageTransitionError('not_owner', 'Somente o organizador dono pode concluir a fase de grupos.');
  }
  assertTransitionVersion(championship, input);

  const approvedTeams = getApprovedActiveTeams(teams, championship.id);
  const standingsByGroup = calculateAllStandings(championship, approvedTeams, matches, events);
  const completionCheck = canCompleteGroupStage({
    championship,
    teams: approvedTeams,
    matches,
    events,
    standingsByGroup,
  });
  if (!completionCheck.allowed) {
    throw new GroupStageTransitionError(
      (completionCheck.blockers[0]?.code as GroupStageTransitionErrorCode | undefined) ?? 'group_stage_not_ready',
      completionCheck.blockers[0]?.message ?? 'Fase de grupos ainda nao pode ser concluida.',
    );
  }

  const snapshot = buildGroupStageQualificationSnapshot({
    championship,
    teams: approvedTeams,
    matches,
    events,
    generatedBy: input.organizerId,
    generatedAt: new Date(),
    snapshotVersion: input.expectedSnapshotVersion ?? 1,
  });
  const seeding = buildKnockoutSeedsFromGroupSnapshot(snapshot, championship.groupStageConfig);
  const knockoutMatches = buildKnockoutBracketFromGroupSnapshot({
    snapshot,
    championshipId: championship.id,
    knockoutGenerationVersion: input.expectedKnockoutVersion ?? 1,
  });
  const bracketErrors = validateKnockoutBracket(knockoutMatches, snapshot);
  if (bracketErrors.length > 0) {
    throw new GroupStageTransitionError('bracket_invalid', bracketErrors[0].message);
  }
  const knockoutGenerationVersion = input.expectedKnockoutVersion ?? 1;
  const log = buildGroupStageTransitionLog({
    championshipId: championship.id,
    transitionVersion: snapshot.version,
    snapshot,
    knockoutGenerationVersion,
    fixtureIds: knockoutMatches.map((match) => match.id),
    organizerId: input.organizerId,
  });

  return {
    completionCheck,
    snapshot,
    seeding,
    knockoutMatches,
    knockoutGenerationVersion,
    log,
  };
}

async function tryBuildExistingTransitionResult(
  championship: Championship,
  matches: MatchModel[],
  input: CompleteGroupStageInput,
): Promise<CompleteGroupStageResult | null> {
  const snapshotVersion = input.expectedSnapshotVersion ?? 1;
  const knockoutVersion = input.expectedKnockoutVersion ?? 1;
  if (
    championship.groupSnapshotVersion !== snapshotVersion ||
    championship.knockoutGenerationVersion !== knockoutVersion
  ) {
    return null;
  }

  if (championship.organizerId !== input.organizerId) {
    throw new GroupStageTransitionError('not_owner', 'Somente o organizador dono pode concluir a fase de grupos.');
  }
  assertTransitionVersion(championship, input);
  const snapshotId = getGroupSnapshotId(championship.id, snapshotVersion);
  const snapshot = await getDocument<GroupStageQualificationSnapshot>('group_stage_snapshots', snapshotId);
  const logId = getGroupTransitionLogId(championship.id, snapshotVersion);
  const log = await getDocument<GroupStageTransitionLog>('group_transition_logs', logId);
  const knockoutMatches = getKnockoutMatches(matches, championship)
    .filter((match) => match.originSnapshotVersion === snapshotVersion)
    .sort((a, b) => a.round - b.round || (a.bracketPosition ?? 0) - (b.bracketPosition ?? 0));

  if (!snapshot || !log || knockoutMatches.length !== Math.max(0, snapshot.qualifiers.length - 1)) {
    throw new GroupStageTransitionError('knockout_structure_conflict', 'Transicao existente esta incompleta.');
  }

  const seeding = buildKnockoutSeedsFromGroupSnapshot(snapshot, championship.groupStageConfig);
  return {
    championshipId: championship.id,
    snapshot,
    seeding,
    knockoutMatches,
    completionCheck: {
      allowed: true,
      blockers: [],
      warnings: [],
      resolvedMatchCount: 0,
      expectedMatchCount: 0,
      groupSummaries: [],
    },
    transitionVersion: snapshotVersion,
    knockoutGenerationVersion: knockoutVersion,
    logId,
    idempotent: true,
  };
}

function assertTransitionVersion(championship: Championship, input: CompleteGroupStageInput) {
  if (championship.groupGenerationVersion !== input.expectedGroupGenerationVersion) {
    throw new GroupStageTransitionError('stale_generation_version', 'A versao dos grupos mudou. Recarregue.');
  }
  if (championship.groupFixturesVersion !== input.expectedGroupFixturesVersion) {
    throw new GroupStageTransitionError('stale_group_transition_version', 'A versao das fixtures mudou. Recarregue.');
  }
  if ((championship.groupSnapshotVersion ?? 0) > 0 || (championship.knockoutGenerationVersion ?? 0) > 0) {
    if (
      championship.groupSnapshotVersion === (input.expectedSnapshotVersion ?? 1) &&
      championship.knockoutGenerationVersion === (input.expectedKnockoutVersion ?? 1)
    ) {
      return;
    }
    throw new GroupStageTransitionError('group_stage_already_completed', 'Fase de grupos ja foi concluida.');
  }
}

async function commitGroupStageTransitionToMock(
  input: CompleteGroupStageInput,
  championship: Championship,
  context: ReturnType<typeof buildTransitionContext>,
): Promise<CompleteGroupStageResult> {
  const snapshotId = context.snapshot.id ?? getGroupSnapshotId(championship.id, context.snapshot.version);
  const existingSnapshot = getMockDocument<GroupStageQualificationSnapshot>('group_stage_snapshots', snapshotId);
  const existingMatches = context.knockoutMatches
    .map((match) => getMockDocument<MatchModel>('matches', match.id))
    .filter((match): match is MatchModel => match != null);
  if (existingSnapshot) {
    if (sameSnapshotDigest(existingSnapshot, context.snapshot) && sameKnockoutStructure(existingMatches, context.knockoutMatches)) {
      return buildCompleteResult(context, true);
    }
    throw new GroupStageTransitionError('group_stage_snapshot_conflict', 'Snapshot existente diverge da classificacao atual.');
  }
  if (existingMatches.length > 0 || getMockDocument<GroupStageTransitionLog>('group_transition_logs', context.log.id)) {
    throw new GroupStageTransitionError('knockout_structure_conflict', 'Chave eliminatoria existente diverge ou esta parcial.');
  }

  setMockDocument('group_stage_snapshots', snapshotId, context.snapshot);
  for (const match of context.knockoutMatches) {
    setMockDocument('matches', match.id, match);
  }
  setMockDocument('group_transition_logs', context.log.id, context.log);
  updateMockDocument('championships', championship.id, {
    stage: 'knockout',
    groupStageStatus: 'completed',
    knockoutStageStatus: 'generated',
    groupStageLockedAt: new Date().toISOString(),
    knockoutGeneratedAt: new Date().toISOString(),
    groupSnapshotVersion: context.snapshot.version,
    knockoutGenerationVersion: context.knockoutGenerationVersion,
    groupStageComplete: true,
  });

  syncTransitionStores(championship.id, context.knockoutMatches, context.snapshot.version, context.knockoutGenerationVersion);
  return buildCompleteResult(context, false);
}

function buildGroupStageTransitionLog(input: {
  championshipId: string;
  transitionVersion: number;
  snapshot: GroupStageQualificationSnapshot;
  knockoutGenerationVersion: number;
  fixtureIds: string[];
  organizerId: string;
}): GroupStageTransitionLog {
  return {
    id: getGroupTransitionLogId(input.championshipId, input.transitionVersion),
    championshipId: input.championshipId,
    transitionVersion: input.transitionVersion,
    snapshotId: input.snapshot.id ?? getGroupSnapshotId(input.championshipId, input.transitionVersion),
    snapshotDigest: input.snapshot.standingsDigest ?? '',
    knockoutGenerationVersion: input.knockoutGenerationVersion,
    qualifierIds: input.snapshot.qualifiers.map((qualifier) => qualifier.teamId),
    fixtureIds: input.fixtureIds,
    createdBy: input.organizerId,
    createdAt: new Date().toISOString(),
  };
}

function buildCompleteResult(
  context: ReturnType<typeof buildTransitionContext>,
  idempotent: boolean,
): CompleteGroupStageResult {
  return {
    championshipId: context.snapshot.championshipId,
    snapshot: { ...context.snapshot, qualifiers: context.snapshot.qualifiers.map((qualifier) => ({ ...qualifier })) },
    seeding: {
      ...context.seeding,
      seeds: context.seeding.seeds.map((seed) => ({ ...seed })),
      expectedPairings: context.seeding.expectedPairings.map((pairing) => ({ ...pairing })),
      notes: [...context.seeding.notes],
    },
    knockoutMatches: context.knockoutMatches.map((match) => ({ ...match })),
    completionCheck: {
      ...context.completionCheck,
      blockers: context.completionCheck.blockers.map((item) => ({ ...item })),
      warnings: context.completionCheck.warnings.map((item) => ({ ...item })),
      groupSummaries: context.completionCheck.groupSummaries.map((item) => ({ ...item })),
    },
    transitionVersion: context.snapshot.version,
    knockoutGenerationVersion: context.knockoutGenerationVersion,
    logId: context.log.id,
    idempotent,
  };
}

function sameKnockoutStructure(existing: MatchModel[], expected: MatchModel[]): boolean {
  if (existing.length !== expected.length) return false;
  const expectedById = new Map(expected.map((match) => [match.id, comparableMatch(match)]));
  return existing.every((match) => {
    const expectedMatch = expectedById.get(match.id);
    return !!expectedMatch && JSON.stringify(comparableMatch(match)) === JSON.stringify(expectedMatch);
  });
}

function comparableMatch(match: MatchModel) {
  return {
    id: match.id,
    championshipId: match.championshipId,
    stage: match.stage,
    groupId: match.groupId ?? null,
    knockoutRound: match.knockoutRound,
    round: match.round,
    bracketRound: match.bracketRound,
    bracketPosition: match.bracketPosition,
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    nextMatchId: match.nextMatchId ?? null,
    originSnapshotVersion: match.originSnapshotVersion ?? null,
    structureVersion: match.structureVersion,
    status: match.status,
  };
}

function getApprovedActiveTeams(teams: Team[], championshipId: string): Team[] {
  return teams.filter((team) => {
    if (team.championshipId !== championshipId) return false;
    if (!canTeamParticipate(team)) return false;
    return !isRemovedTeam(team) && team.status !== 'rejeitado';
  });
}

function validateApprovedTeamsForDistribution(
  teams: Team[],
  championshipId: string,
  maxTeams?: number,
) {
  const seen = new Set<string>();
  for (const team of teams) {
    if (!team.id || team.championshipId !== championshipId || !canTeamParticipate(team) || isRemovedTeam(team)) {
      throw new GroupAssignmentError('invalid_team', 'Ha time inconsistente na distribuicao.');
    }
    if (seen.has(team.id)) {
      throw new GroupAssignmentError('duplicate_team_id', 'A distribuicao recebeu time duplicado.');
    }
    seen.add(team.id);
  }

  const configValidation = validateGroupStageConfig(undefined, {
    approvedTeamsCount: teams.length,
    maxTeams,
    groupSizes: [Math.ceil(teams.length / 2), Math.floor(teams.length / 2)],
  });
  if (!configValidation.valid) {
    const first = configValidation.errors[0];
    throw new GroupAssignmentError(first.code, first.message);
  }
}

function assertCanGenerateGroups(
  championship: Championship,
  organizerId: string,
  approvedTeams: Team[],
  matches: MatchModel[],
  events: MatchEvent[],
) {
  if (championship.organizerId !== organizerId) {
    throw new GroupAssignmentError('not_owner', 'Somente o organizador dono pode distribuir grupos.');
  }
  if (championship.format !== 'grupos_e_mata_mata') {
    throw new GroupAssignmentError('unsupported_format', 'Distribuicao de grupos exige grupos + mata-mata.');
  }
  const configValidation = validateGroupStageConfig(championship.groupStageConfig, {
    approvedTeamsCount: approvedTeams.length,
    maxTeams: championship.maxTeams,
    groupSizes: [Math.ceil(approvedTeams.length / 2), Math.floor(approvedTeams.length / 2)],
  });
  if (!configValidation.valid) {
    const first = configValidation.errors[0];
    throw new GroupAssignmentError(first.code, first.message);
  }

  validateApprovedTeamsForDistribution(approvedTeams, championship.id, championship.maxTeams);
  assertGenerationLocks(championship, matches, events);
}

function assertGenerationLocks(championship: Championship, matches: MatchModel[], events: MatchEvent[]) {
  if (
    championship.status !== 'inscricoes_abertas' ||
    (championship.stage && championship.stage !== 'registration') ||
    championship.fixturesGenerated === true
  ) {
    throw new GroupAssignmentError('championship_already_started', 'Campeonato ja iniciado.');
  }
  if (hasGeneratedKnockout(championship)) {
    throw new GroupAssignmentError('knockout_already_generated', 'Mata-mata ja gerado.');
  }

  const groupMatches = matches.filter((match) => normalizeMatchStage(match, championship).stage === 'group');
  if (events.some((event) => groupMatches.some((match) => match.id === event.matchId))) {
    throw new GroupAssignmentError('group_match_events_exist', 'Existe evento persistido em partida de grupo.');
  }
  if (groupMatches.length > 0) {
    throw new GroupAssignmentError('group_matches_already_exist', 'Ja existem partidas de grupo.');
  }
  if (matches.some((match) => match.status === 'ao_vivo')) {
    throw new GroupAssignmentError('live_match_exists', 'Existe partida ao vivo.');
  }
  if (matches.some((match) => match.status === 'finalizado')) {
    throw new GroupAssignmentError('finished_match_exists', 'Existe partida finalizada.');
  }
  if (matches.some((match) => match.status === 'wo' || match.resultSource === 'wo')) {
    throw new GroupAssignmentError('walkover_match_exists', 'Existe partida com W.O.');
  }
}

async function handleExistingDistribution(
  championship: Championship,
  approvedTeams: Team[],
  expectedGenerationVersion?: number,
): Promise<GenerateGroupAssignmentsResult> {
  const generationVersion = championship.groupGenerationVersion ?? 1;
  if (
    expectedGenerationVersion !== undefined &&
    expectedGenerationVersion !== generationVersion
  ) {
    throw new GroupAssignmentError(
      'stale_generation_version',
      'A versao da distribuicao mudou. Recarregue e tente novamente.',
    );
  }

  const logId = getGroupAssignmentLogId(championship.id, generationVersion);
  const log = await getDocument<GroupAssignmentLog>('group_assignment_logs', logId);
  if (log && log.assignments.length === approvedTeams.length) {
    const fromLog = {
      championshipId: championship.id,
      generationVersion,
      algorithmVersion: GROUP_DISTRIBUTION_ALGORITHM_VERSION,
      drawSeed: log.drawSeed,
      groupA: log.assignments.filter(
        (assignment) => normalizeGroupId(assignment.groupId, championship.id) === 'A',
      ),
      groupB: log.assignments.filter(
        (assignment) => normalizeGroupId(assignment.groupId, championship.id) === 'B',
      ),
      assignments: log.assignments.map((assignment) => ({ ...assignment })),
    };
    validateGroupDistributionResult(fromLog);
    return {
      ...fromLog,
      idempotent: true,
      logId,
    };
  }

  const assignedTeams = approvedTeams.filter((team) => team.groupAssignmentVersion === generationVersion);
  if (assignedTeams.length !== approvedTeams.length) {
    throw new GroupAssignmentError(
      'group_assignments_already_generated',
      'Os grupos ja foram gerados, mas a distribuicao persistida esta incompleta.',
    );
  }

  const assignments = assignedTeams
    .map((team) => {
      const groupLabel = normalizeGroupId(team.groupId, championship.id);
      if (!groupLabel || !team.groupSeed) {
        throw new GroupAssignmentError(
          'group_assignments_already_generated',
          'Os grupos ja foram gerados, mas ha time sem grupo valido.',
        );
      }
      return {
        teamId: team.id,
        groupId: getGroupId(championship.id, groupLabel),
        groupSeed: team.groupSeed,
        assignmentOrder: team.groupSeed,
      };
    })
    .sort((a, b) => a.groupId.localeCompare(b.groupId) || a.groupSeed - b.groupSeed);

  const groupA = assignments.filter((assignment) => normalizeGroupId(assignment.groupId, championship.id) === 'A');
  const groupB = assignments.filter((assignment) => normalizeGroupId(assignment.groupId, championship.id) === 'B');
  const persistedResult = {
    championshipId: championship.id,
    generationVersion,
    algorithmVersion: GROUP_DISTRIBUTION_ALGORITHM_VERSION,
    drawSeed: log?.drawSeed ?? 'persisted',
    groupA,
    groupB,
    assignments,
  };
  validateGroupDistributionResult(persistedResult);

  return {
    ...persistedResult,
    idempotent: true,
    logId,
  };
}

async function commitGroupAssignmentsToMock(
  input: GenerateGroupAssignmentsInput,
  championship: Championship,
  teams: Team[],
  distribution: GroupDistributionResult,
): Promise<GenerateGroupAssignmentsResult> {
  const logId = getGroupAssignmentLogId(championship.id, distribution.generationVersion);
  if (getMockDocument<GroupAssignmentLog>('group_assignment_logs', logId)) {
    throw new GroupAssignmentError(
      'group_assignments_already_generated',
      'Ja existe log para esta versao de distribuicao.',
    );
  }

  for (const team of teams) {
    const assignment = distribution.assignments.find((item) => item.teamId === team.id);
    if (!assignment) {
      throw new GroupAssignmentError('invalid_group_assignment', 'Time aprovado ficou sem grupo.');
    }
  }

  setMockDocument('group_assignment_logs', logId, buildGroupAssignmentLog(distribution, input.organizerId));
  for (const assignment of distribution.assignments) {
    updateMockDocument('teams', assignment.teamId, {
      groupId: assignment.groupId,
      groupSeed: assignment.groupSeed,
      groupAssignmentVersion: distribution.generationVersion,
    });
  }
  updateMockDocument('championships', championship.id, {
    groupStageStatus: 'groups_generated',
    groupGenerationVersion: distribution.generationVersion,
    groupStructureVersion: GROUP_STRUCTURE_VERSION,
    knockoutStageStatus: championship.knockoutStageStatus ?? 'not_generated',
  });

  syncStores(championship.id, distribution, distribution.generationVersion);
  return { ...distribution, idempotent: false, logId };
}

async function buildGroupFixturesContext(
  championship: Championship,
  approvedTeams: Team[],
  matches: MatchModel[],
  input: GenerateGroupFixturesInput,
) {
  assertChampionshipAllowsFixtureGeneration(championship, input, approvedTeams);

  const groupGenerationVersion = championship.groupGenerationVersion ?? 0;
  const assignmentLog = await getDocument<GroupAssignmentLog>(
    'group_assignment_logs',
    getGroupAssignmentLogId(championship.id, groupGenerationVersion),
  );
  if (!assignmentLog) {
    throw new GroupFixturesError('group_assignment_log_missing', 'Log de distribuicao de grupos nao encontrado.');
  }

  const groups = getAssignedApprovedTeamsByGroup(championship, approvedTeams, groupGenerationVersion);
  const fixtures = generateAllGroupRoundRobinFixtures({
    championshipId: championship.id,
    groups,
    structureVersion: GROUP_STRUCTURE_VERSION,
    groupGenerationVersion,
  });
  const groupCounts = {
    groupA: fixtures.filter((fixture) => normalizeGroupId(fixture.groupId, championship.id) === 'A').length,
    groupB: fixtures.filter((fixture) => normalizeGroupId(fixture.groupId, championship.id) === 'B').length,
  };

  assertExpectedGroupCounts(groups, groupCounts);
  assertNoBlockingMatches(championship, matches);

  const fixturesVersion = (championship.groupFixturesVersion ?? 0) + 1;
  const existingGroupMatches = getGroupMatches(matches, null, championship);
  const existingState = classifyExistingGroupFixtures(existingGroupMatches, fixtures);
  if (existingState === 'complete') {
    const persistedVersion = championship.groupFixturesVersion ?? 1;
    if (
      input.expectedFixturesVersion !== undefined &&
      input.expectedFixturesVersion !== persistedVersion
    ) {
      throw new GroupFixturesError('stale_fixtures_version', 'A versao das fixtures mudou. Recarregue.');
    }
    return {
      fixtures,
      groupCounts,
      fixturesVersion: persistedVersion,
      groupGenerationVersion,
    };
  }
  if (existingState === 'partial') {
    throw new GroupFixturesError(
      'partial_group_fixtures_detected',
      'Estrutura parcial de fixtures de grupo detectada.',
    );
  }

  if ((input.expectedFixturesVersion ?? 0) !== (championship.groupFixturesVersion ?? 0)) {
    throw new GroupFixturesError('stale_fixtures_version', 'A versao das fixtures mudou. Recarregue.');
  }

  return {
    fixtures,
    groupCounts,
    fixturesVersion,
    groupGenerationVersion,
  };
}

function assertChampionshipAllowsFixtureGeneration(
  championship: Championship,
  input: GenerateGroupFixturesInput,
  approvedTeams: Team[],
) {
  if (championship.organizerId !== input.organizerId) {
    throw new GroupFixturesError('not_owner', 'Somente o organizador dono pode gerar fixtures.');
  }
  if (championship.format !== 'grupos_e_mata_mata') {
    throw new GroupFixturesError('unsupported_format', 'Fixtures de grupo exigem grupos + mata-mata.');
  }
  const configValidation = validateGroupStageConfig(championship.groupStageConfig, {
    approvedTeamsCount: approvedTeams.length,
    maxTeams: championship.maxTeams,
    groupSizes: inferCurrentGroupSizes(championship, approvedTeams),
  });
  if (!configValidation.valid) {
    const first = configValidation.errors[0];
    throw new GroupFixturesError(first.code, first.message);
  }
  if (!hasGeneratedGroups(championship) || (championship.groupGenerationVersion ?? 0) <= 0) {
    throw new GroupFixturesError('group_assignments_missing', 'Gere e persista os grupos antes das fixtures.');
  }
  if (input.expectedGroupGenerationVersion !== championship.groupGenerationVersion) {
    throw new GroupFixturesError('stale_generation_version', 'A versao dos grupos mudou. Recarregue.');
  }
  if (
    championship.status !== 'inscricoes_abertas' ||
    (championship.stage && championship.stage !== 'registration' && championship.stage !== 'group_stage') ||
    championship.groupStageStatus === 'in_progress' ||
    championship.groupStageStatus === 'ready_to_complete' ||
    championship.groupStageStatus === 'completed'
  ) {
    throw new GroupFixturesError('championship_already_started', 'Campeonato ja iniciado.');
  }
  if (hasGeneratedKnockout(championship)) {
    throw new GroupFixturesError('knockout_already_generated', 'Mata-mata ja gerado.');
  }
}

function getAssignedApprovedTeamsByGroup(
  championship: Championship,
  approvedTeams: Team[],
  groupGenerationVersion: number,
): Record<'A' | 'B', Team[]> {
  const groups: Record<'A' | 'B', Team[]> = { A: [], B: [] };
  const seen = new Set<string>();

  for (const team of approvedTeams) {
    if (seen.has(team.id)) {
      throw new GroupFixturesError('duplicate_team_id', 'Time duplicado na geracao de fixtures.');
    }
    seen.add(team.id);

    const groupLabel = normalizeGroupId(team.groupId, championship.id);
    if (!groupLabel) {
      throw new GroupFixturesError('invalid_group_assignment', 'Todos os times aprovados precisam de grupo.');
    }
    if (team.groupAssignmentVersion !== groupGenerationVersion) {
      throw new GroupFixturesError('stale_generation_version', 'Time possui versao de grupo obsoleta.');
    }
    if (!Number.isInteger(team.groupSeed) || (team.groupSeed ?? 0) < 1) {
      throw new GroupFixturesError('invalid_group_assignment', 'Todos os times aprovados precisam de groupSeed.');
    }
    groups[groupLabel].push(team);
  }

  const sizes = [groups.A.length, groups.B.length];
  const smallest = Math.min(...sizes);
  const largest = Math.max(...sizes);
  if (smallest < 2 || largest - smallest > 1) {
    throw new GroupFixturesError('invalid_group_assignment', 'Grupos precisam estar equilibrados.');
  }

  return {
    A: groups.A.sort((a, b) => (a.groupSeed ?? 0) - (b.groupSeed ?? 0) || a.id.localeCompare(b.id)),
    B: groups.B.sort((a, b) => (a.groupSeed ?? 0) - (b.groupSeed ?? 0) || a.id.localeCompare(b.id)),
  };
}

function inferCurrentGroupSizes(championship: Championship, approvedTeams: Team[]): readonly number[] | undefined {
  if (!hasGeneratedGroups(championship)) return undefined;
  const sizes = { A: 0, B: 0 };
  for (const team of approvedTeams) {
    const groupLabel = normalizeGroupId(team.groupId, championship.id);
    if (groupLabel) sizes[groupLabel] += 1;
  }
  return [sizes.A, sizes.B];
}

function assertExpectedGroupCounts(
  groups: Record<'A' | 'B', Team[]>,
  groupCounts: { groupA: number; groupB: number },
) {
  if (
    groupCounts.groupA !== expectedGroupFixtureCount(groups.A.length) ||
    groupCounts.groupB !== expectedGroupFixtureCount(groups.B.length)
  ) {
    throw new GroupFixturesError('invalid_group_fixture', 'Contagem de fixtures por grupo incorreta.');
  }
}

function assertNoBlockingMatches(championship: Championship, matches: MatchModel[]) {
  if (getKnockoutMatches(matches, championship).length > 0) {
    throw new GroupFixturesError('knockout_matches_already_exist', 'Ja existem partidas de mata-mata.');
  }
  if (matches.some((match) => match.status !== 'agendado')) {
    throw new GroupFixturesError('championship_already_started', 'Campeonato ja possui partida iniciada ou resolvida.');
  }
}

function classifyExistingGroupFixtures(
  existingGroupMatches: MatchModel[],
  expectedFixtures: MatchModel[],
): 'none' | 'partial' | 'complete' {
  if (existingGroupMatches.length === 0) return 'none';

  const expectedById = new Map(expectedFixtures.map((fixture) => [fixture.id, fixture]));
  if (existingGroupMatches.length !== expectedFixtures.length) return 'partial';

  for (const match of existingGroupMatches) {
    const expected = expectedById.get(match.id);
    if (!expected) return 'partial';
    if (
      match.homeTeamId !== expected.homeTeamId ||
      match.awayTeamId !== expected.awayTeamId ||
      match.groupId !== expected.groupId ||
      match.groupRound !== expected.groupRound ||
      match.round !== expected.round ||
      match.stage !== 'group' ||
      match.structureVersion !== expected.structureVersion ||
      match.groupGenerationVersion !== expected.groupGenerationVersion
    ) {
      return 'partial';
    }
  }

  return 'complete';
}

async function commitGroupFixturesToMock(
  input: GenerateGroupFixturesInput,
  championship: Championship,
  fixtures: MatchModel[],
  groupCounts: { groupA: number; groupB: number },
): Promise<GenerateGroupFixturesResult> {
  const fixturesVersion = (championship.groupFixturesVersion ?? 0) + 1;
  const existing = getGroupMatches(
    await getCollection<MatchModel>('matches', [
      { field: 'championshipId', operator: '==', value: championship.id },
    ]),
    null,
    championship,
  );
  const existingState = classifyExistingGroupFixtures(existing, fixtures);
  if (existingState === 'complete') {
    return buildGroupFixturesResult({
      championshipId: championship.id,
      fixtures,
      groupCounts,
      fixturesVersion: championship.groupFixturesVersion ?? 1,
      groupGenerationVersion: championship.groupGenerationVersion ?? input.expectedGroupGenerationVersion,
      idempotent: true,
    });
  }
  if (existingState === 'partial') {
    throw new GroupFixturesError(
      'partial_group_fixtures_detected',
      'Estrutura parcial de fixtures de grupo detectada.',
    );
  }

  const log = buildGroupFixturesLog({
    championshipId: championship.id,
    fixtures,
    groupCounts,
    fixturesVersion,
    groupGenerationVersion: championship.groupGenerationVersion ?? input.expectedGroupGenerationVersion,
    organizerId: input.organizerId,
  });
  if (getMockDocument<GroupFixturesLog>('group_fixture_logs', log.id)) {
    throw new GroupFixturesError(
      'partial_group_fixtures_detected',
      'Ja existe log de fixtures sem estrutura completa correspondente.',
    );
  }

  for (const fixture of fixtures) {
    setMockDocument('matches', fixture.id, fixture);
  }
  setMockDocument('group_fixture_logs', log.id, log);
  updateMockDocument('championships', championship.id, {
    stage: 'group_stage',
    groupStageStatus: 'fixtures_generated',
    groupStructureVersion: GROUP_STRUCTURE_VERSION,
    groupFixturesVersion: fixturesVersion,
    groupFixturesGeneratedAt: new Date().toISOString(),
  });

  syncFixtureStores(championship.id, fixtures, fixturesVersion);
  return buildGroupFixturesResult({
    championshipId: championship.id,
    fixtures,
    groupCounts,
    fixturesVersion,
    groupGenerationVersion: championship.groupGenerationVersion ?? input.expectedGroupGenerationVersion,
    idempotent: false,
  });
}

function buildGroupFixturesLog(input: {
  championshipId: string;
  fixtures: MatchModel[];
  groupCounts: { groupA: number; groupB: number };
  fixturesVersion: number;
  groupGenerationVersion: number;
  organizerId: string;
}): GroupFixturesLog {
  return {
    id: getGroupFixturesLogId(input.championshipId, input.fixturesVersion),
    championshipId: input.championshipId,
    fixturesVersion: input.fixturesVersion,
    groupGenerationVersion: input.groupGenerationVersion,
    structureVersion: GROUP_STRUCTURE_VERSION,
    fixtureIds: input.fixtures.map((fixture) => fixture.id),
    fixtureCount: input.fixtures.length,
    groupCounts: input.groupCounts,
    createdBy: input.organizerId,
    createdAt: new Date().toISOString(),
  };
}

function buildGroupFixturesResult(input: {
  championshipId: string;
  fixtures: MatchModel[];
  groupCounts: { groupA: number; groupB: number };
  fixturesVersion: number;
  groupGenerationVersion: number;
  idempotent: boolean;
}): GenerateGroupFixturesResult {
  return {
    championshipId: input.championshipId,
    fixturesVersion: input.fixturesVersion,
    groupGenerationVersion: input.groupGenerationVersion,
    structureVersion: GROUP_STRUCTURE_VERSION,
    fixtures: input.fixtures.map((fixture) => ({ ...fixture })),
    groupCounts: input.groupCounts,
    idempotent: input.idempotent,
    logId: getGroupFixturesLogId(input.championshipId, input.fixturesVersion),
  };
}

function validatePostDistribution(
  distribution: GroupDistributionResult,
  approvedTeams: Team[],
  championship: Championship,
) {
  validateGroupDistributionResult(distribution);
  if (distribution.assignments.length !== approvedTeams.length) {
    throw new GroupAssignmentError('invalid_group_assignment', 'Nem todos os times aprovados receberam grupo.');
  }

  const approvedIds = new Set(approvedTeams.map((team) => team.id));
  for (const assignment of distribution.assignments) {
    if (!approvedIds.has(assignment.teamId)) {
      throw new GroupAssignmentError('invalid_group_assignment', 'Distribuicao contem time fora do campeonato.');
    }
    const groupLabel = normalizeGroupId(assignment.groupId, championship.id);
    if (!groupLabel || assignment.groupId !== getGroupId(championship.id, groupLabel)) {
      throw new GroupAssignmentError('invalid_group_assignment', 'Assignment usa groupId invalido.');
    }
  }
}

function buildGroupAssignmentLog(
  distribution: GroupDistributionResult,
  organizerId: string,
): GroupAssignmentLog {
  return {
    id: getGroupAssignmentLogId(distribution.championshipId, distribution.generationVersion),
    championshipId: distribution.championshipId,
    generationVersion: distribution.generationVersion,
    algorithmVersion: distribution.algorithmVersion,
    drawSeed: distribution.drawSeed,
    assignments: distribution.assignments.map((assignment) => ({ ...assignment })),
    createdBy: organizerId,
    createdAt: new Date().toISOString(),
  };
}

function syncStores(
  championshipId: string,
  distribution: Pick<GroupDistributionResult, 'assignments'>,
  generationVersion: number,
) {
  const byTeam = new Map<string, GroupAssignment>(
    distribution.assignments.map((assignment) => [assignment.teamId, assignment]),
  );
  const teamStore = useTeamStore.getState();
  for (const [teamId, assignment] of byTeam) {
    teamStore.updateTeam(teamId, {
      groupId: assignment.groupId,
      groupSeed: assignment.groupSeed,
      groupAssignmentVersion: generationVersion,
    });
  }
  useChampionshipStore.getState().updateChampionship(championshipId, {
    groupStageStatus: 'groups_generated',
    groupGenerationVersion: generationVersion,
    groupStructureVersion: GROUP_STRUCTURE_VERSION,
  });
}

function syncFixtureStores(
  championshipId: string,
  fixtures: MatchModel[],
  fixturesVersion: number,
) {
  useMatchStore.getState().addMatches(fixtures);
  useChampionshipStore.getState().updateChampionship(championshipId, {
    stage: 'group_stage',
    groupStageStatus: 'fixtures_generated',
    groupStructureVersion: GROUP_STRUCTURE_VERSION,
    groupFixturesVersion: fixturesVersion,
  });
}

function syncTransitionStores(
  championshipId: string,
  knockoutMatches: MatchModel[],
  snapshotVersion: number,
  knockoutGenerationVersion: number,
) {
  useMatchStore.getState().addMatches(knockoutMatches);
  useChampionshipStore.getState().updateChampionship(championshipId, {
    stage: 'knockout',
    groupStageStatus: 'completed',
    knockoutStageStatus: 'generated',
    groupSnapshotVersion: snapshotVersion,
    knockoutGenerationVersion,
    groupStageComplete: true,
  });
}

function isRemovedTeam(team: Team): boolean {
  return Boolean((team as Team & { removedAt?: unknown; deletedAt?: unknown }).removedAt)
    || Boolean((team as Team & { removed?: unknown }).removed)
    || Boolean((team as Team & { deletedAt?: unknown }).deletedAt);
}

function encodeLogSegment(value: string): string {
  return encodeURIComponent(value.trim()).replace(/\./g, '%2E');
}
