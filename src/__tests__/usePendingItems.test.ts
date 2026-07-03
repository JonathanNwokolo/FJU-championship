import { act, renderHook, waitFor } from '@testing-library/react-native';
import { usePendingItems, usePendingItemsSummary } from '../hooks/usePendingItems';
import { getCollection } from '../services/index';
import { useAuthStore } from '../stores/authStore';
import { useChampionshipStore } from '../stores/championshipStore';
import { useTeamStore } from '../stores/teamStore';
import { useMatchStore } from '../stores/matchStore';
import {
  AppUser,
  Championship,
  Convocation,
  MatchAttendance,
  MatchModel,
  Player,
  Team,
} from '../types';

jest.mock('../services/index', () => ({
  getCollection: jest.fn(),
}));

const mockGetCollection = getCollection as jest.MockedFunction<typeof getCollection>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function user(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: 'u1',
    name: 'User',
    role: 'organizador',
    ...overrides,
  };
}

function championship(overrides: Partial<Championship> = {}): Championship {
  return {
    id: 'c1',
    name: 'Copa',
    format: 'pontos_corridos',
    status: 'em_andamento',
    currentRound: 1,
    totalRounds: 3,
    organizerId: 'u1',
    inviteCode: 'ABC123',
    rules: {
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      tiebreakers: [],
      fairPlay: false,
      craqueDaRodada: false,
    },
    createdAt: '2026-06-30T00:00:00.000Z',
    ...overrides,
  };
}

function team(overrides: Partial<Team> = {}): Team {
  return {
    id: 't1',
    championshipId: 'c1',
    name: 'Time',
    primaryColor: '#111111',
    secondaryColor: '#ffffff',
    captainId: 'cap1',
    status: 'aprovado',
    inviteCode: 'INV1',
    createdAt: '2026-06-30T00:00:00.000Z',
    ...overrides,
  };
}

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    teamId: 't1',
    championshipId: 'c1',
    userId: 'ath1',
    name: 'Atleta',
    position: 'meia',
    number: 10,
    status: 'ativo',
    ...overrides,
  };
}

function match(overrides: Partial<MatchModel> = {}): MatchModel {
  return {
    id: 'm1',
    championshipId: 'c1',
    round: 1,
    homeTeamId: 't1',
    awayTeamId: 't2',
    homeScore: null,
    awayScore: null,
    status: 'agendado',
    scheduledAt: '2026-07-02T12:00:00.000Z',
    ...overrides,
  };
}

function convocation(overrides: Partial<Convocation> = {}): Convocation {
  return {
    id: 'm1_t1',
    championshipId: 'c1',
    matchId: 'm1',
    teamId: 't1',
    captainId: 'cap1',
    playerIds: ['p1'],
    status: 'open',
    responseDeadline: null,
    requiresReconfirmation: false,
    version: 1,
    previousVersion: null,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
    ...overrides,
  };
}

function attendance(overrides: Partial<MatchAttendance> = {}): MatchAttendance {
  return {
    id: 'm1_p1',
    championshipId: 'c1',
    matchId: 'm1',
    teamId: 't1',
    playerId: 'p1',
    userId: 'ath1',
    response: 'pending',
    respondedAt: null,
    version: 1,
    reconfirmationRequired: false,
    previousResponse: null,
    updatedAt: '2026-06-30T00:00:00.000Z',
    ...overrides,
  };
}

function seedBase(role: AppUser['role'] = 'organizador') {
  useAuthStore.setState({ user: user({ role, id: role === 'capitao' ? 'cap1' : role === 'atleta' ? 'ath1' : 'u1' }) });
  useChampionshipStore.setState({
    championships: [championship()],
    selectedChampionshipId: 'c1',
    loading: false,
  });
  useTeamStore.setState({
    teams: [team(), team({ id: 't2', captainId: 'cap2' })],
    players: [player()],
    loading: false,
  });
  useMatchStore.setState({ matches: [match()], events: [], loading: false });
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: null, isLoading: false, isOnboarded: false });
  useChampionshipStore.setState({ championships: [], selectedChampionshipId: null, loading: false });
  useTeamStore.setState({ teams: [], players: [], loading: false });
  useMatchStore.setState({ matches: [], events: [], loading: false });
});

