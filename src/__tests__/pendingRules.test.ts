import {
  deadlineTag,
  deriveAthletePendingItems,
  deriveCaptainPendingItems,
  deriveOrganizerPendingItems,
  groupPendingItems,
  isMatchOverdue,
  isOverdue,
  pendingId,
  resolvePendingDestination,
  sortPendingItems,
} from '../utils/pendingRules';
import {
  AppUser,
  Championship,
  Convocation,
  MatchAttendance,
  MatchModel,
  Player,
  Team,
} from '../types';
import { PendingItem } from '../types/pending';

// ── Helpers de fábrica ─────────────────────────────────────────────────────────

function user(o: Partial<AppUser> = {}): AppUser {
  return { id: 'u1', name: 'Test', role: 'organizador', ...o };
}

function champ(o: Partial<Championship> = {}): Championship {
  return {
    id: 'champ1',
    name: 'Copa Teste',
    format: 'pontos_corridos',
    status: 'em_andamento',
    currentRound: 1,
    totalRounds: 5,
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
    ...o,
  };
}

function team(o: Partial<Team> = {}): Team {
  return {
    id: 'team1',
    championshipId: 'champ1',
    name: 'Time Alpha',
    primaryColor: '#FF0000',
    secondaryColor: '#FFFFFF',
    captainId: 'cap1',
    status: 'aprovado',
    inviteCode: 'INV1',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...o,
  };
}

function player(o: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    teamId: 'team1',
    championshipId: 'champ1',
    userId: 'u2',
    name: 'Atleta',
    position: 'meia',
    number: 10,
    status: 'ativo',
    ...o,
  };
}

function match(o: Partial<MatchModel> = {}): MatchModel {
  return {
    id: 'match1',
    championshipId: 'champ1',
    round: 1,
    homeTeamId: 'team1',
    awayTeamId: 'team2',
    homeScore: null,
    awayScore: null,
    status: 'agendado',
    ...o,
  };
}

function convocation(o: Partial<Convocation> = {}): Convocation {
  return {
    id: 'match1_team1',
    championshipId: 'champ1',
    matchId: 'match1',
    teamId: 'team1',
    captainId: 'cap1',
    playerIds: ['p1'],
    status: 'open',
    responseDeadline: null,
    requiresReconfirmation: false,
    version: 1,
    previousVersion: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...o,
  };
}

function attendance(o: Partial<MatchAttendance> = {}): MatchAttendance {
  return {
    id: 'match1_p1',
    championshipId: 'champ1',
    matchId: 'match1',
    teamId: 'team1',
    playerId: 'p1',
    userId: 'u2',
    response: 'pending',
    respondedAt: null,
    version: 1,
    reconfirmationRequired: false,
    previousResponse: null,
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...o,
  };
}

const NOW = new Date('2026-06-30T12:00:00.000Z');

// ── IDs determinísticos ───────────────────────────────────────────────────────

describe('pendingId', () => {
  it('concatena type e partes com underscore', () => {
    expect(pendingId('team_pending_approval', 'teamABC')).toBe('team_pending_approval_teamABC');
  });

  it('suporta múltiplas partes', () => {
    expect(pendingId('captain_convocation_missing', 'match1', 'team1')).toBe(
      'captain_convocation_missing_match1_team1',
    );
  });

  it('sem partes extras retorna apenas o type', () => {
    expect(pendingId('athlete_no_team')).toBe('athlete_no_team');
  });
});

// ── Prazo ─────────────────────────────────────────────────────────────────────

