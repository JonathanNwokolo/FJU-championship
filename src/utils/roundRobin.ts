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
 * Gera fixtures para formato mata-mata (eliminação direta)
 */
export function generateBracketFixtures(
  teams: Team[],
  championshipId: string,
): MatchModel[] {
  const uniqueTeams = uniqueTeamsById(teams);
  if (uniqueTeams.length < 2) return [];

  const shuffled = fisherYates(uniqueTeams);
  const result: MatchModel[] = [];

  // Arredondar para potência de 2 mais próxima (para cima)
  const numTeams = shuffled.length;
  const totalRounds = calculateBracketRounds(numTeams);
  const bracketSize = Math.pow(2, totalRounds);

  // Criar mapa de IDs das partidas por rodada e posição
  const matchIdMap: Record<string, string> = {};

  // Gerar todas as rodadas do bracket (da primeira fase até a final)
  let roundTeamCount = bracketSize;

  for (let roundNum = 1; roundNum <= totalRounds; roundNum++) {
    const matchesInRound = roundTeamCount / 2;
    const bracketRound = getBracketRoundName(roundTeamCount);

    for (let pos = 0; pos < matchesInRound; pos++) {
      const matchId = makeId();
      matchIdMap[`${roundNum}-${pos}`] = matchId;

      // Calcular nextMatchId (partida da próxima rodada)
      let nextMatchId: string | null = null;
      if (roundNum < totalRounds) {
        const nextPos = Math.floor(pos / 2);
        nextMatchId = matchIdMap[`${roundNum + 1}-${nextPos}`] ?? null;
      }

      // Na primeira rodada, atribuir times reais
      // Nas rodadas seguintes, os times serão definidos após as partidas anteriores
      let homeTeamId = '';
      let awayTeamId = '';

      if (roundNum === 1) {
        const homeIndex = pos * 2;
        const awayIndex = pos * 2 + 1;
        homeTeamId = homeIndex < shuffled.length ? shuffled[homeIndex].id : '';
        awayTeamId = awayIndex < shuffled.length ? shuffled[awayIndex].id : '';
      }

      result.push({
        id: matchId,
        championshipId,
        round: roundNum,
        homeTeamId,
        awayTeamId,
        homeScore: null,
        awayScore: null,
        status: 'agendado',
        bracketRound,
        bracketPosition: pos,
        nextMatchId,
        winnerId: null,
      });
    }

    roundTeamCount = roundTeamCount / 2;
  }

  // Atualizar nextMatchId para todas as partidas (segunda passada)
  for (let roundNum = 1; roundNum < totalRounds; roundNum++) {
    const matchesInRound = Math.pow(2, totalRounds - roundNum);
    for (let pos = 0; pos < matchesInRound; pos++) {
      const currentMatchId = matchIdMap[`${roundNum}-${pos}`];
      const nextPos = Math.floor(pos / 2);
      const nextMatchId = matchIdMap[`${roundNum + 1}-${nextPos}`];

      const matchIndex = result.findIndex((m) => m.id === currentMatchId);
      if (matchIndex !== -1 && nextMatchId) {
        result[matchIndex].nextMatchId = nextMatchId;
      }
    }
  }

  // Processar BYEs (times que passam automaticamente)
  const firstRoundMatches = result.filter((m) => m.round === 1);
  for (const match of firstRoundMatches) {
    // Se apenas um time está definido, ele passa automaticamente
    if (match.homeTeamId && !match.awayTeamId) {
      match.winnerId = match.homeTeamId;
      match.status = 'finalizado';
      match.homeScore = 0;
      match.awayScore = 0;
      advanceWinnerToNextMatch(result, match, match.homeTeamId);
    } else if (!match.homeTeamId && match.awayTeamId) {
      match.winnerId = match.awayTeamId;
      match.status = 'finalizado';
      match.homeScore = 0;
      match.awayScore = 0;
      advanceWinnerToNextMatch(result, match, match.awayTeamId);
    } else if (!match.homeTeamId && !match.awayTeamId) {
      // Partida vazia, pode acontecer com brackets incompletos
      match.status = 'finalizado';
    }
  }

  return result;
}

/**
 * Move o vencedor para a próxima partida do bracket
 */
function advanceWinnerToNextMatch(
  matches: MatchModel[],
  currentMatch: MatchModel,
  winnerId: string,
): void {
  if (!currentMatch.nextMatchId) return;

  const nextMatch = matches.find((m) => m.id === currentMatch.nextMatchId);
  if (!nextMatch) return;

  // Determinar se o vencedor vai para home ou away baseado na posição
  const bracketPos = currentMatch.bracketPosition ?? 0;
  if (bracketPos % 2 === 0) {
    nextMatch.homeTeamId = winnerId;
  } else {
    nextMatch.awayTeamId = winnerId;
  }
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
  let roundOffset = 0;
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
