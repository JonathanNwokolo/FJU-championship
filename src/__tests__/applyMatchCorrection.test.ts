/**
 * Testes diretos do serviço real applyMatchCorrection (Bloco 4 — correção
 * controlada). Sob Jest o MOCK_DATA_ENABLED é false, então o serviço percorre o
 * caminho real do Firestore. Aqui ele é exercitado contra um harness de Firestore
 * transacional em memória, fiel ao comportamento real:
 *  - runTransaction faz buffer das escritas e só faz commit no fim (atômico);
 *  - se o corpo lança, NADA é gravado (sem log parcial);
 *  - transaction.get lê o estado já comitado (recheck de versão e idempotência);
 *  - serverTimestamp() vira um sentinela observável ('SERVER_TS').
 *
 * Autorização por papel (capitão/atleta/sem auth) é garantida pelas Firestore
 * Rules e pela tela (canManageMatch); no serviço a autorização é por posse do
 * organizador (organizerId == championship.organizerId) — coberta aqui — e os
 * demais papéis recaem nesse mesmo guard `not_owner`.
 */
import {
  Championship,
  ChampionshipResultData,
  ChampionshipRules,
  MatchCorrection,
  MatchEvent,
  MatchModel,
  Player,
  Team,
} from '../types';

// ─── Harness de Firestore transacional em memória ──────────────────────────────
// Prefixo `mock` é obrigatório para variáveis referenciadas dentro de jest.mock().
type AnyDoc = Record<string, unknown>;
type Ref = { __col: string; __id: string };
type QueryShape = { __col?: string; __collectionGroup?: string; __constraints: AnyDoc[] };

const mockStore: Record<string, Map<string, AnyDoc>> = {};
let mockTxAttempts = 1; // quantas vezes runTransaction reexecuta o corpo (simula retry)

function mockCol(name: string): Map<string, AnyDoc> {
  if (!mockStore[name]) mockStore[name] = new Map();
  return mockStore[name];
}
function mockResetStore() {
  for (const key of Object.keys(mockStore)) delete mockStore[key];
  mockTxAttempts = 1;
}
function mockSnap(ref: Ref) {
  const current = mockCol(ref.__col).get(ref.__id);
  return {
    id: ref.__id,
    exists: () => current !== undefined,
    data: () => current,
  };
}
function mockMatchesFilters(doc: AnyDoc, filters: AnyDoc[]): boolean {
  return filters.every((filter) => {
    if (!('field' in filter)) return true;
    if (filter.operator !== '==') return true;
    return doc[String(filter.field)] === filter.value;
  });
}
function mockDocsForQuery(q: QueryShape) {
  const docs: Array<{ id: string; data: () => AnyDoc }> = [];
  if (q.__collectionGroup === 'achievements') {
    for (const [colName, col] of Object.entries(mockStore)) {
      if (!/^players\/[^/]+\/achievements$/.test(colName)) continue;
      for (const [id, data] of col.entries()) {
        if (mockMatchesFilters(data, q.__constraints)) docs.push({ id, data: () => data });
      }
    }
    return docs;
  }
  for (const [id, data] of mockCol(q.__col ?? '').entries()) {
    if (mockMatchesFilters(data, q.__constraints)) docs.push({ id, data: () => data });
  }
  return docs;
}

