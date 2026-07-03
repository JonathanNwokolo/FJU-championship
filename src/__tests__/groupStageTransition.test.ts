import type { Championship, MatchModel, Team } from '../types';
import { DEFAULT_GROUP_STAGE_CONFIG } from '../utils/groupStageRules';
import { getGroupFixtureId, getGroupId, getGroupSnapshotId, getKnockoutFixtureId } from '../utils/groupStageIds';
import {
  buildGroupStageQualificationSnapshot,
  buildKnockoutBracketFromGroupSnapshot,
  buildKnockoutSeedsFromGroupSnapshot,
  canCompleteGroupStage,
} from '../utils/groupStageTransition';

const CHAMP = 'champ-transition';
const GROUP_A = getGroupId(CHAMP, 'A');
const GROUP_B = getGroupId(CHAMP, 'B');

function championship(overrides: Partial<Championship> = {}): Championship {
  return {
    id: CHAMP,
    name: 'Copa FJU',
    format: 'grupos_e_mata_mata',
    status: 'em_andamento',
    stage: 'group_stage',
    currentRound: 1,
    totalRounds: 1,
    organizerId: 'org-1',
    inviteCode: 'ABC',
    rules: {
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      tiebreakers: [],
      fairPlay: true,
      craqueDaRodada: false,
    },
    createdAt: '2026-01-01',
    groupStageConfig: DEFAULT_GROUP_STAGE_CONFIG,
    groupStageStatus: 'fixtures_generated',
    knockoutStageStatus: 'not_generated',
    groupStructureVersion: 1,
    groupGenerationVersion: 1,
    groupFixturesVersion: 1,
    ...overrides,
  };
}

function team(id: string, group: 'A' | 'B', seed: number): Team {
  return {
    id,
    championshipId: CHAMP,
    name: id,
    primaryColor: '#111111',
    secondaryColor: '#ffffff',
    captainId: `cap-${id}`,
    status: 'aprovado',
    inviteCode: id,
    createdAt: '2026-01-01',
    groupId: group === 'A' ? GROUP_A : GROUP_B,
    groupSeed: seed,
    groupAssignmentVersion: 1,
  };
}

function match(group: 'A' | 'B', homeTeamId: string, awayTeamId: string, overrides: Partial<MatchModel> = {}): MatchModel {
  const groupId = group === 'A' ? GROUP_A : GROUP_B;
  return {
    id: getGroupFixtureId(CHAMP, groupId, homeTeamId, awayTeamId),
    championshipId: CHAMP,
    round: 1,
    groupRound: 1,
    stage: 'group',
    groupId,
    homeTeamId,
    awayTeamId,
    homeScore: 1,
    awayScore: 0,
    status: 'finalizado',
    structureVersion: 1,
    groupGenerationVersion: 1,
    originSnapshotVersion: null,
    nextMatchId: null,
    ...overrides,
  };
}

function baseTeams() {
  return [
    team('a1', 'A', 1),
    team('a2', 'A', 2),
    team('b1', 'B', 1),
    team('b2', 'B', 2),
  ];
}

function baseMatches() {
  return [
    match('A', 'a1', 'a2', { homeScore: 2, awayScore: 0 }),
    match('B', 'b1', 'b2', { homeScore: 3, awayScore: 1 }),
  ];
}

