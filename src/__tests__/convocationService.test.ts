/**
 * Testes diretos de convocação + presença (Bloco 5 — Fase B). Sob Jest,
 * MOCK_DATA_ENABLED é false → percorre o caminho real do Firestore, exercitado
 * contra o mesmo harness transacional em memória usado em matchStatusService.test.ts:
 *  - runTransaction faz buffer das escritas e comita ao final (atômico);
 *  - se o corpo lança, NADA é gravado;
 *  - transaction.get lê o estado já comitado;
 *  - getDocs/where/writeBatch simulam as queries de propagação.
 */
import { Convocation, MatchAttendance, MatchModel, Player } from '../types';

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
  collection: (_db: unknown, c: string) => ({ __col: c }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  query: (base: { __col: string }, ...constraints: unknown[]) => ({ ...base, constraints }),
  getDoc: async (ref: Ref) => mockSnap(ref),
  getDocs: async (q: { __col: string; constraints: Array<{ field: string; value: unknown }> }) => {
    const all = Array.from(mockCol(q.__col).entries()).map(([id, data]) => ({ id, data }));
    const filtered = all.filter((entry) =>
      (q.constraints ?? []).every((c) => (entry.data as AnyDoc)[c.field] === c.value),
    );
    return {
      empty: filtered.length === 0,
      docs: filtered.map((entry) => ({
        id: entry.id,
        ref: { __col: q.__col, __id: entry.id } as Ref,
        data: () => entry.data,
      })),
    };
  },
  serverTimestamp: () => 'SERVER_TS',
  writeBatch: () => {
    const ops: Array<{ ref: Ref; data: AnyDoc }> = [];
    return {
      update: (ref: Ref, data: AnyDoc) => ops.push({ ref, data }),
      set: (ref: Ref, data: AnyDoc) => ops.push({ ref, data }),
      commit: async () => {
        for (const op of ops) {
          const c = mockCol(op.ref.__col);
          c.set(op.ref.__id, { ...(c.get(op.ref.__id) ?? { id: op.ref.__id }), ...op.data });
        }
      },
    };
  },
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
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'cap' } } }));

import {
  saveConvocation,
  closeConvocation,
  applyConvocationStatusEffect,
} from '../services/convocationService';
import {
  respondAttendance,
  markAttendancesForReconfirmation,
} from '../services/attendanceService';
import { convocationDocId, attendanceDocId } from '../utils/convocationRules';

const CHAMP = 'champ-1';
const MATCH = 'match-1';
const HOME = 'team-home';
const AWAY = 'team-away';
const CAP = 'cap';

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

function player(id: string, o: Partial<Player> = {}): Player {
  return {
    id,
    teamId: HOME,
    championshipId: CHAMP,
    userId: `u-${id}`,
    name: id,
    position: 'meia',
    number: 1,
    status: 'ativo',
    ...o,
  };
}

function seedMatch(m: MatchModel = match()) {
  mockCol('matches').set(m.id, { ...m });
}
function seedPlayers(...players: Player[]) {
  for (const p of players) mockCol('players').set(p.id, { ...p });
}

const CONV_ID = convocationDocId(MATCH, HOME);

beforeEach(() => mockResetStore());

function saveCtx(o: Partial<Parameters<typeof saveConvocation>[0]> = {}) {
  return {
    matchId: MATCH,
    teamId: HOME,
    championshipId: CHAMP,
    captainId: CAP,
    playerIds: o.playerIds ?? ['p1', 'p2'],
    expectedVersion: o.expectedVersion ?? 0,
    ...o,
  };
}

