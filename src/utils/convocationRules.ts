import {
  AttendanceResponse,
  Convocation,
  ConvocationStatus,
  MatchAttendance,
  MatchModel,
  Player,
} from '../types';
import { isActiveRosterPlayer } from './teamRules';

/**
 * Bloco 5 — Fase B. Regras puras de convocação/presença (sem I/O), para que a
 * elegibilidade e o agrupamento sejam testáveis e reaproveitados por serviços,
 * telas e mocks sem duplicação.
 */

// ── IDs determinísticos ───────────────────────────────────────────────────────
// Convocação é única por (partida, time); presença é única por (partida, jogador).
// IDs determinísticos garantem idempotência e impedem duplicidade (mesmo padrão de
// team_memberships/{teamId}_{uid}).

export function convocationDocId(matchId: string, teamId: string): string {
  return `${matchId}_${teamId}`;
}

export function attendanceDocId(matchId: string, playerId: string): string {
  return `${matchId}_${playerId}`;
}

// ── Estados da partida que aceitam convocação/presença ────────────────────────
// "Ainda não começou": somente agendado ou adiado. ao_vivo/finalizado/cancelado/wo
// bloqueiam edição de convocação e resposta de presença.
export function isMatchOpenForConvocation(status: MatchModel['status']): boolean {
  return status === 'agendado' || status === 'adiado';
}

// ── Elegibilidade ─────────────────────────────────────────────────────────────

export type EligibilityReason =
  | 'not_in_team'
  | 'inactive'
  | 'wrong_championship'
  | 'suspended'
  | 'injured'
  | 'in_other_team'
  | 'match_started'
  | 'convocation_closed';

export interface EligibilityContext {
  // Suspensão para a rodada da partida (status persistido OU ciclo de cartões).
  // Calculado pelo chamador (services/statsService.getPlayerSuspensionReason +
  // player.status), passado já resolvido para manter este helper puro.
  suspended: boolean;
  // Atleta pertence a outro time ativo no MESMO campeonato (resolvido pelo chamador,
  // pois exige varrer a lista de players — fora do escopo de uma função pura unitária).
  inOtherTeam?: boolean;
  // Convocação ainda aberta para edição (status 'open' e dentro do prazo, se houver).
  convocationOpen: boolean;
}

export interface EligibilityResult {
  eligible: boolean;
  reason: EligibilityReason | null;
}

const ELIGIBLE: EligibilityResult = { eligible: true, reason: null };

function deny(reason: EligibilityReason): EligibilityResult {
  return { eligible: false, reason };
}

/**
 * Decide se um atleta pode ser convocado para uma partida específica. Pode ser
 * convocado apenas se:
 *  - pertence ativamente ao time (mandante ou visitante da partida);
 *  - está no elenco ativo (não 'sem_time' nem 'removido');
 *  - está inscrito no MESMO campeonato da partida;
 *  - não está suspenso para a rodada;
 *  - não está lesionado (DECISÃO Fase B: lesionado BLOQUEIA a convocação — coerente
 *    com o registro de eventos, que já impede atleta lesionado de pontuar);
 *  - não pertence a outro time;
 *  - a partida ainda não começou;
 *  - a convocação ainda está aberta.
 */
export function canPlayerBeCalledUp(
  player: Pick<Player, 'teamId' | 'championshipId' | 'status'>,
  match: Pick<MatchModel, 'homeTeamId' | 'awayTeamId' | 'championshipId' | 'status'>,
  ctx: EligibilityContext,
): EligibilityResult {
  const belongsToMatchTeam =
    player.teamId === match.homeTeamId || player.teamId === match.awayTeamId;
  if (!belongsToMatchTeam) return deny('not_in_team');
  if (!isActiveRosterPlayer(player)) return deny('inactive');
  if (player.championshipId && player.championshipId !== match.championshipId) {
    return deny('wrong_championship');
  }
  if (player.status === 'lesionado') return deny('injured');
  if (ctx.suspended) return deny('suspended');
  if (ctx.inOtherTeam) return deny('in_other_team');
  if (!isMatchOpenForConvocation(match.status)) return deny('match_started');
  if (!ctx.convocationOpen) return deny('convocation_closed');
  return ELIGIBLE;
}

// ── Convocação aberta para edição ─────────────────────────────────────────────

export function isConvocationEditable(
  convocation: Pick<Convocation, 'status'> | null | undefined,
): boolean {
  return !convocation || convocation.status === 'open';
}

export function isConvocationOpenForResponses(
  convocation: Pick<Convocation, 'status'> | null | undefined,
): boolean {
  return !!convocation && convocation.status === 'open';
}

