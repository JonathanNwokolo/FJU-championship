import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AttendanceResponse,
  Convocation,
  MatchAttendance,
  MatchModel,
  Player,
} from '../types';
import { db } from './firebase';
import { MOCK_DATA_ENABLED as USE_MOCK } from '../config/appConfig';
import {
  getMockDocument,
  listMockDocuments,
  setMockDocument,
  updateMockDocument,
} from '../mocks/mockDb';
import {
  attendanceDocId,
  convocationDocId,
  isMatchOpenForConvocation,
} from '../utils/convocationRules';

/**
 * Bloco 5 — Fase B. Serviço transacional de presença.
 *
 * Garantias:
 *  - ID determinístico match_attendance/{matchId}_{playerId} → sem duplicidade;
 *  - atleta responde APENAS por si (player.userId == quem responde);
 *  - exige convocação válida e aberta, e que o atleta esteja convocado;
 *  - bloqueia resposta após início/cancelamento/W.O. (relê o status ao vivo da
 *    partida E da convocação — defesa em profundidade);
 *  - versão otimista rejeita resposta obsoleta;
 *  - idempotente em retry (mesma resposta repetida não reaplica).
 */

export type AttendanceErrorCode =
  | 'invalid_input'
  | 'not_self'
  | 'convocation_missing'
  | 'convocation_closed'
  | 'not_convoked'
  | 'match_locked'
  | 'stale_version';

export class AttendanceError extends Error {
  code: AttendanceErrorCode;
  constructor(code: AttendanceErrorCode, message: string) {
    super(message);
    this.name = 'AttendanceError';
    this.code = code;
  }
}

export function getAttendanceErrorMessage(err: unknown): string {
  if (err instanceof AttendanceError) return err.message;
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  switch (code) {
    case 'permission-denied':
      return 'Você só pode responder a sua própria presença.';
    case 'unavailable':
    case 'deadline-exceeded':
    case 'network-request-failed':
      return 'Falha de conexão. Verifique sua internet e tente novamente.';
    case 'aborted':
    case 'failed-precondition':
      return 'A convocação mudou enquanto você respondia. Recarregue e tente novamente.';
    default:
      return 'Ocorreu um erro inesperado ao registrar sua presença. Tente novamente.';
  }
}

export interface RespondAttendanceContext {
  matchId: string;
  teamId: string;
  championshipId: string;
  playerId: string;
  userId: string;
  response: Exclude<AttendanceResponse, 'pending'>;
  declineReason?: string | null;
  expectedVersion: number;
}

export interface AttendanceResult {
  attendance: MatchAttendance;
  idempotent: boolean;
}

function assertInput(ctx: RespondAttendanceContext): void {
  if (!ctx.matchId || !ctx.teamId || !ctx.playerId || !ctx.userId) {
    throw new AttendanceError('invalid_input', 'Dados da presença incompletos.');
  }
  if (ctx.response !== 'confirmed' && ctx.response !== 'declined') {
    throw new AttendanceError('invalid_input', 'Resposta de presença inválida.');
  }
}

function assertCanRespond(
  match: MatchModel | null,
  convocation: Convocation | null,
  player: Player | null,
  ctx: RespondAttendanceContext,
): void {
  if (!match) {
    throw new AttendanceError('match_locked', 'Partida não encontrada.');
  }
  if (!isMatchOpenForConvocation(match.status)) {
    throw new AttendanceError(
      'match_locked',
      'A partida não está mais aberta para respostas de presença.',
    );
  }
  if (!convocation) {
    throw new AttendanceError('convocation_missing', 'Ainda não há convocação para esta partida.');
  }
  if (convocation.status !== 'open') {
    throw new AttendanceError('convocation_closed', 'A convocação está encerrada.');
  }
  if (!convocation.playerIds.includes(ctx.playerId)) {
    throw new AttendanceError('not_convoked', 'Você não foi convocado para esta partida.');
  }
  // Atleta responde apenas por si: o doc do player precisa ser do usuário atual.
  if (!player || player.userId !== ctx.userId || player.teamId !== ctx.teamId) {
    throw new AttendanceError('not_self', 'Você só pode responder a sua própria presença.');
  }
}

function buildAttendance(
  ctx: RespondAttendanceContext,
  existing: MatchAttendance | null,
  now: string,
): MatchAttendance {
  return {
    id: attendanceDocId(ctx.matchId, ctx.playerId),
    championshipId: ctx.championshipId,
    matchId: ctx.matchId,
    teamId: ctx.teamId,
    playerId: ctx.playerId,
    userId: ctx.userId,
    response: ctx.response,
    respondedAt: now,
    declineReason: ctx.response === 'declined' ? ctx.declineReason ?? null : null,
    version: (existing?.version ?? 0) + 1,
    // Responder/reconfirmar limpa a exigência de reconfirmação.
    reconfirmationRequired: false,
    previousResponse: existing?.response ?? null,
    updatedAt: now,
  };
}

/** Retry idempotente: mesma resposta, sem reconfirmação pendente → no-op. */
function isIdempotentRepeat(existing: MatchAttendance | null, ctx: RespondAttendanceContext): boolean {
  return (
    !!existing &&
    existing.response === ctx.response &&
    !existing.reconfirmationRequired &&
    (ctx.response !== 'declined' || (existing.declineReason ?? null) === (ctx.declineReason ?? null))
  );
}

