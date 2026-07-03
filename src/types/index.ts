import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'organizador' | 'capitao' | 'atleta';

export interface AppUser {
  id: string;
  name: string;
  email?: string;
  role: UserRole;
  photoUrl?: string;
  teamId?: string | null;
}

export type ChampionshipFormat = 'pontos_corridos' | 'mata_mata' | 'grupos_e_mata_mata';
export type ChampionshipStatus = 'inscricoes_abertas' | 'em_andamento' | 'finalizado';
export type ChampionshipStage =
  | 'registration'
  | 'group_stage'
  | 'group_stage_completed'
  | 'knockout'
  | 'completed';
export type MatchStage = 'league' | 'group' | 'knockout';
export type ResolvedChampionshipStage = ChampionshipStage | 'league';
export type GroupDrawMethod = 'random';
export type GroupTiebreaker =
  | 'points'
  | 'wins'
  | 'goal_difference'
  | 'goals_for'
  | 'head_to_head'
  | 'fewest_cards'
  | 'deterministic_draw';

export interface GroupStageConfig {
  version: 1;
  groupCount: 2;
  qualifiersPerGroup: number;
  includeBestThirdPlaced: false;
  bestThirdPlacedCount: 0;
  drawMethod: GroupDrawMethod;
  tiebreakers: GroupTiebreaker[];
}

export type GroupStageStatus =
  | 'not_generated'
  | 'groups_generated'
  | 'fixtures_generated'
  | 'in_progress'
  | 'ready_to_complete'
  | 'completed';

export type KnockoutStageStatus =
  | 'not_generated'
  | 'generated'
  | 'in_progress'
  | 'completed';

export type GroupStageErrorCode =
  | 'invalid_group_count'
  | 'insufficient_teams_for_groups'
  | 'too_many_teams_for_championship'
  | 'invalid_qualifiers_per_group'
  | 'best_third_placed_not_supported'
  | 'missing_tiebreakers'
  | 'duplicate_tiebreaker'
  | 'unsupported_tiebreaker_order'
  | 'invalid_draw_method'
  | 'invalid_group_stage_config_version'
  | 'group_stage_already_started'
  | 'group_stage_not_ready'
  | 'group_stage_locked_after_knockout_generation'
  | 'invalid_group_assignment'
  | 'invalid_group_fixture';

export type GroupStageCompletionErrorCode =
  | GroupStageErrorCode
  | 'championship_missing'
  | 'not_owner'
  | 'unsupported_format'
  | 'unsupported_stage'
  | 'groups_missing'
  | 'fixtures_missing'
  | 'invalid_group_size'
  | 'team_missing_group'
  | 'duplicate_team_id'
  | 'assignment_version_mismatch'
  | 'partial_group_fixtures_detected'
  | 'group_match_missing'
  | 'duplicate_group_match'
  | 'group_match_cross_group'
  | 'live_match_exists'
  | 'unresolved_group_match'
  | 'postponed_group_match'
  | 'cancelled_group_match_unresolved'
  | 'invalid_score'
  | 'invalid_walkover'
  | 'invalid_standings'
  | 'unresolved_tiebreak'
  | 'invalid_qualifier_count'
  | 'knockout_already_generated'
  | 'group_stage_snapshot_conflict'
  | 'knockout_structure_conflict'
  | 'group_stage_already_completed'
  | 'stale_generation_version'
  | 'stale_group_transition_version'
  | 'incompatible_structure_version';

export interface GroupStageCompletionIssue {
  code: GroupStageCompletionErrorCode | 'card_tiebreak_warning' | 'deterministic_draw_warning' | 'structural_bye_warning' | 'group_size_warning' | 'deterministic_qualifier_warning';
  message: string;
  entity?: 'championship' | 'team' | 'match' | 'group' | 'snapshot' | 'bracket';
  entityId?: string;
  field?: string;
  details?: Record<string, unknown>;
}

export interface GroupCompletionSummary {
  groupId: string;
  teamCount: number;
  expectedMatchCount: number;
  resolvedMatchCount: number;
  qualifierCount: number;
}

