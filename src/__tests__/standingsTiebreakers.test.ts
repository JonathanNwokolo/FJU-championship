import { calculateStandings } from '../services/statsService';
import { Team, MatchModel, ChampionshipRules } from '../types';

// Fixtures mínimas: o calculateStandings só lê id/name/primaryColor dos times e
// id/round/teamIds/score/status das partidas. Usamos casts para manter conciso.
const team = (id: string): Team => ({ id, name: id, primaryColor: '#fff' } as Team);

const match = (
  id: string,
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number,
  awayScore: number,
): MatchModel =>
  ({
    id,
    championshipId: 'c1',
    round: 1,
    homeTeamId,
    awayTeamId,
    homeScore,
    awayScore,
    status: 'finalizado',
  } as MatchModel);

const rules = (tiebreakers: string[]): ChampionshipRules => ({
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  tiebreakers,
  fairPlay: true,
  craqueDaRodada: true,
});

describe('calculateStandings — desempate por confronto direto (P-13)', () => {
  it('empate triplo é resolvido pela MINI-TABELA entre os empatados, não par-a-par', () => {
    // A vence B e C; B vence C → entre eles A(6) > B(3) > C(0).
    // Partidas extras contra D igualam os três em 6 pontos no geral.
    const teams = [team('A'), team('B'), team('C'), team('D')];
    const matches = [
      match('m1', 'A', 'B', 1, 0), // A bate B
      match('m2', 'A', 'C', 1, 0), // A bate C   → A h2h = 6
      match('m3', 'B', 'C', 1, 0), // B bate C   → B h2h = 3, C h2h = 0
      match('m4', 'B', 'D', 1, 0), // B +3       → B geral = 6
      match('m5', 'C', 'D', 1, 0), // C +3
      match('m6', 'C', 'D', 1, 0), // C +3       → C geral = 6
      match('m7', 'A', 'D', 0, 1), // A perde p/ D → A geral fica em 6
    ];

    const standings = calculateStandings(matches, [], teams, rules(['confronto_direto']));

    // Os três empatados em pontos; a mini-tabela ordena A > B > C.
    expect(standings.slice(0, 3).map((s) => s.teamId)).toEqual(['A', 'B', 'C']);
    expect(standings.every((s) => s.points === 6 || s.teamId === 'D')).toBe(true);
    expect(standings[3].teamId).toBe('D');
  });

  it('empate duplo usa o saldo dentro do confronto direto', () => {
    // A e B trocam vitórias (1 cada) → mesmos pontos no h2h, mas A tem saldo melhor
    // no recorte (venceu por 2, perdeu por 1).
    const teams = [team('A'), team('B')];
    const matches = [
      match('m1', 'A', 'B', 2, 0),
      match('m2', 'B', 'A', 1, 0),
    ];

    const standings = calculateStandings(matches, [], teams, rules(['confronto_direto']));
    expect(standings.map((s) => s.teamId)).toEqual(['A', 'B']);
  });

  it('saldo de gols geral continua valendo antes do confronto direto', () => {
    // A e B nunca se enfrentaram; A tem saldo geral melhor.
    const teams = [team('A'), team('B'), team('C')];
    const matches = [
      match('m1', 'A', 'C', 3, 0), // A: 3 pts, saldo +3
      match('m2', 'B', 'C', 1, 0), // B: 3 pts, saldo +1
    ];

    const standings = calculateStandings(
      matches,
      [],
      teams,
      rules(['saldo_gols', 'confronto_direto']),
    );
    expect(standings.map((s) => s.teamId)).toEqual(['A', 'B', 'C']);
  });

  it('ciclo perfeito (A>B>C>A) mantém todos na tabela sem quebrar', () => {
    const teams = [team('A'), team('B'), team('C')];
    const matches = [
      match('m1', 'A', 'B', 1, 0),
      match('m2', 'B', 'C', 1, 0),
      match('m3', 'C', 'A', 1, 0),
    ];

    const standings = calculateStandings(matches, [], teams, rules(['confronto_direto']));
    expect(standings).toHaveLength(3);
    expect(standings.map((s) => s.teamId).sort()).toEqual(['A', 'B', 'C']);
    expect(standings.every((s) => s.points === 3)).toBe(true);
  });

  it('inclui apenas times aprovados e preserva aprovado sem jogos', () => {
    const teams: Team[] = [
      { ...team('A'), status: 'aprovado' },
      { ...team('B'), status: 'pendente' },
      { ...team('C'), status: 'rejeitado' },
      { ...team('D'), status: 'aprovado' },
      { ...team('E'), status: 'aprovado' },
      team('LEGADO'),
    ];
    const matches = [
      match('m1', 'A', 'B', 1, 0),
      match('m2', 'A', 'C', 2, 0),
      match('m3', 'A', 'D', 3, 1),
    ];

    const standings = calculateStandings(matches, [], teams, rules(['saldo_gols']));

    expect(standings[0].teamId).toBe('A');
    expect(standings.map((s) => s.teamId).sort()).toEqual(['A', 'D', 'E', 'LEGADO']);
    expect(standings.find((s) => s.teamId === 'A')).toMatchObject({ played: 1, points: 3 });
    expect(standings.find((s) => s.teamId === 'D')).toMatchObject({ played: 1, points: 0 });
    expect(standings.find((s) => s.teamId === 'E')).toMatchObject({ played: 0, points: 0 });
    expect(standings.find((s) => s.teamId === 'LEGADO')).toMatchObject({ played: 0, points: 0 });
  });
});
