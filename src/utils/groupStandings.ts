import type {
  ChampionshipRules,
  GroupStandingRow,
  GroupTiebreakReason,
  MatchEvent,
  MatchModel,
  Team,
} from '../types';
import { activeMatchEvents, matchCountsForStandings } from './matchRules';
import { normalizeGroupId } from './groupStageStructure';

export type GroupStandingsErrorCode =
  | 'duplicate_team_id'
  | 'group_missing'
  | 'group_match_cross_group'
  | 'group_match_team_outside_group'
  | 'group_match_missing_stage'
  | 'invalid_score'
  | 'walkover_missing_winner'
  | 'conflicting_result'
  | 'group_match_missing_group_id';

export class GroupStandingsError extends Error {
  code: GroupStandingsErrorCode;

  constructor(code: GroupStandingsErrorCode, message: string) {
    super(message);
    this.name = 'GroupStandingsError';
    this.code = code;
  }
}

export interface CalculateGroupStandingsInput {
  championshipId: string;
  groupId: string;
  teams: Team[];
  matches: MatchModel[];
  events?: MatchEvent[];
  rules: ChampionshipRules;
  qualifiersPerGroup?: number;
}

export type AllGroupStandings = Record<'A' | 'B', GroupStandingRow[]>;

const TIEBREAKERS: GroupTiebreakReason['type'][] = [
  'points',
  'wins',
  'goal_difference',
  'goals_for',
  'head_to_head',
  'fewest_cards',
  'deterministic_draw',
];

type MutableRow = GroupStandingRow & {
  deterministicSeed: string;
};

type H2hStats = {
  points: number;
  wins: number;
  goalDifference: number;
  goalsFor: number;
};

export function calculateGroupStandings(
  input: CalculateGroupStandingsInput,
): GroupStandingRow[] {
  const groupLabel = normalizeGroupId(input.groupId, input.championshipId);
  if (!groupLabel) {
    throw new GroupStandingsError('group_missing', 'Grupo invalido para classificacao.');
  }

  const groupTeams = normalizeGroupTeams(input.teams, input.championshipId, groupLabel);
  const groupTeamIds = new Set(groupTeams.map((team) => team.id));
  const rowsByTeam = buildInitialRows(input.championshipId, groupLabel, groupTeams);
  const countedMatches = getCountedGroupMatches(input, groupLabel, groupTeamIds);

  for (const match of countedMatches) {
    applyMatchToRows(match, rowsByTeam, input.rules);
  }

  applyCardsToRows(input.events ?? [], countedMatches, rowsByTeam);

  for (const row of rowsByTeam.values()) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
    row.cards = row.yellowCards + row.redCards;
  }

  const ordered = sortRows(Array.from(rowsByTeam.values()), countedMatches, input.rules, input.championshipId, groupLabel);
  applyPositionsAndQualification(
    ordered,
    input.matches,
    groupTeamIds,
    input.championshipId,
    groupLabel,
    input.qualifiersPerGroup,
  );
  return ordered.map((row) => {
    const output: Partial<MutableRow> = { ...row };
    delete output.deterministicSeed;
    return output as GroupStandingRow;
  });
}

export function getGroupStandings(input: CalculateGroupStandingsInput): GroupStandingRow[] {
  return calculateGroupStandings(input);
}

export function getAllGroupStandings(
  input: Omit<CalculateGroupStandingsInput, 'groupId'>,
): AllGroupStandings {
  return {
    A: calculateGroupStandings({ ...input, groupId: 'A' }),
    B: calculateGroupStandings({ ...input, groupId: 'B' }),
  };
}

export function getGroupLeader(rows: GroupStandingRow[]): GroupStandingRow | null {
  return rows[0] ?? null;
}

export function getProvisionalQualifiers(rows: GroupStandingRow[]): GroupStandingRow[] {
  return rows.filter((row) => row.qualifiedStatus === 'qualified');
}

