import type {
  Championship,
  GroupStageCompletionCheck,
  GroupStageCompletionIssue,
  GroupStageConfig,
  GroupStageQualificationSnapshot,
  GroupStandingRow,
  KnockoutSeedingPlan,
  MatchEvent,
  MatchModel,
  QualifiedTeamSnapshot,
  Team,
} from '../types';
import { calculateGroupStandings, GroupStandingsError } from './groupStandings';
import { expectedGroupFixtureCount } from './groupStageFixtures';
import { getGroupId, getGroupSnapshotId, getKnockoutFixtureId } from './groupStageIds';
import { DEFAULT_GROUP_STAGE_CONFIG, validateGroupStageConfig } from './groupStageRules';
import {
  getChampionshipTeamsByGroup,
  getGroupMatches,
  GROUP_STRUCTURE_VERSION,
  hasGeneratedGroups,
  hasGeneratedKnockout,
  MIN_TEAMS_PER_GROUP,
  normalizeGroupId,
  normalizeMatchStage,
  SUPPORTED_GROUP_IDS,
  validateGroupsKnockoutStructure,
} from './groupStageStructure';
import { generateBracketFixtures, seedOrder } from './roundRobin';

const SNAPSHOT_VERSION = 1;
const CONFIG_VERSION = 1;

export interface CanCompleteGroupStageInput {
  championship: Championship;
  teams: Team[];
  matches: MatchModel[];
  events?: MatchEvent[];
  standingsByGroup?: Record<'A' | 'B', GroupStandingRow[]>;
}

export interface BuildGroupStageSnapshotInput {
  championship: Championship;
  teams: Team[];
  matches: MatchModel[];
  events?: MatchEvent[];
  generatedBy: string;
  generatedAt: Date;
  snapshotVersion?: number;
}

export interface BuildKnockoutBracketInput {
  snapshot: GroupStageQualificationSnapshot;
  championshipId: string;
  knockoutGenerationVersion?: number;
}