describe('saveConvocation', () => {
  it('capitão cria convocação versão 1, status open, ID determinístico', async () => {
    seedMatch();
    seedPlayers(player('p1'), player('p2'));
    const { convocation } = await saveConvocation(saveCtx());
    expect(convocation.id).toBe(CONV_ID);
    expect(convocation).toMatchObject({ status: 'open', version: 1, playerIds: ['p1', 'p2'] });
    expect(mockCol('match_convocations').get(CONV_ID)).toMatchObject({ version: 1 });
  });

  it('capitão edita: versão incrementa e previousVersion preserva', async () => {
    seedMatch();
    seedPlayers(player('p1'), player('p2'), player('p3'));
    await saveConvocation(saveCtx({ playerIds: ['p1', 'p2'] }));
    const { convocation } = await saveConvocation(
      saveCtx({ playerIds: ['p1', 'p3'], expectedVersion: 1 }),
    );
    expect(convocation).toMatchObject({ version: 2, previousVersion: 1, playerIds: ['p1', 'p3'] });
  });

  it('lista vazia é negada', async () => {
    seedMatch();
    await expect(saveConvocation(saveCtx({ playerIds: [] }))).rejects.toMatchObject({
      code: 'empty_roster',
    });
  });

  it('IDs duplicados são deduplicados (sem duplicidade)', async () => {
    seedMatch();
    seedPlayers(player('p1'));
    const { convocation } = await saveConvocation(saveCtx({ playerIds: ['p1', 'p1'] }));
    expect(convocation.playerIds).toEqual(['p1']);
  });

  it('versão obsoleta é rejeitada (dois saves concorrentes)', async () => {
    seedMatch();
    seedPlayers(player('p1'), player('p2'));
    await saveConvocation(saveCtx());
    await expect(saveConvocation(saveCtx({ expectedVersion: 0 }))).rejects.toMatchObject({
      code: 'stale_version',
    });
  });

  it('atleta suspenso é bloqueado', async () => {
    seedMatch();
    seedPlayers(player('p1'), player('p2'));
    await expect(
      saveConvocation(saveCtx({ playerIds: ['p1', 'p2'], suspendedPlayerIds: ['p2'] })),
    ).rejects.toMatchObject({ code: 'ineligible_player', playerId: 'p2' });
  });

  it('atleta removido é bloqueado', async () => {
    seedMatch();
    seedPlayers(player('p1'), player('p2', { status: 'removido' }));
    await expect(saveConvocation(saveCtx())).rejects.toMatchObject({
      code: 'ineligible_player',
      playerId: 'p2',
    });
  });

  it('atleta lesionado é bloqueado', async () => {
    seedMatch();
    seedPlayers(player('p1'), player('p2', { status: 'lesionado' }));
    await expect(saveConvocation(saveCtx())).rejects.toMatchObject({ code: 'ineligible_player' });
  });

  it('atleta de outro time é bloqueado', async () => {
    seedMatch();
    seedPlayers(player('p1'), player('p2', { teamId: 'outro' }));
    await expect(saveConvocation(saveCtx())).rejects.toMatchObject({ code: 'ineligible_player' });
  });

  it('partida iniciada bloqueia criação e nada é gravado', async () => {
    seedMatch(match({ status: 'ao_vivo' }));
    seedPlayers(player('p1'), player('p2'));
    await expect(saveConvocation(saveCtx())).rejects.toMatchObject({ code: 'convocation_locked' });
    expect(mockCol('match_convocations').size).toBe(0);
  });
});

describe('closeConvocation', () => {
  it('open → closed incrementa versão', async () => {
    seedMatch();
    seedPlayers(player('p1'));
    await saveConvocation(saveCtx({ playerIds: ['p1'] }));
    const { convocation } = await closeConvocation({
      matchId: MATCH,
      teamId: HOME,
      captainId: CAP,
      expectedVersion: 1,
    });
    expect(convocation).toMatchObject({ status: 'closed', version: 2 });
  });

  it('fechar duas vezes é bloqueado', async () => {
    seedMatch();
    seedPlayers(player('p1'));
    await saveConvocation(saveCtx({ playerIds: ['p1'] }));
    await closeConvocation({ matchId: MATCH, teamId: HOME, captainId: CAP, expectedVersion: 1 });
    await expect(
      closeConvocation({ matchId: MATCH, teamId: HOME, captainId: CAP, expectedVersion: 2 }),
    ).rejects.toMatchObject({ code: 'convocation_locked' });
  });
});

