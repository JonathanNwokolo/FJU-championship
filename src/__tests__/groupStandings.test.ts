import type { ChampionshipRules, MatchEvent, MatchModel, Team } from '../types';
import {
  calculateGroupStandings,
  getAllGroupStandings,
  getGroupLeader,
  getProvisionalQualifiers,
} from '../utils/groupStandings';
import { getGroupId } from '../utils/groupStageIds';

const CHAMP = 'champ-standings';
const GROUP_A = getGroupId(CHAMP, 'A');
const GROUP_B = getGroupId(CHAMP, 'B');

const rules: ChampionshipRules = {
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  tiebreakers: [],
  fairPlay: true,
  craqueDaRodada: false,
};

function team(id: string, group: 'A' | 'B' = 'A', seed = 1): Team {
  return {
    id,
    championshipId: CHAMP,
    name: id,
    primaryColor: '#111',
    secondaryColor: '#fff',
    captainId: `cap-${id}`,
    status: 'aprovado',
    inviteCode: id,
    createdAt: '2026-01-01',
    groupId: group === 'A' ? GROUP_A : GROUP_B,
    groupSeed: seed,
    groupAssignmentVersion: 1,
  };
}

function match(overrides: Partial<MatchModel>): MatchModel {
  return {
    id: overrides.id ?? `m-${overrides.homeTeamId}-${overrides.awayTeamId}`,
    championshipId: CHAMP,
    round: 1,
    groupRound: 1,
    stage: 'group',
    groupId: GROUP_A,
    homeTeamId: 'A',
    awayTeamId: 'B',
    homeScore: null,
    awayScore: null,
    status: 'agendado',
    ...overrides,
  };
}

function card(id: string, matchId: string, teamId: string, type: 'cartao_amarelo' | 'cartao_vermelho'): MatchEvent {
  return {
    id,
    matchId,
    championshipId: CHAMP,
    type,
    teamId,
    playerId: `${teamId}-${id}`,
    minute: 10,
  };
}

