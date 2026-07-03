import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import {
  Championship,
  MatchModel,
  MatchStatus,
  MatchStatusChange,
  MatchStatusChangeType,
} from '../types';
import { db } from './firebase';
import { MOCK_DATA_ENABLED as USE_MOCK } from '../config/appConfig';
import { getMockDocument, setMockDocument, updateMockDocument } from '../mocks/mockDb';
import {
  STATUS_CHANGE_TARGET,
  canTransitionMatchStatus,
  isMatchSettled,
} from '../utils/matchStatusRules';
import { hasGeneratedKnockout, normalizeMatchStage } from '../utils/groupStageStructure';

// Códigos estáveis de bloqueio das ações de status (W.O./adiamento/cancelamento).
// Mapeados para mensagem amigável na UI; servem de contrato testável do serviço.
export type MatchStatusErrorCode =
  | 'reason_required'
  | 'not_owner'
  | 'championship_missing'
  | 'championship_closed'
  | 'match_not_found'
  | 'invalid_transition'
  | 'invalid_date'
  | 'winner_required'
  | 'invalid_winner'
  | 'next_match_missing'
  | 'next_match_locked'
  | 'stale_version'
  | 'group_stage_locked_after_knockout_generation';

export class MatchStatusError extends Error {
  code: MatchStatusErrorCode;
  constructor(code: MatchStatusErrorCode, message: string) {
    super(message);
    this.name = 'MatchStatusError';
    this.code = code;
  }
}

/**
 * Converte qualquer erro do fluxo de status em mensagem amigável. Erros de negócio
 * (MatchStatusError) já têm texto próprio; erros crus do Firebase são classificados
 * por `code` para nunca vazarem ao usuário.
 */
export function getMatchStatusErrorMessage(err: unknown): string {
  if (err instanceof MatchStatusError) return err.message;

  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';

  switch (code) {
    case 'permission-denied':
      return 'Você não tem permissão para alterar o status desta partida.';
    case 'unavailable':
    case 'deadline-exceeded':
    case 'network-request-failed':
      return 'Falha de conexão. Verifique sua internet e tente novamente.';
    case 'aborted':
    case 'failed-precondition':
      return 'A partida mudou enquanto você agia. Recarregue e tente novamente.';
    default:
      return 'Ocorreu um erro inesperado ao alterar o status da partida. Tente novamente.';
  }
}

// ── Contextos ───────────────────────────────────────────────────────────────────

interface BaseStatusContext {
  changeId: string;
  organizerId: string;
  reason: string;
  match: MatchModel;
  championship: Championship;
  allMatches: MatchModel[];
  expectedStatusVersion: number;
}

export interface WalkoverContext extends BaseStatusContext {
  winnerId: string;
}

export interface PostponeContext extends BaseStatusContext {
  newScheduledAt: string;
  newLocation?: string | null;
}

export interface CancelContext extends BaseStatusContext {
  // Cancelar partida ao vivo exige confirmação administrativa (garantida na UI);
  // o serviço apenas valida que a transição ao_vivo → cancelado é permitida.
  forceFromLive?: boolean;
}

export interface ReactivateContext extends BaseStatusContext {
  newScheduledAt?: string | null;
}

export interface MatchStatusResult {
  statusChange: MatchStatusChange;
  matchUpdate: Partial<MatchModel>;
  nextMatchIdToUpdate: string | null;
  nextMatchUpdate: Partial<MatchModel> | null;
  championshipUpdate: Partial<Championship> | null;
  idempotent: boolean;
}

interface StatusChangePlan {
  target: MatchStatus;
  matchUpdate: Partial<MatchModel>;
  nextMatchIdToUpdate: string | null;
  nextMatchUpdate: Partial<MatchModel> | null;
  championshipUpdate: Partial<Championship> | null;
  statusChange: MatchStatusChange;
}

// ── Validações compartilhadas ─────────────────────────────────────────────────────

