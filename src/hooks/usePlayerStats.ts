import { useMemo } from 'react';
import { useMatchStore } from '../stores/matchStore';
import { calculateOverall } from '../utils/playerOverall';
import { MatchEvent, MatchModel } from '../types';

export interface MatchPerformance {
  match: MatchModel;
  events: MatchEvent[];
  goals: number;
  yellowCards: number;
  redCards: number;
}

export function usePlayerStats(playerId: string, championshipId: string) {
  const matches = useMatchStore((s) => s.matches);
  const events = useMatchStore((s) => s.events);

  return useMemo(() => {
    const champMatches = matches.filter((m) => m.championshipId === championshipId);
    const champMatchIds = new Set(champMatches.map((m) => m.id));

    const playerEvents = events.filter(
      (e) => e.playerId === playerId && champMatchIds.has(e.matchId),
    );

    const goals = playerEvents.filter((e) => e.type === 'gol').length;
    const yellowCards = playerEvents.filter((e) => e.type === 'cartao_amarelo').length;
    const redCards = playerEvents.filter((e) => e.type === 'cartao_vermelho').length;
    const matchesPlayed = new Set(playerEvents.map((event) => event.matchId)).size;
    const overall = calculateOverall(goals, yellowCards, redCards, matchesPlayed);

    // Per-match breakdown for stats detail screen
    const matchBreakdown: MatchPerformance[] = champMatches
      .filter((m) => m.status === 'finalizado')
      .map((m) => {
        const matchEvents = playerEvents.filter((e) => e.matchId === m.id);
        return {
          match: m,
          events: matchEvents,
          goals: matchEvents.filter((e) => e.type === 'gol').length,
          yellowCards: matchEvents.filter((e) => e.type === 'cartao_amarelo').length,
          redCards: matchEvents.filter((e) => e.type === 'cartao_vermelho').length,
        };
      })
      .filter((p) => p.events.length > 0) // only matches with participation
      .sort((a, b) => b.match.round - a.match.round);

    return { goals, yellowCards, redCards, matchesPlayed, overall, matchBreakdown, loading: false };
  }, [playerId, championshipId, matches, events]);
}
