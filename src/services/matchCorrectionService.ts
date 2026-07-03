import {
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import {
  Achievement,
  CareerStats,
  Championship,
  ChampionshipResultData,
  MatchCorrection,
  MatchCorrectionEventSnapshot,
  MatchEvent,
  MatchModel,
  Player,
  PlayerHistoryEntry,
  RoundAward,
  Team,
} from '../types';
import { db } from './firebase';
import { MOCK_DATA_ENABLED as USE_MOCK } from '../config/appConfig';
import { getCollection, getDocument } from './firestore';
import {
  addMockDocument,
  getMockDocument,
  setMockDocument,
  updateMockDocument,
} from '../mocks/mockDb';
import { activeMatchEvents, getMatchWinnerId } from '../utils/matchRules';
import { hasGeneratedKnockout, normalizeMatchStage } from '../utils/groupStageStructure';
import { getPlayerSuspensionReason } from './statsService';
import {
  getReprocessErrorMessage,
  reprocessClosedChampionship,
  ReprocessResult,
  ReprocessServiceInput,
} from './championshipReprocessService';
import { ReprocessError, reprocessIdFor } from '../utils/championshipReprocessing';

// Códigos estáveis para cada motivo de bloqueio da correção controlada. Permitem
// mapear o erro para uma mensagem amigável na UI sem expor texto técnico cru e
// servem de contrato testável para o serviço.
export type CorrectionErrorCode =
  | 'reason_required'
  | 'not_finalized'
  | 'not_owner'
  | 'unsupported_format'
  | 'championship_missing'
  | 'championship_closed'
  | 'championship_results_missing'
  | 'closed_championship_reprocess_required'
  | 'closed_championship_reprocess_unavailable'
  | 'score_mismatch'
  | 'event_mismatch'
  | 'stale_version'
  | 'stale_reprocess_version'
  | 'next_match_missing'
  | 'next_match_locked'
  | 'group_stage_locked_after_knockout_generation'
  | 'match_not_found';

export class CorrectionError extends Error {
  code: CorrectionErrorCode;
  constructor(code: CorrectionErrorCode, message: string) {
    super(message);
    this.name = 'CorrectionError';
    this.code = code;
  }
}

/**
 * Converte qualquer erro lançado pelo fluxo de correção em uma mensagem amigável.
 * Erros de negócio conhecidos (CorrectionError) já têm texto próprio; erros crus
 * do Firebase são classificados por `code` para nunca chegarem ao usuário como
 * stack/technical string. Casos desconhecidos caem em uma mensagem genérica.
 */
export function getCorrectionErrorMessage(err: unknown): string {
  if (err instanceof CorrectionError) return err.message;
  if (err instanceof ReprocessError) return getReprocessErrorMessage(err);

  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';

  switch (code) {
    case 'permission-denied':
      return 'Você não tem permissão para corrigir este resultado.';
    case 'unavailable':
    case 'deadline-exceeded':
    case 'network-request-failed':
      return 'Falha de conexão. Verifique sua internet e tente novamente.';
    case 'aborted':
    case 'failed-precondition':
      return 'A partida mudou enquanto você corrigia. Recarregue e tente novamente.';
    default:
      return 'Ocorreu um erro inesperado ao corrigir o resultado. Tente novamente.';
  }
}

export interface MatchCorrectionContext {
  correctionId: string;
  organizerId: string;
  reason: string;
  match: MatchModel;
  championship: Championship;
  allMatches: MatchModel[];
  allEvents: MatchEvent[];
  players: Player[];
  nextHomeScore: number;
  nextAwayScore: number;
  nextEvents: MatchEvent[];
  expectedCorrectionVersion: number;
}

export interface IntegratedMatchCorrectionContext extends MatchCorrectionContext {
  expectedReprocessVersion?: number;
}

export interface MatchCorrectionReprocessSummary {
  reprocessId: string;
  reprocessVersion: number;
  changedFields: string[];
  affectedUserIds: string[];
  achievementGrants: ReprocessResult['plan']['achievementGrants'];
  achievementRevocations: ReprocessResult['plan']['achievementRevocations'];
  idempotent: boolean;
}

export interface MatchCorrectionResult {
  correction: MatchCorrection;
  updatedMatch: Partial<MatchModel>;
  nextMatchIdToUpdate: string | null;
  nextMatchUpdate: Partial<MatchModel> | null;
  activeMatchEvents: MatchEvent[];
  playerUpdates: Array<{ playerId: string; updates: Partial<Player> }>;
  idempotent: boolean;
  reprocess?: MatchCorrectionReprocessSummary;
}

function snapshotEvent(event: MatchEvent): MatchCorrectionEventSnapshot {
  return {
    id: event.id,
    type: event.type,
    teamId: event.teamId,
    playerId: event.playerId,
    playerName: event.playerName,
    teamName: event.teamName,
    minute: event.minute,
  };
}

function sameEventData(a: MatchEvent, b: MatchEvent): boolean {
  return (
    a.type === b.type &&
    a.teamId === b.teamId &&
    a.playerId === b.playerId &&
    a.minute === b.minute &&
    (a.playerName ?? '') === (b.playerName ?? '') &&
    (a.teamName ?? '') === (b.teamName ?? '')
  );
}

function countGoals(events: MatchEvent[], teamId: string): number {
  return activeMatchEvents(events).filter(
    (event) => event.type === 'gol' && event.teamId === teamId,
  ).length;
}

function buildCorrection(
  ctx: MatchCorrectionContext,
  now: string,
  options: { allowClosedChampionshipReprocess?: boolean } = {},
): {
  correction: MatchCorrection;
  updatedMatch: Partial<MatchModel>;
  nextMatchIdToUpdate: string | null;
  nextMatchUpdate: Partial<MatchModel> | null;
  playerUpdates: Array<{ playerId: string; updates: Partial<Player> }>;
  addedEvents: MatchEvent[];
  changedEvents: Array<{ before: MatchEvent; after: MatchEvent }>;
  removedEvents: MatchEvent[];
  nextVersion: number;
} {
  if (!ctx.match) {
    throw new CorrectionError('match_not_found', 'Partida não encontrada.');
  }
  if (!ctx.championship) {
    throw new CorrectionError('championship_missing', 'Campeonato não encontrado para a correção.');
  }
  if (ctx.reason.trim().length < 5) {
    throw new CorrectionError('reason_required', 'Informe um motivo com pelo menos 5 caracteres.');
  }
  if (ctx.match.status !== 'finalizado') {
    throw new CorrectionError('not_finalized', 'A correção controlada só vale para partida finalizada.');
  }
  if (ctx.championship.organizerId !== ctx.organizerId) {
    throw new CorrectionError('not_owner', 'Somente o organizador dono do campeonato pode corrigir.');
  }
  const normalizedMatch = normalizeMatchStage(ctx.match, ctx.championship);
  if (
    ctx.championship.format === 'grupos_e_mata_mata' &&
    normalizedMatch.stage === 'group' &&
    hasGeneratedKnockout(ctx.championship)
  ) {
    throw new CorrectionError(
      'group_stage_locked_after_knockout_generation',
      'Correção bloqueada: a fase de grupos já foi congelada para gerar o mata-mata.',
    );
  }

  const resultExists = !USE_MOCK
    ? false
    : !!getMockDocument('championship_results', ctx.championship.id);
  if (
    (ctx.championship.status === 'finalizado' || resultExists) &&
    !options.allowClosedChampionshipReprocess
  ) {
    throw new CorrectionError(
      'championship_closed',
      'Campeonato com fechamento definitivo não pode ser corrigido neste bloco.',
    );
  }

  const foreignEvent = ctx.nextEvents.find(
    (event) => !event.id.startsWith('local-') && event.matchId !== ctx.match.id,
  );
  if (foreignEvent) {
    throw new CorrectionError('event_mismatch', 'Há eventos que não pertencem a esta partida.');
  }

  if (ctx.nextHomeScore < 0 || ctx.nextAwayScore < 0) {
    throw new CorrectionError('score_mismatch', 'Placar e eventos de gol precisam ficar consistentes.');
  }
  const homeGoals = countGoals(ctx.nextEvents, ctx.match.homeTeamId);
  const awayGoals = countGoals(ctx.nextEvents, ctx.match.awayTeamId);
  if (homeGoals !== ctx.nextHomeScore || awayGoals !== ctx.nextAwayScore) {
    throw new CorrectionError('score_mismatch', 'Placar e eventos de gol precisam ficar consistentes.');
  }

  const previousVersion = ctx.match.correctionVersion ?? 0;
  if (previousVersion !== ctx.expectedCorrectionVersion) {
    throw new CorrectionError(
      'stale_version',
      'A partida mudou desde que a tela foi aberta. Recarregue e tente novamente.',
    );
  }

  const previousWinnerId = ctx.match.winnerId ?? getMatchWinnerId(ctx.match);
  const nextWinnerId = getMatchWinnerId({
    ...ctx.match,
    homeScore: ctx.nextHomeScore,
    awayScore: ctx.nextAwayScore,
  });
  const nextVersion = previousVersion + 1;

  const previousActive = activeMatchEvents(ctx.allEvents.filter((event) => event.matchId === ctx.match.id));
  const previousById = new Map(previousActive.map((event) => [event.id, event]));
  const nextById = new Map(
    ctx.nextEvents
      .filter((event) => !event.id.startsWith('local-'))
      .map((event) => [event.id, event]),
  );

  const addedEvents = ctx.nextEvents
    .filter((event) => event.id.startsWith('local-'))
    .map((event) => ({
      ...event,
      id: `${ctx.correctionId}-${event.id.replace(/^local-/, '')}`,
      championshipId: ctx.match.championshipId,
      matchId: ctx.match.id,
      lastCorrectionId: ctx.correctionId,
      correctedAt: now,
      correctionVersion: nextVersion,
    }));

  const changedEvents: Array<{ before: MatchEvent; after: MatchEvent }> = [];
  for (const event of ctx.nextEvents.filter((item) => !item.id.startsWith('local-'))) {
    const before = previousById.get(event.id);
    if (!before || sameEventData(before, event)) continue;
    changedEvents.push({
      before,
      after: {
        ...event,
        lastCorrectionId: ctx.correctionId,
        correctedAt: now,
        correctionVersion: nextVersion,
      },
    });
  }

  const removedEvents = previousActive.filter((event) => !nextById.has(event.id));

  let nextMatchIdToUpdate: string | null = null;
  let nextMatchUpdate: Partial<MatchModel> | null = null;
  const isKnockout = ctx.championship.format === 'mata_mata' || !!ctx.match.bracketRound;
  if (isKnockout && previousWinnerId !== nextWinnerId) {
    if (ctx.match.nextMatchId) {
      const nextMatch = ctx.allMatches.find((item) => item.id === ctx.match.nextMatchId);
      if (!nextMatch) {
        throw new CorrectionError('next_match_missing', 'Próxima partida do mata-mata não encontrada.');
      }
      if (nextMatch.status !== 'agendado') {
        throw new CorrectionError(
          'next_match_locked',
          'Correção bloqueada: a próxima partida já começou ou terminou.',
        );
      }
      const slot = (ctx.match.bracketPosition ?? 0) % 2 === 0 ? 'homeTeamId' : 'awayTeamId';
      nextMatchIdToUpdate = nextMatch.id;
      nextMatchUpdate = { [slot]: nextWinnerId ?? '' };
    }
  }

  const allEventsAfter = ctx.allEvents
    .filter((event) => event.matchId !== ctx.match.id)
    .concat(ctx.nextEvents);
  const allMatchesAfter = ctx.allMatches.map((match) =>
    match.id === ctx.match.id
      ? { ...match, homeScore: ctx.nextHomeScore, awayScore: ctx.nextAwayScore, winnerId: nextWinnerId }
      : match,
  );
  const finishedMatchesAfter = allMatchesAfter.filter((match) => match.status === 'finalizado');
  const yellowLimit = ctx.championship.rules.yellowCardLimit ?? 3;
  const currentRound = ctx.championship.currentRound;
  const affectedPlayers = new Set<string>();
  [...previousActive, ...ctx.nextEvents].forEach((event) => affectedPlayers.add(event.playerId));
  ctx.players
    .filter((player) => player.suspendedRound != null && player.suspendedRound >= ctx.match.round)
    .forEach((player) => affectedPlayers.add(player.id));

  const playerUpdates: Array<{ playerId: string; updates: Partial<Player> }> = [];
  for (const player of ctx.players) {
    if (!affectedPlayers.has(player.id)) continue;
    const reason = getPlayerSuspensionReason(
      allEventsAfter,
      finishedMatchesAfter,
      player.id,
      currentRound,
      yellowLimit,
    );
    if (reason) {
      playerUpdates.push({
        playerId: player.id,
        updates: { status: 'suspenso', suspendedRound: currentRound },
      });
    } else if (player.status === 'suspenso' || player.suspendedRound != null) {
      playerUpdates.push({
        playerId: player.id,
        updates: { status: 'ativo', suspendedRound: null },
      });
    }
  }

  const updatedMatch: Partial<MatchModel> = {
    homeScore: ctx.nextHomeScore,
    awayScore: ctx.nextAwayScore,
    winnerId: nextWinnerId,
    lastCorrectionId: ctx.correctionId,
    correctedAt: now,
    updatedAt: now,
    correctionVersion: nextVersion,
  };

  const derivedEffects = [
    'placar',
    'eventos',
    'classificacao',
    'artilharia',
    'assistencias',
    'cartoes',
    'suspensoes',
    ...(isKnockout ? ['mata_mata'] : []),
  ];

  const correction: MatchCorrection = {
    id: ctx.correctionId,
    championshipId: ctx.match.championshipId,
    matchId: ctx.match.id,
    organizerId: ctx.organizerId,
    reason: ctx.reason.trim(),
    createdAt: now,
    previousScore: {
      homeScore: ctx.match.homeScore,
      awayScore: ctx.match.awayScore,
    },
    newScore: {
      homeScore: ctx.nextHomeScore,
      awayScore: ctx.nextAwayScore,
    },
    previousWinnerId,
    newWinnerId: nextWinnerId,
    eventsAdded: addedEvents.map(snapshotEvent),
    eventsRemoved: removedEvents.map(snapshotEvent),
    eventsChanged: changedEvents.map((event) => ({
      before: snapshotEvent(event.before),
      after: snapshotEvent(event.after),
    })),
    round: ctx.match.round,
    championshipFormat: ctx.championship.format,
    derivedEffects,
    previousMatchVersion: previousVersion,
    newMatchVersion: nextVersion,
    previousMatch: ctx.match,
  };

  return {
    correction,
    updatedMatch,
    nextMatchIdToUpdate,
    nextMatchUpdate,
    playerUpdates,
    addedEvents,
    changedEvents,
    removedEvents,
    nextVersion,
  };
}

export async function applyMatchCorrection(
  ctx: MatchCorrectionContext,
): Promise<MatchCorrectionResult> {
  return applyMatchCorrectionInternal(ctx);
}

async function applyMatchCorrectionInternal(
  ctx: MatchCorrectionContext,
  options: { allowClosedChampionshipReprocess?: boolean } = {},
): Promise<MatchCorrectionResult> {
  const now = new Date().toISOString();
  const built = buildCorrection(ctx, now, options);

  if (USE_MOCK) {
    const existing = getMockDocument<MatchCorrection>('match_corrections', ctx.correctionId);
    if (existing) {
      return {
        correction: existing,
        updatedMatch: {},
        nextMatchIdToUpdate: null,
        nextMatchUpdate: null,
        activeMatchEvents: activeMatchEvents(ctx.nextEvents),
        playerUpdates: [],
        idempotent: true,
      };
    }

    setMockDocument('match_corrections', ctx.correctionId, built.correction);
    updateMockDocument('matches', ctx.match.id, built.updatedMatch as Record<string, unknown>);
    if (built.nextMatchIdToUpdate && built.nextMatchUpdate) {
      updateMockDocument('matches', built.nextMatchIdToUpdate, built.nextMatchUpdate);
    }
    for (const event of built.addedEvents) {
      addMockDocument('match_events', event);
    }
    for (const event of built.changedEvents) {
      updateMockDocument(
        'match_events',
        event.before.id,
        event.after as unknown as Partial<Record<string, unknown>>,
      );
    }
    for (const event of built.removedEvents) {
      updateMockDocument('match_events', event.id, {
        removedAt: now,
        removedByCorrectionId: ctx.correctionId,
        lastCorrectionId: ctx.correctionId,
        correctionVersion: built.nextVersion,
      });
    }
    for (const update of built.playerUpdates) {
      updateMockDocument('players', update.playerId, update.updates);
    }

    return {
      correction: built.correction,
      updatedMatch: built.updatedMatch,
      nextMatchIdToUpdate: built.nextMatchIdToUpdate,
      nextMatchUpdate: built.nextMatchUpdate,
      activeMatchEvents: activeMatchEvents(ctx.nextEvents),
      playerUpdates: built.playerUpdates,
      idempotent: false,
    };
  }

  const resultRef = doc(db, 'championship_results', ctx.championship.id);
  const resultSnap = await getDoc(resultRef);
  if (resultSnap.exists() && !options.allowClosedChampionshipReprocess) {
    throw new CorrectionError(
      'championship_closed',
      'Campeonato com fechamento definitivo não pode ser corrigido neste bloco.',
    );
  }

  const txResult = await runTransaction<{ correction: MatchCorrection; idempotent: boolean }>(
    db,
    async (transaction) => {
      const matchRef = doc(db, 'matches', ctx.match.id);
      const correctionRef = doc(db, 'match_corrections', ctx.correctionId);
      const nextMatchRef = built.nextMatchIdToUpdate
        ? doc(db, 'matches', built.nextMatchIdToUpdate)
        : null;
      const correctionSnap = await transaction.get(correctionRef);
      if (correctionSnap.exists()) {
        return {
          correction: { id: correctionSnap.id, ...correctionSnap.data() } as MatchCorrection,
          idempotent: true,
        };
      }

      const matchSnap = await transaction.get(matchRef);
      const nextMatchSnap = nextMatchRef ? await transaction.get(nextMatchRef) : null;
      if (!matchSnap.exists()) throw new CorrectionError('match_not_found', 'Partida não encontrada.');
      const persistedMatch = { id: matchSnap.id, ...matchSnap.data() } as MatchModel;
      if ((persistedMatch.correctionVersion ?? 0) !== ctx.expectedCorrectionVersion) {
        throw new CorrectionError(
          'stale_version',
          'A partida mudou desde que a tela foi aberta. Recarregue e tente novamente.',
        );
      }
      if (nextMatchRef) {
        if (!nextMatchSnap?.exists()) {
          throw new CorrectionError('next_match_missing', 'Próxima partida do mata-mata não encontrada.');
        }
        const persistedNextMatch = { id: nextMatchSnap.id, ...nextMatchSnap.data() } as MatchModel;
        if (persistedNextMatch.status !== 'agendado') {
          throw new CorrectionError(
            'next_match_locked',
            'Correção bloqueada: a próxima partida já começou ou terminou.',
          );
        }
      }

      transaction.set(correctionRef, {
        ...built.correction,
        createdAt: serverTimestamp(),
      });
      transaction.update(matchRef, { ...built.updatedMatch, updatedAt: serverTimestamp() });

      if (built.nextMatchIdToUpdate && built.nextMatchUpdate) {
        transaction.update(doc(db, 'matches', built.nextMatchIdToUpdate), built.nextMatchUpdate);
      }

      for (const event of built.addedEvents) {
        const eventRef = doc(db, 'match_events', event.id);
        transaction.set(eventRef, {
          ...event,
          createdAt: serverTimestamp(),
          correctedAt: serverTimestamp(),
        });
      }
      for (const event of built.changedEvents) {
        transaction.update(doc(db, 'match_events', event.before.id), {
          ...event.after,
          correctedAt: serverTimestamp(),
        });
      }
      for (const event of built.removedEvents) {
        transaction.update(doc(db, 'match_events', event.id), {
          removedAt: serverTimestamp(),
          removedByCorrectionId: ctx.correctionId,
          lastCorrectionId: ctx.correctionId,
          correctionVersion: built.nextVersion,
        });
      }
      for (const update of built.playerUpdates) {
        transaction.update(doc(db, 'players', update.playerId), update.updates);
      }

      return { correction: built.correction, idempotent: false };
    },
  );

  return {
    correction: txResult.correction,
    updatedMatch: built.updatedMatch,
    nextMatchIdToUpdate: built.nextMatchIdToUpdate,
    nextMatchUpdate: built.nextMatchUpdate,
    activeMatchEvents: activeMatchEvents(ctx.nextEvents),
    playerUpdates: built.playerUpdates,
    idempotent: txResult.idempotent,
  };
}

function isClosedChampionship(
  championship: Championship,
  frozenResult: ChampionshipResultData | null,
): boolean {
  return championship.status === 'finalizado' || frozenResult !== null;
}

function toReprocessSummary(result: ReprocessResult): MatchCorrectionReprocessSummary {
  return {
    reprocessId: result.reprocessId,
    reprocessVersion: result.reprocessVersion,
    changedFields: result.plan.changedFields,
    affectedUserIds: result.plan.affectedUserIds,
    achievementGrants: result.plan.achievementGrants,
    achievementRevocations: result.plan.achievementRevocations,
    idempotent: result.idempotent,
  };
}

async function loadChampionshipAchievements(
  championshipId: string,
  players: Player[],
): Promise<Achievement[]> {
  const playerIds = new Set(players.map((player) => player.id));
  if (USE_MOCK) {
    const perPlayer = await Promise.all(
      players.map((player) => getCollection<Achievement>(`players/${player.id}/achievements`)),
    );
    return perPlayer.flat().filter((achievement) => achievement.championshipId === championshipId);
  }

  const snap = await getDocs(
    query(collectionGroup(db, 'achievements'), where('championshipId', '==', championshipId)),
  );
  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() }) as Achievement & { id?: string })
    .filter((achievement) => playerIds.has(achievement.playerId));
}

