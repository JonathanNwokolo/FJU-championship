import {
  calculateStandings,
  calculateTopScorers,
  getPlayerSuspensionReason,
} from '../services/statsService';
import { ChampionshipRules, MatchEvent, MatchModel, Player, Team } from '../types';

const rules: ChampionshipRules = {
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  tiebreakers: ['saldo_gols', 'gols_pro', 'confronto_direto', 'fair_play'],
  fairPlay: true,
  craqueDaRodada: true,
  yellowCardLimit: 2,
};

describe('match correction derived stats', () => {
  it('vitoria vira empate quando placar corrigido muda a classificacao', () => {
    const standings = calculateStandings(
      [match('m1', 'A', 'B', 1, 1)],
      [
        event('g1', 'gol', 'A', 'p1'),
        { ...event('g2', 'gol', 'A', 'p1'), removedAt: 'now', removedByCorrectionId: 'corr1' },
        event('g3', 'gol', 'B', 'p2'),
      ],
      [team('A'), team('B')],
      rules,
    );

    expect(standings.find((item) => item.teamId === 'A')).toMatchObject({
      points: 1,
      drawn: 1,
      goalsFor: 1,
    });
    expect(standings.find((item) => item.teamId === 'B')).toMatchObject({
      points: 1,
      drawn: 1,
      goalsFor: 1,
    });
  });

  it('gol removido sai da artilharia', () => {
    const scorers = calculateTopScorers(
      [
        event('g1', 'gol', 'A', 'p1'),
        { ...event('g2', 'gol', 'A', 'p1'), removedAt: 'now', removedByCorrectionId: 'corr1' },
        event('g3', 'gol', 'B', 'p2'),
      ],
      [player('p1', 'Ana', 'A'), player('p2', 'Bia', 'B')],
      [team('A'), team('B')],
    );

    expect(scorers.map((item) => [item.playerId, item.goals])).toEqual([
      ['p1', 1],
      ['p2', 1],
    ]);
  });

  it('cartao removido desfaz suspensao por amarelos acumulados', () => {
    const matches = [match('m1', 'A', 'B', 1, 0), match('m2', 'A', 'B', 1, 0)];
    const reason = getPlayerSuspensionReason(
      [
        event('c1', 'cartao_amarelo', 'A', 'p1', 1),
        { ...event('c2', 'cartao_amarelo', 'A', 'p1', 2), removedAt: 'now', removedByCorrectionId: 'corr1' },
      ],
      matches,
      'p1',
      3,
      2,
    );

    expect(reason).toBeNull();
  });
});

function team(id: string): Team {
  return {
    id,
    championshipId: 'champ',
    name: id,
    primaryColor: '#123',
    secondaryColor: '#fff',
    captainId: `${id}-cap`,
    status: 'aprovado',
    inviteCode: id,
    createdAt: 'now',
  };
}

function player(id: string, name: string, teamId: string): Player {
  return {
    id,
    name,
    teamId,
    championshipId: 'champ',
    position: 'atacante',
    number: 9,
  };
}

function match(
  id: string,
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number,
  awayScore: number,
): MatchModel {
  return {
    id,
    championshipId: 'champ',
    round: Number(id.replace(/\D/g, '')) || 1,
    homeTeamId,
    awayTeamId,
    homeScore,
    awayScore,
    status: 'finalizado',
  };
}

function event(
  id: string,
  type: MatchEvent['type'],
  teamId: string,
  playerId: string,
  round = 1,
): MatchEvent {
  return {
    id,
    matchId: `m${round}`,
    championshipId: 'champ',
    type,
    teamId,
    playerId,
    minute: 10,
  };
}
