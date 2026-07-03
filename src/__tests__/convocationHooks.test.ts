import { act, renderHook } from '@testing-library/react-native';
import {
  useMatchConvocation,
  UseMatchConvocationResult,
} from '../hooks/useMatchConvocation';
import {
  useConvocationResponses,
  UseConvocationResponsesResult,
} from '../hooks/useConvocationResponses';
import {
  useMatchAttendance,
  UseMatchAttendanceResult,
} from '../hooks/useMatchAttendance';
import { attendanceDocId, convocationDocId } from '../utils/convocationRules';
import { Convocation, MatchAttendance } from '../types';
import { subscribeToCollection, subscribeToDocument } from '../services/index';

type DocCallback = (doc: unknown | null) => void;
type CollectionCallback = (docs: unknown[]) => void;
type ErrorCallback = (error: Error) => void;

interface DocSubscription {
  collectionName: string;
  docId: string;
  callback: DocCallback;
  onError?: ErrorCallback;
  unsubscribe: jest.Mock;
}

interface CollectionSubscription {
  collectionName: string;
  filters: unknown;
  callback: CollectionCallback;
  onError?: ErrorCallback;
  unsubscribe: jest.Mock;
}

const mockDocSubscriptions: DocSubscription[] = [];
const mockCollectionSubscriptions: CollectionSubscription[] = [];

jest.mock('../services/index', () => ({
  subscribeToDocument: jest.fn(),
  subscribeToCollection: jest.fn(),
}));

const mockSubscribeToDocument = subscribeToDocument as jest.MockedFunction<
  typeof subscribeToDocument
>;
const mockSubscribeToCollection = subscribeToCollection as jest.MockedFunction<
  typeof subscribeToCollection
>;

const convocation = (overrides: Partial<Convocation> = {}): Convocation =>
  ({
    id: convocationDocId('m1', 't1'),
    championshipId: 'c1',
    matchId: 'm1',
    teamId: 't1',
    captainId: 'u-cap',
    playerIds: ['p1'],
    status: 'open',
    responseDeadline: null,
    requiresReconfirmation: false,
    version: 1,
    previousVersion: null,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
    cancelledAt: null,
    cancellationReason: null,
    ...overrides,
  }) as Convocation;

const attendance = (overrides: Partial<MatchAttendance> = {}): MatchAttendance =>
  ({
    id: attendanceDocId('m1', 'p1'),
    championshipId: 'c1',
    matchId: 'm1',
    teamId: 't1',
    playerId: 'p1',
    userId: 'u1',
    response: 'confirmed',
    respondedAt: '2026-06-30T00:00:00.000Z',
    declineReason: null,
    reconfirmationRequired: false,
    previousResponse: null,
    version: 1,
    updatedAt: '2026-06-30T00:00:00.000Z',
    ...overrides,
  }) as MatchAttendance;