describe('respondAttendance', () => {
  async function seedOpenConvocation(playerIds = ['p1', 'p2']) {
    seedMatch();
    seedPlayers(player('p1'), player('p2'));
    await saveConvocation(saveCtx({ playerIds }));
  }

  function respCtx(o: Partial<Parameters<typeof respondAttendance>[0]> = {}) {
    return {
      matchId: MATCH,
      teamId: HOME,
      championshipId: CHAMP,
      playerId: o.playerId ?? 'p1',
      userId: o.userId ?? 'u-p1',
      response: o.response ?? 'confirmed',
      expectedVersion: o.expectedVersion ?? 0,
      ...o,
    } as Parameters<typeof respondAttendance>[0];
  }

  it('convocado confirma', async () => {
    await seedOpenConvocation();
    const { attendance } = await respondAttendance(respCtx({ response: 'confirmed' }));
    expect(attendance).toMatchObject({ response: 'confirmed', version: 1, reconfirmationRequired: false });
  });

  it('convocado recusa com motivo', async () => {
    await seedOpenConvocation();
    const { attendance } = await respondAttendance(
      respCtx({ response: 'declined', declineReason: 'Viagem' }),
    );
    expect(attendance).toMatchObject({ response: 'declined', declineReason: 'Viagem' });
  });

  it('altera resposta antes do prazo (confirmed → declined), preserva previousResponse', async () => {
    await seedOpenConvocation();
    await respondAttendance(respCtx({ response: 'confirmed' }));
    const { attendance } = await respondAttendance(
      respCtx({ response: 'declined', expectedVersion: 1 }),
    );
    expect(attendance).toMatchObject({ response: 'declined', previousResponse: 'confirmed', version: 2 });
  });

  it('não convocado é negado', async () => {
    await seedOpenConvocation(['p2']);
    await expect(respondAttendance(respCtx({ playerId: 'p1', userId: 'u-p1' }))).rejects.toMatchObject({
      code: 'not_convoked',
    });
  });

  it('responder por outro é negado', async () => {
    await seedOpenConvocation();
    await expect(
      respondAttendance(respCtx({ playerId: 'p1', userId: 'u-outro' })),
    ).rejects.toMatchObject({ code: 'not_self' });
  });

  it('retry idempotente: mesma resposta não reaplica nem incrementa versão', async () => {
    await seedOpenConvocation();
    await respondAttendance(respCtx({ response: 'confirmed' }));
    const repeat = await respondAttendance(respCtx({ response: 'confirmed', expectedVersion: 0 }));
    expect(repeat.idempotent).toBe(true);
    expect(mockCol('match_attendance').get(attendanceDocId(MATCH, 'p1'))).toMatchObject({ version: 1 });
  });

  it('versão obsoleta é rejeitada', async () => {
    await seedOpenConvocation();
    await respondAttendance(respCtx({ response: 'confirmed' }));
    await expect(
      respondAttendance(respCtx({ response: 'declined', expectedVersion: 0 })),
    ).rejects.toMatchObject({ code: 'stale_version' });
  });

  it('convocação cancelada bloqueia resposta', async () => {
    await seedOpenConvocation();
    await applyConvocationStatusEffect(MATCH, HOME, 'cancelamento', 'Sem árbitro');
    await expect(respondAttendance(respCtx())).rejects.toMatchObject({ code: 'convocation_closed' });
  });

  it('W.O. conclui a convocação e bloqueia resposta', async () => {
    await seedOpenConvocation();
    await applyConvocationStatusEffect(MATCH, HOME, 'wo');
    await expect(respondAttendance(respCtx())).rejects.toMatchObject({ code: 'convocation_closed' });
  });

  it('partida iniciada bloqueia resposta', async () => {
    await seedOpenConvocation();
    mockCol('matches').set(MATCH, { ...match({ status: 'ao_vivo' }) });
    await expect(respondAttendance(respCtx())).rejects.toMatchObject({ code: 'match_locked' });
  });
});

describe('integração de status na convocação/presença', () => {
  async function seedConfirmed() {
    seedMatch();
    seedPlayers(player('p1'), player('p2'));
    await saveConvocation(saveCtx({ playerIds: ['p1', 'p2'] }));
    await respondAttendance({
      matchId: MATCH,
      teamId: HOME,
      championshipId: CHAMP,
      playerId: 'p1',
      userId: 'u-p1',
      response: 'confirmed',
      expectedVersion: 0,
    });
  }

  it('adiamento mantém open, marca requiresReconfirmation e preserva previousResponse', async () => {
    await seedConfirmed();
    const conv = await applyConvocationStatusEffect(MATCH, HOME, 'adiamento');
    expect(conv).toMatchObject({ status: 'open', requiresReconfirmation: true });
    const marked = await markAttendancesForReconfirmation(MATCH);
    expect(marked).toBe(1);
    expect(mockCol('match_attendance').get(attendanceDocId(MATCH, 'p1'))).toMatchObject({
      reconfirmationRequired: true,
      previousResponse: 'confirmed',
    });
  });

  it('cancelamento encerra a convocação, preserva respostas', async () => {
    await seedConfirmed();
    const conv = await applyConvocationStatusEffect(MATCH, HOME, 'cancelamento', 'Sem campo');
    expect(conv).toMatchObject({ status: 'cancelled', cancellationReason: 'Sem campo' });
    expect(mockCol('match_attendance').get(attendanceDocId(MATCH, 'p1'))).toMatchObject({
      response: 'confirmed',
    });
  });

  it('cancelado é terminal: adiamento posterior não regride para open', async () => {
    await seedConfirmed();
    await applyConvocationStatusEffect(MATCH, HOME, 'cancelamento');
    const conv = await applyConvocationStatusEffect(MATCH, HOME, 'adiamento');
    expect(conv).toMatchObject({ status: 'cancelled' });
  });
});

