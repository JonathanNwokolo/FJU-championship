/**
 * Testes diretos do matchStatusService (Bloco 5 — Fase A: W.O., adiamento e
 * cancelamento) e da máquina de estados. Sob Jest, MOCK_DATA_ENABLED é false, então
 * o serviço percorre o caminho real do Firestore — exercitado aqui contra o mesmo
 * harness transacional em memória usado em applyMatchCorrection.test.ts:
 *  - runTransaction faz buffer das escritas e só comita no fim (atômico);
 *  - se o corpo lança, NADA é gravado;
 *  - transaction.get lê o estado já comitado (recheck de versão/transição/idempotência);
 *  - serverTimestamp() vira sentinela observável ('SERVER_TS').
 */
import {
  Championship,
  ChampionshipRules,
  MatchModel,
  MatchStatusChange,
  Team,
} from '../types';

type AnyDoc = Record<string, unknown>;
type Ref = { __col: string; __id: string };

const mockStore: Record<string, Map<string, AnyDoc>> = {};

function mockCol(name: string): Map<string, AnyDoc> {
  if (!mockStore[name]) mockStore[name] = new Map();
  return mockStore[name];
}
function mockResetStore() {
  for (const key of Object.keys(mockStore)) delete mockStore[key];
}
function mockSnap(ref: Ref) {
  const current = mockCol(ref.__col).get(ref.__id);
  return { id: ref.__id, exists: () => current !== undefined, data: () => current };
}

jest.mock('firebase/firestore', () => ({
  doc: (_db: unknown, c: string, id: string): Ref => ({ __col: c, __id: id }),
  getDoc: async (ref: Ref) => mockSnap(ref),
  serverTimestamp: () => 'SERVER_TS',
  runTransaction: async (_db: unknown, fn: (t: unknown) => Promise<unknown>) => {
    const writes: Array<{ op: 'set' | 'update'; ref: Ref; data: AnyDoc }> = [];
    const tx = {
      get: async (ref: Ref) => mockSnap(ref),
      set: (ref: Ref, data: AnyDoc) => writes.push({ op: 'set', ref, data }),
      update: (ref: Ref, data: AnyDoc) => writes.push({ op: 'update', ref, data }),
    };
    const result = await fn(tx);
    for (const w of writes) {
      const c = mockCol(w.ref.__col);
      if (w.op === 'set') c.set(w.ref.__id, { id: w.ref.__id, ...w.data });
      else c.set(w.ref.__id, { ...(c.get(w.ref.__id) ?? { id: w.ref.__id }), ...w.data });
    }
    return result;
  },
}));

jest.mock('../config/appConfig', () => ({
  MOCK_DATA_ENABLED: false,
  USE_MOCK: false,
  MOCK_ACTIVE_USER: 'organizador',
  ALLOW_ORGANIZER_SELF_ASSIGN: false,
}));
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'org-1' } } }));

import {
  applyWalkover,
  applyPostpone,
  applyCancel,
  applyReactivate,
  MatchStatusError,
  getMatchStatusErrorMessage,
} from '../services/matchStatusService';
import {
  canTransitionMatchStatus,
  isTerminalMatchStatus,
  matchCountsForStandings,
  isMatchSettled,
} from '../utils/matchStatusRules';
import { calculateStandings } from '../services/statsService';

const ORG = 'org-1';
const CHAMP = 'champ-1';
const MATCH = 'match-1';
const HOME = 'team-home';
const AWAY = 'team-away';

const RULES: ChampionshipRules = {
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  tiebreakers: ['saldo_gols', 'gols_pro'],
  fairPlay: true,
  craqueDaRodada: true,
};

function champ(o: Partial<Championship> = {}): Championship {
  return {
    id: CHAMP,
    name: 'Copa FJU',
    format: 'pontos_corridos',
    status: 'em_andamento',
    currentRound: 1,
    totalRounds: 3,
    organizerId: ORG,
    inviteCode: 'COPA',
    rules: RULES,
    createdAt: 'now',
    ...o,
  };
}

function team(id: string): Team {
  return {
    id,
    championshipId: CHAMP,
    name: id,
    primaryColor: '#111',
    secondaryColor: '#fff',
    captainId: `${id}-cap`,
    status: 'aprovado',
    inviteCode: id,
    createdAt: 'now',
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
    statusVersion: 0,
    scheduledAt: '2026-07-01T19:00:00.000Z',
    ...o,
  };
}

