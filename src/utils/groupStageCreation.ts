/**
 * Bloco 10.4 — Construção da configuração de grupos na CRIAÇÃO do campeonato.
 *
 * Seam puro e testável usado pela CreateChampionshipScreen. Reutiliza a
 * validação já aprovada (`validateGroupStageConfig`) — a tela não duplica
 * regras. Na criação ainda não há times aprovados, então validamos apenas a
 * forma da config, os classificados e a compatibilidade com `maxTeams`.
 */

import type { GroupStageConfig, GroupStageValidationError } from '../types';
import {
  GROUP_STAGE_TIEBREAKERS,
  MIN_APPROVED_TEAMS_FOR_GROUPS,
  SUPPORTED_GROUP_COUNT,
  normalizeGroupStageConfig,
  validateGroupStageConfig,
} from './groupStageRules';

export interface CreationGroupStageInput {
  qualifiersPerGroup: number;
  maxTeams?: number;
}

export type CreationGroupStageConfigResult =
  | { valid: true; config: GroupStageConfig; errors: [] }
  | { valid: false; errors: GroupStageValidationError[] };

/**
 * A quantidade default de classificados por grupo. 2 gera 4 classificados
 * (chave limpa, sem BYE) para o caso mais comum de 2 grupos.
 */
export const DEFAULT_CREATION_QUALIFIERS_PER_GROUP = 2;

export function buildCreationGroupStageConfig(
  input: CreationGroupStageInput,
): CreationGroupStageConfigResult {
  const errors: GroupStageValidationError[] = [];

  // maxTeams precisa comportar ao menos o mínimo estrutural (4 times, 2 por grupo).
  if (typeof input.maxTeams === 'number' && input.maxTeams < MIN_APPROVED_TEAMS_FOR_GROUPS) {
    errors.push({
      code: 'insufficient_teams_for_groups',
      message: 'O máximo de times deve permitir pelo menos 4 times para a fase de grupos.',
      field: 'maxTeams',
      details: { maxTeams: input.maxTeams, min: MIN_APPROVED_TEAMS_FOR_GROUPS },
    });
  }

  const draft = normalizeGroupStageConfig({
    version: 1,
    groupCount: SUPPORTED_GROUP_COUNT,
    qualifiersPerGroup: input.qualifiersPerGroup,
    includeBestThirdPlaced: false,
    bestThirdPlacedCount: 0,
    drawMethod: 'random',
    tiebreakers: [...GROUP_STAGE_TIEBREAKERS],
  });

  // Sem times aprovados na criação: valida forma + classificados + maxTeams.
  const validation = validateGroupStageConfig(draft, { maxTeams: input.maxTeams });
  if (!validation.valid) {
    errors.push(...validation.errors);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, config: validation.valid ? validation.config : (draft as GroupStageConfig), errors: [] };
}
