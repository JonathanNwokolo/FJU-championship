import {
  attendanceDocId,
  canPlayerBeCalledUp,
  convocationDocId,
  deriveConvocationEffectiveStatus,
  groupTeamRoster,
  isConvocationEditable,
  isConvocationOpenForResponses,
  isMatchOpenForConvocation,
  isPlayerCalledUp,
} from '../utils/convocationRules';
import { Convocation, MatchAttendance, MatchModel, Player } from '../types';

const HOME = 'team-home';
const AWAY = 'team-away';
const CHAMP = 'champ-1';
const MATCH = 'match-1';

function player(o: Partial<Player> = {}): Player {
  return {
    id: o.id ?? 'p1',
    teamId: o.teamId ?? HOME,
    championshipId: o.championshipId ?? CHAMP,
    userId: o.userId ?? 'u1',
    name: o.name ?? 'Atleta',
    position: o.position ?? 'meia',
    number: o.number ?? 10,
    status: o.status ?? 'ativo',
    ...o,
  };
}

function match(o: Partial<MatchModel> = {}): MatchModel {
  return {
    id: MATCH,
    championshipId: CHAMP,
    round: 1,
    homeTeamId: HOME,
    awayTeamId: AWAY,
    homeScore: null,
    awayScore: null,
    status: 'agendado',
    ...o,
  };
}

const OPEN_CTX = { suspended: false, inOtherTeam: false, convocationOpen: true };

describe('IDs determinísticos', () => {
  it('convocação por (partida, time)', () => {
    expect(convocationDocId(MATCH, HOME)).toBe('match-1_team-home');
  });
  it('presença por (partida, jogador)', () => {
    expect(attendanceDocId(MATCH, 'p1')).toBe('match-1_p1');
  });
});

describe('isMatchOpenForConvocation', () => {
  it('agendado e adiado aceitam; demais bloqueiam', () => {
    expect(isMatchOpenForConvocation('agendado')).toBe(true);
    expect(isMatchOpenForConvocation('adiado')).toBe(true);
    for (const s of ['ao_vivo', 'finalizado', 'cancelado', 'wo'] as const) {
      expect(isMatchOpenForConvocation(s)).toBe(false);
    }
  });
});

describe('canPlayerBeCalledUp', () => {
  it('ativo aprovado do time é permitido', () => {
    expect(canPlayerBeCalledUp(player(), match(), OPEN_CTX)).toEqual({
      eligible: true,
      reason: null,
    });
  });

  it('atleta de fora dos dois times é negado', () => {
    expect(canPlayerBeCalledUp(player({ teamId: 'outro' }), match(), OPEN_CTX).reason).toBe(
      'not_in_team',
    );
  });

  it('removido é negado (inativo)', () => {
    expect(canPlayerBeCalledUp(player({ status: 'removido' }), match(), OPEN_CTX).reason).toBe(
      'inactive',
    );
  });

  it('sem_time é negado (inativo)', () => {
    expect(canPlayerBeCalledUp(player({ status: 'sem_time' }), match(), OPEN_CTX).reason).toBe(
      'inactive',
    );
  });

  it('campeonato diferente é negado', () => {
    expect(
      canPlayerBeCalledUp(player({ championshipId: 'outro-champ' }), match(), OPEN_CTX).reason,
    ).toBe('wrong_championship');
  });

  it('lesionado é negado (decisão Fase B)', () => {
    expect(canPlayerBeCalledUp(player({ status: 'lesionado' }), match(), OPEN_CTX).reason).toBe(
      'injured',
    );
  });

  it('suspenso para a rodada é negado', () => {
    expect(
      canPlayerBeCalledUp(player(), match(), { ...OPEN_CTX, suspended: true }).reason,
    ).toBe('suspended');
  });

  it('pertence a outro time é negado', () => {
    expect(
      canPlayerBeCalledUp(player(), match(), { ...OPEN_CTX, inOtherTeam: true }).reason,
    ).toBe('in_other_team');
  });

  it('partida iniciada (ao_vivo) é negada', () => {
    expect(canPlayerBeCalledUp(player(), match({ status: 'ao_vivo' }), OPEN_CTX).reason).toBe(
      'match_started',
    );
  });

  it('partida finalizada é negada', () => {
    expect(canPlayerBeCalledUp(player(), match({ status: 'finalizado' }), OPEN_CTX).reason).toBe(
      'match_started',
    );
  });

  it('convocação fechada é negada', () => {
    expect(
      canPlayerBeCalledUp(player(), match(), { ...OPEN_CTX, convocationOpen: false }).reason,
    ).toBe('convocation_closed');
  });

  it('jogador do time visitante também é elegível', () => {
    expect(canPlayerBeCalledUp(player({ teamId: AWAY }), match(), OPEN_CTX).eligible).toBe(true);
  });
});

