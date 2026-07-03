import { Team, MatchModel, BracketRound } from '../types';

export function generateRoundRobin(teamIds: string[]): Array<Array<[string, string]>> {
  const teams = [...teamIds];
  if (teams.length % 2 !== 0) teams.push('BYE');
  const n = teams.length;
  const rounds: Array<Array<[string, string]>> = [];

  for (let round = 0; round < n - 1; round++) {
    const matches: Array<[string, string]> = [];
    for (let i = 0; i < n / 2; i++) {
      const home = teams[i];
      const away = teams[n - 1 - i];
      if (home !== 'BYE' && away !== 'BYE') {
        matches.push([home, away]);
      }
    }
    rounds.push(matches);
    // rotate teams keeping first fixed
    teams.splice(1, 0, teams.pop()!);
  }

  return rounds;
}

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uniqueTeamsById(teams: Team[]): Team[] {
  const seen = new Set<string>();
  return teams.filter((team) => {
    if (!team.id || seen.has(team.id)) return false;
    seen.add(team.id);
    return true;
  });
}

function makeId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Retorna o nome da fase do bracket baseado no número de times
 */
function getBracketRoundName(teamsInRound: number): BracketRound {
  if (teamsInRound === 2) return 'final';
  if (teamsInRound === 4) return 'semi';
  if (teamsInRound === 8) return 'quartas';
  if (teamsInRound === 16) return 'oitavas';
  if (teamsInRound === 32) return 'fase_16';
  return 'fase_32';
}

/**
 * Retorna label legível para a fase do bracket
 */
export function getBracketRoundLabel(bracketRound: BracketRound): string {
  const labels: Record<BracketRound, string> = {
    final: 'Final',
    semi: 'Semifinais',
    quartas: 'Quartas de Final',
    oitavas: 'Oitavas de Final',
    fase_16: 'Fase de 16',
    fase_32: 'Fase de 32',
    grupo: 'Fase de Grupos',
  };
  return labels[bracketRound];
}

/**
 * Calcula o número de rodadas necessárias para o bracket
 */
function calculateBracketRounds(numTeams: number): number {
  return Math.ceil(Math.log2(numTeams));
}

/**
 * Ordem de chaveamento padrão (standard seeding) para um bracket de tamanho `size`
 * (potência de 2). Retorna os "seeds" (1-indexed) na ordem linear dos slots do
 * primeiro round, de forma que seed 1 enfrente o pior seed, etc.
 *   size 2 → [1,2]
 *   size 4 → [1,4,2,3]
 *   size 8 → [1,8,4,5,2,7,3,6]
 *
 * AUD/P-03: quando o nº de times não é potência de 2, os seeds inexistentes
 * (maiores que numTeams) viram BYE. Distribuir os times por esta ordem garante que
 * cada BYE caia em um confronto separado (pareando com um time real, que avança),
 * em vez de gerar partidas vazio×vazio e travar o bracket.
 */
export function seedOrder(size: number): number[] {
  let seeds = [1, 2];
  while (seeds.length < size) {
    const sum = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const s of seeds) {
      next.push(s);
      next.push(sum - s);
    }
    seeds = next;
  }
  return seeds;
}

interface GenerateBracketFixturesOptions {
  shuffle?: boolean;
  makeId?: () => string;
}

type BracketEntrant = {
  teamId: string | null;
  sourceMatch: MatchModel | null;
} | null;

/**
 * Gera fixtures para formato mata-mata (eliminacao direta).
 *
 * BYEs sao avancos estruturais: eles preenchem o slot seguinte sem criar
 * documento de partida, sem placar artificial e sem aumentar o total N - 1.
 */
export function generateBracketFixtures(
  teams: Team[],
  championshipId: string,
  options: GenerateBracketFixturesOptions = {},
): MatchModel[] {
  const uniqueTeams = uniqueTeamsById(teams);
  if (uniqueTeams.length < 2) return [];

  const orderedTeams = options.shuffle === false ? uniqueTeams : fisherYates(uniqueTeams);
  const createId = options.makeId ?? makeId;
  const result: MatchModel[] = [];

  const numTeams = orderedTeams.length;
  const totalRounds = calculateBracketRounds(numTeams);
  const bracketSize = Math.pow(2, totalRounds);
  const slots = seedOrder(bracketSize).map((seed) =>
    seed - 1 < orderedTeams.length ? orderedTeams[seed - 1].id : null,
  );

  const buildNode = (start: number, size: number): BracketEntrant => {
    if (size === 1) {
      const teamId = slots[start];
      return teamId ? { teamId, sourceMatch: null } : null;
    }

    const half = size / 2;
    const left = buildNode(start, half);
    const right = buildNode(start + half, half);

    if (!left) return right;
    if (!right) return left;

    const round = Math.log2(size);
    const teamsInRound = bracketSize / Math.pow(2, round - 1);
    const bracketPosition = start / size;

    const match: MatchModel = {
      id: createId(),
      championshipId,
      round,
      homeTeamId: left.sourceMatch ? '' : left.teamId ?? '',
      awayTeamId: right.sourceMatch ? '' : right.teamId ?? '',
      homeScore: null,
      awayScore: null,
      status: 'agendado',
      bracketRound: getBracketRoundName(teamsInRound),
      bracketPosition,
      nextMatchId: null,
      winnerId: null,
    };

    if (left.sourceMatch) {
      left.sourceMatch.nextMatchId = match.id;
    }
    if (right.sourceMatch) {
      right.sourceMatch.nextMatchId = match.id;
    }

    result.push(match);
    return { teamId: null, sourceMatch: match };
  };

  buildNode(0, bracketSize);

  return result.sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    return (a.bracketPosition ?? 0) - (b.bracketPosition ?? 0);
  });
}
/**
 * Atualiza o bracket após uma partida ser finalizada
 * Retorna o match atualizado da próxima fase (se houver)
 */