export interface GroupStageCompletionCheck {
  allowed: boolean;
  blockers: GroupStageCompletionIssue[];
  warnings: GroupStageCompletionIssue[];
  resolvedMatchCount: number;
  expectedMatchCount: number;
  groupSummaries: GroupCompletionSummary[];
}

export type GroupStageTransitionErrorCode =
  | GroupStageCompletionErrorCode
  | 'snapshot_invalid'
  | 'bracket_invalid'
  | 'transition_log_conflict';

export type GroupAssignmentErrorCode =
  | GroupStageErrorCode
  | 'championship_missing'
  | 'not_owner'
  | 'unsupported_format'
  | 'invalid_team'
  | 'duplicate_team_id'
  | 'stale_generation_version'
  | 'group_assignments_already_generated'
  | 'championship_already_started'
  | 'group_matches_already_exist'
  | 'live_match_exists'
  | 'finished_match_exists'
  | 'walkover_match_exists'
  | 'group_match_events_exist'
  | 'knockout_already_generated'
  | 'group_redraw_not_implemented';

export type GroupFixturesErrorCode =
  | GroupStageErrorCode
  | 'championship_missing'
  | 'not_owner'
  | 'unsupported_format'
  | 'invalid_team'
  | 'duplicate_team_id'
  | 'stale_generation_version'
  | 'stale_fixtures_version'
  | 'group_assignments_missing'
  | 'group_assignment_log_missing'
  | 'invalid_group_assignment'
  | 'invalid_group_fixture'
  | 'partial_group_fixtures_detected'
  | 'championship_already_started'
  | 'knockout_already_generated'
  | 'knockout_matches_already_exist'
  | 'groups_knockout_requires_group_fixture_service';

export type GroupStructureIssueCode =
  | 'groups_championship_missing_config'
  | 'groups_championship_invalid_group_count'
  | 'team_group_not_allowed_for_format'
  | 'team_invalid_group_id'
  | 'team_invalid_group_seed'
  | 'duplicate_team_id'
  | 'team_missing_group_after_generation'
  | 'group_size_imbalance'
  | 'group_below_minimum'
  | 'group_above_allowed'
  | 'group_match_missing_group_id'
  | 'match_group_id_unknown'
  | 'group_match_cross_group'
  | 'group_match_in_incompatible_championship'
  | 'knockout_match_before_transition'
  | 'legacy_match_missing_stage'
  | 'snapshot_reference_missing'
  | 'incompatible_structure_version'
  | 'snapshot_invalid_version'
  | 'snapshot_invalid_config_version'
  | 'snapshot_duplicate_team'
  | 'snapshot_invalid_position'
  | 'snapshot_invalid_group_id';

export interface GroupStructureIssue {
  code: GroupStructureIssueCode;
  message: string;
  entity?: 'championship' | 'team' | 'match' | 'snapshot';
  entityId?: string;
  field?: string;
  details?: Record<string, unknown>;
}

export interface GroupStageValidationError {
  code: GroupStageErrorCode;
  message: string;
  field?: keyof GroupStageConfig | 'approvedTeamsCount' | 'maxTeams' | 'groupSizes';
  details?: Record<string, unknown>;
}

export interface ChampionshipRules {
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  tiebreakers: string[];
  fairPlay: boolean;
  roundAwards?: boolean;
  craqueDaRodada: boolean;
  yellowCardLimit?: number;
  redCardSuspend?: boolean;
  manualApproval?: boolean;
}

export interface ChampionshipRegistrationSettings {
  approvalRequired: boolean;
}