/**
 * Bloco 5 — Fase B / B9. Um atleta só recebe eventos da partida se estiver
 * convocado. Compatibilidade: partidas anteriores ao recurso de convocação não têm
 * documento de convocação — nesse caso (convocation == null) caímos no comportamento
 * legado (qualquer ativo não-suspenso pode receber evento). Quando a convocação
 * existe, ela é a fonte de verdade e o não-convocado é bloqueado.
 */
export function isPlayerCalledUp(
  convocation: Pick<Convocation, 'playerIds'> | null | undefined,
  playerId: string,
): boolean {
  if (!convocation) return true; // legado: sem convocação, não bloqueia
  return convocation.playerIds.includes(playerId);
}

// ── Agrupamento para a PreMatch ───────────────────────────────────────────────

export type RosterBucket =
  | 'confirmed'
  | 'pending'
  | 'declined'
  | 'not_called'
  | 'suspended'
  | 'ineligible';

export interface GroupedRosterEntry {
  player: Player;
  bucket: RosterBucket;
  attendance: MatchAttendance | null;
  reconfirmationRequired: boolean;
}

/**
 * Classifica o elenco ativo de um time para a operação da partida. Usa a convocação
 * real (playerIds) e as respostas de presença (match_attendance). Suspensos e
 * inelegíveis são separados para que a tela mostre o motivo sem permitir operação.
 */
export function groupTeamRoster(
  roster: Player[],
  convocation: Pick<Convocation, 'playerIds' | 'requiresReconfirmation'> | null,
  attendanceByPlayer: Map<string, MatchAttendance>,
  suspendedIds: Set<string>,
  ineligibleIds: Set<string> = new Set(),
): GroupedRosterEntry[] {
  const calledUp = new Set(convocation?.playerIds ?? []);

  return roster.map((player) => {
    const attendance = attendanceByPlayer.get(player.id) ?? null;
    const reconfirmationRequired =
      !!attendance?.reconfirmationRequired || !!convocation?.requiresReconfirmation;

    let bucket: RosterBucket;
    if (suspendedIds.has(player.id)) {
      bucket = 'suspended';
    } else if (ineligibleIds.has(player.id)) {
      bucket = 'ineligible';
    } else if (!calledUp.has(player.id)) {
      bucket = 'not_called';
    } else {
      // Reconfirmação pendente conta como "pending" operacionalmente até o atleta
      // reconfirmar, mesmo que a resposta anterior fosse 'confirmed'.
      const effective: AttendanceResponse =
        reconfirmationRequired && attendance?.response === 'confirmed'
          ? 'pending'
          : attendance?.response ?? 'pending';
      bucket =
        effective === 'confirmed' ? 'confirmed' : effective === 'declined' ? 'declined' : 'pending';
    }

    return { player, bucket, attendance, reconfirmationRequired };
  });
}

// ── Estado visual efetivo (derivado do status real da partida) ────────────────
// Garante consistência visual mesmo quando applyConvocationStatusEffect ainda
// não propagou (falha temporária ou latência). A tela nunca deve confiar
// exclusivamente no status persistido da convocação: o status da partida tem
// prioridade nos casos terminais/transitórios.

export interface EffectiveConvocationState {
  effectiveStatus: ConvocationStatus;
  requiresReconfirmation: boolean;
  /** true quando a partida não aceita mais respostas ou edição de convocação. */
  responseBlocked: boolean;
}

/**
 * Deriva o estado visual da convocação a partir do status real da partida + doc
 * persistido. Regras:
 *  - cancelado → cancelled, resposta bloqueada (independente do doc)
 *  - wo        → completed, resposta bloqueada (independente do doc)
 *  - ao_vivo / finalizado → usa status do doc, mas bloqueia resposta
 *  - adiado    → requiresReconfirmation = true mesmo que doc não reflita ainda
 *  - agendado  → usa o doc como fonte de verdade
 */
export function deriveConvocationEffectiveStatus(
  matchStatus: MatchModel['status'],
  convocation: Pick<Convocation, 'status' | 'requiresReconfirmation'> | null,
): EffectiveConvocationState {
  if (matchStatus === 'cancelado') {
    return { effectiveStatus: 'cancelled', requiresReconfirmation: false, responseBlocked: true };
  }
  if (matchStatus === 'wo') {
    return { effectiveStatus: 'completed', requiresReconfirmation: false, responseBlocked: true };
  }
  const persisted: ConvocationStatus = convocation?.status ?? 'open';
  const persistedReconf = convocation?.requiresReconfirmation ?? false;
  if (matchStatus === 'ao_vivo' || matchStatus === 'finalizado') {
    return { effectiveStatus: persisted, requiresReconfirmation: persistedReconf, responseBlocked: true };
  }
  if (matchStatus === 'adiado') {
    return { effectiveStatus: persisted, requiresReconfirmation: true, responseBlocked: false };
  }
  // agendado
  return { effectiveStatus: persisted, requiresReconfirmation: persistedReconf, responseBlocked: false };
}