function seedMatch(m: MatchModel = match(), extra: MatchModel[] = []) {
  mockCol('matches').set(m.id, { ...m });
  for (const e of extra) mockCol('matches').set(e.id, { ...e });
}
function seedChampionship(c: Championship = champ()) {
  mockCol('championships').set(c.id, { ...c });
}

const FUTURE = '2099-01-01T19:00:00.000Z';
const PAST = '2000-01-01T19:00:00.000Z';

beforeEach(() => mockResetStore());

// ─── Máquina de estados ───────────────────────────────────────────────────────────
describe('máquina de estados', () => {
  it('transições válidas a partir de agendado', () => {
    for (const to of ['ao_vivo', 'adiado', 'cancelado', 'wo'] as const) {
      expect(canTransitionMatchStatus('agendado', to)).toBe(true);
    }
  });

  it('transições válidas a partir de adiado e ao_vivo', () => {
    expect(canTransitionMatchStatus('adiado', 'agendado')).toBe(true);
    expect(canTransitionMatchStatus('adiado', 'cancelado')).toBe(true);
    expect(canTransitionMatchStatus('adiado', 'wo')).toBe(true);
    expect(canTransitionMatchStatus('ao_vivo', 'finalizado')).toBe(true);
    expect(canTransitionMatchStatus('ao_vivo', 'cancelado')).toBe(true);
  });

  it('transições inválidas são rejeitadas', () => {
    expect(canTransitionMatchStatus('agendado', 'finalizado')).toBe(false);
    expect(canTransitionMatchStatus('adiado', 'ao_vivo')).toBe(false);
    expect(canTransitionMatchStatus('ao_vivo', 'wo')).toBe(false);
    expect(canTransitionMatchStatus('finalizado', 'cancelado')).toBe(false);
  });

  it('estados terminais não têm saída', () => {
    for (const s of ['finalizado', 'cancelado', 'wo'] as const) {
      expect(isTerminalMatchStatus(s)).toBe(true);
      expect(canTransitionMatchStatus(s, 'agendado')).toBe(false);
    }
    expect(isTerminalMatchStatus('agendado')).toBe(false);
    expect(isTerminalMatchStatus('adiado')).toBe(false);
  });

  it('predicados de contagem', () => {
    expect(matchCountsForStandings('finalizado')).toBe(true);
    expect(matchCountsForStandings('wo')).toBe(true);
    expect(matchCountsForStandings('cancelado')).toBe(false);
    expect(matchCountsForStandings('adiado')).toBe(false);
    expect(isMatchSettled('wo')).toBe(true);
    expect(isMatchSettled('cancelado')).toBe(true);
    expect(isMatchSettled('adiado')).toBe(false);
  });
});

