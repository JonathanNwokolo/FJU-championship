import {
  generateBracketFixtures,
  generateRoundRobinFixtures,
  getBracketRoundLabel,
  getGroupClassified,
  processKnockoutResult,
} from '../utils/roundRobin';
import { MatchModel, Team } from '../types';

function makeTeam(id: string): Team {
  return {
    id,
    championshipId: 'champ-1',
    name: `Time ${id}`,
    primaryColor: '#111111',
    secondaryColor: '#222222',
    captainId: `cap-${id}`,
    status: 'aprovado',
    inviteCode: 'ABC123',
    createdAt: '2026-01-01',
  };
}

describe('roundRobin', () => {
  describe('generateRoundRobinFixtures', () => {
    it('retorna lista vazia para 0 times', () => {
      expect(generateRoundRobinFixtures([], 'champ-1')).toHaveLength(0);
    });

    it('retorna lista vazia para 1 time', () => {
      expect(generateRoundRobinFixtures([makeTeam('t1')], 'champ-1')).toHaveLength(0);
    });

    it('gera 1 partida para 2 times', () => {
      const matches = generateRoundRobinFixtures([makeTeam('t1'), makeTeam('t2')], 'champ-1');
      expect(matches).toHaveLength(1);
    });

    it('gera 3 partidas para 3 times', () => {
      const matches = generateRoundRobinFixtures(
        [makeTeam('t1'), makeTeam('t2'), makeTeam('t3')],
        'champ-1',
      );
      expect(matches).toHaveLength(3);
    });

    it('gera 6 partidas para 4 times', () => {
      const matches = generateRoundRobinFixtures(
        [makeTeam('t1'), makeTeam('t2'), makeTeam('t3'), makeTeam('t4')],
        'champ-1',
      );
      expect(matches).toHaveLength(6);
    });

    it('nenhum time joga contra si mesmo', () => {
      const teams = [makeTeam('t1'), makeTeam('t2'), makeTeam('t3'), makeTeam('t4')];
      const matches = generateRoundRobinFixtures(teams, 'champ-1');
      for (const m of matches) {
        expect(m.homeTeamId).not.toBe(m.awayTeamId);
      }
    });

    it('cada par de times joga exatamente uma vez', () => {
      const teams = [makeTeam('t1'), makeTeam('t2'), makeTeam('t3'), makeTeam('t4')];
      const matches = generateRoundRobinFixtures(teams, 'champ-1');
      const pares = new Set<string>();
      for (const m of matches) {
        const par = [m.homeTeamId, m.awayTeamId].sort().join(':');
        expect(pares.has(par)).toBe(false);
        pares.add(par);
      }
      expect(pares.size).toBe(6);
    });

    it('todas as partidas iniciam como agendado', () => {
      const matches = generateRoundRobinFixtures([makeTeam('t1'), makeTeam('t2')], 'champ-1');
      expect(matches[0].status).toBe('agendado');
    });

    it('todas as partidas tem placar nulo ao iniciar', () => {
      const matches = generateRoundRobinFixtures([makeTeam('t1'), makeTeam('t2')], 'champ-1');
      expect(matches[0].homeScore).toBeNull();
      expect(matches[0].awayScore).toBeNull();
    });

    it('ignora times duplicados (mesmo id)', () => {
      const teams = [makeTeam('t1'), makeTeam('t1'), makeTeam('t2')];
      const matches = generateRoundRobinFixtures(teams, 'champ-1');
      expect(matches).toHaveLength(1);
    });
  });

  describe('generateBracketFixtures', () => {
    it('retorna lista vazia para 0 times', () => {
      expect(generateBracketFixtures([], 'champ-1')).toHaveLength(0);
    });

    it('retorna lista vazia para 1 time', () => {
      expect(generateBracketFixtures([makeTeam('t1')], 'champ-1')).toHaveLength(0);
    });

    it('gera 1 partida (final) para 2 times', () => {
      const matches = generateBracketFixtures([makeTeam('t1'), makeTeam('t2')], 'champ-1');
      expect(matches).toHaveLength(1);
      expect(matches[0].bracketRound).toBe('final');
    });

    it('gera 3 partidas para 4 times (2 semis + 1 final)', () => {
      const matches = generateBracketFixtures(
        [makeTeam('t1'), makeTeam('t2'), makeTeam('t3'), makeTeam('t4')],
        'champ-1',
      );
      expect(matches).toHaveLength(3);
    });

    it('final nao tem nextMatchId', () => {
      const matches = generateBracketFixtures(
        [makeTeam('t1'), makeTeam('t2'), makeTeam('t3'), makeTeam('t4')],
        'champ-1',
      );
      const final = matches.find((m) => m.bracketRound === 'final');
      expect(final).toBeDefined();
      expect(final?.nextMatchId).toBeNull();
    });

    it('partidas de rodadas anteriores apontam para proxima', () => {
      const matches = generateBracketFixtures(
        [makeTeam('t1'), makeTeam('t2'), makeTeam('t3'), makeTeam('t4')],
        'champ-1',
      );
      const semis = matches.filter((m) => m.bracketRound === 'semi');
      for (const semi of semis) {
        expect(semi.nextMatchId).not.toBeNull();
      }
    });
  });

  describe('processKnockoutResult', () => {
    it('identifica partida final quando nao ha nextMatchId', () => {
      const final: MatchModel = {
        id: 'final',
        championshipId: 'champ-1',
        round: 2,
        homeTeamId: 't1',
        awayTeamId: 't2',
        homeScore: 2,
        awayScore: 0,
        status: 'finalizado',
        nextMatchId: null,
      };
      const result = processKnockoutResult([final], final, 't1');
      expect(result.isFinal).toBe(true);
      expect(result.updatedNextMatch).toBeNull();
    });

    it('avanca vencedor para home quando posicao do bracket e par', () => {
      const nextMatch: MatchModel = {
        id: 'final',
        championshipId: 'champ-1',
        round: 2,
        homeTeamId: '',
        awayTeamId: '',
        homeScore: null,
        awayScore: null,
        status: 'agendado',
        nextMatchId: null,
      };
      const semiMatch: MatchModel = {
        id: 'semi-1',
        championshipId: 'champ-1',
        round: 1,
        homeTeamId: 't1',
        awayTeamId: 't2',
        homeScore: 1,
        awayScore: 0,
        status: 'finalizado',
        nextMatchId: 'final',
        bracketPosition: 0,
      };
      const result = processKnockoutResult([nextMatch, semiMatch], semiMatch, 't1');
      expect(result.isFinal).toBe(false);
      expect(result.updatedNextMatch?.homeTeamId).toBe('t1');
    });

    it('avanca vencedor para away quando posicao do bracket e impar', () => {
      const nextMatch: MatchModel = {
        id: 'final',
        championshipId: 'champ-1',
        round: 2,
        homeTeamId: '',
        awayTeamId: '',
        homeScore: null,
        awayScore: null,
        status: 'agendado',
        nextMatchId: null,
      };
      const semiMatch: MatchModel = {
        id: 'semi-2',
        championshipId: 'champ-1',
        round: 1,
        homeTeamId: 't3',
        awayTeamId: 't4',
        homeScore: 0,
        awayScore: 2,
        status: 'finalizado',
        nextMatchId: 'final',
        bracketPosition: 1,
      };
      const result = processKnockoutResult([nextMatch, semiMatch], semiMatch, 't4');
      expect(result.isFinal).toBe(false);
      expect(result.updatedNextMatch?.awayTeamId).toBe('t4');
    });

    it('retorna isFinal false quando nextMatchId nao encontrado', () => {
      const match: MatchModel = {
        id: 'semi',
        championshipId: 'champ-1',
        round: 1,
        homeTeamId: 't1',
        awayTeamId: 't2',
        homeScore: 1,
        awayScore: 0,
        status: 'finalizado',
        nextMatchId: 'inexistente',
      };
      const result = processKnockoutResult([match], match, 't1');
      expect(result.isFinal).toBe(false);
      expect(result.updatedNextMatch).toBeNull();
    });
  });

  describe('getBracketRoundLabel', () => {
    it('retorna "Final" para a fase final', () => {
      expect(getBracketRoundLabel('final')).toBe('Final');
    });

    it('retorna "Semifinais" para semi', () => {
      expect(getBracketRoundLabel('semi')).toBe('Semifinais');
    });

    it('retorna "Quartas de Final" para quartas', () => {
      expect(getBracketRoundLabel('quartas')).toBe('Quartas de Final');
    });

    it('retorna "Oitavas de Final" para oitavas', () => {
      expect(getBracketRoundLabel('oitavas')).toBe('Oitavas de Final');
    });

    it('retorna "Fase de 16" para fase_16', () => {
      expect(getBracketRoundLabel('fase_16')).toBe('Fase de 16');
    });

    it('retorna "Fase de 32" para fase_32', () => {
      expect(getBracketRoundLabel('fase_32')).toBe('Fase de 32');
    });

    it('retorna "Fase de Grupos" para grupo', () => {
      expect(getBracketRoundLabel('grupo')).toBe('Fase de Grupos');
    });
  });

  describe('getGroupClassified', () => {
    it('classifica o numero correto de times por grupo', () => {
      const groups = { A: [makeTeam('t1'), makeTeam('t2')] };
      const classified = getGroupClassified([], groups, 1);
      expect(classified).toHaveLength(1);
    });

    it('classifica times de multiplos grupos', () => {
      const groups = {
        A: [makeTeam('t1'), makeTeam('t2')],
        B: [makeTeam('t3'), makeTeam('t4')],
      };
      const classified = getGroupClassified([], groups, 1);
      expect(classified).toHaveLength(2);
    });

    it('ordena pelo time com mais pontos', () => {
      const groups = { A: [makeTeam('t1'), makeTeam('t2'), makeTeam('t3')] };
      const matches: MatchModel[] = [
        {
          id: 'm1', championshipId: 'champ-1', round: 1,
          homeTeamId: 't1', awayTeamId: 't2',
          homeScore: 2, awayScore: 0, status: 'finalizado', groupId: 'A',
        },
        {
          id: 'm2', championshipId: 'champ-1', round: 2,
          homeTeamId: 't1', awayTeamId: 't3',
          homeScore: 1, awayScore: 0, status: 'finalizado', groupId: 'A',
        },
      ];
      const classified = getGroupClassified(matches, groups, 1);
      expect(classified[0].id).toBe('t1');
    });

    it('ignora partidas nao finalizadas no calculo', () => {
      const groups = { A: [makeTeam('t1'), makeTeam('t2')] };
      const matches: MatchModel[] = [
        {
          id: 'm1', championshipId: 'champ-1', round: 1,
          homeTeamId: 't2', awayTeamId: 't1',
          homeScore: 3, awayScore: 0, status: 'ao_vivo', groupId: 'A',
        },
      ];
      // Partida ao_vivo nao conta, t1 e t2 com 0 pontos, ordem de insercao e mantida
      const classified = getGroupClassified(matches, groups, 1);
      expect(classified).toHaveLength(1);
    });

    it('classifica 2 por grupo quando solicitado', () => {
      const groups = {
        A: [makeTeam('t1'), makeTeam('t2'), makeTeam('t3')],
        B: [makeTeam('t4'), makeTeam('t5'), makeTeam('t6')],
      };
      const classified = getGroupClassified([], groups, 2);
      expect(classified).toHaveLength(4);
    });
  });
});
