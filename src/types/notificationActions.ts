import { UserRole } from './index';
import { PendingDestination } from './pending';

export const NOTIFICATION_ACTION_PAYLOAD_VERSION = 1 as const;
export const DEFAULT_PENDING_ACTION_TTL_MS = 5 * 60 * 1000;

export type NotificationActionSource = 'notification' | 'deep_link' | 'internal';

export type NotificationActionType =
  | 'notification_center'
  | 'announcement'
  | 'championship'
  | 'match_prematch'
  | 'match_live'
  | 'match_summary'
  | 'match_registration'
  | 'team_roster'
  | 'join_requests'
  | 'pending_center'
  | 'round_voting'
  // Bloco 10.4 — Grupos + mata-mata (destinos tipados)
  | 'groups_overview'
  | 'group_fixtures'
  | 'group_stage_review'
  | 'knockout_bracket'
  | 'unknown';

export interface NotificationActionPayloadV1 {
  v: typeof NOTIFICATION_ACTION_PAYLOAD_VERSION;
  type: NotificationActionType;
  actionId?: string;
  expiresAt?: string | number;
  championshipId?: string;
  matchId?: string;
  teamId?: string;
  playerId?: string;
  announcementId?: string;
  round?: number | string;
  // Bloco 10.4 — contexto de grupos + mata-mata e correção
  groupId?: string;
  snapshotVersion?: number | string;
  correctionVersion?: number | string;
}

export type NotificationActionRawPayload = Record<string, unknown> | string | null | undefined;

export interface NormalizedNotificationAction {
  version: typeof NOTIFICATION_ACTION_PAYLOAD_VERSION;
  source: NotificationActionSource;
  actionId: string;
  type: NotificationActionType;
  expiresAt: number;
  championshipId?: string;
  matchId?: string;
  teamId?: string;
  playerId?: string;
  announcementId?: string;
  round?: number;
  // Bloco 10.4 — contexto de grupos + mata-mata e correção
  groupId?: 'A' | 'B';
  snapshotVersion?: number;
  correctionVersion?: number;
  legacyType?: string;
}

export interface NotificationActionValidationResult {
  ok: boolean;
  reason?: NotificationActionFailureReason;
}

export type NotificationActionFailureReason =
  | 'parse_failed'
  | 'expired'
  | 'missing_required_field'
  | 'unknown_type'
  | 'permission_denied'
  | 'destination_unavailable'
  | 'context_unavailable'
  | 'already_consumed';

export interface NotificationActionDestination {
  stack: 'home' | 'fixtures' | 'captain';
  screen: string;
  params?: Record<string, unknown>;
}

export interface NotificationActionResolution {
  destination: NotificationActionDestination;
  pendingDestination?: PendingDestination;
  requiredRole?: UserRole;
  requiredChampionshipId?: string;
}

export interface NotificationActionGates {
  authReady: boolean;
  navigationReady: boolean;
  storesReady: boolean;
  contextReady: boolean;
}

export type PendingNotificationActionStatus = 'pending' | 'navigating' | 'consumed' | 'failed';

export interface PendingNotificationAction {
  action: NormalizedNotificationAction;
  createdAt: number;
  expiresAt: number;
  status: PendingNotificationActionStatus;
  failureReason?: NotificationActionFailureReason;
}

export interface NotificationActionPreparation {
  gates: NotificationActionGates;
  resolution: NotificationActionResolution;
  ready: boolean;
  failureReason?: NotificationActionFailureReason;
  championshipIdToSelect?: string;
}