export function canCompleteGroupStage(input: CanCompleteGroupStageInput): GroupStageCompletionCheck {
  const blockers: GroupStageCompletionIssue[] = [];
  const warnings: GroupStageCompletionIssue[] = [];
  const championship = input.championship;
  const approvedTeams = approvedTeamsForChampionship(input.teams, championship.id);
  const config = championship.groupStageConfig ?? DEFAULT_GROUP_STAGE_CONFIG;
  const structureValidation = validateGroupsKnockoutStructure({
    championship,
    teams: approvedTeams,
    matches: input.matches,
  });

  if (championship.format !== 'grupos_e_mata_mata') {
    blockers.push(issue('unsupported_format', 'Campeonato nao usa grupos + mata-mata.', 'championship', championship.id, 'format'));
  }
  if (!['group_stage', 'group_stage_completed'].includes(championship.stage ?? 'group_stage')) {
    blockers.push(issue('unsupported_stage', 'Campeonato nao esta na fase de grupos.', 'championship', championship.id, 'stage'));
  }
  if (!hasGeneratedGroups(championship)) {
    blockers.push(issue('groups_missing', 'Grupos ainda nao foram gerados.', 'championship', championship.id, 'groupStageStatus'));
  }
  if (!championship.groupFixturesVersion || championship.groupFixturesVersion < 1) {
    blockers.push(issue('fixtures_missing', 'Fixtures de grupos ainda nao foram geradas.', 'championship', championship.id, 'groupFixturesVersion'));
  }
  if (hasGeneratedKnockout(championship)) {
    blockers.push(issue('knockout_already_generated', 'Mata-mata ja foi gerado.', 'championship', championship.id, 'knockoutStageStatus'));
  }
  if (championship.groupStructureVersion != null && championship.groupStructureVersion !== GROUP_STRUCTURE_VERSION) {
    blockers.push(issue('incompatible_structure_version', 'Versao estrutural incompativel.', 'championship', championship.id, 'groupStructureVersion'));
  }

  const configValidation = validateGroupStageConfig(config, {
    approvedTeamsCount: approvedTeams.length,
    maxTeams: championship.maxTeams,
    groupSizes: groupSizes(championship, approvedTeams),
  });
  if (!configValidation.valid) {
    for (const error of configValidation.errors) {
      blockers.push(issue(error.code, error.message, 'championship', championship.id, String(error.field ?? 'groupStageConfig'), error.details));
    }
  }
  for (const error of structureValidation.errors) {
    blockers.push(issue(mapStructureCode(error.code), error.message, error.entity, error.entityId, error.field, error.details));
  }
  warnings.push(...structureValidation.warnings.map((warning) =>
    issue('deterministic_qualifier_warning', warning.message, warning.entity, warning.entityId, warning.field, warning.details),
  ));

  const groups = getChampionshipTeamsByGroup(championship, approvedTeams);
  const groupSummaries: GroupStageCompletionCheck['groupSummaries'] = [];
  let resolvedMatchCount = 0;
  let expectedMatchCount = 0;
  const seenPairs = new Set<string>();

  for (const groupId of SUPPORTED_GROUP_IDS) {
    const teamsInGroup = groups[groupId];
    const expected = expectedGroupFixtureCount(teamsInGroup.length);
    const groupMatches = getGroupMatches(input.matches, groupId, championship);
    let resolved = 0;

    if (teamsInGroup.length < MIN_TEAMS_PER_GROUP) {
      blockers.push(issue('invalid_group_size', 'Grupo sem times suficientes.', 'group', groupId, 'teams', { size: teamsInGroup.length }));
    }

    for (const team of teamsInGroup) {
      if (team.groupAssignmentVersion !== championship.groupGenerationVersion) {
        blockers.push(issue('assignment_version_mismatch', 'Time possui versao de grupo divergente.', 'team', team.id, 'groupAssignmentVersion'));
      }
    }

    for (const match of groupMatches) {
      const pair = pairKey(match.homeTeamId, match.awayTeamId);
      const scopedPair = `${groupId}:${pair}`;
      if (seenPairs.has(scopedPair)) {
        blockers.push(issue('duplicate_group_match', 'Partida duplicada no grupo.', 'match', match.id));
      }
      seenPairs.add(scopedPair);

      const normalized = normalizeMatchStage(match, championship);
      if (normalized.groupId !== groupId) continue;
      if (!teamsInGroup.some((team) => team.id === match.homeTeamId) || !teamsInGroup.some((team) => team.id === match.awayTeamId)) {
        blockers.push(issue('group_match_cross_group', 'Partida possui time fora do grupo.', 'match', match.id));
      }
      if (match.status === 'ao_vivo') blockers.push(issue('live_match_exists', 'Partida ao vivo impede a conclusao.', 'match', match.id));
      if (match.status === 'agendado') blockers.push(issue('unresolved_group_match', 'Partida agendada ainda nao resolvida.', 'match', match.id));
      if (match.status === 'adiado') blockers.push(issue('postponed_group_match', 'Partida adiada impede a conclusao.', 'match', match.id));
      if (match.status === 'cancelado') blockers.push(issue('cancelled_group_match_unresolved', 'Partida cancelada precisa de resolucao administrativa futura.', 'match', match.id));
      if (isResolvedGroupMatch(match)) {
        if (!hasValidScore(match)) {
          blockers.push(issue('invalid_score', 'Partida resolvida possui placar invalido.', 'match', match.id));
        } else if (match.status === 'wo' && !isValidWalkover(match)) {
          blockers.push(issue('invalid_walkover', 'W.O. inconsistente.', 'match', match.id));
        } else {
          resolved += 1;
        }
      }
    }

    if (groupMatches.length !== expected) {
      blockers.push(issue(groupMatches.length === 0 ? 'fixtures_missing' : 'partial_group_fixtures_detected', 'Quantidade de fixtures do grupo nao confere.', 'group', groupId, 'fixtures', { expected, actual: groupMatches.length }));
    }

    groupSummaries.push({
      groupId,
      teamCount: teamsInGroup.length,
      expectedMatchCount: expected,
      resolvedMatchCount: resolved,
      qualifierCount: config.qualifiersPerGroup,
    });
    resolvedMatchCount += resolved;
    expectedMatchCount += expected;
  }

  if (Math.abs(groups.A.length - groups.B.length) === 1) {
    warnings.push(issue('group_size_warning', 'Grupos possuem diferenca de um time.', 'championship', championship.id, 'groups'));
  }

  if (config.qualifiersPerGroup * SUPPORTED_GROUP_IDS.length < 2) {
    blockers.push(issue('invalid_qualifier_count', 'Numero de classificados insuficiente para mata-mata.', 'championship', championship.id, 'groupStageConfig.qualifiersPerGroup'));
  }
  if (!isPowerOfTwo(config.qualifiersPerGroup * SUPPORTED_GROUP_IDS.length)) {
    warnings.push(issue('structural_bye_warning', 'Quantidade de classificados gera BYE estrutural.', 'championship', championship.id, 'groupStageConfig.qualifiersPerGroup'));
  }

  try {
    const standings = input.standingsByGroup ?? calculateAllStandings(championship, approvedTeams, input.matches, input.events ?? []);
    validateStandingsForCompletion(standings, groups, config, blockers, warnings);
  } catch (error) {
    blockers.push(issue(error instanceof GroupStandingsError ? mapStandingsCode(error.code) : 'invalid_standings', error instanceof Error ? error.message : 'Classificacao invalida.', 'championship', championship.id));
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    warnings,
    resolvedMatchCount,
    expectedMatchCount,
    groupSummaries,
  };
}

