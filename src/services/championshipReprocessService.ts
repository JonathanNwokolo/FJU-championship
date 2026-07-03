/**
 * Championship Reprocess Service (Bloco 11 — Fase 2)
 *
 * Reprocessa, de forma transacional, auditável e idempotente, um campeonato
 * ENCERRADO (com `championship_results`) depois que uma correção controlada mudou
 * uma partida. Integra o domínio PURO da Fase 1 (`computeChampionshipOutcome` /
 * `diffChampionshipOutcome`) ao fluxo real:
 *
 *  - recomputa o desfecho a partir do estado atual (pós-correção);
 *  - calcula o diff contra o resultado congelado;
 *  - se não muda nada, registra o reprocessamento sem alteração destrutiva;
 *  - se muda, atualiza championship_results, player_history, career_stats,
 *    all_time_rankings e reconcilia achievements (conceder / revogar soft);
 *  - grava um log imutável `championship_reprocess_logs/{reprocessId}` com id
 *    determinístico.
 *
 * Concorrência e idempotência são garantidas por transação + pré-condições:
 *  - id determinístico do log → retry não duplica;
 *  - versão de reprocessamento (`reprocessVersion`) em championship_results;
 *  - digest do resultado congelado (detecta reprocessamento concorrente / conflito).
 *
 * O gatilho (chamar após a correção persistida) e a UI ficam para a Fase 3.
 */
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { MOCK_DATA_ENABLED as USE_MOCK } from '../config/appConfig';
import {
  getMockDocument,
  setMockDocument,
  updateMockDocument,
} from '../mocks/mockDb';
import type { ChampionshipReprocessLog, ChampionshipResultData } from '../types';
import {
  buildReprocessPlan,
  digestOutcomeResult,
  ReprocessError,
  ReprocessInput,
  ReprocessPlan,
} from '../utils/championshipReprocessing';

export type ReprocessServiceInput = Omit<ReprocessInput, 'now'>;

export interface ReprocessResult {
  reprocessId: string;
  reprocessVersion: number;
  changed: boolean;
  idempotent: boolean;
  log: ChampionshipReprocessLog;
  plan: ReprocessPlan;
}

const ACH_PATH = (playerId: string) => `players/${playerId}/achievements`;

/**
 * Converte qualquer erro do reprocessamento em mensagem amigável (nunca vaza
 * stack/technical string). Erros de negócio (ReprocessError) já têm texto próprio.
 */
export function getReprocessErrorMessage(err: unknown): string {
  if (err instanceof ReprocessError) return err.message;

  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';

  switch (code) {
    case 'permission-denied':
      return 'Você não tem permissão para reprocessar este campeonato.';
    case 'unavailable':
    case 'deadline-exceeded':
    case 'network-request-failed':
      return 'Falha de conexão. Verifique sua internet e tente novamente.';
    case 'aborted':
    case 'failed-precondition':
      return 'O campeonato mudou durante o reprocessamento. Recarregue e tente novamente.';
    default:
      return 'Ocorreu um erro inesperado ao reprocessar o campeonato. Tente novamente.';
  }
}

function applyPlanWritesMock(plan: ReprocessPlan, championshipId: string, now: string): void {
  setMockDocument('championship_reprocess_logs', plan.reprocessId, plan.log);
  updateMockDocument('championship_results', championshipId, {
    ...plan.resultUpdate,
    lastReprocessedAt: now,
  });
  if (!plan.changed) return;

  for (const w of plan.historyWrites) {
    setMockDocument('player_history', w.docId, w.data);
  }
  for (const w of plan.careerStatsWrites) {
    setMockDocument('career_stats', w.userId, w.data);
  }
  for (const w of plan.rankingWrites) {
    setMockDocument('all_time_rankings', w.docId, w.data);
  }
  for (const g of plan.achievementGrants) {
    setMockDocument(ACH_PATH(g.playerId), g.achievementId, g.data);
  }
  for (const r of plan.achievementRevocations) {
    updateMockDocument(ACH_PATH(r.playerId), r.achievementId, r.update);
  }
}

/**
 * Reprocessa um campeonato encerrado. Recebe o estado já carregado (o carregamento
 * a partir do Firestore e o gatilho pós-correção são responsabilidade do chamador —
 * Fase 3), exatamente como `applyMatchCorrection`. Retorna o resultado/idempotência.
 */
