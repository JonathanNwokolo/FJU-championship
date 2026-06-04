import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { HomeStackNavigator } from './HomeStackNavigator';
import { FixturesStackNavigator } from './FixturesStackNavigator';
import { MuralStackNavigator } from './MuralStackNavigator';
import { StandingsScreen } from '../screens/stats/StandingsScreen';
import { TopScorersScreen } from '../screens/stats/TopScorersScreen';
import { StatsOverviewScreen } from '../screens/stats/StatsOverviewScreen';
import { colors } from '../theme/colors';
import { useMuralBadge } from '../hooks/useMuralBadge';

const CHAMP_ID = 'champ-001';

type TabIconName = React.ComponentProps<typeof Ionicons>['name'];

const Tab = createBottomTabNavigator();

function tabIcon(active: TabIconName, inactive: TabIconName) {
  return ({ color, focused }: { color: string; focused: boolean }) => (
    <Ionicons name={focused ? active : inactive} size={24} color={color} />
  );
}

export function MainTabNavigator() {
  const muralHasNew = useMuralBadge(CHAMP_ID);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: '#9E9E9E',
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopWidth: 1,
          borderTopColor: '#F0F0F0',
          height: 65,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
        },
      }}
    >
      <Tab.Screen
        name="Início"
        component={HomeStackNavigator}
        options={{
          tabBarIcon: tabIcon('home', 'home-outline'),
        }}
      />
      <Tab.Screen
        name="Confrontos"
        component={FixturesStackNavigator}
        options={{
          tabBarIcon: tabIcon('calendar', 'calendar-outline'),
        }}
      />
      <Tab.Screen
        name="Mural"
        component={MuralStackNavigator}
        options={{
          tabBarIcon: tabIcon('camera', 'camera-outline'),
          tabBarBadge: muralHasNew ? '' : undefined,
        }}
      />
      <Tab.Screen
        name="Classificação"
        component={StandingsScreen}
        options={{
          tabBarIcon: tabIcon('trophy', 'trophy-outline'),
        }}
      />
      <Tab.Screen
        name="Artilheiros"
        component={TopScorersScreen}
        options={{
          tabBarIcon: tabIcon('football', 'football-outline'),
        }}
      />
      <Tab.Screen
        name="Mais"
        component={StatsOverviewScreen}
        options={{
          tabBarIcon: tabIcon('bar-chart', 'bar-chart-outline'),
        }}
      />
    </Tab.Navigator>
  );
}
