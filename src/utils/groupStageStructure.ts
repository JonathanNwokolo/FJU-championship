import type {
  Championship,
  GroupStageConfig,
  GroupStageQualificationSnapshot,
  GroupStructureIssue,
  GroupStructureIssueCode,
  MatchModel,
  MatchStage,
  QualifiedTeamSnapshot,
  ResolvedChampionshipStage,
  Team,
} from '../types';
import { DEFAULT_GROUP_STAGE_CONFIG, normalizeGroupStageConfig } from './groupStageRules';
import { getGroupId } from './groupStageIds';

export const SUPPORTED_GROUP_IDS = ['A', 'B'] as const;
export const GROUP_STRUCTURE_VERSION = 1;
export const MIN_TEAMS_PER_GROUP = 2;

type SupportedGroupId = typeof SUPPORTED_GROUP_IDS[number];
type ChampionshipLike = Partial<Championship> & Pick<Championship, 'id'>;

export interface NormalizedChampionshipStructure {
  original: Partial<Championship>;
  format: Championship['format'] | null;
  stage: ResolvedChampionshipStage;
  groupStageConfig?: GroupStageConfig;
  defaultGroupStageConfig: GroupStageConfig;
  groupStageStatus: Championship['groupStageStatus'];
  knockoutStageStatus: Championship['knockoutStageStatus'];
  hasGeneratedGroups: boolean;
  hasGeneratedKnockout: boolean;
}

export interface NormalizedTeamGroupAssignment {
  original: Partial<Team>;
  groupId: SupportedGroupId | null;
  groupSeed: number | null;
  groupAssignmentVersion?: number;
  valid: boolean;
  issues: GroupStructureIssue[];
}

export interface NormalizedMatchStage {
  original: Partial<MatchModel>;
  stage: MatchStage | null;
  groupId: SupportedGroupId | null;
  valid: boolean;
  issues: GroupStructureIssue[];
}

export interface GroupStructureValidationInput {
  championship: Partial<Championship> & { id: string };
  teams: Team[];
  matches: MatchModel[];
  snapshots?: GroupStageQualificationSnapshot[];
}

export interface GroupStructureValidationResult {
  valid: boolean;
  errors: GroupStructureIssue[];
  warnings: GroupStructureIssue[];
}

export function normalizeChampionshipStructure(
  championship: Partial<Championship>,
): NormalizedChampionshipStructure {
  const format = isChampionshipFormat(championship.format) ? championship.format : null;
  const generatedGroups = hasGeneratedGroups(championship);
  const generatedKnockout = hasGeneratedKnockout(championship);

  return {
    original: championship,
    format,
    stage: resolveChampionshipStage(championship, generatedGroups, generatedKnockout),
    groupStageConfig: championship.groupStageConfig
      ? (normalizeGroupStageConfig(championship.groupStageConfig) as GroupStageConfig)
      : undefined,
    defaultGroupStageConfig: DEFAULT_GROUP_STAGE_CONFIG,
    groupStageStatus: championship.groupStageStatus,
    knockoutStageStatus: championship.knockoutStageStatus,
    hasGeneratedGroups: generatedGroups,
    hasGeneratedKnockout: generatedKnockout,
  };
}

export function normalizeTeamGroupAssignment(
  team: Partial<Team>,
  championship?: Partial<Championship>,
): NormalizedTeamGroupAssignment {
  const issues: GroupStructureIssue[] = [];
  const groupId = normalizeGroupId(team.groupId, championship?.id);
  const hasGroupId = team.groupId !== undefined && team.groupId !== null && team.groupId !== '';

  if (hasGroupId && championship?.format && championship.format !== 'grupos_e_mata_mata') {
    issues.push(issue('team_group_not_allowed_for_format', 'Group assignment is only valid in groups + knockout championships.', 'team', team.id, 'groupId'));
  }

  if (hasGroupId && !groupId) {
    issues.push(issue('team_invalid_group_id', 'Team groupId must be A, B, or the deterministic group id for A/B.', 'team', team.id, 'groupId', { groupId: team.groupId }));
  }

  const groupSeed = team.groupSeed ?? null;
  if (groupSeed !== null && (!Number.isInteger(groupSeed) || groupSeed < 1)) {
    issues.push(issue('team_invalid_group_seed', 'Team groupSeed must be a positive integer when present.', 'team', team.id, 'groupSeed', { groupSeed }));
  }

  return {
    original: team,
    groupId,
    groupSeed,
    groupAssignmentVersion: team.groupAssignmentVersion,
    valid: issues.length === 0,
    issues,
  };
}

