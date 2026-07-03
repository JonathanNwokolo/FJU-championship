import { MatchStatus, MatchStatusChangeType } from '../types';

/**
 * Bloco 5 — Fase A. Máquina de estados mínima da partida.
 *
 * Transições válidas (qualquer outra é proibida):
 *   agendado  → ao_vivo | adiado | cancelado | wo
 *   adiado    → agendado | cancelado | wo
 *   ao_vivo   → finalizado | cancelado   (cancelar ao vivo exige confirmação admin na UI)
 *   finalizado, cancelado, wo            → terminais (sem saída neste bloco)
 *
 * Esta é a ÚNICA fonte de verdade das transições. Serviços e telas devem consultá-la
 * em vez de comparar strings soltas.
 */
export const MATCH_STATUS_TRANSITIONS: Record<MatchStatus, MatchStatus[]> = {
  agendado: ['ao_vivo', 'adiado', 'cancelado', 'wo'],
  adiado: ['agendado', 'cancelado', 'wo'],
  ao_vivo: ['finalizado', 'cancelado'],
  finalizado: [],
  cancelado: [],
  wo: [],
};

export const TERMINAL_MATCH_STATUSES: MatchStatus[] = ['finalizado', 'cancelado', 'wo'];

export function isTerminalMatchStatus(status: MatchStatus): boolean {
  return TERMINAL_MATCH_STATUSES.includes(status);
}

export function canTransitionMatchStatus(from: MatchStatus, to: MatchStatus): boolean {
  return (MATCH_STATUS_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Estado-alvo de cada ação administrativa de status (Fase A), para validar a
 * transição a partir do status corrente da partida.
 */
export const STATUS_CHANGE_TARGET: Record<MatchStatusChangeType, MatchStatus> = {
  wo: 'wo',
  cancelamento: 'cancelado',
  adiamento: 'adiado',
  reativacao: 'agendado',
};

/**
 * Conta para a CLASSIFICAÇÃO (V/E/D/pontos/saldo): partida jogada normalmente OU W.O.
 * Adiada/cancelada/agendada/ao_vivo nunca contam como resultado final.
 */
export function matchCountsForStandings(status: MatchStatus): boolean {
  return status === 'finalizado' || status === 'wo';
}

/**
 * Partida "liquidada" para fins de progressão de rodada e checagem de pendências:
 * já tem desfecho definitivo (jogada, W.O. ou cancelada) e não trava a rodada.
 */
export function isMatchSettled(status: MatchStatus): boolean {
  return status === 'finalizado' || status === 'wo' || status === 'cancelado';
}