beforeEach(() => {
  mockDocSubscriptions.length = 0;
  mockCollectionSubscriptions.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => {});

  mockSubscribeToDocument.mockImplementation((collectionName, docId, callback, onError) => {
    const subscription: DocSubscription = {
      collectionName,
      docId,
      callback: callback as DocCallback,
      onError,
      unsubscribe: jest.fn(),
    };
    mockDocSubscriptions.push(subscription);
    return subscription.unsubscribe;
  });

  mockSubscribeToCollection.mockImplementation((collectionName, filters, callback, onError) => {
    const subscription: CollectionSubscription = {
      collectionName,
      filters,
      callback: callback as CollectionCallback,
      onError,
      unsubscribe: jest.fn(),
    };
    mockCollectionSubscriptions.push(subscription);
    return subscription.unsubscribe;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useMatchConvocation', () => {
  it('mounts, creates one deterministic document subscription and receives data', async () => {
    const { result } = await renderHook<
      UseMatchConvocationResult,
      { matchId: string; teamId: string }
    >(
      ({ matchId, teamId }) => useMatchConvocation(matchId, teamId),
      { initialProps: { matchId: 'm1', teamId: 't1' } },
    );

    expect(mockDocSubscriptions).toHaveLength(1);
    expect(mockDocSubscriptions[0]).toMatchObject({
      collectionName: 'match_convocations',
      docId: convocationDocId('m1', 't1'),
    });
    expect(result.current).toMatchObject({ convocation: null, loading: true, error: null });

    await act(async () => {
      mockDocSubscriptions[0].callback(convocation());
    });

    expect(result.current.convocation?.id).toBe(convocationDocId('m1', 't1'));
    expect(result.current.loading).toBe(false);
  });

  it('handles missing, cancelled, completed and reconfirmation snapshots', async () => {
    const { result } = await renderHook(() => useMatchConvocation('m1', 't1'));

    await act(async () => {
      mockDocSubscriptions[0].callback(null);
    });
    expect(result.current.convocation).toBeNull();
    expect(result.current.loading).toBe(false);

    await act(async () => {
      mockDocSubscriptions[0].callback(convocation({ status: 'cancelled', version: 2 }));
    });
    expect(result.current.convocation?.status).toBe('cancelled');

    await act(async () => {
      mockDocSubscriptions[0].callback(convocation({ status: 'completed', version: 3 }));
    });
    expect(result.current.convocation?.status).toBe('completed');

    await act(async () => {
      mockDocSubscriptions[0].callback(convocation({ requiresReconfirmation: true, version: 4 }));
    });
    expect(result.current.convocation?.requiresReconfirmation).toBe(true);
  });

  it('unsubscribes on unmount and ignores callbacks after unmount', async () => {
    const { result, unmount } = await renderHook(() => useMatchConvocation('m1', 't1'));
    const subscription = mockDocSubscriptions[0];

    await unmount();
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);

    await act(async () => {
      subscription.callback(convocation({ version: 2 }));
    });
    expect(result.current.convocation).toBeNull();
  });

  it('rerender with new matchId or teamId cancels the previous listener', async () => {
    const { rerender } = await renderHook<
      UseMatchConvocationResult,
      { matchId: string; teamId: string }
    >(
      ({ matchId, teamId }) => useMatchConvocation(matchId, teamId),
      { initialProps: { matchId: 'm1', teamId: 't1' } },
    );
    const first = mockDocSubscriptions[0];

    await rerender({ matchId: 'm2', teamId: 't1' });
    expect(first.unsubscribe).toHaveBeenCalledTimes(1);
    expect(mockDocSubscriptions[1].docId).toBe(convocationDocId('m2', 't1'));

    const second = mockDocSubscriptions[1];
    await rerender({ matchId: 'm2', teamId: 't2' });
    expect(second.unsubscribe).toHaveBeenCalledTimes(1);
    expect(mockDocSubscriptions[2].docId).toBe(convocationDocId('m2', 't2'));
  });

  it('does not create invalid listeners and reports listener errors consistently', async () => {
    const empty = await renderHook(() => useMatchConvocation('', 't1'));
    expect(mockDocSubscriptions).toHaveLength(0);
    expect(empty.result.current).toMatchObject({ convocation: null, loading: false, error: null });

    const { result } = await renderHook(() => useMatchConvocation('m1', 't1'));
    await act(async () => {
      mockDocSubscriptions[0].onError?.(new Error('permission-denied'));
    });

    expect(result.current.error).toBe('Nao foi possivel carregar a convocacao em tempo real.');
    expect(result.current.loading).toBe(false);
  });

  it('ignores an old callback after dependency change', async () => {
    const { result, rerender } = await renderHook<
      UseMatchConvocationResult,
      { matchId: string }
    >(
      ({ matchId }) => useMatchConvocation(matchId, 't1'),
      { initialProps: { matchId: 'm1' } },
    );
    const oldSubscription = mockDocSubscriptions[0];

    await rerender({ matchId: 'm2' });
    await act(async () => {
      mockDocSubscriptions[1].callback(convocation({ id: convocationDocId('m2', 't1'), matchId: 'm2' }));
    });
    await act(async () => {
      oldSubscription.callback(convocation({ id: convocationDocId('m1', 't1'), matchId: 'm1' }));
    });

    expect(result.current.convocation?.matchId).toBe('m2');
  });
});

describe('useMatchAttendance', () => {
  it('listens to the deterministic attendance document and reflects response changes', async () => {
    const { result } = await renderHook(() => useMatchAttendance('m1', 'p1'));

    expect(mockDocSubscriptions[0]).toMatchObject({
      collectionName: 'match_attendance',
      docId: attendanceDocId('m1', 'p1'),
    });

    await act(async () => {
      mockDocSubscriptions[0].callback(attendance({ response: 'confirmed' }));
    });
    expect(result.current.attendance?.response).toBe('confirmed');

    await act(async () => {
      mockDocSubscriptions[0].callback(
        attendance({ response: 'declined', declineReason: 'lesao', version: 2 }),
      );
    });
    expect(result.current.attendance?.response).toBe('declined');
    expect(result.current.attendance?.declineReason).toBe('lesao');

    await act(async () => {
      mockDocSubscriptions[0].callback(
        attendance({ reconfirmationRequired: true, previousResponse: 'declined', version: 3 }),
      );
    });
    expect(result.current.attendance?.reconfirmationRequired).toBe(true);
  });

  it('handles missing params, missing document, listener error, unmount and dependency changes', async () => {
    await renderHook(() => useMatchAttendance('', 'p1'));
    expect(mockDocSubscriptions).toHaveLength(0);

    const { result, rerender, unmount } = await renderHook<
      UseMatchAttendanceResult,
      { matchId: string; playerId: string }
    >(
      ({ matchId, playerId }) => useMatchAttendance(matchId, playerId),
      { initialProps: { matchId: 'm1', playerId: 'p1' } },
    );
    const first = mockDocSubscriptions[0];

    await act(async () => {
      first.callback(null);
    });
    expect(result.current.attendance).toBeNull();
    expect(result.current.loading).toBe(false);

    await rerender({ matchId: 'm1', playerId: 'p2' });
    expect(first.unsubscribe).toHaveBeenCalledTimes(1);
    expect(mockDocSubscriptions[1].docId).toBe(attendanceDocId('m1', 'p2'));

    await act(async () => {
      mockDocSubscriptions[1].onError?.(new Error('unavailable'));
    });
    expect(result.current.error).toBe('Nao foi possivel carregar sua presenca em tempo real.');

    const second = mockDocSubscriptions[1];
    await unmount();
    expect(second.unsubscribe).toHaveBeenCalledTimes(1);

    await act(async () => {
      second.callback(attendance({ playerId: 'p2' }));
    });
    expect(result.current.attendance).toBeNull();
  });
});