describe('usePendingItems', () => {
  it('uses only current collection paths and championship-scoped filters', async () => {
    seedBase('organizador');
    mockGetCollection.mockResolvedValueOnce([convocation()] as never);
    mockGetCollection.mockResolvedValueOnce([attendance()] as never);

    const { result } = await renderHook(() => usePendingItems());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockGetCollection).toHaveBeenCalledTimes(2);
    expect(mockGetCollection).toHaveBeenNthCalledWith(1, 'match_convocations', [
      { field: 'championshipId', operator: '==', value: 'c1' },
    ]);
    expect(mockGetCollection).toHaveBeenNthCalledWith(2, 'match_attendance', [
      { field: 'championshipId', operator: '==', value: 'c1' },
    ]);
    expect(mockGetCollection.mock.calls.map((call) => call[0])).not.toEqual(
      expect.arrayContaining(['convocations', 'attendance', 'teams/t1/convocations']),
    );
    expect(result.current.hasFreshScopedData).toBe(true);
  });

  it('keeps successful scoped data and reports a partial query error', async () => {
    seedBase('capitao');
    mockGetCollection.mockResolvedValueOnce([convocation()] as never);
    mockGetCollection.mockRejectedValueOnce(new Error('unavailable'));

    const { result } = await renderHook(() => usePendingItems());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Nao foi possivel carregar algumas pendencias. Puxe para atualizar.');
    expect(result.current.items.some((item) => item.type === 'captain_convocation_pending_responses')).toBe(true);
  });

  it('does not query and clears data when there is no active championship', async () => {
    seedBase('organizador');
    useChampionshipStore.setState({ selectedChampionshipId: null });

    const { result } = await renderHook(() => usePendingItems());

    expect(mockGetCollection).not.toHaveBeenCalled();
    expect(result.current.items).toHaveLength(0);
    expect(result.current.error).toBeNull();
  });

  it('ignores stale responses after championship changes', async () => {
    seedBase('organizador');
    useChampionshipStore.setState({
      championships: [
        championship({ id: 'c1', name: 'Copa 1' }),
        championship({ id: 'c2', name: 'Copa 2' }),
      ],
      selectedChampionshipId: 'c1',
    });
    useMatchStore.setState({
      matches: [
        match({ id: 'm1', championshipId: 'c1', homeTeamId: 't1', awayTeamId: 't2' }),
        match({ id: 'm2', championshipId: 'c2', homeTeamId: 't3', awayTeamId: 't4' }),
      ],
      events: [],
      loading: false,
    });

    const c1Conv = deferred<Convocation[]>();
    const c1Att = deferred<MatchAttendance[]>();
    const c2Conv = deferred<Convocation[]>();
    const c2Att = deferred<MatchAttendance[]>();
    mockGetCollection
      .mockReturnValueOnce(c1Conv.promise as never)
      .mockReturnValueOnce(c1Att.promise as never)
      .mockReturnValueOnce(c2Conv.promise as never)
      .mockReturnValueOnce(c2Att.promise as never);

    const { result } = await renderHook(() => usePendingItems());

    await act(async () => {
      useChampionshipStore.setState({ selectedChampionshipId: 'c2' });
    });

    await act(async () => {
      c2Conv.resolve([]);
      c2Att.resolve([]);
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      c1Conv.resolve([
        convocation({ id: 'm1_t1', championshipId: 'c1', matchId: 'm1', teamId: 't1' }),
      ]);
      c1Att.resolve([]);
    });

    expect(result.current.items.every((item) => item.championshipId === 'c2')).toBe(true);
  });

  it('updates the derived role on role changes without extra listeners', async () => {
    seedBase('atleta');
    mockGetCollection.mockResolvedValueOnce([convocation()] as never);
    mockGetCollection.mockResolvedValueOnce([] as never);

    const { result } = await renderHook(() => usePendingItems());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items.some((item) => item.type === 'athlete_attendance_pending')).toBe(true);

    await act(async () => {
      useAuthStore.setState({ user: user({ id: 'cap1', role: 'capitao' }) });
    });

    await waitFor(() => {
      expect(result.current.items.some((item) => item.type.startsWith('captain_'))).toBe(true);
    });
  });

  it('refreshes with a new request and old refresh does not overwrite the newer one', async () => {
    seedBase('capitao');
    const firstConv = deferred<Convocation[]>();
    const firstAtt = deferred<MatchAttendance[]>();
    const secondConv = deferred<Convocation[]>();
    const secondAtt = deferred<MatchAttendance[]>();
    mockGetCollection
      .mockReturnValueOnce(firstConv.promise as never)
      .mockReturnValueOnce(firstAtt.promise as never)
      .mockReturnValueOnce(secondConv.promise as never)
      .mockReturnValueOnce(secondAtt.promise as never);

    const { result } = await renderHook(() => usePendingItems());

    await act(async () => {
      result.current.refresh();
    });

    await act(async () => {
      secondConv.resolve([convocation()]);
      secondAtt.resolve([attendance({ response: 'declined' })]);
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      firstConv.resolve([]);
      firstAtt.resolve([]);
    });

    expect(result.current.items.some((item) => item.type === 'captain_convocation_declined')).toBe(true);
  });
});

describe('usePendingItemsSummary', () => {
  it('marks the quick summary as partial when convocation data must be checked in the center', async () => {
    seedBase('atleta');

    const { result } = await renderHook(() => usePendingItemsSummary());

    expect(result.current.total).toBe(0);
    expect(result.current.isPartial).toBe(true);
    expect(result.current.partialReason).toContain('Central completa');
  });
});