export function buildGroupStageQualificationSnapshot(
  input: BuildGroupStageSnapshotInput,
): GroupStageQualificationSnapshot {
  const snapshotVersion = input.snapshotVersion ?? SNAPSHOT_VERSION;
  const config = input.championship.groupStageConfig ?? DEFAULT_GROUP_STAGE_CONFIG;
  const approvedTeams = approvedTeamsForChampionship(input.teams, input.championship.id);
  const standingsByGroup = calculateAllStandings(input.championship, approvedTeams, input.matches, input.events ?? []);
  const qualifiers: QualifiedTeamSnapshot[] = [];
  const seen = new Set<string>();

  for (const groupId of SUPPORTED_GROUP_IDS) {
    const rows = standingsByGroup[groupId];
    for (let index = 0; index < config.qualifiersPerGroup; index += 1) {
      const row = rows[index];
      if (!row || row.position !== index + 1) {
        throw new Error('invalid_qualifier_position');
      }
      if (seen.has(row.teamId)) throw new Error('duplicate_qualifier');
      seen.add(row.teamId);
      const team = approvedTeams.find((item) => item.id === row.teamId);
      if (!team || normalizeGroupId(team.groupId, input.championship.id) !== groupId) {
        throw new Error('qualifier_group_mismatch');
      }
      qualifiers.push({
        teamId: row.teamId,
        groupId,
        groupPosition: row.position,
        groupSeed: team.groupSeed ?? row.position,
        knockoutSeed: 0,
        points: row.points,
        wins: row.wins,
        draws: row.draws,
        losses: row.losses,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDifference: row.goalDifference,
        cards: row.cards,
        tiebreakReason: row.tiebreakReason,
        deterministicSeed: stableHash(`${input.championship.id}|${groupId}|${row.teamId}|${row.position}`),
        position: row.position,
      });
    }
  }

  const seeded = assignKnockoutSeeds(qualifiers);
  const baseSnapshot = {
    id: getGroupSnapshotId(input.championship.id, snapshotVersion),
    version: snapshotVersion,
    championshipId: input.championship.id,
    groupGenerationVersion: input.championship.groupGenerationVersion ?? 0,
    groupFixturesVersion: input.championship.groupFixturesVersion ?? 0,
    structureVersion: GROUP_STRUCTURE_VERSION,
    generatedAt: input.generatedAt,
    generatedBy: input.generatedBy,
    configVersion: CONFIG_VERSION,
    qualifiersPerGroup: config.qualifiersPerGroup,
    qualifiers: seeded,
    standingsDigest: '',
  } satisfies GroupStageQualificationSnapshot;

  return {
    ...baseSnapshot,
    standingsDigest: buildStandingsDigest({
      snapshot: baseSnapshot,
      teams: approvedTeams,
      matches: input.matches,
      standingsByGroup,
    }),
  };
}

