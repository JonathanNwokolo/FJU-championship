import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useAuthStore } from '../../stores/authStore';
import { colors } from '../../theme/colors';
import { UserRole } from '../../types';

const roles: Array<{ role: UserRole; icon: string; title: string; description: string }> = [
  {
    role: 'organizador',
    icon: '📋',
    title: 'Organizador',
    description: 'Crio e gerencio campeonatos da igreja',
  },
  {
    role: 'capitao',
    icon: '🛡️',
    title: 'Capitão',
    description: 'Monto e lidero minha equipe',
  },
  {
    role: 'atleta',
    icon: '⚽',
    title: 'Atleta',
    description: 'Participo dos jogos',
  },
];

export function RoleSelectionScreen() {
  const setRole = useAuthStore((s) => s.setRole);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Como você vai{'\n'}participar?</Text>
        <Text style={styles.subtitle}>Escolha seu perfil para começar</Text>

        <View style={styles.cards}>
          {roles.map((r) => (
            <TouchableOpacity
              key={r.role}
              style={styles.card}
              onPress={() => setRole(r.role)}
              activeOpacity={0.85}
            >
              <Text style={styles.cardIcon}>{r.icon}</Text>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{r.title}</Text>
                <Text style={styles.cardDescription}>{r.description}</Text>
              </View>
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 32,
    paddingBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 32,
  },
  cards: {
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 12,
    elevation: 2,
    gap: 16,
  },
  cardIcon: {
    fontSize: 32,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  arrow: {
    fontSize: 24,
    color: colors.accent,
    fontWeight: '600',
  },
});
