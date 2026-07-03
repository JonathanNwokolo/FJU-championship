import {
  distributeTeamsIntoGroups,
  GroupDistributionError,
} from '../utils/groupStageDistribution';
import { getGroupId } from '../utils/groupStageIds';

const CHAMP = 'champ-1';

function teamIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `team-${index + 1}`);
}

function sizes(count: number) {
  const result = distributeTeamsIntoGroups({
    championshipId: CHAMP,
    teamIds: teamIds(count),
    drawSeed: 'seed-a',
  });
  return [result.groupA.length, result.groupB.length];
}

describe('groupStageDistribution', () => {
  it.each([4, 5, 6, 7, 8, 9, 10])('distribui %i times em grupos equilibrados', (count) => {
    const result = distributeTeamsIntoGroups({
      championshipId: CHAMP,
      teamIds: teamIds(count),
      drawSeed: 'seed-a',
    });

    expect(result.assignments).toHaveLength(count);
    expect(Math.abs(result.groupA.length - result.groupB.length)).toBeLessThanOrEqual(1);
    expect(result.groupA.length).toBeGreaterThanOrEqual(2);
    expect(result.groupB.length).toBeGreaterThanOrEqual(2);
    expect(new Set(result.assignments.map((item) => item.teamId)).size).toBe(count);
    expect(result.groupA.every((item) => item.groupId === getGroupId(CHAMP, 'A'))).toBe(true);
    expect(result.groupB.every((item) => item.groupId === getGroupId(CHAMP, 'B'))).toBe(true);
  });

  it('mantem a mesma distribuicao para mesma seed', () => {
    const first = distributeTeamsIntoGroups({
      championshipId: CHAMP,
      teamIds: teamIds(8),
      drawSeed: 'seed-a',
    });
    const second = distributeTeamsIntoGroups({
      championshipId: CHAMP,
      teamIds: teamIds(8),
      drawSeed: 'seed-a',
    });

    expect(second).toEqual(first);
  });

  it('seeds diferentes podem gerar ordem diferente', () => {
    const first = distributeTeamsIntoGroups({
      championshipId: CHAMP,
      teamIds: teamIds(8),
      drawSeed: 'seed-a',
    });
    const second = distributeTeamsIntoGroups({
      championshipId: CHAMP,
      teamIds: teamIds(8),
      drawSeed: 'seed-b',
    });

    expect(second.assignments.map((item) => item.teamId)).not.toEqual(
      first.assignments.map((item) => item.teamId),
    );
  });

  it('nao depende da ordem recebida', () => {
    const ordered = teamIds(9);
    const reversed = [...ordered].reverse();

    const first = distributeTeamsIntoGroups({
      championshipId: CHAMP,
      teamIds: ordered,
      drawSeed: 'stable-seed',
    });
    const second = distributeTeamsIntoGroups({
      championshipId: CHAMP,
      teamIds: reversed,
      drawSeed: 'stable-seed',
    });

    expect(second.assignments).toEqual(first.assignments);
  });

  it('nao muta a entrada original', () => {
    const input = teamIds(6);
    const snapshot = [...input];

    distributeTeamsIntoGroups({
      championshipId: CHAMP,
      teamIds: input,
      drawSeed: 'seed-a',
    });

    expect(input).toEqual(snapshot);
  });

  it('gera seeds sequenciais dentro de cada grupo', () => {
    const result = distributeTeamsIntoGroups({
      championshipId: CHAMP,
      teamIds: teamIds(7),
      drawSeed: 'seed-a',
    });

    expect(result.groupA.map((item) => item.groupSeed)).toEqual([1, 2, 3, 4]);
    expect(result.groupB.map((item) => item.groupSeed)).toEqual([1, 2, 3]);
  });

  it('rejeita time duplicado', () => {
    expect(() =>
      distributeTeamsIntoGroups({
        championshipId: CHAMP,
        teamIds: ['team-1', 'team-1', 'team-2', 'team-3'],
        drawSeed: 'seed-a',
      }),
    ).toThrow(GroupDistributionError);
  });

  it('rejeita menos de 4 times', () => {
    expect(() =>
      distributeTeamsIntoGroups({
        championshipId: CHAMP,
        teamIds: teamIds(3),
        drawSeed: 'seed-a',
      }),
    ).toThrow(GroupDistributionError);
  });

  it('campeonato diferente muda resultado quando aplicavel', () => {
    const first = distributeTeamsIntoGroups({
      championshipId: 'champ-1',
      teamIds: teamIds(8),
      drawSeed: 'seed-a',
    });
    const second = distributeTeamsIntoGroups({
      championshipId: 'champ-2',
      teamIds: teamIds(8),
      drawSeed: 'seed-a',
    });

    expect(second.assignments.map((item) => item.teamId)).not.toEqual(
      first.assignments.map((item) => item.teamId),
    );
  });

  it('mantem diferenca maxima de 1 em todos os tamanhos aprovados', () => {
    for (const count of [4, 5, 6, 7, 8, 9, 10]) {
      const [a, b] = sizes(count);
      expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
    }
  });
});