async function loadReprocessInputAfterCorrection(
  ctx: IntegratedMatchCorrectionContext,
  frozenResult: ChampionshipResultData,
  sourceMatch: MatchModel,
): Promise<ReprocessServiceInput> {
  const championshipId = ctx.championship.id;
  const [
    teams,
    players,
    matches,
    events,
    roundAwards,
    frozenHistory,
    allPlayerHistory,
    allCareerStats,
    allResults,
  ] = await Promise.all([
    getCollection<Team>('teams', [{ field: 'championshipId', operator: '==', value: championshipId }]),
    getCollection<Player>('players', [{ field: 'championshipId', operator: '==', value: championshipId }]),
    getCollection<MatchModel>('matches', [{ field: 'championshipId', operator: '==', value: championshipId }]),
    getCollection<MatchEvent>('match_events', [{ field: 'championshipId', operator: '==', value: championshipId }]),
    getCollection<RoundAward>('round_awards', [{ field: 'championshipId', operator: '==', value: championshipId }]),
    getCollection<PlayerHistoryEntry>('player_history', [
      { field: 'championshipId', operator: '==', value: championshipId },
    ]),
    getCollection<PlayerHistoryEntry>('player_history'),
    getCollection<CareerStats>('career_stats'),
    getCollection<ChampionshipResultData>('championship_results'),
  ]);
  const frozenAchievements = await loadChampionshipAchievements(championshipId, players);

  return {
    reason: ctx.reason,
    organizerId: ctx.organizerId,
    sourceCorrectionId: ctx.correctionId,
    sourceMatch,
    expectedReprocessVersion: ctx.expectedReprocessVersion ?? 0,
    championship: ctx.championship,
    frozenResult,
    teams,
    players,
    matches,
    events,
    roundAwards,
    frozenHistory,
    frozenAchievements,
    allPlayerHistory,
    allCareerStats,
    allResults,
  };
}

