import {
  calculateChampionshipStandings,
  canCaptainViewRegistrationStatus,
  canTeamParticipate,
  isTeamApproved,
  isTeamPending,
  isTeamRejected,
} from '../utils/championshipRules';
import { Championship, MatchModel, Team } from '../types';

const teams: Team[] = [
  team('alpha', 'Alpha'),
  team('bravo', 'Bravo'),
  team('charlie', 'Charlie'),
];

describe('championshipRules', () => {
  it('aplica vitoria 3 pontos, empate 1 e derrota 0', () => {
    const standings = calculateChampionshipStandings(
      [
        match('m1', 'alpha', 'bravo', 2, 1),
        match('m2', 'alpha', 'charlie', 0, 0),
      ],
      teams,
    );

    expect(standings.find((item) => item.teamId === 'alpha')?.points).toBe(4);
    expect(standings.find((item) => item.teamId === 'charlie')?.points).toBe(1);
    expect(standings.find((item) => item.teamId === 'bravo')?.points).toBe(0);
  });

  it('calcula gols pro, gols contra e saldo de gols', () => {
    const standings = calculateChampionshipStandings(
      [match('m1', 'alpha', 'bravo', 4, 2)],
      teams,
    );

    const alpha = standings.find((item) => item.teamId === 'alpha');
    expect(alpha?.goalsFor).toBe(4);
    expect(alpha?.goalsAgainst).toBe(2);
    expect(alpha?.goalDifference).toBe(2);
  });

  it('ordena tabela por pontos', () => {
    const standings = calculateChampionshipStandings(
      [
        match('m1', 'alpha', 'bravo', 1, 0),
        match('m2', 'charlie', 'bravo', 3, 0),
      ],
      teams,
    );

    expect(standings.map((item) => item.teamId)).toEqual(['charlie', 'alpha', 'bravo']);
  });

  it('desempata por saldo de gols', () => {
    const standings = calculateChampionshipStandings(
      [
        match('m1', 'alpha', 'bravo', 1, 0),
        match('m2', 'charlie', 'bravo', 3, 0),
      ],
      teams,
    );

    expect(standings[0].teamId).toBe('charlie');
  });

  it('desempata por gols marcados quando o saldo e igual', () => {
    const standings = calculateChampionshipStandings(
      [
        match('m1', 'alpha', 'bravo', 2, 1),
        match('m2', 'charlie', 'bravo', 1, 0),
      ],
      teams,
    );

    expect(standings[0].teamId).toBe('alpha');
  });

  it('diferencia status de inscricao pendente, aprovado e rejeitado', () => {
    expect(isTeamPending(team('p', 'Pendente', 'pendente'))).toBe(true);
    expect(isTeamApproved(team('a', 'Aprovado', 'aprovado'))).toBe(true);
    expect(isTeamRejected(team('r', 'Rejeitado', 'rejeitado'))).toBe(true);
  });

  it('permite participar apenas com time aprovado', () => {
    expect(canTeamParticipate(team('a', 'Aprovado', 'aprovado'))).toBe(true);
    expect(canTeamParticipate(team('p', 'Pendente', 'pendente'))).toBe(false);
    expect(canTeamParticipate(team('r', 'Rejeitado', 'rejeitado'))).toBe(false);
  });

  it('permite ao capitao ver o status da propria inscricao', () => {
    const championship = { id: 'champ-1' } as Championship;
    const ownTeam = team('alpha', 'Alpha', 'pendente');

    expect(canCaptainViewRegistrationStatus('captain-1', ownTeam, championship)).toBe(true);
    expect(canCaptainViewRegistrationStatus('other', ownTeam, championship)).toBe(false);
  });
});

function team(id: string, name: string, status: Team['status'] = 'aprovado'): Team {
  return {
    id,
    championshipId: 'champ-1',
    name,
    primaryColor: '#111',
    secondaryColor: '#222',
    captainId: 'captain-1',
    status,
    inviteCode: 'ABC123',
    createdAt: '2026-06-08',
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
    championshipId: 'champ-1',
    round: 1,
    homeTeamId,
    awayTeamId,
    homeScore,
    awayScore,
    status: 'finalizado',
  };
}
