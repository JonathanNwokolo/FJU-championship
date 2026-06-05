import { useEffect, useState } from 'react';
import { ChampionshipResultData } from '../types';
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

export function useChampionshipHistory() {
  const championships = useChampionshipStore((s) => s.championships);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<Record<string, ChampionshipResultData>>({});

  // Filter finished championships
  const finishedChampionships = championships.filter((c) => c.status === 'finalizado');

  useEffect(() => {
    const fetchResults = async () => {
      setLoading(true);
      try {
        // Promise.all em paralelo em vez de N chamadas sequenciais
        const fetched = await Promise.all(
          finishedChampionships.map((c) =>
            getDocument<ChampionshipResult>('championship_results', c.id),
          ),
        );

        const resultsData: Record<string, ChampionshipResult> = {};
        fetched.forEach((result, i) => {
          if (result) {
            resultsData[finishedChampionships[i].id] = result;
          }
        });

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