export interface Championship {
  id: string;
  name: string;
  format: ChampionshipFormat;
  status: ChampionshipStatus;
  stage?: ChampionshipStage;
  currentRound: number;
  totalRounds: number;
  organizerId: string;
  inviteCode: string;
  rules: ChampionshipRules;
  createdAt: string;
  registrationDeadline?: string;
  registrationSettings?: ChampionshipRegistrationSettings;
  registrationsClosed?: boolean;
  finishedAt?: string;
  // QA-01: sentinela atômica do sorteio. Marcada como true dentro da runTransaction
  // que gera as partidas (ver fixturesService.commitFixtures) para impedir que dois
  // clientes simultâneos gerem tabelas duplicadas. Campeonatos legados (sem este
  // campo) são protegidos pela checagem de status != 'inscricoes_abertas'.
  fixturesGenerated?: boolean;
  // Auditoria: serverTimestamp gravado junto com fixturesGenerated. Write-only.
  drawCompletedAt?: string;
  season?: string;
  edition?: number;
  isOfficial?: boolean;
  maxPlayers?: number;
  maxTeams?: number;
  registeredTeamsCount?: number;
  lastTeamRegistrationId?: string;
  matchVerse?: boolean;
  liveMode?: boolean;
  // Campos para grupos + mata-mata
  groups?: Record<string, { id: string; name: string }[]>;
  groupStageConfig?: GroupStageConfig;
  groupStageStatus?: GroupStageStatus;
  knockoutStageStatus?: KnockoutStageStatus;
  groupStructureVersion?: 1;
  groupGenerationVersion?: number;
  groupFixturesVersion?: number;
  groupFixturesGeneratedAt?: Date | Timestamp | string | null;
  groupStageLockedAt?: Date | Timestamp | null;
  knockoutGeneratedAt?: Date | Timestamp | null;
  groupSnapshotVersion?: number;
  knockoutGenerationVersion?: number;
  groupStageComplete?: boolean;
  knockoutStartRound?: number;
}

export type TeamStatus = 'pendente' | 'aprovado' | 'rejeitado';

export interface Team {
  id: string;
  championshipId: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  captainId: string;
  status: TeamStatus;
  inviteCode: string;
  inviteLink?: string;
  maxPlayers?: number;
  registrationOpen?: boolean;
  pendingRequests?: string[];
  createdAt: string;
  logoUrl?: string;
  logoPreset?: string;
  // Contagem denormalizada de atletas ativos no elenco. Mantida atomicamente nas
  // aprovações/remoções para permitir checagem de capacidade segura dentro de uma
  // runTransaction (Firestore não permite COUNT dentro de transação). Quando ausente
  // em times legados, é inicializada a partir da contagem real do elenco.
  approvedPlayersCount?: number;
  groupId?: string | null;
  groupSeed?: number | null;
  groupAssignmentVersion?: number;
}

export interface GroupAssignment {
  teamId: string;
  groupId: string;
  groupSeed: number;
  assignmentOrder: number;
}

export interface GroupDistributionResult {
  championshipId: string;
  generationVersion: number;
  algorithmVersion: 1;
  drawSeed: string;
  groupA: GroupAssignment[];
  groupB: GroupAssignment[];
  assignments: GroupAssignment[];
}

export interface GroupAssignmentLog {
  id: string;
  championshipId: string;
  generationVersion: number;
  algorithmVersion: 1;
  drawSeed: string;
  assignments: GroupAssignment[];
  createdBy: string;
  createdAt: Date | Timestamp | string;
}

export interface GroupFixturesLog {
  id: string;
  championshipId: string;
  fixturesVersion: number;
  groupGenerationVersion: number;
  structureVersion: 1;
  fixtureIds: string[];
  fixtureCount: number;
  groupCounts: {
    groupA: number;
    groupB: number;
  };
  createdBy: string;
  createdAt: Date | Timestamp | string;
}

export type PlayerPosition = 'goleiro' | 'zagueiro' | 'lateral' | 'volante' | 'meia' | 'atacante';
// 'removido' = atleta tirado do elenco mas que tem histórico (gols/cartões) e por
// isso NÃO pode ser apagado fisicamente. Mantém teamId/championshipId para que a
// artilharia, disciplina e o histórico final continuem corretos; é apenas filtrado
// das listas de elenco "ativo".
export type PlayerStatus = 'ativo' | 'suspenso' | 'lesionado' | 'sem_time' | 'removido';

export interface Player {
  id: string;
  teamId: string | null;
  championshipId?: string;
  userId?: string;
  name: string;
  position: PlayerPosition;
  number: number;
  photoUrl?: string;
  status?: PlayerStatus;
  joinedAt?: string;
  leftAt?: string | null;
  suspendedRound?: number | null;   // rodada em que o jogador está suspenso (não pode jogar)
  yellowCards?: number;       // amarelos acumulados no ciclo atual
  guestPlayer?: boolean;      // true = adicionado manualmente pelo capitão, sem userId
}