export function buildStandingsDigest(input: {
  snapshot: Omit<GroupStageQualificationSnapshot, 'standingsDigest'> | GroupStageQualificationSnapshot;
  teams: Team[];
  matches: MatchModel[];
  standingsByGroup: Record<'A' | 'B', GroupStandingRow[]>;
}): string {
  const payload = {
    championshipId: input.snapshot.championshipId,
    version: input.snapshot.version,
    groupGenerationVersion: input.snapshot.groupGenerationVersion ?? 0,
    groupFixturesVersion: input.snapshot.groupFixturesVersion ?? 0,
    structureVersion: input.snapshot.structureVersion ?? GROUP_STRUCTURE_VERSION,
    configVersion: input.snapshot.configVersion,
    qualifiersPerGroup: input.snapshot.qualifiersPerGroup ?? 1,
    qualifiers: input.snapshot.qualifiers.map((q) => ({
      teamId: q.teamId,
      groupId: q.groupId,
      groupPosition: q.groupPosition ?? q.position ?? 0,
      groupSeed: q.groupSeed ?? q.position ?? 0,
      knockoutSeed: q.knockoutSeed ?? 0,
      points: q.points,
      wins: q.wins,
      draws: q.draws ?? 0,
      losses: q.losses ?? 0,
      goalsFor: q.goalsFor,
      goalsAgainst: q.goalsAgainst ?? 0,
      goalDifference: q.goalDifference,
      cards: q.cards ?? 0,
      tiebreakReason: q.tiebreakReason?.type,
      deterministicSeed: q.deterministicSeed,
    })),
    teams: input.teams
      .map((team) => ({
        id: team.id,
        groupId: normalizeGroupId(team.groupId, input.snapshot.championshipId),
        groupSeed: team.groupSeed,
        groupAssignmentVersion: team.groupAssignmentVersion,
      }))
      .sort(byJson),
    matches: getGroupMatches(input.matches, null, { id: input.snapshot.championshipId, format: 'grupos_e_mata_mata' })
      .filter(isResolvedGroupMatch)
      .map((match) => ({
        id: match.id,
        groupId: normalizeGroupId(match.groupId, input.snapshot.championshipId),
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        status: match.status,
        winnerId: match.winnerId ?? null,
        resultSource: match.resultSource ?? 'played',
        groupGenerationVersion: match.groupGenerationVersion,
      }))
      .sort(byJson),
    standings: SUPPORTED_GROUP_IDS.flatMap((groupId) =>
      input.standingsByGroup[groupId].map((row) => ({
        groupId,
        teamId: row.teamId,
        position: row.position,
        points: row.points,
        wins: row.wins,
        draws: row.draws,
        losses: row.losses,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDifference: row.goalDifference,
        cards: row.cards,
        tiebreakReason: row.tiebreakReason?.type,
      })),
    ),
  };
  return stableHash(stableStringify(payload));
}

