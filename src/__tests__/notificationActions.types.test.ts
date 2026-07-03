import {
  DEFAULT_PENDING_ACTION_TTL_MS,
  NOTIFICATION_ACTION_PAYLOAD_VERSION,
  NotificationActionPayloadV1,
  PendingNotificationAction,
} from '../types/notificationActions';

describe('notification action contract', () => {
  it('usa payload v1 como contrato principal', () => {
    const payload: NotificationActionPayloadV1 = {
      v: NOTIFICATION_ACTION_PAYLOAD_VERSION,
      type: 'match_prematch',
      matchId: 'match1',
    };

    expect(payload.v).toBe(1);
  });

  it('pending action em memoria carrega actionId e expiresAt', () => {
    const now = Date.now();
    const pending: PendingNotificationAction = {
      action: {
        version: NOTIFICATION_ACTION_PAYLOAD_VERSION,
        source: 'notification',
        actionId: 'act1',
        type: 'notification_center',
        expiresAt: now + DEFAULT_PENDING_ACTION_TTL_MS,
      },
      createdAt: now,
      expiresAt: now + DEFAULT_PENDING_ACTION_TTL_MS,
      status: 'pending',
    };

    expect(pending.action.actionId).toBe('act1');
    expect(pending.expiresAt).toBeGreaterThan(now);
  });
});
