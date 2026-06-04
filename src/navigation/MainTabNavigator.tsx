import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeStackNavigator } from './HomeStackNavigator';
import { FixturesStackNavigator } from './FixturesStackNavigator';
import { MuralStackNavigator } from './MuralStackNavigator';
import { StandingsScreen } from '../screens/stats/StandingsScreen';
import { TopScorersScreen } from '../screens/stats/TopScorersScreen';
import { StatsOverviewScreen } from '../screens/stats/StatsOverviewScreen';
import { CustomTabBar } from '../components/CustomTabBar';
import { ErrorBoundary } from '../components/ErrorBoundary';

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
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Início" component={withErrorBoundary(HomeStackNavigator)} />
      <Tab.Screen name="Confrontos" component={withErrorBoundary(FixturesStackNavigator)} />
      <Tab.Screen name="Mural" component={withErrorBoundary(MuralStackNavigator)} />
      <Tab.Screen name="Classificação" component={withErrorBoundary(StandingsScreen)} />
      <Tab.Screen name="Artilheiros" component={withErrorBoundary(TopScorersScreen)} />
      <Tab.Screen name="Mais" component={withErrorBoundary(StatsOverviewScreen)} />
    </Tab.Navigator>
  );
}