jest.mock('firebase/firestore', () => ({
  collection: (_db: unknown, c: string) => ({ __col: c }),
  collectionGroup: (_db: unknown, c: string) => ({ __collectionGroup: c }),
  doc: (_db: unknown, c: string, id: string): Ref => ({ __col: c, __id: id }),
  getDoc: async (ref: Ref) => mockSnap(ref),
  getDocs: async (q: QueryShape) => ({ docs: mockDocsForQuery(q) }),
  query: (source: { __col?: string; __collectionGroup?: string }, ...constraints: AnyDoc[]) => ({
    ...source,
    __constraints: constraints,
  }),
  serverTimestamp: () => 'SERVER_TS',
  where: (field: string, operator: string, value: unknown) => ({ field, operator, value }),
  runTransaction: async (_db: unknown, fn: (t: unknown) => Promise<unknown>) => {
    let writes: Array<{ op: 'set' | 'update'; ref: Ref; data: AnyDoc }> = [];
    let result: unknown;
    // Reexecuta o corpo `mockTxAttempts` vezes com buffer NOVO a cada tentativa; só a
    // última tentativa é comitada — modela um retry transacional sem duplicar efeitos.
    for (let attempt = 0; attempt < mockTxAttempts; attempt++) {
      writes = [];
      const tx = {
        get: async (ref: Ref) => mockSnap(ref),
        set: (ref: Ref, data: AnyDoc) => writes.push({ op: 'set', ref, data }),
        update: (ref: Ref, data: AnyDoc) => writes.push({ op: 'update', ref, data }),
      };
      result = await fn(tx); // se lançar, propaga e nada é comitado
    }
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
  applyMatchCorrection,
  applyMatchCorrectionWithClosedChampionshipReprocess,
  CorrectionError,
  getCorrectionErrorMessage,
  IntegratedMatchCorrectionContext,
} from '../services/matchCorrectionService';
import { calculateStandings, calculateTopScorers } from '../services/statsService';
import { computeChampionshipOutcome } from '../utils/championshipReprocessing';

// ─── Builders ──────────────────────────────────────────────────────────────────
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
  yellowCardLimit: 2,
};

function champ(o: Partial<Championship> = {}): Championship {
  return {
    id: CHAMP,
    name: 'Copa FJU',
    format: 'pontos_corridos',
    status: 'em_andamento',
    currentRound: 2,
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

function player(id: string, teamId: string, name = id, userId?: string): Player {
  return {
    id,
    teamId,
    championshipId: CHAMP,
    name,
    userId,
    position: 'atacante',
    number: 9,
    status: 'ativo',
  };
}

function match(o: Partial<MatchModel> = {}): MatchModel {
  return {
    id: MATCH,
    championshipId: CHAMP,
    round: 1,
    homeTeamId: HOME,
    awayTeamId: AWAY,
    homeScore: 1,
    awayScore: 0,
    status: 'finalizado',
    correctionVersion: 0,
    ...o,
  };
}

let eventSeq = 0;
function ev(o: Partial<MatchEvent> & Pick<MatchEvent, 'type' | 'teamId' | 'playerId'>): MatchEvent {
  return {
    id: o.id ?? `e${++eventSeq}`,
    matchId: o.matchId ?? MATCH,
    championshipId: CHAMP,
    minute: o.minute ?? 10,
    ...o,
  } as MatchEvent;
}

function context(o: Partial<IntegratedMatchCorrectionContext> = {}): IntegratedMatchCorrectionContext {
  const m = o.match ?? match();
  // Default coerente: partida 1x0 com 1 gol do mandante, e o rascunho preserva esse
  // gol — uma "correção neutra" que passa nas validações de consistência placar×eventos.
  const seedGoal = ev({ id: 'seed-g1', type: 'gol', teamId: HOME, playerId: 'p1' });
  return {
    correctionId: o.correctionId ?? 'corr-1',
    organizerId: o.organizerId ?? ORG,
    reason: o.reason ?? 'Erro de súmula',
    match: m,
    championship: o.championship ?? champ(),
    allMatches: o.allMatches ?? [m],
    allEvents: o.allEvents ?? [seedGoal],
    players: o.players ?? [player('p1', HOME), player('p2', AWAY)],
    nextHomeScore: o.nextHomeScore ?? 1,
    nextAwayScore: o.nextAwayScore ?? 0,
    nextEvents: o.nextEvents ?? [seedGoal],
    expectedCorrectionVersion: o.expectedCorrectionVersion ?? 0,
    expectedReprocessVersion: o.expectedReprocessVersion,
  };
}

/** Semeia a partida (e opcionalmente a próxima) no store, como o Firestore real. */
function seedMatch(m: MatchModel = match(), extra: MatchModel[] = []) {
  mockCol('matches').set(m.id, { ...m });
  for (const e of extra) mockCol('matches').set(e.id, { ...e });
}

function eventsAfter(allEvents: MatchEvent[], matchId: string, activeEvents: MatchEvent[]): MatchEvent[] {
  return [...allEvents.filter((e) => e.matchId !== matchId), ...activeEvents];
}

beforeEach(() => {
  mockResetStore();
  eventSeq = 0;
});

// ─── Autorização ────────────────────────────────────────────────────────────────
describe('applyMatchCorrection · autorização', () => {
  it('organizador dono consegue corrigir', async () => {
    seedMatch();
    const result = await applyMatchCorrection(context());
    expect(result.idempotent).toBe(false);
    expect(mockCol('match_corrections').has('corr-1')).toBe(true);
  });

  it('organizador de outro campeonato é negado (não é dono)', async () => {
    seedMatch();
    await expect(
      applyMatchCorrection(context({ organizerId: 'other-org' })),
    ).rejects.toMatchObject({ code: 'not_owner' });
    expect(mockCol('match_corrections').size).toBe(0);
  });

  it('capitão é negado (recai em not_owner)', async () => {
    seedMatch();
    await expect(
      applyMatchCorrection(context({ organizerId: 'team-home-cap' })),
    ).rejects.toMatchObject({ code: 'not_owner' });
  });

  it('atleta é negado (recai em not_owner)', async () => {
    seedMatch();
    await expect(
      applyMatchCorrection(context({ organizerId: 'p1' })),
    ).rejects.toMatchObject({ code: 'not_owner' });
  });

  it('usuário sem autenticação é negado (organizerId vazio)', async () => {
    seedMatch();
    await expect(
      applyMatchCorrection(context({ organizerId: '' })),
    ).rejects.toMatchObject({ code: 'not_owner' });
  });
});

// ─── Validação de entrada ────────────────────────────────────────────────────────
describe('applyMatchCorrection · validação de entrada', () => {
  it('motivo ausente é negado', async () => {
    seedMatch();
    await expect(applyMatchCorrection(context({ reason: '' }))).rejects.toMatchObject({
      code: 'reason_required',
    });
  });

  it('motivo menor que o mínimo é negado', async () => {
    seedMatch();
    await expect(applyMatchCorrection(context({ reason: 'ok' }))).rejects.toMatchObject({
      code: 'reason_required',
    });
  });

  it('placar negativo é negado', async () => {
    seedMatch();
    await expect(
      applyMatchCorrection(context({ nextHomeScore: -1, nextAwayScore: 0 })),
    ).rejects.toMatchObject({ code: 'score_mismatch' });
  });

  it('placar incompatível com eventos de gol é negado', async () => {
    seedMatch();
    // placar 2x0 mas só um gol de evento
    await expect(
      applyMatchCorrection(
        context({
          nextHomeScore: 2,
          nextAwayScore: 0,
          nextEvents: [ev({ id: 'local-g', type: 'gol', teamId: HOME, playerId: 'p1' })],
        }),
      ),
    ).rejects.toMatchObject({ code: 'score_mismatch' });
  });

  it('partida não finalizada é negada', async () => {
    const m = match({ status: 'ao_vivo' });
    seedMatch(m);
    await expect(applyMatchCorrection(context({ match: m }))).rejects.toMatchObject({
      code: 'not_finalized',
    });
  });

  it('grupos + mata-mata permite correcao antes da transicao para mata-mata', async () => {
    seedMatch();
    const result = await applyMatchCorrection(
      context({
        championship: champ({ format: 'grupos_e_mata_mata', stage: 'group_stage' }),
        match: match({ stage: 'group', groupId: 'A' }),
      }),
    );
    expect(result.idempotent).toBe(false);
  });

  it('bloqueia correcao de partida de grupo apos snapshot/chave gerados', async () => {
    const m = match({ stage: 'group', groupId: 'A' });
    seedMatch(m);
    await expect(
      applyMatchCorrection(
        context({
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
  });

  it('match inexistente é negado (não persistido no store)', async () => {
    // store de matches vazio → o recheck transacional não encontra a partida
    await expect(applyMatchCorrection(context())).rejects.toMatchObject({
      code: 'match_not_found',
    });
    expect(mockCol('match_corrections').size).toBe(0);
  });

  it('campeonato ausente no contexto é negado', async () => {
    seedMatch();
    const ctx = { ...context(), championship: undefined as unknown as Championship };
    await expect(applyMatchCorrection(ctx)).rejects.toMatchObject({
      code: 'championship_missing',
    });
  });

  it('evento de outra partida é rejeitado', async () => {
    seedMatch();
    await expect(
      applyMatchCorrection(
        context({
          nextEvents: [ev({ id: 'e-foreign', matchId: 'outra', type: 'gol', teamId: HOME, playerId: 'p1' })],
          nextHomeScore: 1,
        }),
      ),
    ).rejects.toMatchObject({ code: 'event_mismatch' });
  });
});

// ─── Campeonato encerrado ────────────────────────────────────────────────────────
describe('applyMatchCorrection · campeonato encerrado', () => {
  it('championship_results existente bloqueia e não altera nada', async () => {
    seedMatch();
    mockCol('championship_results').set(CHAMP, { id: CHAMP, championshipId: CHAMP });

    await expect(applyMatchCorrection(context())).rejects.toMatchObject({
      code: 'championship_closed',
    });

    // nenhum match alterado
    expect(mockCol('matches').get(MATCH)).toMatchObject({ correctionVersion: 0, homeScore: 1 });
    // nenhum evento criado/alterado
    expect(mockCol('match_events').size).toBe(0);
    // nenhum log criado
    expect(mockCol('match_corrections').size).toBe(0);
  });

  it('correctionVersion não muda quando campeonato está encerrado', async () => {
    const m = match({ correctionVersion: 3 });
    seedMatch(m);
    mockCol('championship_results').set(CHAMP, { id: CHAMP, championshipId: CHAMP });

    await expect(
      applyMatchCorrection(context({ match: m, expectedCorrectionVersion: 3 })),
    ).rejects.toBeInstanceOf(CorrectionError);
    expect(mockCol('matches').get(MATCH)).toMatchObject({ correctionVersion: 3 });
  });

  it('status finalizado também bloqueia', async () => {
    seedMatch();
    await expect(
      applyMatchCorrection(context({ championship: champ({ status: 'finalizado' }) })),
    ).rejects.toMatchObject({ code: 'championship_closed' });
  });
});

function seedClosedReprocessState(closedChamp: Championship, closedMatch: MatchModel, frozenEvents: MatchEvent[]) {
  const closedTeams = [team(HOME), team(AWAY)];
  const closedPlayers = [
    player('p1', HOME, 'Ana', 'u1'),
    player('p2', AWAY, 'Bia', 'u2'),
  ];
  mockCol('teams').set(HOME, closedTeams[0] as unknown as AnyDoc);
  mockCol('teams').set(AWAY, closedTeams[1] as unknown as AnyDoc);
  for (const p of closedPlayers) mockCol('players').set(p.id, p as unknown as AnyDoc);
  mockCol('matches').set(closedMatch.id, { ...closedMatch });
  for (const event of frozenEvents) mockCol('match_events').set(event.id, event as unknown as AnyDoc);

  const outcome = computeChampionshipOutcome({
    championship: closedChamp,
    teams: closedTeams,
    players: closedPlayers,
    matches: [closedMatch],
    events: frozenEvents,
    roundAwards: [],
  });
  const frozenResult: ChampionshipResultData = {
    ...outcome.result,
    finishedAt: '2026-02-01',
  };
  mockCol('championship_results').set(CHAMP, frozenResult as unknown as AnyDoc);
  for (const row of outcome.playerRows) {
    mockCol('player_history').set(`hist-${row.userId}`, {
      id: `hist-${row.userId}`,
      userId: row.userId,
      championshipId: CHAMP,
      championshipName: row.championshipName,
      teamId: row.teamId,
      teamName: row.teamName,
      season: row.season,
      goals: row.goals,
      assists: row.assists,
      yellowCards: row.yellowCards,
      redCards: row.redCards,
      matchesPlayed: row.matchesPlayed,
      overall: row.overall,
      finishedAt: '2026-02-01',
      position: row.position,
      isChampion: row.isChampion,
      isMvp: row.isMvp,
      roundMvpCount: row.roundMvpCount,
    });
  }
  for (const achievement of outcome.expectedAchievements) {
    mockCol(`players/${achievement.playerId}/achievements`).set(achievement.achievementId, {
      achievementId: achievement.achievementId,
      playerId: achievement.playerId,
      championshipId: CHAMP,
      unlockedAt: '2026-02-01',
    });
  }

  return { closedPlayers, frozenResult };
}

describe('applyMatchCorrectionWithClosedChampionshipReprocess · integração', () => {
  it('permite campeonato encerrado com results, corrige primeiro e reprocessa depois', async () => {
    const closedChamp = champ({ status: 'finalizado' });
    const closedMatch = match({ homeScore: 1, awayScore: 0, winnerId: HOME });
    const oldGoal = ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p1' });
    const { closedPlayers } = seedClosedReprocessState(closedChamp, closedMatch, [oldGoal]);

    const result = await applyMatchCorrectionWithClosedChampionshipReprocess(
      context({
        correctionId: 'corr-closed',
        championship: closedChamp,
        match: closedMatch,
        allMatches: [closedMatch],
        allEvents: [oldGoal],
        players: closedPlayers,
        nextHomeScore: 0,
        nextAwayScore: 1,
        nextEvents: [ev({ id: 'local-away-goal', type: 'gol', teamId: AWAY, playerId: 'p2' })],
        expectedReprocessVersion: 0,
      }),
    );

    expect(mockCol('matches').get(MATCH)).toMatchObject({
      lastCorrectionId: 'corr-closed',
      winnerId: AWAY,
    });
    expect(result.reprocess).toBeDefined();
    expect(result.reprocess?.idempotent).toBe(false);
    expect(result.reprocess?.changedFields).toEqual(
      expect.arrayContaining(['winnerId', 'runnerUpId', 'topScorerId']),
    );
    const log = mockCol('championship_reprocess_logs').get(result.reprocess!.reprocessId);
    expect(log).toMatchObject({
      sourceCorrectionId: 'corr-closed',
      sourceMatchId: MATCH,
      reprocessVersion: 1,
    });
    expect(mockCol('championship_results').get(CHAMP)).toMatchObject({
      winnerId: AWAY,
      sourceCorrectionId: 'corr-closed',
      reprocessVersion: 1,
    });
  });

  it('nao roda reprocessamento quando a correcao falha', async () => {
    const closedChamp = champ({ status: 'finalizado' });
    const closedMatch = match({ homeScore: 1, awayScore: 0, winnerId: HOME });
    const oldGoal = ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p1' });
    const { closedPlayers } = seedClosedReprocessState(closedChamp, closedMatch, [oldGoal]);

    await expect(
      applyMatchCorrectionWithClosedChampionshipReprocess(
        context({
          correctionId: 'corr-fail',
          championship: closedChamp,
          match: closedMatch,
          allMatches: [closedMatch],
          allEvents: [oldGoal],
          players: closedPlayers,
          nextHomeScore: 2,
          nextAwayScore: 0,
          nextEvents: [oldGoal],
          expectedReprocessVersion: 0,
        }),
      ),
    ).rejects.toMatchObject({ code: 'score_mismatch' });

    expect(mockCol('match_corrections').size).toBe(0);
    expect(mockCol('championship_reprocess_logs').size).toBe(0);
  });

  it('retry da mesma correcao retorna reprocessamento existente sem duplicar log', async () => {
    const closedChamp = champ({ status: 'finalizado' });
    const closedMatch = match({ homeScore: 1, awayScore: 0, winnerId: HOME });
    const oldGoal = ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p1' });
    const { closedPlayers } = seedClosedReprocessState(closedChamp, closedMatch, [oldGoal]);
    const ctx = context({
      correctionId: 'corr-retry',
      championship: closedChamp,
      match: closedMatch,
      allMatches: [closedMatch],
      allEvents: [oldGoal],
      players: closedPlayers,
      nextHomeScore: 0,
      nextAwayScore: 1,
      nextEvents: [ev({ id: 'local-away-goal', type: 'gol', teamId: AWAY, playerId: 'p2' })],
      expectedReprocessVersion: 0,
    });

    const first = await applyMatchCorrectionWithClosedChampionshipReprocess(ctx);
    const logCount = mockCol('championship_reprocess_logs').size;
    const retry = await applyMatchCorrectionWithClosedChampionshipReprocess(ctx);

    expect(retry.idempotent).toBe(true);
    expect(retry.reprocess?.idempotent).toBe(true);
    expect(retry.reprocess?.reprocessId).toBe(first.reprocess?.reprocessId);
    expect(mockCol('championship_reprocess_logs').size).toBe(logCount);
  });
});

// ─── Auditoria ───────────────────────────────────────────────────────────────────
describe('applyMatchCorrection · auditoria', () => {
  it('correção válida cria match_corrections/{correctionId} com antes e depois', async () => {
    seedMatch();
    const ctx = context({
      reason: 'Gol anulado por impedimento',
      nextHomeScore: 0,
      nextAwayScore: 0,
      nextEvents: [],
      allEvents: [ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p1' })],
    });
    await applyMatchCorrection(ctx);

    const log = mockCol('match_corrections').get('corr-1') as unknown as MatchCorrection;
    expect(log).toBeDefined();
    expect(log.organizerId).toBe(ORG);
    expect(log.reason).toBe('Gol anulado por impedimento');
    expect(log.previousScore).toEqual({ homeScore: 1, awayScore: 0 });
    expect(log.newScore).toEqual({ homeScore: 0, awayScore: 0 });
    expect(log.previousMatchVersion).toBe(0);
    expect(log.newMatchVersion).toBe(1);
    expect(log.eventsRemoved.map((e) => e.id)).toEqual(['g1']);
    expect(log.eventsAdded).toEqual([]);
    expect(log.eventsChanged).toEqual([]);
  });

  it('log registra eventos adicionados, removidos e alterados', async () => {
    seedMatch();
    const keep = ev({ id: 'keep', type: 'gol', teamId: HOME, playerId: 'p1' });
    const drop = ev({ id: 'drop', type: 'cartao_amarelo', teamId: AWAY, playerId: 'p2' });
    const changed = ev({ id: 'chg', type: 'gol', teamId: HOME, playerId: 'p1', minute: 20 });
    const ctx = context({
      nextHomeScore: 3,
      nextAwayScore: 0,
      allEvents: [keep, drop, changed],
      nextEvents: [
        keep,
        { ...changed, minute: 35 }, // alterado (minuto)
        ev({ id: 'local-new', type: 'gol', teamId: HOME, playerId: 'p1' }), // adicionado
      ],
    });
    await applyMatchCorrection(ctx);

    const log = mockCol('match_corrections').get('corr-1') as unknown as MatchCorrection;
    expect(log.eventsAdded).toHaveLength(1);
    expect(log.eventsRemoved.map((e) => e.id)).toEqual(['drop']);
    expect(log.eventsChanged).toHaveLength(1);
    expect(log.eventsChanged[0].before.minute).toBe(20);
    expect(log.eventsChanged[0].after.minute).toBe(35);
  });

  it('log é criado na mesma operação da correção (mesmo commit do match)', async () => {
    seedMatch();
    await applyMatchCorrection(context({ nextHomeScore: 0, nextAwayScore: 0, nextEvents: [] }));
    // match e log presentes juntos no store após o commit único
    expect(mockCol('matches').get(MATCH)).toMatchObject({ correctionVersion: 1 });
    expect(mockCol('match_corrections').has('corr-1')).toBe(true);
  });

  it('falha no meio da transação não deixa log parcial', async () => {
    // mata-mata cujo vencedor muda mas a próxima partida está ao vivo → lança DENTRO da transação
    const m = match({
      homeScore: 1,
      awayScore: 0,
      status: 'finalizado',
      bracketRound: 'semi',
      bracketPosition: 0,
      nextMatchId: 'final-1',
    });
    const next = match({ id: 'final-1', status: 'ao_vivo', homeTeamId: '', awayTeamId: '', round: 2 });
    seedMatch(m, [next]);

    await expect(
      applyMatchCorrection(
        context({
          match: m,
          championship: champ({ format: 'mata_mata' }),
          allMatches: [m, next],
          nextHomeScore: 0,
          nextAwayScore: 1, // inverte o vencedor
          nextEvents: [ev({ id: 'local-g', type: 'gol', teamId: AWAY, playerId: 'p2' })],
        }),
      ),
    ).rejects.toMatchObject({ code: 'next_match_locked' });

    expect(mockCol('match_corrections').size).toBe(0);
    expect(mockCol('matches').get(MATCH)).toMatchObject({ correctionVersion: 0, homeScore: 1 });
    expect(mockCol('matches').get('final-1')).toMatchObject({ homeTeamId: '', awayTeamId: '' });
  });
});

// ─── Concorrência ────────────────────────────────────────────────────────────────
describe('applyMatchCorrection · concorrência', () => {
  it('expectedCorrectionVersion correto permite salvar e incrementa exatamente uma vez', async () => {
    seedMatch(match({ correctionVersion: 0 }));
    await applyMatchCorrection(context({ expectedCorrectionVersion: 0 }));
    expect(mockCol('matches').get(MATCH)).toMatchObject({ correctionVersion: 1 });
  });

  it('updatedAt é atualizado no commit', async () => {
    seedMatch();
    await applyMatchCorrection(context());
    expect(mockCol('matches').get(MATCH)).toMatchObject({ updatedAt: 'SERVER_TS' });
  });

  it('versão antiga (buildCorrection) é rejeitada antes da transação', async () => {
    seedMatch();
    await expect(
      applyMatchCorrection(context({ expectedCorrectionVersion: 1 })),
    ).rejects.toMatchObject({ code: 'stale_version' });
  });

  it('versão obsoleta detectada no recheck transacional é rejeitada', async () => {
    // tela abriu em v0 (ctx.match v0, expected 0) mas o persistido já está em v1
    seedMatch(match({ correctionVersion: 1 }));
    await expect(
      applyMatchCorrection(context({ match: match({ correctionVersion: 0 }), expectedCorrectionVersion: 0 })),
    ).rejects.toMatchObject({ code: 'stale_version' });
    expect(mockCol('match_corrections').size).toBe(0);
  });

  it('duas correções concorrentes: apenas a primeira passa', async () => {
    seedMatch(match({ correctionVersion: 0 }));
    // device A e device B abriram ambos em v0
    const ctxA = context({ correctionId: 'corr-A', expectedCorrectionVersion: 0 });
    const ctxB = context({ correctionId: 'corr-B', expectedCorrectionVersion: 0 });

    await applyMatchCorrection(ctxA); // comita, match → v1
    await expect(applyMatchCorrection(ctxB)).rejects.toMatchObject({ code: 'stale_version' });

    expect(mockCol('match_corrections').has('corr-A')).toBe(true);
    expect(mockCol('match_corrections').has('corr-B')).toBe(false);
    expect(mockCol('matches').get(MATCH)).toMatchObject({ correctionVersion: 1 });
  });

  it('retry transacional não duplica efeitos', async () => {
    seedMatch();
    mockTxAttempts = 2; // o corpo executa 2x, mas só comita 1x
    const g1 = ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p1' });
    await applyMatchCorrection(
      context({
        nextHomeScore: 2,
        nextAwayScore: 0,
        nextEvents: [g1, ev({ id: 'local-extra', type: 'gol', teamId: HOME, playerId: 'p1' })],
        allEvents: [g1],
      }),
    );
    expect(mockCol('matches').get(MATCH)).toMatchObject({ correctionVersion: 1 });
    expect(mockCol('match_corrections').size).toBe(1);
    // exatamente um evento adicionado (id derivado do correctionId), sem duplicar
    const added = [...mockCol('match_events').values()].filter((e) =>
      String(e.id).startsWith('corr-1-'),
    );
    expect(added).toHaveLength(1);
  });
});

// ─── Idempotência ────────────────────────────────────────────────────────────────
describe('applyMatchCorrection · idempotência', () => {
  it('primeira aplicação retorna idempotent: false', async () => {
    seedMatch();
    const result = await applyMatchCorrection(context());
    expect(result.idempotent).toBe(false);
  });

  it('repetir o mesmo correctionId retorna idempotent: true e não reaplica', async () => {
    seedMatch();
    const g1 = ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p1' });
    const ctx = context({
      nextHomeScore: 2,
      nextAwayScore: 0,
      nextEvents: [g1, ev({ id: 'local-x', type: 'gol', teamId: HOME, playerId: 'p1' })],
      allEvents: [g1],
    });
    await applyMatchCorrection(ctx);
    const versionAfterFirst = mockCol('matches').get(MATCH)?.correctionVersion;
    const eventsAfterFirst = mockCol('match_events').size;

    const repeat = await applyMatchCorrection(ctx); // mesmo correctionId

    expect(repeat.idempotent).toBe(true);
    // não incrementa versão de novo
    expect(mockCol('matches').get(MATCH)?.correctionVersion).toBe(versionAfterFirst);
    // não duplica eventos
    expect(mockCol('match_events').size).toBe(eventsAfterFirst);
    // não cria segundo log
    expect(mockCol('match_corrections').size).toBe(1);
  });
});

// ─── Eventos ─────────────────────────────────────────────────────────────────────
describe('applyMatchCorrection · eventos', () => {
  it('adicionar gol cria evento ativo', async () => {
    seedMatch(match({ homeScore: 1, awayScore: 0 }));
    const result = await applyMatchCorrection(
      context({
        nextHomeScore: 2,
        nextAwayScore: 0,
        allEvents: [ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p1' })],
        nextEvents: [
          ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p1' }),
          ev({ id: 'local-new', type: 'gol', teamId: HOME, playerId: 'p1' }),
        ],
      }),
    );
    const added = [...mockCol('match_events').values()].filter((e) =>
      String(e.id).startsWith('corr-1-'),
    );
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ type: 'gol', teamId: HOME });
    expect(added[0].removedAt).toBeUndefined();
    expect(result.activeMatchEvents.filter((e) => e.type === 'gol')).toHaveLength(2);
  });

  it('remover gol faz soft delete com removedAt e removedByCorrectionId', async () => {
    seedMatch(match({ homeScore: 1, awayScore: 0 }));
    mockCol('match_events').set('g1', {
      id: 'g1',
      matchId: MATCH,
      type: 'gol',
      teamId: HOME,
      playerId: 'p1',
      minute: 5,
    });
    await applyMatchCorrection(
      context({
        nextHomeScore: 0,
        nextAwayScore: 0,
        allEvents: [ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p1' })],
        nextEvents: [],
      }),
    );
    const removed = mockCol('match_events').get('g1');
    expect(removed).toMatchObject({
      removedAt: 'SERVER_TS',
      removedByCorrectionId: 'corr-1',
      lastCorrectionId: 'corr-1',
      correctionVersion: 1,
    });
  });

  it('evento removido deixa de contar nas estatísticas', async () => {
    seedMatch(match({ homeScore: 1, awayScore: 0 }));
    const g1 = ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p1' });
    const result = await applyMatchCorrection(
      context({
        nextHomeScore: 0,
        nextAwayScore: 0,
        allEvents: [g1],
        nextEvents: [],
      }),
    );
    const scorers = calculateTopScorers(
      eventsAfter([g1], MATCH, result.activeMatchEvents),
      [player('p1', HOME)],
      [team(HOME), team(AWAY)],
    );
    expect(scorers).toEqual([]);
  });

  it('alterar autor atualiza o evento correto', async () => {
    seedMatch(match({ homeScore: 1, awayScore: 0 }));
    mockCol('match_events').set('g1', {
      id: 'g1',
      matchId: MATCH,
      type: 'gol',
      teamId: HOME,
      playerId: 'p1',
      minute: 5,
    });
    await applyMatchCorrection(
      context({
        nextHomeScore: 1,
        nextAwayScore: 0,
        players: [player('p1', HOME), player('p3', HOME, 'Outro')],
        allEvents: [ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p1' })],
        nextEvents: [ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p3' })],
      }),
    );
    expect(mockCol('match_events').get('g1')).toMatchObject({ playerId: 'p3', lastCorrectionId: 'corr-1' });
  });

  it('alterar assistência atualiza corretamente', async () => {
    seedMatch(match({ homeScore: 1, awayScore: 0 }));
    mockCol('match_events').set('a1', {
      id: 'a1',
      matchId: MATCH,
      type: 'assistencia',
      teamId: HOME,
      playerId: 'p1',
      minute: 5,
    });
    await applyMatchCorrection(
      context({
        nextHomeScore: 1,
        nextAwayScore: 0,
        nextEvents: [
          ev({ id: 'local-g', type: 'gol', teamId: HOME, playerId: 'p1' }),
          ev({ id: 'a1', type: 'assistencia', teamId: HOME, playerId: 'p3' }),
        ],
        allEvents: [
          ev({ id: 'local-g', type: 'gol', teamId: HOME, playerId: 'p1' }),
          ev({ id: 'a1', type: 'assistencia', teamId: HOME, playerId: 'p1' }),
        ],
      }),
    );
    expect(mockCol('match_events').get('a1')).toMatchObject({ playerId: 'p3', type: 'assistencia' });
  });

  it('alterar cartão e minuto atualiza corretamente', async () => {
    seedMatch(match({ homeScore: 0, awayScore: 0 }));
    mockCol('match_events').set('c1', {
      id: 'c1',
      matchId: MATCH,
      type: 'cartao_amarelo',
      teamId: AWAY,
      playerId: 'p2',
      minute: 10,
    });
    await applyMatchCorrection(
      context({
        nextHomeScore: 0,
        nextAwayScore: 0,
        allEvents: [ev({ id: 'c1', type: 'cartao_amarelo', teamId: AWAY, playerId: 'p2', minute: 10 })],
        nextEvents: [ev({ id: 'c1', type: 'cartao_vermelho', teamId: AWAY, playerId: 'p2', minute: 42 })],
      }),
    );
    expect(mockCol('match_events').get('c1')).toMatchObject({ type: 'cartao_vermelho', minute: 42 });
  });

  it('evento já removido não é reprocessado de forma inconsistente', async () => {
    seedMatch(match({ homeScore: 1, awayScore: 0 }));
    const alreadyRemoved = ev({
      id: 'old',
      type: 'gol',
      teamId: HOME,
      playerId: 'p1',
      removedAt: 'antes',
      removedByCorrectionId: 'corr-anterior',
    });
    const active = ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p1' });
    mockCol('match_events').set('old', { ...alreadyRemoved });
    await applyMatchCorrection(
      context({
        nextHomeScore: 1,
        nextAwayScore: 0,
        allEvents: [alreadyRemoved, active],
        nextEvents: [active],
      }),
    );
    const log = mockCol('match_corrections').get('corr-1') as unknown as MatchCorrection;
    expect(log.eventsRemoved.map((e) => e.id)).not.toContain('old');
    // permanece com a marca da correção anterior, sem ser sobrescrito
    expect(mockCol('match_events').get('old')).toMatchObject({ removedByCorrectionId: 'corr-anterior' });
  });
});

// ─── Classificação e estatísticas ────────────────────────────────────────────────
describe('applyMatchCorrection · classificação e estatísticas', () => {
  const teams = [team(HOME), team(AWAY)];
  const players = [player('p1', HOME, 'Ana'), player('p2', AWAY, 'Bia')];

  it('vitória vira empate na classificação', async () => {
    seedMatch(match({ homeScore: 1, awayScore: 0 }));
    const g1 = ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p1' });
    const result = await applyMatchCorrection(
      context({
        nextHomeScore: 1,
        nextAwayScore: 1,
        allEvents: [g1],
        nextEvents: [g1, ev({ id: 'local-eq', type: 'gol', teamId: AWAY, playerId: 'p2' })],
      }),
    );
    const standings = calculateStandings(
      [match({ homeScore: 1, awayScore: 1 })],
      eventsAfter([g1], MATCH, result.activeMatchEvents),
      teams,
      RULES,
    );
    expect(standings.find((s) => s.teamId === HOME)).toMatchObject({ points: 1, drawn: 1 });
    expect(standings.find((s) => s.teamId === AWAY)).toMatchObject({ points: 1, drawn: 1 });
  });

  it('empate vira derrota (saldo e pontos mudam)', async () => {
    seedMatch(match({ homeScore: 1, awayScore: 1 }));
    const g1 = ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p1' });
    const g2 = ev({ id: 'g2', type: 'gol', teamId: AWAY, playerId: 'p2' });
    const result = await applyMatchCorrection(
      context({
        match: match({ homeScore: 1, awayScore: 1 }),
        nextHomeScore: 1,
        nextAwayScore: 2,
        allEvents: [g1, g2],
        nextEvents: [g1, g2, ev({ id: 'local-w', type: 'gol', teamId: AWAY, playerId: 'p2' })],
      }),
    );
    const standings = calculateStandings(
      [match({ homeScore: 1, awayScore: 2 })],
      eventsAfter([g1, g2], MATCH, result.activeMatchEvents),
      teams,
      RULES,
    );
    expect(standings.find((s) => s.teamId === AWAY)).toMatchObject({ points: 3, won: 1 });
    expect(standings.find((s) => s.teamId === HOME)).toMatchObject({ points: 0, lost: 1 });
  });

  it('autor alterado transfere o gol na artilharia', async () => {
    seedMatch(match({ homeScore: 1, awayScore: 0 }));
    const g1 = ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p1' });
    const result = await applyMatchCorrection(
      context({
        players: [...players, player('p3', HOME, 'Caio')],
        nextHomeScore: 1,
        nextAwayScore: 0,
        allEvents: [g1],
        nextEvents: [ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p3' })],
      }),
    );
    const scorers = calculateTopScorers(
      eventsAfter([g1], MATCH, result.activeMatchEvents),
      [...players, player('p3', HOME, 'Caio')],
      teams,
    );
    expect(scorers.map((s) => [s.playerId, s.goals])).toEqual([['p3', 1]]);
  });

  it('cartão adicionado gera suspensão por amarelos acumulados', async () => {
    // Amarelos acumulados na rodada 1 suspendem a rodada 2 (currentRound). A correção
    // adiciona o 2º amarelo (esquecido) na própria partida da rodada 1.
    const curMatch = match({ id: MATCH, round: 1, homeScore: 0, awayScore: 0, status: 'finalizado' });
    seedMatch(curMatch);
    const yellow1 = ev({ id: 'y1', matchId: MATCH, type: 'cartao_amarelo', teamId: AWAY, playerId: 'p2' });

    const result = await applyMatchCorrection(
      context({
        match: curMatch,
        championship: champ({ currentRound: 2 }),
        allMatches: [curMatch],
        players: [player('p1', HOME), player('p2', AWAY)],
        nextHomeScore: 0,
        nextAwayScore: 0,
        allEvents: [yellow1],
        nextEvents: [yellow1, ev({ id: 'local-y2', type: 'cartao_amarelo', teamId: AWAY, playerId: 'p2' })],
      }),
    );
    expect(result.playerUpdates).toContainEqual({
      playerId: 'p2',
      updates: { status: 'suspenso', suspendedRound: 2 },
    });
  });

  it('cartão removido desfaz a suspensão (disciplina)', async () => {
    // p2 estava suspenso na rodada 2 por 2 amarelos da rodada 1; remover um deles
    // (na partida corrigida) derruba abaixo do limite e o reativa.
    const curMatch = match({ id: MATCH, round: 1, status: 'finalizado', homeScore: 0, awayScore: 0 });
    seedMatch(curMatch);
    const yellow1 = ev({ id: 'y1', matchId: MATCH, type: 'cartao_amarelo', teamId: AWAY, playerId: 'p2' });
    const yellow2 = ev({ id: 'y2', matchId: MATCH, type: 'cartao_amarelo', teamId: AWAY, playerId: 'p2' });
    mockCol('match_events').set('y2', { ...yellow2 });

    const result = await applyMatchCorrection(
      context({
        match: curMatch,
        championship: champ({ currentRound: 2 }),
        allMatches: [curMatch],
        players: [player('p1', HOME), { ...player('p2', AWAY), status: 'suspenso', suspendedRound: 2 }],
        nextHomeScore: 0,
        nextAwayScore: 0,
        allEvents: [yellow1, yellow2],
        nextEvents: [yellow1], // remove o 2º amarelo
      }),
    );
    expect(result.playerUpdates).toContainEqual({
      playerId: 'p2',
      updates: { status: 'ativo', suspendedRound: null },
    });
  });

  it('recálculo não duplica estatísticas (gols contados uma vez)', async () => {
    seedMatch(match({ homeScore: 2, awayScore: 0 }));
    const g1 = ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p1' });
    const g2 = ev({ id: 'g2', type: 'gol', teamId: HOME, playerId: 'p1' });
    const result = await applyMatchCorrection(
      context({
        match: match({ homeScore: 2, awayScore: 0 }),
        nextHomeScore: 2,
        nextAwayScore: 0,
        allEvents: [g1, g2],
        nextEvents: [g1, g2],
      }),
    );
    const scorers = calculateTopScorers(
      eventsAfter([g1, g2], MATCH, result.activeMatchEvents),
      players,
      teams,
    );
    expect(scorers.find((s) => s.playerId === 'p1')?.goals).toBe(2);
  });
});

// ─── Mata-mata ───────────────────────────────────────────────────────────────────
describe('applyMatchCorrection · mata-mata', () => {
  function knockout(overrides: Partial<MatchModel> = {}) {
    return match({
      homeScore: 1,
      awayScore: 0,
      status: 'finalizado',
      bracketRound: 'semi',
      bracketPosition: 0, // slot par → home da próxima
      nextMatchId: 'final-1',
      ...overrides,
    });
  }

  it('vencedor não muda: próxima partida não é alterada', async () => {
    const m = knockout();
    const next = match({ id: 'final-1', status: 'agendado', homeTeamId: HOME, awayTeamId: '', round: 2 });
    seedMatch(m, [next]);
    const g1 = ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p1' });
    const result = await applyMatchCorrection(
      context({
        match: m,
        championship: champ({ format: 'mata_mata' }),
        allMatches: [m, next],
        nextHomeScore: 2, // ainda vitória do HOME
        nextAwayScore: 0,
        allEvents: [g1],
        nextEvents: [g1, ev({ id: 'local-g2', type: 'gol', teamId: HOME, playerId: 'p1' })],
      }),
    );
    expect(result.nextMatchIdToUpdate).toBeNull();
    expect(mockCol('matches').get('final-1')).toMatchObject({ homeTeamId: HOME });
  });

  it('vencedor muda com próxima agendada: troca só o slot, preserva adversário e nextMatchId', async () => {
    const m = knockout();
    const next = match({ id: 'final-1', status: 'agendado', homeTeamId: HOME, awayTeamId: 'team-x', round: 2 });
    seedMatch(m, [next]);
    const g1 = ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p1' });
    const result = await applyMatchCorrection(
      context({
        match: m,
        championship: champ({ format: 'mata_mata' }),
        allMatches: [m, next],
        nextHomeScore: 0,
        nextAwayScore: 1, // agora AWAY vence
        allEvents: [g1],
        nextEvents: [ev({ id: 'local-g', type: 'gol', teamId: AWAY, playerId: 'p2' })],
      }),
    );
    expect(result.nextMatchIdToUpdate).toBe('final-1');
    const persistedNext = mockCol('matches').get('final-1');
    expect(persistedNext).toMatchObject({ homeTeamId: AWAY, awayTeamId: 'team-x' });
    // nextMatchId da partida corrigida preservado
    expect(mockCol('matches').get(MATCH)).toMatchObject({ nextMatchId: 'final-1' });
  });

  it('vencedor muda com slot ímpar atualiza awayTeamId', async () => {
    const m = knockout({ bracketPosition: 1 }); // slot ímpar → away da próxima
    const next = match({ id: 'final-1', status: 'agendado', homeTeamId: 'team-x', awayTeamId: HOME, round: 2 });
    seedMatch(m, [next]);
    const g1 = ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p1' });
    await applyMatchCorrection(
      context({
        match: m,
        championship: champ({ format: 'mata_mata' }),
        allMatches: [m, next],
        nextHomeScore: 0,
        nextAwayScore: 1,
        allEvents: [g1],
        nextEvents: [ev({ id: 'local-g', type: 'gol', teamId: AWAY, playerId: 'p2' })],
      }),
    );
    expect(mockCol('matches').get('final-1')).toMatchObject({ homeTeamId: 'team-x', awayTeamId: AWAY });
  });

  it('próxima partida ao vivo bloqueia mudança de vencedor sem alterar dados', async () => {
    const m = knockout();
    const next = match({ id: 'final-1', status: 'ao_vivo', homeTeamId: HOME, awayTeamId: 'team-x', round: 2 });
    seedMatch(m, [next]);
    await expect(
      applyMatchCorrection(
        context({
          match: m,
          championship: champ({ format: 'mata_mata' }),
          allMatches: [m, next],
          nextHomeScore: 0,
          nextAwayScore: 1,
          allEvents: [ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p1' })],
          nextEvents: [ev({ id: 'local-g', type: 'gol', teamId: AWAY, playerId: 'p2' })],
        }),
      ),
    ).rejects.toMatchObject({ code: 'next_match_locked' });
    expect(mockCol('matches').get('final-1')).toMatchObject({ homeTeamId: HOME, awayTeamId: 'team-x' });
    expect(mockCol('match_corrections').size).toBe(0);
  });

  it('próxima partida finalizada bloqueia mudança de vencedor sem alterar dados', async () => {
    const m = knockout();
    const next = match({ id: 'final-1', status: 'finalizado', homeTeamId: HOME, awayTeamId: 'team-x', round: 2 });
    seedMatch(m, [next]);
    await expect(
      applyMatchCorrection(
        context({
          match: m,
          championship: champ({ format: 'mata_mata' }),
          allMatches: [m, next],
          nextHomeScore: 0,
          nextAwayScore: 1,
          allEvents: [ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p1' })],
          nextEvents: [ev({ id: 'local-g', type: 'gol', teamId: AWAY, playerId: 'p2' })],
        }),
      ),
    ).rejects.toMatchObject({ code: 'next_match_locked' });
    expect(mockCol('matches').get(MATCH)).toMatchObject({ correctionVersion: 0 });
  });

  it('final (sem nextMatchId) permitida antes do fechamento e atualiza winnerId', async () => {
    const finalMatch = match({
      bracketRound: 'final',
      bracketPosition: 0,
      nextMatchId: null,
      homeScore: 1,
      awayScore: 0,
    });
    seedMatch(finalMatch);
    const g1 = ev({ id: 'g1', type: 'gol', teamId: HOME, playerId: 'p1' });
    await applyMatchCorrection(
      context({
        match: finalMatch,
        championship: champ({ format: 'mata_mata' }),
        allMatches: [finalMatch],
        nextHomeScore: 0,
        nextAwayScore: 1,
        allEvents: [g1],
        nextEvents: [ev({ id: 'local-g', type: 'gol', teamId: AWAY, playerId: 'p2' })],
      }),
    );
    expect(mockCol('matches').get(MATCH)).toMatchObject({ winnerId: AWAY });
  });

  it('final depois de championship_results é bloqueada', async () => {
    const finalMatch = match({ bracketRound: 'final', nextMatchId: null });
    seedMatch(finalMatch);
    mockCol('championship_results').set(CHAMP, { id: CHAMP, championshipId: CHAMP });
    await expect(
      applyMatchCorrection(
        context({
          match: finalMatch,
          championship: champ({ format: 'mata_mata' }),
          allMatches: [finalMatch],
        }),
      ),
    ).rejects.toMatchObject({ code: 'championship_closed' });
  });
});

// ─── Mapeamento de erros amigáveis ───────────────────────────────────────────────
describe('getCorrectionErrorMessage', () => {
  it('mantém a mensagem amigável dos erros de negócio (CorrectionError)', () => {
    expect(getCorrectionErrorMessage(new CorrectionError('stale_version', 'A partida mudou.'))).toBe(
      'A partida mudou.',
    );
  });

  it('classifica permission-denied do Firebase como falta de permissão', () => {
    expect(getCorrectionErrorMessage({ code: 'permission-denied' })).toMatch(/permissão/i);
  });

  it('classifica indisponibilidade/timeout como falha de conexão', () => {
    expect(getCorrectionErrorMessage({ code: 'unavailable' })).toMatch(/conexão/i);
    expect(getCorrectionErrorMessage({ code: 'network-request-failed' })).toMatch(/conexão/i);
  });

  it('não vaza mensagem técnica crua em erro desconhecido', () => {
    const msg = getCorrectionErrorMessage(new Error('FirebaseError: internal assertion abcdef'));
    expect(msg).not.toMatch(/assertion/i);
    expect(msg).toMatch(/inesperado/i);
  });
});
