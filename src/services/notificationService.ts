import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Local token store (AsyncStorage) — substitui Firestore para MVP offline.
// Formato: { [userId]: { token: string; championshipIds: string[]; updatedAt: number } }
// ---------------------------------------------------------------------------

const TOKENS_KEY = 'push_tokens';

type TokenRecord = {
  token: string;
  championshipIds: string[];
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
// ---------------------------------------------------------------------------

export async function registerForPushNotifications(): Promise<string | null> {
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
    return token;
  } catch (e) {
    console.warn('[notifications] getExpoPushTokenAsync error:', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2. saveTokenToFirestore (AsyncStorage para MVP)
// ---------------------------------------------------------------------------

export async function saveTokenToFirestore(
  userId: string,
  token: string,
  championshipId: string,
): Promise<void> {
  try {
    const store = await readTokenStore();
    const existing = store[userId];
    const ids = existing?.championshipIds ?? [];
    store[userId] = {
      token,
      championshipIds: ids.includes(championshipId) ? ids : [...ids, championshipId],
      updatedAt: Date.now(),
    };
    await writeTokenStore(store);
  } catch (e) {
    console.warn('[notifications] saveTokenToFirestore error:', e);
  }
}

// ---------------------------------------------------------------------------
// 3. getTokensForChampionship
// ---------------------------------------------------------------------------

export async function getTokensForChampionship(championshipId: string): Promise<string[]> {
  try {
    const store = await readTokenStore();
    return Object.values(store)
      .filter((r) => r.championshipIds.includes(championshipId))
      .map((r) => r.token);
  } catch (e) {
    console.warn('[notifications] getTokensForChampionship error:', e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 4. sendPushNotification (lotes de 100 — limite Expo Push API)
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

      if (!res.ok) {
        console.warn('[notifications] Push API HTTP error:', res.status);
      }
    } catch (e) {
      console.warn('[notifications] sendPushNotification error:', e);
    }
  }
}

// ---------------------------------------------------------------------------
// 5. notifyGoal
// ---------------------------------------------------------------------------

export async function notifyGoal(
  championshipId: string,
  scorerName: string,
  teamName: string,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
): Promise<void> {
  const tokens = await getTokensForChampionship(championshipId);
  await sendPushNotification(
    tokens,
    '⚽ GOL!',
    `${scorerName} marcou para ${teamName}! ${homeTeam} ${homeScore} x ${awayScore} ${awayTeam}`,
    { type: 'goal', championshipId, homeScore, awayScore },
  );
}

// ---------------------------------------------------------------------------
// 6. notifyMatchStarted
// ---------------------------------------------------------------------------

export async function notifyMatchStarted(
  championshipId: string,
  homeTeam: string,
  awayTeam: string,
  matchId: string,
): Promise<void> {
  const tokens = await getTokensForChampionship(championshipId);
  await sendPushNotification(
    tokens,
    '🏟️ Partida ao vivo!',
    `${homeTeam} x ${awayTeam} começou agora`,
    { type: 'match_started', championshipId, matchId },
  );
}

// ---------------------------------------------------------------------------
// 7. notifyMatchFinished
// ---------------------------------------------------------------------------

export async function notifyMatchFinished(
  championshipId: string,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
  matchId: string,
): Promise<void> {
  const tokens = await getTokensForChampionship(championshipId);
  await sendPushNotification(
    tokens,
    '🔚 Partida encerrada',
    `${homeTeam} ${homeScore} x ${awayScore} ${awayTeam}`,
    { type: 'match_finished', championshipId, matchId, homeScore, awayScore },
  );
}