function assertCommon(ctx: BaseStatusContext, type: MatchStatusChangeType): MatchStatus {
  if (!ctx.match) {
    throw new MatchStatusError('match_not_found', 'Partida não encontrada.');
  }
  if (!ctx.championship) {
    throw new MatchStatusError('championship_missing', 'Campeonato não encontrado para a ação.');
  }
  if (ctx.reason.trim().length < 5) {
    throw new MatchStatusError('reason_required', 'Informe um motivo com pelo menos 5 caracteres.');
  }
  if (ctx.championship.organizerId !== ctx.organizerId) {
    throw new MatchStatusError('not_owner', 'Somente o organizador dono do campeonato pode agir.');
  }

  const normalizedMatch = normalizeMatchStage(ctx.match, ctx.championship);
  if (
    ctx.championship.format === 'grupos_e_mata_mata' &&
    normalizedMatch.stage === 'group' &&
    hasGeneratedKnockout(ctx.championship)
  ) {
    throw new MatchStatusError(
      'group_stage_locked_after_knockout_generation',
      'Status de partida bloqueado: a fase de grupos já foi congelada para gerar o mata-mata.',
    );
  }

  const resultExists = USE_MOCK
    ? !!getMockDocument('championship_results', ctx.championship.id)
    : false;
  if (ctx.championship.status === 'finalizado' || resultExists) {
    throw new MatchStatusError(
      'championship_closed',
      'Campeonato com fechamento definitivo não aceita mudança de status de partida.',
    );
  }

  const target = STATUS_CHANGE_TARGET[type];
  if (!canTransitionMatchStatus(ctx.match.status, target)) {
    throw new MatchStatusError(
      'invalid_transition',
      `Transição inválida: ${ctx.match.status} → ${target}.`,
    );
  }
  return target;
}

function nextStatusVersion(match: MatchModel): number {
  return (match.statusVersion ?? 0) + 1;
}

function isKnockoutMatch(ctx: BaseStatusContext): boolean {
  return ctx.championship.format === 'mata_mata' || !!ctx.match.bracketRound;
}

/**
 * Avanço estrutural do vencedor no mata-mata (idêntico ao usado em finalize/correção):
 * só toca a próxima partida se ela ainda estiver agendada; senão bloqueia.
 */
function buildKnockoutAdvance(
  ctx: BaseStatusContext,
  winnerId: string,
): { nextMatchIdToUpdate: string | null; nextMatchUpdate: Partial<MatchModel> | null } {
  if (!isKnockoutMatch(ctx) || !ctx.match.nextMatchId) {
    return { nextMatchIdToUpdate: null, nextMatchUpdate: null };
  }
  const nextMatch = ctx.allMatches.find((m) => m.id === ctx.match.nextMatchId);
  if (!nextMatch) {
    throw new MatchStatusError('next_match_missing', 'Próxima partida do mata-mata não encontrada.');
  }
  if (nextMatch.status !== 'agendado') {
    throw new MatchStatusError(
      'next_match_locked',
      'Bloqueado: a próxima partida do mata-mata já começou ou terminou.',
    );
  }
  const slot = (ctx.match.bracketPosition ?? 0) % 2 === 0 ? 'homeTeamId' : 'awayTeamId';
  return { nextMatchIdToUpdate: nextMatch.id, nextMatchUpdate: { [slot]: winnerId } };
}

/**
 * Quando a partida liquida (W.O./cancelamento) o último jogo pendente da rodada
 * corrente, avança currentRound — mesmo cuidado do finalize. Só aplica se a partida
 * pertence à rodada corrente.
 */
function buildRoundAdvance(
  ctx: BaseStatusContext,
  newStatus: MatchStatus,
): Partial<Championship> | null {
  if (ctx.championship.currentRound !== ctx.match.round) return null;
  const roundMatches = ctx.allMatches
    .filter((m) => m.championshipId === ctx.championship.id && m.round === ctx.match.round)
    .map((m) => (m.id === ctx.match.id ? { ...m, status: newStatus } : m));
  if (roundMatches.length === 0) return null;
  if (roundMatches.every((m) => isMatchSettled(m.status))) {
    return { currentRound: ctx.match.round + 1 };
  }
  return null;
}

