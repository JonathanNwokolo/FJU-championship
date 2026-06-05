import React from 'react';
import { TouchableOpacity } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { FixturesScreen } from '../screens/match/FixturesScreen';
import { MatchRegistrationScreen } from '../screens/match/MatchRegistrationScreen';
import { MatchSummaryScreen } from '../screens/match/MatchSummaryScreen';
import { LiveMatchScreen } from '../screens/match/LiveMatchScreen';
import { VotingScreen } from '../screens/match/VotingScreen';
import { RoundAwardScreen } from '../screens/match/RoundAwardScreen';
import { PreMatchScreen } from '../screens/match/PreMatchScreen';
import { colors } from '../theme/colors';

export type FixturesStackParamList = {
  FixturesMain: undefined;
  PreMatch: { matchId: string };
  MatchRegistration: { matchId: string };
  MatchSummary: { matchId: string };
  LiveMatch: { matchId: string };
  Voting: { championshipId: string; round: number };
  RoundAward: { championshipId: string; round: number };
};

const Stack = createNativeStackNavigator<FixturesStackParamList>();

export function FixturesStackNavigator() {
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
        name="FixturesMain"
        component={FixturesScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PreMatch"
        component={PreMatchScreen}
        options={{ headerShown: false, animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="MatchRegistration"
        component={MatchRegistrationScreen}
        options={{ headerShown: false, animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="MatchSummary"
        component={MatchSummaryScreen}
        options={{ headerShown: false, animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="LiveMatch"
        component={LiveMatchScreen}
        options={{ headerShown: false, animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Voting"
        component={VotingScreen}
        options={{ headerShown: false, animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="RoundAward"
        component={RoundAwardScreen}
        options={{ headerShown: false, animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}
