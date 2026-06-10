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
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { AppButton } from '../../components/AppButton';
import { AppTextField } from '../../components/AppTextField';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { useAuthStore } from '../../stores/authStore';
import { colors } from '../../theme/colors';
import { AuthBackground } from './AuthBackground';
import { validateSignUpForm } from '../../utils/authRules';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const signUp = useAuthStore((s) => s.signUp);

  const handleRegister = async () => {
    const { valid, errors } = validateSignUpForm({ name, email, password, confirmPassword });
    if (!valid) {
      if (errors.email === 'email_invalido') {
        setError('Email inválido');
      } else if (errors.password === 'senha_curta') {
        setError('A senha deve ter pelo menos 6 caracteres');
      } else if (errors.confirmPassword === 'senhas_diferentes') {
        setError('As senhas precisam ser iguais');
      } else {
        setError('Preencha todos os campos');
      }
      return;
    }

    setLoading(true);
    setError('');
    try {
      await signUp(email.trim(), password, name.trim());
      navigation.navigate('RoleSelection');
    } catch (e: any) {
      setError(mapFirebaseError(e.code));
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
          <View style={styles.header}>
            <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.accent} />
            </Pressable>
            <Text style={styles.headerTitle}>Criar conta</Text>
          </View>

          <Animated.View
            entering={FadeInUp.delay(150).duration(450)}
            style={styles.form}
          >
            <AppTextField
              label="Nome completo"
              value={name}
              onChangeText={(text) => {
                setName(text);
                setError('');
              }}
              placeholder="Seu nome"
              leftIcon="person-outline"
            />
            <AppTextField
              label="Email"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setError('');
              }}
              placeholder="seu@email.com"
              keyboardType="email-address"
              leftIcon="mail-outline"
            />
            <AppTextField
              label="Senha"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setError('');
              }}
              placeholder="Crie uma senha"
              secureTextEntry
              leftIcon="lock-closed-outline"
            />
            <AppTextField
              label="Confirmar senha"
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                setError('');
              }}
              placeholder="Repita sua senha"
              secureTextEntry
              leftIcon="shield-checkmark-outline"
              error={error}
            />
          </Animated.View>

          <Animated.View entering={FadeIn.delay(450).duration(450)} style={styles.footer}>
            <AppButton title="CRIAR CONTA" onPress={handleRegister} fullWidth loading={loading} />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AuthBackground>
  );
}

function mapFirebaseError(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Este email já está cadastrado';
    case 'auth/invalid-email':
      return 'Email inválido';
    case 'auth/weak-password':
      return 'A senha deve ter pelo menos 6 caracteres';
    default:
      return 'Erro ao criar conta. Tente novamente';
  }
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 36,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg300,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 24,
    color: colors.textPrimary,
    letterSpacing: -0.4,
  },
  form: {
    gap: 16,
  },
  footer: {
    marginTop: 28,
  },
});