describe('calculateGroupStandings', () => {
  it('conta vitoria, empate, derrota e ignora status que nao resolvem classificacao', () => {
    const rows = calculateGroupStandings({
      championshipId: CHAMP,
      groupId: 'A',
      teams: [team('A', 'A', 1), team('B', 'A', 2), team('C', 'A', 3)],
      matches: [
        match({ id: 'm1', homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 1, status: 'finalizado' }),
        match({ id: 'm2', homeTeamId: 'A', awayTeamId: 'C', homeScore: 1, awayScore: 1, status: 'finalizado' }),
        match({ id: 'm3', homeTeamId: 'B', awayTeamId: 'C', homeScore: 4, awayScore: 0, status: 'ao_vivo' }),
        match({ id: 'm4', homeTeamId: 'B', awayTeamId: 'C', homeScore: null, awayScore: null, status: 'adiado' }),
        match({ id: 'm5', homeTeamId: 'B', awayTeamId: 'C', homeScore: 3, awayScore: 0, status: 'cancelado' }),
      ],
      rules,
    });

    expect(rows.find((row) => row.teamId === 'A')).toMatchObject({ played: 2, wins: 1, draws: 1, points: 4 });
    expect(rows.find((row) => row.teamId === 'B')).toMatchObject({ played: 1, losses: 1, points: 0 });
    expect(rows.find((row) => row.teamId === 'C')).toMatchObject({ played: 1, draws: 1, points: 1 });
  });

  it('conta W.O. com placar administrativo e sem depender de eventos de gol', () => {
    const rows = calculateGroupStandings({
      championshipId: CHAMP,
      groupId: GROUP_A,
      teams: [team('A', 'A', 1), team('B', 'A', 2)],
      matches: [
        match({
          id: 'wo-1',
          homeTeamId: 'A',
          awayTeamId: 'B',
          homeScore: 3,
          awayScore: 0,
          status: 'wo',
          resultSource: 'wo',
          winnerId: 'A',
        }),
      ],
      events: [
        {
          id: 'goal-ignored',
          matchId: 'wo-1',
          championshipId: CHAMP,
          type: 'gol',
          teamId: 'A',
          playerId: 'p1',
          minute: 1,
        },
      ],
      rules,
    });

    expect(rows[0]).toMatchObject({ teamId: 'A', points: 3, wins: 1, goalsFor: 3, woFor: 1 });
    expect(rows[1]).toMatchObject({ teamId: 'B', losses: 1, goalsAgainst: 3, woAgainst: 1 });
  });

  it('usa mini-tabela para empate triplo e ignora partidas fora do empate', () => {
    const rows = calculateGroupStandings({
      championshipId: CHAMP,
      groupId: 'A',
      teams: [team('A', 'A', 1), team('B', 'A', 2), team('C', 'A', 3), team('D', 'A', 4)],
      matches: [
        match({ id: 'ab', homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 0, status: 'finalizado' }),
        match({ id: 'bc', homeTeamId: 'B', awayTeamId: 'C', homeScore: 2, awayScore: 0, status: 'finalizado' }),
        match({ id: 'ca', homeTeamId: 'C', awayTeamId: 'A', homeScore: 1, awayScore: 0, status: 'finalizado' }),
        match({ id: 'ad', homeTeamId: 'A', awayTeamId: 'D', homeScore: 3, awayScore: 1, status: 'finalizado' }),
        match({ id: 'bd', homeTeamId: 'B', awayTeamId: 'D', homeScore: 3, awayScore: 0, status: 'finalizado' }),
        match({ id: 'cd', homeTeamId: 'C', awayTeamId: 'D', homeScore: 4, awayScore: 0, status: 'finalizado' }),
      ],
      rules,
    });

    expect(rows.slice(0, 3).map((row) => row.teamId)).toEqual(['A', 'B', 'C']);
    expect(rows[0].tiebreakReason).toEqual({ type: 'head_to_head' });
  });

  it('usa menor quantidade de cartoes antes do sorteio deterministico e ignora soft-delete', () => {
    const rows = calculateGroupStandings({
      championshipId: CHAMP,
      groupId: 'A',
      teams: [team('A', 'A', 1), team('B', 'A', 2)],
      matches: [
        match({ id: 'ab', homeTeamId: 'A', awayTeamId: 'B', homeScore: 1, awayScore: 1, status: 'finalizado' }),
      ],
      events: [
        card('y1', 'ab', 'A', 'cartao_amarelo'),
        { ...card('y2', 'ab', 'B', 'cartao_amarelo'), removedAt: '2026-01-01' },
      ],
      rules,
    });

    expect(rows.map((row) => row.teamId)).toEqual(['B', 'A']);
    expect(rows[0].tiebreakReason).toEqual({ type: 'fewest_cards' });
    expect(rows.find((row) => row.teamId === 'A')?.cards).toBe(1);
    expect(rows.find((row) => row.teamId === 'B')?.cards).toBe(0);
  });

  it('usa sorteio tecnico deterministico quando todos os criterios empatam', () => {
    const input = {
      championshipId: CHAMP,
      groupId: 'A',
      teams: [team('A', 'A', 1), team('B', 'A', 2), team('C', 'A', 3)],
      matches: [] as MatchModel[],
      rules,
    };

    const first = calculateGroupStandings(input);
    const second = calculateGroupStandings({ ...input, teams: [...input.teams].reverse() });
    expect(second.map((row) => row.teamId)).toEqual(first.map((row) => row.teamId));
    expect(first.every((row) => row.tiebreakReason?.type === 'deterministic_draw')).toBe(true);
  });

  it('marca classificados apenas quando todas as partidas do grupo estao resolvidas', () => {
    const rows = calculateGroupStandings({
      championshipId: CHAMP,
      groupId: 'A',
      teams: [team('A', 'A', 1), team('B', 'A', 2)],
      matches: [
        match({ id: 'ab', homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 0, status: 'finalizado' }),
      ],
      rules,
      qualifiersPerGroup: 1,
    });

    expect(getGroupLeader(rows)?.teamId).toBe('A');
    expect(getProvisionalQualifiers(rows).map((row) => row.teamId)).toEqual(['A']);
    expect(rows.find((row) => row.teamId === 'B')?.qualifiedStatus).toBe('not_qualified');
  });

  it('rejeita partida de grupo sem stage ou com time fora do grupo', () => {
    expect(() =>
      calculateGroupStandings({
        championshipId: CHAMP,
        groupId: 'A',
        teams: [team('A', 'A', 1), team('B', 'A', 2)],
        matches: [match({ id: 'bad', stage: undefined, groupId: GROUP_A, homeTeamId: 'A', awayTeamId: 'B' })],
        rules,
      }),
    ).toThrow('Partida de grupo precisa de stage explicito.');

    expect(() =>
      calculateGroupStandings({
        championshipId: CHAMP,
        groupId: 'A',
        teams: [team('A', 'A', 1), team('B', 'A', 2), team('X', 'B', 1)],
        matches: [match({ id: 'cross', homeTeamId: 'A', awayTeamId: 'X', homeScore: 1, awayScore: 0, status: 'finalizado' })],
        rules,
      }),
    ).toThrow('Partida contem time fora do grupo.');
  });

  it('selectors retornam classificacoes separadas por grupo', () => {
    const all = getAllGroupStandings({
      championshipId: CHAMP,
      teams: [team('A', 'A', 1), team('B', 'A', 2), team('C', 'B', 1), team('D', 'B', 2)],
      matches: [
        match({ id: 'ab', homeTeamId: 'A', awayTeamId: 'B', homeScore: 1, awayScore: 0, status: 'finalizado' }),
        match({ id: 'cd', groupId: GROUP_B, homeTeamId: 'C', awayTeamId: 'D', homeScore: 0, awayScore: 2, status: 'finalizado' }),
      ],
      rules,
    });

    expect(all.A.map((row) => row.teamId)).toEqual(['A', 'B']);
    expect(all.B.map((row) => row.teamId)).toEqual(['D', 'C']);
  });
});
