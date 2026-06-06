import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OrganizerHomeScreen } from '../screens/organizer/OrganizerHomeScreen';
import { ChampionshipManageScreen } from '../screens/organizer/ChampionshipManageScreen';
import { colors } from '../theme/colors';

export type OrganizerStackParamList = {
  OrganizerHome: undefined;
  ChampionshipManage: { championshipId: string };
};

const Stack = createNativeStackNavigator<OrganizerStackParamList>();

/**
 * Stack da aba CAMPEONATOS (somente organizador).
 * Telas próprias do organizador: lista de campeonatos (OrganizerHome) e o
 * dashboard de gestão (ChampionshipManage). Rotas de criação de campeonato e
 * gestão de partida ao vivo continuam vivendo nas suas stacks originais
 * (Início / Confrontos) e são acessadas via o tab navigator pai.
 */
export function OrganizerStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg200 },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontFamily: 'Barlow-SemiBold', fontSize: 18 },
        headerShadowVisible: false,
        headerShown: false,
      }}
    >
      <Stack.Screen name="OrganizerHome" component={OrganizerHomeScreen} />
      <Stack.Screen name="ChampionshipManage" component={ChampionshipManageScreen} />
    </Stack.Navigator>
  );
}