// ─── W.O. ───────────────────────────────────────────────────────────────────────
describe('applyWalkover', () => {
  function woCtx(o: Partial<Parameters<typeof applyWalkover>[0]> = {}) {
    const m = o.match ?? match();
    return {
      changeId: o.changeId ?? 'chg-1',
      organizerId: o.organizerId ?? ORG,
      reason: o.reason ?? 'Time visitante nao compareceu',
      match: m,
      championship: o.championship ?? champ(),
      allMatches: o.allMatches ?? [m],
      expectedStatusVersion: o.expectedStatusVersion ?? 0,
      winnerId: o.winnerId ?? HOME,
    };
  }

  it('mandante vence: placar 3x0, resultSource wo, status wo, winnerId', async () => {
    seedMatch();
    seedChampionship();
    const result = await applyWalkover(woCtx({ winnerId: HOME }));
    expect(result.idempotent).toBe(false);
    expect(mockCol('matches').get(MATCH)).toMatchObject({
      status: 'wo',
      resultSource: 'wo',
      homeScore: 3,
      awayScore: 0,
      winnerId: HOME,
      statusVersion: 1,
    });
    expect(mockCol('match_status_changes').has('chg-1')).toBe(true);
  });

  it('visitante vence: placar 0x3', async () => {
    seedMatch();
    seedChampionship();
    await applyWalkover(woCtx({ winnerId: AWAY }));
    expect(mockCol('matches').get(MATCH)).toMatchObject({ homeScore: 0, awayScore: 3, winnerId: AWAY });
  });

  it('não gera nenhum evento individual', async () => {
    seedMatch();
    seedChampionship();
    await applyWalkover(woCtx());
    expect(mockCol('match_events').size).toBe(0);
  });

  it('vencedor ausente é negado', async () => {
    seedMatch();
    await expect(applyWalkover(woCtx({ winnerId: '' }))).rejects.toMatchObject({
      code: 'winner_required',
    });
  });

  it('vencedor que não é dos times é negado', async () => {
    seedMatch();
    await expect(applyWalkover(woCtx({ winnerId: 'time-x' }))).rejects.toMatchObject({
      code: 'invalid_winner',
    });
  });

  it('não dono é negado', async () => {
    seedMatch();
    await expect(applyWalkover(woCtx({ organizerId: 'outro' }))).rejects.toMatchObject({
      code: 'not_owner',
    });
  });

  it('motivo curto é negado', async () => {
    seedMatch();
    await expect(applyWalkover(woCtx({ reason: 'x' }))).rejects.toMatchObject({
      code: 'reason_required',
    });
  });

  it('partida finalizada não aceita W.O. (transição inválida)', async () => {
    const m = match({ status: 'finalizado' });
    seedMatch(m);
    await expect(applyWalkover(woCtx({ match: m }))).rejects.toMatchObject({
      code: 'invalid_transition',
    });
  });

  it('campeonato encerrado (status) bloqueia', async () => {
    seedMatch();
    await expect(
      applyWalkover(woCtx({ championship: champ({ status: 'finalizado' }) })),
    ).rejects.toMatchObject({ code: 'championship_closed' });
  });

  it('championship_results existente bloqueia e nada muda', async () => {
    seedMatch();
    mockCol('championship_results').set(CHAMP, { id: CHAMP, championshipId: CHAMP });
    await expect(applyWalkover(woCtx())).rejects.toMatchObject({ code: 'championship_closed' });
    expect(mockCol('matches').get(MATCH)).toMatchObject({ status: 'agendado' });
    expect(mockCol('match_status_changes').size).toBe(0);
  });

  it('bloqueia W.O. em partida de grupo após o mata-mata já ter sido gerado', async () => {
    const m = match({ stage: 'group', groupId: 'A' });
    seedMatch(m);
    await expect(
      applyWalkover(
        woCtx({
          match: m,
          championship: champ({
            format: 'grupos_e_mata_mata',
            stage: 'knockout',
            groupStageStatus: 'completed',
            knockoutStageStatus: 'generated',
            groupSnapshotVersion: 1,
            knockoutGenerationVersion: 1,
          }),
        }),
      ),
    ).rejects.toMatchObject({ code: 'group_stage_locked_after_knockout_generation' });
    expect(mockCol('matches').get(MATCH)).toMatchObject({ status: 'agendado' });
    expect(mockCol('match_status_changes').size).toBe(0);
  });

  it('idempotência: repetir o mesmo changeId não reaplica', async () => {
    seedMatch();
    seedChampionship();
    const ctx = woCtx();
    await applyWalkover(ctx);
    const repeat = await applyWalkover(ctx);
    expect(repeat.idempotent).toBe(true);
    expect(mockCol('matches').get(MATCH)).toMatchObject({ statusVersion: 1 });
    expect(mockCol('match_status_changes').size).toBe(1);
  });

  it('duplo toque (segundo changeId, já na versão nova) é barrado pela transição wo→wo', async () => {
    seedMatch();
    seedChampionship();
    await applyWalkover(woCtx({ changeId: 'a' }));
    // Segundo toque com a versão já atualizada (1): passa do guard de versão e bate na
    // transição inválida wo→wo. (Com versão antiga, seria barrado por stale_version.)
    await expect(
      applyWalkover(woCtx({ changeId: 'b', expectedStatusVersion: 1 })),
    ).rejects.toMatchObject({ code: 'invalid_transition' });
  });

  it('mata-mata: vencedor avança ao slot par (home) e preserva o adversário', async () => {
    const m = match({ bracketRound: 'semi', bracketPosition: 0, nextMatchId: 'final-1' });
    const next = match({ id: 'final-1', status: 'agendado', homeTeamId: '', awayTeamId: 'team-x', round: 2 });
    seedMatch(m, [next]);
    seedChampionship();
    const result = await applyWalkover(
      woCtx({ match: m, championship: champ({ format: 'mata_mata' }), allMatches: [m, next], winnerId: HOME }),
    );
    expect(result.nextMatchIdToUpdate).toBe('final-1');
    expect(mockCol('matches').get('final-1')).toMatchObject({ homeTeamId: HOME, awayTeamId: 'team-x' });
  });

  it('mata-mata: slot ímpar atualiza awayTeamId', async () => {
    const m = match({ bracketRound: 'semi', bracketPosition: 1, nextMatchId: 'final-1' });
    const next = match({ id: 'final-1', status: 'agendado', homeTeamId: 'team-x', awayTeamId: '', round: 2 });
    seedMatch(m, [next]);
    seedChampionship();
    await applyWalkover(
      woCtx({ match: m, championship: champ({ format: 'mata_mata' }), allMatches: [m, next], winnerId: AWAY }),
    );
    expect(mockCol('matches').get('final-1')).toMatchObject({ homeTeamId: 'team-x', awayTeamId: AWAY });
  });

  it('mata-mata: próxima partida ao vivo bloqueia e nada muda', async () => {
    const m = match({ bracketRound: 'semi', bracketPosition: 0, nextMatchId: 'final-1' });
    const next = match({ id: 'final-1', status: 'ao_vivo', homeTeamId: '', awayTeamId: 'team-x', round: 2 });
    seedMatch(m, [next]);
    seedChampionship();
    await expect(
      applyWalkover(woCtx({ match: m, championship: champ({ format: 'mata_mata' }), allMatches: [m, next] })),
    ).rejects.toMatchObject({ code: 'next_match_locked' });
    expect(mockCol('matches').get(MATCH)).toMatchObject({ status: 'agendado' });
    expect(mockCol('matches').get('final-1')).toMatchObject({ homeTeamId: '' });
  });

  it('mata-mata final (sem nextMatchId) define vencedor provisório sem avançar', async () => {
    const finalMatch = match({ bracketRound: 'final', nextMatchId: null });
    seedMatch(finalMatch);
    seedChampionship();
    const result = await applyWalkover(
      woCtx({ match: finalMatch, championship: champ({ format: 'mata_mata' }), allMatches: [finalMatch], winnerId: AWAY }),
    );
    expect(result.nextMatchIdToUpdate).toBeNull();
    expect(mockCol('matches').get(MATCH)).toMatchObject({ status: 'wo', winnerId: AWAY });
  });

  it('avança currentRound quando o W.O. liquida o último jogo da rodada', async () => {
    const m = match();
    seedMatch(m);
    seedChampionship(champ({ currentRound: 1 }));
    await applyWalkover(woCtx({ match: m, allMatches: [m] }));
    expect(mockCol('championships').get(CHAMP)).toMatchObject({ currentRound: 2 });
  });

  it('não avança currentRound se ainda há jogo pendente na rodada', async () => {
    const m = match();
    const other = match({ id: 'm2', homeTeamId: 'c', awayTeamId: 'd', status: 'agendado' });
    seedMatch(m, [other]);
    seedChampionship(champ({ currentRound: 1 }));
    await applyWalkover(woCtx({ match: m, allMatches: [m, other] }));
    expect(mockCol('championships').get(CHAMP)).toMatchObject({ currentRound: 1 });
  });

  it('versão obsoleta é rejeitada', async () => {
    seedMatch(match({ statusVersion: 2 }));
    seedChampionship();
    await expect(applyWalkover(woCtx({ expectedStatusVersion: 0 }))).rejects.toMatchObject({
      code: 'stale_version',
    });
  });
});

