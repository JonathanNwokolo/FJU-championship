import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { RoleSelectionScreen } from '../screens/onboarding/RoleSelectionScreen';
import { colors } from '../theme/colors';

export type AuthStackParamList = {
  Welcome: undefined;
  Register: undefined;
  RoleSelection: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Welcome" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen
        name="RoleSelection"
        component={RoleSelectionScreen}
        options={{
          headerShown: false,
          headerTitle: '',
          headerBackTitle: 'Voltar',
          headerTintColor: colors.accent,
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
        }}
      />
    </Stack.Navigator>
  );
}
