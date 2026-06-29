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

import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Championship, Team, MatchModel } from '../types';
import { generateRoundRobinFixtures, generateBracketFixtures } from '../utils/roundRobin';
import { getCollection, setDocument, updateDocument } from './firestore';
import { db } from './firebase';
import { useMatchStore } from '../stores/matchStore';
import { useChampionshipStore } from '../stores/championshipStore';
import { MOCK_DATA_ENABLED as USE_MOCK } from '../config/appConfig';

export const MIN_TEAMS_TO_START = 2;
export const MATCHES_ALREADY_GENERATED_ERROR = 'Este campeonato já possui partidas geradas.';

export interface StartChampionshipResult {
  success: boolean;
  matchesCreated: number;
  error?: string;
}

/**
 * Gera o MatchModel[] adequado ao formato do campeonato (sem persistir).
 */
export function buildFixtures(championship: Championship, approvedTeams: Team[]): MatchModel[] {
  // AUD-02: nunca gera tabela inválida com menos de 2 times aprovados.
  if (approvedTeams.length < MIN_TEAMS_TO_START) {
    return [];
  }
  if (championship.format === 'mata_mata') {
    return generateBracketFixtures(approvedTeams, championship.id);
  }
  // pontos_corridos (e fallback). grupos_e_mata_mata ainda está desabilitado na criação.
  return generateRoundRobinFixtures(approvedTeams, championship.id);
}

export async function ensureChampionshipHasNoMatches(championshipId: string): Promise<void> {
  const existingMatches = await getCollection<MatchModel>('matches', [
    { field: 'championshipId', operator: '==', value: championshipId },
  ]);

  if (existingMatches.length > 0) {
    throw new Error(MATCHES_ALREADY_GENERATED_ERROR);
  }
}

/**
 * QA-01: fonte ÚNICA de verdade para persistir uma tabela já construída.
 *
 * Toda a gravação acontece dentro de uma única runTransaction sobre o documento do
 * campeonato, que funciona como lock/sentinela:
 *   1. Lê championships/{id} (única leitura, antes de qualquer escrita).
 *   2. Aborta se o campeonato não existe, se fixturesGenerated já é true, ou se o
 *      status não é mais 'inscricoes_abertas' (campeonato já iniciado/finalizado).
 *   3. Grava TODAS as partidas (transaction.set) + marca o campeonato
 *      (fixturesGenerated, drawCompletedAt, status, currentRound, totalRounds).
 *
 * Como tudo — incluindo o flip de fixturesGenerated e a criação das partidas — vive
 * na mesma transação atômica, dois clientes simultâneos não conseguem ambos gerar a
 * tabela: o segundo a confirmar encontra fixturesGenerated == true (ou conflito de
 * versão do doc) e aborta. O nº de partidas de um sorteio fica muito abaixo do limite
 * de operações de uma transação do Firestore, então não há fallback necessário.
 */
export async function commitFixtures(
  championship: Championship,
  matches: MatchModel[],
): Promise<StartChampionshipResult> {
  if (matches.length === 0) {
    return { success: false, matchesCreated: 0, error: 'Não foi possível gerar as partidas.' };
  }

  const totalRounds = Math.max(...matches.map((m) => m.round), 1);
  const champUpdate = { status: 'em_andamento' as const, currentRound: 1, totalRounds };

  try {
    if (USE_MOCK) {
      const current = await getCollection<MatchModel>('matches', [
        { field: 'championshipId', operator: '==', value: championship.id },
      ]);
      if (
        current.length > 0 ||
        championship.fixturesGenerated === true ||
        championship.status !== 'inscricoes_abertas'
      ) {
        throw new Error(MATCHES_ALREADY_GENERATED_ERROR);
      }

      await Promise.all(matches.map((m) => setDocument('matches', m.id, m)));
      await updateDocument('championships', championship.id, {
        ...champUpdate,
        fixturesGenerated: true,
        drawCompletedAt: new Date().toISOString(),
      });
      useMatchStore.getState().addMatches(matches);
      useChampionshipStore.getState().updateChampionship(championship.id, champUpdate);

      return { success: true, matchesCreated: matches.length };
    }

    await runTransaction(db, async (tx) => {
      const champRef = doc(db, 'championships', championship.id);
      const snap = await tx.get(champRef);
      if (!snap.exists()) {
        throw new Error('Campeonato não encontrado.');
      }
      const data = snap.data() as Championship;
      // Guard atômico: sentinela nova OU status já avançado (campeonatos legados).
      if (data.fixturesGenerated === true || data.status !== 'inscricoes_abertas') {
        throw new Error(MATCHES_ALREADY_GENERATED_ERROR);
      }

      matches.forEach((m) => {
        tx.set(doc(db, 'matches', m.id), { ...m, createdAt: serverTimestamp() });
      });
      tx.update(champRef, {
        ...champUpdate,
        fixturesGenerated: true,
        drawCompletedAt: serverTimestamp(),
      });
    });

    // Stores locais só depois do commit no Firestore (fonte da verdade).
    useMatchStore.getState().addMatches(matches);
    useChampionshipStore.getState().updateChampionship(championship.id, champUpdate);

    return { success: true, matchesCreated: matches.length };
  } catch (error) {
    console.error('[fixturesService] commitFixtures failed:', error);
    return {
      success: false,
      matchesCreated: 0,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Gera a tabela a partir dos times aprovados e a persiste atomicamente.
 * Caminho usado pelo "Iniciar campeonato" da ChampionshipManageScreen.
 */
export async function startChampionship(
  championship: Championship,
  approvedTeams: Team[],
): Promise<StartChampionshipResult> {
  if (approvedTeams.length < MIN_TEAMS_TO_START) {
    return {
      success: false,
      matchesCreated: 0,
      error: `Mínimo de ${MIN_TEAMS_TO_START} times aprovados para iniciar.`,
    };
  }

  // Checagem auxiliar rápida (feedback imediato). A proteção REAL é a transação.
  try {
    await ensureChampionshipHasNoMatches(championship.id);
  } catch (error) {
    return {
      success: false,
      matchesCreated: 0,
      error: error instanceof Error ? error.message : MATCHES_ALREADY_GENERATED_ERROR,
    };
  }

  const matches = buildFixtures(championship, approvedTeams);
  return commitFixtures(championship, matches);
}
