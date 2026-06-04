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

import { Team, MatchModel } from '../types';

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generateRoundRobinFixtures(
  teams: Team[],
  championshipId: string,
): MatchModel[] {
  const shuffled = fisherYates(teams);
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
