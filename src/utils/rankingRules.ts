import {
  MatchEvent,
  Player,
  PlayerDisciplineRanking,
  PlayerScorer,
  RoundAward,
  Team,
} from '../types';
import {
  calculatePlayerDisciplineRanking,
  calculateTopScorers,
} from '../services/statsService';
import { activeMatchEvents } from './matchRules';

export interface PlayerAssistRanking {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  assists: number;
}

export function calculateGoalRanking(
  events: MatchEvent[],
  players: Player[],
  teams: Team[],
): PlayerScorer[] {
  return calculateTopScorers(events, players, teams);
}

export function calculateAssistRanking(
  events: MatchEvent[],
  players: Player[],
  teams: Team[],
): PlayerAssistRanking[] {
  const activeEvents = activeMatchEvents(events);
  const assistMap: Record<
    string,
    { assists: number; teamId: string; snapName?: string; snapTeamName?: string }
  > = {};

  for (const event of activeEvents) {
    if (event.type !== 'assistencia') continue;
    const current = assistMap[event.playerId] ?? { assists: 0, teamId: event.teamId };
    current.assists += 1;
    current.teamId = current.teamId || event.teamId;
    if (!current.snapName && event.playerName) current.snapName = event.playerName;
    if (!current.snapTeamName && event.teamName) current.snapTeamName = event.teamName;
    assistMap[event.playerId] = current;
  }

  return Object.entries(assistMap)
    .map(([playerId, info]) => {
      const player = players.find((item) => item.id === playerId);
      const teamId = player?.teamId ?? info.teamId;
      const team = teams.find((item) => item.id === teamId);
      return {
        playerId,
        playerName: player?.name ?? info.snapName ?? 'Jogador',
        teamId,
        teamName: team?.name ?? info.snapTeamName ?? '',
        teamColor: team?.primaryColor ?? '#888',
        assists: info.assists,
      };
    })
    .sort((a, b) => b.assists - a.assists);
}

export function calculateCardRanking(
  events: MatchEvent[],
  players: Player[],
  teams: Team[],
): PlayerDisciplineRanking[] {
  return calculatePlayerDisciplineRanking(events, players, teams);
}

export function getBestPlayerFromRoundAward(
  award: Pick<RoundAward, 'winnerPlayerId' | 'winnerName' | 'winnerTeamId' | 'totalVotes'> | null,
) {
  if (!award) return null;
  return {
    playerId: award.winnerPlayerId,
    playerName: award.winnerName,
    teamId: award.winnerTeamId,
    votes: award.totalVotes,
  };
}
