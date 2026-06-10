import { Championship, Team } from '../types';
import { isRegistrationDeadlinePassed, isRegistrationOpen } from './championshipStatus';

export type RegistrationCheck = { allowed: boolean; reason?: string };

export function isTeamAlreadyRegistered(teams: Team[], teamId: string): boolean {
  return teams.some((t) => t.id === teamId);
}

export function isTeamRejectedFromChampionship(team: Pick<Team, 'status'>): boolean {
  return team.status === 'rejeitado';
}

export function canTeamJoinChampionship(
  championship: Pick<
    Championship,
    'status' | 'registrationsClosed' | 'registrationDeadline' | 'maxTeams'
  >,
  team: Pick<Team, 'id' | 'status'>,
  allRegisteredTeams: Team[],
  now: Date = new Date(),
): RegistrationCheck {
  if (!isRegistrationOpen(championship)) {
    return { allowed: false, reason: 'inscricoes_fechadas' };
  }
  if (isRegistrationDeadlinePassed(championship, now)) {
    return { allowed: false, reason: 'prazo_expirado' };
  }
  if (isTeamRejectedFromChampionship(team)) {
    return { allowed: false, reason: 'time_rejeitado' };
  }
  if (isTeamAlreadyRegistered(allRegisteredTeams, team.id)) {
    return { allowed: false, reason: 'ja_inscrito' };
  }
  if (
    championship.maxTeams !== undefined &&
    championship.maxTeams !== null &&
    allRegisteredTeams.length >= championship.maxTeams
  ) {
    return { allowed: false, reason: 'limite_times_atingido' };
  }
  return { allowed: true };
}
