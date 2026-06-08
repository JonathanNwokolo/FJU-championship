import React, { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { useFirestoreSync } from '../hooks/useFirestoreSync';
import { AuthNavigator } from './AuthNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import { registerForPushNotifications } from '../services/notificationService';
import { colors } from '../theme/colors';
import { TAB_NAMES } from './constants';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

type NotificationData = {
  type?: string;
  matchId?: string;
  championshipId?: string;
  teamId?: string;
};

function normalizeType(type?: string) {
  return (type ?? '').toLowerCase();
}

export function AppNavigator() {
  const isOnboarded = useAuthStore((s) => s.isOnboarded);
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const initialize = useAuthStore((s) => s.initialize);
  const initTheme = useThemeStore((s) => s.initialize);

  const navigationRef = useRef<NavigationContainerRef<any>>(null);
  const pendingNotificationRef = useRef<NotificationData | null>(null);

  useFirestoreSync();

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  useEffect(() => {
    const unsubscribe = initialize();
    return unsubscribe;
  }, [initialize]);

  useEffect(() => {
    if (!isOnboarded || !user?.id) return;
    registerForPushNotifications(user.id);
  }, [isOnboarded, user?.id]);

  const navigateFromNotification = useCallback((data: NotificationData | null | undefined) => {
    if (!data || !user || !isOnboarded || !navigationRef.current?.isReady()) {
      pendingNotificationRef.current = data ?? null;
      return;
    }

    const type = normalizeType(data.type);
    const nav = navigationRef.current;

    if (
      data.matchId &&
      ['goal', 'match_started', 'live_match', 'livematch', 'live', 'partida_ao_vivo'].includes(type)
    ) {
      nav.navigate(TAB_NAMES.CONFRONTOS, {
        screen: 'LiveMatch',
        params: { matchId: data.matchId },
      });
      return;
    }

    if (data.matchId && type === 'match_finished') {
      nav.navigate(TAB_NAMES.CONFRONTOS, {
        screen: 'MatchSummary',
        params: { matchId: data.matchId },
      });
      return;
    }

    if (data.matchId && ['match', 'partida', 'match_scheduled'].includes(type)) {
      nav.navigate(TAB_NAMES.CONFRONTOS, {
        screen: 'PreMatch',
        params: { matchId: data.matchId },
      });
      return;
    }

    if (data.championshipId && ['announcement', 'announcements', 'anuncio'].includes(type)) {
      nav.navigate(TAB_NAMES.INICIO, {
        screen: 'Announcements',
        params: { championshipId: data.championshipId },
      });
      return;
    }

    if (['team_approved', 'team_rejected', 'teamapproval', 'aprovacao'].includes(type)) {
      nav.navigate(TAB_NAMES.TIME);
      return;
    }

    if (data.championshipId && ['championship', 'campeonato'].includes(type)) {
      nav.navigate(TAB_NAMES.INICIO, {
        screen: 'ChampionshipDashboard',
        params: { championshipId: data.championshipId },
      });
    }
  }, [isOnboarded, user]);

  const flushPendingNotification = useCallback(() => {
    if (!pendingNotificationRef.current || !user || !isOnboarded || !navigationRef.current?.isReady()) {
      return;
    }

    const data = pendingNotificationRef.current;
    pendingNotificationRef.current = null;
    navigateFromNotification(data);
  }, [isOnboarded, navigateFromNotification, user]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      const notificationListener = Notifications.addNotificationReceivedListener((notification) => {
        console.log('[notifications] Received in foreground:', notification.request.content.title);
      });

      const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
        navigateFromNotification(response.notification.request.content.data as NotificationData);
      });

      const lastResponse = Notifications.getLastNotificationResponse();
      if (lastResponse?.notification) {
        pendingNotificationRef.current = lastResponse.notification.request.content.data as NotificationData;
      }

      return () => {
        notificationListener.remove();
        responseListener.remove();
      };
    }
  }, [navigateFromNotification]);

  useEffect(() => {
    flushPendingNotification();
  }, [flushPendingNotification]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} onReady={flushPendingNotification}>
      {isOnboarded ? <MainTabNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
