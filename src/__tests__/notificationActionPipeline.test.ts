import {
  parseNotificationAction,
  prepareNotificationAction,
  resolveNotificationActionDestination,
} from '../utils/notificationActionPipeline';
import { AppUser, Championship, MatchModel, Player, Team } from '../types';

const NOW = new Date('2026-07-01T12:00:00.000Z').getTime();

describe('parseNotificationAction', () => {
  it('normaliza payload v1 preservando actionId e expiresAt', () => {
    const action = parseNotificationAction(
      {
        v: 1,
        type: 'match_prematch',
        actionId: 'act-match',
        expiresAt: '2026-07-01T12:05:00.000Z',
        matchId: 'm1',
      },
      'notification',
      NOW,
    );

    expect(action).toMatchObject({
      actionId: 'act-match',
      type: 'match_prematch',
      matchId: 'm1',
      source: 'notification',
    });
    expect(action?.expiresAt).toBe(new Date('2026-07-01T12:05:00.000Z').getTime());
  });

  it('normaliza legado de gol para match_live quando ha matchId', () => {
    const action = parseNotificationAction(
      { type: 'goal', championshipId: 'c1', matchId: 'm1' },
      'notification',
      NOW,
    );

    expect(action?.type).toBe('match_live');
    expect(action?.legacyType).toBe('goal');
    expect(action?.actionId).toBe('notification:match_live:c1:m1:no_team:no_announcement:no_round');
  });

  it('normaliza deep link interno pelo mesmo pipeline', () => {
    const action = parseNotificationAction('fju://match/m1?championshipId=c1', 'deep_link', NOW);

    expect(action?.type).toBe('match_prematch');
    expect(action?.matchId).toBe('m1');
    expect(action?.championshipId).toBe('c1');
  });

  it('tipo desconhecido vira unknown para fallback seguro', () => {
    const action = parseNotificationAction({ type: 'inventado', actionId: 'x' }, 'notification', NOW);

    expect(action?.type).toBe('unknown');
  });
});

describe('resolveNotificationActionDestination', () => {
  it('mapeia announcement com campeonato para Announcements existente', () => {
    const action = parseNotificationAction(
      { type: 'announcement', championshipId: 'c1', actionId: 'a1' },
      'notification',
      NOW,
    )!;

    const result = resolveNotificationActionDestination(action);

    expect(result.destination).toEqual({
      stack: 'home',
      screen: 'Announcements',
      params: { championshipId: 'c1' },
    });
  });

  it('comunicado sem campeonato cai no NotificationCenter', () => {
    const action = parseNotificationAction({ type: 'announcement', actionId: 'a1' }, 'notification', NOW)!;

    const result = resolveNotificationActionDestination(action);

    expect(result.destination.screen).toBe('NotificationCenter');
  });

  it('mapeia match_live para LiveMatch existente', () => {
    const action = parseNotificationAction({ type: 'goal', matchId: 'm1' }, 'notification', NOW)!;

    const result = resolveNotificationActionDestination(action);

    expect(result.destination).toEqual({
      stack: 'fixtures',
      screen: 'LiveMatch',
      params: { matchId: 'm1' },
    });
  });

  it('notificacao de partida sem championshipId usa matchId sem inventar parametro', () => {
    const action = parseNotificationAction({ type: 'match_scheduled', matchId: 'm1' }, 'notification', NOW)!;

    const result = resolveNotificationActionDestination(action);

    expect(result.destination).toEqual({
      stack: 'fixtures',
      screen: 'PreMatch',
      params: { matchId: 'm1' },
    });
  });

  it('tipo desconhecido usa fallback seguro', () => {
    const action = parseNotificationAction({ type: 'inventado', actionId: 'x' }, 'notification', NOW)!;

    const result = resolveNotificationActionDestination(action);

    expect(result.destination.screen).toBe('NotificationCenter');
  });
});

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