// ─── Adiamento ────────────────────────────────────────────────────────────────────
describe('applyPostpone', () => {
  function ctx(o: Partial<Parameters<typeof applyPostpone>[0]> = {}) {
    const m = o.match ?? match();
    return {
      changeId: o.changeId ?? 'chg-p',
      organizerId: o.organizerId ?? ORG,
      reason: o.reason ?? 'Chuva forte no local',
      match: m,
      championship: o.championship ?? champ(),
      allMatches: o.allMatches ?? [m],
      expectedStatusVersion: o.expectedStatusVersion ?? 0,
      newScheduledAt: o.newScheduledAt ?? FUTURE,
    };
  }

  it('adia com nova data futura, preserva chave e nextMatchId', async () => {
    const m = match({ bracketRound: 'semi', nextMatchId: 'final-1', round: 2 });
    seedMatch(m);
    seedChampionship();
    await applyPostpone(ctx({ match: m }));
    expect(mockCol('matches').get(MATCH)).toMatchObject({
      status: 'adiado',
      scheduledAt: FUTURE,
      nextMatchId: 'final-1',
      bracketRound: 'semi',
      round: 2,
      statusVersion: 1,
    });
    const log = mockCol('match_status_changes').get('chg-p') as unknown as MatchStatusChange;
    expect(log.type).toBe('adiamento');
    expect(log.afterDate).toBe(FUTURE);
    expect(log.derivedEffects).toContain('reconfirmar_presenca');
  });

  it('nova data no passado é negada', async () => {
    seedMatch();
    await expect(applyPostpone(ctx({ newScheduledAt: PAST }))).rejects.toMatchObject({
      code: 'invalid_date',
    });
  });

  it('data inválida é negada', async () => {
    seedMatch();
    await expect(applyPostpone(ctx({ newScheduledAt: 'xx' }))).rejects.toMatchObject({
      code: 'invalid_date',
    });
  });

  it('partida finalizada não pode ser adiada', async () => {
    const m = match({ status: 'finalizado' });
    seedMatch(m);
    await expect(applyPostpone(ctx({ match: m }))).rejects.toMatchObject({
      code: 'invalid_transition',
    });
  });

  it('partida ao vivo não pode ser adiada diretamente', async () => {
    const m = match({ status: 'ao_vivo' });
    seedMatch(m);
    await expect(applyPostpone(ctx({ match: m }))).rejects.toMatchObject({
      code: 'invalid_transition',
    });
  });

  it('não altera eventos da partida', async () => {
    seedMatch();
    seedChampionship();
    mockCol('match_events').set('e1', { id: 'e1', matchId: MATCH, type: 'gol' });
    await applyPostpone(ctx());
    expect(mockCol('match_events').get('e1')).toMatchObject({ id: 'e1', type: 'gol' });
  });
});