export function normalizeMatchStage(
  match: Partial<MatchModel>,
  championship?: Partial<Championship>,
): NormalizedMatchStage {
  const issues: GroupStructureIssue[] = [];
  const groupId = normalizeGroupId(match.groupId, championship?.id);
  let stage: MatchStage | null = isMatchStage(match.stage) ? match.stage : null;

  if (!stage) {
    issues.push(issue('legacy_match_missing_stage', 'Legacy match has no explicit stage.', 'match', match.id, 'stage'));
    if (championship?.format === 'mata_mata') {
      stage = 'knockout';
    } else if (championship?.format === 'grupos_e_mata_mata') {
      stage = groupId ? 'group' : null;
    } else {
      stage = 'league';
    }
  }

  if (stage === 'group') {
    if (championship?.format && championship.format !== 'grupos_e_mata_mata') {
      issues.push(issue('group_match_in_incompatible_championship', 'Group match stage is not compatible with this championship format.', 'match', match.id, 'stage'));
    }
    if (!groupId) {
      issues.push(issue('group_match_missing_group_id', 'Group match requires a valid groupId.', 'match', match.id, 'groupId', { groupId: match.groupId }));
    }
  }

  return {
    original: match,
    stage,
    groupId,
    valid: !issues.some((item) => item.code !== 'legacy_match_missing_stage'),
    issues,
  };
}

export function validateGroupsKnockoutStructure(
  input: GroupStructureValidationInput,
): GroupStructureValidationResult {
  const { championship, teams, matches, snapshots = [] } = input;
  const errors: GroupStructureIssue[] = [];
  const warnings: GroupStructureIssue[] = [];
  const normalizedChampionship = normalizeChampionshipStructure(championship);
  const isGroupsFormat = normalizedChampionship.format === 'grupos_e_mata_mata';

  validateChampionship(championship, isGroupsFormat, errors);

  const teamGroups = validateTeams(championship, teams, isGroupsFormat, errors);
  validateGroupSizes(championship, teamGroups, isGroupsFormat, normalizedChampionship.hasGeneratedGroups, errors);
  validateMatches(championship, matches, teamGroups, isGroupsFormat, snapshots, errors, warnings);
  validateSnapshots(snapshots, championship.id, warnings);

  return { valid: errors.length === 0, errors, warnings };
}

export function getChampionshipTeamsByGroup(
  championship: Partial<Championship>,
  teams: Team[],
): Record<SupportedGroupId, Team[]> {
  const grouped: Record<SupportedGroupId, Team[]> = { A: [], B: [] };

  for (const team of teams) {
    const groupId = normalizeGroupId(team.groupId, championship.id);
    if (groupId) grouped[groupId].push(team);
  }

  return grouped;
}

export function getMatchesByStage(
  matches: MatchModel[],
  stage: MatchStage,
  championship?: Partial<Championship>,
): MatchModel[] {
  return matches.filter((match) => normalizeMatchStage(match, championship).stage === stage);
}

export function getGroupMatches(
  matches: MatchModel[],
  groupId?: string | null,
  championship?: Partial<Championship>,
): MatchModel[] {
  return getMatchesByStage(matches, 'group', championship).filter((match) => {
    if (!groupId) return true;
    return normalizeGroupId(match.groupId, championship?.id) === normalizeGroupId(groupId, championship?.id);
  });
}

export function getKnockoutMatches(
  matches: MatchModel[],
  championship?: Partial<Championship>,
): MatchModel[] {
  return getMatchesByStage(matches, 'knockout', championship);
}

export function getCurrentChampionshipStage(
  championship: Partial<Championship>,
): ResolvedChampionshipStage {
  return normalizeChampionshipStructure(championship).stage;
}

export function hasGeneratedGroups(championship?: Partial<Championship> | null): boolean {
  if (!championship) return false;
  return (
    championship.groupStageStatus === 'groups_generated' ||
    championship.groupStageStatus === 'fixtures_generated' ||
    championship.groupStageStatus === 'in_progress' ||
    championship.groupStageStatus === 'ready_to_complete' ||
    championship.groupStageStatus === 'completed' ||
    (typeof championship.groupGenerationVersion === 'number' && championship.groupGenerationVersion > 0) ||
    championship.groupStageLockedAt != null ||
    Boolean(championship.groups && Object.keys(championship.groups).length > 0)
  );
}

