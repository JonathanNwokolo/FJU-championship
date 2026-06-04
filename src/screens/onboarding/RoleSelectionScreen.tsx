import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import Animated, { SlideInRight } from 'react-native-reanimated';
import { useAuthStore } from '../../stores/authStore';
import { colors } from '../../theme/colors';
import { UserRole } from '../../types';
import { AuthBackground } from '../auth/AuthBackground';

const roles: Array<{
  role: UserRole;
  icon: keyof typeof FontAwesome5.glyphMap;
  color: string;
  title: string;
  description: string;
}> = [
  {
    role: 'organizador',
    icon: 'clipboard-list',
    color: colors.accent,
    title: 'Organizador',
    description: 'Crio e gerencio campeonatos da igreja',
  },
  {
    role: 'capitao',
    icon: 'shield-alt',
    color: '#4FC3F7',
    title: 'Capitão',
    description: 'Monto e lidero minha equipe',
  },
  {
    role: 'atleta',
    icon: 'running',
    color: colors.success,
    title: 'Atleta',
    description: 'Participo dos jogos',
  },
];

export function RoleSelectionScreen() {
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const setRole = useAuthStore((s) => s.setRole);

  const handleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setRole(role);
  };

  return (
    <AuthBackground>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Como você vai participar?</Text>
          <Text style={styles.subtitle}>Escolha seu perfil no campeonato</Text>
        </View>

        <View style={styles.cards}>
          {roles.map((item, index) => {
            const selected = selectedRole === item.role;
            return (
              <Animated.View
                key={item.role}
                entering={SlideInRight.delay(index * 100).duration(420)}
              >
                <Pressable
                  onPress={() => handleSelect(item.role)}
                  style={[
                    styles.card,
                    selected && styles.cardSelected,
                  ]}
                >
                  <View style={[styles.iconWrap, { backgroundColor: `${item.color}18` }]}>
                    <FontAwesome5 name={item.icon} size={40} color={item.color} />
                  </View>
                  <View style={styles.cardCopy}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardDescription}>{item.description}</Text>
                  </View>
                  {selected && (
                    <View style={styles.check}>
                      <Ionicons name="checkmark" size={16} color={colors.textOnAccent} />
                    </View>
                  )}
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>
    </AuthBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 70,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 34,
  },
  title: {
    fontFamily: 'Barlow-Black',
    fontSize: 34,
    lineHeight: 38,
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.8,
  },
  subtitle: {
    marginTop: 10,
    fontFamily: 'Barlow-Regular',
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  cards: {
    gap: 14,
  },
  card: {
    minHeight: 120,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderRadius: 18,
    backgroundColor: colors.bg200,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardSelected: {
    backgroundColor: colors.accentGlow,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCopy: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 18,
    color: colors.textPrimary,
  },
  cardDescription: {
    marginTop: 5,
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  check: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
});