function assertVersion(existing: MatchAttendance | null, expected: number): void {
  const current = existing?.version ?? 0;
  if (current !== expected) {
    throw new AttendanceError(
      'stale_version',
      'Sua resposta mudou em outro dispositivo. Recarregue e tente novamente.',
    );
  }
}

export async function respondAttendance(
  ctx: RespondAttendanceContext,
): Promise<AttendanceResult> {
  assertInput(ctx);
  const now = new Date().toISOString();
  const attId = attendanceDocId(ctx.matchId, ctx.playerId);
  const convId = convocationDocId(ctx.matchId, ctx.teamId);

  if (USE_MOCK) {
    const existing = getMockDocument<MatchAttendance>('match_attendance', attId);
    if (isIdempotentRepeat(existing, ctx)) {
      return { attendance: existing as MatchAttendance, idempotent: true };
    }
    const match = getMockDocument<MatchModel>('matches', ctx.matchId);
    const convocation = getMockDocument<Convocation>('match_convocations', convId);
    const player = getMockDocument<Player>('players', ctx.playerId);
    assertCanRespond(match, convocation, player, ctx);
    assertVersion(existing, ctx.expectedVersion);
    const attendance = buildAttendance(ctx, existing, now);
    setMockDocument('match_attendance', attId, attendance);
    return { attendance, idempotent: false };
  }

  const result = await runTransaction<AttendanceResult>(db, async (transaction) => {
    const attRef = doc(db, 'match_attendance', attId);
    const attSnap = await transaction.get(attRef);
    const existing = attSnap.exists()
      ? ({ id: attSnap.id, ...attSnap.data() } as MatchAttendance)
      : null;
    if (isIdempotentRepeat(existing, ctx)) {
      return { attendance: existing as MatchAttendance, idempotent: true };
    }

    const matchSnap = await transaction.get(doc(db, 'matches', ctx.matchId));
    const convSnap = await transaction.get(doc(db, 'match_convocations', convId));
    const playerSnap = await transaction.get(doc(db, 'players', ctx.playerId));

    const match = matchSnap.exists()
      ? ({ id: matchSnap.id, ...matchSnap.data() } as MatchModel)
      : null;
    const convocation = convSnap.exists()
      ? ({ id: convSnap.id, ...convSnap.data() } as Convocation)
      : null;
    const player = playerSnap.exists()
      ? ({ id: playerSnap.id, ...playerSnap.data() } as Player)
      : null;

    assertCanRespond(match, convocation, player, ctx);
    assertVersion(existing, ctx.expectedVersion);

    const attendance = buildAttendance(ctx, existing, now);
    transaction.set(attRef, { ...attendance, updatedAt: serverTimestamp() });
    return { attendance, idempotent: false };
  });

  return result;
}

// ── Propagação de adiamento (Bloco 5 — B5) ────────────────────────────────────
// Marca todas as respostas da partida para reconfirmação, preservando a resposta
// anterior. Idempotente: reaplicar mantém previousResponse já registrado e o flag.

export async function markAttendancesForReconfirmation(matchId: string): Promise<number> {
  if (USE_MOCK) {
    const list = listMockDocuments<MatchAttendance>('match_attendance', [
      { field: 'matchId', operator: '==', value: matchId },
    ]);
    let count = 0;
    for (const att of list) {
      if (att.reconfirmationRequired) continue;
      updateMockDocument('match_attendance', att.id, {
        reconfirmationRequired: true,
        previousResponse: att.response,
        version: (att.version ?? 0) + 1,
        updatedAt: new Date().toISOString(),
      });
      count += 1;
    }
    return count;
  }

  const snap = await getDocs(
    query(collection(db, 'match_attendance'), where('matchId', '==', matchId)),
  );
  if (snap.empty) return 0;
  const batch = writeBatch(db);
  let count = 0;
  for (const d of snap.docs) {
    const att = d.data() as MatchAttendance;
    if (att.reconfirmationRequired) continue;
    batch.update(d.ref, {
      reconfirmationRequired: true,
      previousResponse: att.response,
      version: (att.version ?? 0) + 1,
      updatedAt: serverTimestamp(),
    });
    count += 1;
  }
  if (count > 0) await batch.commit();
  return count;
}

export async function getMatchAttendances(matchId: string): Promise<MatchAttendance[]> {
  if (USE_MOCK) {
    return listMockDocuments<MatchAttendance>('match_attendance', [
      { field: 'matchId', operator: '==', value: matchId },
    ]);
  }
  const snap = await getDocs(
    query(collection(db, 'match_attendance'), where('matchId', '==', matchId)),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MatchAttendance);
}

export async function getConvocationFor(
  matchId: string,
  teamId: string,
): Promise<Convocation | null> {
  const convId = convocationDocId(matchId, teamId);
  if (USE_MOCK) {
    return getMockDocument<Convocation>('match_convocations', convId);
  }
  const snap = await getDoc(doc(db, 'match_convocations', convId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Convocation) : null;
}
