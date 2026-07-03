import {
  DEFAULT_PENDING_ACTION_TTL_MS,
  NormalizedNotificationAction,
  NOTIFICATION_ACTION_PAYLOAD_VERSION,
  NotificationActionPreparation,
  NotificationActionDestination,
  NotificationActionRawPayload,
  NotificationActionResolution,
  NotificationActionSource,
  NotificationActionType,
} from '../types/notificationActions';
import { PendingDestination } from '../types/pending';
import { resolvePendingDestination } from './pendingRules';
import { AppUser, Championship, MatchModel, Player, Team, UserRole } from '../types';

type RawActionRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RawActionRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function parseRound(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseExpiresAt(value: unknown, now: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const date = new Date(value).getTime();
    if (Number.isFinite(date)) return date;
  }
  return now + DEFAULT_PENDING_ACTION_TTL_MS;
}

function normalizeActionType(value: unknown): NotificationActionType {
  const type = firstString(value)?.toLowerCase();
  switch (type) {
    case 'notification_center':
    case 'notificationcenter':
    case 'notifications':
    case 'notificacoes':
      return 'notification_center';
    case 'announcement':
    case 'announcements':
    case 'anuncio':
    case 'comunicado':
      return 'announcement';
    case 'championship':
    case 'championship_dashboard':
    case 'campeonato':
      return 'championship';
    case 'match_prematch':
    case 'match':
    case 'partida':
    case 'match_scheduled':
    case 'match_postponed':
    case 'match_cancelled':
    case 'match_wo':
    case 'convocation_received':
    case 'reconfirmation_required':
    case 'convocation_closed':
      return 'match_prematch';
    case 'goal':
    case 'match_started':
    case 'live_match':
    case 'livematch':
    case 'live':
    case 'partida_ao_vivo':
      return 'match_live';
    case 'match_finished':
    case 'match_summary':
    case 'summary':
    case 'match_corrected':
      return 'match_summary';
    // Bloco 10.4 — notificações do formato grupos + mata-mata
    case 'groups_overview':
    case 'groups_generated':
    case 'group_stage_started':
    case 'team_eliminated':
      return 'groups_overview';
    case 'group_fixtures':
    case 'group_fixtures_generated':
      return 'group_fixtures';
    case 'group_stage_review':
    case 'group_stage_ready':
      return 'group_stage_review';
    case 'knockout_bracket':
    case 'knockout_generated':
    case 'team_qualified':
      return 'knockout_bracket';
    case 'knockout_match_defined':
      return 'match_prematch';
    case 'match_registration':
    case 'registro_partida':
      return 'match_registration';
    case 'team_roster':
    case 'roster_manage':
    case 'manage_roster':
      return 'team_roster';
    case 'join_request':
    case 'join_requests':
    case 'join_requests_dashboard':
      return 'join_requests';
    case 'pending':
    case 'pending_center':
    case 'pendencias':
      return 'pending_center';
    case 'round_voting':
    case 'voting':
    case 'vote':
      return 'round_voting';
    default:
      return 'unknown';
  }
}

function buildActionId(source: NotificationActionSource, record: RawActionRecord, type: NotificationActionType): string {
  const explicit = firstString(record.actionId, record.id, record.notificationId);
  if (explicit) return explicit;

  return [
    source,
    type,
    firstString(record.championshipId, record.championship_id) ?? 'no_championship',
    firstString(record.matchId, record.match_id) ?? 'no_match',
    firstString(record.teamId, record.team_id) ?? 'no_team',
    firstString(record.announcementId, record.announcement_id) ?? 'no_announcement',
    firstString(record.round) ?? 'no_round',
  ].join(':');
}

