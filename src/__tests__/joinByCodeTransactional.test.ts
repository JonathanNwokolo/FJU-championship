import { Player, Team, Championship } from '../types';

const mockTransaction = {
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
};
const mockGetDocs = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((_db: unknown, name: string) => ({ path: name })),
  doc: jest.fn((target: unknown, collectionName?: string, id?: string) => ({
    id: id ?? 'new-player-ref',
    path: collectionName ? `${collectionName}/${id}` : `generated/${id ?? 'new-player-ref'}`,
    target,
  })),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  query: jest.fn((collectionRef: unknown, ...constraints: unknown[]) => ({ collectionRef, constraints })),
  runTransaction: jest.fn((_db: unknown, fn: (t: typeof mockTransaction) => Promise<unknown>) =>
    fn(mockTransaction),
  ),
  serverTimestamp: jest.fn(() => 'server-timestamp'),
  where: jest.fn((field: string, operator: string, value: unknown) => ({ field, operator, value })),
}));

jest.mock('../config/appConfig', () => ({ MOCK_DATA_ENABLED: false }));
jest.mock('../services/firebase', () => ({ auth: { currentUser: { uid: 'user-new' } }, db: {} }));

const mockGetCollection = jest.fn();
const mockGetDocument = jest.fn();
const mockUpdateDocument = jest.fn();
const mockDeleteDocument = jest.fn((collectionName: string, id: string) => {
  const path = `${collectionName}/${id}`;
  return Promise.resolve(path).then(() => undefined);
});

jest.mock('../services/firestore', () => ({
  addDocument: jest.fn(() => Promise.resolve('doc-id')),
  deleteDocument: (collectionName: string, id: string) => mockDeleteDocument(collectionName, id),
  getCollection: (...args: unknown[]) => mockGetCollection(...args),
  getDocument: (...args: unknown[]) => mockGetDocument(...args),
  setDocument: jest.fn(() => Promise.resolve('doc-id')),
  updateDocument: (...args: unknown[]) => mockUpdateDocument(...args),
}));

jest.mock('../services/notificationService', () => ({
  notifyJoinRequest: jest.fn(() => Promise.resolve()),
  notifyJoinRequestResult: jest.fn(() => Promise.resolve()),
}));

import { joinByCode, leaveTeam, removePlayerFromRoster } from '../services/inviteService';

const CHAMP_ID = 'champ-1';
const TEAM_ID = 'team-1';
const USER_ID = 'user-new';

function championship(overrides: Partial<Championship> = {}): Championship {
  return {
    id: CHAMP_ID,
    name: 'Copa FJU',
    format: 'pontos_corridos',
    status: 'inscricoes_abertas',
    currentRound: 1,
    totalRounds: 1,
    organizerId: 'org-1',
    inviteCode: 'CHAMP',
    rules: {
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      tiebreakers: ['saldo_gols'],
      fairPlay: true,
      craqueDaRodada: true,
    },
    createdAt: '2026-06-01',
    ...overrides,
  };
}

function team(overrides: Partial<Team> = {}): Team {
  return {
    id: TEAM_ID,
    championshipId: CHAMP_ID,
    name: 'Time 1',
    primaryColor: '#000',
    secondaryColor: '#fff',
    captainId: 'cap-1',
    status: 'aprovado',
    inviteCode: 'ABC123',
    createdAt: '2026-06-01',
    maxPlayers: 2,
    registrationOpen: true,
    ...overrides,
  };
}

function player(id: string, teamId: string, userId: string, status: Player['status'] = 'ativo'): Player {
  return {
    id,
    teamId,
    championshipId: CHAMP_ID,
    userId,
    name: `Jogador ${id}`,
    position: 'meia',
    number: 10,
    status,
  };
}

function snapshot<T extends { id: string }>(docs: T[]) {
  return {
    docs: docs.map((item) => ({
      id: item.id,
      ref: { id: item.id },
      data: () => item,
    })),
  };
}

function arrangeTransaction(currentTeam: Team, currentChampionship = championship()) {
  mockTransaction.get.mockImplementation(async (ref: { id: string }) => {
    if (ref.id === TEAM_ID) {
      return { exists: () => true, id: TEAM_ID, data: () => currentTeam };
    }
    if (ref.id === CHAMP_ID) {
      return { exists: () => true, id: CHAMP_ID, data: () => currentChampionship };
    }
    return { exists: () => true, id: ref.id, data: () => ({ id: ref.id }) };
  });
}