function baseStatusChange(
  ctx: BaseStatusContext,
  type: MatchStatusChangeType,
  target: MatchStatus,
  now: string,
  overrides: Partial<MatchStatusChange>,
): MatchStatusChange {
  return {
    id: ctx.changeId,
    championshipId: ctx.match.championshipId,
    matchId: ctx.match.id,
    organizerId: ctx.organizerId,
    type,
    reason: ctx.reason.trim(),
    beforeStatus: ctx.match.status,
    afterStatus: target,
    beforeDate: ctx.match.scheduledAt ?? null,
    afterDate: ctx.match.scheduledAt ?? null,
    beforeScore: { homeScore: ctx.match.homeScore ?? null, awayScore: ctx.match.awayScore ?? null },
    afterScore: { homeScore: ctx.match.homeScore ?? null, awayScore: ctx.match.awayScore ?? null },
    winnerId: null,
    createdAt: now,
    version: nextStatusVersion(ctx.match),
    derivedEffects: ['status'],
    ...overrides,
  };
}

// ── Builders por ação ─────────────────────────────────────────────────────────────

function buildWalkover(ctx: WalkoverContext, now: string): StatusChangePlan {
  const target = assertCommon(ctx, 'wo');
  if (!ctx.winnerId) {
    throw new MatchStatusError('winner_required', 'Escolha o time vencedor do W.O.');
  }
  if (ctx.winnerId !== ctx.match.homeTeamId && ctx.winnerId !== ctx.match.awayTeamId) {
    throw new MatchStatusError('invalid_winner', 'O vencedor precisa ser um dos times da partida.');
  }

  const homeScore = ctx.winnerId === ctx.match.homeTeamId ? 3 : 0;
  const awayScore = ctx.winnerId === ctx.match.awayTeamId ? 3 : 0;
  const version = nextStatusVersion(ctx.match);

  const { nextMatchIdToUpdate, nextMatchUpdate } = buildKnockoutAdvance(ctx, ctx.winnerId);
  const championshipUpdate = buildRoundAdvance(ctx, 'wo');

  const matchUpdate: Partial<MatchModel> = {
    status: 'wo',
    resultSource: 'wo',
    homeScore,
    awayScore,
    winnerId: ctx.winnerId,
    finishedAt: now,
    statusVersion: version,
    lastStatusChangeId: ctx.changeId,
    updatedAt: now,
  };

  const statusChange = baseStatusChange(ctx, 'wo', target, now, {
    afterScore: { homeScore, awayScore },
    winnerId: ctx.winnerId,
    derivedEffects: [
      'status',
      'placar',
      'classificacao',
      'vencedor',
      ...(isKnockoutMatch(ctx) ? ['mata_mata'] : []),
    ],
  });

  return { target, matchUpdate, nextMatchIdToUpdate, nextMatchUpdate, championshipUpdate, statusChange };
}

function buildPostpone(ctx: PostponeContext, now: string): StatusChangePlan {
  const target = assertCommon(ctx, 'adiamento');
  const parsed = ctx.newScheduledAt ? new Date(ctx.newScheduledAt) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    throw new MatchStatusError('invalid_date', 'Informe uma nova data e horário válidos.');
  }
  if (parsed.getTime() <= Date.now()) {
    throw new MatchStatusError('invalid_date', 'A nova data não pode estar no passado.');
  }

  const version = nextStatusVersion(ctx.match);
  const matchUpdate: Partial<MatchModel> = {
    status: 'adiado',
    scheduledAt: ctx.newScheduledAt,
    statusVersion: version,
    lastStatusChangeId: ctx.changeId,
    updatedAt: now,
  };
  if (ctx.newLocation !== undefined) {
    matchUpdate.location = ctx.newLocation;
  }

  const statusChange = baseStatusChange(ctx, 'adiamento', target, now, {
    afterDate: ctx.newScheduledAt,
    // 'reconfirmar_presenca' é tratado na Fase B (convocação/presença); registrado
    // aqui como efeito derivado previsto da auditoria.
    derivedEffects: ['status', 'data', 'reconfirmar_presenca'],
  });

  return {
    target,
    matchUpdate,
    nextMatchIdToUpdate: null,
    nextMatchUpdate: null,
    championshipUpdate: null,
    statusChange,
  };
}

