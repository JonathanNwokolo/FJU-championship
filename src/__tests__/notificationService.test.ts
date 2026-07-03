import {
  getTokensForUsers,
  groupFixturesGeneratedDedupKey,
  groupsGeneratedDedupKey,
  knockoutGeneratedDedupKey,
  knockoutMatchDefinedDedupKey,
  matchCorrectedDedupKey,
  notifyGroupsGenerated,
  notifyKnockoutMatchDefined,
  notifyMatchCorrected,
  notifyTeamEliminated,
  notifyTeamQualified,
  registerForPushNotifications,
  sendPushNotification,
  teamEliminatedDedupKey,
  teamQualifiedDedupKey,
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

  // ── Bloco 10.4 — emissão do formato grupos + mata-mata ─────────────────────
  describe('emissores de grupos + mata-mata', () => {
    const { saveInAppNotification } = require('../services/inAppNotifications');

    beforeEach(() => {
      saveInAppNotification.mockClear();
    });

    it('deduplicationKeys são determinísticos', () => {
      expect(groupsGeneratedDedupKey('c1', 2)).toBe('groups_generated_c1_2');
      expect(groupFixturesGeneratedDedupKey('c1', 3)).toBe('group_fixtures_generated_c1_3');
      expect(teamQualifiedDedupKey('c1', 1, 't1')).toBe('team_qualified_c1_1_t1');
      expect(teamEliminatedDedupKey('c1', 1, 't2')).toBe('team_eliminated_c1_1_t2');
      expect(knockoutGeneratedDedupKey('c1', 1)).toBe('knockout_generated_c1_1');
      expect(knockoutMatchDefinedDedupKey('m1', 1)).toBe('knockout_match_defined_m1_1');
      expect(matchCorrectedDedupKey('m1', 4)).toBe('match_corrected_m1_4');
    });

    it('versão nova gera dedup key diferente', () => {
      expect(matchCorrectedDedupKey('m1', 1)).not.toBe(matchCorrectedDedupKey('m1', 2));
    });

    it('notifyGroupsGenerated grava in-app com contrato v1 + dedup key', async () => {
      await notifyGroupsGenerated('c1', ['u1', 'u2'], 2);
      expect(saveInAppNotification).toHaveBeenCalledTimes(1);
      const [userIds, type, , , data] = saveInAppNotification.mock.calls[0];
      expect(userIds).toEqual(['u1', 'u2']);
      expect(type).toBe('groups_generated');
      expect(data).toMatchObject({
        type: 'groups_generated',
        payloadVersion: 1,
        championshipId: 'c1',
        groupGenerationVersion: 2,
        deduplicationKey: 'groups_generated_c1_2',
      });
    });

    it('não emite quando não há destinatários', async () => {
      await notifyGroupsGenerated('c1', [], 2);
      await notifyTeamQualified('c1', 't1', 'Time', 1, []);
      expect(saveInAppNotification).not.toHaveBeenCalled();
    });

    it('team_qualified e team_eliminated carregam snapshotVersion e teamId', async () => {
      await notifyTeamQualified('c1', 't1', 'Alpha', 3, ['u1']);
      await notifyTeamEliminated('c1', 't2', 'Beta', 3, ['u2']);
      const qualified = saveInAppNotification.mock.calls.find((c: unknown[]) => c[1] === 'team_qualified');
      const eliminated = saveInAppNotification.mock.calls.find((c: unknown[]) => c[1] === 'team_eliminated');
      expect(qualified?.[4]).toMatchObject({ teamId: 't1', snapshotVersion: 3, deduplicationKey: 'team_qualified_c1_3_t1' });
      expect(eliminated?.[4]).toMatchObject({ teamId: 't2', snapshotVersion: 3, deduplicationKey: 'team_eliminated_c1_3_t2' });
    });

    it('knockout_match_defined preserva matchId e originSnapshotVersion', async () => {
      await notifyKnockoutMatchDefined('c1', 'm9', 1, ['u1']);
      const data = saveInAppNotification.mock.calls[0][4];
      expect(data).toMatchObject({
        type: 'knockout_match_defined',
        matchId: 'm9',
        snapshotVersion: 1,
        deduplicationKey: 'knockout_match_defined_m9_1',
      });
    });

    it('match_corrected inclui stage, correctionVersion e groupId quando existir', async () => {
      await notifyMatchCorrected({
        championshipId: 'c1',
        matchId: 'm1',
        stage: 'group',
        groupId: 'A',
        correctionVersion: 4,
        userIds: ['u1'],
      });
      const data = saveInAppNotification.mock.calls[0][4];
      expect(data).toMatchObject({
        type: 'match_corrected',
        championshipId: 'c1',
        matchId: 'm1',
        stage: 'group',
        groupId: 'A',
        correctionVersion: 4,
        deduplicationKey: 'match_corrected_m1_4',
      });
    });

    it('match_corrected omite groupId em partida sem grupo', async () => {
      await notifyMatchCorrected({
        championshipId: 'c1',
        matchId: 'm1',
        stage: 'league',
        groupId: null,
        correctionVersion: 1,
        userIds: ['u1'],
      });
      const data = saveInAppNotification.mock.calls[0][4];
      expect(data).not.toHaveProperty('groupId');
    });
  });
});