describe('deadlineTag', () => {
  it('retorna overdue para datas passadas', () => {
    expect(deadlineTag('2026-06-29T00:00:00.000Z', NOW)).toBe('overdue');
  });

  it('retorna today para data dentro do dia atual', () => {
    expect(deadlineTag('2026-06-30T22:00:00.000Z', NOW)).toBe('today');
  });

  it('retorna within_24h para menos de 24h no futuro', () => {
    const in20h = new Date(NOW.getTime() + 20 * 3600_000).toISOString();
    expect(deadlineTag(in20h, NOW)).toBe('within_24h');
  });

  it('retorna within_72h para menos de 72h no futuro', () => {
    const in48h = new Date(NOW.getTime() + 48 * 3600_000).toISOString();
    expect(deadlineTag(in48h, NOW)).toBe('within_72h');
  });

  it('retorna no_deadline quando dueAt é null', () => {
    expect(deadlineTag(null, NOW)).toBe('no_deadline');
  });

  it('retorna no_deadline quando dueAt é inválido', () => {
    expect(deadlineTag('not-a-date', NOW)).toBe('no_deadline');
  });
});

describe('isOverdue', () => {
  it('true para data no passado', () => {
    expect(isOverdue('2026-01-01T00:00:00.000Z', NOW)).toBe(true);
  });

  it('false para data no futuro', () => {
    expect(isOverdue('2027-01-01T00:00:00.000Z', NOW)).toBe(false);
  });

  it('false para null', () => {
    expect(isOverdue(null, NOW)).toBe(false);
  });
});

describe('isMatchOverdue', () => {
  it('true para partida agendada com scheduledAt no passado', () => {
    const m = match({ status: 'agendado', scheduledAt: '2026-06-29T10:00:00.000Z' });
    expect(isMatchOverdue(m, NOW)).toBe(true);
  });

  it('false para partida agendada com scheduledAt no futuro', () => {
    const m = match({ status: 'agendado', scheduledAt: '2026-07-10T10:00:00.000Z' });
    expect(isMatchOverdue(m, NOW)).toBe(false);
  });

  it('false para partida finalizada mesmo com scheduledAt no passado', () => {
    const m = match({ status: 'finalizado', scheduledAt: '2026-06-29T10:00:00.000Z' });
    expect(isMatchOverdue(m, NOW)).toBe(false);
  });
});

// ── Ordenação ─────────────────────────────────────────────────────────────────

describe('sortPendingItems', () => {
  function item(o: Partial<PendingItem>): PendingItem {
    return {
      id: 'x',
      role: 'organizador',
      type: 'team_pending_approval',
      category: 'teams',
      severity: 'medium',
      title: 'Teste',
      description: 'Desc',
      deadlineTag: 'no_deadline',
      ...o,
    };
  }

  it('críticos antes de medium', () => {
    const items = [
      item({ id: 'b', severity: 'medium', title: 'B' }),
      item({ id: 'a', severity: 'critical', title: 'A' }),
    ];
    const sorted = sortPendingItems(items);
    expect(sorted[0].id).toBe('a');
  });

  it('bloqueados primeiro mesmo com severidade menor', () => {
    const items = [
      item({ id: 'b', severity: 'critical', isBlocked: false, title: 'B' }),
      item({ id: 'a', severity: 'medium', isBlocked: true, title: 'A' }),
    ];
    const sorted = sortPendingItems(items);
    expect(sorted[0].id).toBe('a');
  });

  it('prazo vencido antes de within_72h com mesma severidade', () => {
    const items = [
      item({ id: 'b', severity: 'high', deadlineTag: 'within_72h', title: 'B' }),
      item({ id: 'a', severity: 'high', deadlineTag: 'overdue', title: 'A' }),
    ];
    const sorted = sortPendingItems(items);
    expect(sorted[0].id).toBe('a');
  });

  it('desempate estável por título', () => {
    const items = [
      item({ id: 'b', severity: 'medium', deadlineTag: 'no_deadline', title: 'Zeta' }),
      item({ id: 'a', severity: 'medium', deadlineTag: 'no_deadline', title: 'Alpha' }),
    ];
    const sorted = sortPendingItems(items);
    expect(sorted[0].id).toBe('a');
  });
});

// ── Agrupamento ───────────────────────────────────────────────────────────────

