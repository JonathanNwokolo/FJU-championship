import {
  isChampionshipFinished,
  isChampionshipInProgress,
  isChampionshipOpen,
  isRegistrationDeadlinePassed,
  isRegistrationOpen,
} from '../utils/championshipStatus';

type StatusSnapshot = {
  status: 'inscricoes_abertas' | 'em_andamento' | 'finalizado';
  registrationsClosed?: boolean;
  registrationDeadline?: string;
};

function champ(
  status: StatusSnapshot['status'],
  overrides: Partial<StatusSnapshot> = {},
): StatusSnapshot {
  return { status, registrationsClosed: false, registrationDeadline: undefined, ...overrides };
}

describe('championshipStatus', () => {
  describe('isChampionshipOpen', () => {
    it('retorna true para inscricoes_abertas sem restricoes', () => {
      expect(isChampionshipOpen(champ('inscricoes_abertas'))).toBe(true);
    });

    it('retorna false quando registrationsClosed e true', () => {
      expect(
        isChampionshipOpen(champ('inscricoes_abertas', { registrationsClosed: true })),
      ).toBe(false);
    });

    it('retorna false quando campeonato esta em andamento', () => {
      expect(isChampionshipOpen(champ('em_andamento'))).toBe(false);
    });

    it('retorna false quando campeonato esta finalizado', () => {
      expect(isChampionshipOpen(champ('finalizado'))).toBe(false);
    });
  });

  describe('isChampionshipInProgress', () => {
    it('retorna true quando em andamento', () => {
      expect(isChampionshipInProgress(champ('em_andamento'))).toBe(true);
    });

    it('retorna false quando inscricoes abertas', () => {
      expect(isChampionshipInProgress(champ('inscricoes_abertas'))).toBe(false);
    });

    it('retorna false quando finalizado', () => {
      expect(isChampionshipInProgress(champ('finalizado'))).toBe(false);
    });
  });

  describe('isChampionshipFinished', () => {
    it('retorna true quando finalizado', () => {
      expect(isChampionshipFinished(champ('finalizado'))).toBe(true);
    });

    it('retorna false quando inscricoes abertas', () => {
      expect(isChampionshipFinished(champ('inscricoes_abertas'))).toBe(false);
    });

    it('retorna false quando em andamento', () => {
      expect(isChampionshipFinished(champ('em_andamento'))).toBe(false);
    });
  });

  describe('isRegistrationOpen', () => {
    it('retorna true para inscricoes_abertas sem bloqueio', () => {
      expect(isRegistrationOpen(champ('inscricoes_abertas'))).toBe(true);
    });

    it('retorna false quando registrationsClosed e true', () => {
      expect(
        isRegistrationOpen(champ('inscricoes_abertas', { registrationsClosed: true })),
      ).toBe(false);
    });

    it('retorna false quando status nao e inscricoes_abertas', () => {
      expect(isRegistrationOpen(champ('em_andamento'))).toBe(false);
      expect(isRegistrationOpen(champ('finalizado'))).toBe(false);
    });
  });

  describe('isRegistrationDeadlinePassed', () => {
    it('retorna false quando nao ha prazo definido', () => {
      expect(isRegistrationDeadlinePassed({ registrationDeadline: undefined })).toBe(false);
    });

    it('retorna true quando prazo ja passou', () => {
      const passado = new Date('2020-01-01').toISOString();
      expect(isRegistrationDeadlinePassed({ registrationDeadline: passado })).toBe(true);
    });

    it('retorna false quando prazo ainda nao chegou', () => {
      const futuro = new Date('2099-12-31').toISOString();
      expect(isRegistrationDeadlinePassed({ registrationDeadline: futuro })).toBe(false);
    });

    it('aceita data de referencia customizada', () => {
      const prazo = new Date('2026-06-01').toISOString();
      const antes = new Date('2026-05-31');
      const depois = new Date('2026-06-02');
      expect(isRegistrationDeadlinePassed({ registrationDeadline: prazo }, antes)).toBe(false);
      expect(isRegistrationDeadlinePassed({ registrationDeadline: prazo }, depois)).toBe(true);
    });
  });
});