function rawFromUrl(url: string): RawActionRecord | null {
  try {
    const parsed = new URL(url);
    const pathParts = [
      parsed.hostname,
      ...parsed.pathname.split('/').filter(Boolean),
    ].filter(Boolean);
    const query = Object.fromEntries(parsed.searchParams.entries());
    const first = pathParts[0]?.toLowerCase();
    const second = pathParts[1];
    const third = pathParts[2];

    if (!first) return { ...query, type: 'notification_center' };

    if (['notifications', 'notification-center', 'notificacoes'].includes(first)) {
      return { ...query, type: 'notification_center' };
    }
    if (['announcements', 'announcement', 'comunicados'].includes(first)) {
      return { ...query, type: 'announcement', championshipId: second ?? query.championshipId };
    }
    if (['championship', 'championships', 'campeonato'].includes(first)) {
      return { ...query, type: 'championship', championshipId: second ?? query.championshipId };
    }
    if (['match', 'matches', 'partida'].includes(first)) {
      return { ...query, type: query.type ?? 'match_prematch', matchId: second ?? query.matchId };
    }
    if (['live', 'ao-vivo'].includes(first)) {
      return { ...query, type: 'match_live', matchId: second ?? query.matchId };
    }
    if (['summary', 'resumo'].includes(first)) {
      return { ...query, type: 'match_summary', matchId: second ?? query.matchId };
    }
    if (['match-registration', 'registro-partida'].includes(first)) {
      return { ...query, type: 'match_registration', matchId: second ?? query.matchId };
    }
    if (first === 'team' && third === 'roster') {
      return { ...query, type: 'team_roster', teamId: second ?? query.teamId };
    }
    if (['join-requests', 'solicitacoes'].includes(first)) {
      return { ...query, type: 'join_requests' };
    }
    if (['pending', 'pendencias'].includes(first)) {
      return { ...query, type: 'pending_center' };
    }
    if (['vote', 'voting', 'votacao'].includes(first)) {
      return {
        ...query,
        type: 'round_voting',
        championshipId: second ?? query.championshipId,
        round: third ?? query.round,
      };
    }

    return { ...query, type: 'unknown' };
  } catch {
    return null;
  }
}

