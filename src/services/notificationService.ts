import AsyncStorage from '@react-native-async-storage/async-storage';
import { isRunningInExpoGo } from 'expo';
import * as Device from 'expo-device';
import type * as NotificationsType from 'expo-notifications';
import { Platform } from 'react-native';

// Conditional require prevents DevicePushTokenAutoRegistration.fx from running
// its module-level addPushTokenListener call in Expo Go (throws on Android SDK 53+).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Notifications = isRunningInExpoGo()
  ? (null as unknown as typeof NotificationsType)
  : (require('expo-notifications') as typeof NotificationsType);
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { saveInAppNotification } from './inAppNotifications';
import { MOCK_DATA_ENABLED as USE_MOCK } from '../config/appConfig';

const EAS_PROJECT_ID = '5ec2467f-8312-4bc0-94a4-704fa0700e99';
const TOKENS_KEY = 'push_tokens';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type TokenRecord = {
  token: string;
  updatedAt: number;
};

type PushData = Record<string, string | number>;

type NotificationPayload = {
  to: string;
  title: string;
  body: string;
  data?: PushData;
  sound: 'default';
  badge: number;
};

async function readTokenStore(): Promise<Record<string, TokenRecord>> {
  try {
    const raw = await AsyncStorage.getItem(TOKENS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeTokenStore(store: Record<string, TokenRecord>): Promise<void> {
  try {
    await AsyncStorage.setItem(TOKENS_KEY, JSON.stringify(store));
  } catch (e) {
    console.warn('[notifications] writeTokenStore error:', e);
  }
}

export async function registerForPushNotifications(userId: string): Promise<string | null> {
  if (USE_MOCK) return null;
  if (!userId) return null;
  if (Platform.OS === 'web') return null;
  if (isRunningInExpoGo()) return null;
  if (!Device.isDevice) return null;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#F5A623',
      });
    }

    if (!Device.isDevice) {
      console.log('[notifications] Push token skipped: unsupported simulator/emulator');
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[notifications] Push permission denied');
      return null;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: EAS_PROJECT_ID,
    });

    await saveTokenToFirestore(userId, token);
    return token;
  } catch (e) {
    console.warn('[notifications] registerForPushNotifications error:', e);
    return null;
  }
}

