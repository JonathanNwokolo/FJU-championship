import {
  DEFAULT_GROUP_STAGE_CONFIG,
  GROUP_STAGE_TIEBREAKERS,
  canUseGroupStageConfig,
  getDefaultChampionshipStage,
  isGroupsKnockoutChampionship,
  normalizeGroupStageConfig,
  validateGroupStageConfig,
} from '../utils/groupStageRules';
import type { Championship } from '../types';

describe('groupStageRules', () => {
  it('accepts the approved default config for two balanced groups', () => {
    const result = validateGroupStageConfig(DEFAULT_GROUP_STAGE_CONFIG, {
      approvedTeamsCount: 4,
      maxTeams: 8,
    });

    expect(result.valid).toBe(true);
    expect(result.config).toEqual(DEFAULT_GROUP_STAGE_CONFIG);
  });

  it('rejects a groupCount different from 2', () => {
    const result = validateGroupStageConfig({ groupCount: 3 }, { approvedTeamsCount: 6 });

    expect(errorCodes(result)).toContain('invalid_group_count');
  });

  it('rejects fewer than 4 approved teams', () => {
    const result = validateGroupStageConfig(DEFAULT_GROUP_STAGE_CONFIG, {
      approvedTeamsCount: 3,
    });

    expect(errorCodes(result)).toContain('insufficient_teams_for_groups');
  });

  it('rejects approved teams above championship maxTeams', () => {
    const result = validateGroupStageConfig(DEFAULT_GROUP_STAGE_CONFIG, {
      approvedTeamsCount: 9,
      maxTeams: 8,
    });

    expect(errorCodes(result)).toContain('too_many_teams_for_championship');
  });

  it('rejects qualifiersPerGroup below 1', () => {
    const result = validateGroupStageConfig({ qualifiersPerGroup: 0 }, { approvedTeamsCount: 4 });

    expect(errorCodes(result)).toContain('invalid_qualifiers_per_group');
  });

  it('rejects qualifiersPerGroup above the smallest group size', () => {
    const result = validateGroupStageConfig(
      { qualifiersPerGroup: 3 },
      { approvedTeamsCount: 5, groupSizes: [3, 2] },
    );

    expect(errorCodes(result)).toContain('invalid_qualifiers_per_group');
  });

  it('rejects unbalanced or undersized group assignments', () => {
    const result = validateGroupStageConfig(DEFAULT_GROUP_STAGE_CONFIG, {
      approvedTeamsCount: 6,
      groupSizes: [4, 2],
    });

    expect(errorCodes(result)).toContain('invalid_group_assignment');
  });

  it('rejects best third placed settings', () => {
    const result = validateGroupStageConfig(
      { includeBestThirdPlaced: true, bestThirdPlacedCount: 1 },
      { approvedTeamsCount: 6 },
    );

    expect(errorCodes(result)).toContain('best_third_placed_not_supported');
  });

  it('rejects missing tiebreakers', () => {
    const result = validateGroupStageConfig({ tiebreakers: [] }, { approvedTeamsCount: 4 });

    expect(errorCodes(result)).toContain('missing_tiebreakers');
  });

  it('rejects duplicated tiebreakers', () => {
    const result = validateGroupStageConfig(
      { tiebreakers: ['points', 'points'] },
      { approvedTeamsCount: 4 },
    );

    expect(errorCodes(result)).toContain('duplicate_tiebreaker');
  });

  it('rejects a tiebreaker order different from the approved order', () => {
    const result = validateGroupStageConfig(
      { tiebreakers: ['wins', ...GROUP_STAGE_TIEBREAKERS.filter((item) => item !== 'wins')] },
      { approvedTeamsCount: 4 },
    );

    expect(errorCodes(result)).toContain('unsupported_tiebreaker_order');
  });

  it('normalizes partial legacy config without persisting or converting old championships', () => {
    expect(normalizeGroupStageConfig({ qualifiersPerGroup: 2 })).toEqual({
      ...DEFAULT_GROUP_STAGE_CONFIG,
      qualifiersPerGroup: 2,
    });

    const legacyChampionship = { status: 'inscricoes_abertas' } as Partial<Championship>;

    expect(canUseGroupStageConfig(legacyChampionship)).toBe(false);
    expect(isGroupsKnockoutChampionship(legacyChampionship)).toBe(false);
    expect(getDefaultChampionshipStage(legacyChampionship)).toBe('registration');
  });

  it('does not affect round-robin or simple knockout formats', () => {
    expect(canUseGroupStageConfig(championship('pontos_corridos'))).toBe(false);
    expect(canUseGroupStageConfig(championship('mata_mata'))).toBe(false);
    expect(canUseGroupStageConfig(championship('grupos_e_mata_mata'))).toBe(true);
  });

  it('infers conservative stages for legacy championships without stage', () => {
    expect(getDefaultChampionshipStage(championship('grupos_e_mata_mata', 'em_andamento'))).toBe(
      'group_stage',
    );
    expect(
      getDefaultChampionshipStage({
        ...championship('grupos_e_mata_mata', 'em_andamento'),
        groupStageComplete: true,
      }),
    ).toBe('knockout');
    expect(getDefaultChampionshipStage(championship('mata_mata', 'em_andamento'))).toBe('knockout');
    expect(getDefaultChampionshipStage(championship('pontos_corridos', 'finalizado'))).toBe(
      'completed',
    );
  });
});

function errorCodes(result: ReturnType<typeof validateGroupStageConfig>) {
  return result.errors.map((error) => error.code);
}

function championship(
  format: Championship['format'],
  status: Championship['status'] = 'inscricoes_abertas',
): Partial<Championship> {
  return { format, status };
}
