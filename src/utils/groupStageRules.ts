import type {
  Championship,
  ChampionshipStage,
  GroupDrawMethod,
  GroupStageConfig,
  GroupStageErrorCode,
  GroupStageValidationError,
  GroupTiebreaker,
} from '../types';

export const SUPPORTED_GROUP_COUNT = 2;
export const MIN_APPROVED_TEAMS_FOR_GROUPS = 4;

export const GROUP_STAGE_TIEBREAKERS: readonly GroupTiebreaker[] = [
  'points',
  'wins',
  'goal_difference',
  'goals_for',
  'head_to_head',
  'fewest_cards',
  'deterministic_draw',
];

export const DEFAULT_GROUP_STAGE_CONFIG: GroupStageConfig = {
  version: 1,
  groupCount: SUPPORTED_GROUP_COUNT,
  qualifiersPerGroup: 1,
  includeBestThirdPlaced: false,
  bestThirdPlacedCount: 0,
  drawMethod: 'random',
  tiebreakers: [...GROUP_STAGE_TIEBREAKERS],
};

export type GroupStageConfigDraft = {
  version?: number;
  groupCount?: number;
  qualifiersPerGroup?: number;
  includeBestThirdPlaced?: boolean;
  bestThirdPlacedCount?: number;
  drawMethod?: string;
  tiebreakers?: readonly string[];
};

export interface GroupStageValidationContext {
  approvedTeamsCount?: number;
  maxTeams?: number;
  groupSizes?: readonly number[];
}

export type GroupStageValidationResult =
  | { valid: true; config: GroupStageConfig; errors: [] }
  | { valid: false; config: GroupStageConfigDraft; errors: GroupStageValidationError[] };

type ChampionshipStageFields = Partial<
  Pick<
    Championship,
    | 'format'
    | 'status'
    | 'stage'
    | 'fixturesGenerated'
    | 'groups'
    | 'groupStageComplete'
    | 'groupStageStatus'
    | 'knockoutStageStatus'
    | 'knockoutStartRound'
  >
>;

export function normalizeGroupStageConfig(config?: GroupStageConfigDraft | null): GroupStageConfigDraft {
  return {
    version: config?.version ?? DEFAULT_GROUP_STAGE_CONFIG.version,
    groupCount: config?.groupCount ?? DEFAULT_GROUP_STAGE_CONFIG.groupCount,
    qualifiersPerGroup:
      config?.qualifiersPerGroup ?? DEFAULT_GROUP_STAGE_CONFIG.qualifiersPerGroup,
    includeBestThirdPlaced:
      config?.includeBestThirdPlaced ?? DEFAULT_GROUP_STAGE_CONFIG.includeBestThirdPlaced,
    bestThirdPlacedCount:
      config?.bestThirdPlacedCount ?? DEFAULT_GROUP_STAGE_CONFIG.bestThirdPlacedCount,
    drawMethod: config?.drawMethod ?? DEFAULT_GROUP_STAGE_CONFIG.drawMethod,
    tiebreakers: config?.tiebreakers ?? DEFAULT_GROUP_STAGE_CONFIG.tiebreakers,
  };
}

export function validateGroupStageConfig(
  config: GroupStageConfigDraft | null | undefined,
  context: GroupStageValidationContext = {},
): GroupStageValidationResult {
  const normalized = normalizeGroupStageConfig(config);
  const errors: GroupStageValidationError[] = [];

  if (normalized.version !== 1) {
    errors.push(error('invalid_group_stage_config_version', 'A versao da configuracao deve ser 1.', 'version'));
  }

  if (normalized.groupCount !== SUPPORTED_GROUP_COUNT) {
    errors.push(error('invalid_group_count', 'Este bloco suporta exatamente 2 grupos.', 'groupCount'));
  }

  validateApprovedTeamLimits(context, errors);
  const smallestGroupSize = getSmallestGroupSize(context, errors);
  validateQualifiers(normalized, smallestGroupSize, errors);
  validateBestThirdPlaced(normalized, errors);
  validateDrawMethod(normalized.drawMethod, errors);
  validateTiebreakers(normalized.tiebreakers, errors);

  if (errors.length > 0) {
    return { valid: false, config: normalized, errors };
  }

  return {
    valid: true,
    config: {
      version: 1,
      groupCount: SUPPORTED_GROUP_COUNT,
      qualifiersPerGroup: normalized.qualifiersPerGroup as number,
      includeBestThirdPlaced: false,
      bestThirdPlacedCount: 0,
      drawMethod: 'random',
      tiebreakers: [...GROUP_STAGE_TIEBREAKERS],
    },
    errors: [],
  };
}

