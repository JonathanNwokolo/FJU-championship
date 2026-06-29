import { closeVoting } from '../services/votingService';
import * as firestore from '../services/firestore';
import { Player, RoundAward, RoundVote } from '../types';

jest.mock('../services/firestore');

const getCollectionMock = firestore.getCollection as jest.Mock;
const setDocumentMock = firestore.setDocument as jest.Mock;

function player(id: string, name: string, teamId: string): Player {
  return { id, teamId, name, position: 'meia', number: 1, status: 'ativo' };
}

describe('votingService.closeVoting (P-05 idempotência)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retorna null e não grava quando não há votos', async () => {
    getCollectionMock.mockImplementation(async () => []);
    const res = await closeVoting('champ-1', 1, []);
    expect(res).toBeNull();
    expect(setDocumentMock).not.toHaveBeenCalled();
  });

  it('cria prêmio com id determinístico champ_round quando há votos', async () => {
    const votes: RoundVote[] = [
      { id: 'v1', championshipId: 'champ-1', round: 1, voterId: 'u1', candidatePlayerId: 'p1', createdAt: '' },
      { id: 'v2', championshipId: 'champ-1', round: 1, voterId: 'u2', candidatePlayerId: 'p1', createdAt: '' },
      { id: 'v3', championshipId: 'champ-1', round: 1, voterId: 'u3', candidatePlayerId: 'p2', createdAt: '' },
    ];
    getCollectionMock.mockImplementation(async (col: string) =>
      col === 'round_votes' ? votes : [],
    );
    setDocumentMock.mockResolvedValue('champ-1_1');

    const res = await closeVoting('champ-1', 1, [
      player('p1', 'Alpha', 't1'),
      player('p2', 'Beta', 't2'),
    ]);

    expect(res).not.toBeNull();
    expect(res!.created).toBe(true);
    expect(res!.award.id).toBe('champ-1_1');
    expect(res!.award.winnerPlayerId).toBe('p1');
    expect(res!.award.winnerName).toBe('Alpha');
    expect(res!.award.totalVotes).toBe(3);
    expect(setDocumentMock).toHaveBeenCalledTimes(1);
    expect(setDocumentMock).toHaveBeenCalledWith(
      'round_awards',
      'champ-1_1',
      expect.objectContaining({ id: 'champ-1_1', winnerPlayerId: 'p1' }),
    );
  });

  it('não cria novo prêmio se a rodada já foi encerrada (idempotente)', async () => {
    const existing: RoundAward = {
      id: 'champ-1_1',
      championshipId: 'champ-1',
      round: 1,
      winnerPlayerId: 'p1',
      winnerName: 'Alpha',
      winnerTeamId: 't1',
      totalVotes: 5,
      closedAt: 'x',
    };
    getCollectionMock.mockImplementation(async (col: string) =>
      col === 'round_awards' ? [existing] : [],
    );

    const res = await closeVoting('champ-1', 1, []);

    expect(res).not.toBeNull();
    expect(res!.created).toBe(false);
    expect(res!.award).toEqual(existing);
    expect(setDocumentMock).not.toHaveBeenCalled();
  });
  it('prefere award deterministico quando existem legados com id automatico', async () => {
    const legacy: RoundAward = {
      id: 'auto-id',
      championshipId: 'champ-1',
      round: 1,
      winnerPlayerId: 'p2',
      winnerName: 'Beta',
      winnerTeamId: 't2',
      totalVotes: 2,
      closedAt: 'old',
    };
    const deterministic: RoundAward = {
      id: 'champ-1_1',
      championshipId: 'champ-1',
      round: 1,
      winnerPlayerId: 'p1',
      winnerName: 'Alpha',
      winnerTeamId: 't1',
      totalVotes: 5,
      closedAt: 'new',
    };
    getCollectionMock.mockImplementation(async (col: string) =>
      col === 'round_awards' ? [legacy, deterministic] : [],
    );

    const res = await closeVoting('champ-1', 1, []);

    expect(res?.created).toBe(false);
    expect(res?.award).toEqual(deterministic);
    expect(setDocumentMock).not.toHaveBeenCalled();
  });
});
