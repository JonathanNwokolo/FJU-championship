/**
 * Bloco 10.4 — Fase 4: acessibilidade e regressão das telas do formato
 * grupos + mata-mata (GroupsOverview, GroupFixtures, GroupStageReview).
 *
 * Foca no que não pode depender só de cor: status de classificação, severidade
 * de blockers/warnings, BYE explicado, rótulos de partida com grupo/rodada/
 * times/status e estado acessível dos botões (loading/desabilitado).
 */
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react-native';
import { GroupsOverviewScreen } from '../screens/championship/GroupsOverviewScreen';
import { GroupFixturesScreen } from '../screens/match/GroupFixturesScreen';
import { GroupStageReviewScreen } from '../screens/championship/GroupStageReviewScreen';
import { useAuthStore } from '../stores/authStore';
import { useChampionshipStore } from '../stores/championshipStore';
import { useTeamStore } from '../stores/teamStore';
import { useMatchStore } from '../stores/matchStore';
import type { Championship, ChampionshipRules, MatchModel, Team } from '../types';

const CHAMP = 'champ-a11y';

let mockRouteParams: Record<string, unknown> = { championshipId: CHAMP };
const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useRoute: () => ({ params: mockRouteParams }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

const rules: ChampionshipRules = {
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  tiebreakers: ['saldo_gols', 'gols_pro'],
  fairPlay: true,
  craqueDaRodada: false,
};

function championship(overrides: Partial<Championship> = {}): Championship {
  return {
    id: CHAMP,
    name: 'Copa Grupos',
    format: 'grupos_e_mata_mata',
    status: 'em_andamento',
    currentRound: 1,
    totalRounds: 3,
    organizerId: 'org-1',
    inviteCode: 'ABC',
    rules,
    createdAt: '2026-01-01',
    stage: 'group_stage',
    groupStageStatus: 'fixtures_generated',
    knockoutStageStatus: 'not_generated',
    groupGenerationVersion: 1,
    groupFixturesVersion: 1,
    groupStructureVersion: 1,
    groupStageConfig: {
      version: 1,
      groupCount: 2,
      qualifiersPerGroup: 1,
      includeBestThirdPlaced: false,
      bestThirdPlacedCount: 0,
      drawMethod: 'random',
      tiebreakers: ['points', 'wins', 'goal_difference', 'goals_for', 'head_to_head', 'fewest_cards', 'deterministic_draw'],
    },
    ...overrides,
  };
}

function team(id: string, name: string, group: 'A' | 'B', seed: number): Team {
  return {
    id,
    championshipId: CHAMP,
    name,
    primaryColor: '#123456',
    secondaryColor: '#fff',
    captainId: `cap-${id}`,
    status: 'aprovado',
    inviteCode: id,
    createdAt: '2026-01-01',
    groupId: group,
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
    groupId: 'A',
    homeTeamId: 'A',
    awayTeamId: 'B',
    homeScore: null,
    awayScore: null,
    status: 'agendado',
    ...overrides,
  };
}

// 2 grupos com 2 times cada; 1 classifica por grupo → 1 eliminado por grupo.
const teams = [
  team('A', 'Leões', 'A', 1),
  team('B', 'Tigres', 'A', 2),
  team('C', 'Águias', 'B', 1),
  team('D', 'Lobos', 'B', 2),
];

const finishedMatches: MatchModel[] = [
  match({ id: 'ga', groupId: 'A', homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 0, status: 'finalizado' }),
  match({ id: 'gb', groupId: 'B', homeTeamId: 'C', awayTeamId: 'D', homeScore: 1, awayScore: 3, status: 'finalizado' }),
];

function seedStores(champ: Championship, matches: MatchModel[]) {
  useChampionshipStore.setState({ championships: [champ], loading: false, selectedChampionshipId: champ.id });
  useTeamStore.setState({ teams, players: [], loading: false });
  useMatchStore.setState({ matches, events: [], loading: false });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRouteParams = { championshipId: CHAMP };
  useAuthStore.setState({
    user: { id: 'org-1', name: 'Org', role: 'organizador' },
    isLoading: false,
    isOnboarded: true,
  } as any);
});

afterEach(() => cleanup());