describe('groupPendingItems', () => {
  function item(category: PendingItem['category'], id: string): PendingItem {
    return {
      id,
      role: 'organizador',
      type: 'team_pending_approval',
      category,
      severity: 'medium',
      title: 'T',
      description: 'D',
      deadlineTag: 'no_deadline',
    };
  }

  it('agrupa por categoria', () => {
    const items = [
      item('teams', 'a'),
      item('matches', 'b'),
      item('teams', 'c'),
    ];
    const groups = groupPendingItems(items);
    const teamGroup = groups.find((g) => g.category === 'teams');
    expect(teamGroup?.items).toHaveLength(2);
  });

  it('não cria grupo vazio', () => {
    const items = [item('teams', 'a')];
    const groups = groupPendingItems(items);
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
  });

  it('respeita a ordem de categorias definida', () => {
    const items = [
      item('matches', 'a'),
      item('championship', 'b'),
    ];
    const groups = groupPendingItems(items);
    const idx = (cat: string) => groups.findIndex((g) => g.category === cat);
    expect(idx('championship')).toBeLessThan(idx('matches'));
  });
});

// ── Derivação do Organizador ──────────────────────────────────────────────────

describe('deriveOrganizerPendingItems', () => {
  it('time pendente gera pendência high', () => {
    const u = user({ id: 'u1', role: 'organizador' });
    const c = champ({ organizerId: 'u1' });
    const t = team({ id: 'team1', championshipId: 'champ1', status: 'pendente' });

    const items = deriveOrganizerPendingItems({
      user: u,
      championships: [c],
      teams: [t],
      players: [],
      matches: [],
      convocations: [],
      now: NOW,
    });

    const pendingTeam = items.find((i) => i.type === 'team_pending_approval');
    expect(pendingTeam).toBeDefined();
    expect(pendingTeam?.severity).toBe('high');
    expect(pendingTeam?.teamId).toBe('team1');
  });

  it('ID é determinístico para o mesmo time', () => {
    const u = user({ id: 'u1', role: 'organizador' });
    const c = champ({ organizerId: 'u1' });
    const t = team({ id: 'team-abc', championshipId: 'champ1', status: 'pendente' });

    const items1 = deriveOrganizerPendingItems({
      user: u, championships: [c], teams: [t], players: [], matches: [], convocations: [], now: NOW,
    });
    const items2 = deriveOrganizerPendingItems({
      user: u, championships: [c], teams: [t], players: [], matches: [], convocations: [], now: NOW,
    });

    const id1 = items1.find((i) => i.type === 'team_pending_approval')?.id;
    const id2 = items2.find((i) => i.type === 'team_pending_approval')?.id;
    expect(id1).toBe(id2);
    expect(id1).toContain('team-abc');
  });

  it('partida atrasada gera pendência high com isBlocked', () => {
    const u = user({ id: 'u1', role: 'organizador' });
    const c = champ({ organizerId: 'u1' });
    const m = match({
      id: 'match1',
      championshipId: 'champ1',
      status: 'agendado',
      scheduledAt: '2026-06-29T10:00:00.000Z',
    });

    const items = deriveOrganizerPendingItems({
      user: u,
      championships: [c],
      teams: [],
      players: [],
      matches: [m],
      convocations: [],
      now: NOW,
    });

    const overdue = items.find((i) => i.type === 'match_overdue');
    expect(overdue).toBeDefined();
    expect(overdue?.isBlocked).toBe(true);
    expect(overdue?.severity).toBe('high');
  });

  it('campeonato em andamento sem partidas gera critical', () => {
    const u = user({ id: 'u1', role: 'organizador' });
    const c = champ({ id: 'champ1', organizerId: 'u1', status: 'em_andamento' });

    const items = deriveOrganizerPendingItems({
      user: u,
      championships: [c],
      teams: [],
      players: [],
      matches: [],
      convocations: [],
      now: NOW,
    });

    const noFixtures = items.find((i) => i.type === 'championship_no_fixtures');
    expect(noFixtures).toBeDefined();
    expect(noFixtures?.severity).toBe('critical');
    expect(noFixtures?.isBlocked).toBe(true);
  });

  it('campeonato com todas as partidas encerradas gera finalizable', () => {
    const u = user({ id: 'u1', role: 'organizador' });
    const c = champ({ id: 'champ1', organizerId: 'u1', status: 'em_andamento' });
    const m1 = match({ id: 'm1', championshipId: 'champ1', status: 'finalizado' });
    const m2 = match({ id: 'm2', championshipId: 'champ1', status: 'wo' });

    const items = deriveOrganizerPendingItems({
      user: u,
      championships: [c],
      teams: [],
      players: [],
      matches: [m1, m2],
      convocations: [],
      now: NOW,
    });

    const finalizable = items.find((i) => i.type === 'championship_finalizable');
    expect(finalizable).toBeDefined();
  });

  it('não gera pendências de campeonatos de outros organizadores', () => {
    const u = user({ id: 'u1', role: 'organizador' });
    const c = champ({ id: 'champ1', organizerId: 'outro_org' });
    const t = team({ id: 'team1', championshipId: 'champ1', status: 'pendente' });

    const items = deriveOrganizerPendingItems({
      user: u,
      championships: [c],
      teams: [t],
      players: [],
      matches: [],
      convocations: [],
      now: NOW,
    });

    expect(items).toHaveLength(0);
  });

  it('time sem convocação em partida agendada gera pendência', () => {
    const u = user({ id: 'u1', role: 'organizador' });
    const c = champ({ id: 'champ1', organizerId: 'u1' });
    const m = match({ id: 'match1', championshipId: 'champ1', status: 'agendado',
      homeTeamId: 'team1', awayTeamId: 'team2',
      scheduledAt: '2026-07-05T10:00:00.000Z' });

    const items = deriveOrganizerPendingItems({
      user: u,
      championships: [c],
      teams: [],
      players: [],
      matches: [m],
      convocations: [], // sem convocação
      now: NOW,
    });

    const noConv = items.filter((i) => i.type === 'match_no_convocation');
    expect(noConv).toHaveLength(2); // mandante e visitante
  });

  it('partida com convocação dos dois times não gera pendência de convocação', () => {
    const u = user({ id: 'u1', role: 'organizador' });
    const c = champ({ id: 'champ1', organizerId: 'u1' });
    const m = match({ id: 'match1', championshipId: 'champ1', status: 'agendado',
      homeTeamId: 'team1', awayTeamId: 'team2',
      scheduledAt: '2026-07-05T10:00:00.000Z' });
    const conv1 = convocation({ matchId: 'match1', teamId: 'team1' });
    const conv2 = convocation({ id: 'match1_team2', matchId: 'match1', teamId: 'team2' });

    const items = deriveOrganizerPendingItems({
      user: u,
      championships: [c],
      teams: [],
      players: [],
      matches: [m],
      convocations: [conv1, conv2],
      now: NOW,
    });

    expect(items.filter((i) => i.type === 'match_no_convocation')).toHaveLength(0);
  });
});

