import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from '../screens/home/HomeScreen';
import { CreateChampionshipScreen } from '../screens/championship/CreateChampionshipScreen';
import { ChampionshipDashboardScreen } from '../screens/championship/ChampionshipDashboardScreen';
import { AvailableChampionshipsScreen } from '../screens/team/AvailableChampionshipsScreen';
import { CreateTeamScreen } from '../screens/team/CreateTeamScreen';
import { ManageRosterScreen } from '../screens/team/ManageRosterScreen';
import { JoinTeamScreen } from '../screens/team/JoinTeamScreen';
import { DrawScreen } from '../screens/match/DrawScreen';
import { DrawFullscreenScreen } from '../screens/match/DrawFullscreenScreen';
import { PlayerCardScreen } from '../screens/player/PlayerCardScreen';
import { PlayerAchievementsScreen } from '../screens/player/PlayerAchievementsScreen';
import { RoundAwardScreen } from '../screens/match/RoundAwardScreen';
import { colors } from '../theme/colors';

export type HomeStackParamList = {
  HomeMain: undefined;
  CreateChampionship: undefined;
  ChampionshipDashboard: { championshipId: string };
  AvailableChampionships: undefined;
  CreateTeam: { championshipId: string };
  ManageRoster: { teamId: string };
  JoinTeam: undefined;
  DrawScreen: { championshipId: string };
  DrawFullscreen: { championshipId: string };
  PlayerCard: { playerId: string; championshipId: string };
  PlayerAchievements: { playerId: string; championshipId: string };
  RoundAward: { championshipId: string; round: number };
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

const headerOptions = {
  headerTintColor: colors.accent,
  headerStyle: { backgroundColor: colors.background },
  headerShadowVisible: false,
  headerBackTitle: 'Voltar',
};

export function HomeStackNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="HomeMain" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CreateChampionship" component={CreateChampionshipScreen}
        options={{ ...headerOptions, title: 'Novo Campeonato' }} />
      <Stack.Screen name="ChampionshipDashboard" component={ChampionshipDashboardScreen}
        options={{ headerShown: false }} />
      <Stack.Screen name="AvailableChampionships" component={AvailableChampionshipsScreen}
        options={{ ...headerOptions, title: 'Campeonatos Abertos' }} />
      <Stack.Screen name="CreateTeam" component={CreateTeamScreen}
        options={{ ...headerOptions, title: 'Criar Time' }} />
      <Stack.Screen name="ManageRoster" component={ManageRosterScreen}
        options={{ ...headerOptions, title: 'Meu Time' }} />
      <Stack.Screen name="JoinTeam" component={JoinTeamScreen}
        options={{ ...headerOptions, title: 'Entrar no Time' }} />
      <Stack.Screen name="DrawScreen" component={DrawScreen}
        options={{ headerShown: false }} />
      <Stack.Screen name="DrawFullscreen" component={DrawFullscreenScreen}
        options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="PlayerCard" component={PlayerCardScreen}
        options={{ headerShown: false }} />
      <Stack.Screen name="PlayerAchievements" component={PlayerAchievementsScreen}
        options={{ ...headerOptions, title: 'Conquistas' }} />
      <Stack.Screen name="RoundAward" component={RoundAwardScreen}
        options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