function buildCancel(ctx: CancelContext, now: string): StatusChangePlan {
  const target = assertCommon(ctx, 'cancelamento');

  const version = nextStatusVersion(ctx.match);
  const matchUpdate: Partial<MatchModel> = {
    status: 'cancelado',
    statusVersion: version,
    lastStatusChangeId: ctx.changeId,
    updatedAt: now,
  };

  const championshipUpdate = buildRoundAdvance(ctx, 'cancelado');

  const statusChange = baseStatusChange(ctx, 'cancelamento', target, now, {
    // 'encerra_convocacao' é tratado na Fase B; registrado como efeito previsto.
    derivedEffects: ['status', 'encerra_convocacao'],
  });

  return {
    target,
    matchUpdate,
    nextMatchIdToUpdate: null,
    nextMatchUpdate: null,
    championshipUpdate,
    statusChange,
  };
}

function buildReactivate(ctx: ReactivateContext, now: string): StatusChangePlan {
  const target = assertCommon(ctx, 'reativacao');
  let afterDate = ctx.match.scheduledAt ?? null;

  const version = nextStatusVersion(ctx.match);
  const matchUpdate: Partial<MatchModel> = {
    status: 'agendado',
    statusVersion: version,
    lastStatusChangeId: ctx.changeId,
    updatedAt: now,
  };
  if (ctx.newScheduledAt != null) {
    const parsed = new Date(ctx.newScheduledAt);
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      throw new MatchStatusError('invalid_date', 'A nova data não pode estar no passado.');
    }
    matchUpdate.scheduledAt = ctx.newScheduledAt;
    afterDate = ctx.newScheduledAt;
  }

  const statusChange = baseStatusChange(ctx, 'reativacao', target, now, {
    afterDate,
    derivedEffects: ['status'],
  });

  return {
    target,
    matchUpdate,
    nextMatchIdToUpdate: null,
    nextMatchUpdate: null,
    championshipUpdate: null,
    statusChange,
  };
}

// ── Commit (mock + real) ──────────────────────────────────────────────────────────

