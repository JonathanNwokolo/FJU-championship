import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
// TODO: reativar push notifications no build de produção
// import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { useFirestoreSync } from '../hooks/useFirestoreSync';
import { AuthNavigator } from './AuthNavigator';
import { MainTabNavigator } from './MainTabNavigator';
// TODO: reativar push notifications no build de produção
// import { registerForPushNotifications } from '../services/notificationService';
import { colors } from '../theme/colors';
import { TAB_NAMES } from './constants';

// TODO: reativar push notifications no build de produção
// Garante que notificações aparecem mesmo com o app em foreground
// Notifications.setNotificationHandler({
//   handleNotification: async () => ({
//     shouldShowAlert: true,
//     shouldPlaySound: true,
//     shouldSetBadge: true,
//     shouldShowBanner: true,
//     shouldShowList: true,
//   }),
// });

export function AppNavigator() {
  const isOnboarded = useAuthStore((s) => s.isOnboarded);
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const initialize = useAuthStore((s) => s.initialize);
  const initTheme = useThemeStore((s) => s.initialize);

  useFirestoreSync();

  useEffect(() => {
    initTheme();
  }, []);

  useEffect(() => {
    const unsubscribe = initialize();
    return unsubscribe;
  }, []);

  const navigationRef = useRef<NavigationContainerRef<any>>(null);
  // TODO: reativar push notifications no build de produção
  // const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  // const responseListener = useRef<Notifications.EventSubscription | null>(null);

  // TODO: reativar push notifications no build de produção
  // Registra token quando o usuário conclui o onboarding
  // useEffect(() => {
  //   if (!isOnboarded || !user) return;
  //   registerForPushNotifications(user.id);
  // }, [isOnboarded, user?.id]);

  // TODO: reativar push notifications no build de produção
  // Listeners de notificação
  // useEffect(() => {
  //   notificationListener.current = Notifications.addNotificationReceivedListener(
  //     (notification) => {
  //       console.log('[notifications] Recebida em foreground:', notification.request.content.title);
  //     },
  //   );

  //   responseListener.current = Notifications.addNotificationResponseReceivedListener(
  //     (response) => {
  //       const data = response.notification.request.content.data as {
  //         type?: string;
  //         matchId?: string;
  //       };

  //       if (!data?.matchId || !navigationRef.current) return;

  //       if (data.type === 'match_finished') {
  //         navigationRef.current.navigate(TAB_NAMES.CONFRONTOS, {
  //           screen: 'MatchSummary',
  //           params: { matchId: data.matchId },
  //         });
  //       } else if (data.type === 'match_started' || data.type === 'goal') {
  //         navigationRef.current.navigate(TAB_NAMES.CONFRONTOS, {
  //           screen: 'LiveMatch',
  //           params: { matchId: data.matchId },
  //         });
  //       }
  //     },
  //   );

  //   return () => {
  //     notificationListener.current?.remove();
  //     responseListener.current?.remove();
  //   };
  // }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      {isOnboarded ? <MainTabNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
