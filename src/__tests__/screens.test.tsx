import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { AvailableChampionshipsScreen } from '../screens/team/AvailableChampionshipsScreen';
import { MatchSummaryScreen } from '../screens/match/MatchSummaryScreen';
import { useChampionshipStore } from '../stores/championshipStore';
import { useMatchStore } from '../stores/matchStore';
import { useTeamStore } from '../stores/teamStore';
import { Championship, MatchEvent, MatchModel, Player, Team } from '../types';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockRouteParams: Record<string, string> = {};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ params: mockRouteParams }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.1.0' },
}));

jest.mock('firebase/auth', () => ({
  sendPasswordResetEmail: jest.fn(),
}));

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'cache/',
  copyAsync: jest.fn(),
}));

jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(),
}));

describe('screens', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockGoBack.mockClear();
    mockRouteParams = {};
    useChampionshipStore.setState({ championships: [], selectedChampionshipId: null, loading: false });
    useTeamStore.setState({ teams: [], players: [], loading: false });
    useMatchStore.setState({ matches: [], events: [], loading: false });
  });

  it('LoginScreen renderiza Email, Senha, ENTRAR e Criar conta', async () => {
    await render(<LoginScreen navigation={{ navigate: mockNavigate } as any} />);

    expect(await screen.findByText('Email')).toBeTruthy();
    expect(await screen.findByText('Senha')).toBeTruthy();
    expect(await screen.findByText('ENTRAR')).toBeTruthy();
    expect(await screen.findByText('Criar conta')).toBeTruthy();
  });

  it('tela de campeonatos renderiza lista de campeonatos abertos', async () => {
    useChampionshipStore.setState({
      championships: [
        championship('champ-1', 'Copa FJU', 'inscricoes_abertas'),
        championship('champ-2', 'Copa Encerrada', 'finalizado'),
      ],
    });

    await render(<AvailableChampionshipsScreen />);

    expect(await screen.findByText('Copa FJU')).toBeTruthy();
    expect(screen.queryByText('Copa Encerrada')).toBeNull();
  });

  it('tela de detalhes de partida renderiza times e informacoes principais', async () => {
    mockRouteParams = { matchId: 'match-1' };
    useTeamStore.setState({ teams: [team('home', 'Alpha'), team('away', 'Bravo')], players: [] });
    useMatchStore.setState({ matches: [match()], events: [] });

    await render(<MatchSummaryScreen />);

    expect(await screen.findByText('RODADA 1')).toBeTruthy();
    expect((await screen.findAllByText('Alpha')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Bravo')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Eventos')).toBeTruthy();
  });

  it('tela de detalhes de partida renderiza eventos principais', async () => {
    mockRouteParams = { matchId: 'match-1' };
    useTeamStore.setState({
      teams: [team('home', 'Alpha'), team('away', 'Bravo')],
      players: [player('p1', 'Jogador Alpha', 'home')],
    });
    useMatchStore.setState({
      matches: [match()],
      events: [event('e1', 'gol', 'p1', 'home')],
    });

    await render(<MatchSummaryScreen />);

    expect(await screen.findByText('EVENTOS')).toBeTruthy();
    expect(await screen.findByText('Jogador Alpha')).toBeTruthy();
    expect(await screen.findByText("10'")).toBeTruthy();
  });
});

function championship(
  id: string,
  name: string,
  status: Championship['status'],
): Championship {
  return {
    id,
    name,
    status,
    format: 'pontos_corridos',
    currentRound: 1,
    totalRounds: 3,
    organizerId: 'org-1',
    inviteCode: 'FJU123',
    rules: {
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      tiebreakers: ['saldo_gols', 'gols_pro'],
      fairPlay: false,
      craqueDaRodada: false,
    },
    createdAt: '2026-06-08',
  };
}

function team(id: string, name: string): Team {
  return {
    id,
    championshipId: 'champ-1',
    name,
    primaryColor: '#111111',
    secondaryColor: '#222222',
    captainId: `${id}-captain`,
    status: 'aprovado',
    inviteCode: 'ABC123',
    createdAt: '2026-06-08',
  };
}

function match(): MatchModel {
  return {
    id: 'match-1',
    championshipId: 'champ-1',
    round: 1,
    homeTeamId: 'home',
    awayTeamId: 'away',
    homeScore: 2,
    awayScore: 1,
    status: 'finalizado',
  };
}

function player(id: string, name: string, teamId: string): Player {
  return {
    id,
    name,
    teamId,
    championshipId: 'champ-1',
    position: 'atacante',
    number: 9,
  };
}

function event(
  id: string,
  type: MatchEvent['type'],
  playerId: string,
  teamId: string,
): MatchEvent {
  return {
    id,
    matchId: 'match-1',
    championshipId: 'champ-1',
    type,
    teamId,
    playerId,
    minute: 10,
  };
}