describe('integração em tempo real — visão do capitão', () => {
  async function seedOpenConvocation(playerIds = ['p1', 'p2']) {
    seedMatch();
    seedPlayers(player('p1'), player('p2'));
    await saveConvocation(saveCtx({ playerIds }));
  }

  function respCtx(o: Partial<Parameters<typeof respondAttendance>[0]> = {}) {
    return {
      matchId: MATCH,
      teamId: HOME,
      championshipId: CHAMP,
      playerId: o.playerId ?? 'p1',
      userId: o.userId ?? 'u-p1',
      response: o.response ?? 'confirmed',
      expectedVersion: o.expectedVersion ?? 0,
      ...o,
    } as Parameters<typeof respondAttendance>[0];
  }

  it('ao confirmar presença, dado gravado no Firestore fica visível via listener', async () => {
    await seedOpenConvocation();
    await respondAttendance(respCtx({ response: 'confirmed' }));
    // O documento agora está em match_attendance; um onSnapshot/subscribeToDocument
    // receberia esta atualização em tempo real.
    const att = mockCol('match_attendance').get(attendanceDocId(MATCH, 'p1'));
    expect(att).toMatchObject({ response: 'confirmed', reconfirmationRequired: false });
  });

  it('ao recusar presença, dado gravado no Firestore fica visível via listener', async () => {
    await seedOpenConvocation();
    await respondAttendance(respCtx({ response: 'declined', declineReason: 'Viagem' }));
    const att = mockCol('match_attendance').get(attendanceDocId(MATCH, 'p1'));
    expect(att).toMatchObject({ response: 'declined', declineReason: 'Viagem' });
  });

  it('retry de propagação de adiamento é idempotente — não duplica documentos', async () => {
    seedMatch();
    seedPlayers(player('p1'));
    await saveConvocation(saveCtx({ playerIds: ['p1'] }));

    // Primeira propagação
    await applyConvocationStatusEffect(MATCH, HOME, 'adiamento');
    const countAfterFirst = mockCol('match_convocations').size;
    const versionAfterFirst = (mockCol('match_convocations').get(CONV_ID) as { version: number }).version;

    // Retry da propagação
    await applyConvocationStatusEffect(MATCH, HOME, 'adiamento');
    const countAfterRetry = mockCol('match_convocations').size;

    // Nenhum documento duplicado; requiresReconfirmation ainda true
    expect(countAfterRetry).toBe(countAfterFirst);
    expect(mockCol('match_convocations').get(CONV_ID)).toMatchObject({
      status: 'open',
      requiresReconfirmation: true,
    });
    // Versão incrementa a cada chamada (idempotente em efeito, não em escrita)
    const versionAfterRetry = (mockCol('match_convocations').get(CONV_ID) as { version: number }).version;
    expect(versionAfterRetry).toBeGreaterThan(versionAfterFirst);
  });

  it('retry de cancelamento não duplica e permanece terminal', async () => {
    seedMatch();
    seedPlayers(player('p1'));
    await saveConvocation(saveCtx({ playerIds: ['p1'] }));

    await applyConvocationStatusEffect(MATCH, HOME, 'cancelamento', 'Campo inundado');
    await applyConvocationStatusEffect(MATCH, HOME, 'cancelamento', 'Campo inundado');

    expect(mockCol('match_convocations').size).toBe(1);
    expect(mockCol('match_convocations').get(CONV_ID)).toMatchObject({
      status: 'cancelled',
      cancellationReason: 'Campo inundado',
    });
  });
});