function normalizeGroupTeams(
  teams: Team[],
  championshipId: string,
  groupLabel: 'A' | 'B',
): Team[] {
  const seen = new Set<string>();
  const groupTeams: Team[] = [];

  for (const team of teams) {
    if (seen.has(team.id)) {
      throw new GroupStandingsError('duplicate_team_id', 'Time duplicado na classificacao.');
    }
    seen.add(team.id);

    if (team.status !== undefined && team.status !== 'aprovado') continue;
    const teamGroup = normalizeGroupId(team.groupId, championshipId);
    if (teamGroup === groupLabel) groupTeams.push(team);
  }

  if (groupTeams.length === 0) {
    throw new GroupStandingsError('group_missing', 'Grupo sem times para classificacao.');
  }

  return groupTeams.sort((a, b) => {
    const seedDiff = (a.groupSeed ?? Number.MAX_SAFE_INTEGER) - (b.groupSeed ?? Number.MAX_SAFE_INTEGER);
    return seedDiff !== 0 ? seedDiff : a.id.localeCompare(b.id);
  });
}

function buildInitialRows(
  championshipId: string,
  groupLabel: 'A' | 'B',
  teams: Team[],
): Map<string, MutableRow> {
  const rows = new Map<string, MutableRow>();
  for (const team of teams) {
    rows.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      primaryColor: team.primaryColor,
      groupId: groupLabel,
      position: 0,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      woFor: 0,
      woAgainst: 0,
      cards: 0,
      yellowCards: 0,
      redCards: 0,
      qualifiedStatus: 'undecided',
      deterministicSeed: deterministicSortKey(`${championshipId}|${groupLabel}|${team.id}`),
    });
  }
  return rows;
}

function getCountedGroupMatches(
  input: CalculateGroupStandingsInput,
  groupLabel: 'A' | 'B',
  groupTeamIds: Set<string>,
): MatchModel[] {
  const counted: MatchModel[] = [];
  const seen = new Set<string>();

  for (const match of input.matches) {
    if (match.championshipId !== input.championshipId) continue;

    const normalizedGroup = normalizeGroupId(match.groupId, input.championshipId);
    const isGroupCandidate = match.stage === 'group' || normalizedGroup != null;
    if (!isGroupCandidate) continue;

    if (!match.stage) {
      throw new GroupStandingsError('group_match_missing_stage', 'Partida de grupo precisa de stage explicito.');
    }
    if (!normalizedGroup) {
      throw new GroupStandingsError('group_match_missing_group_id', 'Partida de grupo precisa de groupId.');
    }
    if (normalizedGroup !== groupLabel) continue;

    if (!groupTeamIds.has(match.homeTeamId) || !groupTeamIds.has(match.awayTeamId)) {
      throw new GroupStandingsError('group_match_team_outside_group', 'Partida contem time fora do grupo.');
    }
    if (match.homeTeamId === match.awayTeamId) {
      throw new GroupStandingsError('conflicting_result', 'Partida nao pode ter o mesmo time nos dois lados.');
    }

    if (!matchCountsForStandings(match.status)) continue;
    validateScore(match);

    if (match.status === 'wo') {
      if (!match.winnerId || (match.winnerId !== match.homeTeamId && match.winnerId !== match.awayTeamId)) {
        throw new GroupStandingsError('walkover_missing_winner', 'W.O. precisa de vencedor valido.');
      }
    }

    if (seen.has(match.id)) {
      throw new GroupStandingsError('conflicting_result', 'Partida duplicada na classificacao.');
    }
    seen.add(match.id);
    counted.push(match);
  }

  return counted;
}

function validateScore(match: MatchModel) {
  if (
    !Number.isInteger(match.homeScore) ||
    !Number.isInteger(match.awayScore) ||
    (match.homeScore ?? -1) < 0 ||
    (match.awayScore ?? -1) < 0
  ) {
    throw new GroupStandingsError('invalid_score', 'Placar invalido para partida resolvida.');
  }
}

