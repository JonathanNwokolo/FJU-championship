import type { GroupAssignment, GroupDistributionResult } from '../types';
import { getGroupId } from './groupStageIds';
import { MIN_APPROVED_TEAMS_FOR_GROUPS, SUPPORTED_GROUP_COUNT } from './groupStageRules';
import { MIN_TEAMS_PER_GROUP } from './groupStageStructure';

export const GROUP_DISTRIBUTION_ALGORITHM_VERSION = 1 as const;

export interface GroupDistributionInput {
  championshipId: string;
  teamIds: string[];
  drawSeed: string;
  groupCount?: 2;
  generationVersion?: number;
}

export type GroupDistributionErrorCode =
  | 'invalid_group_count'
  | 'insufficient_teams_for_groups'
  | 'invalid_group_assignment'
  | 'duplicate_team_id'
  | 'invalid_team';

export class GroupDistributionError extends Error {
  code: GroupDistributionErrorCode;

  constructor(code: GroupDistributionErrorCode, message: string) {
    super(message);
    this.name = 'GroupDistributionError';
    this.code = code;
  }
}

export function distributeTeamsIntoGroups(
  input: GroupDistributionInput,
): GroupDistributionResult {
  const groupCount = input.groupCount ?? SUPPORTED_GROUP_COUNT;
  if (groupCount !== SUPPORTED_GROUP_COUNT) {
    throw new GroupDistributionError('invalid_group_count', 'Este bloco suporta exatamente 2 grupos.');
  }

  const championshipId = input.championshipId.trim();
  const drawSeed = input.drawSeed.trim();
  if (!championshipId || !drawSeed) {
    throw new GroupDistributionError('invalid_team', 'Campeonato e seed sao obrigatorios.');
  }

  assertValidTeamIds(input.teamIds);
  if (input.teamIds.length < MIN_APPROVED_TEAMS_FOR_GROUPS) {
    throw new GroupDistributionError(
      'insufficient_teams_for_groups',
      'A fase de grupos exige pelo menos 4 times aprovados.',
    );
  }

  const orderedIds = [...input.teamIds].sort((a, b) => a.localeCompare(b));
  const shuffledIds = orderedIds.sort((a, b) => {
    const left = deterministicSortKey(championshipId, drawSeed, a);
    const right = deterministicSortKey(championshipId, drawSeed, b);
    return left === right ? a.localeCompare(b) : left.localeCompare(right);
  });

  const groupIds = [getGroupId(championshipId, 'A'), getGroupId(championshipId, 'B')] as const;
  const grouped: [GroupAssignment[], GroupAssignment[]] = [[], []];
  const assignments: GroupAssignment[] = [];

  shuffledIds.forEach((teamId, index) => {
    const groupIndex = index % SUPPORTED_GROUP_COUNT;
    const assignment: GroupAssignment = {
      teamId,
      groupId: groupIds[groupIndex],
      groupSeed: grouped[groupIndex].length + 1,
      assignmentOrder: index + 1,
    };
    grouped[groupIndex].push(assignment);
    assignments.push(assignment);
  });

  validateBalancedGroups(grouped);

  return {
    championshipId,
    generationVersion: input.generationVersion ?? 1,
    algorithmVersion: GROUP_DISTRIBUTION_ALGORITHM_VERSION,
    drawSeed,
    groupA: grouped[0],
    groupB: grouped[1],
    assignments,
  };
}

export function validateGroupDistributionResult(result: GroupDistributionResult): void {
  const seen = new Set<string>();
  for (const assignment of result.assignments) {
    if (!assignment.teamId || !assignment.groupId) {
      throw new GroupDistributionError('invalid_group_assignment', 'Assignment invalido.');
    }
    if (seen.has(assignment.teamId)) {
      throw new GroupDistributionError('duplicate_team_id', 'Time duplicado na distribuicao.');
    }
    seen.add(assignment.teamId);
  }

  if (seen.size !== result.assignments.length) {
    throw new GroupDistributionError('invalid_group_assignment', 'Distribuicao perdeu times.');
  }

  validateBalancedGroups([result.groupA, result.groupB]);
  assertSequentialSeeds(result.groupA);
  assertSequentialSeeds(result.groupB);
}

function assertValidTeamIds(teamIds: string[]) {
  const seen = new Set<string>();
  for (const teamId of teamIds) {
    if (typeof teamId !== 'string' || teamId.trim() !== teamId || teamId.length === 0) {
      throw new GroupDistributionError('invalid_team', 'Todos os times precisam ter ID valido.');
    }
    if (seen.has(teamId)) {
      throw new GroupDistributionError('duplicate_team_id', 'A distribuicao recebeu time duplicado.');
    }
    seen.add(teamId);
  }
}

function validateBalancedGroups(groups: readonly [GroupAssignment[], GroupAssignment[]]) {
  const sizes = groups.map((group) => group.length);
  const smallest = Math.min(...sizes);
  const largest = Math.max(...sizes);

  if (smallest < MIN_TEAMS_PER_GROUP || largest - smallest > 1) {
    throw new GroupDistributionError(
      'invalid_group_assignment',
      'Os grupos devem ter minimo de 2 times e diferenca maxima de 1.',
    );
  }
}

function assertSequentialSeeds(assignments: GroupAssignment[]) {
  assignments.forEach((assignment, index) => {
    if (assignment.groupSeed !== index + 1) {
      throw new GroupDistributionError(
        'invalid_group_assignment',
        'As seeds do grupo precisam ser sequenciais.',
      );
    }
  });
}

function deterministicSortKey(championshipId: string, drawSeed: string, teamId: string): string {
  const source = `${championshipId}|${drawSeed}|${teamId}`;
  return `${fnv1a(source, 0x811c9dc5)}${fnv1a(source, 0x01000193)}`;
}

function fnv1a(value: string, seed: number): string {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
