/**
 * P1: capacidade do time em approveJoinRequest.
 * As firestore.rules impedem leaveTeam de atualizar teams.approvedPlayersCount,
 * então o contador denormalizado pode continuar "cheio" mesmo havendo vaga real
 * (atleta saiu e virou 'sem_time'). A vaga DEVE ser calculada a partir do elenco
 * real em /players:
 *  - ativo/suspenso/lesionado ocupam vaga;
 *  - sem_time/removido NÃO ocupam vaga.
 * approvedPlayersCount permanece apenas como cache denormalizado, regravado a
 * partir do elenco real a cada aprovação.
 */
import { Player, Team } from '../types';

const mockTransaction = {
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
};
const mockGetDocs = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => 'players-collection'),
  doc: jest.fn((_target: unknown, _col?: string, id?: string) => ({ id: id ?? 'new-player-ref' })),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  query: jest.fn(),
  runTransaction: jest.fn((_db: unknown, fn: (t: typeof mockTransaction) => Promise<unknown>) =>
    fn(mockTransaction),
  ),
  serverTimestamp: jest.fn(() => 'server-timestamp'),
  where: jest.fn(),
}));

jest.mock('../services/firebase', () => ({ auth: {}, db: {} }));

jest.mock('../services/firestore', () => ({
  addDocument: jest.fn(() => Promise.resolve('doc-id')),
  deleteDocument: jest.fn(() => Promise.resolve()),
  getCollection: jest.fn(() => Promise.resolve([])),
  getDocument: jest.fn(() => Promise.resolve(null)),
  updateDocument: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services/notificationService', () => ({
  notifyJoinRequest: jest.fn(() => Promise.resolve()),
  notifyJoinRequestResult: jest.fn(() => Promise.resolve()),
}));

import { approveJoinRequest, nextAvailableNumber } from '../services/inviteService';

const TEAM_ID = 'team-1';

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: TEAM_ID,
    championshipId: 'champ-1',
    name: 'Time 1',
    primaryColor: '#000',
    secondaryColor: '#fff',
    captainId: 'cap-1',
    status: 'aprovado',
    inviteCode: 'ABC123',
    createdAt: '2026-06-01',
    ...overrides,
  };
}

function makePlayer(id: string, status: Player['status'], userId = `user-${id}`): Player {
  return {
    id,
    teamId: TEAM_ID,
    championshipId: 'champ-1',
    userId,
    name: `Jogador ${id}`,
    position: 'meia',
    number: 10,
    status,
  };
}

function givenTeam(team: Team) {
  mockTransaction.get.mockResolvedValue({
    exists: () => true,
    id: team.id,
    data: () => team,
  });
}

function givenRoster(players: Player[]) {
  mockGetDocs.mockResolvedValue({
    docs: players.map((p) => ({ id: p.id, data: () => p })),
  });
}

describe('approveJoinRequest — vaga real do elenco, não approvedPlayersCount', () => {
  it('contador antigo "cheio" + um sem_time no elenco: aprova (vaga real existe)', async () => {
    // leaveTeam não conseguiu decrementar o contador: continua 3/3, mas p3 saiu.
    givenTeam(makeTeam({ maxPlayers: 3, approvedPlayersCount: 3 }));
    givenRoster([
      makePlayer('p1', 'ativo'),
      makePlayer('p2', 'ativo'),
      makePlayer('p3', 'sem_time'),
    ]);

    const result = await approveJoinRequest(TEAM_ID, 'user-novo', 'Novo Atleta', '');

    expect(result).toBe('success');
    expect(mockTransaction.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ teamId: TEAM_ID, userId: 'user-novo', status: 'ativo' }),
    );
    // Cache denormalizado re-sincronizado com o elenco real: 2 ativos + 1 novo.
    expect(mockTransaction.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ approvedPlayersCount: 3 }),
    );
  });

  it('sem_time não conta para lotação', async () => {
    givenTeam(makeTeam({ maxPlayers: 2, approvedPlayersCount: 2 }));
    givenRoster([makePlayer('p1', 'ativo'), makePlayer('p2', 'sem_time')]);

    expect(await approveJoinRequest(TEAM_ID, 'user-novo', 'Novo Atleta', '')).toBe('success');
  });

  it('removido não conta para lotação', async () => {
    givenTeam(makeTeam({ maxPlayers: 2, approvedPlayersCount: 2 }));
    givenRoster([makePlayer('p1', 'ativo'), makePlayer('p2', 'removido')]);

    expect(await approveJoinRequest(TEAM_ID, 'user-novo', 'Novo Atleta', '')).toBe('success');
  });

  it('suspenso e lesionado ocupam vaga: time cheio retorna full', async () => {
    // Contador stale para BAIXO também não é confiável: a vaga vem do elenco real.
    givenTeam(makeTeam({ maxPlayers: 3, approvedPlayersCount: 0 }));
    givenRoster([
      makePlayer('p1', 'ativo'),
      makePlayer('p2', 'suspenso'),
      makePlayer('p3', 'lesionado'),
    ]);

    expect(await approveJoinRequest(TEAM_ID, 'user-novo', 'Novo Atleta', '')).toBe('full');
    expect(mockTransaction.set).not.toHaveBeenCalled();
  });

  it('elenco realmente cheio retorna full mesmo com approvedPlayersCount zerado', async () => {
    givenTeam(makeTeam({ maxPlayers: 2, approvedPlayersCount: 0 }));
    givenRoster([makePlayer('p1', 'ativo'), makePlayer('p2', 'ativo')]);

    expect(await approveJoinRequest(TEAM_ID, 'user-novo', 'Novo Atleta', '')).toBe('full');
  });

  it('requester já ativo no elenco retorna already_member', async () => {
    givenTeam(makeTeam({ maxPlayers: 5 }));
    givenRoster([makePlayer('p1', 'ativo', 'user-x')]);

    expect(await approveJoinRequest(TEAM_ID, 'user-x', 'Atleta X', '')).toBe('already_member');
    expect(mockTransaction.set).not.toHaveBeenCalled();
  });

  it('requester sem_time no elenco pode ser re-aprovado (não é already_member)', async () => {
    givenTeam(makeTeam({ maxPlayers: 5 }));
    givenRoster([makePlayer('p1', 'sem_time', 'user-x'), makePlayer('p2', 'ativo')]);

    expect(await approveJoinRequest(TEAM_ID, 'user-x', 'Atleta X', '')).toBe('success');
  });

  it('time inexistente retorna team_not_found', async () => {
    mockTransaction.get.mockResolvedValue({ exists: () => false });
    givenRoster([]);

    expect(await approveJoinRequest(TEAM_ID, 'user-novo', 'Novo Atleta', '')).toBe(
      'team_not_found',
    );
  });

  it('sugere numero ignorando atletas sem_time e removido', () => {
    const roster = [
      { ...makePlayer('p1', 'ativo'), number: 1 },
      { ...makePlayer('p2', 'sem_time'), number: 2 },
      { ...makePlayer('p3', 'removido'), number: 3 },
      { ...makePlayer('p4', 'suspenso'), number: 4 },
      { ...makePlayer('p5', 'lesionado'), number: 5 },
    ];

    expect(nextAvailableNumber(roster)).toBe(2);
  });
});
