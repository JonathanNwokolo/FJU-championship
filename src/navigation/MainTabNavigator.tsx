import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeStackNavigator } from './HomeStackNavigator';
import { FixturesStackNavigator } from './FixturesStackNavigator';
import { ProfileStackNavigator } from './ProfileStackNavigator';
import { CaptainStackNavigator } from './CaptainStackNavigator';
import { OrganizerStackNavigator } from './OrganizerStackNavigator';
import { StandingsScreen } from '../screens/stats/StandingsScreen';
import { TopScorersScreen } from '../screens/stats/TopScorersScreen';
import { StatsOverviewScreen } from '../screens/stats/StatsOverviewScreen';
import { CustomTabBar } from '../components/CustomTabBar';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useAuthStore } from '../stores/authStore';
import { useTeamStore } from '../stores/teamStore';
import { TAB_NAMES } from './constants';

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
  const isOrganizer = user?.role === 'organizador';
  // Organizador nunca exibe a aba TIME (mesmo que apareça como capitão de algum time).
  const isCaptain =
    !isOrganizer && (user?.role === 'capitao' || teams.some((t) => t.captainId === user?.id));

  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name={TAB_NAMES.INICIO} component={withErrorBoundary(HomeStackNavigator)} />
      {isOrganizer && (
        <Tab.Screen name={TAB_NAMES.CAMPEONATOS} component={withErrorBoundary(OrganizerStackNavigator)} />
      )}
      <Tab.Screen name={TAB_NAMES.CONFRONTOS} component={withErrorBoundary(FixturesStackNavigator)} />
      <Tab.Screen name={TAB_NAMES.CLASSIFICACAO} component={withErrorBoundary(StandingsScreen)} />
      <Tab.Screen name={TAB_NAMES.ARTILHEIROS} component={withErrorBoundary(TopScorersScreen)} />
      {isCaptain && (
        <Tab.Screen name={TAB_NAMES.TIME} component={withErrorBoundary(CaptainStackNavigator)} />
      )}
      <Tab.Screen name={TAB_NAMES.MAIS} component={withErrorBoundary(StatsOverviewScreen)} />
      <Tab.Screen name={TAB_NAMES.PERFIL} component={withErrorBoundary(ProfileStackNavigator)} />
    </Tab.Navigator>
  );
}