// ─── Cancelamento ───────────────────────────────────────────────────────────────────
describe('applyCancel', () => {
  function ctx(o: Partial<Parameters<typeof applyCancel>[0]> = {}) {
    const m = o.match ?? match();
    return {
      changeId: o.changeId ?? 'chg-c',
      organizerId: o.organizerId ?? ORG,
      reason: o.reason ?? 'Falta de arbitragem',
      match: m,
      championship: o.championship ?? champ(),
      allMatches: o.allMatches ?? [m],
      expectedStatusVersion: o.expectedStatusVersion ?? 0,
    };
  }

  it('cancela sem alterar placar nem vencedor', async () => {
    const m = match({ homeScore: null, awayScore: null });
    seedMatch(m);
    seedChampionship();
    await applyCancel(ctx({ match: m }));
    expect(mockCol('matches').get(MATCH)).toMatchObject({ status: 'cancelado' });
    expect(mockCol('matches').get(MATCH)?.winnerId).toBeUndefined();
    const log = mockCol('match_status_changes').get('chg-c') as unknown as MatchStatusChange;
    expect(log.type).toBe('cancelamento');
    expect(log.winnerId).toBeNull();
  });

  it('preserva eventos para auditoria', async () => {
    seedMatch();
    seedChampionship();
    mockCol('match_events').set('e1', { id: 'e1', matchId: MATCH, type: 'gol' });
    await applyCancel(ctx());
    expect(mockCol('match_events').get('e1')).toBeDefined();
  });

  it('cancela partida ao vivo (transição permitida)', async () => {
    const m = match({ status: 'ao_vivo' });
    seedMatch(m);
    seedChampionship();
    await applyCancel(ctx({ match: m }));
    expect(mockCol('matches').get(MATCH)).toMatchObject({ status: 'cancelado' });
  });

  it('mata-mata: cancelar não avança nem altera a próxima partida', async () => {
    const m = match({ bracketRound: 'semi', bracketPosition: 0, nextMatchId: 'final-1', round: 2 });
    const next = match({ id: 'final-1', status: 'agendado', homeTeamId: '', awayTeamId: 'team-x', round: 3 });
    seedMatch(m, [next]);
    seedChampionship(champ({ format: 'mata_mata', currentRound: 2 }));
    const result = await applyCancel(
      ctx({ match: m, championship: champ({ format: 'mata_mata', currentRound: 2 }), allMatches: [m, next] }),
    );
    // Cancelamento não produz vencedor: nenhum avanço estrutural na chave.
    expect(result.nextMatchIdToUpdate).toBeNull();
    expect(mockCol('matches').get(MATCH)).toMatchObject({ status: 'cancelado' });
    expect(mockCol('matches').get('final-1')).toMatchObject({ homeTeamId: '', awayTeamId: 'team-x' });
  });

  it('partida finalizada não pode ser cancelada', async () => {
    const m = match({ status: 'finalizado' });
    seedMatch(m);
    await expect(applyCancel(ctx({ match: m }))).rejects.toMatchObject({
      code: 'invalid_transition',
    });
  });

  it('log imutável: criado uma vez, idempotente em repetição', async () => {
    seedMatch();
    seedChampionship();
    await applyCancel(ctx());
    const repeat = await applyCancel(ctx());
    expect(repeat.idempotent).toBe(true);
    expect(mockCol('match_status_changes').size).toBe(1);
  });

  it('campeonato encerrado bloqueia o cancelamento', async () => {
    seedMatch();
    await expect(
      applyCancel(ctx({ championship: champ({ status: 'finalizado' }) })),
    ).rejects.toMatchObject({ code: 'championship_closed' });
  });
});