export type TeamInviteStatus = 'active' | 'used' | 'expired';

export interface TeamInvite {
  id: string;
  teamId: string;
  teamName: string;
  championshipId: string;
  inviteCode: string;
  createdBy: string;
  usedBy: string | null;
  usedAt: string | null;
  expiresAt: string | null;
  status: TeamInviteStatus;
}

export type JoinRequestStatus = 'pending' | 'approved' | 'rejected';
export type JoinRequestType = 'request' | 'waitlist';

export interface JoinRequest {
  id: string;
  teamId: string;
  teamName: string;
  championshipId: string;
  requesterId: string;
  requesterName: string;
  requesterPhotoUrl: string;
  status: JoinRequestStatus;
  type?: JoinRequestType;
  createdAt: string;
  respondedAt: string | null;
}

// Bloco 5 — Fase A: estados administrativos de partida.
//  - adiado: partida remarcada para nova data (transitória; volta a 'agendado').
//  - cancelado: partida não acontece; não pontua, não avança chave (terminal).
//  - wo: resultado administrativo (W.O.), placar 3×0 sem eventos individuais (terminal).
export type MatchStatus =
  | 'agendado'
  | 'ao_vivo'
  | 'finalizado'
  | 'adiado'
  | 'cancelado'
  | 'wo';

// Labels para fases do mata-mata
export type BracketRound = 'final' | 'semi' | 'quartas' | 'oitavas' | 'fase_16' | 'fase_32' | 'grupo';

export interface MatchModel {
  id: string;
  championshipId: string;
  round: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  stage?: MatchStage;
  scheduledAt?: string | null;
  location?: string | null;
  scheduledBy?: string;
  finishedAt?: string;
  // Campos para mata-mata
  winnerId?: string | null;
  nextMatchId?: string | null;
  bracketRound?: BracketRound;
  bracketPosition?: number; // posição no bracket (0, 1, 2, 3 para quartas, etc.)
  // Campos para grupos
  groupId?: string | null;
  groupRound?: number | null;
  knockoutRound?: string | number | null;
  structureVersion?: number;
  groupGenerationVersion?: number;
  originSnapshotVersion?: number | null;
  homePenaltyScore?: number | null;
  awayPenaltyScore?: number | null;
  correctionVersion?: number;
  lastCorrectionId?: string | null;
  correctedAt?: string | null;
  updatedAt?: string | null;
  // Bloco 5 — Fase A. Distingue resultado jogado de W.O. administrativo. Ausente em
  // partidas legadas → tratado como 'played'. Nunca identificar W.O. só pelo placar.
  resultSource?: 'played' | 'wo';
  // Versão otimista das mudanças de status (W.O./adiamento/cancelamento). Incrementa
  // a cada mudança via matchStatusService. Ausente em legados → 0.
  statusVersion?: number;
  lastStatusChangeId?: string | null;
}

export type MatchEventType = 'gol' | 'assistencia' | 'cartao_amarelo' | 'cartao_vermelho';

export interface MatchEvent {
  id: string;
  matchId: string;
  championshipId: string;
  type: MatchEventType;
  teamId: string;
  playerId: string;
  userId?: string;
  minute: number;
  createdAt?: string;
  // Snapshots gravados no momento do evento. Garantem que artilharia, disciplina e
  // histórico final não dependam do documento do player/team continuar existindo
  // (ex.: atleta removido). Eventos antigos podem não ter estes campos — nesse caso
  // o cálculo faz fallback para o player/team atual.
  playerName?: string;
  teamName?: string;
  lastCorrectionId?: string | null;
  correctedAt?: string | null;
  removedAt?: string | null;
  removedByCorrectionId?: string | null;
  correctionVersion?: number;
}

export interface MatchCorrectionEventSnapshot {
  id: string;
  type: MatchEventType;
  teamId: string;
  playerId: string;
  playerName?: string;
  teamName?: string;
  minute: number;
}

export interface MatchCorrectionScoreSnapshot {
  homeScore: number | null;
  awayScore: number | null;
}

