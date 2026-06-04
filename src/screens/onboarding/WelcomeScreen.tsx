import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppButton } from '../../components/AppButton';
import { AppTextField } from '../../components/AppTextField';
import { useAuthStore } from '../../stores/authStore';
import { colors } from '../../theme/colors';
import { AuthStackParamList } from '../../navigation/AuthNavigator';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Welcome'>;
};

export function WelcomeScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const setUser = useAuthStore((s) => s.setUser);

  const handleContinue = () => {
    if (!name.trim()) {
      setError('Digite seu nome para continuar');
      return;
    }
    setUser(name.trim());
    navigation.navigate('RoleSelection');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroSection}>
          <Text style={styles.trophy}>🏆</Text>
          <Text style={styles.fjuLabel}>FJU</Text>
          <Text style={styles.title}>CHAMPIONSHIP</Text>
          <Text style={styles.subtitle}>Tribo de Judá</Text>
        </View>

        <View style={styles.formSection}>
          <AppTextField
            label="Seu nome"
            value={name}
            onChangeText={(t) => { setName(t); setError(''); }}
            placeholder="Como você quer ser chamado?"
            error={error}
            dark
          />
          <AppButton
            title="Continuar"
            onPress={handleContinue}
            fullWidth
            style={styles.button}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primaryDark,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 48,
  },
  trophy: {
    fontSize: 64,
    marginBottom: 16,
  },
  fjuLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.textOnDark,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    fontStyle: 'italic',
  },
  formSection: {
    gap: 16,
  },
  button: {
    marginTop: 8,
  },
});
