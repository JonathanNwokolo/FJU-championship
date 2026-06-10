import {
  getTokensForUsers,
  registerForPushNotifications,
  sendPushNotification,
} from '../services/notificationService';

jest.mock('expo', () => ({
  isRunningInExpoGo: jest.fn().mockReturnValue(false),
}));

jest.mock('expo-device', () => ({
  isDevice: false,
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  deleteDoc: jest.fn(() => Promise.resolve()),
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(() => Promise.resolve({ exists: () => false, data: () => ({}) })),
  getDocs: jest.fn(() => Promise.resolve({ docs: [] })),
  query: jest.fn(),
  serverTimestamp: jest.fn(() => null),
  setDoc: jest.fn(() => Promise.resolve()),
  where: jest.fn(),
}));

jest.mock('../services/inAppNotifications', () => ({
  saveInAppNotification: jest.fn(() => Promise.resolve()),
}));

const mockFetch = jest.fn();

describe('notificationService', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({ ok: true });
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  describe('registerForPushNotifications', () => {
    it('retorna null quando userId e vazio', async () => {
      const result = await registerForPushNotifications('');
      expect(result).toBeNull();
    });

    it('retorna null em ambiente nao-dispositivo (simulador/emulador)', async () => {
      // Device.isDevice = false no mock — funcao retorna null antes de tentar obter token
      const result = await registerForPushNotifications('user-123');
      expect(result).toBeNull();
    });
  });

  describe('sendPushNotification', () => {
    it('nao chama fetch quando lista de tokens e vazia', async () => {
      await sendPushNotification([], 'Titulo', 'Corpo');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('nao chama fetch quando tokens nao sao Expo Push Tokens', async () => {
      await sendPushNotification(['token-invalido', 'outro-invalido'], 'Titulo', 'Corpo');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('chama fetch com ExponentPushToken valido', async () => {
      await sendPushNotification(['ExponentPushToken[abc123]'], 'Titulo', 'Corpo');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('filtra tokens invalidos e envia somente os validos', async () => {
      await sendPushNotification(
        ['invalido', 'ExponentPushToken[valido]', 'tambem-invalido'],
        'Titulo',
        'Corpo',
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toHaveLength(1);
      expect(body[0].to).toBe('ExponentPushToken[valido]');
    });

    it('deduplica tokens repetidos no mesmo envio', async () => {
      const token = 'ExponentPushToken[abc123]';
      await sendPushNotification([token, token, token], 'Titulo', 'Corpo');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toHaveLength(1);
    });

    it('envia payload com titulo, corpo e som corretos', async () => {
      await sendPushNotification(['ExponentPushToken[test]'], 'GOL!', 'Time A marcou');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body[0].title).toBe('GOL!');
      expect(body[0].body).toBe('Time A marcou');
      expect(body[0].sound).toBe('default');
    });

    it('envia dados extras (data) quando fornecidos', async () => {
      await sendPushNotification(
        ['ExponentPushToken[test]'],
        'Titulo',
        'Corpo',
        { type: 'goal', championshipId: 'champ-1' },
      );
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body[0].data).toEqual({ type: 'goal', championshipId: 'champ-1' });
    });

    it('usa Content-Type application/json no header', async () => {
      await sendPushNotification(['ExponentPushToken[test]'], 'T', 'B');
      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Content-Type']).toBe('application/json');
    });
  });

  describe('getTokensForUsers', () => {
    it('retorna lista vazia para array vazio de userIds', async () => {
      const result = await getTokensForUsers([]);
      expect(result).toEqual([]);
    });

    it('retorna lista vazia quando nenhum usuario tem token no Firestore', async () => {
      // getDoc mockado retorna { exists: () => false }
      const result = await getTokensForUsers(['user-1', 'user-2']);
      expect(result).toEqual([]);
    });

    it('filtra userIds vazios ou nulos', async () => {
      const result = await getTokensForUsers(['', '', '']);
      expect(result).toEqual([]);
    });

    it('deduplica userIds antes de consultar Firestore', async () => {
      const { getDoc } = require('firebase/firestore');
      await getTokensForUsers(['user-1', 'user-1', 'user-1']);
      // Deve consultar apenas uma vez, nao tres
      expect(getDoc).toHaveBeenCalledTimes(1);
    });
  });
});