export function hasStartedGroupStage(
  championship?: Partial<Championship> | null,
  matches: MatchModel[] = [],
): boolean {
  if (!championship) return false;
  if (
    championship.groupStageStatus === 'in_progress' ||
    championship.groupStageStatus === 'ready_to_complete' ||
    championship.groupStageStatus === 'completed'
  ) {
    return true;
  }

  return matches.some((match) => {
    const normalized = normalizeMatchStage(match, championship);
    return normalized.stage === 'group' && match.status !== 'agendado';
  });
}

export function hasGeneratedKnockout(championship?: Partial<Championship> | null): boolean {
  if (!championship) return false;
  return (
    championship.knockoutStageStatus === 'generated' ||
    championship.knockoutStageStatus === 'in_progress' ||
    championship.knockoutStageStatus === 'completed' ||
    championship.knockoutGeneratedAt != null ||
    championship.stage === 'knockout' ||
    championship.stage === 'completed' ||
    typeof championship.knockoutStartRound === 'number'
  );
}

export function normalizeGroupId(
  groupId?: string | null,
  championshipId?: string,
): SupportedGroupId | null {
  if (!groupId) return null;
  const normalized = groupId.trim().toUpperCase();
  if (normalized === 'A' || normalized === 'B') return normalized;

  if (championshipId) {
    if (groupId === getGroupId(championshipId, 'A')) return 'A';
    if (groupId === getGroupId(championshipId, 'B')) return 'B';
  }

  return null;
}