function applyMatchToRows(
  match: MatchModel,
  rowsByTeam: Map<string, MutableRow>,
  rules: ChampionshipRules,
) {
  const home = rowsByTeam.get(match.homeTeamId)!;
  const away = rowsByTeam.get(match.awayTeamId)!;
  const homeScore = match.homeScore ?? 0;
  const awayScore = match.awayScore ?? 0;

  home.played += 1;
  away.played += 1;
  home.goalsFor += homeScore;
  home.goalsAgainst += awayScore;
  away.goalsFor += awayScore;
  away.goalsAgainst += homeScore;

  if (match.status === 'wo' && match.winnerId) {
    rowsByTeam.get(match.winnerId)!.woFor += 1;
    rowsByTeam.get(match.winnerId === match.homeTeamId ? match.awayTeamId : match.homeTeamId)!.woAgainst += 1;
  }

  if (homeScore > awayScore) {
    home.wins += 1;
    home.points += rules.pointsWin;
    away.losses += 1;
    away.points += rules.pointsLoss;
  } else if (awayScore > homeScore) {
    away.wins += 1;
    away.points += rules.pointsWin;
    home.losses += 1;
    home.points += rules.pointsLoss;
  } else {
    home.draws += 1;
    away.draws += 1;
    home.points += rules.pointsDraw;
    away.points += rules.pointsDraw;
  }
}

function applyCardsToRows(
  events: MatchEvent[],
  countedMatches: MatchModel[],
  rowsByTeam: Map<string, MutableRow>,
) {
  const countedMatchIds = new Set(countedMatches.map((match) => match.id));
  for (const event of activeMatchEvents(events)) {
    if (!countedMatchIds.has(event.matchId)) continue;
    const row = rowsByTeam.get(event.teamId);
    if (!row) continue;
    if (event.type === 'cartao_amarelo') row.yellowCards += 1;
    if (event.type === 'cartao_vermelho') row.redCards += 1;
  }
}

function sortRows(
  rows: MutableRow[],
  matches: MatchModel[],
  rules: ChampionshipRules,
  championshipId: string,
  groupLabel: 'A' | 'B',
): MutableRow[] {
  return sortGroup(rows, 0, matches, rules, championshipId, groupLabel);
}

function sortGroup(
  rows: MutableRow[],
  criterionIndex: number,
  matches: MatchModel[],
  rules: ChampionshipRules,
  championshipId: string,
  groupLabel: 'A' | 'B',
): MutableRow[] {
  if (rows.length <= 1 || criterionIndex >= TIEBREAKERS.length) return rows;

  const criterion = TIEBREAKERS[criterionIndex];
  const buckets = new Map<string, MutableRow[]>();
  for (const row of rows) {
    const key = metricKey(criterion, row, rows, matches, rules, championshipId, groupLabel);
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }

  const orderedBuckets = Array.from(buckets.entries()).sort((a, b) =>
    compareMetricKeys(criterion, a[0], b[0]),
  );

  const criterionSplit = orderedBuckets.length > 1;
  return orderedBuckets.flatMap(([, bucket]) => {
    if (criterionSplit) {
      for (const row of bucket) row.tiebreakReason = { type: criterion };
    }
    if (bucket.length === 1) return bucket;
    return sortGroup(bucket, criterionIndex + 1, matches, rules, championshipId, groupLabel);
  });
}

function metricKey(
  criterion: GroupTiebreakReason['type'],
  row: MutableRow,
  tiedRows: MutableRow[],
  matches: MatchModel[],
  rules: ChampionshipRules,
  championshipId: string,
  groupLabel: 'A' | 'B',
): string {
  if (criterion === 'points') return String(row.points);
  if (criterion === 'wins') return String(row.wins);
  if (criterion === 'goal_difference') return String(row.goalDifference);
  if (criterion === 'goals_for') return String(row.goalsFor);
  if (criterion === 'fewest_cards') return String(row.cards);
  if (criterion === 'deterministic_draw') {
    return `${row.deterministicSeed}:${championshipId}:${groupLabel}:${row.teamId}`;
  }

  const h2h = buildHeadToHeadTable(tiedRows, matches, rules).get(row.teamId)!;
  return [h2h.points, h2h.wins, h2h.goalDifference, h2h.goalsFor].join('|');
}

