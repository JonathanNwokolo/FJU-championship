import React from 'react';
import { TouchableOpacity } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { HomeScreen } from '../screens/home/HomeScreen';
import { CreateChampionshipScreen } from '../screens/championship/CreateChampionshipScreen';
import { ChampionshipDashboardScreen } from '../screens/championship/ChampionshipDashboardScreen';
import { AvailableChampionshipsScreen } from '../screens/team/AvailableChampionshipsScreen';
import { CreateTeamScreen } from '../screens/team/CreateTeamScreen';
import { ManageRosterScreen } from '../screens/team/ManageRosterScreen';
import { JoinTeamScreen } from '../screens/team/JoinTeamScreen';
import { InviteShareScreen } from '../screens/team/InviteShareScreen';
import { DrawFullscreenScreen } from '../screens/match/DrawFullscreenScreen';
import { PlayerCardScreen } from '../screens/player/PlayerCardScreen';
import { PlayerAchievementsScreen } from '../screens/player/PlayerAchievementsScreen';
import { RoundAwardScreen } from '../screens/match/RoundAwardScreen';
import { MatchRegistrationScreen } from '../screens/match/MatchRegistrationScreen';
import { AthleteProfileScreen } from '../screens/home/AthleteProfileScreen';
import { EditProfileScreen } from '../screens/home/EditProfileScreen';
import { ChampionshipHistoryScreen } from '../screens/championship/ChampionshipHistoryScreen';
import { ChampionshipResultScreen } from '../screens/championship/ChampionshipResultScreen';
import { NotificationCenterScreen } from '../screens/home/NotificationCenterScreen';
import { GlobalSearchScreen } from '../screens/home/GlobalSearchScreen';
import { PlayerStatsDetailScreen } from '../screens/player/PlayerStatsDetailScreen';
import { CareerCardScreen } from '../screens/player/CareerCardScreen';
import { AnnouncementsScreen } from '../screens/championship/AnnouncementsScreen';
import { AllTimeRankingsScreen } from '../screens/player/AllTimeRankingsScreen';
import { SeasonScreen } from '../screens/championship/SeasonScreen';
import { colors } from '../theme/colors';

export type HomeStackParamList = {
  HomeMain: undefined;
  CreateChampionship: undefined;
  ChampionshipDashboard: { championshipId: string };
  AvailableChampionships: undefined;
  CreateTeam: { championshipId: string };
  ManageRoster: { teamId: string };
  InviteShare: { teamId: string };
  JoinTeam: { championshipId?: string } | undefined;
  DrawFullscreen: { championshipId: string };
  PlayerCard: { playerId: string; championshipId: string };
  PlayerAchievements: { playerId: string; championshipId: string };
  PlayerStatsDetail: { playerId: string; championshipId: string };
  RoundAward: { championshipId: string; round: number };
  MatchRegistration: { matchId: string };
  AthleteProfile: { userId?: string; championshipId?: string } | undefined;
  CareerCard: { userId: string };
  EditProfile: undefined;
  ChampionshipHistory: undefined;
  ChampionshipResult: { championshipId: string; readOnly?: boolean };
  NotificationCenter: undefined;
  GlobalSearch: undefined;
  Announcements: { championshipId: string };
  AllTimeRankings: undefined;
  Season: { championshipId: string };
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={({ navigation }) => ({
        animation: 'slide_from_right',
        headerStyle: { backgroundColor: colors.bg200 },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontFamily: 'Barlow-SemiBold', fontSize: 18 },
        headerShadowVisible: false,
        headerBackTitle: '',
        headerLeft: ({ canGoBack }) =>
          canGoBack ? (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ paddingRight: 8 }}
            >
              <Ionicons name="chevron-back" size={26} color={colors.accent} />
            </TouchableOpacity>
          ) : null,
      })}
    >
      <Stack.Screen name="HomeMain" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="CreateChampionship"
        component={CreateChampionshipScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ChampionshipDashboard"
        component={ChampionshipDashboardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AvailableChampionships"
        component={AvailableChampionshipsScreen}
        options={{ title: 'Campeonatos Abertos' }}
      />
      <Stack.Screen
        name="CreateTeam"
        component={CreateTeamScreen}
        options={{ title: 'Criar Time' }}
      />
      <Stack.Screen
        name="ManageRoster"
        component={ManageRosterScreen}
        options={{ title: 'Meu Time' }}
      />
      <Stack.Screen
        name="InviteShare"
        component={InviteShareScreen}
        options={{ title: 'Convidar para o time' }}
      />
      <Stack.Screen
        name="JoinTeam"
        component={JoinTeamScreen}
        options={{ title: 'Entrar no Time' }}
      />
      <Stack.Screen
        name="DrawFullscreen"
        component={DrawFullscreenScreen}
        options={{ headerShown: false, animation: 'fade' }}
      />
      <Stack.Screen name="PlayerCard" component={PlayerCardScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="PlayerAchievements"
        component={PlayerAchievementsScreen}
        options={{ title: 'Conquistas' }}
      />
      <Stack.Screen
        name="RoundAward"
        component={RoundAwardScreen}
        options={{ headerShown: false, animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="MatchRegistration"
        component={MatchRegistrationScreen}
        options={{ headerShown: false, animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="AthleteProfile"
        component={AthleteProfileScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CareerCard"
        component={CareerCardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ChampionshipHistory"
        component={ChampionshipHistoryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ChampionshipResult"
        component={ChampionshipResultScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="NotificationCenter"
        component={NotificationCenterScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="GlobalSearch"
        component={GlobalSearchScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PlayerStatsDetail"
        component={PlayerStatsDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Announcements"
        component={AnnouncementsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AllTimeRankings"
        component={AllTimeRankingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Season"
        component={SeasonScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