export async function applyMatchCorrectionWithClosedChampionshipReprocess(
  ctx: IntegratedMatchCorrectionContext,
): Promise<MatchCorrectionResult> {
  const frozenResult = await getDocument<ChampionshipResultData>(
    'championship_results',
    ctx.championship.id,
  );
  const closed = isClosedChampionship(ctx.championship, frozenResult);

  if (!closed) {
    return applyMatchCorrection(ctx);
  }

  if (!frozenResult) {
    throw new CorrectionError(
      'championship_results_missing',
      'Campeonato encerrado sem resultado congelado nao pode ser corrigido.',
    );
  }
  if (ctx.expectedReprocessVersion == null) {
    throw new CorrectionError(
      'closed_championship_reprocess_required',
      'Campeonato encerrado exige reprocessamento imediato para corrigir.',
    );
  }
  if ((frozenResult.reprocessVersion ?? 0) !== ctx.expectedReprocessVersion) {
    const retryLogId = reprocessIdFor(
      ctx.championship.id,
      ctx.correctionId,
      ctx.expectedReprocessVersion + 1,
    );
    const existingRetryLog = await getDocument('championship_reprocess_logs', retryLogId);
    if (!existingRetryLog) {
      throw new CorrectionError(
        'stale_reprocess_version',
        'O campeonato mudou desde que a tela foi aberta. Recarregue e tente novamente.',
      );
    }
  }

  const correctionResult = await applyMatchCorrectionInternal(ctx, {
    allowClosedChampionshipReprocess: true,
  });
  const sourceMatch = await getDocument<MatchModel>('matches', ctx.match.id);
  if (!sourceMatch || sourceMatch.lastCorrectionId !== correctionResult.correction.id) {
    throw new CorrectionError(
      'closed_championship_reprocess_unavailable',
      'A correcao foi registrada, mas nao foi possivel confirmar o estado para reprocessar.',
    );
  }

  const reprocessInput = await loadReprocessInputAfterCorrection(ctx, frozenResult, sourceMatch);
  const reprocess = await reprocessClosedChampionship(reprocessInput);

  return {
    ...correctionResult,
    reprocess: toReprocessSummary(reprocess),
  };
}
