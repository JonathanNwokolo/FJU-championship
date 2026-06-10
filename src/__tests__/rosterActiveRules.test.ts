/**
 * Regra central pós-leaveTeam: as firestore.rules impedem o atleta de limpar o
 * próprio teamId, então um player 'sem_time' RETÉM o teamId antigo no documento.
 * Estes testes garantem que:
 *  - sem_time/removido não contam como elenco ativo, vaga, candidato de votação
 *    ou "meu time";
 *  - estatísticas históricas (artilharia) de quem saiu NÃO são apagadas.
 */
import { getCandidatesForRound } from '../services/votingService';
import { calculateTopScorers } from '../services/statsService';
import { isActiveRosterPlayer } from '../utils/teamRules';
import { MatchEvent, MatchModel, Player, Team } from '../types';

jest.mock('../services/firebase', () => ({ auth: {}, db: {} }));
jest.mock('../services/firestore', () => ({
  upsertDocument: jest.fn(() => Promise.resolve()),
  getCollection: jest.fn(() => Promise.resolve([])),
  getDocument: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('../stores/votingStore', () => ({
  useVotingStore: { getState: () => ({ votes: [], addVote: jest.fn() }) },
}));

const CHAMP = 'champ-1';

function makePlayer(
  id: string,
  teamId: string | null,
  status?: Player['status'],
  userId?: string,
): Player {
  return {
    id,
    teamId,
    championshipId: CHAMP,
    userId,
    name: `Jogador ${id}`,
    position: 'meia',
    number: 10,
    status,
  };
}

function makeMatch(id: string, round: number, homeTeamId: string, awayTeamId: string): MatchModel {
  return {
    id,
    championshipId: CHAMP,
    round,
    homeTeamId,
    awayTeamId,
    homeScore: 1,
    awayScore: 0,
    status: 'finalizado',
  };
}

function makeGoal(id: string, matchId: string, playerId: string, teamId: string): MatchEvent {
  return {
    id,
    matchId,
    championshipId: CHAMP,
    type: 'gol',
    teamId,
    playerId,
    minute: 10,
    playerName: `Jogador ${playerId}`,
    teamName: `Time ${teamId}`,
  };
}

describe('rosterActiveRules — sem_time com teamId antigo retido', () => {
  const matches = [makeMatch('m1', 1, 't1', 't2')];

  describe('candidatos de votação (getCandidatesForRound)', () => {
    it('atleta sem_time NAO aparece como candidato mesmo tendo marcado gol na rodada', () => {
      const players = [
        makePlayer('p-ativo', 't1', 'ativo'),
        makePlayer('p-saiu', 't1', 'sem_time'),
      ];
      const events = [
        makeGoal('e1', 'm1', 'p-ativo', 't1'),
        makeGoal('e2', 'm1', 'p-saiu', 't1'),
      ];

      const candidates = getCandidatesForRound(CHAMP, 1, events, players, matches);
      expect(candidates.map((c) => c.id)).toEqual(['p-ativo']);
    });

    it('fallback sem gols: inclui apenas elenco ativo dos times do campeonato', () => {
      const players = [
        makePlayer('p-ativo', 't1', 'ativo'),
        makePlayer('p-suspenso', 't2', 'suspenso'),
        makePlayer('p-saiu', 't1', 'sem_time'),
        makePlayer('p-removido', 't2', 'removido'),
      ];

      const candidates = getCandidatesForRound(CHAMP, 1, [], players, matches);
      expect(candidates.map((c) => c.id).sort()).toEqual(['p-ativo', 'p-suspenso']);
    });
  });

  describe('"meu time" (regra usada nas telas)', () => {
    it('atleta sem_time nao define myTeam', () => {
      const userId = 'user-1';
      const players = [makePlayer('p-saiu', 't1', 'sem_time', userId)];

      const myPlayer = players.find((p) => p.userId === userId && isActiveRosterPlayer(p));
      expect(myPlayer).toBeUndefined();
    });

    it('prefere o doc ativo quando o usuario saiu e entrou em outro time', () => {
      const userId = 'user-1';
      const players = [
        makePlayer('p-antigo', 't1', 'sem_time', userId),
        makePlayer('p-novo', 't2', 'ativo', userId),
      ];

      const myPlayer = players.find((p) => p.userId === userId && isActiveRosterPlayer(p));
      expect(myPlayer?.id).toBe('p-novo');
      expect(myPlayer?.teamId).toBe('t2');
    });
  });

  describe('histórico preservado (calculateTopScorers)', () => {
    it('gols de atleta que saiu do time continuam na artilharia', () => {
      const teams: Team[] = [
        {
          id: 't1',
          championshipId: CHAMP,
          name: 'Time 1',
          primaryColor: '#000',
          secondaryColor: '#fff',
          captainId: 'cap-1',
          status: 'aprovado',
          inviteCode: 'ABC123',
          createdAt: new Date().toISOString(),
        },
      ];
      // Doc do atleta que saiu: status sem_time, teamId antigo retido.
      const players = [makePlayer('p-saiu', 't1', 'sem_time')];
      const events = [
        makeGoal('e1', 'm1', 'p-saiu', 't1'),
        makeGoal('e2', 'm1', 'p-saiu', 't1'),
      ];

      const scorers = calculateTopScorers(events, players, teams);
      expect(scorers).toHaveLength(1);
      expect(scorers[0]).toMatchObject({
        playerId: 'p-saiu',
        playerName: 'Jogador p-saiu',
        teamName: 'Time 1',
        goals: 2,
      });
    });

    it('artilharia funciona mesmo sem o doc do player (snapshot do evento)', () => {
      const scorers = calculateTopScorers([makeGoal('e1', 'm1', 'p-x', 't1')], [], []);
      expect(scorers).toHaveLength(1);
      expect(scorers[0].playerName).toBe('Jogador p-x');
      expect(scorers[0].goals).toBe(1);
    });
  });
});
