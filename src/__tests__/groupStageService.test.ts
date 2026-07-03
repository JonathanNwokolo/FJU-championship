import type {
  Championship,
  GroupAssignmentLog,
  GroupStageTransitionLog,
  MatchEvent,
  MatchModel,
  Team,
} from '../types';
import { DEFAULT_GROUP_STAGE_CONFIG } from '../utils/groupStageRules';

type AnyDoc = Record<string, unknown>;
type Ref = { __col: string; __id: string };
type Filter = { field: string; op: string; value: unknown };
type QueryRef = { __col: string; __filters: Filter[] };

const mockStore: Record<string, Map<string, AnyDoc>> = {};
const mockVersions: Record<string, Map<string, number>> = {};
let mockThrowOnTeamUpdate: string | null = null;

function mockCol(name: string): Map<string, AnyDoc> {
  if (!mockStore[name]) mockStore[name] = new Map();
  return mockStore[name];
}

function mockVersionCol(name: string): Map<string, number> {
  if (!mockVersions[name]) mockVersions[name] = new Map();
  return mockVersions[name];
}

function mockWriteDoc(col: string, id: string, data: AnyDoc) {
  mockCol(col).set(id, data);
  mockVersionCol(col).set(id, (mockVersionCol(col).get(id) ?? 0) + 1);
}

function mockResetStore() {
  for (const key of Object.keys(mockStore)) delete mockStore[key];
  for (const key of Object.keys(mockVersions)) delete mockVersions[key];
  mockThrowOnTeamUpdate = null;
}

function mockSnap(ref: Ref) {
  const current = mockCol(ref.__col).get(ref.__id);
  return { id: ref.__id, exists: () => current !== undefined, data: () => current };
}

function mockValueAt(doc: AnyDoc, field: string): unknown {
  return field.split('.').reduce<unknown>((current, part) => {
    if (current && typeof current === 'object') {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, doc);
}

jest.mock('firebase/firestore', () => ({
  doc: (_db: unknown, c: string, id: string): Ref => ({ __col: c, __id: id }),
  collection: (_db: unknown, c: string): QueryRef => ({ __col: c, __filters: [] }),
  where: (field: string, op: string, value: unknown): Filter => ({ field, op, value }),
  query: (col: QueryRef, ...filters: Filter[]): QueryRef => ({
    __col: col.__col,
    __filters: filters,
  }),
  getDoc: async (ref: Ref) => mockSnap(ref),
  getDocs: async (q: QueryRef) => ({
    docs: Array.from(mockCol(q.__col).entries())
      .filter(([, data]) =>
        q.__filters.every((filter) => {
          if (filter.op === '==') return mockValueAt(data, filter.field) === filter.value;
          return true;
        }),
      )
      .map(([id, data]) => ({ id, data: () => data })),
  }),
  serverTimestamp: () => 'SERVER_TS',
  runTransaction: async (_db: unknown, fn: (t: unknown) => Promise<unknown>) => {
    const writes: Array<{ op: 'set' | 'update'; ref: Ref; data: AnyDoc }> = [];
    const readVersions = new Map<string, number>();
    const tx = {
      get: async (ref: Ref) => {
        readVersions.set(`${ref.__col}/${ref.__id}`, mockVersionCol(ref.__col).get(ref.__id) ?? 0);
        return mockSnap(ref);
      },
      set: (ref: Ref, data: AnyDoc) => writes.push({ op: 'set', ref, data }),
      update: (ref: Ref, data: AnyDoc) => {
        if (mockThrowOnTeamUpdate && ref.__col === 'teams' && ref.__id === mockThrowOnTeamUpdate) {
          throw new Error('forced write failure');
        }
        writes.push({ op: 'update', ref, data });
      },
    };
    const result = await fn(tx);
    for (const [key, version] of readVersions) {
      const [col, id] = key.split('/');
      if ((mockVersionCol(col).get(id) ?? 0) !== version) {
        throw Object.assign(new Error('transaction conflict'), { code: 'aborted' });
      }
    }
    for (const w of writes) {
      const c = mockCol(w.ref.__col);
      if (w.op === 'set') mockWriteDoc(w.ref.__col, w.ref.__id, { id: w.ref.__id, ...w.data });
      else mockWriteDoc(w.ref.__col, w.ref.__id, { ...(c.get(w.ref.__id) ?? { id: w.ref.__id }), ...w.data });
    }
    return result;
  },
}));

jest.mock('../config/appConfig', () => ({
  MOCK_DATA_ENABLED: false,
  USE_MOCK: false,
  MOCK_ACTIVE_USER: 'organizador',
  ALLOW_ORGANIZER_SELF_ASSIGN: false,
}));
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'org-1' } } }));

