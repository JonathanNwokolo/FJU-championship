import type { MatchModel, Team } from '../types';
import { getGroupFixtureId, getGroupId } from './groupStageIds';
import { GROUP_STRUCTURE_VERSION, normalizeGroupId } from './groupStageStructure';

export type GroupFixtureErrorCode =
  | 'invalid_team'
  | 'duplicate_team_id'
  | 'invalid_group_assignment'
  | 'invalid_group_fixture';

export class GroupFixtureError extends Error {
  code: GroupFixtureErrorCode;

  constructor(code: GroupFixtureErrorCode, message: string) {
    super(message);
    this.name = 'GroupFixtureError';
    this.code = code;
  }
}

export interface GenerateGroupRoundRobinFixturesInput {
  championshipId: string;
  groupId: string;
  teams: Team[];
  structureVersion?: 1;
  groupGenerationVersion: number;
}

export interface GenerateAllGroupFixturesInput {
  championshipId: string;
  groups: Record<'A' | 'B', Team[]>;
  structureVersion?: 1;
  groupGenerationVersion: number;
}

type TeamSlot = Team | null;

export function orderGroupTeams(teams: Team[]): Team[] {
  const seen = new Set<string>();
  return teams
    .map((team) => {
      if (!team.id) {
        throw new GroupFixtureError('invalid_team', 'Time sem ID nao pode gerar fixture.');
      }
      if (seen.has(team.id)) {
        throw new GroupFixtureError('duplicate_team_id', 'Time duplicado no grupo.');
      }
      seen.add(team.id);
      if (!Number.isInteger(team.groupSeed) || (team.groupSeed ?? 0) < 1) {
        throw new GroupFixtureError('invalid_group_assignment', 'Todo time do grupo precisa de groupSeed valido.');
      }
      return team;
    })
    .sort((a, b) => {
      const seedDiff = (a.groupSeed ?? 0) - (b.groupSeed ?? 0);
      return seedDiff !== 0 ? seedDiff : a.id.localeCompare(b.id);
    });
}

export function generateGroupRoundRobinFixtures(
  input: GenerateGroupRoundRobinFixturesInput,
): MatchModel[] {
  const groupLabel = normalizeGroupId(input.groupId, input.championshipId);
  if (!groupLabel) {
    throw new GroupFixtureError('invalid_group_assignment', 'Grupo invalido para fixtures.');
  }

  const orderedTeams = orderGroupTeams(input.teams);
  if (orderedTeams.length < 2) {
    throw new GroupFixtureError('invalid_group_assignment', 'Cada grupo precisa de pelo menos 2 times.');
  }

  const groupId = getGroupId(input.championshipId, groupLabel);
  const slots: TeamSlot[] = [...orderedTeams];
  const realTeamCount = slots.length;
  if (slots.length % 2 !== 0) slots.push(null);
  const slotCount = slots.length;
  const matches: MatchModel[] = [];

  for (let roundIndex = 0; roundIndex < slotCount - 1; roundIndex += 1) {
    for (let pairIndex = 0; pairIndex < slotCount / 2; pairIndex += 1) {
      const left = slots[pairIndex];
      const right = slots[slotCount - 1 - pairIndex];
      if (!left || !right) continue;

      const shouldSwap = pairIndex === 0 ? roundIndex % 2 === 1 : roundIndex % 2 === 0;
      const home = shouldSwap ? right : left;
      const away = shouldSwap ? left : right;
      if (home.id === away.id) {
        throw new GroupFixtureError('invalid_group_fixture', 'Fixture de grupo nao pode ter self-match.');
      }

      matches.push({
        id: getGroupFixtureId(input.championshipId, groupId, home.id, away.id),
        championshipId: input.championshipId,
        round: roundIndex + 1,
        groupRound: roundIndex + 1,
        homeTeamId: home.id,
        awayTeamId: away.id,
        homeScore: null,
        awayScore: null,
        status: 'agendado',
        stage: 'group',
        groupId,
        structureVersion: input.structureVersion ?? GROUP_STRUCTURE_VERSION,
        groupGenerationVersion: input.groupGenerationVersion,
        originSnapshotVersion: null,
        nextMatchId: null,
      } as MatchModel);
    }

    slots.splice(1, 0, slots.pop()!);
  }

  validateGroupFixtureSet(matches, orderedTeams, input.championshipId, groupId, realTeamCount);
  return matches;
}

export function generateAllGroupRoundRobinFixtures(
  input: GenerateAllGroupFixturesInput,
): MatchModel[] {
  return (['A', 'B'] as const).flatMap((groupLabel) =>
    generateGroupRoundRobinFixtures({
      championshipId: input.championshipId,
      groupId: getGroupId(input.championshipId, groupLabel),
      teams: input.groups[groupLabel],
      structureVersion: input.structureVersion,
      groupGenerationVersion: input.groupGenerationVersion,
    }),
  );
}

export function expectedGroupFixtureCount(teamCount: number): number {
  return (teamCount * (teamCount - 1)) / 2;
}

export function expectedGroupRoundCount(teamCount: number): number {
  return teamCount % 2 === 0 ? teamCount - 1 : teamCount;
}

function validateGroupFixtureSet(
  matches: MatchModel[],
  teams: Team[],
  championshipId: string,
  groupId: string,
  realTeamCount: number,
) {
  if (matches.length !== expectedGroupFixtureCount(realTeamCount)) {
    throw new GroupFixtureError('invalid_group_fixture', 'Quantidade de fixtures do grupo esta incorreta.');
  }

  const teamIds = new Set(teams.map((team) => team.id));
  const ids = new Set<string>();
  const pairs = new Set<string>();
  const roundUsage = new Map<number, Set<string>>();

  for (const match of matches) {
    if (ids.has(match.id)) {
      throw new GroupFixtureError('invalid_group_fixture', 'ID de fixture duplicado.');
    }
    ids.add(match.id);

    if (match.championshipId !== championshipId || match.stage !== 'group' || match.groupId !== groupId) {
      throw new GroupFixtureError('invalid_group_fixture', 'Fixture pertence a escopo incorreto.');
    }
    if (!teamIds.has(match.homeTeamId) || !teamIds.has(match.awayTeamId)) {
      throw new GroupFixtureError('invalid_group_fixture', 'Fixture contem time fora do grupo.');
    }
    if (match.homeTeamId === match.awayTeamId) {
      throw new GroupFixtureError('invalid_group_fixture', 'Fixture de grupo nao pode ter self-match.');
    }

    const expectedId = getGroupFixtureId(championshipId, groupId, match.homeTeamId, match.awayTeamId);
    if (match.id !== expectedId) {
      throw new GroupFixtureError('invalid_group_fixture', 'ID de fixture nao corresponde ao par de times.');
    }

    const pair = [match.homeTeamId, match.awayTeamId].sort().join(':');
    if (pairs.has(pair)) {
      throw new GroupFixtureError('invalid_group_fixture', 'Par duplicado em fixture de grupo.');
    }
    pairs.add(pair);

    const round = match.groupRound ?? match.round;
    const usage = roundUsage.get(round) ?? new Set<string>();
    if (usage.has(match.homeTeamId) || usage.has(match.awayTeamId)) {
      throw new GroupFixtureError('invalid_group_fixture', 'Time aparece mais de uma vez na mesma rodada.');
    }
    usage.add(match.homeTeamId);
    usage.add(match.awayTeamId);
    roundUsage.set(round, usage);
  }
}
