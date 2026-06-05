import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeStackNavigator } from './HomeStackNavigator';
import { FixturesStackNavigator } from './FixturesStackNavigator';
import { MuralStackNavigator } from './MuralStackNavigator';
import { ProfileStackNavigator } from './ProfileStackNavigator';
import { CaptainStackNavigator } from './CaptainStackNavigator';
import { StandingsScreen } from '../screens/stats/StandingsScreen';
import { TopScorersScreen } from '../screens/stats/TopScorersScreen';
import { StatsOverviewScreen } from '../screens/stats/StatsOverviewScreen';
import { CustomTabBar } from '../components/CustomTabBar';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useAuthStore } from '../stores/authStore';
import { useTeamStore } from '../stores/teamStore';

const Tab = createBottomTabNavigator();

function withErrorBoundary(Component: React.ComponentType<any>) {
  return function WrappedWithErrorBoundary(props: any) {
    return (
      <ErrorBoundary>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

export function MainTabNavigator() {
  const user = useAuthStore((s) => s.user);
  const teams = useTeamStore((s) => s.teams);
  const isCaptain = user?.role === 'capitao' || teams.some((t) => t.captainId === user?.id);

  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Inicio" component={withErrorBoundary(HomeStackNavigator)} />
      <Tab.Screen name="Confrontos" component={withErrorBoundary(FixturesStackNavigator)} />
      <Tab.Screen name="Mural" component={withErrorBoundary(MuralStackNavigator)} />
      <Tab.Screen name="Classificacao" component={withErrorBoundary(StandingsScreen)} />
      <Tab.Screen name="Artilheiros" component={withErrorBoundary(TopScorersScreen)} />
      {isCaptain && (
        <Tab.Screen name="Time" component={withErrorBoundary(CaptainStackNavigator)} />
      )}
      <Tab.Screen name="Mais" component={withErrorBoundary(StatsOverviewScreen)} />
      <Tab.Screen name="Perfil" component={withErrorBoundary(ProfileStackNavigator)} />
    </Tab.Navigator>
  );
}
