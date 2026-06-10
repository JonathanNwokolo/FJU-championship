import { Player, Team } from '../types';

export type ValidationResult = { valid: boolean; error?: string };

export function validateTeamName(name: string): ValidationResult {
  if (!name || name.trim() === '') {
    return { valid: false, error: 'nome_obrigatorio' };
  }
  if (name.trim().length < 2) {
    return { valid: false, error: 'nome_muito_curto' };
  }
  return { valid: true };
}

export function isTeamCaptain(userId: string, team: Pick<Team, 'captainId'>): boolean {
  return team.captainId === userId;
}

export function isDuplicatePlayerInTeam(
  players: Player[],
  playerId: string,
  teamId: string,
): boolean {
  return players.some(
    (p) => p.id === playerId && p.teamId === teamId && p.status !== 'removido',
  );
}

export function isPlayerActiveInTeam(
  players: Player[],
  playerId: string,
  teamId: string,
): boolean {
  return players.some(
    (p) => p.id === playerId && p.teamId === teamId && p.status !== 'removido',
  );
}

export function isTeamFull(players: Player[], maxPlayers: number): boolean {
  const active = players.filter((p) => p.status !== 'removido');
  return active.length >= maxPlayers;
}

export function countActivePlayersInTeam(players: Player[], teamId: string): number {
  return players.filter((p) => p.teamId === teamId && p.status !== 'removido').length;
}

export function isPlayerActive(player: Player): boolean {
  return !player.status || player.status === 'ativo';
}
