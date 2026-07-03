/**
 * Bloco 11 — Fase 2: testes diretos do serviço transacional
 * `reprocessClosedChampionship`. Sob Jest o MOCK_DATA_ENABLED é false, então o
 * serviço percorre o caminho real do Firestore, exercitado contra um harness
 * transacional em memória fiel (mesmo padrão de applyMatchCorrection.test):
 *  - runTransaction faz buffer das escritas e só comita no fim (atômico);
 *  - se o corpo lança, NADA é gravado;
 *  - transaction.get / getDoc leem o estado já comitado (pré-condições);
 *  - serverTimestamp() vira sentinela observável.
 */
import type {
  Achievement,
  Championship,
  ChampionshipResultData,
  ChampionshipRules,
  MatchEvent,
  MatchModel,
  Player,
  PlayerHistoryEntry,
  RoundAward,
  Team,
} from '../types';

// ─── Harness de Firestore transacional em memória ──────────────────────────────
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
    const result = await fn(tx); // se lançar, propaga e nada é comitado
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
  reprocessClosedChampionship,
  ReprocessServiceInput,
} from '../services/championshipReprocessService';
import {
  computeChampionshipOutcome,
  reprocessIdFor,
  END_OF_CHAMPIONSHIP_ACHIEVEMENTS,
} from '../utils/championshipReprocessing';

// ─── Builders ──────────────────────────────────────────────────────────────────
const ORG = 'org-1';
const CHAMP = 'champ-1';

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
    status: 'finalizado',
    currentRound: 1,
    totalRounds: 1,
    organizerId: ORG,
    inviteCode: 'COPA',
    rules: RULES,
    createdAt: '2026-01-01',
    season: '2026',
    ...o,
  };
}

function team(id: string, name: string): Team {
  return {
    id, championshipId: CHAMP, name, primaryColor: '#111', secondaryColor: '#fff',
    captainId: `cap-${id}`, status: 'aprovado', inviteCode: id, createdAt: '2026-01-01',
  };
}

function player(id: string, teamId: string, userId: string): Player {
  return {
    id, championshipId: CHAMP, teamId, userId, name: id, position: 'atacante', number: 9,
    status: 'ativo', joinedAt: '2026-01-01',
  };
}

function gol(id: string, playerId: string, teamId: string): MatchEvent {
  return {
    id, matchId: 'm1', championshipId: CHAMP, type: 'gol', playerId, teamId,
    playerName: playerId, teamName: teamId, minute: 10,
  } as MatchEvent;
}

function card(id: string, playerId: string, teamId: string): MatchEvent {
  return {
    id, matchId: 'm1', championshipId: CHAMP, type: 'cartao_amarelo', playerId, teamId,
    playerName: playerId, teamName: teamId, minute: 20,
  } as MatchEvent;
}

const teams = [team('A', 'Leões'), team('B', 'Tigres')];
const players = [player('pA', 'A', 'uA'), player('pB', 'B', 'uB')];

function matchAB(home: number, away: number, o: Partial<MatchModel> = {}): MatchModel {
  return {
    id: 'm1', championshipId: CHAMP, round: 1, homeTeamId: 'A', awayTeamId: 'B',
    homeScore: home, awayScore: away, status: 'finalizado',
    winnerId: home > away ? 'A' : away > home ? 'B' : null,
    lastCorrectionId: 'corr-1', correctionVersion: 1,
    ...o,
  } as MatchModel;
}

// A vence 2x1 → A campeão; pA artilheiro (2 gols).
const eventsAwin: MatchEvent[] = [gol('e1', 'pA', 'A'), gol('e2', 'pA', 'A'), gol('e3', 'pB', 'B')];
// B vence 1x2 → B campeão; pB artilheiro (2 gols).
const eventsBwin: MatchEvent[] = [gol('e1', 'pA', 'A'), gol('e2', 'pB', 'B'), gol('e3', 'pB', 'B')];

