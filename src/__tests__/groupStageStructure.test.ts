import type {
  Championship,
  GroupStageQualificationSnapshot,
  MatchModel,
  Team,
} from '../types';
import { DEFAULT_GROUP_STAGE_CONFIG } from '../utils/groupStageRules';
import {
  getChampionshipTeamsByGroup,
  getCurrentChampionshipStage,
  getGroupMatches,
  getKnockoutMatches,
  hasGeneratedGroups,
  hasGeneratedKnockout,
  hasStartedGroupStage,
  normalizeChampionshipStructure,
  normalizeMatchStage,
  normalizeTeamGroupAssignment,
  validateGroupStageQualificationSnapshot,
  validateGroupsKnockoutStructure,
} from '../utils/groupStageStructure';
import { getGroupId } from '../utils/groupStageIds';

const baseChampionship: Championship = {
  id: 'champ-1',
  name: 'Copa FJU',
  format: 'grupos_e_mata_mata',
  status: 'inscricoes_abertas',
  currentRound: 0,
  totalRounds: 0,
  organizerId: 'org-1',
  inviteCode: 'ABC123',
  rules: {
    pointsWin: 3,
    pointsDraw: 1,
    pointsLoss: 0,
    tiebreakers: [],
    fairPlay: true,
    craqueDaRodada: false,
  },
  createdAt: '2026-01-01',
  groupStageConfig: DEFAULT_GROUP_STAGE_CONFIG,
};

function championship(overrides: Partial<Championship> = {}): Championship {
  return { ...baseChampionship, ...overrides };
}

function team(id: string, groupId?: string | null, overrides: Partial<Team> = {}): Team {
  return {
    id,
    championshipId: 'champ-1',
    name: `Time ${id}`,
    primaryColor: '#111111',
    secondaryColor: '#222222',
    captainId: `cap-${id}`,
    status: 'aprovado',
    inviteCode: `INV-${id}`,
    createdAt: '2026-01-01',
    ...(groupId !== undefined ? { groupId } : {}),
    ...overrides,
  };
}

function match(id: string, overrides: Partial<MatchModel> = {}): MatchModel {
  return {
    id,
    championshipId: 'champ-1',
    round: 1,
    homeTeamId: 't1',
    awayTeamId: 't2',
    homeScore: null,
    awayScore: null,
    status: 'agendado',
    ...overrides,
  };
}

function validTeams(): Team[] {
  return [team('t1', 'A'), team('t2', 'A'), team('t3', 'B'), team('t4', 'B')];
}

function snapshot(overrides: Partial<GroupStageQualificationSnapshot> = {}): GroupStageQualificationSnapshot {
  return {
    version: 1,
    championshipId: 'champ-1',
    generatedAt: new Date('2026-01-01T00:00:00.000Z'),
    configVersion: 1,
    qualifiers: [
      {
        teamId: 't1',
        groupId: 'A',
        position: 1,
        points: 6,
        wins: 2,
        goalDifference: 3,
        goalsFor: 5,
        deterministicSeed: 'champ-1:A:1:t1',
      },
      {
        teamId: 't3',
        groupId: 'B',
        position: 1,
        points: 6,
        wins: 2,
        goalDifference: 2,
        goalsFor: 4,
        deterministicSeed: 'champ-1:B:1:t3',
      },
    ],
    ...overrides,
  };
}

function codes(result: ReturnType<typeof validateGroupsKnockoutStructure>) {
  return {
    errors: result.errors.map((error) => error.code),
    warnings: result.warnings.map((warning) => warning.code),
  };
}