function coerceRawPayload(raw: NotificationActionRawPayload): RawActionRecord | null {
  if (isRecord(raw)) return raw;
  if (typeof raw !== 'string') return null;

  const fromUrl = rawFromUrl(raw);
  if (fromUrl) return fromUrl;

  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseNotificationAction(
  raw: NotificationActionRawPayload,
  source: NotificationActionSource,
  now: number = Date.now(),
): NormalizedNotificationAction | null {
  const record = coerceRawPayload(raw);
  if (!record) return null;

  const legacyType = firstString(record.type, record.action, record.kind);
  const type = normalizeActionType(record.type ?? record.action ?? record.kind);
  const actionId = buildActionId(source, record, type);
  const expiresAt = parseExpiresAt(record.expiresAt ?? record.expires_at, now);

  return {
    version: NOTIFICATION_ACTION_PAYLOAD_VERSION,
    source,
    actionId,
    type,
    expiresAt,
    championshipId: firstString(record.championshipId, record.championship_id),
    matchId: firstString(record.matchId, record.match_id),
    teamId: firstString(record.teamId, record.team_id),
    playerId: firstString(record.playerId, record.player_id),
    announcementId: firstString(record.announcementId, record.announcement_id),
    round: parseRound(record.round),
    groupId: parseGroupId(record.groupId ?? record.group_id),
    snapshotVersion: parseRound(record.snapshotVersion ?? record.snapshot_version),
    correctionVersion: parseRound(record.correctionVersion ?? record.correction_version),
    legacyType: legacyType && legacyType !== type ? legacyType : undefined,
  };
}

function parseGroupId(value: unknown): 'A' | 'B' | undefined {
  const raw = firstString(value)?.toUpperCase();
  return raw === 'A' || raw === 'B' ? raw : undefined;
}

const NOTIFICATION_CENTER_DESTINATION: NotificationActionDestination = {
  stack: 'home',
  screen: 'NotificationCenter',
};

function fromPendingDestination(
  pendingDestination: PendingDestination,
  role?: UserRole,
): NotificationActionResolution | null {
  const destination = resolvePendingDestination(pendingDestination, role);
  if (!destination) return null;
  return { destination, pendingDestination };
}

function fallbackToNotificationCenter(): NotificationActionResolution {
  return { destination: NOTIFICATION_CENTER_DESTINATION };
}

export function resolveNotificationActionDestination(
  action: NormalizedNotificationAction,
): NotificationActionResolution {
  switch (action.type) {
    case 'notification_center':
    case 'unknown':
      return fallbackToNotificationCenter();
    case 'announcement':
      if (!action.championshipId) return fallbackToNotificationCenter();
      return {
        destination: {
          stack: 'home',
          screen: 'Announcements',
          params: { championshipId: action.championshipId },
        },
        requiredChampionshipId: action.championshipId,
      };
    case 'championship':
      if (!action.championshipId) return fallbackToNotificationCenter();
      return fromPendingDestination({
        type: 'championship_dashboard',
        championshipId: action.championshipId,
      }) ?? fallbackToNotificationCenter();
    case 'match_prematch':
      if (!action.matchId) return fallbackToNotificationCenter();
      return fromPendingDestination({ type: 'match_prematch', matchId: action.matchId })
        ?? fallbackToNotificationCenter();
    case 'match_live':
      if (!action.matchId) return fallbackToNotificationCenter();
      return {
        destination: {
          stack: 'fixtures',
          screen: 'LiveMatch',
          params: { matchId: action.matchId },
        },
      };
    case 'match_summary':
      if (!action.matchId) return fallbackToNotificationCenter();
      return {
        destination: {
          stack: 'fixtures',
          screen: 'MatchSummary',
          params: { matchId: action.matchId },
        },
      };
    case 'match_registration':
      if (!action.matchId) return fallbackToNotificationCenter();
      return fromPendingDestination({ type: 'match_registration', matchId: action.matchId })
        ?? fallbackToNotificationCenter();
    case 'team_roster':
      if (!action.teamId) return fallbackToNotificationCenter();
      return fromPendingDestination({ type: 'roster_manage', teamId: action.teamId }, 'capitao')
        ?? fallbackToNotificationCenter();
    case 'join_requests':
      return fromPendingDestination({ type: 'join_requests_dashboard' }, 'capitao')
        ?? fallbackToNotificationCenter();
    case 'pending_center':
      return {
        destination: {
          stack: 'home',
          screen: 'PendingCenter',
        },
      };
    case 'round_voting':
      if (!action.championshipId || typeof action.round !== 'number') {
        return fallbackToNotificationCenter();
      }
      return fromPendingDestination({
        type: 'round_voting',
        championshipId: action.championshipId,
        round: action.round,
      }) ?? fallbackToNotificationCenter();
    case 'groups_overview':
      if (!action.championshipId) return fallbackToNotificationCenter();
      return {
        ...(fromPendingDestination({ type: 'groups_overview', championshipId: action.championshipId })
          ?? fallbackToNotificationCenter()),
        requiredChampionshipId: action.championshipId,
      };
    case 'group_fixtures':
      if (!action.championshipId) return fallbackToNotificationCenter();
      return {
        ...(fromPendingDestination({
          type: 'group_fixtures',
          championshipId: action.championshipId,
          groupId: action.groupId,
        }) ?? fallbackToNotificationCenter()),
        requiredChampionshipId: action.championshipId,
      };
    case 'group_stage_review':
      if (!action.championshipId) return fallbackToNotificationCenter();
      return {
        ...(fromPendingDestination(
          { type: 'group_stage_review', championshipId: action.championshipId },
          'organizador',
        ) ?? fallbackToNotificationCenter()),
        requiredRole: 'organizador',
        requiredChampionshipId: action.championshipId,
      };
    case 'knockout_bracket':
      if (!action.championshipId) return fallbackToNotificationCenter();
      return {
        ...(fromPendingDestination({ type: 'knockout_bracket', championshipId: action.championshipId })
          ?? fallbackToNotificationCenter()),
        requiredChampionshipId: action.championshipId,
      };
    default:
      return fallbackToNotificationCenter();
  }
}

export interface NotificationActionRuntimeState {
  user: AppUser | null;
  isOnboarded: boolean;
  authLoading: boolean;
  navigationReady: boolean;
  championships: Championship[];
  teams: Team[];
  players: Player[];
  matches: MatchModel[];
  selectedChampionshipId: string | null;
  championshipsLoading: boolean;
  teamsLoading: boolean;
  matchesLoading: boolean;
}

function findActionChampionshipId(
  action: NormalizedNotificationAction,
  state: NotificationActionRuntimeState,
): string | undefined {
  if (action.championshipId) return action.championshipId;
  if (action.matchId) {
    const match = state.matches.find((m) => m.id === action.matchId);
    if (match?.championshipId) return match.championshipId;
  }
  if (action.teamId) {
    const team = state.teams.find((t) => t.id === action.teamId);
    if (team?.championshipId) return team.championshipId;
  }
  return undefined;
}

function canAccessChampionship(
  user: AppUser,
  championshipId: string,
  state: NotificationActionRuntimeState,
): boolean {
  const championship = state.championships.find((c) => c.id === championshipId);
  if (!championship) return false;
  if (user.role === 'organizador') return championship.organizerId === user.id;

  const isCaptainInChampionship = state.teams.some(
    (team) => team.championshipId === championshipId && team.captainId === user.id,
  );
  if (isCaptainInChampionship) return true;

  return state.players.some(
    (player) => player.championshipId === championshipId && player.userId === user.id,
  );
}

function canAccessAction(
  action: NormalizedNotificationAction,
  user: AppUser,
  state: NotificationActionRuntimeState,
): boolean {
  if (action.type === 'notification_center' || action.type === 'unknown' || action.type === 'pending_center') {
    return true;
  }

  if (action.type === 'team_roster') {
    if (!action.teamId) return false;
    return state.teams.some((team) => team.id === action.teamId && team.captainId === user.id);
  }

  if (action.type === 'join_requests') {
    return state.teams.some((team) => team.captainId === user.id);
  }

  const championshipId = findActionChampionshipId(action, state);
  if (!championshipId) return false;

  // A revisão da fase de grupos é exclusiva do organizador dono.
  if (action.type === 'group_stage_review') {
    return user.role === 'organizador' && canAccessChampionship(user, championshipId, state);
  }

  return canAccessChampionship(user, championshipId, state);
}

function hasRequiredEntity(
  action: NormalizedNotificationAction,
  state: NotificationActionRuntimeState,
): boolean {
  switch (action.type) {
    case 'match_prematch':
    case 'match_live':
    case 'match_summary':
    case 'match_registration':
      return !!action.matchId && state.matches.some((match) => match.id === action.matchId);
    case 'team_roster':
      return !!action.teamId && state.teams.some((team) => team.id === action.teamId);
    case 'championship':
    case 'announcement':
    case 'round_voting':
    case 'groups_overview':
    case 'group_fixtures':
    case 'group_stage_review':
    case 'knockout_bracket':
      return !!findActionChampionshipId(action, state);
    default:
      return true;
  }
}

export function prepareNotificationAction(
  action: NormalizedNotificationAction,
  state: NotificationActionRuntimeState,
  now: number = Date.now(),
): NotificationActionPreparation {
  const resolution = resolveNotificationActionDestination(action);
  const storesReady = !state.championshipsLoading && !state.teamsLoading && !state.matchesLoading;
  const authReady = !state.authLoading && !!state.user && state.isOnboarded;
  const requiredChampionshipId = findActionChampionshipId(action, state)
    ?? resolution.requiredChampionshipId;
  const contextReady = !requiredChampionshipId || state.selectedChampionshipId === requiredChampionshipId;
  const gates = {
    authReady,
    navigationReady: state.navigationReady,
    storesReady,
    contextReady,
  };

  if (action.expiresAt <= now) {
    return { gates, resolution, ready: false, failureReason: 'expired' };
  }

  if (!authReady || !state.user) {
    return { gates, resolution, ready: false };
  }

  if (!storesReady) {
    return { gates, resolution, ready: false };
  }

  if (!contextReady) {
    return {
      gates,
      resolution,
      ready: false,
      championshipIdToSelect: requiredChampionshipId,
    };
  }

  if (!hasRequiredEntity(action, state)) {
    return { gates, resolution, ready: false, failureReason: 'context_unavailable' };
  }

  if (!canAccessAction(action, state.user, state)) {
    return { gates, resolution, ready: false, failureReason: 'permission_denied' };
  }

  if (!state.navigationReady) {
    return { gates, resolution, ready: false };
  }

  return { gates, resolution, ready: true };
}
