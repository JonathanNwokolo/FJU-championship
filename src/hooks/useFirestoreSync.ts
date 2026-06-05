import { useEffect, useRef } from 'react';
import { subscribeToCollection } from '../services/firestore';
import { useAuthStore } from '../stores/authStore';
import { useChampionshipStore } from '../stores/championshipStore';
import { useTeamStore } from '../stores/teamStore';
import { useMatchStore } from '../stores/matchStore';
import { Championship, MatchEvent, MatchModel, Player, Team } from '../types';

export function useFirestoreSync() {
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const championships = useChampionshipStore((s) => s.championships);
  const setChampionships = useChampionshipStore((s) => s.setChampionships);
  const setTeams = useTeamStore((s) => s.setTeams);
  const setPlayers = useTeamStore((s) => s.setPlayers);
  const setMatches = useMatchStore((s) => s.setMatches);
  const setEvents = useMatchStore((s) => s.setEvents);

  // Phase 1: subscribe to championships without filters.
  useEffect(() => {
    if (isLoading || !user) return;

    const unsubChampionships = subscribeToCollection<Championship>(
      'championships',
      undefined,
      setChampionships,
    );

    return unsubChampionships;
  }, [user, isLoading, setChampionships]);

  // Phase 2: subscribe to teams and players for known championship IDs.
  const champIdsRef = useRef<string[]>([]);
  const champIds = championships.map((c) => c.id);
  const champIdsKey = champIds.sort().join(',');

  useEffect(() => {
    if (isLoading || !user || champIds.length === 0) return;

    champIdsRef.current = champIds;

    const unsubTeams = subscribeToCollection<Team>(
      'teams',
      [{ field: 'championshipId', operator: 'in', value: champIds }],
      setTeams,
    );
    const unsubPlayers = subscribeToCollection<Player>(
      'players',
      [{ field: 'championshipId', operator: 'in', value: champIds }],
      setPlayers,
    );

    return () => {
      unsubTeams();
      unsubPlayers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoading, champIdsKey, setTeams, setPlayers]);

  // Phase 3: subscribe to matches and match events for known championship IDs.
  const allIds = championships.map((c) => c.id);
  const matchSyncKey = allIds.sort().join(',');

  useEffect(() => {
    if (isLoading || !user || allIds.length === 0) return;

    const unsubMatches = subscribeToCollection<MatchModel>(
      'matches',
      [{ field: 'championshipId', operator: 'in', value: allIds }],
      setMatches,
    );
    const unsubEvents = subscribeToCollection<MatchEvent>(
      'match_events',
      [{ field: 'championshipId', operator: 'in', value: allIds }],
      setEvents,
    );

    return () => {
      unsubMatches();
      unsubEvents();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoading, matchSyncKey, setMatches, setEvents]);
}
