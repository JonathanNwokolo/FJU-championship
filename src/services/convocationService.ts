import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Convocation, ConvocationStatus, MatchModel, Player } from '../types';
import { db } from './firebase';
import { MOCK_DATA_ENABLED as USE_MOCK } from '../config/appConfig';
import { getMockDocument, setMockDocument } from '../mocks/mockDb';
import { isActiveRosterPlayer } from '../utils/teamRules';
import { convocationDocId, isMatchOpenForConvocation } from '../utils/convocationRules';

/**
 * Bloco 5 — Fase B. Serviço transacional de convocação (por partida).
 *
 * Garantias:
 *  - ID determinístico match_convocations/{matchId}_{teamId} → sem duplicidade;
 *  - versionamento otimista (expectedVersion) → impede dois saves concorrentes;
 *  - bloqueio após início da partida (status fora de agendado/adiado);
 *  - validação server-side de cada convocado (pertence ao time, ativo, mesmo
 *    campeonato, não lesionado, não suspenso) — não confia só na tela;
 *  - nada é apagado fisicamente: editar/fechar preserva o documento e versiona.
 */

export type ConvocationErrorCode =
  | 'not_captain'
  | 'match_not_found'
  | 'convocation_locked'
  | 'empty_roster'
  | 'invalid_input'
  | 'ineligible_player'
  | 'stale_version';

export class ConvocationError extends Error {
  code: ConvocationErrorCode;
  playerId?: string;
  constructor(code: ConvocationErrorCode, message: string, playerId?: string) {
    super(message);
    this.name = 'ConvocationError';
    this.code = code;
    this.playerId = playerId;
  }
}

export function getConvocationErrorMessage(err: unknown): string {
  if (err instanceof ConvocationError) return err.message;
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  switch (code) {
    case 'permission-denied':
      return 'Você não tem permissão para gerenciar esta convocação.';
    case 'unavailable':
    case 'deadline-exceeded':
    case 'network-request-failed':
      return 'Falha de conexão. Verifique sua internet e tente novamente.';
    case 'aborted':
    case 'failed-precondition':
      return 'A convocação mudou enquanto você editava. Recarregue e tente novamente.';
    default:
      return 'Ocorreu um erro inesperado ao salvar a convocação. Tente novamente.';
  }
}

export interface SaveConvocationContext {
  matchId: string;
  teamId: string;
  championshipId: string;
  captainId: string;
  playerIds: string[];
  // Suspensos para a rodada (status persistido OU ciclo de cartões), resolvidos
  // pelo chamador. Convocar qualquer um deles é bloqueado server-side.
  suspendedPlayerIds?: string[];
  responseDeadline?: string | null;
  // Versão esperada da convocação atual (0 quando ainda não existe).
  expectedVersion: number;
}

export interface ConvocationResult {
  convocation: Convocation;
  idempotent: boolean;
}

function dedupe(ids: string[]): string[] {
  return Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.length > 0)));
}

function assertSaveInput(ctx: SaveConvocationContext): string[] {
  if (!ctx.captainId) {
    throw new ConvocationError('not_captain', 'Apenas o capitão do time pode convocar.');
  }
  if (!ctx.matchId || !ctx.teamId || !ctx.championshipId) {
    throw new ConvocationError('invalid_input', 'Dados da convocação incompletos.');
  }
  const playerIds = dedupe(ctx.playerIds);
  if (playerIds.length === 0) {
    throw new ConvocationError('empty_roster', 'Selecione ao menos um atleta para convocar.');
  }
  return playerIds;
}

/** Validação de elegibilidade contra o documento real do atleta. */
function assertPlayerEligible(
  player: Player | null,
  playerId: string,
  ctx: SaveConvocationContext,
  suspended: Set<string>,
): void {
  if (!player) {
    throw new ConvocationError('ineligible_player', 'Atleta convocado não encontrado.', playerId);
  }
  if (player.teamId !== ctx.teamId || !isActiveRosterPlayer(player)) {
    throw new ConvocationError(
      'ineligible_player',
      'Atleta convocado não pertence ativamente ao time.',
      playerId,
    );
  }
  if (player.championshipId && player.championshipId !== ctx.championshipId) {
    throw new ConvocationError(
      'ineligible_player',
      'Atleta convocado não está inscrito neste campeonato.',
      playerId,
    );
  }
  if (player.status === 'lesionado') {
    throw new ConvocationError('ineligible_player', 'Atleta lesionado não pode ser convocado.', playerId);
  }
  if (suspended.has(playerId)) {
    throw new ConvocationError('ineligible_player', 'Atleta suspenso não pode ser convocado.', playerId);
  }
}

