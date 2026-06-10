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

// Status que NÃO ocupam vaga nem contam como vínculo atual com o time.
// 'sem_time' permanece com o teamId antigo no documento (as rules impedem o
// atleta de limpar o próprio teamId ao sair), então o status é a ÚNICA fonte
// confiável para saber se o vínculo ainda existe.
const INACTIVE_ROSTER_STATUSES: Array<Player['status']> = ['sem_time', 'removido'];

/**
 * Atleta que pertence ao elenco ATUAL (ocupa vaga). Inclui suspenso/lesionado;
 * exclui quem saiu ('sem_time') ou foi removido ('removido').
 */
export function isActiveRosterPlayer(player: Pick<Player, 'status'>): boolean {
  return !INACTIVE_ROSTER_STATUSES.includes(player.status);
}

/** Vínculo ATUAL do atleta com um time específico (teamId + status ativo). */
export function isPlayerInTeamActive(player: Player, teamId: string): boolean {
  return player.teamId === teamId && isActiveRosterPlayer(player);
}

export function isDuplicatePlayerInTeam(
  players: Player[],
  playerId: string,
  teamId: string,
): boolean {
  return players.some((p) => p.id === playerId && isPlayerInTeamActive(p, teamId));
}

export function isPlayerActiveInTeam(
  players: Player[],
  playerId: string,
  teamId: string,
): boolean {
  return players.some((p) => p.id === playerId && isPlayerInTeamActive(p, teamId));
}

export function isTeamFull(players: Player[], maxPlayers: number): boolean {
  const active = players.filter(isActiveRosterPlayer);
  return active.length >= maxPlayers;
}

export function countActivePlayersInTeam(players: Player[], teamId: string): number {
  return players.filter((p) => isPlayerInTeamActive(p, teamId)).length;
}

export function isPlayerActive(player: Player): boolean {
  return !player.status || player.status === 'ativo';
}