const awards: RoundAward[] = [
  { id: `${CHAMP}_1`, championshipId: CHAMP, round: 1, winnerPlayerId: 'pA', winnerName: 'pA', winnerTeamId: 'A', totalVotes: 3, closedAt: '2026-01-02' },
];

/** Constrói o "congelado" (championship_results + player_history + achievements) a partir de um estado. */
function freezeState(matches: MatchModel[], events: MatchEvent[]) {
  const outcome = computeChampionshipOutcome({ championship: champ(), teams, players, matches, events, roundAwards: awards });
  const frozenResult: ChampionshipResultData = { ...outcome.result, finishedAt: '2026-02-01' };
  const frozenHistory: PlayerHistoryEntry[] = outcome.playerRows.map((r) => ({
    id: `hist-${r.userId}`,
    userId: r.userId,
    championshipId: CHAMP,
    championshipName: r.championshipName,
    teamId: r.teamId,
    teamName: r.teamName,
    season: r.season,
    goals: r.goals,
    assists: r.assists,
    yellowCards: r.yellowCards,
    redCards: r.redCards,
    matchesPlayed: r.matchesPlayed,
    overall: r.overall,
    finishedAt: '2026-02-01',
    position: r.position,
    isChampion: r.isChampion,
    isMvp: r.isMvp,
    roundMvpCount: r.roundMvpCount,
  }));
  const frozenAchievements: Achievement[] = outcome.expectedAchievements.map((a) => ({
    achievementId: a.achievementId,
    playerId: a.playerId,
    championshipId: CHAMP,
    unlockedAt: '2026-02-01',
  }));
  return { frozenResult, frozenHistory, frozenAchievements };
}

/** Semeia championship_results e os achievements congelados no store. */
function seedFrozen(frozenResult: ChampionshipResultData, frozenAchievements: Achievement[]) {
  mockCol('championship_results').set(CHAMP, { ...frozenResult });
  for (const a of frozenAchievements) {
    mockCol(`players/${a.playerId}/achievements`).set(a.achievementId, { ...a });
  }
}

/**
 * Monta a entrada do serviço. Por padrão: frozen = estado A-vence; current = estado
 * passado (default também A-vence → sem mudança). Override matches/events para mudar.
 */
function input(o: Partial<ReprocessServiceInput> & { currentMatches?: MatchModel[]; currentEvents?: MatchEvent[] } = {}): ReprocessServiceInput {
  const frozenMatches = [matchAB(2, 1)];
  const frozen = freezeState(frozenMatches, eventsAwin);
  const currentMatches = o.currentMatches ?? frozenMatches;
  const currentEvents = o.currentEvents ?? eventsAwin;
  const frozenResult = o.frozenResult ?? frozen.frozenResult;
  const frozenHistory = o.frozenHistory ?? frozen.frozenHistory;
  const frozenAchievements = o.frozenAchievements ?? frozen.frozenAchievements;
  return {
    reason: o.reason ?? 'Reprocessar após correção de súmula',
    organizerId: o.organizerId ?? ORG,
    sourceCorrectionId: o.sourceCorrectionId ?? 'corr-1',
    sourceMatch: o.sourceMatch ?? currentMatches[0],
    expectedReprocessVersion: o.expectedReprocessVersion ?? 0,
    championship: o.championship ?? champ(),
    frozenResult,
    teams: o.teams ?? teams,
    players: o.players ?? players,
    matches: o.matches ?? currentMatches,
    events: o.events ?? currentEvents,
    roundAwards: o.roundAwards ?? awards,
    frozenHistory,
    frozenAchievements,
    allPlayerHistory: o.allPlayerHistory ?? frozenHistory,
    allCareerStats: o.allCareerStats ?? [],
    allResults: o.allResults ?? [frozenResult],
    requireEffect: o.requireEffect,
  };
}

