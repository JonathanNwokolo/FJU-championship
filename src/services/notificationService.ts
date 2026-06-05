import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { saveInAppNotification } from './inAppNotifications';

// ---------------------------------------------------------------------------
// Local token cache (AsyncStorage) — evita round-trip ao Firestore na releitura
// Formato: { [userId]: { token: string; updatedAt: number } }
// ---------------------------------------------------------------------------

const TOKENS_KEY = 'push_tokens';

type TokenRecord = {
  token: string;
  updatedAt: number;
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

// ---------------------------------------------------------------------------
// 1. registerForPushNotifications
// Deve ser chamado APÓS o login, com o uid real do Firebase Auth.
// Obtém o token Expo e persiste no Firestore + cache local.
// ---------------------------------------------------------------------------

export async function registerForPushNotifications(userId: string): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('[notifications] Skipped: not a physical device');
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[notifications] Permission denied');
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    console.warn('[notifications] No EAS projectId found in app config');
    return null;
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await saveTokenToFirestore(userId, token);
    return token;
  } catch (e) {
    console.warn('[notifications] getExpoPushTokenAsync error:', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2. saveTokenToFirestore
// Persiste o token em push_tokens/{userId} no Firestore e atualiza cache local.
// ---------------------------------------------------------------------------

export async function saveTokenToFirestore(userId: string, token: string): Promise<void> {
  try {
    // Cache local (AsyncStorage)
    const store = await readTokenStore();
    store[userId] = { token, updatedAt: Date.now() };
    await writeTokenStore(store);

    // Firestore — fonte de verdade para notificações entre usuários
    await setDoc(
      doc(db, 'push_tokens', userId),
      { userId, token, platform: Platform.OS, updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (e) {
    console.warn('[notifications] saveTokenToFirestore error:', e);
  }
}

// ---------------------------------------------------------------------------
// 3. removeTokenFromFirestore (Limpar no logout)
// ---------------------------------------------------------------------------

export async function removeTokenFromFirestore(userId: string): Promise<void> {
  try {
    // Remove from local cache
    const store = await readTokenStore();
    delete store[userId];
    await writeTokenStore(store);

    // Remove from Firestore
    await deleteDoc(doc(db, 'push_tokens', userId));
    await AsyncStorage.removeItem('pushToken');
  } catch (e) {
    console.warn('[notifications] removeTokenFromFirestore error:', e);
  }
}

// ---------------------------------------------------------------------------
// 4. getTokensForUsers
// ---------------------------------------------------------------------------

export async function getTokensForUsers(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  try {
    const tokens: string[] = [];
    for (let i = 0; i < userIds.length; i += 10) {
      const batch = userIds.slice(i, i + 10);
      const q = query(collection(db, 'push_tokens'), where('userId', 'in', batch));
      const snap = await getDocs(q);
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.token) tokens.push(data.token);
      });
    }
    return tokens;
  } catch (e) {
    console.warn('[notifications] getTokensForUsers error:', e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 5. getTokensForChampionship
// ---------------------------------------------------------------------------

export async function getTokensForChampionship(championshipId: string): Promise<string[]> {
  try {
    const playersQuery = query(
      collection(db, 'players'),
      where('championshipId', '==', championshipId)
    );
    const playersSnapshot = await getDocs(playersQuery);
    if (playersSnapshot.empty) return [];

    const userIds = new Set<string>();
    playersSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.userId) userIds.add(data.userId);
    });

    const uniqueUserIds = Array.from(userIds);
    if (uniqueUserIds.length === 0) return [];

    const tokens: string[] = [];
    for (let i = 0; i < uniqueUserIds.length; i += 10) {
      const batchIds = uniqueUserIds.slice(i, i + 10);
      const tokensQuery = query(
        collection(db, 'push_tokens'),
        where('userId', 'in', batchIds)
      );
      const tokensSnapshot = await getDocs(tokensQuery);
      tokensSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.token) tokens.push(data.token);
      });
    }
    return tokens;
  } catch (e) {
    console.warn('[notifications] getTokensForChampionship error:', e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 6. sendPushNotification (lotes de 100 — limite Expo Push API)
// ---------------------------------------------------------------------------

type NotificationPayload = {
  to: string;
  title: string;
  body: string;
  data?: object;
  sound: 'default';
  badge: number;
};

export async function sendPushNotification(
  tokens: string[],
  title: string,
  body: string,
  data: object = {},
): Promise<void> {
  if (tokens.length === 0) return;

  const BATCH_SIZE = 100;
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    const messages: NotificationPayload[] = batch.map((to) => ({
      to,
      title,
      body,
      data,
      sound: 'default',
      badge: 1,
    }));

    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });
      if (!res.ok) console.warn('[notifications] Push API HTTP error:', res.status);
    } catch (e) {
      console.warn('[notifications] sendPushNotification error:', e);
    }
  }
}

// ---------------------------------------------------------------------------
// 7. notifyGoal
// ---------------------------------------------------------------------------

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
  const title = '⚽ GOL!';
  const body = `${scorerName} marcou para ${teamName}! ${homeTeam} ${homeScore} x ${awayScore} ${awayTeam}`;
  const tokens = await getTokensForChampionship(championshipId);
  await sendPushNotification(tokens, title, body, { type: 'goal', championshipId, homeScore, awayScore });
  if (allUserIds.length > 0) {
    await saveInAppNotification(allUserIds, 'goal', title, body, { championshipId, homeScore, awayScore });
  }
}