export function processKnockoutResult(
  matches: MatchModel[],
  finishedMatch: MatchModel,
  winnerId: string,
): { updatedNextMatch: MatchModel | null; isFinal: boolean } {
  if (!finishedMatch.nextMatchId) {
    // Era a final
    return { updatedNextMatch: null, isFinal: true };
  }

  const nextMatch = matches.find((m) => m.id === finishedMatch.nextMatchId);
  if (!nextMatch) {
    return { updatedNextMatch: null, isFinal: false };
  }

  // Atualizar a próxima partida com o vencedor
  const bracketPos = finishedMatch.bracketPosition ?? 0;
  if (bracketPos % 2 === 0) {
    nextMatch.homeTeamId = winnerId;
  } else {
    nextMatch.awayTeamId = winnerId;
  }

  return { updatedNextMatch: nextMatch, isFinal: false };
}

/**
 * Gera fixtures para pontos corridos
 */
export function generateRoundRobinFixtures(
  teams: Team[],
  championshipId: string,
): MatchModel[] {
  const shuffled = fisherYates(uniqueTeamsById(teams));
  if (shuffled.length < 2) return [];

  const list: Array<Team | null> = [...shuffled];
  if (list.length % 2 !== 0) list.push(null); // BYE slot

  const n = list.length;
  const result: MatchModel[] = [];

  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (!a || !b) continue; // skip BYE

      // Alternate home/away by round parity
      const home = round % 2 === 0 ? a : b;
      const away = round % 2 === 0 ? b : a;
      if (home.id === away.id) continue;

      result.push({
        id: makeId(),
        championshipId,
        round: round + 1,
        homeTeamId: home.id,
        awayTeamId: away.id,
        homeScore: null,
        awayScore: null,
        status: 'agendado',
      });
    }
    // Classic rotation: fix index 0, rotate the rest
    list.splice(1, 0, list.pop()!);
  }

  return result;
}

/**
 * Gera fixtures para grupos + mata-mata
 */
export function generateGroupStageFixtures(
  teams: Team[],
  championshipId: string,
  numGroups: number = 2,
): { groupMatches: MatchModel[]; groups: Record<string, Team[]> } {
  const shuffled = fisherYates(uniqueTeamsById(teams));
  const groups: Record<string, Team[]> = {};
  const groupMatches: MatchModel[] = [];

  // Distribuir times nos grupos
  const groupLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].slice(0, numGroups);
  for (let i = 0; i < numGroups; i++) {
    groups[groupLabels[i]] = [];
  }

  shuffled.forEach((team, index) => {
    const groupIndex = index % numGroups;
    groups[groupLabels[groupIndex]].push(team);
  });

  // Gerar partidas dentro de cada grupo (todos contra todos)
  for (const groupId of groupLabels) {
    const groupTeams = groups[groupId];
    const list: Array<Team | null> = [...groupTeams];
    if (list.length % 2 !== 0) list.push(null);

    const n = list.length;
    for (let round = 0; round < n - 1; round++) {
      for (let i = 0; i < n / 2; i++) {
        const a = list[i];
        const b = list[n - 1 - i];
        if (!a || !b) continue;

        const home = round % 2 === 0 ? a : b;
        const away = round % 2 === 0 ? b : a;
        if (home.id === away.id) continue;

        groupMatches.push({
          id: makeId(),
          championshipId,
          round: round + 1,
          homeTeamId: home.id,
          awayTeamId: away.id,
          homeScore: null,
          awayScore: null,
          status: 'agendado',
          groupId,
          bracketRound: 'grupo',
        });
      }
      list.splice(1, 0, list.pop()!);
    }
  }

  return { groupMatches, groups };
}

/**
 * Calcula classificados de cada grupo
 */
export function getGroupClassified(
  matches: MatchModel[],
  groups: Record<string, Team[]>,
  classifiedPerGroup: number = 2,
): Team[] {
  const classified: Team[] = [];

  for (const [groupId, groupTeams] of Object.entries(groups)) {
    const groupMatches = matches.filter((m) => m.groupId === groupId && m.status === 'finalizado');

    // Calcular pontos por time
    const standings = groupTeams.map((team) => {
      let points = 0;
      let goalDiff = 0;
      let goalsFor = 0;

      for (const match of groupMatches) {
        if (match.homeTeamId === team.id) {
          const hs = match.homeScore ?? 0;
          const as = match.awayScore ?? 0;
          goalsFor += hs;
          goalDiff += hs - as;
          if (hs > as) points += 3;
          else if (hs === as) points += 1;
        } else if (match.awayTeamId === team.id) {
          const hs = match.homeScore ?? 0;
          const as = match.awayScore ?? 0;
          goalsFor += as;
          goalDiff += as - hs;
          if (as > hs) points += 3;
          else if (as === hs) points += 1;
        }
      }

      return { team, points, goalDiff, goalsFor };
    });

    // Ordenar por pontos, saldo, gols
    standings.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
      return b.goalsFor - a.goalsFor;
    });

    // Adicionar classificados
    for (let i = 0; i < classifiedPerGroup && i < standings.length; i++) {
      classified.push(standings[i].team);
    }
  }

  return classified;
}