export function buildKnockoutSeedsFromGroupSnapshot(
  snapshot: GroupStageQualificationSnapshot,
  config: GroupStageConfig = DEFAULT_GROUP_STAGE_CONFIG,
): KnockoutSeedingPlan {
  const total = snapshot.qualifiers.length;
  const bracketSize = nextPowerOfTwo(total);
  const notes: string[] = [];
  if (bracketSize > total) notes.push('structural_byes');
  const qualifiersPerGroup = snapshot.qualifiersPerGroup ?? config.qualifiersPerGroup;
  if (config.qualifiersPerGroup !== qualifiersPerGroup) notes.push('config_snapshot_mismatch');

  const ranked = assignKnockoutSeeds(snapshot.qualifiers);
  const order = seedOrder(bracketSize);
  const byRank = new Map(ranked.map((qualifier) => [qualifier.knockoutSeed, qualifier]));
  const seeds = order
    .map((seed, slotIndex) => {
      const qualifier = byRank.get(seed);
      return qualifier
        ? {
            teamId: qualifier.teamId,
            groupId: qualifier.groupId,
            groupPosition: qualifier.groupPosition ?? qualifier.position ?? 0,
            knockoutSeed: qualifier.knockoutSeed ?? 0,
            firstRoundSlot: slotIndex + 1,
          }
        : null;
    })
    .filter((seed): seed is NonNullable<typeof seed> => seed != null)
    .sort((a, b) => a.firstRoundSlot - b.firstRoundSlot);

  const expectedPairings: KnockoutSeedingPlan['expectedPairings'] = [];
  for (let index = 0; index < bracketSize; index += 2) {
    const home = seeds.find((seed) => seed.firstRoundSlot === index + 1) ?? null;
    const away = seeds.find((seed) => seed.firstRoundSlot === index + 2) ?? null;
    if (!home && !away) continue;
    expectedPairings.push({
      homeTeamId: home?.teamId ?? null,
      awayTeamId: away?.teamId ?? null,
      homeSeed: home?.knockoutSeed ?? null,
      awaySeed: away?.knockoutSeed ?? null,
      avoidSameGroupPossible: total > qualifiersPerGroup,
      sameGroup: !!home && !!away && home.groupId === away.groupId,
    });
  }

  if (expectedPairings.some((pairing) => pairing.sameGroup && pairing.avoidSameGroupPossible)) {
    notes.push('same_group_pairing_unavoidable_or_unoptimized');
  }

  return {
    seeds,
    expectedPairings,
    byeCount: bracketSize - total,
    notes,
  };
}

export function buildKnockoutBracketFromGroupSnapshot(input: BuildKnockoutBracketInput): MatchModel[] {
  const seeding = buildKnockoutSeedsFromGroupSnapshot(input.snapshot);
  const rankedTeams = [...seeding.seeds]
    .sort((a, b) => a.knockoutSeed - b.knockoutSeed)
    .map((seed) => ({
      id: seed.teamId,
      championshipId: input.championshipId,
      name: seed.teamId,
      primaryColor: '#000000',
      secondaryColor: '#ffffff',
      captainId: '',
      status: 'aprovado' as const,
      inviteCode: '',
      createdAt: '',
    }));

  let tempId = 0;
  const generated = generateBracketFixtures(rankedTeams, input.championshipId, {
    shuffle: false,
    makeId: () => `tmp-knockout-${++tempId}`,
  });
  const idMap = new Map<string, string>();
  const byRound = new Map<number, MatchModel[]>();
  for (const match of generated) {
    const roundMatches = byRound.get(match.round) ?? [];
    roundMatches.push(match);
    byRound.set(match.round, roundMatches);
  }
  for (const [round, matches] of byRound) {
    matches
      .sort((a, b) => (a.bracketPosition ?? 0) - (b.bracketPosition ?? 0))
      .forEach((match, index) => {
        idMap.set(match.id, getKnockoutFixtureId(input.championshipId, round, index + 1));
      });
  }

  return generated.map((match) => ({
    ...match,
    id: idMap.get(match.id) ?? match.id,
    stage: 'knockout',
    groupId: null,
    knockoutRound: match.round,
    structureVersion: GROUP_STRUCTURE_VERSION,
    originSnapshotVersion: input.snapshot.version,
    groupGenerationVersion: input.snapshot.groupGenerationVersion ?? 0,
    nextMatchId: match.nextMatchId ? idMap.get(match.nextMatchId) ?? match.nextMatchId : null,
    status: 'agendado',
    homeScore: null,
    awayScore: null,
    winnerId: null,
  }));
}