export interface MatchCorrection {
  id: string;
  championshipId: string;
  matchId: string;
  organizerId: string;
  reason: string;
  createdAt: string;
  previousScore: MatchCorrectionScoreSnapshot;
  newScore: MatchCorrectionScoreSnapshot;
  previousWinnerId: string | null;
  newWinnerId: string | null;
  eventsAdded: MatchCorrectionEventSnapshot[];
  eventsRemoved: MatchCorrectionEventSnapshot[];
  eventsChanged: Array<{
    before: MatchCorrectionEventSnapshot;
    after: MatchCorrectionEventSnapshot;
  }>;
  round: number;
  championshipFormat: ChampionshipFormat;
  derivedEffects: string[];
  previousMatchVersion: number;
  newMatchVersion: number;
  previousMatch: MatchModel;
}

export interface QualifiedTeamSnapshot {
  teamId: string;
  groupId: string;
  groupPosition?: number;
  groupSeed?: number;
  knockoutSeed?: number;
  points: number;
  wins: number;
  draws?: number;
  losses?: number;
  goalDifference: number;
  goalsFor: number;
  goalsAgainst?: number;
  cards?: number;
  tiebreakReason?: GroupTiebreakReason;
  deterministicSeed: string;
  position?: number;
}

export interface GroupStageQualificationSnapshot {
  id?: string;
  version: number;
  championshipId: string;
  groupGenerationVersion?: number;
  groupFixturesVersion?: number;
  structureVersion?: 1;
  generatedAt: Date | Timestamp;
  generatedBy?: string;
  configVersion: 1;
  qualifiersPerGroup?: number;
  qualifiers: QualifiedTeamSnapshot[];
  standingsDigest?: string;
}

export interface KnockoutSeed {
  teamId: string;
  groupId: string;
  groupPosition: number;
  knockoutSeed: number;
  firstRoundSlot: number;
}

export interface KnockoutSeedingPlan {
  seeds: KnockoutSeed[];
  expectedPairings: Array<{
    homeTeamId: string | null;
    awayTeamId: string | null;
    homeSeed: number | null;
    awaySeed: number | null;
    avoidSameGroupPossible: boolean;
    sameGroup: boolean;
  }>;
  byeCount: number;
  notes: string[];
}

export interface GroupStageTransitionLog {
  id: string;
  championshipId: string;
  transitionVersion: number;
  snapshotId: string;
  snapshotDigest: string;
  knockoutGenerationVersion: number;
  qualifierIds: string[];
  fixtureIds: string[];
  createdBy: string;
  createdAt: Date | Timestamp | string;
}

export type GroupTiebreakReason =
  | { type: 'points' }
  | { type: 'wins' }
  | { type: 'goal_difference' }
  | { type: 'goals_for' }
  | { type: 'head_to_head' }
  | { type: 'fewest_cards' }
  | { type: 'deterministic_draw' };

export type GroupQualifiedStatus = 'qualified' | 'not_qualified' | 'undecided';

export interface GroupStandingRow {
  teamId: string;
  teamName: string;
  primaryColor: string;
  groupId: string;
  position: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  woFor: number;
  woAgainst: number;
  cards: number;
  yellowCards: number;
  redCards: number;
  qualifiedStatus?: GroupQualifiedStatus;
  tiebreakReason?: GroupTiebreakReason;
}

// ── Match status changes (Bloco 5 — Fase A: auditoria de W.O./adiamento/cancelamento) ──

export type MatchStatusChangeType = 'wo' | 'adiamento' | 'cancelamento' | 'reativacao';

export interface MatchStatusScoreSnapshot {
  homeScore: number | null;
  awayScore: number | null;
}

export interface MatchStatusChange {
  id: string;
  championshipId: string;
  matchId: string;
  organizerId: string;
  type: MatchStatusChangeType;
  reason: string;
  beforeStatus: MatchStatus;
  afterStatus: MatchStatus;
  beforeDate: string | null;
  afterDate: string | null;
  beforeScore: MatchStatusScoreSnapshot;
  afterScore: MatchStatusScoreSnapshot;
  winnerId: string | null;
  createdAt: string;
  version: number;
  derivedEffects: string[];
}

