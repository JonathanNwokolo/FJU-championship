import React, { useEffect, useRef } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../stores/authStore';
import { useChampionshipStore } from '../stores/championshipStore';
import { AuthNavigator } from './AuthNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import {
  registerForPushNotifications,
  saveTokenToFirestore,
} from '../services/notificationService';

// Garante que notificações aparecem mesmo com o app em foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function AppNavigator() {
  const isOnboarded = useAuthStore((s) => s.isOnboarded);
  const user = useAuthStore((s) => s.user);
  const championships = useChampionshipStore((s) => s.championships);

  const navigationRef = useRef<NavigationContainerRef<any>>(null);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  // Registra token quando o usuário conclui o onboarding
  useEffect(() => {
    if (!isOnboarded || !user) return;

    (async () => {
      const token = await registerForPushNotifications();
      if (!token) return;

      const activeChampionship = championships.find((c) => c.status === 'em_andamento');
      if (activeChampionship) {
        await saveTokenToFirestore(user.id, token, activeChampionship.id);
      }
    })();
  }, [isOnboarded, user?.id]);

  // Listeners de notificação
  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('[notifications] Recebida em foreground:', notification.request.content.title);
      },
    );

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as {
          type?: string;
          matchId?: string;
        };

        if (!data?.matchId || !navigationRef.current) return;

        if (data.type === 'match_finished') {
          navigationRef.current.navigate('Jogos', {
            screen: 'MatchSummary',
            params: { matchId: data.matchId },
          });
        } else if (data.type === 'match_started' || data.type === 'goal') {
          navigationRef.current.navigate('Jogos', {
            screen: 'LiveMatch',
            params: { matchId: data.matchId },
          });
        }
      },
    );

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      {isOnboarded ? <MainTabNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
