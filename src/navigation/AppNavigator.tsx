import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, View } from 'react-native';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { isRunningInExpoGo } from 'expo';
import type * as NotificationsType from 'expo-notifications';
import { useAuthStore } from '../stores/authStore';
import { useChampionshipStore } from '../stores/championshipStore';
import { useMatchStore } from '../stores/matchStore';
import { useTeamStore } from '../stores/teamStore';
import { useThemeStore } from '../stores/themeStore';
import { useFirestoreSync } from '../hooks/useFirestoreSync';
import { AuthNavigator } from './AuthNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import { registerForPushNotifications } from '../services/notificationService';
import { registerNotificationActionListeners } from '../services/notificationActionListeners';
import {
  getNotificationActionOrchestrator,
  NotificationActionFlushOptions,
} from '../services/notificationActionOrchestrator';
import { NotificationActionDestination, NotificationActionRawPayload } from '../types/notificationActions';
import { colors } from '../theme/colors';
import { TAB_NAMES } from './constants';

// Conditional require prevents DevicePushTokenAutoRegistration.fx from running
// its module-level addPushTokenListener call in Expo Go (throws on Android SDK 53+).
const isExpoGo = isRunningInExpoGo();
const Notifications = isExpoGo
  ? (null as unknown as typeof NotificationsType)
  : (require('expo-notifications') as typeof NotificationsType);

if (Platform.OS !== 'web' && !isExpoGo) {
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

export function AppNavigator() {
  const isOnboarded = useAuthStore((s) => s.isOnboarded);
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const initialize = useAuthStore((s) => s.initialize);
  const initTheme = useThemeStore((s) => s.initialize);
  const championships = useChampionshipStore((s) => s.championships);
  const championshipsLoading = useChampionshipStore((s) => s.loading);
  const selectedChampionshipId = useChampionshipStore((s) => s.selectedChampionshipId);
  const setSelectedChampionshipId = useChampionshipStore((s) => s.setSelectedChampionshipId);
  const teams = useTeamStore((s) => s.teams);
  const players = useTeamStore((s) => s.players);
  const teamsLoading = useTeamStore((s) => s.loading);
  const matches = useMatchStore((s) => s.matches);
  const matchesLoading = useMatchStore((s) => s.loading);

  const navigationRef = useRef<NavigationContainerRef<any>>(null);
  const [navigationReady, setNavigationReady] = useState(false);

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

  const runtimeState = useMemo(() => ({
    user,
    isOnboarded,
    authLoading: isLoading,
    navigationReady,
    championships,
    teams,
    players,
    matches,
    selectedChampionshipId,
    championshipsLoading,
    teamsLoading,
    matchesLoading,
  }), [
    championships,
    championshipsLoading,
    isLoading,
    isOnboarded,
    matches,
    matchesLoading,
    navigationReady,
    players,
    selectedChampionshipId,
    teams,
    teamsLoading,
    user,
  ]);

  const navigateFromAction = useCallback((destination: NotificationActionDestination) => {
    const nav = navigationRef.current;
    if (!nav?.isReady()) return;

    if (destination.stack === 'fixtures') {
      nav.navigate(TAB_NAMES.CONFRONTOS, {
        screen: destination.screen,
        params: destination.params,
      });
      return;
    }
    if (destination.stack === 'captain') {
      nav.navigate(TAB_NAMES.TIME, {
        screen: destination.screen,
        params: destination.params,
      });
      return;
    }
    nav.navigate(TAB_NAMES.INICIO, {
      screen: destination.screen,
      params: destination.params,
    });
  }, []);

  const actionOptions = useMemo<NotificationActionFlushOptions>(() => ({
    navigate: navigateFromAction,
    selectChampionship: setSelectedChampionshipId,
  }), [navigateFromAction, setSelectedChampionshipId]);

  const runtimeRef = useRef(runtimeState);
  const optionsRef = useRef(actionOptions);

  useEffect(() => {
    runtimeRef.current = runtimeState;
    optionsRef.current = actionOptions;
  }, [actionOptions, runtimeState]);

  useEffect(() => {
    getNotificationActionOrchestrator().flush(runtimeState, actionOptions);
  }, [actionOptions, runtimeState]);

  useEffect(() => {
    return registerNotificationActionListeners({
      notifications: Platform.OS === 'web' || isExpoGo ? null : Notifications,
      linking: Linking,
      onNotificationAction: (payload: NotificationActionRawPayload) => {
        getNotificationActionOrchestrator().handleRaw(
          payload,
          'notification',
          runtimeRef.current,
          optionsRef.current,
        );
      },
      onDeepLinkAction: (url: string) => {
        getNotificationActionOrchestrator().handleRaw(
          url,
          'deep_link',
          runtimeRef.current,
          optionsRef.current,
        );
      },
      onForegroundNotification: (notification) => {
        console.log('[notifications] Received in foreground:', notification.request?.content?.title);
      },
    });
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} onReady={() => setNavigationReady(true)}>
      {isOnboarded ? <MainTabNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
