/**
 * Bloco 10.4 — Camada de apresentação da fase de grupos + mata-mata.
 *
 * Funções PURAS que traduzem a saída do domínio já aprovado (10.1–10.3) em
 * rótulos e resumos consumíveis pela UI. Nenhuma regra de negócio nova:
 * standings, transição, distribuição e estrutura permanecem nos utils/services
 * testados. Aqui só transformamos dados em texto/estado de tela.
 */

import type {
  Championship,
  GroupQualifiedStatus,
  GroupStageCompletionIssue,
  GroupStageQualificationSnapshot,
  GroupStandingRow,
  GroupTiebreakReason,
  MatchModel,
  QualifiedTeamSnapshot,
  ResolvedChampionshipStage,
  Team,
} from '../types';
import { expectedGroupFixtureCount } from './groupStageFixtures';
import { DEFAULT_GROUP_STAGE_CONFIG } from './groupStageRules';
import {
  getChampionshipTeamsByGroup,
  getGroupMatches,
  normalizeChampionshipStructure,
  normalizeGroupId,
  SUPPORTED_GROUP_IDS,
} from './groupStageStructure';

export type SupportedGroupId = 'A' | 'B';

// ── Rótulos de formato e fase ────────────────────────────────────────────────

export const CHAMPIONSHIP_FORMAT_LABELS: Record<string, string> = {
  pontos_corridos: 'Pontos corridos',
  mata_mata: 'Mata-mata',
  grupos_e_mata_mata: 'Grupos + mata-mata',
};

export function getChampionshipFormatLabel(format?: string | null): string {
  if (!format) return '—';
  return CHAMPIONSHIP_FORMAT_LABELS[format] ?? format;
}

const STAGE_LABELS: Record<ResolvedChampionshipStage, string> = {
  registration: 'Inscrições',
  league: 'Pontos corridos',
  group_stage: 'Fase de grupos',
  group_stage_completed: 'Grupos concluídos',
  knockout: 'Mata-mata',
  completed: 'Encerrado',
};

export function getResolvedStageLabel(stage: ResolvedChampionshipStage): string {
  return STAGE_LABELS[stage] ?? '—';
}

// ── Rótulos de desempate (Parte 10) ──────────────────────────────────────────
// Texto curto e humano; nunca expõe hash, seed ou implementação.

const TIEBREAK_REASON_LABELS: Record<GroupTiebreakReason['type'], string> = {
  points: 'Definido por pontos',
  wins: 'À frente por número de vitórias',
  goal_difference: 'À frente por saldo de gols',
  goals_for: 'À frente por gols marcados',
  head_to_head: 'À frente no confronto direto',
  fewest_cards: 'Definido por cartões (fair play)',
  deterministic_draw: 'Definido por critério técnico',
};

export function getTiebreakReasonLabel(reason?: GroupTiebreakReason | null): string | null {
  if (!reason) return null;
  return TIEBREAK_REASON_LABELS[reason.type] ?? null;
}

/** true quando o desempate merece destaque explicativo ao usuário. */
export function isNotableTiebreak(reason?: GroupTiebreakReason | null): boolean {
  if (!reason) return false;
  return (
    reason.type === 'goal_difference' ||
    reason.type === 'head_to_head' ||
    reason.type === 'fewest_cards' ||
    reason.type === 'deterministic_draw'
  );
}

// ── Rótulos de status de classificação ───────────────────────────────────────

const QUALIFIED_STATUS_LABELS: Record<GroupQualifiedStatus, string> = {
  qualified: 'Classificado',
  not_qualified: 'Eliminado',
  undecided: 'Em disputa',
};

export function getQualifiedStatusLabel(status?: GroupQualifiedStatus | null): string {
  if (!status) return 'Em disputa';
  return QUALIFIED_STATUS_LABELS[status] ?? 'Em disputa';
}

/** Descrição textual acessível de uma linha da classificação (sem depender de cor). */
export function describeStandingRowForAccessibility(row: GroupStandingRow): string {
  const status = getQualifiedStatusLabel(row.qualifiedStatus);
  return (
    `${row.position}º lugar, ${row.teamName}. ` +
    `${row.points} pontos, ${row.played} jogos, saldo ${formatSigned(row.goalDifference)}. ${status}.`
  );
}