// ── Derivação do Capitão ──────────────────────────────────────────────────────

describe('deriveCaptainPendingItems', () => {
  it('retorna vazio se usuário não tem time', () => {
    const u = user({ id: 'cap1', role: 'capitao' });
    const items = deriveCaptainPendingItems({
      user: u,
      championships: [],
      teams: [team({ captainId: 'outro_cap' })],
      players: [],
      matches: [],
      convocations: [],
      attendances: [],
      now: NOW,
    });
    expect(items).toHaveLength(0);
  });

  it('time pendente gera critical e bloqueia', () => {
    const u = user({ id: 'cap1', role: 'capitao' });
    const t = team({ captainId: 'cap1', status: 'pendente' });

    const items = deriveCaptainPendingItems({
      user: u,
      championships: [champ()],
      teams: [t],
      players: [],
      matches: [],
      convocations: [],
      attendances: [],
      now: NOW,
    });

    const pending = items.find((i) => i.type === 'captain_team_pending');
    expect(pending).toBeDefined();
    expect(pending?.severity).toBe('critical');
    expect(pending?.isBlocked).toBe(true);
    // Bloqueado → sem outros itens
    expect(items).toHaveLength(1);
  });

  it('elenco vazio gera high', () => {
    const u = user({ id: 'cap1', role: 'capitao' });
    const t = team({ captainId: 'cap1', status: 'aprovado' });

    const items = deriveCaptainPendingItems({
      user: u,
      championships: [champ()],
      teams: [t],
      players: [], // elenco vazio
      matches: [],
      convocations: [],
      attendances: [],
      now: NOW,
    });

    const empty = items.find((i) => i.type === 'captain_roster_empty');
    expect(empty).toBeDefined();
    expect(empty?.severity).toBe('high');
  });

  it('convocação ausente para próxima partida gera pendência', () => {
    const u = user({ id: 'cap1', role: 'capitao' });
    const t = team({ captainId: 'cap1', status: 'aprovado' });
    const m = match({ status: 'agendado', scheduledAt: '2026-07-05T10:00:00.000Z' });

    const items = deriveCaptainPendingItems({
      user: u,
      championships: [champ()],
      teams: [t],
      players: [player()],
      matches: [m],
      convocations: [],
      attendances: [],
      now: NOW,
    });

    const missing = items.find((i) => i.type === 'captain_convocation_missing');
    expect(missing).toBeDefined();
  });

  it('respostas pendentes gera medium quando convocação existe', () => {
    const u = user({ id: 'cap1', role: 'capitao' });
    const t = team({ captainId: 'cap1', status: 'aprovado' });
    const m = match({ status: 'agendado', scheduledAt: '2026-07-05T10:00:00.000Z' });
    const conv = convocation({ playerIds: ['p1'] });
    // sem attendance — resposta pending

    const items = deriveCaptainPendingItems({
      user: u,
      championships: [champ()],
      teams: [t],
      players: [player()],
      matches: [m],
      convocations: [conv],
      attendances: [],
      now: NOW,
    });

    const pending = items.find((i) => i.type === 'captain_convocation_pending_responses');
    expect(pending).toBeDefined();
    expect(pending?.severity).toBe('medium');
  });

  it('atleta recusado gera high', () => {
    const u = user({ id: 'cap1', role: 'capitao' });
    const t = team({ captainId: 'cap1', status: 'aprovado' });
    const m = match({ status: 'agendado', scheduledAt: '2026-07-05T10:00:00.000Z' });
    const conv = convocation({ playerIds: ['p1'] });
    const att = attendance({ response: 'declined', playerId: 'p1' });

    const items = deriveCaptainPendingItems({
      user: u,
      championships: [champ()],
      teams: [t],
      players: [player()],
      matches: [m],
      convocations: [conv],
      attendances: [att],
      now: NOW,
    });

    const declined = items.find((i) => i.type === 'captain_convocation_declined');
    expect(declined).toBeDefined();
    expect(declined?.severity).toBe('high');
  });

  it('solicitações de entrada geram high', () => {
    const u = user({ id: 'cap1', role: 'capitao' });
    const t = team({ captainId: 'cap1', status: 'aprovado' });

    const items = deriveCaptainPendingItems({
      user: u,
      championships: [champ()],
      teams: [t],
      players: [],
      matches: [],
      convocations: [],
      attendances: [],
      joinRequestsCount: 3,
      now: NOW,
    });

    const req = items.find((i) => i.type === 'captain_join_request');
    expect(req).toBeDefined();
    expect(req?.severity).toBe('high');
  });

  it('atleta suspenso na próxima rodada gera high', () => {
    const u = user({ id: 'cap1', role: 'capitao' });
    const t = team({ captainId: 'cap1', status: 'aprovado' });
    const m = match({ status: 'agendado', round: 3, scheduledAt: '2026-07-05T10:00:00.000Z' });
    const p = player({ id: 'p-susp', status: 'suspenso', suspendedRound: 3 });

    const items = deriveCaptainPendingItems({
      user: u,
      championships: [champ()],
      teams: [t],
      players: [p],
      matches: [m],
      convocations: [],
      attendances: [],
      now: NOW,
    });

    const susp = items.find((i) => i.type === 'captain_player_suspended');
    expect(susp).toBeDefined();
    expect(susp?.playerId).toBe('p-susp');
  });
});