/** Cenário de troca de campeão (frozen A-vence, current B-vence). Semeia por padrão. */
function championChangeInput(
  over: Partial<ReprocessServiceInput> & { currentMatches?: MatchModel[]; currentEvents?: MatchEvent[] } = {},
  opts: { seed?: boolean } = {},
): ReprocessServiceInput {
  const frozen = freezeState([matchAB(2, 1)], eventsAwin);
  if (opts.seed !== false) seedFrozen(frozen.frozenResult, frozen.frozenAchievements);
  return input({
    frozenResult: frozen.frozenResult,
    frozenHistory: frozen.frozenHistory,
    frozenAchievements: frozen.frozenAchievements,
    allPlayerHistory: frozen.frozenHistory,
    allResults: [frozen.frozenResult],
    currentMatches: [matchAB(1, 2)],
    currentEvents: eventsBwin,
    ...over,
  });
}

beforeEach(() => {
  mockResetStore();
});

// ─── Validações básicas ──────────────────────────────────────────────────────────
describe('reprocessClosedChampionship · validações', () => {
  it('campeonato não encerrado é negado', async () => {
    // Sem status finalizado E sem frozenResult → não encerrado.
    const base = input({ championship: champ({ status: 'em_andamento' }) });
    await expect(
      reprocessClosedChampionship({ ...base, frozenResult: undefined as unknown as ChampionshipResultData }),
    ).rejects.toMatchObject({ code: 'championship_not_closed' });
  });

  it('championship_results ausente é negado (status finalizado, sem results)', async () => {
    const base = input();
    await expect(
      reprocessClosedChampionship({ ...base, frozenResult: undefined as unknown as ChampionshipResultData }),
    ).rejects.toMatchObject({ code: 'championship_results_missing' });
  });

  it('organizador não dono é negado', async () => {
    const frozen = freezeState([matchAB(2, 1)], eventsAwin);
    seedFrozen(frozen.frozenResult, frozen.frozenAchievements);
    await expect(
      reprocessClosedChampionship(input({ organizerId: 'outro-org' })),
    ).rejects.toMatchObject({ code: 'not_owner' });
  });

  it('motivo ausente é negado', async () => {
    await expect(
      reprocessClosedChampionship(input({ reason: 'ok' })),
    ).rejects.toMatchObject({ code: 'reprocess_reason_required' });
  });

  it('formato suportado (pontos_corridos) passa', async () => {
    const frozen = freezeState([matchAB(2, 1)], eventsAwin);
    seedFrozen(frozen.frozenResult, frozen.frozenAchievements);
    const r = await reprocessClosedChampionship(input());
    expect(r.idempotent).toBe(false);
  });

  it('formato não suportado é negado', async () => {
    await expect(
      reprocessClosedChampionship(
        input({ championship: champ({ format: 'liga_amadora' as unknown as Championship['format'] }) }),
      ),
    ).rejects.toMatchObject({ code: 'reprocess_unsupported_format' });
  });

  it('correção ainda não aplicada na partida é negada', async () => {
    await expect(
      reprocessClosedChampionship(
        input({ currentMatches: [matchAB(2, 1, { lastCorrectionId: 'outra-corr' })] }),
      ),
    ).rejects.toMatchObject({ code: 'reprocess_correction_not_applied' });
  });

  it('grupo pós-transição para mata-mata permanece bloqueado', async () => {
    const gmatch = matchAB(2, 1, { stage: 'group', groupId: 'G1' });
    await expect(
      reprocessClosedChampionship(
        input({
          championship: champ({
            format: 'grupos_e_mata_mata',
            stage: 'knockout',
            groupStageStatus: 'completed',
            knockoutStageStatus: 'generated',
            groupSnapshotVersion: 1,
            knockoutGenerationVersion: 1,
          }),
          currentMatches: [gmatch],
          sourceMatch: gmatch,
        }),
      ),
    ).rejects.toMatchObject({ code: 'reprocess_group_stage_locked_after_knockout_generation' });
  });

  it('versão de reprocessamento obsoleta é negada', async () => {
    const frozen = freezeState([matchAB(2, 1)], eventsAwin);
    // results já em reprocessVersion 1; nova tentativa com expected 0 e outra correção
    // (partida com lastCorrectionId 'corr-2' para passar da validação de correção aplicada).
    seedFrozen({ ...frozen.frozenResult, reprocessVersion: 1 }, frozen.frozenAchievements);
    await expect(
      reprocessClosedChampionship(
        input({
          sourceCorrectionId: 'corr-2',
          expectedReprocessVersion: 0,
          currentMatches: [matchAB(2, 1, { lastCorrectionId: 'corr-2' })],
        }),
      ),
    ).rejects.toMatchObject({ code: 'stale_reprocess_version' });
  });
});