export function validateGroupStageQualificationSnapshot(
  snapshot: GroupStageQualificationSnapshot,
): GroupStructureValidationResult {
  const errors: GroupStructureIssue[] = [];
  validateSnapshot(snapshot, errors);
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function serializeGroupStageQualificationSnapshot(
  snapshot: GroupStageQualificationSnapshot,
): GroupStageQualificationSnapshot {
  return {
    ...snapshot,
    qualifiers: snapshot.qualifiers.map((qualifier) => ({ ...qualifier })),
  };
}

function resolveChampionshipStage(
  championship: Partial<Championship>,
  generatedGroups: boolean,
  generatedKnockout: boolean,
): ResolvedChampionshipStage {
  if (championship.stage) return championship.stage;
  if (championship.status === 'finalizado') return 'completed';

  if (championship.format === 'pontos_corridos') {
    return championship.status === 'em_andamento' ? 'league' : 'registration';
  }

  if (championship.format === 'mata_mata') {
    return championship.status === 'em_andamento' ? 'knockout' : 'registration';
  }

  if (championship.format === 'grupos_e_mata_mata') {
    if (generatedKnockout) return 'knockout';
    if (championship.groupStageStatus === 'completed' || championship.groupStageComplete) {
      return 'group_stage_completed';
    }
    if (generatedGroups) return 'group_stage';
    return 'registration';
  }

  return championship.status === 'em_andamento' ? 'league' : 'registration';
}

function validateChampionship(
  championship: Partial<Championship>,
  isGroupsFormat: boolean,
  errors: GroupStructureIssue[],
) {
  if (!isGroupsFormat) return;

  if (!championship.groupStageConfig) {
    errors.push(issue('groups_championship_missing_config', 'Groups + knockout championship must define groupStageConfig.', 'championship', championship.id, 'groupStageConfig'));
    return;
  }

  if (championship.groupStageConfig.groupCount !== 2) {
    errors.push(issue('groups_championship_invalid_group_count', 'This structure supports exactly 2 groups.', 'championship', championship.id, 'groupStageConfig.groupCount', { groupCount: championship.groupStageConfig.groupCount }));
  }
}

function validateTeams(
  championship: ChampionshipLike,
  teams: Team[],
  isGroupsFormat: boolean,
  errors: GroupStructureIssue[],
): Record<SupportedGroupId, Team[]> {
  const teamGroups: Record<SupportedGroupId, Team[]> = { A: [], B: [] };
  const seenTeamIds = new Set<string>();
  const generatedGroups = hasGeneratedGroups(championship);

  for (const team of teams) {
    if (seenTeamIds.has(team.id)) {
      errors.push(issue('duplicate_team_id', 'Team appears more than once in the structural input.', 'team', team.id));
      continue;
    }
    seenTeamIds.add(team.id);

    const assignment = normalizeTeamGroupAssignment(team, championship);
    for (const assignmentIssue of assignment.issues) {
      errors.push(assignmentIssue);
    }

    if (!isGroupsFormat && team.groupId) {
      errors.push(issue('team_group_not_allowed_for_format', 'Team groupId is only valid in groups + knockout championships.', 'team', team.id, 'groupId'));
      continue;
    }

    if (!isGroupsFormat) continue;

    if (!assignment.groupId) {
      if (generatedGroups) {
        errors.push(issue('team_missing_group_after_generation', 'Team has no group after groups were generated.', 'team', team.id, 'groupId'));
      }
      continue;
    }

    teamGroups[assignment.groupId].push(team);
  }

  return teamGroups;
}

function validateGroupSizes(
  championship: Partial<Championship>,
  teamGroups: Record<SupportedGroupId, Team[]>,
  isGroupsFormat: boolean,
  generatedGroups: boolean,
  errors: GroupStructureIssue[],
) {
  if (!isGroupsFormat || !generatedGroups) return;

  const sizes = SUPPORTED_GROUP_IDS.map((groupId) => teamGroups[groupId].length);
  const smallest = Math.min(...sizes);
  const largest = Math.max(...sizes);
  const assignedTotal = sizes.reduce((sum, size) => sum + size, 0);

  if (largest - smallest > 1) {
    errors.push(issue('group_size_imbalance', 'Group sizes cannot differ by more than 1.', 'championship', championship.id, 'groups', { sizes }));
  }

  for (const groupId of SUPPORTED_GROUP_IDS) {
    const size = teamGroups[groupId].length;
    if (size > 0 && size < MIN_TEAMS_PER_GROUP) {
      errors.push(issue('group_below_minimum', 'Each generated group must have at least 2 teams.', 'championship', championship.id, 'groups', { groupId, size }));
    }
  }

  if (typeof championship.maxTeams === 'number') {
    const maxPerGroup = Math.ceil(championship.maxTeams / SUPPORTED_GROUP_IDS.length);
    for (const groupId of SUPPORTED_GROUP_IDS) {
      const size = teamGroups[groupId].length;
      if (size > maxPerGroup) {
        errors.push(issue('group_above_allowed', 'Group size exceeds the championship maxTeams distribution.', 'championship', championship.id, 'groups', { groupId, size, maxPerGroup }));
      }
    }
  } else if (assignedTotal > 0) {
    const maxBalancedGroupSize = Math.ceil(assignedTotal / SUPPORTED_GROUP_IDS.length);
    for (const groupId of SUPPORTED_GROUP_IDS) {
      const size = teamGroups[groupId].length;
      if (size > maxBalancedGroupSize + 1) {
        errors.push(issue('group_above_allowed', 'Group size is above the balanced structural allowance.', 'championship', championship.id, 'groups', { groupId, size, maxBalancedGroupSize }));
      }
    }
  }
}

function validateMatches(
  championship: ChampionshipLike,
  matches: MatchModel[],
  teamGroups: Record<SupportedGroupId, Team[]>,
  isGroupsFormat: boolean,
  snapshots: GroupStageQualificationSnapshot[],
  errors: GroupStructureIssue[],
  warnings: GroupStructureIssue[],
) {
  const teamGroupById = new Map<string, SupportedGroupId>();
  for (const groupId of SUPPORTED_GROUP_IDS) {
    for (const team of teamGroups[groupId]) {
      teamGroupById.set(team.id, groupId);
    }
  }

  const snapshotVersions = new Set(snapshots.map((snapshot) => snapshot.version));

  for (const match of matches) {
    const normalized = normalizeMatchStage(match, championship);
    if (!match.stage) {
      warnings.push(issue('legacy_match_missing_stage', 'Legacy match has no explicit stage.', 'match', match.id, 'stage'));
    }

    if (normalized.stage === 'group') {
      if (!isGroupsFormat) {
        errors.push(issue('group_match_in_incompatible_championship', 'Group match belongs to a non-groups championship.', 'match', match.id, 'stage'));
      }

      const matchGroupId = normalized.groupId;
      if (!matchGroupId) {
        errors.push(issue('group_match_missing_group_id', 'Group match requires groupId.', 'match', match.id, 'groupId', { groupId: match.groupId }));
      }

      if (match.groupId && !matchGroupId) {
        errors.push(issue('match_group_id_unknown', 'Match groupId is not part of the supported groups.', 'match', match.id, 'groupId', { groupId: match.groupId }));
      }

      const homeGroup = teamGroupById.get(match.homeTeamId);
      const awayGroup = teamGroupById.get(match.awayTeamId);
      if (matchGroupId && homeGroup && awayGroup && (homeGroup !== matchGroupId || awayGroup !== matchGroupId)) {
        errors.push(issue('group_match_cross_group', 'Group match teams must belong to the same declared group.', 'match', match.id, 'groupId', { matchGroupId, homeGroup, awayGroup }));
      }
    }

    if (normalized.stage === 'knockout' && isGroupsFormat && !hasGeneratedKnockout(championship)) {
      errors.push(issue('knockout_match_before_transition', 'Knockout match exists before knockout generation.', 'match', match.id, 'stage'));
    }

    if (
      match.structureVersion !== undefined &&
      championship.groupStructureVersion !== undefined &&
      match.structureVersion !== championship.groupStructureVersion
    ) {
      errors.push(issue('incompatible_structure_version', 'Match structureVersion does not match the championship structure version.', 'match', match.id, 'structureVersion', { matchVersion: match.structureVersion, championshipVersion: championship.groupStructureVersion }));
    }

    if (
      match.originSnapshotVersion != null &&
      snapshots.length > 0 &&
      !snapshotVersions.has(match.originSnapshotVersion)
    ) {
      warnings.push(issue('snapshot_reference_missing', 'Match references a snapshot version that was not provided.', 'match', match.id, 'originSnapshotVersion', { originSnapshotVersion: match.originSnapshotVersion }));
    }
  }
}

function validateSnapshots(
  snapshots: GroupStageQualificationSnapshot[],
  championshipId: string,
  warnings: GroupStructureIssue[],
) {
  for (const snapshot of snapshots) {
    if (snapshot.championshipId !== championshipId) {
      warnings.push(issue('snapshot_reference_missing', 'Snapshot belongs to another championship.', 'snapshot', `${snapshot.version}`, 'championshipId', { snapshotChampionshipId: snapshot.championshipId, championshipId }));
    }
  }
}

function validateSnapshot(
  snapshot: GroupStageQualificationSnapshot,
  errors: GroupStructureIssue[],
) {
  if (!Number.isInteger(snapshot.version) || snapshot.version < 1) {
    errors.push(issue('snapshot_invalid_version', 'Snapshot version must be a positive integer.', 'snapshot', `${snapshot.version}`, 'version'));
  }

  if (snapshot.configVersion !== 1) {
    errors.push(issue('snapshot_invalid_config_version', 'Snapshot configVersion must be 1.', 'snapshot', `${snapshot.version}`, 'configVersion'));
  }

  const seenTeamIds = new Set<string>();
  for (const qualifier of snapshot.qualifiers) {
    validateQualifier(qualifier, snapshot.version, seenTeamIds, errors);
  }
}

function validateQualifier(
  qualifier: QualifiedTeamSnapshot,
  snapshotVersion: number,
  seenTeamIds: Set<string>,
  errors: GroupStructureIssue[],
) {
  if (seenTeamIds.has(qualifier.teamId)) {
    errors.push(issue('snapshot_duplicate_team', 'Snapshot cannot contain the same team twice.', 'snapshot', `${snapshotVersion}`, 'qualifiers', { teamId: qualifier.teamId }));
  }
  seenTeamIds.add(qualifier.teamId);

  const position = qualifier.groupPosition ?? qualifier.position;
  if (!Number.isInteger(position) || (position ?? 0) < 1) {
    errors.push(issue('snapshot_invalid_position', 'Qualifier position must be a positive integer.', 'snapshot', `${snapshotVersion}`, 'position', { teamId: qualifier.teamId, position: qualifier.position }));
  }

  if (!normalizeGroupId(qualifier.groupId)) {
    errors.push(issue('snapshot_invalid_group_id', 'Qualifier groupId must be A or B.', 'snapshot', `${snapshotVersion}`, 'groupId', { teamId: qualifier.teamId, groupId: qualifier.groupId }));
  }
}

function isChampionshipFormat(value: unknown): value is Championship['format'] {
  return value === 'pontos_corridos' || value === 'mata_mata' || value === 'grupos_e_mata_mata';
}

function isMatchStage(value: unknown): value is MatchStage {
  return value === 'league' || value === 'group' || value === 'knockout';
}

function issue(
  code: GroupStructureIssueCode,
  message: string,
  entity?: GroupStructureIssue['entity'],
  entityId?: string,
  field?: string,
  details?: Record<string, unknown>,
): GroupStructureIssue {
  return { code, message, entity, entityId, field, details };
}
