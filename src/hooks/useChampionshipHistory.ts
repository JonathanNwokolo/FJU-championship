import { useEffect, useState } from 'react';
import { 
  Championship, 
  Team, 
  Player, 
  MatchModel, 
  MatchEvent,
  ChampionshipResultData,
} from '../types';
import { getCollection, getDocument } from '../services/firestore';
import { useChampionshipStore } from '../stores/championshipStore';
import { useMatchStore } from '../stores/matchStore';
import { useTeamStore } from '../stores/teamStore';

// Re-export for backward compatibility
export type ChampionshipResult = ChampionshipResultData;

export interface PlayerHistory {
  id: string;
  playerId: string;
  userId: string;
  championshipId: string;
  teamId: string;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  matchesPlayed: number;
  finishedAt: string;
}

export function useChampionshipHistory(userId?: string) {
  const championships = useChampionshipStore((s) => s.championships);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<Record<string, ChampionshipResultData>>({});

  // Filter finished championships
  const finishedChampionships = championships.filter((c) => c.status === 'finalizado');

  useEffect(() => {
    const fetchResults = async () => {
      setLoading(true);
      try {
        const resultsData: Record<string, ChampionshipResult> = {};
        
        for (const champ of finishedChampionships) {
          const result = await getDocument<ChampionshipResult>(
            'championship_results',
            champ.id
          );
          if (result) {
            resultsData[champ.id] = result;
          }
        }
        
        setResults(resultsData);
      } catch (error) {
        console.warn('[useChampionshipHistory] Error fetching results:', error);
      } finally {
        setLoading(false);
      }
    };

    if (finishedChampionships.length > 0) {
      fetchResults();
    } else {
      setLoading(false);
    }
  }, [finishedChampionships.length]);

  return {
    championships: finishedChampionships,
    results,
    loading,
  };
}

export function usePlayerHistory(userId: string) {
  const [history, setHistory] = useState<PlayerHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({
    championships: 0,
    goals: 0,
    matchesPlayed: 0,
    yellowCards: 0,
    redCards: 0,
  });

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const data = await getCollection<PlayerHistory>('player_history', [
          { field: 'userId', operator: '==', value: userId },
        ]);
        
        setHistory(data);
        
        // Calculate totals
        const totalsCalc = data.reduce(
          (acc, h) => ({
            championships: acc.championships + 1,
            goals: acc.goals + (h.goals || 0),
            matchesPlayed: acc.matchesPlayed + (h.matchesPlayed || 0),
            yellowCards: acc.yellowCards + (h.yellowCards || 0),
            redCards: acc.redCards + (h.redCards || 0),
          }),
          { championships: 0, goals: 0, matchesPlayed: 0, yellowCards: 0, redCards: 0 }
        );
        
        setTotals(totalsCalc);
      } catch (error) {
        console.warn('[usePlayerHistory] Error fetching history:', error);
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      fetchHistory();
    } else {
      setLoading(false);
    }
  }, [userId]);

  return {
    history,
    totals,
    loading,
    hasHistory: history.length > 0,
  };
}

/**
 * Saves championship results when a championship is finalized
 */
