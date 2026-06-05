import React from 'react';
import { TouchableOpacity } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { CaptainDashboardScreen } from '../screens/team/CaptainDashboardScreen';
import { ManageRosterScreen } from '../screens/team/ManageRosterScreen';
import { PlayerCardScreen } from '../screens/player/PlayerCardScreen';
import { AthleteProfileScreen } from '../screens/home/AthleteProfileScreen';
import { colors } from '../theme/colors';

export type CaptainStackParamList = {
  CaptainDashboard: undefined;
  ManageRoster: { teamId: string };
  PlayerCard: { playerId: string; championshipId: string };
  AthleteProfile: { userId?: string; championshipId?: string } | undefined;
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
        name="PlayerCard"
        component={PlayerCardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AthleteProfile"
        component={AthleteProfileScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
