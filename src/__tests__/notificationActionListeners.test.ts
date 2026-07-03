import {
  DeepLinkingAdapter,
  NotificationListenersAdapter,
  registerNotificationActionListeners,
  resetNotificationActionListenersForTests,
} from '../services/notificationActionListeners';

function adapter() {
  const receivedRemove = jest.fn();
  const responseRemove = jest.fn();
  const receivedListeners: Array<(value: unknown) => void> = [];
  const responseListeners: Array<(value: unknown) => void> = [];

  const getLastNotificationResponse = jest.fn<
    ReturnType<NotificationListenersAdapter['getLastNotificationResponse']>,
    []
  >(() => null);

  const api: NotificationListenersAdapter = {
    addNotificationReceivedListener: jest.fn((listener) => {
      receivedListeners.push(listener as (value: unknown) => void);
      return { remove: receivedRemove };
    }),
    addNotificationResponseReceivedListener: jest.fn((listener) => {
      responseListeners.push(listener as (value: unknown) => void);
      return { remove: responseRemove };
    }),
    getLastNotificationResponse,
  };

  return {
    receivedListeners,
    responseListeners,
    receivedRemove,
    responseRemove,
    api,
    getLastNotificationResponse,
  };
}

function linkingAdapter(initialUrl: string | null = null) {
  const remove = jest.fn();
  const urlListeners: Array<(event: { url: string }) => void> = [];
  const api: DeepLinkingAdapter = {
    addEventListener: jest.fn((_type, listener) => {
      urlListeners.push(listener);
      return { remove };
    }),
    getInitialURL: jest.fn(() => initialUrl),
  };

  return { api, remove, urlListeners };
}

describe('registerNotificationActionListeners', () => {
  afterEach(() => {
    resetNotificationActionListenersForTests();
  });

  it('registra received e response e limpa ambos', () => {
    const mock = adapter();
    const cleanup = registerNotificationActionListeners({
      notifications: mock.api,
      onNotificationAction: jest.fn(),
    });

    expect(mock.api.addNotificationReceivedListener).toHaveBeenCalledTimes(1);
    expect(mock.api.addNotificationResponseReceivedListener).toHaveBeenCalledTimes(1);

    cleanup();

    expect(mock.receivedRemove).toHaveBeenCalledTimes(1);
    expect(mock.responseRemove).toHaveBeenCalledTimes(1);
  });

  it('consome ultimo response de app terminated', () => {
    const mock = adapter();
    mock.getLastNotificationResponse.mockReturnValue({
      notification: {
        request: {
          identifier: 'n1',
          content: { data: { type: 'notification_center' } },
        },
      },
    });
    const onNotificationAction = jest.fn();

    registerNotificationActionListeners({
      notifications: mock.api,
      onNotificationAction,
    });

    expect(onNotificationAction).toHaveBeenCalledWith({
      type: 'notification_center',
      actionId: 'n1',
    });
  });

  it('substitui registro anterior para evitar duplicacao em hot reload', () => {
    const first = adapter();
    const second = adapter();

    registerNotificationActionListeners({
      notifications: first.api,
      onNotificationAction: jest.fn(),
    });
    registerNotificationActionListeners({
      notifications: second.api,
      onNotificationAction: jest.fn(),
    });

    expect(first.receivedRemove).toHaveBeenCalledTimes(1);
    expect(first.responseRemove).toHaveBeenCalledTimes(1);
    expect(second.api.addNotificationResponseReceivedListener).toHaveBeenCalledTimes(1);
  });

  it('encaminha deep link por evento url', () => {
    const mock = adapter();
    const linking = linkingAdapter();
    const onDeepLinkAction = jest.fn();

    registerNotificationActionListeners({
      notifications: mock.api,
      linking: linking.api,
      onNotificationAction: jest.fn(),
      onDeepLinkAction,
    });

    linking.urlListeners[0]({ url: 'fju://match/m1' });

    expect(onDeepLinkAction).toHaveBeenCalledWith('fju://match/m1');
  });

  it('encaminha initialURL para app aberto por deep link', async () => {
    const linking = linkingAdapter('fju://notifications');
    const onDeepLinkAction = jest.fn();

    registerNotificationActionListeners({
      notifications: null,
      linking: linking.api,
      onNotificationAction: jest.fn(),
      onDeepLinkAction,
    });
    await Promise.resolve();

    expect(onDeepLinkAction).toHaveBeenCalledWith('fju://notifications');
  });
});
