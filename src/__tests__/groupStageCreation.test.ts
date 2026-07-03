import {
  buildCreationGroupStageConfig,
  DEFAULT_CREATION_QUALIFIERS_PER_GROUP,
} from '../utils/groupStageCreation';

describe('buildCreationGroupStageConfig (Bloco 10.4 — Parte 40)', () => {
  it('default de classificados por grupo é 2 (chave limpa)', () => {
    expect(DEFAULT_CREATION_QUALIFIERS_PER_GROUP).toBe(2);
  });

  it('gera config válida com 2 grupos, sorteio e sem melhores terceiros', () => {
    const result = buildCreationGroupStageConfig({ qualifiersPerGroup: 2, maxTeams: 16 });
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.config).toMatchObject({
      version: 1,
      groupCount: 2,
      qualifiersPerGroup: 2,
      includeBestThirdPlaced: false,
      bestThirdPlacedCount: 0,
      drawMethod: 'random',
    });
    expect(result.config.tiebreakers.length).toBeGreaterThan(0);
  });

  it('rejeita classificados por grupo menor que 1', () => {
    const result = buildCreationGroupStageConfig({ qualifiersPerGroup: 0, maxTeams: 16 });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.some((e) => e.code === 'invalid_qualifiers_per_group')).toBe(true);
  });

  it('rejeita maxTeams abaixo do mínimo estrutural (4 times)', () => {
    const result = buildCreationGroupStageConfig({ qualifiersPerGroup: 1, maxTeams: 3 });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.some((e) => e.code === 'insufficient_teams_for_groups')).toBe(true);
  });

  it('nunca habilita melhores terceiros mesmo com muitos classificados', () => {
    const result = buildCreationGroupStageConfig({ qualifiersPerGroup: 2, maxTeams: 8 });
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.config.includeBestThirdPlaced).toBe(false);
    expect(result.config.bestThirdPlacedCount).toBe(0);
  });

  it('valida sem maxTeams (validação de forma apenas)', () => {
    const result = buildCreationGroupStageConfig({ qualifiersPerGroup: 2 });
    expect(result.valid).toBe(true);
  });
});
