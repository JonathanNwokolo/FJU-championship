import { useEffect, useRef } from 'react';
import { subscribeToCollection } from '../services/firestore';
import { useAuthStore } from '../stores/authStore';
import { useChampionshipStore } from '../stores/championshipStore';
import { useTeamStore } from '../stores/teamStore';
import { useMatchStore } from '../stores/matchStore';
import { useVotingStore } from '../stores/votingStore';
import { Championship, MatchEvent, MatchModel, Player, RoundAward, RoundVote, Team } from '../types';

export function useFirestoreSync() {
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const championships = useChampionshipStore((s) => s.championships);
  const setChampionships = useChampionshipStore((s) => s.setChampionships);
  const setTeams = useTeamStore((s) => s.setTeams);
  const setPlayers = useTeamStore((s) => s.setPlayers);
  const setMatches = useMatchStore((s) => s.setMatches);
  const setEvents = useMatchStore((s) => s.setEvents);
  const setVotes = useVotingStore((s) => s.setVotes);
  const setAwards = useVotingStore((s) => s.setAwards);

  // Fase 1: Subscribe a championships sem filtro (coleção pequena — cresce devagar)
  useEffect(() => {
    if (isLoading || !user) return;

    const unsubChampionships = subscribeToCollection<Championship>(
      'championships',
      undefined,
      setChampionships,
    );

    return unsubChampionships;
  }, [user, isLoading, setChampionships]);

  // Fase 2: Subscribe a teams e players filtrando pelos championship IDs conhecidos
  // Resubscreve toda vez que a lista de championship IDs muda
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

  // Fase 3: Subscribe a matches e events filtrando por championships ativos/em andamento
  // Prioriza reduzir leituras nos dados de maior volume
  const activeChampIds = championships
    .filter((c) => c.status === 'em_andamento' || c.status === 'inscricoes_abertas')
    .map((c) => c.id);
  // Inclui campeonatos finalizados recentes (todos, para manter histórico disponível)
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

  // Fase 4: Subscribe a round_votes e round_awards para manter votações sincronizadas
  useEffect(() => {
    if (isLoading || !user || allIds.length === 0) return;

    const unsubVotes = subscribeToCollection<RoundVote>(
      'round_votes',
      [{ field: 'championshipId', operator: 'in', value: allIds }],
      setVotes,
    );
    const unsubAwards = subscribeToCollection<RoundAward>(
      'round_awards',
      [{ field: 'championshipId', operator: 'in', value: allIds }],
      setAwards,
    );

    return () => {
      unsubVotes();
      unsubAwards();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoading, matchSyncKey, setVotes, setAwards]);
}