// ── Derivação do Atleta ───────────────────────────────────────────────────────

describe('deriveAthletePendingItems', () => {
  it('sem player ativo retorna apenas athlete_no_team', () => {
    const u = user({ id: 'u2', role: 'atleta' });

    const items = deriveAthletePendingItems({
      user: u,
      championships: [],
      teams: [],
      players: [], // nenhum player vinculado
      matches: [],
      convocations: [],
      attendances: [],
      now: NOW,
    });

    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('athlete_no_team');
    expect(items[0].severity).toBe('info');
  });

  it('presença pendente gera pendência', () => {
    const u = user({ id: 'u2', role: 'atleta' });
    const p = player({ id: 'p1', userId: 'u2', status: 'ativo', teamId: 'team1', championshipId: 'champ1' });
    const m = match({ status: 'agendado', scheduledAt: '2026-07-05T10:00:00.000Z' });
    const conv = convocation({ playerIds: ['p1'] });

    const items = deriveAthletePendingItems({
      user: u,
      championships: [champ()],
      teams: [team()],
      players: [p],
      matches: [m],
      convocations: [conv],
      attendances: [],
      now: NOW,
    });

    const att = items.find((i) => i.type === 'athlete_attendance_pending');
    expect(att).toBeDefined();
  });

  it('presença confirmada não gera pendência de presença', () => {
    const u = user({ id: 'u2', role: 'atleta' });
    const p = player({ id: 'p1', userId: 'u2', status: 'ativo', teamId: 'team1', championshipId: 'champ1' });
    const m = match({ status: 'agendado', scheduledAt: '2026-07-05T10:00:00.000Z' });
    const conv = convocation({ playerIds: ['p1'] });
    const att = attendance({ response: 'confirmed', playerId: 'p1', reconfirmationRequired: false });

    const items = deriveAthletePendingItems({
      user: u,
      championships: [champ()],
      teams: [team()],
      players: [p],
      matches: [m],
      convocations: [conv],
      attendances: [att],
      now: NOW,
    });

    expect(items.find((i) => i.type === 'athlete_attendance_pending')).toBeUndefined();
    expect(items.find((i) => i.type === 'athlete_attendance_reconfirmation')).toBeUndefined();
  });

  it('reconfirmação necessária gera critical', () => {
    const u = user({ id: 'u2', role: 'atleta' });
    const p = player({ id: 'p1', userId: 'u2', status: 'ativo', teamId: 'team1', championshipId: 'champ1' });
    const m = match({ status: 'adiado', scheduledAt: '2026-07-05T10:00:00.000Z' });
    const conv = convocation({ playerIds: ['p1'], requiresReconfirmation: true });
    const att = attendance({ response: 'confirmed', playerId: 'p1', reconfirmationRequired: true });

    const items = deriveAthletePendingItems({
      user: u,
      championships: [champ()],
      teams: [team()],
      players: [p],
      matches: [m],
      convocations: [conv],
      attendances: [att],
      now: NOW,
    });

    const reconf = items.find((i) => i.type === 'athlete_attendance_reconfirmation');
    expect(reconf).toBeDefined();
    expect(reconf?.severity).toBe('critical');
  });

  it('suspensão ativa gera high', () => {
    const u = user({ id: 'u2', role: 'atleta' });
    const p = player({ id: 'p1', userId: 'u2', status: 'suspenso', teamId: 'team1', championshipId: 'champ1' });

    const items = deriveAthletePendingItems({
      user: u,
      championships: [champ()],
      teams: [team()],
      players: [p],
      matches: [],
      convocations: [],
      attendances: [],
      now: NOW,
    });

    const susp = items.find((i) => i.type === 'athlete_suspension_active');
    expect(susp).toBeDefined();
    expect(susp?.severity).toBe('high');
  });

  it('jogador removido não conta como ativo', () => {
    const u = user({ id: 'u2', role: 'atleta' });
    // removido: não conta para elenco ativo
    const p = player({ id: 'p1', userId: 'u2', status: 'removido', teamId: 'team1', championshipId: 'champ1' });

    const items = deriveAthletePendingItems({
      user: u,
      championships: [champ()],
      teams: [team()],
      players: [p],
      matches: [],
      convocations: [],
      attendances: [],
      now: NOW,
    });

    // Sem player ativo → só athlete_no_team
    expect(items.find((i) => i.type === 'athlete_no_team')).toBeDefined();
  });

  it('não convocar atleta que não está na lista de convocados não gera pendência de presença', () => {
    const u = user({ id: 'u2', role: 'atleta' });
    const p = player({ id: 'p1', userId: 'u2', status: 'ativo', teamId: 'team1', championshipId: 'champ1' });
    const m = match({ status: 'agendado', scheduledAt: '2026-07-05T10:00:00.000Z' });
    const conv = convocation({ playerIds: ['p99'] }); // p1 não está convocado

    const items = deriveAthletePendingItems({
      user: u,
      championships: [champ()],
      teams: [team()],
      players: [p],
      matches: [m],
      convocations: [conv],
      attendances: [],
      now: NOW,
    });

    expect(items.find((i) => i.type === 'athlete_attendance_pending')).toBeUndefined();
  });
});

