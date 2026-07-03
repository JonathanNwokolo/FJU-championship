import { NotificationActionRawPayload } from '../types/notificationActions';

type RemovableSubscription = { remove: () => void };

type NotificationLike = {
  request?: {
    identifier?: string;
    content?: {
      data?: Record<string, unknown>;
      title?: string | null;
    };
  };
};

type NotificationResponseLike = {
  notification: NotificationLike;
};

export interface NotificationListenersAdapter {
  addNotificationReceivedListener: (listener: (notification: NotificationLike) => void) => RemovableSubscription;
  addNotificationResponseReceivedListener: (
    listener: (response: NotificationResponseLike) => void,
  ) => RemovableSubscription;
  getLastNotificationResponse: () => NotificationResponseLike | null;
}

export interface DeepLinkingAdapter {
  addEventListener: (
    type: 'url',
    listener: (event: { url: string }) => void,
  ) => RemovableSubscription;
  getInitialURL: () => Promise<string | null> | string | null;
}

export interface RegisterNotificationListenersOptions {
  notifications: NotificationListenersAdapter | null;
  linking?: DeepLinkingAdapter | null;
  onNotificationAction: (payload: NotificationActionRawPayload) => void;
  onDeepLinkAction?: (url: string) => void;
  onForegroundNotification?: (notification: NotificationLike) => void;
}

let activeCleanup: (() => void) | null = null;

function payloadFromNotification(notification: NotificationLike): NotificationActionRawPayload {
  const data = notification.request?.content?.data ?? {};
  return {
    ...data,
    actionId: typeof data.actionId === 'string'
      ? data.actionId
      : notification.request?.identifier,
  };
}

export function registerNotificationActionListeners(
  options: RegisterNotificationListenersOptions,
): () => void {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }

  if (!options.notifications) {
    if (!options.linking || !options.onDeepLinkAction) {
      return () => undefined;
    }
  }

  const cleanupFns: Array<() => void> = [];
  let disposed = false;

  if (options.notifications) {
    const received = options.notifications.addNotificationReceivedListener((notification) => {
      options.onForegroundNotification?.(notification);
    });

    const response = options.notifications.addNotificationResponseReceivedListener((event) => {
      options.onNotificationAction(payloadFromNotification(event.notification));
    });

    const lastResponse = options.notifications.getLastNotificationResponse();
    if (lastResponse?.notification) {
      options.onNotificationAction(payloadFromNotification(lastResponse.notification));
    }

    cleanupFns.push(() => received.remove(), () => response.remove());
  }

  if (options.linking && options.onDeepLinkAction) {
    const linkSubscription = options.linking.addEventListener('url', ({ url }) => {
      options.onDeepLinkAction?.(url);
    });

    Promise.resolve(options.linking.getInitialURL()).then((url) => {
      if (!disposed && url) {
        options.onDeepLinkAction?.(url);
      }
    });

    cleanupFns.push(() => linkSubscription.remove());
  }

  activeCleanup = () => {
    disposed = true;
    cleanupFns.forEach((cleanup) => cleanup());
    activeCleanup = null;
  };

  return activeCleanup;
}

export function resetNotificationActionListenersForTests(): void {
  if (activeCleanup) activeCleanup();
  activeCleanup = null;
}
