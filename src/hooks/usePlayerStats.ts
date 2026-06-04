import { useMemo } from 'react';
import { useMatchStore } from '../stores/matchStore';
import { calculateOverall } from '../utils/playerOverall';

export function usePlayerStats(playerId: string, championshipId: string) {
  const matches = useMatchStore((s) => s.matches);
  const events = useMatchStore((s) => s.events);

  return useMemo(() => {
    const champMatchIds = new Set(
      matches.filter((m) => m.championshipId === championshipId).map((m) => m.id)
    );
    const playerEvents = events.filter(
      (e) => e.playerId === playerId && champMatchIds.has(e.matchId)
    );
    const goals = playerEvents.filter((e) => e.type === 'gol').length;
    const yellowCards = playerEvents.filter((e) => e.type === 'cartao_amarelo').length;
    const redCards = playerEvents.filter((e) => e.type === 'cartao_vermelho').length;
    const overall = calculateOverall(goals, yellowCards, redCards);
    return { goals, yellowCards, redCards, overall, loading: false };
  }, [playerId, championshipId, matches, events]);
}