export async function reprocessClosedChampionship(
  input: ReprocessServiceInput,
): Promise<ReprocessResult> {
  const now = new Date().toISOString();
  // Validações + cálculo puro (lança ReprocessError tipado antes de qualquer escrita).
  const plan = buildReprocessPlan({ ...input, now });
  const championshipId = input.championship.id;

  if (USE_MOCK) {
    const existing = getMockDocument<ChampionshipReprocessLog>(
      'championship_reprocess_logs',
      plan.reprocessId,
    );
    if (existing) {
      if (existing.newResultsDigest !== plan.newResultsDigest) {
        throw new ReprocessError(
          'championship_reprocess_conflict',
          'Já existe um reprocessamento com resultado divergente para esta correção.',
        );
      }
      return {
        reprocessId: plan.reprocessId,
        reprocessVersion: existing.reprocessVersion,
        changed: existing.changed,
        idempotent: true,
        log: existing,
        plan,
      };
    }

    const current = getMockDocument<ChampionshipResultData>('championship_results', championshipId);
    if (!current) {
      throw new ReprocessError(
        'championship_results_missing',
        'Resultado congelado (championship_results) não encontrado.',
      );
    }
    if ((current.reprocessVersion ?? 0) !== input.expectedReprocessVersion) {
      throw new ReprocessError(
        'stale_reprocess_version',
        'O campeonato mudou desde que a tela foi aberta. Recarregue e tente novamente.',
      );
    }
    if (digestOutcomeResult(current) !== plan.previousResultsDigest) {
      throw new ReprocessError(
        'championship_reprocess_conflict',
        'O resultado do campeonato mudou durante o reprocessamento.',
      );
    }

    applyPlanWritesMock(plan, championshipId, now);
    return {
      reprocessId: plan.reprocessId,
      reprocessVersion: plan.reprocessVersion,
      changed: plan.changed,
      idempotent: false,
      log: plan.log,
      plan,
    };
  }

  // Guard rápido (fora da transação) para bloquear cedo quando o log já existe.
  const logRefOuter = doc(db, 'championship_reprocess_logs', plan.reprocessId);
  const logSnapOuter = await getDoc(logRefOuter);
  if (logSnapOuter.exists()) {
    const existing = { id: logSnapOuter.id, ...logSnapOuter.data() } as ChampionshipReprocessLog;
    if (existing.newResultsDigest !== plan.newResultsDigest) {
      throw new ReprocessError(
        'championship_reprocess_conflict',
        'Já existe um reprocessamento com resultado divergente para esta correção.',
      );
    }
    return {
      reprocessId: plan.reprocessId,
      reprocessVersion: existing.reprocessVersion,
      changed: existing.changed,
      idempotent: true,
      log: existing,
      plan,
    };
  }

  const txResult = await runTransaction<{ log: ChampionshipReprocessLog; idempotent: boolean }>(
    db,
    async (transaction) => {
      const logRef = doc(db, 'championship_reprocess_logs', plan.reprocessId);
      const resultRef = doc(db, 'championship_results', championshipId);

      // Leituras primeiro (regra do Firestore): log + resultado congelado.
      const logSnap = await transaction.get(logRef);
      if (logSnap.exists()) {
        const existing = { id: logSnap.id, ...logSnap.data() } as ChampionshipReprocessLog;
        if (existing.newResultsDigest !== plan.newResultsDigest) {
          throw new ReprocessError(
            'championship_reprocess_conflict',
            'Já existe um reprocessamento com resultado divergente para esta correção.',
          );
        }
        return { log: existing, idempotent: true };
      }

      const resultSnap = await transaction.get(resultRef);
      if (!resultSnap.exists()) {
        throw new ReprocessError(
          'championship_results_missing',
          'Resultado congelado (championship_results) não encontrado.',
        );
      }
      const current = { id: resultSnap.id, ...resultSnap.data() } as ChampionshipResultData;
      if ((current.reprocessVersion ?? 0) !== input.expectedReprocessVersion) {
        throw new ReprocessError(
          'stale_reprocess_version',
          'O campeonato mudou desde que a tela foi aberta. Recarregue e tente novamente.',
        );
      }
      if (digestOutcomeResult(current) !== plan.previousResultsDigest) {
        throw new ReprocessError(
          'championship_reprocess_conflict',
          'O resultado do campeonato mudou durante o reprocessamento.',
        );
      }

      // Escritas (buffered pela transação → commit atômico).
      transaction.set(logRef, { ...plan.log, createdAt: serverTimestamp() });
      transaction.update(resultRef, { ...plan.resultUpdate, lastReprocessedAt: serverTimestamp() });

      if (plan.changed) {
        for (const w of plan.historyWrites) {
          transaction.set(doc(db, 'player_history', w.docId), w.data);
        }
        for (const w of plan.careerStatsWrites) {
          transaction.set(doc(db, 'career_stats', w.userId), w.data);
        }
        for (const w of plan.rankingWrites) {
          transaction.set(doc(db, 'all_time_rankings', w.docId), w.data);
        }
        for (const g of plan.achievementGrants) {
          transaction.set(doc(db, ACH_PATH(g.playerId), g.achievementId), g.data);
        }
        for (const r of plan.achievementRevocations) {
          transaction.update(doc(db, ACH_PATH(r.playerId), r.achievementId), r.update);
        }
      }

      return { log: plan.log, idempotent: false };
    },
  );

  return {
    reprocessId: plan.reprocessId,
    reprocessVersion: txResult.idempotent ? txResult.log.reprocessVersion : plan.reprocessVersion,
    changed: txResult.idempotent ? txResult.log.changed : plan.changed,
    idempotent: txResult.idempotent,
    log: txResult.log,
    plan,
  };
}
