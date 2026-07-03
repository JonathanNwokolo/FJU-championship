import 'react-native-gesture-handler';
import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  useFonts,
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
  Barlow_700Bold,
  Barlow_800ExtraBold,
  Barlow_900Black,
} from '@expo-google-fonts/barlow';
import Toast, { BaseToast, ErrorToast, InfoToast, ToastConfig } from 'react-native-toast-message';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { colors } from './src/theme/colors';
import { APP_CONFIG } from './src/config/appConfig';

SplashScreen.preventAutoHideAsync();

const toastConfig: ToastConfig = {
  success: (props) => (
    <BaseToast
      {...props}
      style={[toastStyles.base, toastStyles.success]}
      contentContainerStyle={toastStyles.content}
      text1Style={toastStyles.text1}
      text2Style={toastStyles.text2}
    />
  ),
  error: (props) => (
    <ErrorToast
      {...props}
      style={[toastStyles.base, toastStyles.error]}
      contentContainerStyle={toastStyles.content}
      text1Style={toastStyles.text1}
      text2Style={toastStyles.text2}
    />
  ),
  info: (props) => (
    <InfoToast
      {...props}
      style={[toastStyles.base, toastStyles.info]}
      contentContainerStyle={toastStyles.content}
      text1Style={toastStyles.text1}
      text2Style={toastStyles.text2}
    />
  ),
};

const toastStyles = StyleSheet.create({
  base: {
    backgroundColor: colors.bg200,
    borderRadius: 14,
    borderLeftWidth: 4,
    height: 'auto' as unknown as number,
    minHeight: 56,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 10,
  },
  success: {
    borderLeftColor: colors.success,
  },
  error: {
    borderLeftColor: colors.danger,
  },
  info: {
    borderLeftColor: colors.accent,
  },
  content: {
    paddingHorizontal: 14,
  },
  text1: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  text2: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
});

function EnvironmentBadge() {
  if (APP_CONFIG.isProduction) {
    return null;
  }

  const label = APP_CONFIG.firebaseEmulator.enabled ? 'DEV EMULATOR' : APP_CONFIG.appEnv.toUpperCase();

  return (
    <View pointerEvents="none" style={envBadgeStyles.badge}>
      <Text style={envBadgeStyles.text}>{label}</Text>
    </View>
  );
}

const envBadgeStyles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: 48,
    right: 12,
    zIndex: 50,
    borderRadius: 6,
    backgroundColor: 'rgba(245, 166, 35, 0.88)',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  text: {
    color: '#080E17',
    fontFamily: 'Barlow-Bold',
    fontSize: 10,
    letterSpacing: 0,
  },
});

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    'Barlow-Regular': Barlow_400Regular,
    'Barlow-Medium': Barlow_500Medium,
    'Barlow-SemiBold': Barlow_600SemiBold,
    'Barlow-Bold': Barlow_700Bold,
    'Barlow-ExtraBold': Barlow_800ExtraBold,
    'Barlow-Black': Barlow_900Black,
  });

  React.useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, backgroundColor: '#080E17', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#F5A623" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <ErrorBoundary>
          <AppNavigator />
        </ErrorBoundary>
        <EnvironmentBadge />
        <Toast config={toastConfig} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