export function validateKnockoutBracket(matches: MatchModel[], snapshot: GroupStageQualificationSnapshot): GroupStageCompletionIssue[] {
  const errors: GroupStageCompletionIssue[] = [];
  const qualifierIds = new Set(snapshot.qualifiers.map((qualifier) => qualifier.teamId));
  const ids = new Set<string>();
  const entrants = new Set<string>();

  if (matches.length !== Math.max(0, snapshot.qualifiers.length - 1)) {
    errors.push(issue('knockout_structure_conflict', 'Quantidade de partidas do mata-mata invalida.', 'bracket'));
  }

  for (const match of matches) {
    if (ids.has(match.id)) errors.push(issue('knockout_structure_conflict', 'ID duplicado no mata-mata.', 'match', match.id));
    ids.add(match.id);
    if (match.stage !== 'knockout' || match.groupId !== null || match.status !== 'agendado') {
      errors.push(issue('knockout_structure_conflict', 'Contrato da partida eliminatoria invalido.', 'match', match.id));
    }
    if (match.homeScore != null || match.awayScore != null) {
      errors.push(issue('knockout_structure_conflict', 'Mata-mata nao pode iniciar com placar artificial.', 'match', match.id));
    }
    for (const teamId of [match.homeTeamId, match.awayTeamId].filter(Boolean)) {
      if (!qualifierIds.has(teamId)) errors.push(issue('knockout_structure_conflict', 'Eliminado entrou no mata-mata.', 'match', match.id, undefined, { teamId }));
      if (entrants.has(teamId)) errors.push(issue('knockout_structure_conflict', 'Classificado aparece em mais de um slot inicial.', 'match', match.id, undefined, { teamId }));
      entrants.add(teamId);
    }
  }

  for (const qualifierId of qualifierIds) {
    if (!entrants.has(qualifierId)) errors.push(issue('knockout_structure_conflict', 'Classificado ficou fora da chave.', 'bracket', qualifierId));
  }
  return errors;
}

export function calculateAllStandings(
  championship: Championship,
  teams: Team[],
  matches: MatchModel[],
  events: MatchEvent[],
): Record<'A' | 'B', GroupStandingRow[]> {
  const config = championship.groupStageConfig ?? DEFAULT_GROUP_STAGE_CONFIG;
  return {
    A: calculateGroupStandings({
      championshipId: championship.id,
      groupId: getGroupId(championship.id, 'A'),
      teams,
      matches,
      events,
      rules: championship.rules,
      qualifiersPerGroup: config.qualifiersPerGroup,
    }),
    B: calculateGroupStandings({
      championshipId: championship.id,
      groupId: getGroupId(championship.id, 'B'),
      teams,
      matches,
      events,
      rules: championship.rules,
      qualifiersPerGroup: config.qualifiersPerGroup,
    }),
  };
}

export function sameSnapshotDigest(left: GroupStageQualificationSnapshot, right: GroupStageQualificationSnapshot): boolean {
  return left.standingsDigest === right.standingsDigest && left.version === right.version;
}

function validateStandingsForCompletion(
  standings: Record<'A' | 'B', GroupStandingRow[]>,
  groups: Record<'A' | 'B', Team[]>,
  config: GroupStageConfig,
  blockers: GroupStageCompletionIssue[],
  warnings: GroupStageCompletionIssue[],
) {
  const seen = new Set<string>();
  for (const groupId of SUPPORTED_GROUP_IDS) {
    const rows = standings[groupId];
    if (rows.length !== groups[groupId].length) {
      blockers.push(issue('invalid_standings', 'Classificacao nao cobre todos os times do grupo.', 'group', groupId));
    }
    for (let index = 0; index < config.qualifiersPerGroup; index += 1) {
      const row = rows[index];
      if (!row || row.position !== index + 1) {
        blockers.push(issue('invalid_standings', 'Classificado possui posicao invalida.', 'group', groupId));
        continue;
      }
      if (seen.has(row.teamId)) blockers.push(issue('invalid_standings', 'Time duplicado entre classificados.', 'team', row.teamId));
      seen.add(row.teamId);
      if (row.groupId !== groupId) blockers.push(issue('invalid_standings', 'Classificado fora do grupo.', 'team', row.teamId));
      if (row.tiebreakReason?.type === 'fewest_cards') {
        warnings.push(issue('card_tiebreak_warning', 'Classificacao decidida por cartoes.', 'team', row.teamId));
      }
      if (row.tiebreakReason?.type === 'deterministic_draw') {
        warnings.push(issue('deterministic_draw_warning', 'Classificacao decidida por sorteio tecnico deterministico.', 'team', row.teamId));
      }
    }
  }
}

