import { MatchEvent, MatchModel } from '../types';

export type MatchResult = 'home' | 'away' | 'draw' | 'pending';

export function isFinalScoreRequired(match: Pick<MatchModel, 'status'>): boolean {
  return match.status === 'finalizado';
}

export function canAcceptFinalScore(
  match: Pick<MatchModel, 'status' | 'homeScore' | 'awayScore'>,
): boolean {
  if (match.status !== 'finalizado') return true;
  return typeof match.homeScore === 'number' && typeof match.awayScore === 'number';
}

export function canEditMatchEvents(match: Pick<MatchModel, 'status'> | null | undefined): boolean {
  return !!match && match.status !== 'finalizado';
}

export function isActiveMatchEvent(event: MatchEvent): boolean {
  return !event.removedAt && !event.removedByCorrectionId;
}

export function activeMatchEvents(events: MatchEvent[]): MatchEvent[] {
  return events.filter(isActiveMatchEvent);
}

export function getMatchResult(
  match: Pick<MatchModel, 'homeScore' | 'awayScore'>,
): MatchResult {
  if (match.homeScore == null || match.awayScore == null) return 'pending';
  if (match.homeScore > match.awayScore) return 'home';
  if (match.awayScore > match.homeScore) return 'away';
  return 'draw';
}

export function getMatchWinnerId(
  match: Pick<MatchModel, 'homeTeamId' | 'awayTeamId' | 'homeScore' | 'awayScore'>,
): string | null {
  const result = getMatchResult(match);
  if (result === 'home') return match.homeTeamId;
  if (result === 'away') return match.awayTeamId;
  return null;
}

export function isMatchDraw(match: Pick<MatchModel, 'homeScore' | 'awayScore'>): boolean {
  return getMatchResult(match) === 'draw';
}

export function countGoalEventsByTeam(events: MatchEvent[]): Record<string, number> {
  return activeMatchEvents(events).reduce<Record<string, number>>((acc, event) => {
    if (event.type !== 'gol') return acc;
    acc[event.teamId] = (acc[event.teamId] ?? 0) + 1;
    return acc;
  }, {});
}