describe('joinByCode transacional', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const currentTeam = team();
    mockGetDocument.mockImplementation(async (collectionName: string) =>
      collectionName === 'championships' ? championship() : null,
    );
    mockGetCollection.mockImplementation(async (collectionName: string) => {
      if (collectionName === 'teams') return [currentTeam];
      if (collectionName === 'players') return [];
      if (collectionName === 'team_invites') return [];
      return [];
    });
    arrangeTransaction(currentTeam);
  });

  it('serializa a ultima vaga incrementando approvedPlayersCount no time', async () => {
    mockGetDocs
      .mockResolvedValueOnce(snapshot([player('p1', TEAM_ID, 'user-1')]))
      .mockResolvedValueOnce(snapshot([]));

    const result = await joinByCode('abc123', USER_ID, 'Novo Atleta');

    expect(result).toBe('success');
    expect(mockTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: TEAM_ID }),
      { approvedPlayersCount: 2 },
    );
    expect(mockTransaction.set).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-player-ref' }),
      expect.objectContaining({ teamId: TEAM_ID, userId: USER_ID, status: 'ativo' }),
    );
    expect(mockTransaction.set).toHaveBeenCalledWith(
      expect.objectContaining({ id: `${TEAM_ID}_${USER_ID}` }),
      expect.objectContaining({ teamId: TEAM_ID, userId: USER_ID, status: 'ativo' }),
    );
  });

  it('repetir a mesma entrada nao cria outro player nem incrementa contador', async () => {
    mockGetDocs
      .mockResolvedValueOnce(snapshot([player('p-existing', TEAM_ID, USER_ID)]))
      .mockResolvedValueOnce(snapshot([]));

    const result = await joinByCode('ABC123', USER_ID, 'Novo Atleta');

    expect(result).toBe('already_member');
    expect(mockTransaction.set).not.toHaveBeenCalled();
    expect(mockTransaction.update).not.toHaveBeenCalled();
  });

  it('bloqueia atleta ja inscrito em outro time no mesmo campeonato durante o retry', async () => {
    mockGetDocs
      .mockResolvedValueOnce(snapshot([player('p1', TEAM_ID, 'user-1')]))
      .mockResolvedValueOnce(snapshot([player('p-other', 'team-2', USER_ID)]));

    const result = await joinByCode('ABC123', USER_ID, 'Novo Atleta');

    expect(result).toBe('already_in_championship');
    expect(mockTransaction.set).not.toHaveBeenCalled();
    expect(mockTransaction.update).not.toHaveBeenCalled();
  });

  it('falha antes da escrita transacional nao altera contador', async () => {
    mockGetDocs.mockRejectedValueOnce(new Error('players query failed'));

    await expect(joinByCode('ABC123', USER_ID, 'Novo Atleta')).rejects.toThrow(
      'players query failed',
    );

    expect(mockTransaction.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: TEAM_ID }),
      expect.objectContaining({ approvedPlayersCount: expect.any(Number) }),
    );
  });

  it('saida voluntaria decrementa approvedPlayersCount e nunca fica negativa', async () => {
    const leaver = player('p-leaver', TEAM_ID, USER_ID);
    const teammate = player('p1', TEAM_ID, 'user-1');
    mockGetDocs
      .mockResolvedValueOnce(snapshot([teammate, leaver]))
      .mockResolvedValueOnce(snapshot([]))
      .mockResolvedValueOnce(snapshot([]));
    mockTransaction.get.mockImplementation(async (ref: { id: string }) => {
      if (ref.id === 'p-leaver') return { exists: () => true, id: ref.id, data: () => leaver };
      if (ref.id === 'p1') return { exists: () => true, id: ref.id, data: () => teammate };
      if (ref.id === TEAM_ID) {
        return { exists: () => true, id: TEAM_ID, data: () => team({ approvedPlayersCount: 2 }) };
      }
      if (ref.id === CHAMP_ID) return { exists: () => true, id: CHAMP_ID, data: () => championship() };
      return { exists: () => true, id: ref.id, data: () => ({}) };
    });

    await expect(leaveTeam('p-leaver', TEAM_ID, CHAMP_ID)).resolves.toBe('success');

    expect(mockTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: TEAM_ID }),
      { approvedPlayersCount: 1 },
    );
  });

  it('saida em dado legado sem contador recalcula a partir do elenco real', async () => {
    const leaver = player('p-leaver', TEAM_ID, USER_ID);
    mockGetDocs
      .mockResolvedValueOnce(snapshot([leaver]))
      .mockResolvedValueOnce(snapshot([]))
      .mockResolvedValueOnce(snapshot([]));
    mockTransaction.get.mockImplementation(async (ref: { id: string }) => {
      if (ref.id === 'p-leaver') return { exists: () => true, id: ref.id, data: () => leaver };
      if (ref.id === TEAM_ID) return { exists: () => true, id: TEAM_ID, data: () => team() };
      if (ref.id === CHAMP_ID) return { exists: () => true, id: CHAMP_ID, data: () => championship() };
      return { exists: () => true, id: ref.id, data: () => ({}) };
    });

    await expect(leaveTeam('p-leaver', TEAM_ID, CHAMP_ID)).resolves.toBe('success');

    expect(mockTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: TEAM_ID }),
      { approvedPlayersCount: 0 },
    );
  });

  it('remocao pelo capitao recalcula approvedPlayersCount apos remover do elenco', async () => {
    const removed = player('p-remove', TEAM_ID, 'user-remove');
    const remaining = player('p1', TEAM_ID, 'user-1');
    mockGetCollection
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([remaining]);

    await expect(removePlayerFromRoster(removed)).resolves.toBe('hard');

    expect(mockDeleteDocument).toHaveBeenCalledWith('players', 'p-remove');
    expect(mockUpdateDocument).toHaveBeenCalledWith('teams', TEAM_ID, {
      approvedPlayersCount: 1,
    });
  });
});