// ─── Sem mudança ─────────────────────────────────────────────────────────────────
describe('reprocessClosedChampionship · sem mudança', () => {
  it('outcome igual: cria log, não revoga/concede achievement, não toca competitivos', async () => {
    const frozen = freezeState([matchAB(2, 1)], eventsAwin);
    seedFrozen(frozen.frozenResult, frozen.frozenAchievements);
    const r = await reprocessClosedChampionship(input());

    expect(r.changed).toBe(false);
    expect(r.idempotent).toBe(false);
    const log = mockCol('championship_reprocess_logs').get(r.reprocessId);
    expect(log).toBeDefined();
    expect(log).toMatchObject({ changed: false, achievementGrants: [], achievementRevocations: [] });

    // championship_results ganhou apenas metadados de reprocessamento.
    const res = mockCol('championship_results').get(CHAMP) as unknown as ChampionshipResultData;
    expect(res.reprocessVersion).toBe(1);
    expect(res.lastReprocessedBy).toBe(ORG);
    expect(res.winnerId).toBe('A'); // inalterado
    // nenhuma escrita destrutiva
    expect(mockCol('player_history').size).toBe(0);
    expect(mockCol('career_stats').size).toBe(0);
    expect(mockCol('all_time_rankings').size).toBe(0);
  });

  it('requireEffect: sem mudança lança reprocess_no_effect', async () => {
    const frozen = freezeState([matchAB(2, 1)], eventsAwin);
    seedFrozen(frozen.frozenResult, frozen.frozenAchievements);
    await expect(
      reprocessClosedChampionship(input({ requireEffect: true } as Partial<ReprocessServiceInput>)),
    ).rejects.toMatchObject({ code: 'reprocess_no_effect' });
  });
});

// ─── Mudança de campeão ──────────────────────────────────────────────────────────
describe('reprocessClosedChampionship · mudança de campeão', () => {
  it('troca campeão/vice, revoga e concede achievements, atualiza history/career/rankings', async () => {
    const r = await reprocessClosedChampionship(championChangeInput());
    expect(r.changed).toBe(true);
    expect(r.idempotent).toBe(false);

    // championship_results reflete B campeão, A vice, pB artilheiro.
    const res = mockCol('championship_results').get(CHAMP) as unknown as ChampionshipResultData;
    expect(res.winnerId).toBe('B');
    expect(res.runnerUpId).toBe('A');
    expect(res.topScorerId).toBe('pB');
    expect(res.reprocessVersion).toBe(1);

    // player_history atualizado nos docs existentes (hist-uA / hist-uB).
    const histA = mockCol('player_history').get('hist-uA') as unknown as PlayerHistoryEntry;
    const histB = mockCol('player_history').get('hist-uB') as unknown as PlayerHistoryEntry;
    expect(histA.isChampion).toBe(false);
    expect(histB.isChampion).toBe(true);

    // career_stats recalculado para ambos os afetados.
    expect(mockCol('career_stats').get('uA')).toMatchObject({ totalTitles: 0 });
    expect(mockCol('career_stats').get('uB')).toMatchObject({ totalTitles: 1 });

    // rankings reconstruídos (5 documentos).
    expect(mockCol('all_time_rankings').size).toBe(5);

    // achievements: campeão/artilheiro de pA revogados; de pB concedidos.
    const achA = mockCol('players/pA/achievements');
    const achB = mockCol('players/pB/achievements');
    expect(achA.get('campeao')).toMatchObject({ revoked: true, revokedBy: ORG });
    expect(achA.get('artilheiro_campeonato')).toMatchObject({ revoked: true });
    expect(achB.get('campeao')).toMatchObject({ revoked: false, sourceReprocessId: r.reprocessId });
    expect(achB.get('artilheiro_campeonato')).toMatchObject({ achievementId: 'artilheiro_campeonato' });

    // log com grants/revocations e usuários afetados.
    const log = mockCol('championship_reprocess_logs').get(r.reprocessId) as AnyDoc;
    expect((log.affectedUserIds as string[]).sort()).toEqual(['uA', 'uB']);
    expect((log.achievementRevocations as unknown[]).length).toBeGreaterThan(0);
    expect((log.achievementGrants as unknown[]).length).toBeGreaterThan(0);
  });

  it('todos os achievements reconciliados são de fim de campeonato', async () => {
    const r = await reprocessClosedChampionship(championChangeInput());
    const log = mockCol('championship_reprocess_logs').get(r.reprocessId) as AnyDoc;
    const refs = [
      ...(log.achievementGrants as Array<{ achievementId: string }>),
      ...(log.achievementRevocations as Array<{ achievementId: string }>),
    ];
    for (const ref of refs) {
      expect(END_OF_CHAMPIONSHIP_ACHIEVEMENTS).toContain(ref.achievementId);
    }
  });
});

