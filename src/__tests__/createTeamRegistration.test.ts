import { Championship, Team } from '../types';

const mockTransaction = {
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
};
const mockGetDocs = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((_db: unknown, name: string) => ({ path: name })),
  doc: jest.fn((_target: unknown, collectionName?: string, id?: string) => ({
    id: id ?? 'generated-doc',
    path: collectionName ? `${collectionName}/${id}` : `generated/${id ?? 'generated-doc'}`,
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
jest.mock('../services/firebase', () => ({ auth: {}, db: {} }));

const mockGetCollection = jest.fn();

jest.mock('../services/firestore', () => ({
  addDocument: jest.fn(() => Promise.resolve('doc-id')),
  deleteDocument: jest.fn(() => Promise.resolve()),
  getCollection: (...args: unknown[]) => mockGetCollection(...args),
  getDocument: jest.fn(() => Promise.resolve(null)),
  setDocument: jest.fn(() => Promise.resolve('doc-id')),
  updateDocument: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services/notificationService', () => ({
  notifyJoinRequest: jest.fn(() => Promise.resolve()),
  notifyJoinRequestResult: jest.fn(() => Promise.resolve()),
}));

import { createTeamRegistration } from '../services/inviteService';

const CHAMP_ID = 'champ-1';
const CAPTAIN_ID = 'cap-new';
const TEAM_ID = 'team-new';

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
    maxTeams: 2,
    rules: {
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      tiebreakers: ['saldo_gols'],
      fairPlay: true,
      craqueDaRodada: true,
      manualApproval: true,
    },
    createdAt: '2026-06-01',
    ...overrides,
  };
}

function team(id: string, captainId: string, name = id, status: Team['status'] = 'aprovado'): Team {
  return {
    id,
    championshipId: CHAMP_ID,
    name,
    primaryColor: '#000',
    secondaryColor: '#fff',
    captainId,
    status,
    inviteCode: id.slice(0, 6).padEnd(6, 'A').toUpperCase(),
    createdAt: '2026-06-01',
  };
}

function snapshot<T extends { id: string }>(docs: T[]) {
  return {
    docs: docs.map((item) => ({
      id: item.id,
      data: () => item,
    })),
  };
}

function arrangeChampionship(currentChampionship = championship()) {
  mockTransaction.get.mockImplementation(async (ref: { id: string }) => {
    if (ref.id === CHAMP_ID) {
      return { exists: () => true, id: CHAMP_ID, data: () => currentChampionship };
    }
    return { exists: () => false, id: ref.id, data: () => ({}) };
  });
}

async function create() {
  return createTeamRegistration({
    teamId: TEAM_ID,
    championshipId: CHAMP_ID,
    captainId: CAPTAIN_ID,
    name: 'Leoes de Juda',
    primaryColor: '#111111',
    secondaryColor: '#eeeeee',
  });
}

describe('createTeamRegistration transacional', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCollection.mockResolvedValue([]);
    arrangeChampionship();
  });

  it('cria time e convite na ultima vaga e incrementa contador do campeonato', async () => {
    mockGetDocs.mockResolvedValueOnce(snapshot([team('team-1', 'cap-1')]));

    const result = await create();

    expect(result.status).toBe('success');
    expect(mockTransaction.set).toHaveBeenCalledWith(
      expect.objectContaining({ id: TEAM_ID }),
      expect.objectContaining({
        championshipId: CHAMP_ID,
        captainId: CAPTAIN_ID,
        name: 'Leoes de Juda',
        status: 'pendente',
      }),
    );
    expect(mockTransaction.set).toHaveBeenCalledWith(
      expect.objectContaining({ id: TEAM_ID }),
      expect.objectContaining({
        teamId: TEAM_ID,
        championshipId: CHAMP_ID,
        createdBy: CAPTAIN_ID,
        status: 'active',
      }),
    );
    expect(mockTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: CHAMP_ID }),
      { registeredTeamsCount: 2, lastTeamRegistrationId: TEAM_ID },
    );
  });

  it('bloqueia duas criacoes quando maxTeams ja foi atingido', async () => {
    mockGetDocs.mockResolvedValueOnce(snapshot([team('team-1', 'cap-1'), team('team-2', 'cap-2')]));

    const result = await create();

    expect(result.status).toBe('max_teams_reached');
    expect(mockTransaction.set).not.toHaveBeenCalled();
    expect(mockTransaction.update).not.toHaveBeenCalled();
  });

  it('bloqueia capitao tentando criar segundo time no mesmo campeonato', async () => {
    mockGetDocs.mockResolvedValueOnce(snapshot([team('team-1', CAPTAIN_ID)]));

    const result = await create();

    expect(result.status).toBe('captain_already_has_team');
    expect(mockTransaction.set).not.toHaveBeenCalled();
  });

  it('bloqueia nome duplicado entre times nao rejeitados', async () => {
    mockGetDocs.mockResolvedValueOnce(snapshot([team('team-1', 'cap-1', ' Leoes  de Juda ')]));

    const result = await create();

    expect(result.status).toBe('duplicate_name');
    expect(mockTransaction.set).not.toHaveBeenCalled();
  });

  it('bloqueia nome duplicado normalizando maiusculas, acentos e espacos', async () => {
    mockGetDocs.mockResolvedValueOnce(snapshot([team('team-1', 'cap-1', '  LEÕES   DE   JUDÁ ')]));

    const result = await create();

    expect(result.status).toBe('duplicate_name');
    expect(mockTransaction.set).not.toHaveBeenCalled();
  });
});
