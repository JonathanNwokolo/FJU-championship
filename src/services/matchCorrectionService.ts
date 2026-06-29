import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Championship,
  MatchCorrection,
  MatchCorrectionEventSnapshot,
  MatchEvent,
  MatchModel,
  Player,
} from '../types';
import { db } from './firebase';
import { MOCK_DATA_ENABLED as USE_MOCK } from '../config/appConfig';
import {
  addMockDocument,
  getMockDocument,
  setMockDocument,
  updateMockDocument,
} from '../mocks/mockDb';
import { activeMatchEvents, getMatchWinnerId } from '../utils/matchRules';
import { getPlayerSuspensionReason } from './statsService';

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

export interface MatchCorrectionResult {
  correction: MatchCorrection;
  updatedMatch: Partial<MatchModel>;
  nextMatchIdToUpdate: string | null;
  nextMatchUpdate: Partial<MatchModel> | null;
  activeMatchEvents: MatchEvent[];
  playerUpdates: Array<{ playerId: string; updates: Partial<Player> }>;
  idempotent: boolean;
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
  if (ctx.reason.trim().length < 5) {
    throw new Error('Informe um motivo com pelo menos 5 caracteres.');
  }
  if (ctx.match.status !== 'finalizado') {
    throw new Error('A correção controlada só vale para partida finalizada.');
  }
  if (ctx.championship.organizerId !== ctx.organizerId) {
    throw new Error('Somente o organizador dono do campeonato pode corrigir.');
  }
  if (ctx.championship.format === 'grupos_e_mata_mata') {
    throw new Error('Grupos + mata-mata fica fora do Bloco 4.');
  }

  const resultExists = !USE_MOCK
    ? false
    : !!getMockDocument('championship_results', ctx.championship.id);
  if (ctx.championship.status === 'finalizado' || resultExists) {
    throw new Error('Campeonato com fechamento definitivo não pode ser corrigido neste bloco.');
  }

  const homeGoals = countGoals(ctx.nextEvents, ctx.match.homeTeamId);
  const awayGoals = countGoals(ctx.nextEvents, ctx.match.awayTeamId);
  if (homeGoals !== ctx.nextHomeScore || awayGoals !== ctx.nextAwayScore) {
    throw new Error('Placar e eventos de gol precisam ficar consistentes.');
  }

  const previousVersion = ctx.match.correctionVersion ?? 0;
  if (previousVersion !== ctx.expectedCorrectionVersion) {
    throw new Error('A partida mudou desde que a tela foi aberta. Recarregue e tente novamente.');
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
        throw new Error('Próxima partida do mata-mata não encontrada.');
      }
      if (nextMatch.status !== 'agendado') {
        throw new Error('Correção bloqueada: a próxima partida já começou ou terminou.');
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
  const now = new Date().toISOString();
  const built = buildCorrection(ctx, now);

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
  if (resultSnap.exists()) {
    throw new Error('Campeonato com fechamento definitivo não pode ser corrigido neste bloco.');
  }

  const correction = await runTransaction<MatchCorrection>(db, async (transaction) => {
    const matchRef = doc(db, 'matches', ctx.match.id);
    const correctionRef = doc(db, 'match_corrections', ctx.correctionId);
    const nextMatchRef = built.nextMatchIdToUpdate
      ? doc(db, 'matches', built.nextMatchIdToUpdate)
      : null;
    const correctionSnap = await transaction.get(correctionRef);
    if (correctionSnap.exists()) {
      return { id: correctionSnap.id, ...correctionSnap.data() } as MatchCorrection;
    }

    const matchSnap = await transaction.get(matchRef);
    const nextMatchSnap = nextMatchRef ? await transaction.get(nextMatchRef) : null;
    if (!matchSnap.exists()) throw new Error('Partida não encontrada.');
    const persistedMatch = { id: matchSnap.id, ...matchSnap.data() } as MatchModel;
    if ((persistedMatch.correctionVersion ?? 0) !== ctx.expectedCorrectionVersion) {
      throw new Error('A partida mudou desde que a tela foi aberta. Recarregue e tente novamente.');
    }
    if (nextMatchRef) {
      if (!nextMatchSnap?.exists()) throw new Error('Próxima partida do mata-mata não encontrada.');
      const persistedNextMatch = { id: nextMatchSnap.id, ...nextMatchSnap.data() } as MatchModel;
      if (persistedNextMatch.status !== 'agendado') {
        throw new Error('Correção bloqueada: a próxima partida já começou ou terminou.');
      }
    }

    transaction.set(correctionRef, {
      ...built.correction,
      createdAt: serverTimestamp(),
    });
    transaction.update(matchRef, built.updatedMatch);

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

    return built.correction;
  });

  return {
    correction,
    updatedMatch: built.updatedMatch,
    nextMatchIdToUpdate: built.nextMatchIdToUpdate,
    nextMatchUpdate: built.nextMatchUpdate,
    activeMatchEvents: activeMatchEvents(ctx.nextEvents),
    playerUpdates: built.playerUpdates,
    idempotent: correction.id !== built.correction.id,
  };
}