// ─── Mudança de artilheiro ────────────────────────────────────────────────────────
describe('reprocessClosedChampionship · mudança de artilheiro', () => {
  it('só o artilheiro muda (campeão mantém): revoga/concede artilheiro, rankings atualizados', async () => {
    // frozen: A vence 2x1, pA artilheiro (2). current: A vence 3x1 mas com pB marcando 2
    // e pA marcando 1 → A ainda campeão, mas pB passa a artilheiro? Precisa pB>pA.
    // A vence: gols de A > gols de B. Fazemos A 2 x 1 mantendo campeão, e artilheiro
    // vira pB com 2 gols (pB marca os 2 de... não, gols de B contam para B).
    // Solução: manter A campeão (2x1) com pA 1 gol + um gol contra/segundo atacante.
    // Usamos jogador pA2 no time A que marca 1, e pB marca 1; artilheiro empatado.
    // Mais simples: trocamos o autor — frozen pA 2 gols; current pA 1 + pA2 1 (time A),
    // e no time B pB marca 1. A vence 2x1, artilheiro deixa de ser exclusivamente pA.
    const pA2 = player('pA2', 'A', 'uA2');
    const eventsFrozen = [gol('e1', 'pA', 'A'), gol('e2', 'pA', 'A'), gol('e3', 'pB', 'B')];
    const eventsCurrent = [gol('e1', 'pB', 'B'), gol('e2', 'pB', 'B'), gol('e3', 'pA', 'A')];
    // current: B marca 2 (e1,e2) e A marca 1 (e3) → placar A 1 x 2 B → B vence. Não serve.
    // Ajuste: manter A vencedor exige gols de A >= B. Deixe A marcar 2 (pA2 x2) e B 1 (pB).
    const eventsCurrent2 = [gol('e1', 'pA2', 'A'), gol('e2', 'pA2', 'A'), gol('e3', 'pB', 'B')];
    void eventsCurrent;

    const allPlayers = [...players, pA2];
    const frozenOutcome = computeChampionshipOutcome({ championship: champ(), teams, players: allPlayers, matches: [matchAB(2, 1)], events: eventsFrozen, roundAwards: awards });
    const frozenResult: ChampionshipResultData = { ...frozenOutcome.result, finishedAt: '2026-02-01' };
    const frozenAch: Achievement[] = frozenOutcome.expectedAchievements.map((a) => ({ achievementId: a.achievementId, playerId: a.playerId, championshipId: CHAMP, unlockedAt: '2026-02-01' }));
    const frozenHist: PlayerHistoryEntry[] = frozenOutcome.playerRows.map((r) => ({
      id: `hist-${r.userId}`, userId: r.userId, championshipId: CHAMP, championshipName: r.championshipName,
      teamId: r.teamId, teamName: r.teamName, season: r.season, goals: r.goals, assists: r.assists,
      yellowCards: r.yellowCards, redCards: r.redCards, matchesPlayed: r.matchesPlayed, overall: r.overall,
      finishedAt: '2026-02-01', position: r.position, isChampion: r.isChampion, isMvp: r.isMvp, roundMvpCount: r.roundMvpCount,
    }));
    seedFrozen(frozenResult, frozenAch);

    const r = await reprocessClosedChampionship(input({
      players: allPlayers,
      currentMatches: [matchAB(2, 1)],
      currentEvents: eventsCurrent2,
      frozenResult, frozenHistory: frozenHist, frozenAchievements: frozenAch,
      allPlayerHistory: frozenHist, allResults: [frozenResult],
    }));

    expect(r.changed).toBe(true);
    const res = mockCol('championship_results').get(CHAMP) as unknown as ChampionshipResultData;
    expect(res.winnerId).toBe('A'); // campeão mantido
    expect(res.topScorerId).toBe('pA2'); // artilheiro mudou
    // artilheiro antigo revogado, novo concedido
    expect(mockCol('players/pA/achievements').get('artilheiro_campeonato')).toMatchObject({ revoked: true });
    expect(mockCol('players/pA2/achievements').get('artilheiro_campeonato')).toMatchObject({ revoked: false });
    expect(mockCol('all_time_rankings').size).toBe(5);
  });
});