// ---------------------------------------------------------------------------
// 8. notifyMatchStarted
// ---------------------------------------------------------------------------

export async function notifyMatchStarted(
  championshipId: string,
  homeTeam: string,
  awayTeam: string,
  matchId: string,
  allUserIds: string[] = [],
): Promise<void> {
  const title = '🏟️ Partida ao vivo!';
  const body = `${homeTeam} x ${awayTeam} começou agora`;
  const tokens = await getTokensForChampionship(championshipId);
  await sendPushNotification(tokens, title, body, { type: 'match_started', championshipId, matchId });
  if (allUserIds.length > 0) {
    await saveInAppNotification(allUserIds, 'match_started', title, body, { championshipId, matchId });
  }
}

// ---------------------------------------------------------------------------
// 9. notifyMatchFinished
// ---------------------------------------------------------------------------

export async function notifyMatchFinished(
  championshipId: string,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
  matchId: string,
  allUserIds: string[] = [],
): Promise<void> {
  const title = '🔚 Partida encerrada';
  const body = `${homeTeam} ${homeScore} x ${awayScore} ${awayTeam}`;
  const tokens = await getTokensForChampionship(championshipId);
  await sendPushNotification(tokens, title, body, { type: 'match_finished', championshipId, matchId, homeScore, awayScore });
  if (allUserIds.length > 0) {
    await saveInAppNotification(allUserIds, 'match_finished', title, body, { championshipId, matchId, homeScore, awayScore });
  }
}

// ---------------------------------------------------------------------------
// 10. notifyMatchScheduled — envia para os capitães dos dois times
// ---------------------------------------------------------------------------

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
  const title = '📅 Partida agendada';
  const body = `${homeTeam} x ${awayTeam} — ${dateStr} às ${timeStr}${locationSuffix}`;

  if (tokens.length > 0) {
    await sendPushNotification(tokens, title, body, { type: 'match_scheduled', matchId });
  }
  if (validIds.length > 0) {
    await saveInAppNotification(validIds, 'match_scheduled', title, body, { matchId });
  }
}

export async function notifyJoinRequest(
  captainId: string,
  teamName: string,
  requesterName: string,
): Promise<void> {
  const title = 'Novo pedido para entrar no time';
  const body = `${requesterName} quer entrar no ${teamName}`;
  const tokens = await getTokensForUsers([captainId]);

  if (tokens.length > 0) {
    await sendPushNotification(tokens, title, body, { type: 'join_request', teamName });
  }
  await saveInAppNotification([captainId], 'join_request', title, body, { teamName });
}

export async function notifyJoinRequestResult(
  athleteId: string,
  approved: boolean,
  teamName: string,
): Promise<void> {
  const title = approved ? 'Solicitação aprovada' : 'Solicitação recusada';
  const body = approved
    ? `Seu pedido para entrar no ${teamName} foi aprovado`
    : `Seu pedido para entrar no ${teamName} foi recusado`;
  const notificationType = approved ? 'join_request_approved' : 'join_request_rejected';
  const tokens = await getTokensForUsers([athleteId]);

  if (tokens.length > 0) {
    await sendPushNotification(tokens, title, body, { type: notificationType, teamName });
  }
  await saveInAppNotification([athleteId], notificationType, title, body, { teamName });
}

export async function notifyWaitlistSpotAvailable(
  athleteId: string,
  teamName: string,
  inviteCode: string,
): Promise<void> {
  const title = '🎉 Vaga aberta!';
  const body = `Uma vaga abriu no time ${teamName}! Use o código ${inviteCode} para entrar.`;
  const tokens = await getTokensForUsers([athleteId]);

  if (tokens.length > 0) {
    await sendPushNotification(tokens, title, body, { type: 'waitlist_spot_available', teamName, inviteCode });
  }
  await saveInAppNotification([athleteId], 'waitlist_spot_available', title, body, { teamName, inviteCode });
}

// ---------------------------------------------------------------------------
// 12. notifyTeamApproved — notifica o capitão quando seu time é aprovado
// ---------------------------------------------------------------------------

export async function notifyTeamApproved(
  captainId: string,
  teamName: string,
  championshipName: string,
): Promise<void> {
  const title = '✅ Time aprovado!';
  const body = `O time ${teamName} foi aprovado para participar do ${championshipName}`;
  const tokens = await getTokensForUsers([captainId]);

  if (tokens.length > 0) {
    await sendPushNotification(tokens, title, body, { type: 'team_approved', teamName, championshipName });
  }
  await saveInAppNotification([captainId], 'team_approved', title, body, { teamName, championshipName });
}

// ---------------------------------------------------------------------------
// 13. notifyTeamRejected — notifica o capitão quando seu time é rejeitado
// ---------------------------------------------------------------------------

export async function notifyTeamRejected(
  captainId: string,
  teamName: string,
  championshipName: string,
): Promise<void> {
  const title = '❌ Time não aprovado';
  const body = `O time ${teamName} não foi aprovado para o ${championshipName}. Entre em contato com o organizador.`;
  const tokens = await getTokensForUsers([captainId]);

  if (tokens.length > 0) {
    await sendPushNotification(tokens, title, body, { type: 'team_rejected', teamName, championshipName });
  }
  await saveInAppNotification([captainId], 'team_rejected', title, body, { teamName, championshipName });
}