function buildConvocation(
  ctx: SaveConvocationContext,
  playerIds: string[],
  existing: Convocation | null,
  now: string,
): Convocation {
  const version = (existing?.version ?? 0) + 1;
  return {
    id: convocationDocId(ctx.matchId, ctx.teamId),
    championshipId: ctx.championshipId,
    matchId: ctx.matchId,
    teamId: ctx.teamId,
    captainId: ctx.captainId,
    playerIds,
    status: 'open',
    responseDeadline: ctx.responseDeadline ?? existing?.responseDeadline ?? null,
    requiresReconfirmation: existing?.requiresReconfirmation ?? false,
    version,
    previousVersion: existing?.version ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    cancelledAt: existing?.cancelledAt ?? null,
    cancellationReason: existing?.cancellationReason ?? null,
  };
}

function assertMatchOpen(match: MatchModel | null): void {
  if (!match) {
    throw new ConvocationError('match_not_found', 'Partida não encontrada.');
  }
  if (!isMatchOpenForConvocation(match.status)) {
    throw new ConvocationError(
      'convocation_locked',
      'A partida já começou ou foi encerrada; a convocação não pode mais ser editada.',
    );
  }
}

function assertVersion(existing: Convocation | null, expected: number): void {
  const current = existing?.version ?? 0;
  if (current !== expected) {
    throw new ConvocationError(
      'stale_version',
      'A convocação mudou desde que a tela foi aberta. Recarregue e tente novamente.',
    );
  }
  if (existing && existing.status !== 'open') {
    throw new ConvocationError(
      'convocation_locked',
      'Esta convocação já foi encerrada e não pode ser editada.',
    );
  }
}

/**
 * Cria ou edita a convocação de um time para uma partida. Idempotente por ID
 * determinístico + guarda de versão.
 */
export async function saveConvocation(ctx: SaveConvocationContext): Promise<ConvocationResult> {
  const playerIds = assertSaveInput(ctx);
  const suspended = new Set(ctx.suspendedPlayerIds ?? []);
  const now = new Date().toISOString();
  const convId = convocationDocId(ctx.matchId, ctx.teamId);

  if (USE_MOCK) {
    const match = getMockDocument<MatchModel>('matches', ctx.matchId);
    assertMatchOpen(match);
    const existing = getMockDocument<Convocation>('match_convocations', convId);
    assertVersion(existing, ctx.expectedVersion);
    for (const pid of playerIds) {
      assertPlayerEligible(getMockDocument<Player>('players', pid), pid, ctx, suspended);
    }
    const convocation = buildConvocation(ctx, playerIds, existing, now);
    setMockDocument('match_convocations', convId, convocation);
    return { convocation, idempotent: false };
  }

  const convocation = await runTransaction<Convocation>(db, async (transaction) => {
    const convRef = doc(db, 'match_convocations', convId);
    const matchRef = doc(db, 'matches', ctx.matchId);

    const convSnap = await transaction.get(convRef);
    const matchSnap = await transaction.get(matchRef);

    const match = matchSnap.exists()
      ? ({ id: matchSnap.id, ...matchSnap.data() } as MatchModel)
      : null;
    assertMatchOpen(match);

    const existing = convSnap.exists()
      ? ({ id: convSnap.id, ...convSnap.data() } as Convocation)
      : null;
    assertVersion(existing, ctx.expectedVersion);

    // Validação server-side de cada convocado (lê o doc real do atleta).
    for (const pid of playerIds) {
      const playerSnap = await transaction.get(doc(db, 'players', pid));
      const player = playerSnap.exists()
        ? ({ id: playerSnap.id, ...playerSnap.data() } as Player)
        : null;
      assertPlayerEligible(player, pid, ctx, suspended);
    }

    const built = buildConvocation(ctx, playerIds, existing, now);
    transaction.set(convRef, { ...built, updatedAt: serverTimestamp() });
    return built;
  });

  return { convocation, idempotent: false };
}

export interface CloseConvocationContext {
  matchId: string;
  teamId: string;
  captainId: string;
  expectedVersion: number;
}

