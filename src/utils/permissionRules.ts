import { AppUser, Championship, Team } from '../types';

export function canCreateChampionship(user: Pick<AppUser, 'role'> | null): boolean {
  return user?.role === 'organizador';
}

export function canManageChampionship(
  user: Pick<AppUser, 'id' | 'role'> | null,
  championship: Pick<Championship, 'organizerId'>,
): boolean {
  return user?.role === 'organizador' && user.id === championship.organizerId;
}

export function canSubmitMatchScore(
  user: Pick<AppUser, 'id' | 'role'> | null,
  championship: Pick<Championship, 'organizerId'>,
): boolean {
  return canManageChampionship(user, championship);
}

export function canCaptainManageTeam(
  user: Pick<AppUser, 'id' | 'role'> | null,
  team: Pick<Team, 'captainId'>,
): boolean {
  return user?.role === 'capitao' && user.id === team.captainId;
}

export function canCaptainRegisterTeam(
  user: Pick<AppUser, 'id' | 'role'> | null,
  team: Pick<Team, 'captainId'>,
): boolean {
  return canCaptainManageTeam(user, team);
}

export function canApproveTeam(
  user: Pick<AppUser, 'id' | 'role'> | null,
  championship: Pick<Championship, 'organizerId'>,
): boolean {
  return canManageChampionship(user, championship);
}

export function canViewChampionshipData(user: Pick<AppUser, 'role'> | null): boolean {
  return user != null;
}
