import {
  emitGroupsGeneratedNotifications,
  emitGroupStageTransitionNotifications,
} from '../services/groupStageNotifications';
import type { GroupStageQualificationSnapshot, MatchModel, Player, Team } from '../types';

jest.mock('../services/notificationService', () => ({
  notifyGroupsGenerated: jest.fn(() => Promise.resolve()),
  notifyGroupFixturesGenerated: jest.fn(() => Promise.resolve()),
  notifyKnockoutGenerated: jest.fn(() => Promise.resolve()),
  notifyKnockoutMatchDefined: jest.fn(() => Promise.resolve()),
  notifyTeamQualified: jest.fn(() => Promise.resolve()),
  notifyTeamEliminated: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services/firestore', () => ({
  getCollection: jest.fn(() => Promise.resolve([])),
}));

const notifications = require('../services/notificationService');
const { getCollection } = require('../services/firestore');

function team(id: string, group: 'A' | 'B'): Team {
  return {
    id,
    championshipId: 'c1',
    name: `Time ${id}`,
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    captainId: `cap_${id}`,
    status: 'aprovado',
    inviteCode: id,
    createdAt: '2026-01-01T00:00:00.000Z',
    groupId: group,
    groupSeed: 1,
    groupAssignmentVersion: 1,
  };
}

function player(id: string, teamId: string, userId: string): Player {
  return {
    id,
    teamId,
    championshipId: 'c1',
    userId,
    name: id,
    position: 'meia',
    number: 1,
    status: 'ativo',
  };
}

function snapshot(qualifierIds: string[]): GroupStageQualificationSnapshot {
  return {
    version: 1,
    championshipId: 'c1',
    generatedAt: new Date(),
    configVersion: 1,
    qualifiers: qualifierIds.map((teamId) => ({
      teamId,
      groupId: 'A',
      points: 3,
      wins: 1,
      goalDifference: 1,
      goalsFor: 2,
      deterministicSeed: 'x',
    })),
  } as GroupStageQualificationSnapshot;
}

beforeEach(() => {
  jest.clearAllMocks();
  getCollection.mockResolvedValue([]);
});

describe('emitGroupsGeneratedNotifications', () => {
  it('notifica todos os usuários (capitães + atletas)', async () => {
    getCollection.mockResolvedValueOnce([player('p1', 't1', 'ath1'), player('p2', 't2', 'ath2')]);
    await emitGroupsGeneratedNotifications('c1', [team('t1', 'A'), team('t2', 'B')], 2);
    expect(notifications.notifyGroupsGenerated).toHaveBeenCalledTimes(1);
    const [championshipId, userIds, version] = notifications.notifyGroupsGenerated.mock.calls[0];
    expect(championshipId).toBe('c1');
    expect(version).toBe(2);
    expect(new Set(userIds)).toEqual(new Set(['cap_t1', 'cap_t2', 'ath1', 'ath2']));
  });

  it('não propaga erro de leitura de players', async () => {
    getCollection.mockRejectedValueOnce(new Error('boom'));
    await expect(
      emitGroupsGeneratedNotifications('c1', [team('t1', 'A')], 1),
    ).resolves.toBeUndefined();
    // ainda notifica com os capitães conhecidos
    expect(notifications.notifyGroupsGenerated).toHaveBeenCalledTimes(1);
  });
});

describe('emitGroupStageTransitionNotifications', () => {
  it('emite classificados, eliminados, mata-mata e partidas definidas', async () => {
    getCollection.mockResolvedValueOnce([
      player('p1', 't1', 'ath1'),
      player('p2', 't2', 'ath2'),
      player('p3', 't3', 'ath3'),
      player('p4', 't4', 'ath4'),
    ]);
    const teams = [team('t1', 'A'), team('t2', 'A'), team('t3', 'B'), team('t4', 'B')];
    const knockoutMatches: MatchModel[] = [
      {
        id: 'k1',
        championshipId: 'c1',
        round: 1,
        homeTeamId: 't1',
        awayTeamId: 't3',
        homeScore: null,
        awayScore: null,
        status: 'agendado',
        stage: 'knockout',
        originSnapshotVersion: 1,
      },
    ];

    await emitGroupStageTransitionNotifications({
      championshipId: 'c1',
      teams,
      snapshot: snapshot(['t1', 't3']),
      knockoutMatches,
      knockoutGenerationVersion: 1,
    });

    expect(notifications.notifyKnockoutGenerated).toHaveBeenCalledTimes(1);

    const qualifiedTeams = notifications.notifyTeamQualified.mock.calls.map((c: unknown[]) => c[1]);
    const eliminatedTeams = notifications.notifyTeamEliminated.mock.calls.map((c: unknown[]) => c[1]);
    expect(new Set(qualifiedTeams)).toEqual(new Set(['t1', 't3']));
    expect(new Set(eliminatedTeams)).toEqual(new Set(['t2', 't4']));

    expect(notifications.notifyKnockoutMatchDefined).toHaveBeenCalledTimes(1);
    const [, matchId, originVersion, recipients] = notifications.notifyKnockoutMatchDefined.mock.calls[0];
    expect(matchId).toBe('k1');
    expect(originVersion).toBe(1);
    expect(new Set(recipients)).toEqual(new Set(['cap_t1', 'ath1', 'cap_t3', 'ath3']));
  });

  it('não notifica partida eliminatória com slot vazio', async () => {
    const teams = [team('t1', 'A'), team('t2', 'A')];
    const knockoutMatches: MatchModel[] = [
      {
        id: 'k1',
        championshipId: 'c1',
        round: 1,
        homeTeamId: 't1',
        awayTeamId: '',
        homeScore: null,
        awayScore: null,
        status: 'agendado',
        stage: 'knockout',
        originSnapshotVersion: 1,
      },
    ];
    await emitGroupStageTransitionNotifications({
      championshipId: 'c1',
      teams,
      snapshot: snapshot(['t1']),
      knockoutMatches,
      knockoutGenerationVersion: 1,
    });
    expect(notifications.notifyKnockoutMatchDefined).not.toHaveBeenCalled();
  });
});
