import React from 'react';
import { TouchableOpacity } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AthleteProfileScreen } from '../screens/home/AthleteProfileScreen';
import { PlayerCardScreen } from '../screens/player/PlayerCardScreen';
import { PlayerAchievementsScreen } from '../screens/player/PlayerAchievementsScreen';
import { PlayerStatsDetailScreen } from '../screens/player/PlayerStatsDetailScreen';
import { HomeStackParamList } from './HomeStackNavigator';
import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function ProfileStackNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="AthleteProfile"
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
        name="AthleteProfile"
        component={AthleteProfileScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="PlayerCard" component={PlayerCardScreen} options={{ headerShown: false }} />
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
    </Stack.Navigator>
  );
}