// ─── Fair play ────────────────────────────────────────────────────────────────────
describe('reprocessClosedChampionship · fair play', () => {
  it('surge cartão para pA → fair play de pA revogado', async () => {
    const frozen = freezeState([matchAB(2, 1)], eventsAwin);
    seedFrozen(frozen.frozenResult, frozen.frozenAchievements);
    // frozen concede fair_play a pA e pB (sem cartões). current adiciona cartão a pA.
    const r = await reprocessClosedChampionship(input({
      frozenResult: frozen.frozenResult,
      frozenHistory: frozen.frozenHistory,
      frozenAchievements: frozen.frozenAchievements,
      allPlayerHistory: frozen.frozenHistory,
      allResults: [frozen.frozenResult],
      currentMatches: [matchAB(2, 1)],
      currentEvents: [...eventsAwin, card('c1', 'pA', 'A')],
    }));
    expect(r.changed).toBe(true);
    expect(mockCol('players/pA/achievements').get('fair_play_campeonato')).toMatchObject({ revoked: true });
    // pB mantém fair play (não tocado).
    expect(mockCol('players/pB/achievements').get('fair_play_campeonato')?.revoked).toBeUndefined();
  });
});

// ─── Idempotência ────────────────────────────────────────────────────────────────
describe('reprocessClosedChampionship · idempotência', () => {
  it('retry da mesma correção/versão retorna idempotent e não duplica', async () => {
    // MESMA entrada nas duas chamadas, SEM re-seed (o re-seed resetaria os docs).
    const inp = championChangeInput();
    const first = await reprocessClosedChampionship(inp);
    expect(first.idempotent).toBe(false);
    const logsAfterFirst = mockCol('championship_reprocess_logs').size;
    const revokedFirst = JSON.parse(
      JSON.stringify(mockCol('players/pA/achievements').get('campeao')),
    );

    const repeat = await reprocessClosedChampionship(inp);
    expect(repeat.idempotent).toBe(true);
    expect(repeat.reprocessId).toBe(first.reprocessId);
    // não cria segundo log
    expect(mockCol('championship_reprocess_logs').size).toBe(logsAfterFirst);
    // revogação não é reaplicada/duplicada
    expect(mockCol('players/pA/achievements').get('campeao')).toEqual(revokedFirst);
  });
});

