import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MuralScreen } from '../screens/mural/MuralScreen';
import { PhotoDetailScreen } from '../screens/mural/PhotoDetailScreen';
import { MuralPost } from '../types';

export type MuralStackParamList = {
  MuralMain: undefined;
  PhotoDetail: { post: MuralPost };
};

const Stack = createNativeStackNavigator<MuralStackParamList>();

export function MuralStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ animation: 'slide_from_right' }}>
      <Stack.Screen
        name="MuralMain"
        component={MuralScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PhotoDetail"
        component={PhotoDetailScreen}
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
        }}
      />
    </Stack.Navigator>
  );
}
