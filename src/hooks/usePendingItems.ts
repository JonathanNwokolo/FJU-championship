import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useChampionshipStore } from '../stores/championshipStore';
import { useTeamStore } from '../stores/teamStore';
import { useMatchStore } from '../stores/matchStore';
import { getCollection, type FirestoreFilter } from '../services/index';
import { Convocation, MatchAttendance } from '../types';
import { PendingGroup, PendingItem } from '../types/pending';
import {
  deriveAthletePendingItems,
  deriveCaptainPendingItems,
  deriveGroupStagePendingItems,
  deriveOrganizerPendingItems,
  groupPendingItems,
  sortPendingItems,
} from '../utils/pendingRules';
import { isActiveRosterPlayer } from '../utils/teamRules';

export interface UsePendingItemsResult {
  items: PendingItem[];
  criticalItems: PendingItem[];
  groups: PendingGroup[];
  total: number;
  criticalCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  hasFreshScopedData: boolean;
}

const SCOPED_QUERY_FILTER = (championshipId: string): FirestoreFilter[] => [
  { field: 'championshipId', operator: '==', value: championshipId },
];

export function usePendingItems(): UsePendingItemsResult {
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? 'atleta';

  const championships = useChampionshipStore((s) => s.championships);
  const selectedChampionshipId = useChampionshipStore((s) => s.selectedChampionshipId);
  const teams = useTeamStore((s) => s.teams);
  const players = useTeamStore((s) => s.players);
  const matches = useMatchStore((s) => s.matches);

  const [convocations, setConvocations] = useState<Convocation[]>([]);
  const [attendances, setAttendances] = useState<MatchAttendance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedChampionshipId, setLoadedChampionshipId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!selectedChampionshipId || !user) {
      setConvocations([]);
      setAttendances([]);
      setLoadedChampionshipId(null);
      setError(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setConvocations([]);
    setAttendances([]);
    setLoadedChampionshipId(null);

    const filters = SCOPED_QUERY_FILTER(selectedChampionshipId);

    Promise.allSettled([
      getCollection<Convocation>('match_convocations', filters),
      getCollection<MatchAttendance>('match_attendance', filters),
    ])
      .then(([convocationsResult, attendancesResult]) => {
        if (cancelled || !mountedRef.current || requestId !== requestIdRef.current) return;

        const nextConvocations =
          convocationsResult.status === 'fulfilled' && Array.isArray(convocationsResult.value)
            ? convocationsResult.value
            : [];
        const nextAttendances =
          attendancesResult.status === 'fulfilled' && Array.isArray(attendancesResult.value)
            ? attendancesResult.value
            : [];
        setConvocations(nextConvocations);
        setAttendances(nextAttendances);
        setLoadedChampionshipId(selectedChampionshipId);
        setError(
          convocationsResult.status === 'rejected' || attendancesResult.status === 'rejected'
            ? 'Nao foi possivel carregar algumas pendencias. Puxe para atualizar.'
            : null,
        );
        setLoading(false);
      })
      .catch(() => {
        if (cancelled || !mountedRef.current || requestId !== requestIdRef.current) return;
        setConvocations([]);
        setAttendances([]);
        setLoadedChampionshipId(selectedChampionshipId);
        setError('Nao foi possivel carregar algumas pendencias. Puxe para atualizar.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedChampionshipId, user, refreshKey]);

  const refresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  const items = useMemo((): PendingItem[] => {
    if (!user || !selectedChampionshipId) return [];

    if (role === 'organizador') {
      return [
        ...deriveOrganizerPendingItems({
          user,
          championships,
          teams,
          players,
          matches,
          convocations,
          activeChampionshipId: selectedChampionshipId,
        }),
        ...deriveGroupStagePendingItems({
          user,
          championships,
          teams,
          matches,
          activeChampionshipId: selectedChampionshipId,
        }),
      ];
    }

    if (role === 'capitao') {
      return deriveCaptainPendingItems({
        user,
        championships,
        teams,
        players,
        matches,
        convocations,
        attendances,
        activeChampionshipId: selectedChampionshipId,
      });
    }

    return deriveAthletePendingItems({
      user,
      championships,
      teams,
      players,
      matches,
      convocations,
      attendances,
      activeChampionshipId: selectedChampionshipId,
    });
  }, [
    attendances,
    championships,
    convocations,
    matches,
    players,
    role,
    selectedChampionshipId,
    teams,
    user,
  ]);

  const sortedItems = useMemo(() => sortPendingItems(items), [items]);
  const criticalItems = useMemo(
    () => sortedItems.filter((item) => item.severity === 'critical'),
    [sortedItems],
  );
  const groups = useMemo(() => groupPendingItems(sortedItems), [sortedItems]);

  return {
    items: sortedItems,
    criticalItems,
    groups,
    total: sortedItems.length,
    criticalCount: criticalItems.length,
    loading,
    error,
    refresh,
    hasFreshScopedData:
      !!selectedChampionshipId && loadedChampionshipId === selectedChampionshipId && !loading,
  };
}

export function usePendingItemsSummary(): {
  criticalCount: number;
  total: number;
  topItem: PendingItem | null;
  isPartial: boolean;
  partialReason: string | null;
} {
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? 'atleta';

  const championships = useChampionshipStore((s) => s.championships);
  const selectedChampionshipId = useChampionshipStore((s) => s.selectedChampionshipId);
  const teams = useTeamStore((s) => s.teams);
  const players = useTeamStore((s) => s.players);
  const matches = useMatchStore((s) => s.matches);

  const items = useMemo((): PendingItem[] => {
    if (!user || !selectedChampionshipId) return [];

    if (role === 'organizador') {
      return [
        ...deriveOrganizerPendingItems({
          user,
          championships,
          teams,
          players,
          matches,
          convocations: [],
          activeChampionshipId: selectedChampionshipId,
        }),
        ...deriveGroupStagePendingItems({
          user,
          championships,
          teams,
          matches,
          activeChampionshipId: selectedChampionshipId,
        }),
      ];
    }

    if (role === 'capitao') {
      return deriveCaptainPendingItems({
        user,
        championships,
        teams,
        players,
        matches,
        convocations: [],
        attendances: [],
        activeChampionshipId: selectedChampionshipId,
      });
    }

    return deriveAthletePendingItems({
      user,
      championships,
      teams,
      players,
      matches,
      convocations: [],
      attendances: [],
      activeChampionshipId: selectedChampionshipId,
    });
  }, [championships, matches, players, role, selectedChampionshipId, teams, user]);

  const isPartial = useMemo(() => {
    if (!user || !selectedChampionshipId) return false;
    const scopedMatches = matches.filter(
      (match) =>
        match.championshipId === selectedChampionshipId &&
        (match.status === 'agendado' || match.status === 'adiado'),
    );
    if (scopedMatches.length === 0) return false;

    if (role === 'organizador') {
      return championships.some(
        (championship) =>
          championship.id === selectedChampionshipId && championship.organizerId === user.id,
      );
    }

    if (role === 'capitao') {
      const captainTeam = teams.find(
        (team) =>
          team.championshipId === selectedChampionshipId && team.captainId === user.id,
      );
      return scopedMatches.some(
        (match) =>
          !!captainTeam &&
          (match.homeTeamId === captainTeam.id || match.awayTeamId === captainTeam.id),
      );
    }

    const activePlayer = players.find(
      (player) =>
        player.championshipId === selectedChampionshipId &&
        player.userId === user.id &&
        isActiveRosterPlayer(player),
    );
    return scopedMatches.some(
      (match) =>
        !!activePlayer &&
        (match.homeTeamId === activePlayer.teamId || match.awayTeamId === activePlayer.teamId),
    );
  }, [championships, matches, players, role, selectedChampionshipId, teams, user]);

  const sorted = useMemo(() => sortPendingItems(items), [items]);
  const criticalCount = useMemo(
    () => sorted.filter((item) => item.severity === 'critical').length,
    [sorted],
  );

  return {
    criticalCount,
    total: sorted.length,
    topItem: sorted[0] ?? null,
    isPartial,
    partialReason: isPartial
      ? 'Resumo rapido. Convocacoes e presenca sao conferidas na Central completa.'
      : null,
  };
}
