import { Championship } from '../types';

export function isChampionshipOpen(
  championship: Pick<Championship, 'status' | 'registrationsClosed'>,
): boolean {
  return championship.status === 'inscricoes_abertas' && !championship.registrationsClosed;
}

export function isChampionshipInProgress(
  championship: Pick<Championship, 'status'>,
): boolean {
  return championship.status === 'em_andamento';
}

export function isChampionshipFinished(
  championship: Pick<Championship, 'status'>,
): boolean {
  return championship.status === 'finalizado';
}

export function isRegistrationOpen(
  championship: Pick<Championship, 'status' | 'registrationsClosed'>,
): boolean {
  return championship.status === 'inscricoes_abertas' && !championship.registrationsClosed;
}

export function isRegistrationDeadlinePassed(
  championship: Pick<Championship, 'registrationDeadline'>,
  now: Date = new Date(),
): boolean {
  if (!championship.registrationDeadline) return false;
  return new Date(championship.registrationDeadline) < now;
}