describe('groupStageTransition pure helpers', () => {
  it('bloqueia fase incompleta e aceita todas finalizadas', () => {
    const incomplete = canCompleteGroupStage({
      championship: championship(),
      teams: baseTeams(),
      matches: [match('A', 'a1', 'a2', { status: 'agendado', homeScore: null, awayScore: null }), baseMatches()[1]],
    });
    expect(incomplete.allowed).toBe(false);
    expect(incomplete.blockers.map((item) => item.code)).toContain('unresolved_group_match');

    const complete = canCompleteGroupStage({
      championship: championship(),
      teams: baseTeams(),
      matches: baseMatches(),
    });
    expect(complete.allowed).toBe(true);
    expect(complete.resolvedMatchCount).toBe(2);
    expect(complete.expectedMatchCount).toBe(2);
  });

  it('considera W.O. valido resolvido e bloqueia W.O. inconsistente', () => {
    const validWo = canCompleteGroupStage({
      championship: championship(),
      teams: baseTeams(),
      matches: [
        match('A', 'a1', 'a2', { status: 'wo', resultSource: 'wo', winnerId: 'a1', homeScore: 3, awayScore: 0 }),
        baseMatches()[1],
      ],
    });
    expect(validWo.allowed).toBe(true);

    const invalidWo = canCompleteGroupStage({
      championship: championship(),
      teams: baseTeams(),
      matches: [
        match('A', 'a1', 'a2', { status: 'wo', resultSource: 'played', winnerId: null, homeScore: 3, awayScore: 0 }),
        baseMatches()[1],
      ],
    });
    expect(invalidWo.blockers.map((item) => item.code)).toContain('invalid_walkover');
  });

  it.each(['ao_vivo', 'adiado', 'cancelado'] as const)('bloqueia status %s na conclusao', (status) => {
    const result = canCompleteGroupStage({
      championship: championship(),
      teams: baseTeams(),
      matches: [match('A', 'a1', 'a2', { status }), baseMatches()[1]],
    });
    expect(result.allowed).toBe(false);
  });

  it('gera snapshot deterministico com digest estavel e ID versionado', () => {
    const first = buildGroupStageQualificationSnapshot({
      championship: championship(),
      teams: baseTeams(),
      matches: baseMatches(),
      generatedBy: 'org-1',
      generatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const second = buildGroupStageQualificationSnapshot({
      championship: championship(),
      teams: [...baseTeams()].reverse(),
      matches: [...baseMatches()].reverse(),
      generatedBy: 'org-1',
      generatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    expect(first.id).toBe(getGroupSnapshotId(CHAMP, 1));
    expect(first.qualifiers.map((qualifier) => qualifier.teamId)).toEqual(['a1', 'b1']);
    expect(first.standingsDigest).toBe(second.standingsDigest);
  });

  it('gera cruzamento de 4 classificados como 1A x 2B e 1B x 2A', () => {
    const snapshot = buildGroupStageQualificationSnapshot({
      championship: championship({ groupStageConfig: { ...DEFAULT_GROUP_STAGE_CONFIG, qualifiersPerGroup: 2 } }),
      teams: [
        team('a1', 'A', 1),
        team('a2', 'A', 2),
        team('a3', 'A', 3),
        team('b1', 'B', 1),
        team('b2', 'B', 2),
        team('b3', 'B', 3),
      ],
      matches: [
        match('A', 'a1', 'a2', { homeScore: 3, awayScore: 0 }),
        match('A', 'a1', 'a3', { homeScore: 3, awayScore: 0 }),
        match('A', 'a2', 'a3', { homeScore: 2, awayScore: 0 }),
        match('B', 'b1', 'b2', { homeScore: 3, awayScore: 0 }),
        match('B', 'b1', 'b3', { homeScore: 3, awayScore: 0 }),
        match('B', 'b2', 'b3', { homeScore: 2, awayScore: 0 }),
      ],
      generatedBy: 'org-1',
      generatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const seeding = buildKnockoutSeedsFromGroupSnapshot(snapshot, { ...DEFAULT_GROUP_STAGE_CONFIG, qualifiersPerGroup: 2 });
    const bracket = buildKnockoutBracketFromGroupSnapshot({ snapshot, championshipId: CHAMP });

    expect(seeding.expectedPairings.map((pairing) => [pairing.homeTeamId, pairing.awayTeamId])).toEqual([
      ['a1', 'b2'],
      ['b1', 'a2'],
    ]);
    expect(bracket.map((item) => item.id)).toContain(getKnockoutFixtureId(CHAMP, 1, 1));
    expect(bracket.every((item) => item.stage === 'knockout' && item.groupId === null && item.originSnapshotVersion === 1)).toBe(true);
  });

  it('gera BYE estrutural para 6 classificados sem placar artificial', () => {
    const six = Array.from({ length: 3 }, (_, index) => [
      team(`a${index + 1}`, 'A', index + 1),
      team(`b${index + 1}`, 'B', index + 1),
    ]).flat();
    const snapshot = {
      id: getGroupSnapshotId(CHAMP, 1),
      version: 1,
      championshipId: CHAMP,
      groupGenerationVersion: 1,
      groupFixturesVersion: 1,
      structureVersion: 1 as const,
      configVersion: 1 as const,
      qualifiersPerGroup: 3,
      generatedBy: 'org-1',
      generatedAt: new Date(),
      standingsDigest: 'digest',
      qualifiers: six.map((item) => ({
        teamId: item.id,
        groupId: item.groupId === GROUP_A ? 'A' : 'B',
        groupPosition: item.groupSeed ?? 1,
        groupSeed: item.groupSeed ?? 1,
        knockoutSeed: 0,
        points: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        cards: 0,
        deterministicSeed: item.id,
      })),
    };

    const seeding = buildKnockoutSeedsFromGroupSnapshot(snapshot, { ...DEFAULT_GROUP_STAGE_CONFIG, qualifiersPerGroup: 3 });
    const bracket = buildKnockoutBracketFromGroupSnapshot({ snapshot, championshipId: CHAMP });

    expect(seeding.byeCount).toBe(2);
    expect(bracket).toHaveLength(5);
    expect(bracket.every((item) => item.homeScore == null && item.awayScore == null && item.status === 'agendado')).toBe(true);
  });
});