// ── Navegação: resolvePendingDestination ──────────────────────────────────────

describe('resolvePendingDestination', () => {
  it('championship_manage mapeia para ChampionshipDashboard no stack home', () => {
    const result = resolvePendingDestination({ type: 'championship_manage', championshipId: 'c1' });
    expect(result?.stack).toBe('home');
    expect(result?.screen).toBe('ChampionshipDashboard');
    expect((result?.params as any)?.championshipId).toBe('c1');
  });

  it('match_prematch mapeia para PreMatch no stack fixtures', () => {
    const result = resolvePendingDestination({ type: 'match_prematch', matchId: 'm1' });
    expect(result?.stack).toBe('fixtures');
    expect(result?.screen).toBe('PreMatch');
    expect((result?.params as any)?.matchId).toBe('m1');
  });

  it('roster_manage mapeia para ManageRoster no stack captain', () => {
    const result = resolvePendingDestination({ type: 'roster_manage', teamId: 't1' });
    expect(result?.stack).toBe('captain');
    expect(result?.screen).toBe('ManageRoster');
    expect((result?.params as any)?.teamId).toBe('t1');
  });

  it('notification_center mapeia para NotificationCenter no stack home', () => {
    const result = resolvePendingDestination({ type: 'notification_center' });
    expect(result?.stack).toBe('home');
    expect(result?.screen).toBe('NotificationCenter');
  });

  it('match_fixtures mapeia para FixturesMain', () => {
    const result = resolvePendingDestination({ type: 'match_fixtures' });
    expect(result?.stack).toBe('fixtures');
    expect(result?.screen).toBe('FixturesMain');
  });
});