// ── Convocação e presença (Bloco 5 — Fase B) ──────────────────────────────────
// Modelo POR PARTIDA (não por rodada). IDs determinísticos garantem unicidade e
// idempotência: match_convocations/{matchId}_{teamId} e
// match_attendance/{matchId}_{playerId}. Nada é apagado fisicamente — convocações
// e respostas antigas são preservadas (status/soft fields), nunca deletadas.

export type ConvocationStatus = 'open' | 'closed' | 'cancelled' | 'completed';

export interface Convocation {
  id: string; // `${matchId}_${teamId}`
  championshipId: string;
  matchId: string;
  teamId: string;
  captainId: string;
  playerIds: string[];
  status: ConvocationStatus;
  responseDeadline: string | null;
  requiresReconfirmation: boolean;
  version: number;
  previousVersion: number | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
}

export type AttendanceResponse = 'pending' | 'confirmed' | 'declined';

export interface MatchAttendance {
  id: string; // `${matchId}_${playerId}`
  championshipId: string;
  matchId: string;
  teamId: string;
  playerId: string;
  userId: string | null;
  response: AttendanceResponse;
  respondedAt: string | null;
  declineReason?: string | null;
  version: number;
  reconfirmationRequired: boolean;
  previousResponse: AttendanceResponse | null;
  updatedAt: string;
}

export interface PlayerHistoryEntry {
  id: string;
  userId: string;
  championshipId: string;
  championshipName: string;
  teamId: string;
  teamName: string;
  season: string;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  matchesPlayed: number;
  overall: number;
  finishedAt: string;
  position: string;
  isChampion: boolean;
  isMvp: boolean;
  roundMvpCount: number;
}

export interface TeamStats {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  yellowCards: number;
  redCards: number;
}

export interface TopScorer {
  playerId: string;
  teamId: string;
  goals: number;
}

export interface TeamStanding {
  teamId: string;
  teamName: string;
  primaryColor: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  yellowCards: number;
  redCards: number;
  fairPlayScore: number;
}

export interface PlayerScorer {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  goals: number;
}

export interface PlayerDisciplineRanking {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  yellowCards: number;
  redCards: number;
}

export interface SuspendedPlayer {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  reason: 'cartao_vermelho' | 'amarelos_acumulados';
}

export interface RoundVote {
  id: string;
  championshipId: string;
  round: number;
  voterId: string;
  candidatePlayerId: string;
  createdAt: string;
}

export interface RoundAward {
  id: string;
  championshipId: string;
  round: number;
  winnerPlayerId: string;
  winnerName: string;
  winnerTeamId: string;
  totalVotes: number;
  closedAt: string;
}

// ── Achievements ──────────────────────────────────────────────────────────────

export type AchievementRarity = 'comum' | 'raro' | 'epico' | 'lendario';

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: AchievementRarity;
  rarityColor: string;
}

export interface Achievement {
  achievementId: string;
  playerId: string;
  championshipId: string;
  unlockedAt: string; // ISO string
  matchId?: string;
  round?: number;
  // Bloco 11 — Fase 2: auditoria de concessão/revogação por reprocessamento.
  // Campos opcionais para preservar compatibilidade com achievements legados.
  grantedAt?: string;
  sourceReprocessId?: string;
  revoked?: boolean;
  revokedAt?: string;
  revokedBy?: string;
  revokedReason?: string;
}

// ── In-App Notifications ───────────────────────────────────────────────────────

export type InAppNotificationType =
  | 'goal'
  | 'match_started'
  | 'match_finished'
  | 'match_scheduled'
  | 'team_approved'
  | 'team_rejected'
  | 'join_request'
  | 'join_request_approved'
  | 'join_request_rejected'
  | 'waitlist_spot_available'
  // Bloco 5 — Fase A
  | 'match_postponed'
  | 'match_cancelled'
  | 'match_wo'
  // Bloco 5 — Fase B (convocação / presença)
  | 'convocation_received'
  | 'attendance_confirmed'
  | 'attendance_declined'
  | 'reconfirmation_required'
  | 'convocation_closed'
  // Bloco 10.4 — Grupos + mata-mata
  | 'groups_generated'
  | 'group_fixtures_generated'
  | 'group_stage_started'
  | 'team_qualified'
  | 'team_eliminated'
  | 'knockout_generated'
  | 'knockout_match_defined'
  // Bloco 10.3/10.4 — correção de resultado (fecha ressalva do Bloco 10.3)
  | 'match_corrected';