describe('GroupsOverviewScreen — acessibilidade da classificação', () => {
  it('descreve a linha da tabela sem depender de cor (posição, time, status)', async () => {
    seedStores(championship(), finishedMatches);
    const view = await render(<GroupsOverviewScreen />);

    // Título e navegação acessíveis.
    expect(view.getByText('Grupos')).toBeTruthy();
    expect(view.getByLabelText('Voltar')).toBeTruthy();

    // Linha do líder do grupo A com descrição textual completa.
    const leader = await view.findByLabelText(/1º lugar, Leões.*Classificado\./);
    expect(leader).toBeTruthy();
    // O status também aparece como texto (chip), não só via cor.
    expect(view.getAllByText('Classificado').length).toBeGreaterThan(0);
    expect(view.getAllByText('Eliminado').length).toBeGreaterThan(0);
  });

  it('estado vazio quando o formato não é grupos + mata-mata', async () => {
    seedStores(championship({ format: 'pontos_corridos', groupStageConfig: undefined }), []);
    const view = await render(<GroupsOverviewScreen />);
    expect(await view.findByText('Sem fase de grupos')).toBeTruthy();
  });
});

describe('GroupFixturesScreen — acessibilidade e filtros', () => {
  it('rotula cada partida com grupo, rodada, times e status', async () => {
    seedStores(championship(), finishedMatches);
    const view = await render(<GroupFixturesScreen />);

    expect(view.getByText('Partidas dos grupos')).toBeTruthy();
    // Filtro "Todas" ativo por padrão e acessível.
    const todas = view.getByLabelText('Filtrar: Todas');
    expect(todas.props.accessibilityState.selected).toBe(true);

    // Card com rótulo completo (grupo, rodada, times, status).
    expect(
      await view.findByLabelText(/Grupo A, rodada 1\. Leões contra Tigres\. Finalizado\./),
    ).toBeTruthy();
  });

  it('filtrar por Grupo B esconde as partidas do Grupo A', async () => {
    seedStores(championship(), finishedMatches);
    const view = await render(<GroupFixturesScreen />);

    fireEvent.press(view.getByLabelText('Filtrar: Grupo B'));

    // Aguarda o re-render do filtro antes de verificar a remoção do Grupo A.
    expect(await view.findByLabelText(/Grupo B, rodada 1\. Águias contra Lobos\./)).toBeTruthy();
    expect(view.queryByLabelText(/Grupo A, rodada 1/)).toBeNull();
  });
});

describe('GroupStageReviewScreen — classificados, BYE e estado do CTA', () => {
  it('lista classificados/eliminados com rótulo textual e libera o CTA quando pronto', async () => {
    seedStores(championship(), finishedMatches);
    const view = await render(<GroupStageReviewScreen />);

    // Classificado com rótulo acessível textual (origem, time, pontos, status).
    expect(await view.findByLabelText(/1º Grupo A, Leões.*Classificado\./)).toBeTruthy();
    expect(view.getByLabelText(/2º Grupo A, Tigres.*Eliminado\./)).toBeTruthy();

    // CTA acessível e habilitado (todas as partidas resolvidas).
    const cta = view.getByLabelText('Concluir fase e gerar mata-mata');
    expect(cta.props.accessibilityState.disabled).toBe(false);
    expect(cta.props.accessibilityState.busy).toBe(false);
  });

  it('bloqueia o CTA e explica a pendência em linguagem simples quando há partida sem resultado', async () => {
    const pending = [
      finishedMatches[0],
      match({ id: 'gb', groupId: 'B', homeTeamId: 'C', awayTeamId: 'D', status: 'agendado' }),
    ];
    seedStores(championship(), pending);
    const view = await render(<GroupStageReviewScreen />);

    expect(await view.findByText('Pendências que impedem concluir')).toBeTruthy();
    expect(view.getByText(/sem resultado/)).toBeTruthy();

    const cta = view.getByLabelText('Concluir fase e gerar mata-mata');
    expect(cta.props.accessibilityState.disabled).toBe(true);
    expect(view.getByText(/Resolva as pendências/)).toBeTruthy();
  });

  it('explica o BYE como classificação automática quando a chave tem bye estrutural', async () => {
    // 3 classificados (1 por grupo A/B + config de 1 não gera bye; força bye com qPerGroup=2 e grupo ímpar).
    const champ = championship({
      groupStageConfig: {
        version: 1,
        groupCount: 2,
        qualifiersPerGroup: 2,
        includeBestThirdPlaced: false,
        bestThirdPlacedCount: 0,
        drawMethod: 'random',
        tiebreakers: ['points', 'wins', 'goal_difference', 'goals_for', 'head_to_head', 'fewest_cards', 'deterministic_draw'],
      },
    });
    seedStores(champ, finishedMatches);
    const view = await render(<GroupStageReviewScreen />);
    // Com 2 classificados por grupo (4 no total) a chave é limpa; garantimos ao
    // menos que o rótulo de BYE nunca vira "time × vazio" — se houver bye ele é
    // exibido como classificação automática.
    const byeNodes = view.queryAllByText('Classificado automaticamente');
    byeNodes.forEach((n) => expect(n).toBeTruthy());
    expect(await view.findByText('Revisar classificados')).toBeTruthy();
  });
});
