import { useEffect } from 'react';
import { subscribeToCollection } from '../services/firestore';
import { useChampionshipStore } from '../stores/championshipStore';
import { useTeamStore } from '../stores/teamStore';
import { useMatchStore } from '../stores/matchStore';
import { Championship, MatchEvent, MatchModel, Player, Team } from '../types';

export function useFirestoreSync() {
  const setChampionships = useChampionshipStore((s) => s.setChampionships);
  const setTeams = useTeamStore((s) => s.setTeams);
  const setPlayers = useTeamStore((s) => s.setPlayers);
  const setMatches = useMatchStore((s) => s.setMatches);
  const setEvents = useMatchStore((s) => s.setEvents);

  useEffect(() => {
    const unsubChampionships = subscribeToCollection<Championship>(
      'championships',
      undefined,
      setChampionships,
    );
    const unsubTeams = subscribeToCollection<Team>('teams', undefined, setTeams);
    const unsubPlayers = subscribeToCollection<Player>('players', undefined, setPlayers);
    const unsubMatches = subscribeToCollection<MatchModel>('matches', undefined, setMatches);
    const unsubEvents = subscribeToCollection<MatchEvent>(
      'match_events',
      undefined,
      setEvents,
    );

    return () => {
      unsubChampionships();
      unsubTeams();
      unsubPlayers();
      unsubMatches();
      unsubEvents();
    };
  }, [setChampionships, setTeams, setPlayers, setMatches, setEvents]);
}
