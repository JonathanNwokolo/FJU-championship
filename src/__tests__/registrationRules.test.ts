import {
  canTeamJoinChampionship,
  isTeamAlreadyRegistered,
  isTeamRejectedFromChampionship,
} from '../utils/registrationRules';
import { Championship, Team } from '../types';

function makeTeam(id: string, status: Team['status'] = 'pendente'): Team {
  return {
    id,
    championshipId: 'champ-1',
    name: `Time ${id}`,
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    captainId: `cap-${id}`,
    status,
    inviteCode: 'ABC123',
    createdAt: '2026-01-01',
  };
}

type ChampionshipSlice = Pick<
  Championship,
  'status' | 'registrationsClosed' | 'registrationDeadline' | 'maxTeams'
>;

function makeChampionship(overrides: Partial<ChampionshipSlice> = {}): ChampionshipSlice {
  return {
    status: 'inscricoes_abertas',
    registrationsClosed: false,
    registrationDeadline: undefined,
    maxTeams: undefined,
    ...overrides,
  };
}

const PRAZO_PASSADO = new Date('2020-01-01').toISOString();
const PRAZO_FUTURO = new Date('2099-12-31').toISOString();

describe('registrationRules', () => {
  describe('isTeamAlreadyRegistered', () => {
    const times = [makeTeam('t1'), makeTeam('t2')];

    it('detecta time ja inscrito', () => {
      expect(isTeamAlreadyRegistered(times, 't1')).toBe(true);
    });

    it('nao detecta time nao inscrito', () => {
      expect(isTeamAlreadyRegistered(times, 't99')).toBe(false);
    });

    it('retorna false para lista vazia', () => {
      expect(isTeamAlreadyRegistered([], 't1')).toBe(false);
    });
  });

  describe('isTeamRejectedFromChampionship', () => {
    it('retorna true para time rejeitado', () => {
      expect(isTeamRejectedFromChampionship({ status: 'rejeitado' })).toBe(true);
    });

    it('retorna false para time pendente', () => {
      expect(isTeamRejectedFromChampionship({ status: 'pendente' })).toBe(false);
    });

    it('retorna false para time aprovado', () => {
      expect(isTeamRejectedFromChampionship({ status: 'aprovado' })).toBe(false);
    });
  });

  describe('canTeamJoinChampionship', () => {
    const champ = makeChampionship();
    const novoTime = makeTeam('novo');

    it('permite inscricao quando todas as condicoes sao atendidas', () => {
      const result = canTeamJoinChampionship(champ, novoTime, []);
      expect(result.allowed).toBe(true);
    });

    it('bloqueia quando campeonato nao esta com inscricoes abertas', () => {
      const result = canTeamJoinChampionship(
        makeChampionship({ status: 'em_andamento' }),
        novoTime,
        [],
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('inscricoes_fechadas');
    });

    it('bloqueia quando inscricoes foram fechadas manualmente', () => {
      const result = canTeamJoinChampionship(
        makeChampionship({ registrationsClosed: true }),
        novoTime,
        [],
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('inscricoes_fechadas');
    });

    it('bloqueia quando campeonato esta finalizado', () => {
      const result = canTeamJoinChampionship(
        makeChampionship({ status: 'finalizado' }),
        novoTime,
        [],
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('inscricoes_fechadas');
    });

    it('bloqueia quando prazo de inscricao expirou', () => {
      const result = canTeamJoinChampionship(
        makeChampionship({ registrationDeadline: PRAZO_PASSADO }),
        novoTime,
        [],
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('prazo_expirado');
    });

    it('permite quando prazo de inscricao ainda nao expirou', () => {
      const result = canTeamJoinChampionship(
        makeChampionship({ registrationDeadline: PRAZO_FUTURO }),
        novoTime,
        [],
      );
      expect(result.allowed).toBe(true);
    });

    it('bloqueia time rejeitado independente do status do campeonato', () => {
      const result = canTeamJoinChampionship(champ, makeTeam('t1', 'rejeitado'), []);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('time_rejeitado');
    });

    it('bloqueia time ja inscrito no campeonato', () => {
      const inscrito = [makeTeam('novo')];
      const result = canTeamJoinChampionship(champ, novoTime, inscrito);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('ja_inscrito');
    });

    it('bloqueia quando limite de times foi atingido', () => {
      const inscritos = [makeTeam('t1'), makeTeam('t2')];
      const result = canTeamJoinChampionship(makeChampionship({ maxTeams: 2 }), novoTime, inscritos);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('limite_times_atingido');
    });

    it('permite quando limite de times ainda nao foi atingido', () => {
      const inscritos = [makeTeam('t1')];
      const result = canTeamJoinChampionship(makeChampionship({ maxTeams: 2 }), novoTime, inscritos);
      expect(result.allowed).toBe(true);
    });

    it('permite quando nao ha limite de times definido', () => {
      const muitosInscritos = Array.from({ length: 50 }, (_, i) => makeTeam(`t${i}`));
      const result = canTeamJoinChampionship(champ, novoTime, muitosInscritos);
      expect(result.allowed).toBe(true);
    });
  });
});
