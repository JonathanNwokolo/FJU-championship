import { UserRole } from './index';

// ── Severidade ────────────────────────────────────────────────────────────────
// critical: bloqueia funcionamento/avanço do campeonato
// high: exige ação antes da próxima partida ou rodada
// medium: importante mas não bloqueia imediatamente
// low: atenção preventiva
// info: estado informativo sem ação obrigatória
export type PendingItemSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

// ── Tipos de pendência ────────────────────────────────────────────────────────
export type PendingItemType =
  // Organizador — times
  | 'team_pending_approval'
  | 'team_no_valid_captain'
  | 'team_counter_divergence'
  // Organizador — campeonato
  | 'championship_no_fixtures'
  | 'championship_no_teams'
  | 'championship_finalizable'
  | 'championship_deadline_near'
  // Organizador — partidas
  | 'match_overdue'
  | 'match_postponed_unscheduled'
  | 'match_no_convocation'
  | 'match_attendance_incomplete'
  // Capitão
  | 'captain_team_pending'
  | 'captain_roster_empty'
  | 'captain_player_suspended'
  | 'captain_convocation_missing'
  | 'captain_convocation_pending_responses'
  | 'captain_convocation_reconfirmation'
  | 'captain_convocation_declined'
  | 'captain_join_request'
  | 'captain_match_postponed'
  | 'captain_match_cancelled'
  // Atleta
  | 'athlete_attendance_pending'
  | 'athlete_attendance_reconfirmation'
  | 'athlete_suspension_active'
  | 'athlete_no_team'
  | 'athlete_match_postponed'
  | 'athlete_match_cancelled'
  // Bloco 10.4 — Grupos + mata-mata (organizador)
  // Partidas atrasadas/adiadas/canceladas de grupo REUSAM os tipos genéricos
  // (match_overdue / match_postponed_unscheduled / captain_match_cancelled),
  // apenas enriquecidos com o contexto "Grupo A · Rodada X". Só criamos tipos
  // novos para estados que não têm equivalente genérico.
  | 'group_groups_not_generated'
  | 'group_fixtures_not_generated'
  | 'group_structure_invalid'
  | 'group_stage_ready'
  | 'group_stage_blocked'
  | 'group_knockout_not_generated'
  // Bloco 10.4 — informativos de classificação (capitão e atleta)
  | 'team_qualified'
  | 'team_eliminated'
  | 'knockout_match_defined';

// ── Categoria de agrupamento ──────────────────────────────────────────────────
export type PendingItemCategory =
  | 'teams'
  | 'matches'
  | 'convocations'
  | 'attendance'
  | 'championship'
  | 'roster'
  | 'admin';

// ── Tag de prazo ──────────────────────────────────────────────────────────────
export type PendingDeadlineTag =
  | 'overdue'
  | 'today'
  | 'within_24h'
  | 'within_72h'
  | 'no_deadline';

// ── Destino tipado de navegação ───────────────────────────────────────────────
// Cada variante descreve a tela de destino e seus params obrigatórios.
// Não criar rotas fictícias — apenas destinos que existam na navegação.
export type PendingDestination =
  | { type: 'championship_manage'; championshipId: string }
  | { type: 'championship_dashboard'; championshipId: string }
  | { type: 'match_prematch'; matchId: string }
  | { type: 'match_registration'; matchId: string }
  | { type: 'match_fixtures' }
  | { type: 'roster_manage'; teamId: string }
  | { type: 'join_requests_dashboard' }
  | { type: 'notification_center' }
  | { type: 'round_voting'; championshipId: string; round: number }
  // Bloco 10.4 — Grupos + mata-mata (destinos tipados, rotas reais do FixturesStack)
  | { type: 'groups_overview'; championshipId: string }
  | { type: 'group_fixtures'; championshipId: string; groupId?: 'A' | 'B' }
  | { type: 'group_stage_review'; championshipId: string }
  | { type: 'knockout_bracket'; championshipId: string };

// ── Modelo central de pendência ───────────────────────────────────────────────
export interface PendingItem {
  // ID determinístico: evita duplicatas e identifica a pendência de forma estável.
  // Formato: <type>_<principal_id>  (ex: team_pending_approval_teamABC)
  id: string;
  role: UserRole;
  type: PendingItemType;
  category: PendingItemCategory;
  severity: PendingItemSeverity;
  title: string;
  description: string;
  actionLabel?: string;
  destination?: PendingDestination;
  // Contexto opcional para enriquecer a navegação e a exibição
  championshipId?: string;
  championshipName?: string;
  teamId?: string;
  teamName?: string;
  matchId?: string;
  playerId?: string;
  // Prazo ISO 8601 (opcional); deadlineTag derivado a partir dele
  dueAt?: string;
  deadlineTag?: PendingDeadlineTag;
  // Indica que a pendência bloqueia ação até ser resolvida
  isBlocked?: boolean;
  metadata?: Record<string, unknown>;
}

// ── Agrupamento de pendências ─────────────────────────────────────────────────
export interface PendingGroup {
  category: PendingItemCategory;
  label: string;
  items: PendingItem[];
}

// ── Labels de categoria para exibição ────────────────────────────────────────
export const PENDING_CATEGORY_LABELS: Record<PendingItemCategory, string> = {
  teams: 'Times',
  matches: 'Partidas',
  convocations: 'Convocações',
  attendance: 'Presença',
  championship: 'Campeonato',
  roster: 'Elenco',
  admin: 'Administração',
};

// ── Labels de severidade para acessibilidade ──────────────────────────────────
export const PENDING_SEVERITY_LABELS: Record<PendingItemSeverity, string> = {
  critical: 'Crítico',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
  info: 'Informativo',
};