export function getDefaultChampionshipStage(
  championship?: ChampionshipStageFields | null,
): ChampionshipStage {
  if (championship?.stage) return championship.stage;
  if (championship?.status === 'finalizado') return 'completed';
  if (!championship?.status || championship.status === 'inscricoes_abertas') return 'registration';

  if (championship.format === 'grupos_e_mata_mata') {
    if (
      championship.groupStageComplete ||
      typeof championship.knockoutStartRound === 'number' ||
      championship.knockoutStageStatus === 'generated' ||
      championship.knockoutStageStatus === 'in_progress' ||
      championship.knockoutStageStatus === 'completed'
    ) {
      return 'knockout';
    }

    if (championship.groupStageStatus === 'completed') return 'group_stage_completed';
    return 'group_stage';
  }

  if (championship.format === 'mata_mata') return 'knockout';
  return 'registration';
}

export function isGroupsKnockoutChampionship(
  championship?: Pick<Championship, 'format'> | ChampionshipStageFields | null,
): boolean {
  return championship?.format === 'grupos_e_mata_mata';
}

export function canUseGroupStageConfig(
  championship?: Pick<Championship, 'format'> | ChampionshipStageFields | null,
): boolean {
  return isGroupsKnockoutChampionship(championship);
}

function validateApprovedTeamLimits(
  context: GroupStageValidationContext,
  errors: GroupStageValidationError[],
) {
  const { approvedTeamsCount, maxTeams } = context;
  if (approvedTeamsCount === undefined) return;

  if (approvedTeamsCount < MIN_APPROVED_TEAMS_FOR_GROUPS) {
    errors.push(
      error(
        'insufficient_teams_for_groups',
        'A fase de grupos exige pelo menos 4 times aprovados.',
        'approvedTeamsCount',
        { approvedTeamsCount, min: MIN_APPROVED_TEAMS_FOR_GROUPS },
      ),
    );
  }

  if (typeof maxTeams === 'number' && approvedTeamsCount > maxTeams) {
    errors.push(
      error(
        'too_many_teams_for_championship',
        'A quantidade de times aprovados excede o maximo do campeonato.',
        'approvedTeamsCount',
        { approvedTeamsCount, maxTeams },
      ),
    );
  }
}

function getSmallestGroupSize(
  context: GroupStageValidationContext,
  errors: GroupStageValidationError[],
): number | undefined {
  if (context.groupSizes) {
    if (context.groupSizes.length !== SUPPORTED_GROUP_COUNT) {
      errors.push(error('invalid_group_assignment', 'A configuracao deve ter 2 grupos.', 'groupSizes'));
      return undefined;
    }

    const [firstGroupSize, secondGroupSize] = context.groupSizes;
    const smallest = Math.min(firstGroupSize, secondGroupSize);
    const largest = Math.max(firstGroupSize, secondGroupSize);
    const totalFromGroups = firstGroupSize + secondGroupSize;

    if (
      !Number.isInteger(firstGroupSize) ||
      !Number.isInteger(secondGroupSize) ||
      smallest < 2 ||
      largest - smallest > 1 ||
      (context.approvedTeamsCount !== undefined && totalFromGroups !== context.approvedTeamsCount)
    ) {
      errors.push(
        error(
          'invalid_group_assignment',
          'Os grupos devem ser equilibrados, com minimo de 2 times e diferenca maxima de 1.',
          'groupSizes',
          {
            groupSizes: context.groupSizes,
            approvedTeamsCount: context.approvedTeamsCount,
          },
        ),
      );
    }

    return smallest;
  }

  if (context.approvedTeamsCount === undefined) return undefined;
  return Math.floor(context.approvedTeamsCount / SUPPORTED_GROUP_COUNT);
}

