import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FixturesScreen } from '../screens/match/FixturesScreen';
import { MatchRegistrationScreen } from '../screens/match/MatchRegistrationScreen';
import { MatchSummaryScreen } from '../screens/match/MatchSummaryScreen';
import { LiveMatchScreen } from '../screens/match/LiveMatchScreen';
import { VotingScreen } from '../screens/match/VotingScreen';
import { RoundAwardScreen } from '../screens/match/RoundAwardScreen';

export type FixturesStackParamList = {
  FixturesMain: undefined;
  MatchRegistration: { matchId: string };
  MatchSummary: { matchId: string };
  LiveMatch: { matchId: string };
  Voting: { championshipId: string; round: number };
  RoundAward: { championshipId: string; round: number };
};

const Stack = createNativeStackNavigator<FixturesStackParamList>();

export function FixturesStackNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="FixturesMain"
        component={FixturesScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="MatchRegistration"
        component={MatchRegistrationScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="MatchSummary"
        component={MatchSummaryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="LiveMatch"
        component={LiveMatchScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Voting"
        component={VotingScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="RoundAward"
        component={RoundAwardScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