describe('groupStageStructure', () => {
  describe('campeonato', () => {
    it('aceita grupos com estrutura valida', () => {
      const result = validateGroupsKnockoutStructure({
        championship: championship({ groupStageStatus: 'groups_generated' }),
        teams: validTeams(),
        matches: [
          match('m1', { stage: 'group', groupId: 'A', homeTeamId: 't1', awayTeamId: 't2' }),
          match('m2', { stage: 'group', groupId: 'B', homeTeamId: 't3', awayTeamId: 't4' }),
        ],
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('detecta grupos sem config', () => {
      const result = validateGroupsKnockoutStructure({
        championship: championship({ groupStageConfig: undefined }),
        teams: [],
        matches: [],
      });

      expect(codes(result).errors).toContain('groups_championship_missing_config');
    });

    it('normaliza grupos sem stage para registration antes da geracao', () => {
      expect(getCurrentChampionshipStage(championship({ stage: undefined }))).toBe('registration');
    });

    it('normaliza pontos corridos legado como league quando em andamento', () => {
      expect(
        normalizeChampionshipStructure(
          championship({ format: 'pontos_corridos', status: 'em_andamento', stage: undefined }),
        ).stage,
      ).toBe('league');
    });

    it('normaliza mata-mata legado como knockout quando em andamento', () => {
      expect(
        normalizeChampionshipStructure(
          championship({ format: 'mata_mata', status: 'em_andamento', stage: undefined }),
        ).stage,
      ).toBe('knockout');
    });

    it('preserva comportamento conservador para formato ausente', () => {
      expect(normalizeChampionshipStructure({ id: 'legacy', status: 'inscricoes_abertas' }).stage).toBe(
        'registration',
      );
    });

    it('nao persiste defaults implicitos durante leitura', () => {
      const original = championship({ groupStageConfig: undefined });
      const normalized = normalizeChampionshipStructure(original);

      expect(original.groupStageConfig).toBeUndefined();
      expect(normalized.defaultGroupStageConfig).toEqual(DEFAULT_GROUP_STAGE_CONFIG);
    });
  });

  describe('times', () => {
    it('aceita grupo A', () => {
      expect(normalizeTeamGroupAssignment(team('t1', 'A'), championship()).groupId).toBe('A');
    });

    it('aceita grupo B', () => {
      expect(normalizeTeamGroupAssignment(team('t2', getGroupId('champ-1', 'B')), championship()).groupId).toBe(
        'B',
      );
    });

    it('detecta groupId invalido', () => {
      const result = validateGroupsKnockoutStructure({
        championship: championship({ groupStageStatus: 'groups_generated' }),
        teams: [team('t1', 'C')],
        matches: [],
      });

      expect(codes(result).errors).toContain('team_invalid_group_id');
    });

    it('permite time sem grupo antes da geracao', () => {
      const result = validateGroupsKnockoutStructure({
        championship: championship({ groupStageStatus: 'not_generated' }),
        teams: [team('t1')],
        matches: [],
      });

      expect(codes(result).errors).not.toContain('team_missing_group_after_generation');
    });

    it('detecta time sem grupo depois da geracao', () => {
      const result = validateGroupsKnockoutStructure({
        championship: championship({ groupStageStatus: 'groups_generated' }),
        teams: [team('t1')],
        matches: [],
      });

      expect(codes(result).errors).toContain('team_missing_group_after_generation');
    });

    it('aceita seed valido', () => {
      expect(normalizeTeamGroupAssignment(team('t1', 'A', { groupSeed: 1 }), championship()).valid).toBe(
        true,
      );
    });

    it('detecta seed invalido', () => {
      expect(
        normalizeTeamGroupAssignment(team('t1', 'A', { groupSeed: 0 }), championship()).issues.map(
          (issue) => issue.code,
        ),
      ).toContain('team_invalid_group_seed');
    });
  });

  describe('partidas', () => {
    it('normaliza league', () => {
      expect(normalizeMatchStage(match('m1', { stage: 'league' }), championship()).stage).toBe('league');
    });

    it('normaliza group', () => {
      expect(normalizeMatchStage(match('m1', { stage: 'group', groupId: 'A' }), championship()).stage).toBe(
        'group',
      );
    });

    it('normaliza knockout', () => {
      expect(normalizeMatchStage(match('m1', { stage: 'knockout' }), championship()).stage).toBe(
        'knockout',
      );
    });

    it('detecta partida de grupo sem groupId', () => {
      const result = validateGroupsKnockoutStructure({
        championship: championship(),
        teams: validTeams(),
        matches: [match('m1', { stage: 'group', groupId: null })],
      });

      expect(codes(result).errors).toContain('group_match_missing_group_id');
    });

    it('detecta grupo incompativel', () => {
      const result = validateGroupsKnockoutStructure({
        championship: championship(),
        teams: validTeams(),
        matches: [match('m1', { stage: 'group', groupId: 'C' })],
      });

      expect(codes(result).errors).toContain('match_group_id_unknown');
    });

    it('detecta partida entre grupos diferentes', () => {
      const result = validateGroupsKnockoutStructure({
        championship: championship({ groupStageStatus: 'groups_generated' }),
        teams: validTeams(),
        matches: [match('m1', { stage: 'group', groupId: 'A', homeTeamId: 't1', awayTeamId: 't3' })],
      });

      expect(codes(result).errors).toContain('group_match_cross_group');
    });

    it('marca partida antiga sem stage como warning', () => {
      const result = validateGroupsKnockoutStructure({
        championship: championship({ format: 'pontos_corridos', status: 'em_andamento' }),
        teams: [],
        matches: [match('m1')],
      });

      expect(codes(result).warnings).toContain('legacy_match_missing_stage');
    });

    it('interpreta campeonato legado de mata-mata sem stage', () => {
      expect(normalizeMatchStage(match('m1'), championship({ format: 'mata_mata' })).stage).toBe(
        'knockout',
      );
    });
  });

  describe('estrutura', () => {
    it('aceita 2x2', () => {
      const result = validateGroupsKnockoutStructure({
        championship: championship({ groupStageStatus: 'groups_generated' }),
        teams: validTeams(),
        matches: [],
      });

      expect(result.valid).toBe(true);
    });

    it('aceita 3x2', () => {
      const result = validateGroupsKnockoutStructure({
        championship: championship({ groupStageStatus: 'groups_generated' }),
        teams: [...validTeams(), team('t5', 'A')],
        matches: [],
      });

      expect(result.valid).toBe(true);
    });

    it('detecta grupos desbalanceados', () => {
      const result = validateGroupsKnockoutStructure({
        championship: championship({ groupStageStatus: 'groups_generated' }),
        teams: [...validTeams(), team('t5', 'A'), team('t6', 'A')],
        matches: [],
      });

      expect(codes(result).errors).toContain('group_size_imbalance');
    });

    it('detecta time duplicado', () => {
      const result = validateGroupsKnockoutStructure({
        championship: championship({ groupStageStatus: 'groups_generated' }),
        teams: [team('t1', 'A'), team('t1', 'A')],
        matches: [],
      });

      expect(codes(result).errors).toContain('duplicate_team_id');
    });

    it('detecta partida em grupo errado', () => {
      const result = validateGroupsKnockoutStructure({
        championship: championship({ groupStageStatus: 'groups_generated' }),
        teams: validTeams(),
        matches: [match('m1', { stage: 'group', groupId: 'B', homeTeamId: 't1', awayTeamId: 't2' })],
      });

      expect(codes(result).errors).toContain('group_match_cross_group');
    });

    it('detecta partida knockout antes da hora', () => {
      const result = validateGroupsKnockoutStructure({
        championship: championship({ groupStageStatus: 'groups_generated', knockoutStageStatus: 'not_generated' }),
        teams: validTeams(),
        matches: [match('m1', { stage: 'knockout' })],
      });

      expect(codes(result).errors).toContain('knockout_match_before_transition');
    });

    it('detecta versoes estruturais incompativeis', () => {
      const result = validateGroupsKnockoutStructure({
        championship: championship({ groupStructureVersion: 1 }),
        teams: validTeams(),
        matches: [match('m1', { stage: 'group', groupId: 'A', structureVersion: 2 })],
      });

      expect(codes(result).errors).toContain('incompatible_structure_version');
    });

    it('detecta snapshot referido mas inexistente', () => {
      const result = validateGroupsKnockoutStructure({
        championship: championship({ knockoutStageStatus: 'generated' }),
        teams: validTeams(),
        matches: [match('m1', { stage: 'knockout', originSnapshotVersion: 99 })],
        snapshots: [snapshot()],
      });

      expect(codes(result).warnings).toContain('snapshot_reference_missing');
    });

    it('selectors estruturais agrupam sem listeners', () => {
      const champ = championship({ knockoutStageStatus: 'generated' });
      const matches = [
        match('g1', { stage: 'group', groupId: 'A' }),
        match('k1', { stage: 'knockout' }),
      ];

      expect(getChampionshipTeamsByGroup(champ, validTeams()).A).toHaveLength(2);
      expect(getGroupMatches(matches, 'A', champ)).toHaveLength(1);
      expect(getKnockoutMatches(matches, champ)).toHaveLength(1);
      expect(hasGeneratedGroups(championship({ groupStageStatus: 'groups_generated' }))).toBe(true);
      expect(hasStartedGroupStage(champ, [match('g1', { stage: 'group', groupId: 'A', status: 'ao_vivo' })])).toBe(
        true,
      );
      expect(hasGeneratedKnockout(champ)).toBe(true);
    });
  });

  describe('snapshot', () => {
    it('aceita contrato valido', () => {
      expect(validateGroupStageQualificationSnapshot(snapshot()).valid).toBe(true);
    });

    it('detecta time duplicado', () => {
      const base = snapshot();
      const result = validateGroupStageQualificationSnapshot({
        ...base,
        qualifiers: [base.qualifiers[0], { ...base.qualifiers[0] }],
      });

      expect(codes(result).errors).toContain('snapshot_duplicate_team');
    });

    it('detecta posicao invalida', () => {
      const base = snapshot();
      const result = validateGroupStageQualificationSnapshot({
        ...base,
        qualifiers: [{ ...base.qualifiers[0], position: 0 }],
      });

      expect(codes(result).errors).toContain('snapshot_invalid_position');
    });

    it('detecta grupo invalido', () => {
      const base = snapshot();
      const result = validateGroupStageQualificationSnapshot({
        ...base,
        qualifiers: [{ ...base.qualifiers[0], groupId: 'C' }],
      });

      expect(codes(result).errors).toContain('snapshot_invalid_group_id');
    });

    it('valida versionamento', () => {
      expect(codes(validateGroupStageQualificationSnapshot(snapshot({ version: 0 }))).errors).toContain(
        'snapshot_invalid_version',
      );
    });
  });
});