import {
  generateAndPersistGroupAssignments,
  generateAndPersistGroupFixtures,
  completeGroupStageAndGenerateKnockout,
  getGroupAssignmentLogId,
  getGroupFixturesLogId,
  getGroupTransitionLogId,
  GroupAssignmentError,
  previewGroupAssignments,
} from '../services/groupStageService';
import { getGroupFixtureId, getGroupId, getGroupSnapshotId } from '../utils/groupStageIds';

const CHAMP = 'champ-1';
const ORG = 'org-1';

function champ(overrides: Partial<Championship> = {}): Championship {
  return {
    id: CHAMP,
    name: 'Copa FJU',
    format: 'grupos_e_mata_mata',
    status: 'inscricoes_abertas',
    stage: 'registration',
    currentRound: 0,
    totalRounds: 0,
    organizerId: ORG,
    inviteCode: 'ABC123',
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
    groupStageStatus: 'not_generated',
    groupGenerationVersion: 0,
    ...overrides,
  };
}

function team(id: string, overrides: Partial<Team> = {}): Team {
  return {
    id,
    championshipId: CHAMP,
    name: `Time ${id}`,
    primaryColor: '#111111',
    secondaryColor: '#ffffff',
    captainId: `cap-${id}`,
    status: 'aprovado',
    inviteCode: id,
    createdAt: '2026-01-01',
    ...overrides,
  };
}

function match(id: string, overrides: Partial<MatchModel> = {}): MatchModel {
  return {
    id,
    championshipId: CHAMP,
    round: 1,
    homeTeamId: 'team-1',
    awayTeamId: 'team-2',
    homeScore: null,
    awayScore: null,
    status: 'agendado',
    ...overrides,
  };
}

function event(id: string, matchId: string): MatchEvent {
  return {
    id,
    matchId,
    championshipId: CHAMP,
    type: 'gol',
    teamId: 'team-1',
    playerId: 'player-1',
    minute: 10,
  };
}

function seedChampionship(c = champ()) {
  mockWriteDoc('championships', c.id, { ...c });
}

function seedTeams(teams = [team('team-1'), team('team-2'), team('team-3'), team('team-4')]) {
  for (const item of teams) mockWriteDoc('teams', item.id, { ...item });
}

function seedMatch(m: MatchModel) {
  mockWriteDoc('matches', m.id, { ...m });
}

function seedEvent(e: MatchEvent) {
  mockWriteDoc('match_events', e.id, { ...e });
}

beforeEach(() => mockResetStore());