async function commitStatusChange(
  ctx: BaseStatusContext,
  plan: StatusChangePlan,
): Promise<MatchStatusResult> {
  if (USE_MOCK) {
    const existing = getMockDocument<MatchStatusChange>('match_status_changes', ctx.changeId);
    if (existing) {
      return {
        statusChange: existing,
        matchUpdate: {},
        nextMatchIdToUpdate: null,
        nextMatchUpdate: null,
        championshipUpdate: null,
        idempotent: true,
      };
    }

    setMockDocument('match_status_changes', ctx.changeId, plan.statusChange);
    updateMockDocument('matches', ctx.match.id, plan.matchUpdate as Record<string, unknown>);
    if (plan.nextMatchIdToUpdate && plan.nextMatchUpdate) {
      updateMockDocument('matches', plan.nextMatchIdToUpdate, plan.nextMatchUpdate);
    }
    if (plan.championshipUpdate) {
      updateMockDocument('championships', ctx.championship.id, plan.championshipUpdate);
    }

    return {
      statusChange: plan.statusChange,
      matchUpdate: plan.matchUpdate,
      nextMatchIdToUpdate: plan.nextMatchIdToUpdate,
      nextMatchUpdate: plan.nextMatchUpdate,
      championshipUpdate: plan.championshipUpdate,
      idempotent: false,
    };
  }

  // Bloqueio antecipado obrigatório: championship_results impede qualquer mudança.
  const resultRef = doc(db, 'championship_results', ctx.championship.id);
  const resultSnap = await getDoc(resultRef);
  if (resultSnap.exists()) {
    throw new MatchStatusError(
      'championship_closed',
      'Campeonato com fechamento definitivo não aceita mudança de status de partida.',
    );
  }

  const txResult = await runTransaction<{ statusChange: MatchStatusChange; idempotent: boolean }>(
    db,
    async (transaction) => {
      const changeRef = doc(db, 'match_status_changes', ctx.changeId);
      const matchRef = doc(db, 'matches', ctx.match.id);
      const champRef = doc(db, 'championships', ctx.championship.id);
      const nextMatchRef = plan.nextMatchIdToUpdate
        ? doc(db, 'matches', plan.nextMatchIdToUpdate)
        : null;

      const changeSnap = await transaction.get(changeRef);
      if (changeSnap.exists()) {
        return {
          statusChange: { id: changeSnap.id, ...changeSnap.data() } as MatchStatusChange,
          idempotent: true,
        };
      }

      const matchSnap = await transaction.get(matchRef);
      const champSnap = await transaction.get(champRef);
      const nextMatchSnap = nextMatchRef ? await transaction.get(nextMatchRef) : null;

      if (!matchSnap.exists()) {
        throw new MatchStatusError('match_not_found', 'Partida não encontrada.');
      }
      const persisted = { id: matchSnap.id, ...matchSnap.data() } as MatchModel;
      if ((persisted.statusVersion ?? 0) !== ctx.expectedStatusVersion) {
        throw new MatchStatusError(
          'stale_version',
          'A partida mudou desde que a tela foi aberta. Recarregue e tente novamente.',
        );
      }
      if (!canTransitionMatchStatus(persisted.status, plan.target)) {
        throw new MatchStatusError(
          'invalid_transition',
          `Transição inválida: ${persisted.status} → ${plan.target}.`,
        );
      }
      if (nextMatchRef) {
        if (!nextMatchSnap?.exists()) {
          throw new MatchStatusError(
            'next_match_missing',
            'Próxima partida do mata-mata não encontrada.',
          );
        }
        const persistedNext = { id: nextMatchSnap.id, ...nextMatchSnap.data() } as MatchModel;
        if (persistedNext.status !== 'agendado') {
          throw new MatchStatusError(
            'next_match_locked',
            'Bloqueado: a próxima partida do mata-mata já começou ou terminou.',
          );
        }
      }

      transaction.set(changeRef, { ...plan.statusChange, createdAt: serverTimestamp() });
      transaction.update(matchRef, { ...plan.matchUpdate, updatedAt: serverTimestamp() });
      if (nextMatchRef && plan.nextMatchUpdate) {
        transaction.update(nextMatchRef, plan.nextMatchUpdate);
      }
      if (plan.championshipUpdate) {
        const champData = champSnap.exists() ? (champSnap.data() as Championship) : null;
        // Só avança o cache currentRound se o persistido ainda está na rodada da partida.
        if (champData && champData.currentRound === ctx.match.round) {
          transaction.update(champRef, plan.championshipUpdate);
        }
      }

      return { statusChange: plan.statusChange, idempotent: false };
    },
  );

  return {
    statusChange: txResult.statusChange,
    matchUpdate: plan.matchUpdate,
    nextMatchIdToUpdate: plan.nextMatchIdToUpdate,
    nextMatchUpdate: plan.nextMatchUpdate,
    championshipUpdate: plan.championshipUpdate,
    idempotent: txResult.idempotent,
  };
}

// ── API pública ────────────────────────────────────────────────────────────────────

export async function applyWalkover(ctx: WalkoverContext): Promise<MatchStatusResult> {
  const now = new Date().toISOString();
  return commitStatusChange(ctx, buildWalkover(ctx, now));
}

export async function applyPostpone(ctx: PostponeContext): Promise<MatchStatusResult> {
  const now = new Date().toISOString();
  return commitStatusChange(ctx, buildPostpone(ctx, now));
}

export async function applyCancel(ctx: CancelContext): Promise<MatchStatusResult> {
  const now = new Date().toISOString();
  return commitStatusChange(ctx, buildCancel(ctx, now));
}

export async function applyReactivate(ctx: ReactivateContext): Promise<MatchStatusResult> {
  const now = new Date().toISOString();
  return commitStatusChange(ctx, buildReactivate(ctx, now));
}
