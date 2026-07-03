import {
  getNotificationActionOrchestrator,
  NotificationActionOrchestrator,
} from '../services/notificationActionOrchestrator';
import { NotificationActionRuntimeState } from '../utils/notificationActionPipeline';
import { AppUser, Championship, MatchModel, Player, Team } from '../types';

const NOW = new Date('2026-07-01T12:00:00.000Z').getTime();

function user(overrides: Partial<AppUser> = {}): AppUser {
  return { id: 'u1', name: 'User', role: 'organizador', ...overrides };
}

function championship(overrides: Partial<Championship> = {}): Championship {
  return {
    id: 'c1',
    name: 'Copa',
    format: 'pontos_corridos',
    status: 'em_andamento',
    currentRound: 1,
    totalRounds: 1,
    organizerId: 'u1',
    inviteCode: 'ABC123',
    rules: {
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      tiebreakers: [],
      fairPlay: false,
      craqueDaRodada: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function team(overrides: Partial<Team> = {}): Team {
  return {
    id: 't1',
    championshipId: 'c1',
    name: 'Time',
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    captainId: 'cap1',
    status: 'aprovado',
    inviteCode: 'TEAM1',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    teamId: 't1',
    championshipId: 'c1',
    userId: 'ath1',
    name: 'Atleta',
    position: 'meia',
    number: 10,
    status: 'ativo',
    ...overrides,
  };
}

function match(overrides: Partial<MatchModel> = {}): MatchModel {
  return {
    id: 'm1',
    championshipId: 'c1',
    round: 1,
    homeTeamId: 't1',
    awayTeamId: 't2',
    homeScore: null,
    awayScore: null,
    status: 'agendado',
    ...overrides,
  };
}

function runtime(overrides: Partial<NotificationActionRuntimeState> = {}): NotificationActionRuntimeState {
  return {
    user: user(),
    isOnboarded: true,
    authLoading: false,
    navigationReady: true,
    championships: [championship()],
    teams: [team()],
    players: [player()],
    matches: [match()],
    selectedChampionshipId: 'c1',
    championshipsLoading: false,
    teamsLoading: false,
    matchesLoading: false,
    ...overrides,
  };
}

describe('NotificationActionOrchestrator', () => {
  let orchestrator: NotificationActionOrchestrator;
  let navigate: jest.Mock;
  let selectChampionship: jest.Mock;

  beforeEach(() => {
    orchestrator = new NotificationActionOrchestrator();
    navigate = jest.fn();
    selectChampionship = jest.fn();
  });

  it('getNotificationActionOrchestrator retorna singleton', () => {
    const first = getNotificationActionOrchestrator();
    const second = getNotificationActionOrchestrator();

    expect(first).toBe(second);
    first.resetForTests();
  });

  it('mantem pending em memoria ate login e revalida depois', () => {
    const payload = {
      type: 'notification_center',
      actionId: 'act-login',
      expiresAt: NOW + 10_000,
    };

    const queued = orchestrator.handleRaw(payload, 'notification', runtime({ user: null, isOnboarded: false }), {
      navigate,
      selectChampionship,
      now: NOW,
    });
    expect(queued.status).toBe('queued');
    expect(navigate).not.toHaveBeenCalled();

    const flushed = orchestrator.flush(runtime(), { navigate, selectChampionship, now: NOW + 1 });

    expect(flushed).toContainEqual({ status: 'navigated', actionId: 'act-login' });
    expect(navigate).toHaveBeenCalledTimes(1);

    const secondFlush = orchestrator.flush(runtime(), { navigate, selectChampionship, now: NOW + 2 });

    expect(secondFlush).toEqual([]);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('prepara contexto antes de navegar', () => {
    const payload = {
      type: 'match_scheduled',
      actionId: 'act-c2',
      championshipId: 'c2',
      matchId: 'm2',
      expiresAt: NOW + 10_000,
    };

    orchestrator.handleRaw(
      payload,
      'notification',
      runtime({
        championships: [championship(), championship({ id: 'c2' })],
        selectedChampionshipId: 'c1',
      }),
      { navigate, selectChampionship, now: NOW },
    );

    expect(selectChampionship).toHaveBeenCalledWith('c2');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('nao navega duas vezes para a mesma actionId', () => {
    const payload = {
      type: 'notification_center',
      actionId: 'act-once',
      expiresAt: NOW + 10_000,
    };

    orchestrator.handleRaw(payload, 'notification', runtime(), { navigate, selectChampionship, now: NOW });
    orchestrator.handleRaw(payload, 'notification', runtime(), { navigate, selectChampionship, now: NOW + 1 });

    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('processa segunda acao mesmo com a primeira ainda aguardando contexto', () => {
    const first = {
      type: 'match_scheduled',
      actionId: 'act-first',
      championshipId: 'c2',
      matchId: 'm2',
      expiresAt: NOW + 10_000,
    };
    const second = {
      type: 'notification_center',
      actionId: 'act-second',
      expiresAt: NOW + 10_000,
    };

    const firstState = runtime({
      championships: [championship(), championship({ id: 'c2' })],
      matches: [match(), match({ id: 'm2', championshipId: 'c2' })],
      selectedChampionshipId: 'c1',
    });

    orchestrator.handleRaw(first, 'notification', firstState, {
      navigate,
      selectChampionship,
      now: NOW,
    });
    const secondResult = orchestrator.handleRaw(second, 'notification', firstState, {
      navigate,
      selectChampionship,
      now: NOW + 1,
    });

    expect(selectChampionship).toHaveBeenCalledWith('c2');
    expect(secondResult).toEqual({ status: 'navigated', actionId: 'act-second' });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(orchestrator.getPendingActions().map((pending) => pending.action.actionId)).toEqual(['act-first']);

    orchestrator.flush(
      runtime({
        championships: [championship(), championship({ id: 'c2' })],
        matches: [match(), match({ id: 'm2', championshipId: 'c2' })],
        selectedChampionshipId: 'c2',
      }),
      { navigate, selectChampionship, now: NOW + 2 },
    );

    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it('fallback para NotificationCenter e consumido uma vez sem loop', () => {
    const payload = {
      type: 'inventado',
      actionId: 'act-fallback',
      expiresAt: NOW + 10_000,
    };

    const first = orchestrator.handleRaw(payload, 'notification', runtime(), {
      navigate,
      selectChampionship,
      now: NOW,
    });
    const second = orchestrator.handleRaw(payload, 'notification', runtime(), {
      navigate,
      selectChampionship,
      now: NOW + 1,
    });

    expect(first).toEqual({ status: 'navigated', actionId: 'act-fallback' });
    expect(second).toEqual({ status: 'ignored', actionId: 'act-fallback', reason: 'already_consumed' });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith({
      stack: 'home',
      screen: 'NotificationCenter',
    });
  });

  it('descarta acao expirada e nao reprocessa depois', () => {
    const payload = {
      type: 'notification_center',
      actionId: 'act-expired',
      expiresAt: NOW - 1,
    };

    const first = orchestrator.handleRaw(payload, 'notification', runtime(), {
      navigate,
      selectChampionship,
      now: NOW,
    });
    const second = orchestrator.handleRaw(
      { ...payload, expiresAt: NOW + 10_000 },
      'notification',
      runtime(),
      {
        navigate,
        selectChampionship,
        now: NOW + 1,
      },
    );

    expect(first).toEqual({ status: 'failed', actionId: 'act-expired', reason: 'expired' });
    expect(second).toEqual({ status: 'ignored', actionId: 'act-expired', reason: 'already_consumed' });
    expect(navigate).not.toHaveBeenCalled();
  });

  // ── Bloco 10.4 — notificações do formato grupos + mata-mata ────────────────

  it('knockout_generated de outro campeonato troca contexto e depois navega para a chave', () => {
    const payload = {
      type: 'knockout_generated',
      actionId: 'act-knock',
      championshipId: 'c2',
      expiresAt: NOW + 10_000,
    };
    orchestrator.handleRaw(
      payload,
      'notification',
      runtime({
        championships: [championship(), championship({ id: 'c2', format: 'grupos_e_mata_mata' })],
        selectedChampionshipId: 'c1',
      }),
      { navigate, selectChampionship, now: NOW },
    );
    expect(selectChampionship).toHaveBeenCalledWith('c2');
    expect(navigate).not.toHaveBeenCalled();

    orchestrator.flush(
      runtime({
        championships: [championship(), championship({ id: 'c2', format: 'grupos_e_mata_mata' })],
        selectedChampionshipId: 'c2',
      }),
      { navigate, selectChampionship, now: NOW + 1 },
    );
    expect(navigate).toHaveBeenCalledWith({ stack: 'fixtures', screen: 'FixturesMain' });
  });

  it('team_qualified é consumido uma única vez (retry ignorado)', () => {
    const payload = {
      type: 'team_qualified',
      actionId: 'act-q',
      championshipId: 'c1',
      teamId: 't1',
      snapshotVersion: 1,
      expiresAt: NOW + 10_000,
    };
    const first = orchestrator.handleRaw(payload, 'notification', runtime(), { navigate, selectChampionship, now: NOW });
    const second = orchestrator.handleRaw(payload, 'notification', runtime(), { navigate, selectChampionship, now: NOW + 1 });

    expect(first).toEqual({ status: 'navigated', actionId: 'act-q' });
    expect(second).toEqual({ status: 'ignored', actionId: 'act-q', reason: 'already_consumed' });
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('group_stage_ready negado para atleta falha sem loop', () => {
    const payload = {
      type: 'group_stage_ready',
      actionId: 'act-review',
      championshipId: 'c1',
      expiresAt: NOW + 10_000,
    };
    const athleteState = runtime({
      user: user({ id: 'ath1', role: 'atleta' }),
      championships: [championship({ organizerId: 'someone', format: 'grupos_e_mata_mata' })],
    });
    const res = orchestrator.handleRaw(payload, 'notification', athleteState, { navigate, selectChampionship, now: NOW });
    expect(res).toEqual({ status: 'failed', actionId: 'act-review', reason: 'permission_denied' });
    expect(navigate).not.toHaveBeenCalled();
  });
});
