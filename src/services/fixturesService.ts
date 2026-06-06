/**
 * Fixtures Service
 *
 * Centraliza a geração + persistência das partidas de um campeonato.
 * A lógica pura de geração vive em utils/roundRobin (generateRoundRobinFixtures /
 * generateBracketFixtures); este serviço apenas escolhe o gerador pelo formato,
 * grava no Firestore (fonte da verdade) e sincroniza os stores locais.
 *
 * Antes do BLOCO 3 essa persistência só existia inline na DrawFullscreenScreen.
 */

import { Championship, Team, MatchModel } from '../types';
import { generateRoundRobinFixtures, generateBracketFixtures } from '../utils/roundRobin';
import { setDocument, updateDocument } from './firestore';
import { useMatchStore } from '../stores/matchStore';
import { useChampionshipStore } from '../stores/championshipStore';

export const MIN_TEAMS_TO_START = 2;

export interface StartChampionshipResult {
  success: boolean;
  matchesCreated: number;
  error?: string;
}

/**
 * Gera o MatchModel[] adequado ao formato do campeonato (sem persistir).
 */
export function buildFixtures(championship: Championship, approvedTeams: Team[]): MatchModel[] {
  if (championship.format === 'mata_mata') {
    return generateBracketFixtures(approvedTeams, championship.id);
  }
  // pontos_corridos (e fallback). grupos_e_mata_mata ainda está desabilitado na criação.
  return generateRoundRobinFixtures(approvedTeams, championship.id);
}

/**
 * Gera a tabela, persiste as partidas e coloca o campeonato em andamento.
 * Idempotência fica a cargo do chamador (só chamar quando não há partidas ainda).
 */
export async function startChampionship(
  championship: Championship,
  approvedTeams: Team[],
): Promise<StartChampionshipResult> {
  try {
    if (approvedTeams.length < MIN_TEAMS_TO_START) {
      return {
        success: false,
        matchesCreated: 0,
        error: `Mínimo de ${MIN_TEAMS_TO_START} times aprovados para iniciar.`,
      };
    }

    const matches = buildFixtures(championship, approvedTeams);
    if (matches.length === 0) {
      return { success: false, matchesCreated: 0, error: 'Não foi possível gerar as partidas.' };
    }

    const totalRounds = Math.max(...matches.map((m) => m.round), 1);
    const champUpdate = { status: 'em_andamento' as const, currentRound: 1, totalRounds };

    // Firestore primeiro (fonte da verdade), stores locais em seguida.
    await Promise.all(matches.map((m) => setDocument('matches', m.id, m)));
    await updateDocument('championships', championship.id, champUpdate);

    useMatchStore.getState().addMatches(matches);
    useChampionshipStore.getState().updateChampionship(championship.id, champUpdate);

    return { success: true, matchesCreated: matches.length };
  } catch (error) {
    console.error('[fixturesService] startChampionship failed:', error);
    return {
      success: false,
      matchesCreated: 0,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}
