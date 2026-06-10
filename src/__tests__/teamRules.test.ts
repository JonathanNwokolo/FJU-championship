import {
  countActivePlayersInTeam,
  isDuplicatePlayerInTeam,
  isPlayerActive,
  isPlayerActiveInTeam,
  isTeamCaptain,
  isTeamFull,
  validateTeamName,
} from '../utils/teamRules';
import { Player } from '../types';

function makePlayer(
  id: string,
  teamId: string | null,
  status?: Player['status'],
): Player {
  return {
    id,
    teamId,
    name: `Jogador ${id}`,
    position: 'atacante',
    number: 9,
    status,
  };
}

describe('teamRules', () => {
  describe('validateTeamName', () => {
    it('rejeita nome vazio', () => {
      expect(validateTeamName('').valid).toBe(false);
      expect(validateTeamName('').error).toBe('nome_obrigatorio');
    });

    it('rejeita nome com apenas espacos', () => {
      expect(validateTeamName('   ').valid).toBe(false);
      expect(validateTeamName('   ').error).toBe('nome_obrigatorio');
    });

    it('rejeita nome com apenas 1 caractere', () => {
      expect(validateTeamName('A').valid).toBe(false);
      expect(validateTeamName('A').error).toBe('nome_muito_curto');
    });

    it('aceita nome com 2 caracteres', () => {
      expect(validateTeamName('FC').valid).toBe(true);
    });

    it('aceita nome longo', () => {
      expect(validateTeamName('Real Madrid CF').valid).toBe(true);
    });
  });

  describe('isTeamCaptain', () => {
    it('identifica capitao correto', () => {
      expect(isTeamCaptain('user-1', { captainId: 'user-1' })).toBe(true);
    });

    it('rejeita usuario que nao e capitao', () => {
      expect(isTeamCaptain('user-2', { captainId: 'user-1' })).toBe(false);
    });

    it('capitao pode gerenciar somente o proprio time', () => {
      const ownTeam = { captainId: 'cap-1' };
      const otherTeam = { captainId: 'cap-2' };
      expect(isTeamCaptain('cap-1', ownTeam)).toBe(true);
      expect(isTeamCaptain('cap-1', otherTeam)).toBe(false);
    });
  });

  describe('isDuplicatePlayerInTeam', () => {
    const players = [
      makePlayer('p1', 't1'),
      makePlayer('p2', 't1'),
      makePlayer('p3', 't2'),
    ];

    it('detecta atleta duplicado no mesmo time', () => {
      expect(isDuplicatePlayerInTeam(players, 'p1', 't1')).toBe(true);
    });

    it('nao detecta atleta de outro time como duplicado', () => {
      expect(isDuplicatePlayerInTeam(players, 'p3', 't1')).toBe(false);
    });

    it('nao detecta atleta inexistente como duplicado', () => {
      expect(isDuplicatePlayerInTeam(players, 'p99', 't1')).toBe(false);
    });

    it('nao considera atleta removido como duplicado', () => {
      const withRemoved = [makePlayer('p4', 't1', 'removido')];
      expect(isDuplicatePlayerInTeam(withRemoved, 'p4', 't1')).toBe(false);
    });

    it('retorna false para lista vazia', () => {
      expect(isDuplicatePlayerInTeam([], 'p1', 't1')).toBe(false);
    });
  });

  describe('isPlayerActiveInTeam', () => {
    const players = [
      makePlayer('p1', 't1'),
      makePlayer('p2', 't1', 'removido'),
      makePlayer('p3', 't1', 'suspenso'),
    ];

    it('retorna true para atleta ativo no time', () => {
      expect(isPlayerActiveInTeam(players, 'p1', 't1')).toBe(true);
    });

    it('retorna false para atleta removido', () => {
      expect(isPlayerActiveInTeam(players, 'p2', 't1')).toBe(false);
    });

    it('retorna true para atleta suspenso (ainda esta no elenco)', () => {
      expect(isPlayerActiveInTeam(players, 'p3', 't1')).toBe(true);
    });

    it('retorna false para atleta que nao esta no time', () => {
      expect(isPlayerActiveInTeam(players, 'p99', 't1')).toBe(false);
    });
  });

  describe('isTeamFull', () => {
    const players = [
      makePlayer('p1', 't1'),
      makePlayer('p2', 't1'),
      makePlayer('p3', 't1', 'removido'),
    ];

    it('considera time cheio quando atinge limite', () => {
      expect(isTeamFull(players, 2)).toBe(true);
    });

    it('nao considera time cheio abaixo do limite', () => {
      expect(isTeamFull(players, 3)).toBe(false);
    });

    it('ignora atletas removidos na contagem de lotacao', () => {
      // 2 ativos + 1 removido = 2 validos. Limite 2 = cheio
      expect(isTeamFull(players, 2)).toBe(true);
    });

    it('retorna false para lista vazia', () => {
      expect(isTeamFull([], 5)).toBe(false);
    });
  });

  describe('countActivePlayersInTeam', () => {
    const players = [
      makePlayer('p1', 't1'),
      makePlayer('p2', 't1'),
      makePlayer('p3', 't1', 'removido'),
      makePlayer('p4', 't2'),
    ];

    it('conta somente atletas ativos do time', () => {
      expect(countActivePlayersInTeam(players, 't1')).toBe(2);
    });

    it('ignora atletas de outros times', () => {
      expect(countActivePlayersInTeam(players, 't2')).toBe(1);
    });

    it('retorna 0 para time sem atletas', () => {
      expect(countActivePlayersInTeam(players, 't99')).toBe(0);
    });

    it('retorna 0 para lista vazia', () => {
      expect(countActivePlayersInTeam([], 't1')).toBe(0);
    });
  });

  describe('isPlayerActive', () => {
    it('considera ativo jogador sem status definido', () => {
      expect(isPlayerActive(makePlayer('p1', 't1', undefined))).toBe(true);
    });

    it('considera ativo jogador com status ativo', () => {
      expect(isPlayerActive(makePlayer('p1', 't1', 'ativo'))).toBe(true);
    });

    it('considera inativo jogador suspenso', () => {
      expect(isPlayerActive(makePlayer('p1', 't1', 'suspenso'))).toBe(false);
    });

    it('considera inativo jogador lesionado', () => {
      expect(isPlayerActive(makePlayer('p1', 't1', 'lesionado'))).toBe(false);
    });

    it('considera inativo jogador removido', () => {
      expect(isPlayerActive(makePlayer('p1', 't1', 'removido'))).toBe(false);
    });

    it('considera inativo jogador sem time', () => {
      expect(isPlayerActive(makePlayer('p1', null, 'sem_time'))).toBe(false);
    });
  });
});
