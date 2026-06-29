import {
  canAcceptFinalScore,
  canEditMatchEvents,
  activeMatchEvents,
  countGoalEventsByTeam,
  getMatchResult,
  getMatchWinnerId,
  isFinalScoreRequired,
  isMatchDraw,
} from '../utils/matchRules';
import { MatchEvent, MatchModel } from '../types';

describe('matchRules', () => {
  it('partida agendada nao exige placar final', () => {
    expect(isFinalScoreRequired(match({ status: 'agendado' }))).toBe(false);
    expect(canAcceptFinalScore(match({ status: 'agendado', homeScore: null, awayScore: null }))).toBe(true);
  });

  it('partida finalizada aceita placar numerico', () => {
    expect(canAcceptFinalScore(match({ status: 'finalizado', homeScore: 2, awayScore: 1 }))).toBe(true);
    expect(canAcceptFinalScore(match({ status: 'finalizado', homeScore: null, awayScore: 1 }))).toBe(false);
  });

  it('recusa edicao de eventos apos partida finalizada', () => {
    expect(canEditMatchEvents(match({ status: 'agendado' }))).toBe(true);
    expect(canEditMatchEvents(match({ status: 'ao_vivo' }))).toBe(true);
    expect(canEditMatchEvents(match({ status: 'finalizado' }))).toBe(false);
    expect(canEditMatchEvents(null)).toBe(false);
  });

  it('placar determina vencedor mandante', () => {
    const item = match({ homeScore: 3, awayScore: 1 });
    expect(getMatchResult(item)).toBe('home');
    expect(getMatchWinnerId(item)).toBe('home');
  });

  it('placar determina vencedor visitante', () => {
    const item = match({ homeScore: 0, awayScore: 2 });
    expect(getMatchResult(item)).toBe('away');
    expect(getMatchWinnerId(item)).toBe('away');
  });

  it('empate e identificado corretamente', () => {
    const item = match({ homeScore: 2, awayScore: 2 });
    expect(getMatchResult(item)).toBe('draw');
    expect(isMatchDraw(item)).toBe(true);
    expect(getMatchWinnerId(item)).toBeNull();
  });

  it('eventos de gol impactam estatisticas por time', () => {
    const events: MatchEvent[] = [
      event('e1', 'home', 'gol'),
      event('e2', 'home', 'gol'),
      event('e3', 'away', 'assistencia'),
      event('e4', 'away', 'gol'),
    ];

    expect(countGoalEventsByTeam(events)).toEqual({ home: 2, away: 1 });
  });

  it('ignora evento removido por correcao controlada', () => {
    const events: MatchEvent[] = [
      event('e1', 'home', 'gol'),
      { ...event('e2', 'home', 'gol'), removedAt: 'now', removedByCorrectionId: 'corr1' },
      event('e3', 'away', 'gol'),
    ];

    expect(activeMatchEvents(events).map((item) => item.id)).toEqual(['e1', 'e3']);
    expect(countGoalEventsByTeam(events)).toEqual({ home: 1, away: 1 });
  });
});

function match(overrides: Partial<MatchModel>): MatchModel {
  return {
    id: 'match-1',
    championshipId: 'champ-1',
    round: 1,
    homeTeamId: 'home',
    awayTeamId: 'away',
    homeScore: null,
    awayScore: null,
    status: 'agendado',
    ...overrides,
  };
}

function event(id: string, teamId: string, type: MatchEvent['type']): MatchEvent {
  return {
    id,
    matchId: 'match-1',
    championshipId: 'champ-1',
    type,
    teamId,
    playerId: `${teamId}-player`,
    minute: 10,
  };
}