/** Fecha a convocação (open → closed), bloqueando novas respostas de presença. */
export async function closeConvocation(ctx: CloseConvocationContext): Promise<ConvocationResult> {
  const now = new Date().toISOString();
  const convId = convocationDocId(ctx.matchId, ctx.teamId);

  const apply = (existing: Convocation | null): Convocation => {
    if (!existing) {
      throw new ConvocationError('match_not_found', 'Convocação não encontrada.');
    }
    if (existing.status !== 'open') {
      throw new ConvocationError('convocation_locked', 'A convocação já está encerrada.');
    }
    assertVersion(existing, ctx.expectedVersion);
    return {
      ...existing,
      status: 'closed',
      previousVersion: existing.version,
      version: existing.version + 1,
      updatedAt: now,
    };
  };

  if (USE_MOCK) {
    const existing = getMockDocument<Convocation>('match_convocations', convId);
    const next = apply(existing);
    setMockDocument('match_convocations', convId, next);
    return { convocation: next, idempotent: false };
  }

  const convocation = await runTransaction<Convocation>(db, async (transaction) => {
    const convRef = doc(db, 'match_convocations', convId);
    const snap = await transaction.get(convRef);
    const existing = snap.exists()
      ? ({ id: snap.id, ...snap.data() } as Convocation)
      : null;
    const next = apply(existing);
    transaction.set(convRef, { ...next, updatedAt: serverTimestamp() });
    return next;
  });
  return { convocation, idempotent: false };
}

// ── Propagação de status da partida (Bloco 5 — Fase B / B5) ───────────────────
// Reaproveitada pela integração com adiamento/cancelamento/W.O.. Idempotente:
// reaplicar o mesmo efeito não altera o resultado. Não exige versão (efeito
// derivado do status oficial da partida, já validado pelo matchStatusService).

type StatusEffect = {
  status: ConvocationStatus;
  requiresReconfirmation: boolean;
  cancellation?: { reason: string };
};

const STATUS_EFFECTS: Record<'adiamento' | 'cancelamento' | 'wo', StatusEffect> = {
  // Adiado: mantém a convocação aberta, mas exige reconfirmação.
  adiamento: { status: 'open', requiresReconfirmation: true },
  // Cancelado: encerra a convocação e bloqueia respostas (preserva o documento).
  cancelamento: { status: 'cancelled', requiresReconfirmation: false },
  // W.O.: conclui a convocação, preserva respostas, bloqueia novas.
  wo: { status: 'completed', requiresReconfirmation: false },
};

/**
 * Aplica a um único documento de convocação o efeito de uma mudança de status da
 * partida. Idempotente. Não apaga nada: cancelamento/W.O. apenas mudam status.
 */
export async function applyConvocationStatusEffect(
  matchId: string,
  teamId: string,
  type: 'adiamento' | 'cancelamento' | 'wo',
  reason?: string,
): Promise<Convocation | null> {
  const convId = convocationDocId(matchId, teamId);
  const effect = STATUS_EFFECTS[type];
  const now = new Date().toISOString();

  const existing = USE_MOCK
    ? getMockDocument<Convocation>('match_convocations', convId)
    : await getDoc(doc(db, 'match_convocations', convId)).then((s) =>
        s.exists() ? ({ id: s.id, ...s.data() } as Convocation) : null,
      );
  if (!existing) return null;
  // Cancelado/concluído são terminais: não regridem para 'open' por um adiamento.
  if (existing.status === 'cancelled' || existing.status === 'completed') return existing;

  const next: Convocation = {
    ...existing,
    status: effect.status,
    requiresReconfirmation: effect.requiresReconfirmation || existing.requiresReconfirmation,
    previousVersion: existing.version,
    version: existing.version + 1,
    updatedAt: now,
    cancelledAt: type === 'cancelamento' ? now : existing.cancelledAt ?? null,
    cancellationReason:
      type === 'cancelamento' ? reason ?? existing.cancellationReason ?? null : existing.cancellationReason ?? null,
  };

  if (USE_MOCK) {
    setMockDocument('match_convocations', convId, next);
  } else {
    await runTransaction(db, async (transaction) => {
      const ref = doc(db, 'match_convocations', convId);
      transaction.set(ref, { ...next, updatedAt: serverTimestamp() });
    });
  }
  return next;
}
