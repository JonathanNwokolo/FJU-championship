import {
  NormalizedNotificationAction,
  NotificationActionDestination,
  NotificationActionFailureReason,
  NotificationActionRawPayload,
  NotificationActionSource,
  PendingNotificationAction,
} from '../types/notificationActions';
import {
  NotificationActionRuntimeState,
  parseNotificationAction,
  prepareNotificationAction,
} from '../utils/notificationActionPipeline';

export type NotificationActionNavigate = (destination: NotificationActionDestination) => void;
export type NotificationActionSelectChampionship = (championshipId: string) => void;

export interface NotificationActionFlushOptions {
  navigate: NotificationActionNavigate;
  selectChampionship: NotificationActionSelectChampionship;
  now?: number;
}

export interface NotificationActionResult {
  status: 'queued' | 'navigated' | 'ignored' | 'failed';
  actionId?: string;
  reason?: NotificationActionFailureReason;
}

export class NotificationActionOrchestrator {
  private pending = new Map<string, PendingNotificationAction>();
  private consumed = new Set<string>();
  private navigating = new Set<string>();

  enqueue(action: NormalizedNotificationAction, now: number = Date.now()): NotificationActionResult {
    if (this.consumed.has(action.actionId)) {
      return { status: 'ignored', actionId: action.actionId, reason: 'already_consumed' };
    }
    if (action.expiresAt <= now) {
      this.consumed.add(action.actionId);
      return { status: 'failed', actionId: action.actionId, reason: 'expired' };
    }
    if (this.pending.has(action.actionId)) {
      return { status: 'queued', actionId: action.actionId };
    }

    this.pending.set(action.actionId, {
      action,
      createdAt: now,
      expiresAt: action.expiresAt,
      status: 'pending',
    });
    return { status: 'queued', actionId: action.actionId };
  }

  handleRaw(
    raw: NotificationActionRawPayload,
    source: NotificationActionSource,
    state: NotificationActionRuntimeState,
    options: NotificationActionFlushOptions,
  ): NotificationActionResult {
    const now = options.now ?? Date.now();
    const action = parseNotificationAction(raw, source, now);
    if (!action) return { status: 'failed', reason: 'parse_failed' };
    const enqueued = this.enqueue(action, now);
    if (enqueued.status === 'failed' || enqueued.status === 'ignored') return enqueued;
    return this.flush(state, options).find((result) => result.actionId === action.actionId) ?? enqueued;
  }

  flush(
    state: NotificationActionRuntimeState,
    options: NotificationActionFlushOptions,
  ): NotificationActionResult[] {
    const now = options.now ?? Date.now();
    const results: NotificationActionResult[] = [];

    for (const [actionId, pending] of [...this.pending.entries()]) {
      if (this.consumed.has(actionId)) {
        this.pending.delete(actionId);
        results.push({ status: 'ignored', actionId, reason: 'already_consumed' });
        continue;
      }

      const preparation = prepareNotificationAction(pending.action, state, now);
      if (preparation.failureReason) {
        this.pending.delete(actionId);
        this.consumed.add(actionId);
        results.push({ status: 'failed', actionId, reason: preparation.failureReason });
        continue;
      }

      if (preparation.championshipIdToSelect) {
        options.selectChampionship(preparation.championshipIdToSelect);
        results.push({ status: 'queued', actionId });
        continue;
      }

      if (!preparation.ready) {
        results.push({ status: 'queued', actionId });
        continue;
      }

      if (this.navigating.has(actionId)) {
        results.push({ status: 'ignored', actionId, reason: 'already_consumed' });
        continue;
      }

      this.navigating.add(actionId);
      pending.status = 'navigating';
      options.navigate(preparation.resolution.destination);
      this.pending.delete(actionId);
      this.navigating.delete(actionId);
      this.consumed.add(actionId);
      results.push({ status: 'navigated', actionId });
    }

    return results;
  }

  getPendingActions(): PendingNotificationAction[] {
    return [...this.pending.values()];
  }

  resetForTests(): void {
    this.pending.clear();
    this.consumed.clear();
    this.navigating.clear();
  }
}

declare global {
  var __FJU_NOTIFICATION_ACTION_ORCHESTRATOR__: NotificationActionOrchestrator | undefined;
}

export function getNotificationActionOrchestrator(): NotificationActionOrchestrator {
  if (!globalThis.__FJU_NOTIFICATION_ACTION_ORCHESTRATOR__) {
    globalThis.__FJU_NOTIFICATION_ACTION_ORCHESTRATOR__ = new NotificationActionOrchestrator();
  }
  return globalThis.__FJU_NOTIFICATION_ACTION_ORCHESTRATOR__;
}
