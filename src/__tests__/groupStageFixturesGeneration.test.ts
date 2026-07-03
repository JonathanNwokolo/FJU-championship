import type { Team } from '../types';
import {
  expectedGroupFixtureCount,
  expectedGroupRoundCount,
  generateAllGroupRoundRobinFixtures,
  generateGroupRoundRobinFixtures,
} from '../utils/groupStageFixtures';
import { getGroupFixtureId, getGroupId } from '../utils/groupStageIds';

const CHAMP = 'champ-fixtures';

function team(id: string, group: 'A' | 'B', seed: number): Team {
  return {
    id,
    championshipId: CHAMP,
    name: id,
    primaryColor: '#111',
    secondaryColor: '#fff',
    captainId: `cap-${id}`,
    status: 'aprovado',
    inviteCode: id,
    createdAt: '2026-01-01',
    groupId: getGroupId(CHAMP, group),
    groupSeed: seed,
    groupAssignmentVersion: 1,
  };
}

function teamsOf(count: number, group: 'A' | 'B'): Team[] {
  return Array.from({ length: count }, (_, index) => team(`${group}${index + 1}`, group, index + 1));
}

function assertRoundRobinShape(matches: ReturnType<typeof generateGroupRoundRobinFixtures>, count: number) {
  expect(matches).toHaveLength(expectedGroupFixtureCount(count));
  expect(Math.max(...matches.map((match) => match.groupRound ?? 0))).toBe(expectedGroupRoundCount(count));

  const pairs = new Set<string>();
  const roundUsage = new Map<number, Set<string>>();
  for (const match of matches) {
    expect(match.stage).toBe('group');
    expect(match.status).toBe('agendado');
    expect(match.homeScore).toBeNull();
    expect(match.awayScore).toBeNull();
    expect(match.homeTeamId).not.toBe(match.awayTeamId);
    expect(match.id).toBe(getGroupFixtureId(match.championshipId, match.groupId!, match.homeTeamId, match.awayTeamId));

    const pair = [match.homeTeamId, match.awayTeamId].sort().join(':');
    expect(pairs.has(pair)).toBe(false);
    pairs.add(pair);

    const round = match.groupRound!;
    const usage = roundUsage.get(round) ?? new Set<string>();
    expect(usage.has(match.homeTeamId)).toBe(false);
    expect(usage.has(match.awayTeamId)).toBe(false);
    usage.add(match.homeTeamId);
    usage.add(match.awayTeamId);
    roundUsage.set(round, usage);
  }
}

describe('generateGroupRoundRobinFixtures', () => {
  it.each([2, 3, 4, 5, 6, 7, 8])('gera round-robin deterministico para %i times', (count) => {
    const teams = teamsOf(count, 'A');
    const before = JSON.stringify(teams);
    const matches = generateGroupRoundRobinFixtures({
      championshipId: CHAMP,
      groupId: getGroupId(CHAMP, 'A'),
      teams,
      groupGenerationVersion: 1,
    });

    assertRoundRobinShape(matches, count);
    expect(JSON.stringify(teams)).toBe(before);

    const shuffled = [...teams].reverse();
    const fromShuffled = generateGroupRoundRobinFixtures({
      championshipId: CHAMP,
      groupId: getGroupId(CHAMP, 'A'),
      teams: shuffled,
      groupGenerationVersion: 1,
    });
    expect(fromShuffled).toEqual(matches);
  });

  it('mantem home/away estavel e nao cria bye como documento', () => {
    const matches = generateGroupRoundRobinFixtures({
      championshipId: CHAMP,
      groupId: 'A',
      teams: teamsOf(5, 'A'),
      groupGenerationVersion: 1,
    });

    expect(matches).toHaveLength(10);
    expect(matches.some((match) => match.homeTeamId === 'BYE' || match.awayTeamId === 'BYE')).toBe(false);
    expect(matches).toEqual(
      generateGroupRoundRobinFixtures({
        championshipId: CHAMP,
        groupId: 'A',
        teams: teamsOf(5, 'A'),
        groupGenerationVersion: 1,
      }),
    );
  });
});

describe('generateAllGroupRoundRobinFixtures', () => {
  it.each([
    [2, 2],
    [3, 2],
    [3, 3],
    [4, 3],
    [4, 4],
    [5, 4],
  ])('gera A+B sem cruzar grupos para %ix%i', (aCount, bCount) => {
    const fixtures = generateAllGroupRoundRobinFixtures({
      championshipId: CHAMP,
      groups: { A: teamsOf(aCount, 'A'), B: teamsOf(bCount, 'B') },
      groupGenerationVersion: 1,
    });

    const groupA = fixtures.filter((match) => match.groupId === getGroupId(CHAMP, 'A'));
    const groupB = fixtures.filter((match) => match.groupId === getGroupId(CHAMP, 'B'));
    expect(groupA).toHaveLength(expectedGroupFixtureCount(aCount));
    expect(groupB).toHaveLength(expectedGroupFixtureCount(bCount));
    expect(fixtures).toHaveLength(expectedGroupFixtureCount(aCount) + expectedGroupFixtureCount(bCount));
    expect(new Set(groupA.map((match) => match.groupRound)).size).toBe(expectedGroupRoundCount(aCount));
    expect(new Set(groupB.map((match) => match.groupRound)).size).toBe(expectedGroupRoundCount(bCount));
    expect(fixtures.every((match) => match.structureVersion === 1 && match.groupGenerationVersion === 1)).toBe(true);

    for (const match of fixtures) {
      expect(match.homeTeamId[0]).toBe(match.awayTeamId[0]);
    }
  });
});