export async function saveChampionshipResult(
  championship: Championship,
  teams: Team[],
  players: Player[],
  matches: MatchModel[],
  events: MatchEvent[],
): Promise<void> {
  const champTeams = teams.filter((t) => t.championshipId === championship.id);
  const champMatches = matches.filter((m) => m.championshipId === championship.id);
  const finishedMatches = champMatches.filter((m) => m.status === 'finalizado');
  const champEvents = events.filter((e) => 
    champMatches.some((m) => m.id === e.matchId)
  );

  // Calculate standings
  const standings: Record<string, { points: number; goalDiff: number; goalsAgainst: number; cards: number }> = {};
  
  for (const team of champTeams) {
    standings[team.id] = { points: 0, goalDiff: 0, goalsAgainst: 0, cards: 0 };
  }

  for (const match of finishedMatches) {
    const hs = match.homeScore ?? 0;
    const as = match.awayScore ?? 0;
    
    if (standings[match.homeTeamId]) {
      standings[match.homeTeamId].goalDiff += hs - as;
      standings[match.homeTeamId].goalsAgainst += as;
      if (hs > as) standings[match.homeTeamId].points += 3;
      else if (hs === as) standings[match.homeTeamId].points += 1;
    }
    
    if (standings[match.awayTeamId]) {
      standings[match.awayTeamId].goalDiff += as - hs;
      standings[match.awayTeamId].goalsAgainst += hs;
      if (as > hs) standings[match.awayTeamId].points += 3;
      else if (as === hs) standings[match.awayTeamId].points += 1;
    }
  }

  // Count cards
  for (const event of champEvents) {
    if (event.type === 'cartao_amarelo' && standings[event.teamId]) {
      standings[event.teamId].cards += 1;
    }
    if (event.type === 'cartao_vermelho' && standings[event.teamId]) {
      standings[event.teamId].cards += 3;
    }
  }

  // Sort standings
  const sortedTeams = Object.entries(standings)
    .sort((a, b) => {
      if (b[1].points !== a[1].points) return b[1].points - a[1].points;
      return b[1].goalDiff - a[1].goalDiff;
    })
    .map(([teamId]) => teamId);

  const championTeam = champTeams.find((t) => t.id === sortedTeams[0]);
  const secondTeam = champTeams.find((t) => t.id === sortedTeams[1]);
  const thirdTeam = champTeams.find((t) => t.id === sortedTeams[2]);

  // Calculate top scorer
  const goalsByPlayer: Record<string, number> = {};
  for (const event of champEvents) {
    if (event.type === 'gol') {
      goalsByPlayer[event.playerId] = (goalsByPlayer[event.playerId] ?? 0) + 1;
    }
  }
  
  const topScorerEntry = Object.entries(goalsByPlayer).sort((a, b) => b[1] - a[1])[0];
  const topScorer = topScorerEntry ? players.find((p) => p.id === topScorerEntry[0]) : undefined;

  // Find best defense
  const bestDefenseEntry = Object.entries(standings)
    .sort((a, b) => a[1].goalsAgainst - b[1].goalsAgainst)[0];
  const bestDefenseTeam = bestDefenseEntry ? champTeams.find((t) => t.id === bestDefenseEntry[0]) : undefined;

  // Find fair play team (least cards)
  const fairPlayEntry = Object.entries(standings)
    .sort((a, b) => a[1].cards - b[1].cards)[0];
  const fairPlayTeam = fairPlayEntry ? champTeams.find((t) => t.id === fairPlayEntry[0]) : undefined;

  // Total goals
  const totalGoals = champEvents.filter((e) => e.type === 'gol').length;
  const season = new Date(championship.createdAt).getFullYear().toString();
  const champPlayers = players.filter((p) => champTeams.some((t) => t.id === p.teamId));

  const result: Omit<ChampionshipResultData, 'id'> = {
    championshipId: championship.id,
    championshipName: championship.name,
    season,
    format: championship.format,
    totalTeams: champTeams.length,
    totalPlayers: champPlayers.length,
    totalMatches: finishedMatches.length,
    totalGoals,
    winnerId: championTeam?.id ?? '',
    winnerName: championTeam?.name ?? '',
    runnerUpId: secondTeam?.id ?? '',
    runnerUpName: secondTeam?.name ?? '',
    topScorerId: topScorer?.id ?? '',
    topScorerName: topScorer?.name ?? '',
    topScorerGoals: topScorerEntry?.[1] ?? 0,
    bestDefenseId: bestDefenseTeam?.id ?? '',
    bestDefenseName: bestDefenseTeam?.name ?? '',
    bestDefenseGoals: bestDefenseEntry?.[1].goalsAgainst ?? 0,
    fairPlayTeamId: fairPlayTeam?.id,
    fairPlayTeamName: fairPlayTeam?.name,
    fairPlayCards: fairPlayEntry?.[1].cards,
    finishedAt: new Date().toISOString(),
    organizerId: championship.organizerId,
  };

  // Save to Firestore
  const { setDocument } = await import('../services/firestore');
  await setDocument('championship_results', championship.id, result);
}