function runtime(overrides = {}) {
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

describe('prepareNotificationAction', () => {
  it('mantem pendente quando authReady ainda nao abriu', () => {
    const action = parseNotificationAction({ type: 'notification_center', actionId: 'n1' }, 'notification', NOW)!;

    const result = prepareNotificationAction(action, runtime({ user: null, isOnboarded: false }), NOW);

    expect(result.ready).toBe(false);
    expect(result.gates.authReady).toBe(false);
    expect(result.failureReason).toBeUndefined();
  });

  it('mantem pendente quando NavigationContainer ainda nao esta pronto', () => {
    const action = parseNotificationAction({ type: 'notification_center', actionId: 'n1' }, 'notification', NOW)!;

    const result = prepareNotificationAction(action, runtime({ navigationReady: false }), NOW);

    expect(result.ready).toBe(false);
    expect(result.gates.navigationReady).toBe(false);
    expect(result.failureReason).toBeUndefined();
  });

  it('mantem pendente com store vazio enquanto a resolucao ainda carrega', () => {
    const action = parseNotificationAction(
      { type: 'match_scheduled', matchId: 'm1', actionId: 'm1' },
      'notification',
      NOW,
    )!;

    const result = prepareNotificationAction(
      action,
      runtime({
        championships: [],
        teams: [],
        players: [],
        matches: [],
        selectedChampionshipId: null,
        championshipsLoading: true,
        teamsLoading: true,
        matchesLoading: true,
      }),
      NOW,
    );

    expect(result.ready).toBe(false);
    expect(result.gates.storesReady).toBe(false);
    expect(result.failureReason).toBeUndefined();
  });

  it('prepara troca de campeonato antes de exigir entidade carregada', () => {
    const action = parseNotificationAction(
      { type: 'match_scheduled', championshipId: 'c2', matchId: 'm2', actionId: 'm2' },
      'notification',
      NOW,
    )!;

    const result = prepareNotificationAction(
      action,
      runtime({
        championships: [championship(), championship({ id: 'c2' })],
        matches: [match()],
        selectedChampionshipId: 'c1',
      }),
      NOW,
    );

    expect(result.ready).toBe(false);
    expect(result.championshipIdToSelect).toBe('c2');
    expect(result.failureReason).toBeUndefined();
  });

  it('resolve payload legado sem championshipId a partir da partida carregada', () => {
    const action = parseNotificationAction(
      { type: 'goal', matchId: 'm1', actionId: 'legacy-goal' },
      'notification',
      NOW,
    )!;

    const result = prepareNotificationAction(action, runtime(), NOW);

    expect(action.type).toBe('match_live');
    expect(action.championshipId).toBeUndefined();
    expect(result.ready).toBe(true);
    expect(result.failureReason).toBeUndefined();
  });

  it('nega team_roster para usuario que nao e capitao do time', () => {
    const action = parseNotificationAction({ type: 'team_roster', teamId: 't1', actionId: 'r1' }, 'notification', NOW)!;

    const result = prepareNotificationAction(
      action,
      runtime({ user: user({ id: 'ath1', role: 'atleta' }) }),
      NOW,
    );

    expect(result.ready).toBe(false);
    expect(result.failureReason).toBe('permission_denied');
  });

  it('descarta partida inexistente apos stores prontos e contexto correto', () => {
    const action = parseNotificationAction(
      { type: 'match_scheduled', championshipId: 'c1', matchId: 'missing', actionId: 'missing' },
      'notification',
      NOW,
    )!;

    const result = prepareNotificationAction(action, runtime({ matches: [] }), NOW);

    expect(result.ready).toBe(false);
    expect(result.failureReason).toBe('context_unavailable');
  });
});

// ── Bloco 10.4 — Notificações do formato grupos + mata-mata ──────────────────

describe('Notificações de grupos + mata-mata', () => {
  it('mapeia os tipos do formato para action types de destino', () => {
    const cases: Array<[string, string]> = [
      ['groups_generated', 'groups_overview'],
      ['group_stage_started', 'groups_overview'],
      ['group_fixtures_generated', 'group_fixtures'],
      ['group_stage_ready', 'group_stage_review'],
      ['knockout_generated', 'knockout_bracket'],
      ['team_qualified', 'knockout_bracket'],
      ['team_eliminated', 'groups_overview'],
      ['knockout_match_defined', 'match_prematch'],
      ['match_corrected', 'match_summary'],
    ];
    for (const [raw, expected] of cases) {
      const action = parseNotificationAction(
        { type: raw, championshipId: 'c1', matchId: 'm1', actionId: `a-${raw}` },
        'notification',
        NOW,
      )!;
      expect(action.type).toBe(expected);
      expect(action.legacyType).toBe(raw);
    }
  });

  it('parseia groupId, snapshotVersion e correctionVersion', () => {
    const action = parseNotificationAction(
      {
        type: 'group_fixtures_generated',
        championshipId: 'c1',
        groupId: 'b',
        snapshotVersion: '2',
        correctionVersion: 3,
        actionId: 'g1',
      },
      'notification',
      NOW,
    )!;
    expect(action.groupId).toBe('B');
    expect(action.snapshotVersion).toBe(2);
    expect(action.correctionVersion).toBe(3);
  });

  it('resolve groups_overview para a rota real', () => {
    const action = parseNotificationAction(
      { type: 'groups_generated', championshipId: 'c1', actionId: 'g1' },
      'notification',
      NOW,
    )!;
    const result = resolveNotificationActionDestination(action);
    expect(result.destination).toEqual({
      stack: 'fixtures',
      screen: 'GroupsOverview',
      params: { championshipId: 'c1' },
    });
    expect(result.requiredChampionshipId).toBe('c1');
  });

  it('resolve group_fixtures preservando o groupId', () => {
    const action = parseNotificationAction(
      { type: 'group_fixtures_generated', championshipId: 'c1', groupId: 'A', actionId: 'g1' },
      'notification',
      NOW,
    )!;
    const result = resolveNotificationActionDestination(action);
    expect(result.destination).toEqual({
      stack: 'fixtures',
      screen: 'GroupFixtures',
      params: { championshipId: 'c1', groupId: 'A' },
    });
  });

  it('resolve knockout_generated para a chave (FixturesMain)', () => {
    const action = parseNotificationAction(
      { type: 'knockout_generated', championshipId: 'c1', actionId: 'k1' },
      'notification',
      NOW,
    )!;
    const result = resolveNotificationActionDestination(action);
    expect(result.destination).toEqual({ stack: 'fixtures', screen: 'FixturesMain' });
  });

  it('match_corrected abre MatchSummary', () => {
    const action = parseNotificationAction(
      { type: 'match_corrected', championshipId: 'c1', matchId: 'm1', correctionVersion: 2, actionId: 'mc1' },
      'notification',
      NOW,
    )!;
    const result = resolveNotificationActionDestination(action);
    expect(result.destination).toEqual({
      stack: 'fixtures',
      screen: 'MatchSummary',
      params: { matchId: 'm1' },
    });
  });

  it('sem championshipId cai em fallback seguro', () => {
    const action = parseNotificationAction({ type: 'groups_generated', actionId: 'g1' }, 'notification', NOW)!;
    const result = resolveNotificationActionDestination(action);
    expect(result.destination.screen).toBe('NotificationCenter');
  });

  it('group_stage_review é negado para não organizador', () => {
    const action = parseNotificationAction(
      { type: 'group_stage_ready', championshipId: 'c1', actionId: 'gr1' },
      'notification',
      NOW,
    )!;
    const captainState = runtime({
      user: user({ id: 'cap1', role: 'capitao' }),
      championships: [championship({ organizerId: 'someone' })],
      teams: [team({ captainId: 'cap1' })],
    });
    const result = prepareNotificationAction(action, captainState, NOW);
    expect(result.ready).toBe(false);
    expect(result.failureReason).toBe('permission_denied');
  });

  it('group_stage_review é permitido para o organizador dono', () => {
    const action = parseNotificationAction(
      { type: 'group_stage_ready', championshipId: 'c1', actionId: 'gr1' },
      'notification',
      NOW,
    )!;
    const result = prepareNotificationAction(action, runtime(), NOW);
    expect(result.ready).toBe(true);
    expect(result.resolution.destination.screen).toBe('GroupStageReview');
  });

  it('troca de campeonato: pede seleção quando o contexto é outro campeonato', () => {
    const action = parseNotificationAction(
      { type: 'groups_generated', championshipId: 'c2', actionId: 'g2' },
      'notification',
      NOW,
    )!;
    const state = runtime({
      championships: [championship(), championship({ id: 'c2' })],
      selectedChampionshipId: 'c1',
    });
    const result = prepareNotificationAction(action, state, NOW);
    expect(result.ready).toBe(false);
    expect(result.championshipIdToSelect).toBe('c2');
  });
});