function compareMetricKeys(criterion: GroupTiebreakReason['type'], left: string, right: string): number {
  if (criterion === 'deterministic_draw') return left.localeCompare(right);
  if (criterion === 'head_to_head') {
    const leftParts = left.split('|').map(Number);
    const rightParts = right.split('|').map(Number);
    for (let index = 0; index < leftParts.length; index += 1) {
      if (rightParts[index] !== leftParts[index]) return rightParts[index] - leftParts[index];
    }
    return 0;
  }
  const leftValue = Number(left);
  const rightValue = Number(right);
  return criterion === 'fewest_cards' ? leftValue - rightValue : rightValue - leftValue;
}

function buildHeadToHeadTable(
  rows: MutableRow[],
  matches: MatchModel[],
  rules: ChampionshipRules,
): Map<string, H2hStats> {
  const ids = new Set(rows.map((row) => row.teamId));
  const table = new Map<string, H2hStats>();
  for (const row of rows) {
    table.set(row.teamId, { points: 0, wins: 0, goalDifference: 0, goalsFor: 0 });
  }

  for (const match of matches) {
    if (!ids.has(match.homeTeamId) || !ids.has(match.awayTeamId)) continue;
    const home = table.get(match.homeTeamId)!;
    const away = table.get(match.awayTeamId)!;
    const homeScore = match.homeScore ?? 0;
    const awayScore = match.awayScore ?? 0;

    home.goalsFor += homeScore;
    away.goalsFor += awayScore;
    home.goalDifference += homeScore - awayScore;
    away.goalDifference += awayScore - homeScore;

    if (homeScore > awayScore) {
      home.points += rules.pointsWin;
      home.wins += 1;
      away.points += rules.pointsLoss;
    } else if (awayScore > homeScore) {
      away.points += rules.pointsWin;
      away.wins += 1;
      home.points += rules.pointsLoss;
    } else {
      home.points += rules.pointsDraw;
      away.points += rules.pointsDraw;
    }
  }

  return table;
}

function applyPositionsAndQualification(
  rows: MutableRow[],
  allMatches: MatchModel[],
  groupTeamIds: Set<string>,
  championshipId: string,
  groupLabel: 'A' | 'B',
  qualifiersPerGroup = 1,
) {
  const resolved = isGroupFullyResolved(allMatches, groupTeamIds, championshipId, groupLabel);
  rows.forEach((row, index) => {
    row.position = index + 1;
    row.qualifiedStatus = resolved
      ? index < qualifiersPerGroup
        ? 'qualified'
        : 'not_qualified'
      : 'undecided';
    if (!row.tiebreakReason) row.tiebreakReason = { type: 'points' };
  });
}

function isGroupFullyResolved(
  matches: MatchModel[],
  groupTeamIds: Set<string>,
  championshipId: string,
  groupLabel: 'A' | 'B',
): boolean {
  const expected = (groupTeamIds.size * (groupTeamIds.size - 1)) / 2;
  let settled = 0;
  const pairs = new Set<string>();

  for (const match of matches) {
    if (normalizeGroupId(match.groupId, championshipId) !== groupLabel) continue;
    if (!groupTeamIds.has(match.homeTeamId) || !groupTeamIds.has(match.awayTeamId)) continue;
    const pair = [match.homeTeamId, match.awayTeamId].sort().join(':');
    if (pairs.has(pair)) continue;
    pairs.add(pair);
    if (match.status === 'finalizado' || match.status === 'wo' || match.status === 'cancelado') {
      settled += 1;
    }
  }

  return settled === expected && expected > 0;
}

function deterministicSortKey(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