// ── Deduplicação — IDs determinísticos garantem unicidade ─────────────────────

describe('deduplicação por ID determinístico', () => {
  it('não gera duplicatas ao chamar duas vezes com os mesmos dados', () => {
    const u = user({ id: 'u1', role: 'organizador' });
    const c = champ({ organizerId: 'u1' });
    const t = team({ id: 'team1', championshipId: 'champ1', status: 'pendente' });

    const input = { user: u, championships: [c], teams: [t], players: [], matches: [], convocations: [], now: NOW };
    const items1 = deriveOrganizerPendingItems(input);
    const items2 = deriveOrganizerPendingItems(input);

    const ids1 = items1.map((i) => i.id).sort();
    const ids2 = items2.map((i) => i.id).sort();
    expect(ids1).toEqual(ids2);
  });
});

describe('hardening final do Bloco 8', () => {
  it('resolve round_voting para a rota Voting com parametros obrigatorios', () => {
    const result = resolvePendingDestination({
      type: 'round_voting',
      championshipId: 'c1',
      round: 2,
    });

    expect(result?.stack).toBe('fixtures');
    expect(result?.screen).toBe('Voting');
    expect(result?.params).toEqual({ championshipId: 'c1', round: 2 });
  });

  it('bloqueia destino indisponivel para o perfil', () => {
    expect(resolvePendingDestination({ type: 'roster_manage', teamId: 't1' }, 'atleta')).toBeNull();
    expect(resolvePendingDestination({ type: 'join_requests_dashboard' }, 'organizador')).toBeNull();
    expect(resolvePendingDestination({ type: 'championship_manage', championshipId: 'c1' }, 'capitao')).toBeNull();
  });

  it('sortPendingItems remove duplicatas por id', () => {
    const duplicate: PendingItem = {
      id: 'same',
      role: 'organizador',
      type: 'team_pending_approval',
      category: 'teams',
      severity: 'high',
      title: 'A',
      description: 'D',
      deadlineTag: 'no_deadline',
    };

    expect(sortPendingItems([duplicate, { ...duplicate, title: 'B' }])).toHaveLength(1);
  });

  it('capitao usa somente o time do campeonato selecionado', () => {
    const u = user({ id: 'cap1', role: 'capitao' });
    const items = deriveCaptainPendingItems({
      user: u,
      championships: [champ({ id: 'champ1' }), champ({ id: 'champ2', name: 'Outra Copa' })],
      teams: [
        team({ id: 'team1', championshipId: 'champ1', captainId: 'cap1' }),
        team({ id: 'team2', championshipId: 'champ2', captainId: 'cap1' }),
      ],
      players: [player({ id: 'p2', teamId: 'team2', championshipId: 'champ2' })],
      matches: [
        match({ id: 'm1', championshipId: 'champ1', homeTeamId: 'team1', awayTeamId: 'x' }),
        match({ id: 'm2', championshipId: 'champ2', homeTeamId: 'team2', awayTeamId: 'x' }),
      ],
      convocations: [],
      attendances: [],
      activeChampionshipId: 'champ2',
      now: NOW,
    });

    expect(items.every((i) => i.championshipId === 'champ2')).toBe(true);
  });

  it('atleta nao mistura outro player do mesmo usuario em campeonato diferente', () => {
    const u = user({ id: 'u2', role: 'atleta' });
    const items = deriveAthletePendingItems({
      user: u,
      championships: [champ({ id: 'champ1' }), champ({ id: 'champ2' })],
      teams: [
        team({ id: 'team1', championshipId: 'champ1' }),
        team({ id: 'team2', championshipId: 'champ2' }),
      ],
      players: [
        player({ id: 'p1', userId: 'u2', teamId: 'team1', championshipId: 'champ1' }),
        player({ id: 'p2', userId: 'u2', teamId: 'team2', championshipId: 'champ2' }),
      ],
      matches: [match({ id: 'm2', championshipId: 'champ2', homeTeamId: 'team2', awayTeamId: 'x' })],
      convocations: [
        convocation({
          id: 'm2_team2',
          championshipId: 'champ2',
          matchId: 'm2',
          teamId: 'team2',
          playerIds: ['p2'],
        }),
      ],
      attendances: [],
      activeChampionshipId: 'champ2',
      now: NOW,
    });

    expect(items.some((i) => i.playerId === 'p1')).toBe(false);
    expect(items.some((i) => i.type === 'athlete_attendance_pending' && i.playerId === 'p2')).toBe(true);
  });
});