// ─── Reativação ───────────────────────────────────────────────────────────────────
describe('applyReactivate', () => {
  it('adiado volta a agendado', async () => {
    const m = match({ status: 'adiado' });
    seedMatch(m);
    seedChampionship();
    await applyReactivate({
      changeId: 'chg-r',
      organizerId: ORG,
      reason: 'Nova data confirmada',
      match: m,
      championship: champ(),
      allMatches: [m],
      expectedStatusVersion: 0,
      newScheduledAt: FUTURE,
    });
    expect(mockCol('matches').get(MATCH)).toMatchObject({ status: 'agendado', scheduledAt: FUTURE });
  });

  it('só pode reativar partida adiada', async () => {
    const m = match({ status: 'agendado' });
    seedMatch(m);
    await expect(
      applyReactivate({
        changeId: 'chg-r2',
        organizerId: ORG,
        reason: 'Tentativa invalida',
        match: m,
        championship: champ(),
        allMatches: [m],
        expectedStatusVersion: 0,
      }),
    ).rejects.toMatchObject({ code: 'invalid_transition' });
  });
});

// ─── Classificação com W.O./cancelada ───────────────────────────────────────────────
describe('classificação respeita os novos estados', () => {
  const teams = [team(HOME), team(AWAY)];

  it('W.O. (3x0) conta como vitória/derrota na tabela', () => {
    const woMatch = match({ status: 'wo', resultSource: 'wo', homeScore: 3, awayScore: 0, winnerId: HOME });
    const standings = calculateStandings([woMatch], [], teams, RULES);
    expect(standings.find((s) => s.teamId === HOME)).toMatchObject({ points: 3, won: 1, goalsFor: 3 });
    expect(standings.find((s) => s.teamId === AWAY)).toMatchObject({ points: 0, lost: 1, goalsAgainst: 3 });
  });

  it('partida cancelada não conta na tabela', () => {
    const cancelled = match({ status: 'cancelado', homeScore: 3, awayScore: 0 });
    const standings = calculateStandings([cancelled], [], teams, RULES);
    expect(standings.find((s) => s.teamId === HOME)).toMatchObject({ played: 0, points: 0 });
    expect(standings.find((s) => s.teamId === AWAY)).toMatchObject({ played: 0, points: 0 });
  });

  it('partida adiada não conta na tabela', () => {
    const postponed = match({ status: 'adiado', homeScore: null, awayScore: null });
    const standings = calculateStandings([postponed], [], teams, RULES);
    expect(standings.every((s) => s.played === 0)).toBe(true);
  });
});

// ─── Mensagens amigáveis ────────────────────────────────────────────────────────────
describe('getMatchStatusErrorMessage', () => {
  it('mantém mensagem de negócio', () => {
    expect(getMatchStatusErrorMessage(new MatchStatusError('next_match_locked', 'Bloqueado.'))).toBe(
      'Bloqueado.',
    );
  });
  it('classifica permission-denied', () => {
    expect(getMatchStatusErrorMessage({ code: 'permission-denied' })).toMatch(/permiss/i);
  });
  it('não vaza erro técnico cru', () => {
    const msg = getMatchStatusErrorMessage(new Error('FirebaseError: internal assertion xyz'));
    expect(msg).not.toMatch(/assertion/i);
    expect(msg).toMatch(/inesperado/i);
  });
});