function formatSigned(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

// ── Rótulos de blockers e warnings da transição (Partes 16 e 17) ─────────────

const BLOCKER_LABELS: Partial<Record<GroupStageCompletionIssue['code'], string>> = {
  unsupported_format: 'Este campeonato não usa grupos + mata-mata.',
  unsupported_stage: 'O campeonato não está na fase de grupos.',
  groups_missing: 'Os grupos ainda não foram gerados.',
  fixtures_missing: 'As partidas dos grupos ainda não foram geradas.',
  partial_group_fixtures_detected: 'A estrutura de partidas dos grupos está incompleta.',
  unresolved_group_match: 'Ainda há partida de grupo agendada sem resultado.',
  live_match_exists: 'Há uma partida ao vivo em andamento.',
  postponed_group_match: 'Há partida de grupo adiada aguardando resolução.',
  cancelled_group_match_unresolved: 'Há partida de grupo cancelada que precisa de resolução.',
  invalid_group_size: 'Um dos grupos não tem times suficientes.',
  invalid_standings: 'A classificação está inconsistente.',
  invalid_score: 'Há partida finalizada com placar inválido.',
  invalid_walkover: 'Há um W.O. inconsistente.',
  duplicate_group_match: 'Há partida duplicada em um grupo.',
  group_match_cross_group: 'Há partida com time fora do grupo.',
  team_missing_group: 'Há time sem grupo após a geração.',
  assignment_version_mismatch: 'Um time está com versão de grupo divergente.',
  incompatible_structure_version: 'A estrutura do campeonato está desatualizada.',
  knockout_already_generated: 'O mata-mata já foi gerado.',
  invalid_qualifier_count: 'A quantidade de classificados é insuficiente.',
};

export function getBlockerLabel(issue: GroupStageCompletionIssue): string {
  return BLOCKER_LABELS[issue.code] ?? issue.message ?? 'Existe um bloqueio para concluir a fase.';
}

const WARNING_LABELS: Partial<Record<GroupStageCompletionIssue['code'], string>> = {
  card_tiebreak_warning: 'Um classificado foi definido por cartões (fair play).',
  deterministic_draw_warning: 'Um classificado foi definido por critério técnico.',
  deterministic_qualifier_warning: 'Um classificado foi definido por critério técnico.',
  structural_bye_warning: 'O mata-mata terá BYE (classificação automática).',
  group_size_warning: 'Os grupos têm quantidades diferentes de times.',
};

export function getWarningLabel(issue: GroupStageCompletionIssue): string {
  return WARNING_LABELS[issue.code] ?? issue.message ?? 'Aviso informativo.';
}

// ── Resumo de fase para o dashboard (Parte 5) ────────────────────────────────

export type GroupStageAction =
  | 'generate_groups'
  | 'view_groups'
  | 'generate_fixtures'
  | 'view_fixtures'
  | 'view_standings'
  | 'review_and_complete'
  | 'view_bracket';

export interface GroupProgress {
  groupId: SupportedGroupId;
  teamCount: number;
  resolved: number;
  expected: number;
}

export interface GroupStageDashboardSummary {
  isGroupsFormat: boolean;
  formatLabel: string;
  stage: ResolvedChampionshipStage;
  phaseLabel: string;
  groupStageStatus: NonNullable<Championship['groupStageStatus']>;
  knockoutStageStatus: NonNullable<Championship['knockoutStageStatus']>;
  groupCount: number;
  qualifiersPerGroup: number;
  hasGeneratedGroups: boolean;
  hasGeneratedFixtures: boolean;
  hasGeneratedKnockout: boolean;
  readyToComplete: boolean;
  progressByGroup: GroupProgress[];
  resolvedTotal: number;
  expectedTotal: number;
  /** Ações que fazem sentido no estado atual (para o organizador dono). */
  organizerActions: GroupStageAction[];
  /** Ações de visualização disponíveis a qualquer perfil. */
  viewerActions: GroupStageAction[];
}

/** Conta partidas de grupo resolvidas para exibir progresso (não é regra de negócio). */
function isSettledForProgress(match: MatchModel): boolean {
  return match.status === 'finalizado' || match.status === 'wo';
}

export function summarizeGroupStageDashboard(
  championship: Championship,
  teams: Team[],
  matches: MatchModel[],
): GroupStageDashboardSummary {
  const structure = normalizeChampionshipStructure(championship);
  const isGroupsFormat = structure.format === 'grupos_e_mata_mata';
  const config = championship.groupStageConfig ?? DEFAULT_GROUP_STAGE_CONFIG;

  const groups = getChampionshipTeamsByGroup(championship, teams);
  const progressByGroup: GroupProgress[] = [];
  let resolvedTotal = 0;
  let expectedTotal = 0;

  for (const groupId of SUPPORTED_GROUP_IDS) {
    const teamsInGroup = groups[groupId];
    const expected = expectedGroupFixtureCount(teamsInGroup.length);
    const groupMatches = getGroupMatches(matches, groupId, championship);
    const resolved = groupMatches.filter(isSettledForProgress).length;
    progressByGroup.push({ groupId, teamCount: teamsInGroup.length, resolved, expected });
    resolvedTotal += resolved;
    expectedTotal += expected;
  }

  const groupStageStatus = championship.groupStageStatus ?? 'not_generated';
  const knockoutStageStatus = championship.knockoutStageStatus ?? 'not_generated';
  const readyToComplete =
    isGroupsFormat &&
    structure.hasGeneratedGroups &&
    (championship.groupFixturesVersion ?? 0) >= 1 &&
    !structure.hasGeneratedKnockout &&
    expectedTotal > 0 &&
    resolvedTotal >= expectedTotal;

  const organizerActions: GroupStageAction[] = [];
  const viewerActions: GroupStageAction[] = [];

  if (isGroupsFormat) {
    if (structure.hasGeneratedKnockout) {
      viewerActions.push('view_bracket', 'view_standings');
    } else if (!structure.hasGeneratedGroups) {
      organizerActions.push('generate_groups');
    } else if ((championship.groupFixturesVersion ?? 0) < 1) {
      organizerActions.push('view_groups', 'generate_fixtures');
      viewerActions.push('view_groups');
    } else {
      viewerActions.push('view_groups', 'view_standings', 'view_fixtures');
      if (readyToComplete) organizerActions.push('review_and_complete');
    }
  }

  return {
    isGroupsFormat,
    formatLabel: getChampionshipFormatLabel(structure.format),
    stage: structure.stage,
    phaseLabel: getResolvedStageLabel(structure.stage),
    groupStageStatus,
    knockoutStageStatus,
    groupCount: config.groupCount,
    qualifiersPerGroup: config.qualifiersPerGroup,
    hasGeneratedGroups: structure.hasGeneratedGroups,
    hasGeneratedFixtures: (championship.groupFixturesVersion ?? 0) >= 1,
    hasGeneratedKnockout: structure.hasGeneratedKnockout,
    readyToComplete,
    progressByGroup,
    resolvedTotal,
    expectedTotal,
    organizerActions,
    viewerActions,
  };
}

// ── Filtro de fixtures por grupo (Parte 13) ──────────────────────────────────

export type GroupFixtureFilter = 'todas' | 'A' | 'B' | 'proximas' | 'finalizadas';

/**
 * Filtra e ordena as partidas de grupo para exibição. Pura: reutiliza
 * `getGroupMatches`/`normalizeGroupId` já testados; não reimplementa stage.
 */
export function filterGroupFixtures(
  matches: MatchModel[],
  championship: Pick<Championship, 'id' | 'format'>,
  filter: GroupFixtureFilter,
): MatchModel[] {
  const championshipId = championship.id;
  let list = getGroupMatches(matches, null, championship);

  if (filter === 'A' || filter === 'B') {
    list = list.filter((m) => normalizeGroupId(m.groupId, championshipId) === filter);
  } else if (filter === 'proximas') {
    list = list.filter((m) => m.status === 'agendado' || m.status === 'adiado');
  } else if (filter === 'finalizadas') {
    list = list.filter((m) => m.status === 'finalizado' || m.status === 'wo');
  }

  return [...list].sort((a, b) => {
    const ra = a.groupRound ?? a.round ?? 0;
    const rb = b.groupRound ?? b.round ?? 0;
    if (ra !== rb) return ra - rb;
    const ga = normalizeGroupId(a.groupId, championshipId) ?? 'A';
    const gb = normalizeGroupId(b.groupId, championshipId) ?? 'A';
    return ga.localeCompare(gb);
  });
}

export const GROUP_STAGE_ACTION_LABELS: Record<GroupStageAction, string> = {
  generate_groups: 'Gerar grupos',
  view_groups: 'Visualizar grupos',
  generate_fixtures: 'Gerar partidas dos grupos',
  view_fixtures: 'Ver partidas',
  view_standings: 'Ver classificação',
  review_and_complete: 'Revisar e concluir fase',
  view_bracket: 'Ver chave do mata-mata',
};

// ── Origem do classificado no mata-mata (Partes 10 e 11) ─────────────────────

/** Rótulo mostrado no slot de BYE — nunca "time × vazio" nem placar falso. */
export const BYE_QUALIFIER_LABEL = 'Classificado automaticamente';

/** Rótulo curto de origem: "1º Grupo A". Puro; a posição vem do snapshot. */
export function getQualifierOriginLabel(position: number, groupId: SupportedGroupId): string {
  return `${position}º Grupo ${groupId}`;
}

/**
 * Mapa teamId → origem ("1º Grupo A") lido do snapshot congelado da transição.
 * O snapshot é a fonte de leitura oficial da chave; não recalculamos posição
 * nem reordenamos classificados aqui.
 */
export function buildQualifierOriginMap(
  snapshot: Pick<GroupStageQualificationSnapshot, 'championshipId' | 'qualifiers'> | null | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  if (!snapshot) return map;
  for (const qualifier of snapshot.qualifiers) {
    const group = normalizeSnapshotGroupId(qualifier, snapshot.championshipId);
    const position = qualifier.groupPosition ?? qualifier.position;
    if (!group || position == null) continue;
    map.set(qualifier.teamId, getQualifierOriginLabel(position, group));
  }
  return map;
}

function normalizeSnapshotGroupId(
  qualifier: QualifiedTeamSnapshot,
  championshipId: string,
): SupportedGroupId | null {
  if (qualifier.groupId === 'A' || qualifier.groupId === 'B') return qualifier.groupId;
  const normalized = normalizeGroupId(qualifier.groupId, championshipId);
  return normalized === 'A' || normalized === 'B' ? normalized : null;
}

// ── Mensagens amigáveis de erros tipados dos services (Parte 14) ─────────────
// Cobre GroupAssignmentErrorCode | GroupFixturesErrorCode | GroupStageTransitionErrorCode.
// Nunca expõe stack, código cru ou mensagem do Firebase.

const GROUP_SERVICE_ERROR_MESSAGES: Record<string, string> = {
  // Permissão / formato / carga
  not_owner: 'Apenas o organizador dono do campeonato pode fazer isto.',
  unsupported_format: 'Este campeonato não usa o formato grupos + mata-mata.',
  championship_missing: 'Campeonato não encontrado. Recarregue e tente novamente.',
  // Geração de grupos
  group_assignments_already_generated: 'Os grupos já foram gerados.',
  group_matches_already_exist: 'As partidas dos grupos já existem.',
  championship_already_started: 'O campeonato já começou; o sorteio dos grupos está congelado.',
  stale_generation_version: 'Os grupos mudaram enquanto você olhava. Recarregue e tente novamente.',
  live_match_exists: 'Há uma partida ao vivo. Finalize-a antes de continuar.',
  finished_match_exists: 'Já existem partidas finalizadas; a geração está bloqueada.',
  walkover_match_exists: 'Há um W.O. registrado; a geração está bloqueada.',
  group_match_events_exist: 'Já há eventos registrados em partidas de grupo.',
  insufficient_teams_for_groups: 'São necessários pelo menos 4 times aprovados.',
  too_many_teams_for_championship: 'Há mais times aprovados do que o limite do campeonato.',
  duplicate_team_id: 'Há times duplicados na inscrição.',
  invalid_team: 'Um dos times está inconsistente. Revise as inscrições.',
  // Geração de fixtures
  group_assignments_missing: 'Gere os grupos antes de criar as partidas.',
  group_assignment_log_missing: 'O registro do sorteio dos grupos não foi encontrado.',
  invalid_group_assignment: 'A distribuição dos grupos está inconsistente.',
  invalid_group_fixture: 'A estrutura das partidas dos grupos está inconsistente.',
  partial_group_fixtures_detected: 'As partidas dos grupos estão incompletas.',
  stale_fixtures_version: 'As partidas mudaram. Recarregue e tente novamente.',
  knockout_matches_already_exist: 'As partidas do mata-mata já existem.',
  groups_knockout_requires_group_fixture_service:
    'Use o fluxo de partidas dos grupos para este formato.',
  // Transição / mata-mata
  knockout_already_generated: 'O mata-mata já foi gerado.',
  group_stage_already_completed: 'A fase de grupos já foi concluída. Veja a chave existente.',
  group_stage_snapshot_conflict: 'A classificação mudou desde a última tentativa. Recarregue e revise.',
  knockout_structure_conflict: 'A chave do mata-mata está em conflito. Recarregue e tente novamente.',
  stale_group_transition_version: 'A conclusão mudou. Recarregue e tente novamente.',
  snapshot_invalid: 'Não foi possível congelar a classificação. Revise os bloqueios.',
  bracket_invalid: 'Não foi possível montar a chave. Revise os bloqueios.',
  transition_log_conflict: 'A conclusão já foi registrada. Veja a chave existente.',
  group_stage_not_ready: 'A fase de grupos ainda não está pronta para concluir.',
  group_stage_locked_after_knockout_generation:
    'A fase de grupos está bloqueada após a geração do mata-mata.',
  group_redraw_not_implemented: 'Refazer o sorteio dos grupos não é suportado.',
};

/** Traduz um código de erro tipado dos services em mensagem amigável (§14). */
export function getGroupServiceErrorMessage(
  code: string | null | undefined,
  fallback = 'Não foi possível concluir a ação. Tente novamente.',
): string {
  if (!code) return fallback;
  return GROUP_SERVICE_ERROR_MESSAGES[code] ?? fallback;
}
