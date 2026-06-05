import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { FontAwesome } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { AppButton } from '../../components/AppButton';
import { AppTextField } from '../../components/AppTextField';
import { useAuthStore } from '../../stores/authStore';
import { colors, shadows } from '../../theme/colors';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { AuthBackground } from './AuthBackground';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Welcome'>;
};

export function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const signIn = useAuthStore((s) => s.signIn);

  const handleLogin = async () => {
    let valid = true;
    if (!email.trim()) {
      setEmailError('Digite seu email');
      valid = false;
    }
    if (!password.trim()) {
      setPasswordError('Digite sua senha');
      valid = false;
    }
    if (!valid) return;

    setLoading(true);
    setAuthError('');
    try {
      await signIn(email.trim(), password);
      // AppNavigator switches automatically based on isOnboarded.
      // If user has no role yet, navigate to RoleSelection manually.
      const isOnboarded = useAuthStore.getState().isOnboarded;
      if (!isOnboarded) navigation.navigate('RoleSelection');
    } catch (e: any) {
      setAuthError(mapFirebaseError(e.code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthBackground>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <View style={styles.top}>
            <Animated.View entering={FadeInDown.duration(450)}>
              <View style={styles.logoCircle}>
                <FontAwesome name="trophy" size={48} color={colors.accent} />
              </View>
            </Animated.View>

            <Animated.View entering={FadeIn.delay(150).duration(450)} style={styles.brand}>
              <Text style={styles.title}>FJU</Text>
              <Text style={styles.subtitle}>CHAMPIONSHIP</Text>
            </Animated.View>
          </View>

          <Animated.View
            entering={FadeInUp.delay(300).duration(450)}
            style={styles.form}
          >
            <AppTextField
              label="Email"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setEmailError('');
              }}
              placeholder="seu@email.com"
              keyboardType="email-address"
              leftIcon="mail-outline"
              error={emailError}
            />
            <AppTextField
              label="Senha"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setPasswordError('');
              }}
              placeholder="Sua senha"
              secureTextEntry
              leftIcon="lock-closed-outline"
              error={passwordError}
            />
            <Pressable style={styles.forgotWrap}>
              <Text style={styles.forgot}>Esqueci minha senha</Text>
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeIn.delay(450).duration(450)} style={styles.footer}>
            {!!authError && <Text style={styles.authError}>{authError}</Text>}
            <AppButton title="ENTRAR" onPress={handleLogin} fullWidth loading={loading} />
            <View style={styles.separator}>
              <View style={styles.line} />
              <Text style={styles.or}>ou</Text>
              <View style={styles.line} />
            </View>
            <AppButton
              title="Criar conta"
              variant="outline"
              onPress={() => navigation.navigate('Register')}
              fullWidth
            />
          </Animated.View>

          <Text style={styles.version}>v1.0.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </AuthBackground>
  );
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 20,
  },
  top: {
    minHeight: '40%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg300,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    ...shadows.shadowGlow,
  },
  brand: {
    alignItems: 'center',
    marginTop: 16,
  },
  title: {
    fontFamily: 'Barlow-Black',
    fontSize: 42,
    letterSpacing: -1,
    color: colors.textPrimary,
  },
  subtitle: {
    marginTop: 2,
    fontFamily: 'Barlow-Medium',
    fontSize: 12,
    letterSpacing: 6,
    color: colors.accent,
  },
  form: {
    gap: 16,
  },
  forgotWrap: {
    alignSelf: 'flex-end',
    paddingVertical: 2,
  },
  forgot: {
    fontFamily: 'Barlow-Medium',
    fontSize: 13,
    color: colors.textSecondary,
  },
  footer: {
    marginTop: 28,
    gap: 16,
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  or: {
    fontFamily: 'Barlow-Medium',
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  version: {
    marginTop: 'auto',
    paddingTop: 24,
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
  },
  authError: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
  },
});

function mapFirebaseError(code: string): string {
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email ou senha incorretos';
    case 'auth/invalid-email':
      return 'Email inválido';
    case 'auth/too-many-requests':
      return 'Muitas tentativas. Tente novamente mais tarde';
    default:
      return 'Erro ao entrar. Tente novamente';
  }
}