describe('predicados de edição/resposta', () => {
  it('convocação inexistente é editável (ainda não criada)', () => {
    expect(isConvocationEditable(null)).toBe(true);
    expect(isConvocationOpenForResponses(null)).toBe(false);
  });
  it('open é editável e aceita resposta; fechada/cancelada/concluída não', () => {
    expect(isConvocationEditable({ status: 'open' })).toBe(true);
    expect(isConvocationOpenForResponses({ status: 'open' })).toBe(true);
    for (const s of ['closed', 'cancelled', 'completed'] as const) {
      expect(isConvocationEditable({ status: s })).toBe(false);
      expect(isConvocationOpenForResponses({ status: s })).toBe(false);
    }
  });
});

describe('isPlayerCalledUp (B9 — bloqueio de eventos)', () => {
  it('convocado pode receber evento', () => {
    expect(isPlayerCalledUp({ playerIds: ['p1', 'p2'] }, 'p1')).toBe(true);
  });
  it('não convocado é bloqueado', () => {
    expect(isPlayerCalledUp({ playerIds: ['p2'] }, 'p1')).toBe(false);
  });
  it('sem convocação (legado) não bloqueia', () => {
    expect(isPlayerCalledUp(null, 'p1')).toBe(true);
    expect(isPlayerCalledUp(undefined, 'p1')).toBe(true);
  });
});

describe('groupTeamRoster', () => {
  function attendance(o: Partial<MatchAttendance>): MatchAttendance {
    return {
      id: attendanceDocId(MATCH, o.playerId ?? 'p1'),
      championshipId: CHAMP,
      matchId: MATCH,
      teamId: HOME,
      playerId: o.playerId ?? 'p1',
      userId: 'u1',
      response: o.response ?? 'pending',
      respondedAt: null,
      version: 1,
      reconfirmationRequired: o.reconfirmationRequired ?? false,
      previousResponse: o.previousResponse ?? null,
      updatedAt: 'now',
    };
  }

  const conv = (playerIds: string[], requiresReconfirmation = false): Convocation => ({
    id: convocationDocId(MATCH, HOME),
    championshipId: CHAMP,
    matchId: MATCH,
    teamId: HOME,
    captainId: 'cap',
    playerIds,
    status: 'open',
    responseDeadline: null,
    requiresReconfirmation,
    version: 1,
    previousVersion: null,
    createdAt: 'now',
    updatedAt: 'now',
  });

  it('separa confirmados, pendentes, recusados, não-convocados e suspensos', () => {
    const roster = [
      player({ id: 'p1' }),
      player({ id: 'p2' }),
      player({ id: 'p3' }),
      player({ id: 'p4' }),
      player({ id: 'p5' }),
    ];
    const att = new Map<string, MatchAttendance>([
      ['p1', attendance({ playerId: 'p1', response: 'confirmed' })],
      ['p2', attendance({ playerId: 'p2', response: 'declined' })],
      ['p3', attendance({ playerId: 'p3', response: 'pending' })],
    ]);
    const grouped = groupTeamRoster(
      roster,
      conv(['p1', 'p2', 'p3', 'p5']),
      att,
      new Set(['p5']),
    );
    const byId = new Map(grouped.map((g) => [g.player.id, g.bucket]));
    expect(byId.get('p1')).toBe('confirmed');
    expect(byId.get('p2')).toBe('declined');
    expect(byId.get('p3')).toBe('pending');
    expect(byId.get('p4')).toBe('not_called'); // fora da convocação
    expect(byId.get('p5')).toBe('suspended'); // suspenso tem prioridade
  });

  it('reconfirmação pendente rebaixa confirmado para pending', () => {
    const roster = [player({ id: 'p1' })];
    const att = new Map<string, MatchAttendance>([
      [
        'p1',
        attendance({ playerId: 'p1', response: 'confirmed', reconfirmationRequired: true }),
      ],
    ]);
    const grouped = groupTeamRoster(roster, conv(['p1']), att, new Set());
    expect(grouped[0].bucket).toBe('pending');
    expect(grouped[0].reconfirmationRequired).toBe(true);
  });
});