export interface InAppNotification {
  id: string;
  userId: string;
  type: InAppNotificationType;
  title: string;
  body: string;
  data?: Record<string, string | number>;
  read: boolean;
  createdAt: string;
}

// ── Announcements ─────────────────────────────────────────────────────────────

export type AnnouncementAudience = 'todos' | 'capitaes' | 'atletas' | 'time_especifico';
export type AnnouncementPriority = 'normal' | 'urgente';

export interface Announcement {
  id: string;
  championshipId: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  title: string;
  body: string;
  targetAudience: AnnouncementAudience;
  targetTeamId?: string;
  priority: AnnouncementPriority;
  createdAt: string;
  readBy: string[];
}

// ── Career Stats ──────────────────────────────────────────────────────────────

export interface CareerStats {
  id?: string;
  userId: string;
  name: string;
  lastTeamName: string;
  totalGoals: number;
  totalAssists: number;
  totalMatches: number;
  totalTitles: number;
  totalMvps: number;
  totalChampionships: number;
  bestOverall: number;
  bestSeason: string;
  bestSeasonGoals: number;
  firstSeasonYear: string;
  updatedAt: string;
}

// ── All-Time Rankings ─────────────────────────────────────────────────────────

export interface AllTimeRankingPlayer {
  userId: string;
  name: string;
  teamName: string;
  goals?: number;
  titles?: number;
  matches?: number;
  mvps?: number;
  seasons: number;
}

export interface AllTimeRankingTeam {
  teamId: string;
  name: string;
  titles: number;
  participations: number;
}

export interface AllTimeRanking {
  players?: AllTimeRankingPlayer[];
  teams?: AllTimeRankingTeam[];
}

// ── Championship Results (Firestore) ───────────────────────────────────────────

export interface ChampionshipResultData {
  id: string;
  championshipId: string;
  championshipName: string;
  season: string;
  format: string;
  totalTeams: number;
  totalPlayers: number;
  totalMatches: number;
  totalGoals: number;
  winnerId: string;
  winnerName: string;
  winnerTeamColor?: string;
  runnerUpId: string;
  runnerUpName: string;
  topScorerId: string;
  topScorerName: string;
  topScorerGoals: number;
  bestDefenseId: string;
  bestDefenseName: string;
  bestDefenseGoals: number;
  mvpPlayerId?: string;
  mvpPlayerName?: string;
  mvpVotes?: number;
  fairPlayTeamId?: string;
  fairPlayTeamName?: string;
  fairPlayCards?: number;
  finishedAt: string;
  organizerId: string;
  // Bloco 11 — Fase 2: metadados de reprocessamento de campeonato encerrado.
  // Opcionais para não quebrar resultados congelados antes do reprocessamento.
  reprocessVersion?: number;
  lastReprocessedAt?: string;
  lastReprocessedBy?: string;
  sourceCorrectionId?: string;
}

// ── Championship Reprocess (Bloco 11 — Fase 2) ─────────────────────────────────

/** Delta serializável de uma linha de player_history recomputada. */
export interface ReprocessHistoryDelta {
  userId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
  changedFields: string[];
}

/** Referência mínima de um achievement concedido/revogado no reprocessamento. */
export interface ReprocessAchievementRef {
  playerId: string;
  achievementId: string;
}

/**
 * Log imutável de um reprocessamento de campeonato encerrado.
 * Documento: championship_reprocess_logs/{reprocessId}.
 */
export interface ChampionshipReprocessLog {
  id: string;
  reprocessId: string;
  championshipId: string;
  sourceCorrectionId: string;
  sourceMatchId: string;
  reason: string;
  createdBy: string;
  createdAt: string;
  previousResultsDigest: string;
  newResultsDigest: string;
  changed: boolean;
  changedFields: string[];
  affectedUserIds: string[];
  historyDeltas: ReprocessHistoryDelta[];
  achievementGrants: ReprocessAchievementRef[];
  achievementRevocations: ReprocessAchievementRef[];
  careerStatsAffected: string[];
  rankingsAffected: string[];
  idempotencyKey: string;
  reprocessVersion: number;
}