describe('useConvocationResponses', () => {
  it('subscribes only to the current match and returns a lookup by playerId', async () => {
    const { result } = await renderHook(() => useConvocationResponses('m1'));

    expect(mockCollectionSubscriptions[0]).toMatchObject({
      collectionName: 'match_attendance',
      filters: [{ field: 'matchId', operator: '==', value: 'm1' }],
    });

    await act(async () => {
      mockCollectionSubscriptions[0].callback([
        attendance({ playerId: 'p1', response: 'confirmed' }),
        attendance({ id: attendanceDocId('m1', 'p2'), playerId: 'p2', response: 'declined' }),
        attendance({ id: attendanceDocId('m2', 'p3'), matchId: 'm2', playerId: 'p3' }),
      ]);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.responses.size).toBe(2);
    expect(result.current.responses.get('p1')?.response).toBe('confirmed');
    expect(result.current.responses.has('p3')).toBe(false);
  });

  it('handles empty, update and removal snapshots', async () => {
    const { result } = await renderHook(() => useConvocationResponses('m1'));

    await act(async () => {
      mockCollectionSubscriptions[0].callback([]);
    });
    expect(result.current.responses.size).toBe(0);

    await act(async () => {
      mockCollectionSubscriptions[0].callback([attendance({ playerId: 'p1' })]);
    });
    expect(result.current.responses.get('p1')?.response).toBe('confirmed');

    await act(async () => {
      mockCollectionSubscriptions[0].callback([
        attendance({ playerId: 'p1', response: 'declined', version: 2 }),
      ]);
    });
    expect(result.current.responses.get('p1')?.response).toBe('declined');

    await act(async () => {
      mockCollectionSubscriptions[0].callback([]);
    });
    expect(result.current.responses.has('p1')).toBe(false);
  });

  it('cleans up when match changes, clears old data and ignores old callbacks', async () => {
    const { result, rerender } = await renderHook<
      UseConvocationResponsesResult,
      { matchId: string }
    >(
      ({ matchId }) => useConvocationResponses(matchId),
      { initialProps: { matchId: 'm1' } },
    );
    const oldSubscription = mockCollectionSubscriptions[0];

    await act(async () => {
      oldSubscription.callback([attendance({ playerId: 'p1' })]);
    });
    expect(result.current.responses.has('p1')).toBe(true);

    await rerender({ matchId: 'm2' });
    expect(oldSubscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(result.current.responses.size).toBe(0);

    await act(async () => {
      oldSubscription.callback([attendance({ playerId: 'p-old' })]);
      mockCollectionSubscriptions[1].callback([
        attendance({ id: attendanceDocId('m2', 'p2'), matchId: 'm2', playerId: 'p2' }),
      ]);
    });
    expect(result.current.responses.has('p-old')).toBe(false);
    expect(result.current.responses.has('p2')).toBe(true);
  });

  it('does not create invalid listeners, handles listener errors and unmounts', async () => {
    const empty = await renderHook(() => useConvocationResponses(''));
    expect(mockCollectionSubscriptions).toHaveLength(0);
    expect(empty.result.current).toMatchObject({ loading: false, error: null });
    expect(empty.result.current.responses.size).toBe(0);

    const { result, unmount } = await renderHook(() => useConvocationResponses('m1'));
    const subscription = mockCollectionSubscriptions[0];

    await act(async () => {
      subscription.onError?.(new Error('permission-denied'));
    });
    expect(result.current.error).toBe('Nao foi possivel carregar as respostas de presenca.');
    expect(result.current.loading).toBe(false);

    await unmount();
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