describe('groupStageService preview', () => {
  it('retorna preview sem persistir, sem versao e sem log', () => {
    const result = previewGroupAssignments({
      championshipId: CHAMP,
      teams: [team('team-1'), team('team-2'), team('team-3'), team('team-4')],
      drawSeed: 'preview-seed',
    });

    expect(result.assignments).toHaveLength(4);
    expect(mockCol('teams').size).toBe(0);
    expect(mockCol('group_assignment_logs').size).toBe(0);
  });

  it('ignora time rejeitado e removido no preview', () => {
    const result = previewGroupAssignments({
      championshipId: CHAMP,
      teams: [
        team('team-1'),
        team('team-2'),
        team('team-3'),
        team('team-4'),
        team('team-rejected', { status: 'rejeitado' }),
        team('team-removed', { removedAt: '2026-01-01' } as Partial<Team>),
      ],
      drawSeed: 'preview-seed',
    });

    expect(result.assignments.map((item) => item.teamId)).not.toContain('team-rejected');
    expect(result.assignments.map((item) => item.teamId)).not.toContain('team-removed');
  });
});

describe('groupStageService persistencia', () => {
  it('persiste distribuicao para organizador valido', async () => {
    seedChampionship();
    seedTeams();

    const result = await generateAndPersistGroupAssignments({
      championshipId: CHAMP,
      organizerId: ORG,
      expectedGenerationVersion: 0,
      drawSeed: 'seed-a',
    });

    expect(result.idempotent).toBe(false);
    expect(result.generationVersion).toBe(1);
    expect(result.drawSeed).toBe('seed-a');
    expect(result.assignments).toHaveLength(4);
    expect(mockCol('championships').get(CHAMP)).toMatchObject({
      groupStageStatus: 'groups_generated',
      groupGenerationVersion: 1,
      groupStructureVersion: 1,
      stage: 'registration',
    });
    for (const assignment of result.assignments) {
      expect(mockCol('teams').get(assignment.teamId)).toMatchObject({
        groupId: assignment.groupId,
        groupSeed: assignment.groupSeed,
        groupAssignmentVersion: 1,
      });
    }
  });

  it('mantem stage em registration ate fixtures existirem', async () => {
    seedChampionship();
    seedTeams();

    await generateAndPersistGroupAssignments({
      championshipId: CHAMP,
      organizerId: ORG,
      expectedGenerationVersion: 0,
      drawSeed: 'seed-a',
    });

    expect(mockCol('championships').get(CHAMP)?.stage).toBe('registration');
  });

  it('cria log administrativo deterministico', async () => {
    seedChampionship();
    seedTeams();

    const result = await generateAndPersistGroupAssignments({
      championshipId: CHAMP,
      organizerId: ORG,
      expectedGenerationVersion: 0,
      drawSeed: 'seed-a',
    });
    const logId = getGroupAssignmentLogId(CHAMP, 1);
    const log = mockCol('group_assignment_logs').get(logId) as unknown as GroupAssignmentLog;

    expect(result.logId).toBe(logId);
    expect(log).toMatchObject({
      id: logId,
      championshipId: CHAMP,
      generationVersion: 1,
      algorithmVersion: 1,
      drawSeed: 'seed-a',
      createdBy: ORG,
      createdAt: 'SERVER_TS',
    });
    expect(log.assignments).toEqual(result.assignments);
  });

  it('retorna distribuicao persistida no retry idempotente sem trocar seed ou log', async () => {
    seedChampionship();
    seedTeams();

    const first = await generateAndPersistGroupAssignments({
      championshipId: CHAMP,
      organizerId: ORG,
      expectedGenerationVersion: 0,
      drawSeed: 'seed-a',
    });
    const second = await generateAndPersistGroupAssignments({
      championshipId: CHAMP,
      organizerId: ORG,
      expectedGenerationVersion: 1,
      drawSeed: 'seed-b',
    });

    expect(second.idempotent).toBe(true);
    expect(second.drawSeed).toBe('seed-a');
    expect(second.assignments).toEqual(first.assignments);
    expect(mockCol('group_assignment_logs').size).toBe(1);
  });

  it('bloqueia usuario sem permissao', async () => {
    seedChampionship();
    seedTeams();

    await expect(
      generateAndPersistGroupAssignments({
        championshipId: CHAMP,
        organizerId: 'other',
        expectedGenerationVersion: 0,
      }),
    ).rejects.toMatchObject({ code: 'not_owner' });
  });

  it('bloqueia formato errado', async () => {
    seedChampionship(champ({ format: 'pontos_corridos' }));
    seedTeams();

    await expect(
      generateAndPersistGroupAssignments({
        championshipId: CHAMP,
        organizerId: ORG,
        expectedGenerationVersion: 0,
      }),
    ).rejects.toMatchObject({ code: 'unsupported_format' });
  });

  it('bloqueia config invalida', async () => {
    seedChampionship(champ({
      groupStageConfig: {
        ...DEFAULT_GROUP_STAGE_CONFIG,
        groupCount: 3,
      } as unknown as Championship['groupStageConfig'],
    }));
    seedTeams();

    await expect(
      generateAndPersistGroupAssignments({
        championshipId: CHAMP,
        organizerId: ORG,
        expectedGenerationVersion: 0,
      }),
    ).rejects.toMatchObject({ code: 'invalid_group_count' });
  });

  it('aceita numero impar mantendo equilibrio', async () => {
    seedChampionship();
    seedTeams([team('team-1'), team('team-2'), team('team-3'), team('team-4'), team('team-5')]);

    const result = await generateAndPersistGroupAssignments({
      championshipId: CHAMP,
      organizerId: ORG,
      expectedGenerationVersion: 0,
      drawSeed: 'seed-a',
    });

    expect([result.groupA.length, result.groupB.length].sort()).toEqual([2, 3]);
  });

  it('rejeita times duplicados', async () => {
    seedChampionship();

    expect(() =>
      previewGroupAssignments({
        championshipId: CHAMP,
        teams: [team('team-1'), team('team-1'), team('team-2'), team('team-3')],
        drawSeed: 'seed-a',
      }),
    ).toThrow(GroupAssignmentError);
  });

  it('bloqueia versao obsoleta', async () => {
    seedChampionship(champ({ groupGenerationVersion: 2 }));
    seedTeams();

    await expect(
      generateAndPersistGroupAssignments({
        championshipId: CHAMP,
        organizerId: ORG,
        expectedGenerationVersion: 0,
      }),
    ).rejects.toMatchObject({ code: 'stale_generation_version' });
  });

  it('bloqueia grupos ja gerados quando persistencia esta incompleta', async () => {
    seedChampionship(champ({ groupStageStatus: 'groups_generated', groupGenerationVersion: 1 }));
    seedTeams();

    await expect(
      generateAndPersistGroupAssignments({
        championshipId: CHAMP,
        organizerId: ORG,
        expectedGenerationVersion: 1,
      }),
    ).rejects.toMatchObject({ code: 'group_assignments_already_generated' });
  });

  it('bloqueia partida de grupo existente', async () => {
    seedChampionship();
    seedTeams();
    seedMatch(match('group-1', { stage: 'group', groupId: getGroupId(CHAMP, 'A') }));

    await expect(
      generateAndPersistGroupAssignments({
        championshipId: CHAMP,
        organizerId: ORG,
        expectedGenerationVersion: 0,
      }),
    ).rejects.toMatchObject({ code: 'group_matches_already_exist' });
  });

  it.each([
    ['campeonato iniciado', champ({ status: 'em_andamento' }), 'championship_already_started'],
    ['partida ao vivo', champ(), 'live_match_exists'],
    ['partida finalizada', champ(), 'finished_match_exists'],
    ['partida W.O.', champ(), 'walkover_match_exists'],
    ['knockout gerado', champ({ knockoutStageStatus: 'generated' }), 'knockout_already_generated'],
  ])('bloqueia %s', async (_label, c, code) => {
    seedChampionship(c);
    seedTeams();
    if (code === 'live_match_exists') seedMatch(match('m-live', { status: 'ao_vivo' }));
    if (code === 'finished_match_exists') seedMatch(match('m-fin', { status: 'finalizado' }));
    if (code === 'walkover_match_exists') seedMatch(match('m-wo', { status: 'wo' }));

    await expect(
      generateAndPersistGroupAssignments({
        championshipId: CHAMP,
        organizerId: ORG,
        expectedGenerationVersion: 0,
      }),
    ).rejects.toMatchObject({ code });
  });

  it('bloqueia evento persistido em partida de grupo', async () => {
    seedChampionship();
    seedTeams();
    seedMatch(match('group-1', { stage: 'group', groupId: getGroupId(CHAMP, 'A') }));
    seedEvent(event('event-1', 'group-1'));

    await expect(
      generateAndPersistGroupAssignments({
        championshipId: CHAMP,
        organizerId: ORG,
        expectedGenerationVersion: 0,
      }),
    ).rejects.toMatchObject({ code: 'group_match_events_exist' });
  });

  it('duas chamadas concorrentes nao geram distribuicoes diferentes', async () => {
    seedChampionship();
    seedTeams();

    const [first, second] = await Promise.allSettled([
      generateAndPersistGroupAssignments({
        championshipId: CHAMP,
        organizerId: ORG,
        expectedGenerationVersion: 0,
        drawSeed: 'seed-a',
      }),
      generateAndPersistGroupAssignments({
        championshipId: CHAMP,
        organizerId: ORG,
        expectedGenerationVersion: 0,
        drawSeed: 'seed-b',
      }),
    ]);

    const fulfilled = [first, second].filter(
      (item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof generateAndPersistGroupAssignments>>> =>
        item.status === 'fulfilled',
    );
    const rejected = [first, second].filter((item) => item.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(mockCol('group_assignment_logs').size).toBe(1);
    expect(mockCol('championships').get(CHAMP)?.groupGenerationVersion).toBe(1);
  });

  it('falha no meio nao deixa escrita parcial', async () => {
    seedChampionship();
    seedTeams();
    mockThrowOnTeamUpdate = 'team-3';

    await expect(
      generateAndPersistGroupAssignments({
        championshipId: CHAMP,
        organizerId: ORG,
        expectedGenerationVersion: 0,
        drawSeed: 'seed-a',
      }),
    ).rejects.toThrow('forced write failure');

    expect(mockCol('group_assignment_logs').size).toBe(0);
    expect(mockCol('championships').get(CHAMP)?.groupStageStatus).toBe('not_generated');
    expect(mockCol('teams').get('team-1')?.groupId).toBeUndefined();
  });
});

describe('groupStageService fixtures de grupos', () => {
  async function seedGeneratedGroups(teamList = [team('team-1'), team('team-2'), team('team-3'), team('team-4')]) {
    seedChampionship();
    seedTeams(teamList);
    return generateAndPersistGroupAssignments({
      championshipId: CHAMP,
      organizerId: ORG,
      expectedGenerationVersion: 0,
      drawSeed: 'seed-fixtures',
    });
  }

  it('gera, persiste e registra fixtures para organizador valido', async () => {
    const assignments = await seedGeneratedGroups();

    const result = await generateAndPersistGroupFixtures({
      championshipId: CHAMP,
      organizerId: ORG,
      expectedGroupGenerationVersion: assignments.generationVersion,
      expectedFixturesVersion: 0,
    });

    expect(result.idempotent).toBe(false);
    expect(result.fixturesVersion).toBe(1);
    expect(result.fixtures).toHaveLength(2);
    expect(result.groupCounts).toEqual({ groupA: 1, groupB: 1 });
    expect(mockCol('matches').size).toBe(2);
    expect(mockCol('championships').get(CHAMP)).toMatchObject({
      stage: 'group_stage',
      groupStageStatus: 'fixtures_generated',
      groupStructureVersion: 1,
      groupFixturesVersion: 1,
    });

    const logId = getGroupFixturesLogId(CHAMP, 1);
    expect(result.logId).toBe(logId);
    expect(mockCol('group_fixture_logs').get(logId)).toMatchObject({
      id: logId,
      championshipId: CHAMP,
      fixturesVersion: 1,
      groupGenerationVersion: 1,
      structureVersion: 1,
      fixtureCount: 2,
      groupCounts: { groupA: 1, groupB: 1 },
      createdBy: ORG,
      createdAt: 'SERVER_TS',
    });
    expect(result.fixtures.every((fixture) => fixture.stage === 'group' && fixture.groupRound === 1)).toBe(true);
  });

  it('retorna fixtures persistidas no retry idempotente sem duplicar log', async () => {
    const assignments = await seedGeneratedGroups();

    const first = await generateAndPersistGroupFixtures({
      championshipId: CHAMP,
      organizerId: ORG,
      expectedGroupGenerationVersion: assignments.generationVersion,
      expectedFixturesVersion: 0,
    });
    const second = await generateAndPersistGroupFixtures({
      championshipId: CHAMP,
      organizerId: ORG,
      expectedGroupGenerationVersion: assignments.generationVersion,
      expectedFixturesVersion: 1,
    });

    expect(second.idempotent).toBe(true);
    expect(second.fixtures).toEqual(first.fixtures);
    expect(mockCol('matches').size).toBe(2);
    expect(mockCol('group_fixture_logs').size).toBe(1);
  });

  it('bloqueia usuario sem permissao e versao obsoleta', async () => {
    const assignments = await seedGeneratedGroups();

    await expect(
      generateAndPersistGroupFixtures({
        championshipId: CHAMP,
        organizerId: 'other',
        expectedGroupGenerationVersion: assignments.generationVersion,
      }),
    ).rejects.toMatchObject({ code: 'not_owner' });

    await expect(
      generateAndPersistGroupFixtures({
        championshipId: CHAMP,
        organizerId: ORG,
        expectedGroupGenerationVersion: 0,
      }),
    ).rejects.toMatchObject({ code: 'stale_generation_version' });
  });

  it('bloqueia log de assignments ausente', async () => {
    seedChampionship(champ({ groupStageStatus: 'groups_generated', groupGenerationVersion: 1 }));
    seedTeams([
      team('team-1', { groupId: getGroupId(CHAMP, 'A'), groupSeed: 1, groupAssignmentVersion: 1 }),
      team('team-2', { groupId: getGroupId(CHAMP, 'A'), groupSeed: 2, groupAssignmentVersion: 1 }),
      team('team-3', { groupId: getGroupId(CHAMP, 'B'), groupSeed: 1, groupAssignmentVersion: 1 }),
      team('team-4', { groupId: getGroupId(CHAMP, 'B'), groupSeed: 2, groupAssignmentVersion: 1 }),
    ]);

    await expect(
      generateAndPersistGroupFixtures({
        championshipId: CHAMP,
        organizerId: ORG,
        expectedGroupGenerationVersion: 1,
      }),
    ).rejects.toMatchObject({ code: 'group_assignment_log_missing' });
  });

  it('detecta estrutura parcial existente', async () => {
    const assignments = await seedGeneratedGroups();
    const groupA = assignments.groupA;
    const first = groupA[0].teamId;
    const second = groupA[1].teamId;
    seedMatch(match('partial', {
      id: getGroupFixtureId(CHAMP, getGroupId(CHAMP, 'A'), first, second),
      stage: 'group',
      groupId: getGroupId(CHAMP, 'A'),
      groupRound: 1,
      homeTeamId: first,
      awayTeamId: second,
      structureVersion: 1,
      groupGenerationVersion: 1,
    }));

    await expect(
      generateAndPersistGroupFixtures({
        championshipId: CHAMP,
        organizerId: ORG,
        expectedGroupGenerationVersion: 1,
      }),
    ).rejects.toMatchObject({ code: 'partial_group_fixtures_detected' });
  });

  it.each([
    ['campeonato iniciado', { status: 'em_andamento' as const }, 'championship_already_started'],
    ['knockout gerado', { knockoutStageStatus: 'generated' as const }, 'knockout_already_generated'],
  ])('bloqueia %s', async (_label, override, code) => {
    const assignments = await seedGeneratedGroups();
    mockWriteDoc('championships', CHAMP, {
      ...mockCol('championships').get(CHAMP),
      ...override,
    });

    await expect(
      generateAndPersistGroupFixtures({
        championshipId: CHAMP,
        organizerId: ORG,
        expectedGroupGenerationVersion: assignments.generationVersion,
      }),
    ).rejects.toMatchObject({ code });
  });

  it('duas chamadas concorrentes nao duplicam fixtures ou logs', async () => {
    const assignments = await seedGeneratedGroups();

    const [first, second] = await Promise.allSettled([
      generateAndPersistGroupFixtures({
        championshipId: CHAMP,
        organizerId: ORG,
        expectedGroupGenerationVersion: assignments.generationVersion,
        expectedFixturesVersion: 0,
      }),
      generateAndPersistGroupFixtures({
        championshipId: CHAMP,
        organizerId: ORG,
        expectedGroupGenerationVersion: assignments.generationVersion,
        expectedFixturesVersion: 0,
      }),
    ]);

    const fulfilled = [first, second].filter((item) => item.status === 'fulfilled');
    const rejected = [first, second].filter((item) => item.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(mockCol('matches').size).toBe(2);
    expect(mockCol('group_fixture_logs').size).toBe(1);
  });
});

describe('groupStageService conclusao da fase de grupos', () => {
  async function seedReadyGroupStage() {
    seedChampionship();
    seedTeams();
    const assignments = await generateAndPersistGroupAssignments({
      championshipId: CHAMP,
      organizerId: ORG,
      expectedGenerationVersion: 0,
      drawSeed: 'seed-transition',
    });
    const fixtures = await generateAndPersistGroupFixtures({
      championshipId: CHAMP,
      organizerId: ORG,
      expectedGroupGenerationVersion: assignments.generationVersion,
      expectedFixturesVersion: 0,
    });
    mockWriteDoc('championships', CHAMP, {
      ...mockCol('championships').get(CHAMP),
      status: 'em_andamento',
      stage: 'group_stage',
      groupStageStatus: 'fixtures_generated',
    });
    fixtures.fixtures.forEach((fixture, index) => {
      const homeWins = index % 2 === 0;
      mockWriteDoc('matches', fixture.id, {
        ...fixture,
        status: 'finalizado',
        homeScore: homeWins ? 2 : 0,
        awayScore: homeWins ? 0 : 2,
        winnerId: homeWins ? fixture.homeTeamId : fixture.awayTeamId,
      });
    });
    return fixtures;
  }

  it('persiste snapshot, chave, campeonato e log em transicao valida', async () => {
    const fixtures = await seedReadyGroupStage();

    const result = await completeGroupStageAndGenerateKnockout({
      championshipId: CHAMP,
      organizerId: ORG,
      expectedGroupGenerationVersion: 1,
      expectedGroupFixturesVersion: fixtures.fixturesVersion,
      expectedSnapshotVersion: 1,
      expectedKnockoutVersion: 1,
    });

    expect(result.idempotent).toBe(false);
    expect(result.snapshot.id).toBe(getGroupSnapshotId(CHAMP, 1));
    expect(result.snapshot.qualifiers).toHaveLength(2);
    expect(result.knockoutMatches).toHaveLength(1);
    expect(mockCol('group_stage_snapshots').get(getGroupSnapshotId(CHAMP, 1))).toMatchObject({
      championshipId: CHAMP,
      version: 1,
      groupGenerationVersion: 1,
      groupFixturesVersion: 1,
      structureVersion: 1,
      generatedBy: ORG,
    });
    expect(mockCol('championships').get(CHAMP)).toMatchObject({
      stage: 'knockout',
      groupStageStatus: 'completed',
      knockoutStageStatus: 'generated',
      groupSnapshotVersion: 1,
      knockoutGenerationVersion: 1,
      groupStageComplete: true,
    });
    const log = mockCol('group_transition_logs').get(getGroupTransitionLogId(CHAMP, 1)) as unknown as GroupStageTransitionLog;
    expect(log).toMatchObject({
      id: getGroupTransitionLogId(CHAMP, 1),
      championshipId: CHAMP,
      transitionVersion: 1,
      knockoutGenerationVersion: 1,
      createdBy: ORG,
    });
    expect(log.fixtureIds).toEqual(result.knockoutMatches.map((item) => item.id));
  });

  it('retry idempotente retorna snapshot e chave existentes sem duplicar documentos', async () => {
    const fixtures = await seedReadyGroupStage();
    const first = await completeGroupStageAndGenerateKnockout({
      championshipId: CHAMP,
      organizerId: ORG,
      expectedGroupGenerationVersion: 1,
      expectedGroupFixturesVersion: fixtures.fixturesVersion,
      expectedSnapshotVersion: 1,
      expectedKnockoutVersion: 1,
    });
    const second = await completeGroupStageAndGenerateKnockout({
      championshipId: CHAMP,
      organizerId: ORG,
      expectedGroupGenerationVersion: 1,
      expectedGroupFixturesVersion: fixtures.fixturesVersion,
      expectedSnapshotVersion: 1,
      expectedKnockoutVersion: 1,
    });

    expect(second.idempotent).toBe(true);
    expect(second.snapshot.standingsDigest).toBe(first.snapshot.standingsDigest);
    expect(second.knockoutMatches.map((item) => item.id)).toEqual(first.knockoutMatches.map((item) => item.id));
    expect(mockCol('group_stage_snapshots').size).toBe(1);
    expect(mockCol('group_transition_logs').size).toBe(1);
  });

  it('bloqueia usuario sem permissao e fase incompleta', async () => {
    const fixtures = await seedReadyGroupStage();

    await expect(
      completeGroupStageAndGenerateKnockout({
        championshipId: CHAMP,
        organizerId: 'other',
        expectedGroupGenerationVersion: 1,
        expectedGroupFixturesVersion: fixtures.fixturesVersion,
      }),
    ).rejects.toMatchObject({ code: 'not_owner' });

    const firstFixture = fixtures.fixtures[0];
    mockWriteDoc('matches', firstFixture.id, {
      ...mockCol('matches').get(firstFixture.id),
      status: 'agendado',
      homeScore: null,
      awayScore: null,
      winnerId: null,
    });

    await expect(
      completeGroupStageAndGenerateKnockout({
        championshipId: CHAMP,
        organizerId: ORG,
        expectedGroupGenerationVersion: 1,
        expectedGroupFixturesVersion: fixtures.fixturesVersion,
      }),
    ).rejects.toMatchObject({ code: 'unresolved_group_match' });
  });

  it('detecta conflito de snapshot existente divergente', async () => {
    const fixtures = await seedReadyGroupStage();
    mockWriteDoc('group_stage_snapshots', getGroupSnapshotId(CHAMP, 1), {
      id: getGroupSnapshotId(CHAMP, 1),
      version: 1,
      championshipId: CHAMP,
      generatedAt: '2026-01-01',
      configVersion: 1,
      standingsDigest: 'outro-digest',
      qualifiers: [],
    });

    await expect(
      completeGroupStageAndGenerateKnockout({
        championshipId: CHAMP,
        organizerId: ORG,
        expectedGroupGenerationVersion: 1,
        expectedGroupFixturesVersion: fixtures.fixturesVersion,
      }),
    ).rejects.toMatchObject({ code: 'group_stage_snapshot_conflict' });
  });
});