export async function saveTokenToFirestore(userId: string, token: string): Promise<void> {
  if (USE_MOCK) return;
  try {
    const store = await readTokenStore();
    store[userId] = { token, updatedAt: Date.now() };
    await writeTokenStore(store);

    // BE-01: o token vive APENAS em /push_tokens (coleção protegida), nunca em /users.
    await setDoc(
      doc(db, 'push_tokens', userId),
      { userId, token, platform: Platform.OS, updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (e) {
    console.warn('[notifications] saveTokenToFirestore error:', e);
  }
}

export async function removeTokenFromFirestore(userId: string): Promise<void> {
  if (USE_MOCK) return;
  try {
    const store = await readTokenStore();
    delete store[userId];
    await writeTokenStore(store);

    // BE-01: token só existe em /push_tokens — basta removê-lo de lá.
    await deleteDoc(doc(db, 'push_tokens', userId));
    await AsyncStorage.removeItem('pushToken');
  } catch (e) {
    console.warn('[notifications] removeTokenFromFirestore error:', e);
  }
}

function isExpoPushToken(value: unknown): value is string {
  return typeof value === 'string' && value.includes('PushToken');
}

export async function getTokensForUsers(userIds: string[]): Promise<string[]> {
  if (USE_MOCK) return [];
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) return [];

  try {
    const tokens: string[] = [];
    for (const userId of uniqueUserIds) {
      // BE-01: tokens são lidos de /push_tokens (protegido), não mais de /users.
      const snap = await getDoc(doc(db, 'push_tokens', userId));
      if (!snap.exists()) continue;

      const token = snap.data().token;
      if (isExpoPushToken(token)) {
        tokens.push(token);
      }
    }

    return Array.from(new Set(tokens));
  } catch (e) {
    console.warn('[notifications] getTokensForUsers error:', e);
    return [];
  }
}

export async function getTokensForChampionship(championshipId: string): Promise<string[]> {
  if (USE_MOCK) return [];
  try {
    const userIds = new Set<string>();

    const playersQuery = query(
      collection(db, 'players'),
      where('championshipId', '==', championshipId),
    );
    const playersSnapshot = await getDocs(playersQuery);
    playersSnapshot.docs.forEach((playerDoc) => {
      const data = playerDoc.data();
      if (typeof data.userId === 'string') userIds.add(data.userId);
    });

    const teamsQuery = query(
      collection(db, 'teams'),
      where('championshipId', '==', championshipId),
    );
    const teamsSnapshot = await getDocs(teamsQuery);
    teamsSnapshot.docs.forEach((teamDoc) => {
      const data = teamDoc.data();
      if (typeof data.captainId === 'string') userIds.add(data.captainId);
    });

    return getTokensForUsers(Array.from(userIds));
  } catch (e) {
    console.warn('[notifications] getTokensForChampionship error:', e);
    return [];
  }
}

export async function sendPushNotification(
  tokens: string[],
  title: string,
  body: string,
  data: PushData = {},
): Promise<void> {
  if (USE_MOCK) return;
  const uniqueTokens = Array.from(new Set(tokens.filter(isExpoPushToken)));
  if (uniqueTokens.length === 0) return;

  const BATCH_SIZE = 100;
  for (let i = 0; i < uniqueTokens.length; i += BATCH_SIZE) {
    const batch = uniqueTokens.slice(i, i + BATCH_SIZE);
    const messages: NotificationPayload[] = batch.map((to) => ({
      to,
      title,
      body,
      data,
      sound: 'default',
      badge: 1,
    }));

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      if (!res.ok) {
        console.warn('[notifications] Push API HTTP error:', res.status);
      }
    } catch (e) {
      console.warn('[notifications] sendPushNotification error:', e);
    }
  }
}

export async function notifyGoal(
  championshipId: string,
  scorerName: string,
  teamName: string,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
  allUserIds: string[] = [],
): Promise<void> {
  const title = 'GOL!';
  const body = `${scorerName} marcou para ${teamName}! ${homeTeam} ${homeScore} x ${awayScore} ${awayTeam}`;
  const data = { type: 'goal', championshipId, homeScore, awayScore };
  const tokens = await getTokensForChampionship(championshipId);
  await sendPushNotification(tokens, title, body, data);
  if (allUserIds.length > 0) {
    await saveInAppNotification(allUserIds, 'goal', title, body, data);
  }
}

export async function notifyMatchStarted(
  championshipId: string,
  homeTeam: string,
  awayTeam: string,
  matchId: string,
  allUserIds: string[] = [],
): Promise<void> {
  const title = 'Partida ao vivo!';
  const body = `${homeTeam} x ${awayTeam} comecou agora`;
  const data = { type: 'match_started', championshipId, matchId };
  const tokens = await getTokensForChampionship(championshipId);
  await sendPushNotification(tokens, title, body, data);
  if (allUserIds.length > 0) {
    await saveInAppNotification(allUserIds, 'match_started', title, body, data);
  }
}

export async function notifyMatchFinished(
  championshipId: string,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
  matchId: string,
  allUserIds: string[] = [],
): Promise<void> {
  const title = 'Partida encerrada';
  const body = `${homeTeam} ${homeScore} x ${awayScore} ${awayTeam}`;
  const data = { type: 'match_finished', championshipId, matchId, homeScore, awayScore };
  const tokens = await getTokensForChampionship(championshipId);
  await sendPushNotification(tokens, title, body, data);
  if (allUserIds.length > 0) {
    await saveInAppNotification(allUserIds, 'match_finished', title, body, data);
  }
}

export async function notifyMatchScheduled(
  captainIds: string[],
  homeTeam: string,
  awayTeam: string,
  scheduledAt: Date,
  location: string | null,
  matchId: string,
): Promise<void> {
  const validIds = captainIds.filter(Boolean);
  const tokens = await getTokensForUsers(validIds);

  const dateStr = scheduledAt.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
  const timeStr = `${scheduledAt.getHours().toString().padStart(2, '0')}h${scheduledAt.getMinutes().toString().padStart(2, '0')}`;
  const locationSuffix = location ? ` em ${location}` : '';
  const title = 'Partida agendada';
  const body = `${homeTeam} x ${awayTeam} - ${dateStr} as ${timeStr}${locationSuffix}`;
  const data = { type: 'match_scheduled', matchId };

  await sendPushNotification(tokens, title, body, data);
  if (validIds.length > 0) {
    await saveInAppNotification(validIds, 'match_scheduled', title, body, data);
  }
}

export async function notifyJoinRequest(
  captainId: string,
  teamName: string,
  requesterName: string,
): Promise<void> {
  const title = 'Novo pedido para entrar no time';
  const body = `${requesterName} quer entrar no ${teamName}`;
  const data = { type: 'join_request', teamName };
  const tokens = await getTokensForUsers([captainId]);

  await sendPushNotification(tokens, title, body, data);
  await saveInAppNotification([captainId], 'join_request', title, body, data);
}

export async function notifyJoinRequestResult(
  athleteId: string,
  approved: boolean,
  teamName: string,
): Promise<void> {
  const title = approved ? 'Solicitacao aprovada' : 'Solicitacao recusada';
  const body = approved
    ? `Seu pedido para entrar no ${teamName} foi aprovado`
    : `Seu pedido para entrar no ${teamName} foi recusado`;
  const notificationType = approved ? 'join_request_approved' : 'join_request_rejected';
  const data = { type: notificationType, teamName };
  const tokens = await getTokensForUsers([athleteId]);

  await sendPushNotification(tokens, title, body, data);
  await saveInAppNotification([athleteId], notificationType, title, body, data);
}

export async function notifyWaitlistSpotAvailable(
  athleteId: string,
  teamName: string,
  inviteCode: string,
): Promise<void> {
  const title = 'Vaga aberta!';
  const body = `Uma vaga abriu no time ${teamName}! Use o codigo ${inviteCode} para entrar.`;
  const data = { type: 'waitlist_spot_available', teamName, inviteCode };
  const tokens = await getTokensForUsers([athleteId]);

  await sendPushNotification(tokens, title, body, data);
  await saveInAppNotification([athleteId], 'waitlist_spot_available', title, body, data);
}

export async function notifyTeamApproved(
  captainId: string,
  teamName: string,
  championshipName: string,
): Promise<void> {
  const title = 'Time aprovado!';
  const body = `O time ${teamName} foi aprovado para participar do ${championshipName}`;
  const data = { type: 'team_approved', teamName, championshipName };
  const tokens = await getTokensForUsers([captainId]);

  await sendPushNotification(tokens, title, body, data);
  await saveInAppNotification([captainId], 'team_approved', title, body, data);
}

export async function notifyTeamRejected(
  captainId: string,
  teamName: string,
  championshipName: string,
): Promise<void> {
  const title = 'Time nao aprovado';
  const body = `O time ${teamName} nao foi aprovado para o ${championshipName}. Entre em contato com o organizador.`;
  const data = { type: 'team_rejected', teamName, championshipName };
  const tokens = await getTokensForUsers([captainId]);

  await sendPushNotification(tokens, title, body, data);
  await saveInAppNotification([captainId], 'team_rejected', title, body, data);
}