function assignKnockoutSeeds(qualifiers: QualifiedTeamSnapshot[]): QualifiedTeamSnapshot[] {
  const sorted = [...qualifiers].sort((a, b) => {
    const aPosition = a.groupPosition ?? a.position ?? 0;
    const bPosition = b.groupPosition ?? b.position ?? 0;
    if (aPosition !== bPosition) return aPosition - bPosition;
    if (qualifiers.length === 8 && aPosition >= 2) {
      const special: Record<number, Record<string, number>> = {
        2: { B: 0, A: 1 },
        3: { B: 0, A: 1 },
        4: { A: 0, B: 1 },
      };
      const groupDiff = (special[aPosition]?.[a.groupId] ?? 0) - (special[bPosition]?.[b.groupId] ?? 0);
      if (groupDiff !== 0) return groupDiff;
    }
    return a.groupId.localeCompare(b.groupId) || a.teamId.localeCompare(b.teamId);
  });
  return sorted.map((qualifier, index) => ({ ...qualifier, knockoutSeed: index + 1 }));
}

function approvedTeamsForChampionship(teams: Team[], championshipId: string): Team[] {
  return teams.filter((team) => team.championshipId === championshipId && team.status === 'aprovado');
}

function groupSizes(championship: Championship, teams: Team[]): [number, number] {
  const groups = getChampionshipTeamsByGroup(championship, teams);
  return [groups.A.length, groups.B.length];
}

function isResolvedGroupMatch(match: MatchModel): boolean {
  return match.status === 'finalizado' || match.status === 'wo';
}

function hasValidScore(match: MatchModel): boolean {
  return Number.isInteger(match.homeScore) && Number.isInteger(match.awayScore) && (match.homeScore ?? -1) >= 0 && (match.awayScore ?? -1) >= 0;
}

function isValidWalkover(match: MatchModel): boolean {
  return match.status !== 'wo' || (match.resultSource === 'wo' && !!match.winnerId && [match.homeTeamId, match.awayTeamId].includes(match.winnerId));
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

function nextPowerOfTwo(value: number): number {
  if (value <= 1) return 1;
  return Math.pow(2, Math.ceil(Math.log2(value)));
}

function mapStructureCode(code: string): GroupStageCompletionIssue['code'] {
  if (code === 'duplicate_team_id') return 'duplicate_team_id';
  if (code === 'group_match_cross_group') return 'group_match_cross_group';
  if (code === 'incompatible_structure_version') return 'incompatible_structure_version';
  if (code === 'group_below_minimum') return 'invalid_group_size';
  if (code === 'team_missing_group_after_generation') return 'team_missing_group';
  if (code === 'knockout_match_before_transition') return 'knockout_already_generated';
  return 'invalid_standings';
}

function mapStandingsCode(code: string): GroupStageCompletionIssue['code'] {
  if (code === 'invalid_score') return 'invalid_score';
  if (code === 'walkover_missing_winner') return 'invalid_walkover';
  if (code === 'group_match_cross_group') return 'group_match_cross_group';
  if (code === 'conflicting_result') return 'duplicate_group_match';
  return 'invalid_standings';
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function byJson(a: unknown, b: unknown): number {
  return stableStringify(a).localeCompare(stableStringify(b));
}

function issue(
  code: GroupStageCompletionIssue['code'],
  message: string,
  entity?: GroupStageCompletionIssue['entity'],
  entityId?: string,
  field?: string,
  details?: Record<string, unknown>,
): GroupStageCompletionIssue {
  return { code, message, entity, entityId, field, details };
}