function validateQualifiers(
  config: GroupStageConfigDraft,
  smallestGroupSize: number | undefined,
  errors: GroupStageValidationError[],
) {
  const qualifiersPerGroup = config.qualifiersPerGroup;
  if (!Number.isInteger(qualifiersPerGroup) || (qualifiersPerGroup ?? 0) < 1) {
    errors.push(
      error(
        'invalid_qualifiers_per_group',
        'A quantidade de classificados por grupo deve ser pelo menos 1.',
        'qualifiersPerGroup',
      ),
    );
    return;
  }

  const safeQualifiersPerGroup = qualifiersPerGroup as number;

  if (smallestGroupSize !== undefined && safeQualifiersPerGroup > smallestGroupSize) {
    errors.push(
      error(
        'invalid_qualifiers_per_group',
        'Classificados por grupo nao pode exceder o tamanho do menor grupo.',
        'qualifiersPerGroup',
        { qualifiersPerGroup: safeQualifiersPerGroup, smallestGroupSize },
      ),
    );
  }

  if (safeQualifiersPerGroup * SUPPORTED_GROUP_COUNT < 2) {
    errors.push(
      error(
        'invalid_qualifiers_per_group',
        'O total de classificados deve ser pelo menos 2.',
        'qualifiersPerGroup',
      ),
    );
  }
}

function validateBestThirdPlaced(
  config: GroupStageConfigDraft,
  errors: GroupStageValidationError[],
) {
  if (config.includeBestThirdPlaced !== false || config.bestThirdPlacedCount !== 0) {
    errors.push(
      error(
        'best_third_placed_not_supported',
        'Melhores terceiros ficam fora do escopo deste bloco.',
        'includeBestThirdPlaced',
      ),
    );
  }
}

function validateDrawMethod(
  drawMethod: string | undefined,
  errors: GroupStageValidationError[],
) {
  if (!isGroupDrawMethod(drawMethod)) {
    errors.push(error('invalid_draw_method', 'O unico metodo de sorteio suportado e random.', 'drawMethod'));
  }
}

function validateTiebreakers(
  tiebreakers: readonly string[] | undefined,
  errors: GroupStageValidationError[],
) {
  if (!tiebreakers || tiebreakers.length === 0) {
    errors.push(error('missing_tiebreakers', 'A ordem de desempate e obrigatoria.', 'tiebreakers'));
    return;
  }

  const seen = new Set<string>();
  for (const item of tiebreakers) {
    if (seen.has(item)) {
      errors.push(
        error('duplicate_tiebreaker', 'A ordem de desempate nao pode conter itens duplicados.', 'tiebreakers', {
          tiebreaker: item,
        }),
      );
      return;
    }
    seen.add(item);
  }

  const hasUnsupportedOrder =
    tiebreakers.length !== GROUP_STAGE_TIEBREAKERS.length ||
    tiebreakers.some((item, index) => item !== GROUP_STAGE_TIEBREAKERS[index]);

  if (hasUnsupportedOrder) {
    errors.push(
      error(
        'unsupported_tiebreaker_order',
        'A ordem de desempate deve seguir a decisao aprovada do formato.',
        'tiebreakers',
      ),
    );
  }
}

function isGroupDrawMethod(value: string | undefined): value is GroupDrawMethod {
  return value === 'random';
}

function error(
  code: GroupStageErrorCode,
  message: string,
  field?: GroupStageValidationError['field'],
  details?: Record<string, unknown>,
): GroupStageValidationError {
  return { code, message, field, details };
}