// ─── Concorrência ────────────────────────────────────────────────────────────────
describe('reprocessClosedChampionship · concorrência', () => {
  it('segunda correção com versão obsoleta é rejeitada (stale)', async () => {
    await reprocessClosedChampionship(championChangeInput()); // semeia + bump p/ v1
    // agora chega uma correção diferente ainda assumindo v0 (sem re-semear).
    const stale = championChangeInput(
      {
        sourceCorrectionId: 'corr-2',
        expectedReprocessVersion: 0,
        currentMatches: [matchAB(1, 2, { lastCorrectionId: 'corr-2' })],
        currentEvents: eventsBwin,
      },
      { seed: false },
    );
    await expect(reprocessClosedChampionship(stale)).rejects.toMatchObject({
      code: 'stale_reprocess_version',
    });
  });

  it('log pré-existente com digest divergente gera conflito', async () => {
    const in1 = championChangeInput();
    const reprocessId = reprocessIdFor(CHAMP, 'corr-1', 1);
    mockCol('championship_reprocess_logs').set(reprocessId, {
      id: reprocessId, reprocessId, newResultsDigest: 'DIGEST-DIFERENTE', changed: true, reprocessVersion: 1,
    });
    await expect(reprocessClosedChampionship(in1)).rejects.toMatchObject({
      code: 'championship_reprocess_conflict',
    });
  });
});

// ─── Regressão de formatos ─────────────────────────────────────────────────────────
describe('reprocessClosedChampionship · regressão de formatos', () => {
  it('pontos corridos encerrado reprocessa sem erro', async () => {
    const r = await reprocessClosedChampionship(championChangeInput());
    expect(r.changed).toBe(true);
  });

  it('mata-mata encerrado reprocessa (final define campeão)', async () => {
    const finalFrozen = matchAB(2, 1, { bracketRound: 'final', bracketPosition: 0, nextMatchId: null });
    const finalCurrent = matchAB(1, 2, { bracketRound: 'final', bracketPosition: 0, nextMatchId: null });
    const ko = champ({ format: 'mata_mata' });
    const frozenOutcome = computeChampionshipOutcome({ championship: ko, teams, players, matches: [finalFrozen], events: eventsAwin, roundAwards: awards });
    const frozenResult: ChampionshipResultData = { ...frozenOutcome.result, finishedAt: '2026-02-01' };
    const frozenAch: Achievement[] = frozenOutcome.expectedAchievements.map((a) => ({ achievementId: a.achievementId, playerId: a.playerId, championshipId: CHAMP, unlockedAt: '2026-02-01' }));
    const frozenHist: PlayerHistoryEntry[] = frozenOutcome.playerRows.map((rw) => ({
      id: `hist-${rw.userId}`, userId: rw.userId, championshipId: CHAMP, championshipName: rw.championshipName,
      teamId: rw.teamId, teamName: rw.teamName, season: rw.season, goals: rw.goals, assists: rw.assists,
      yellowCards: rw.yellowCards, redCards: rw.redCards, matchesPlayed: rw.matchesPlayed, overall: rw.overall,
      finishedAt: '2026-02-01', position: rw.position, isChampion: rw.isChampion, isMvp: rw.isMvp, roundMvpCount: rw.roundMvpCount,
    }));
    seedFrozen(frozenResult, frozenAch);
    expect(frozenResult.winnerId).toBe('A');

    const r = await reprocessClosedChampionship(input({
      championship: ko,
      currentMatches: [finalCurrent],
      currentEvents: eventsBwin,
      sourceMatch: finalCurrent,
      frozenResult, frozenHistory: frozenHist, frozenAchievements: frozenAch,
      allPlayerHistory: frozenHist, allResults: [frozenResult],
    }));
    expect(r.changed).toBe(true);
    expect(mockCol('championship_results').get(CHAMP)).toMatchObject({ winnerId: 'B' });
  });
});
