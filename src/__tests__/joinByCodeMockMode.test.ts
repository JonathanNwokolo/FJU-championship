import { Championship, Team } from '../types';

jest.mock('../config/appConfig', () => ({ MOCK_DATA_ENABLED: true }));
jest.mock('../mocks/mockDb', () => ({ getMockActiveUser: jest.fn(() => ({ id: 'user-new' })) }));
jest.mock('../services/firebase', () => ({ auth: {}, db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn(),
  runTransaction: jest.fn(),
  serverTimestamp: jest.fn(() => 'server-timestamp'),
  where: jest.fn(),
}));

const mockGetCollection = jest.fn();
const mockGetDocument = jest.fn();
const mockUpdateDocument = jest.fn();

jest.mock('../services/firestore', () => ({
  addDocument: jest.fn(() => Promise.resolve('player-new')),
  deleteDocument: jest.fn(() => Promise.resolve()),
  getCollection: (...args: unknown[]) => mockGetCollection(...args),
  getDocument: (...args: unknown[]) => mockGetDocument(...args),
  setDocument: jest.fn(() => Promise.resolve('doc-id')),
  updateDocument: (...args: unknown[]) => mockUpdateDocument(...args),
}));

jest.mock('../services/notificationService', () => ({
  notifyJoinRequest: jest.fn(() => Promise.resolve()),
  notifyJoinRequestResult: jest.fn(() => Promise.resolve()),
}));

import { joinByCode } from '../services/inviteService';

const championship: Championship = {
  id: 'champ-1',
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
};

const team: Team = {
  id: 'team-1',
  championshipId: 'champ-1',
  name: 'Time 1',
  primaryColor: '#000',
  secondaryColor: '#fff',
  captainId: 'cap-1',
  status: 'aprovado',
  inviteCode: 'ABC123',
  createdAt: '2026-06-01',
  maxPlayers: 2,
  registrationOpen: true,
  approvedPlayersCount: 0,
};

describe('joinByCode em modo mock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDocument.mockImplementation(async (collectionName: string) =>
      collectionName === 'championships' ? championship : null,
    );
    mockGetCollection.mockImplementation(async (collectionName: string) => {
      if (collectionName === 'teams') return [team];
      if (collectionName === 'players') return [];
      if (collectionName === 'team_invites') return [];
      return [];
    });
  });

  it('incrementa approvedPlayersCount no mesmo contrato do caminho real', async () => {
    await expect(joinByCode('ABC123', 'user-new', 'Novo Atleta')).resolves.toBe('success');

    expect(mockUpdateDocument).toHaveBeenCalledWith('teams', 'team-1', {
      approvedPlayersCount: 1,
    });
  });
});