describe('deriveConvocationEffectiveStatus — consistência visual sem propagação', () => {
  const openConv = { status: 'open' as const, requiresReconfirmation: false };
  const closedConv = { status: 'closed' as const, requiresReconfirmation: false };

  it('cancelado → cancelled, resposta bloqueada, independente do doc', () => {
    // Doc ainda open (propagação não ocorreu)
    const s = deriveConvocationEffectiveStatus('cancelado', openConv);
    expect(s).toEqual({ effectiveStatus: 'cancelled', requiresReconfirmation: false, responseBlocked: true });
  });

  it('cancelado sem doc → cancelled (propagação atrasada)', () => {
    const s = deriveConvocationEffectiveStatus('cancelado', null);
    expect(s).toEqual({ effectiveStatus: 'cancelled', requiresReconfirmation: false, responseBlocked: true });
  });

  it('wo → completed, resposta bloqueada, independente do doc', () => {
    // Doc ainda open (propagação não ocorreu)
    const s = deriveConvocationEffectiveStatus('wo', openConv);
    expect(s).toEqual({ effectiveStatus: 'completed', requiresReconfirmation: false, responseBlocked: true });
  });

  it('wo sem doc → completed (doc atrasado)', () => {
    const s = deriveConvocationEffectiveStatus('wo', null);
    expect(s).toEqual({ effectiveStatus: 'completed', requiresReconfirmation: false, responseBlocked: true });
  });

  it('adiado → requiresReconfirmation=true mesmo que doc ainda esteja open sem flag', () => {
    // Adiamento publicado antes de applyConvocationStatusEffect propagar
    const s = deriveConvocationEffectiveStatus('adiado', openConv);
    expect(s.requiresReconfirmation).toBe(true);
    expect(s.responseBlocked).toBe(false);
    expect(s.effectiveStatus).toBe('open');
  });

  it('adiado sem doc → requiresReconfirmation=true', () => {
    const s = deriveConvocationEffectiveStatus('adiado', null);
    expect(s.requiresReconfirmation).toBe(true);
    expect(s.responseBlocked).toBe(false);
  });

  it('ao_vivo → resposta bloqueada, mantém status do doc', () => {
    const s = deriveConvocationEffectiveStatus('ao_vivo', openConv);
    expect(s.responseBlocked).toBe(true);
    expect(s.effectiveStatus).toBe('open');
  });

  it('ao_vivo → resposta bloqueada mesmo com doc closed', () => {
    const s = deriveConvocationEffectiveStatus('ao_vivo', closedConv);
    expect(s.responseBlocked).toBe(true);
    expect(s.effectiveStatus).toBe('closed');
  });

  it('finalizado → resposta bloqueada', () => {
    const s = deriveConvocationEffectiveStatus('finalizado', openConv);
    expect(s.responseBlocked).toBe(true);
  });

  it('agendado → usa doc como fonte de verdade, sem bloqueio', () => {
    const s = deriveConvocationEffectiveStatus('agendado', openConv);
    expect(s).toEqual({ effectiveStatus: 'open', requiresReconfirmation: false, responseBlocked: false });
  });

  it('agendado sem doc → open por padrão', () => {
    const s = deriveConvocationEffectiveStatus('agendado', null);
    expect(s.effectiveStatus).toBe('open');
    expect(s.responseBlocked).toBe(false);
  });
});
