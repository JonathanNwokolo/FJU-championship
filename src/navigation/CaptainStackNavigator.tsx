import React from 'react';
import { TouchableOpacity } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { CaptainDashboardScreen } from '../screens/team/CaptainDashboardScreen';
import { ManageRosterScreen } from '../screens/team/ManageRosterScreen';
import { InviteShareScreen } from '../screens/team/InviteShareScreen';
import { PlayerCardScreen } from '../screens/player/PlayerCardScreen';
import { PlayerAchievementsScreen } from '../screens/player/PlayerAchievementsScreen';
import { PlayerStatsDetailScreen } from '../screens/player/PlayerStatsDetailScreen';
import { AthleteProfileScreen } from '../screens/home/AthleteProfileScreen';
import { EditProfileScreen } from '../screens/home/EditProfileScreen';
import { CareerCardScreen } from '../screens/player/CareerCardScreen';
import { AnnouncementsScreen } from '../screens/championship/AnnouncementsScreen';
import { PendingCenterScreen } from '../screens/home/PendingCenterScreen';
import { colors } from '../theme/colors';

export type CaptainStackParamList = {
  CaptainDashboard: undefined;
  PendingCenter: undefined;
  ManageRoster: { teamId: string };
  InviteShare: { teamId: string };
  PlayerCard: { playerId: string; championshipId: string };
  PlayerAchievements: { playerId: string; championshipId: string };
  PlayerStatsDetail: { playerId: string; championshipId: string };
  AthleteProfile: { userId?: string; championshipId?: string } | undefined;
  EditProfile: undefined;
  CareerCard: { userId: string };
  Announcements: { championshipId: string };
};

const Stack = createNativeStackNavigator<CaptainStackParamList>();

export function CaptainStackNavigator() {
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
      <Stack.Screen
        name="CaptainDashboard"
        component={CaptainDashboardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ManageRoster"
        component={ManageRosterScreen}
        options={{ title: 'Elenco' }}
      />
      <Stack.Screen
        name="InviteShare"
        component={InviteShareScreen}
        options={{ title: 'Convidar para o time' }}
      />
      <Stack.Screen
        name="PlayerCard"
        component={PlayerCardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PlayerAchievements"
        component={PlayerAchievementsScreen}
        options={{ title: 'Conquistas' }}
      />
      <Stack.Screen
        name="PlayerStatsDetail"
        component={PlayerStatsDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AthleteProfile"
        component={AthleteProfileScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CareerCard"
        component={CareerCardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Announcements"
        component={AnnouncementsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PendingCenter"
        component={PendingCenterScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
