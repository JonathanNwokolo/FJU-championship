import { Championship, ChampionshipRules, MatchEvent, MatchModel, Team } from '../types';
import { calculateStandings } from '../services/statsService';

export const defaultChampionshipRules: ChampionshipRules = {
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  tiebreakers: ['saldo_gols', 'gols_pro'],
  fairPlay: false,
  craqueDaRodada: false,
};

export function calculateChampionshipStandings(
  matches: MatchModel[],
  teams: Team[],
  rules: ChampionshipRules = defaultChampionshipRules,
  events: MatchEvent[] = [],
) {
  return calculateStandings(matches, events, teams, rules);
}

export function isTeamApproved(team: Pick<Team, 'status'>): boolean {
  return team.status === 'aprovado';
}

export function canTeamParticipate(team: Pick<Team, 'status'>): boolean {
  return isTeamApproved(team);
}

export function isTeamPending(team: Pick<Team, 'status'>): boolean {
  return team.status === 'pendente';
}

export function isTeamRejected(team: Pick<Team, 'status'>): boolean {
  return team.status === 'rejeitado';
}

export function canCaptainViewRegistrationStatus(
  captainId: string,
  team: Pick<Team, 'captainId' | 'championshipId'>,
  championship: Pick<Championship, 'id'>,
): boolean {
  return team.captainId === captainId && team.championshipId === championship.id;
}
