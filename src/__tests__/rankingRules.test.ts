import { calculateOverall } from '../utils/playerOverall';
import {
  calculateAssistRanking,
  calculateCardRanking,
  calculateGoalRanking,
  getBestPlayerFromRoundAward,
} from '../utils/rankingRules';
import { MatchEvent, Player, RoundAward, Team } from '../types';

const teams: Team[] = [
  team('t1', 'Time Um'),
  team('t2', 'Time Dois'),
];

const players: Player[] = [
  player('p1', 'Ana', 't1'),
  player('p2', 'Bia', 't1'),
  player('p3', 'Caio', 't2'),
];

describe('rankingRules', () => {
  it('monta ranking de artilheiros por eventos de gol', () => {
    const ranking = calculateGoalRanking(
      [
        event('e1', 'gol', 'p1', 't1'),
        event('e2', 'gol', 'p1', 't1'),
        event('e3', 'gol', 'p3', 't2'),
      ],
      players,
      teams,
    );

    expect(ranking.map((item) => [item.playerId, item.goals])).toEqual([
      ['p1', 2],
      ['p3', 1],
    ]);
  });

  it('monta ranking de assistencias por eventos de assistencia', () => {
    const ranking = calculateAssistRanking(
      [
        event('e1', 'assistencia', 'p2', 't1'),
        event('e2', 'assistencia', 'p2', 't1'),
        event('e3', 'assistencia', 'p3', 't2'),
      ],
      players,
      teams,
    );

    expect(ranking.map((item) => [item.playerId, item.assists])).toEqual([
      ['p2', 2],
      ['p3', 1],
    ]);
  });

  it('monta ranking de cartoes priorizando vermelhos e depois amarelos', () => {
    const ranking = calculateCardRanking(
      [
        event('e1', 'cartao_amarelo', 'p1', 't1'),
        event('e2', 'cartao_amarelo', 'p1', 't1'),
        event('e3', 'cartao_vermelho', 'p3', 't2'),
      ],
      players,
      teams,
    );

    expect(ranking[0]).toMatchObject({ playerId: 'p3', redCards: 1 });
    expect(ranking[1]).toMatchObject({ playerId: 'p1', yellowCards: 2 });
  });

  it('identifica melhor jogador a partir do premio de rodada existente', () => {
    const award: RoundAward = {
      id: 'award-1',
      championshipId: 'champ-1',
      round: 1,
      winnerPlayerId: 'p1',
      winnerName: 'Ana',
      winnerTeamId: 't1',
      totalVotes: 7,
      closedAt: '2026-06-08',
    };

    expect(getBestPlayerFromRoundAward(award)).toEqual({
      playerId: 'p1',
      playerName: 'Ana',
      teamId: 't1',
      votes: 7,
    });
  });

  it('mantem regra existente de overall dos atletas', () => {
    expect(calculateOverall(5, 1, 0, 3)).toBeGreaterThan(calculateOverall(0, 1, 0, 3));
  });
});

function team(id: string, name: string): Team {
  return {
    id,
    championshipId: 'champ-1',
    name,
    primaryColor: '#123456',
    secondaryColor: '#654321',
    captainId: `${id}-captain`,
    status: 'aprovado',
    inviteCode: 'ABC123',
    createdAt: '2026-06-08',
  };
}

function player(id: string, name: string, teamId: string): Player {
  return {
    id,
    teamId,
    championshipId: 'champ-1',
    name,
    position: 'atacante',
    number: 9,
  };
}

function event(
  id: string,
  type: MatchEvent['type'],
  playerId: string,
  teamId: string,
): MatchEvent {
  return {
    id,
    matchId: 'match-1',
    championshipId: 'champ-1',
    type,
    teamId,
    playerId,
    minute: 12,
  };
}
