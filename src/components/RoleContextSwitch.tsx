import React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useContextStore } from '../stores/contextStore';
import { colors } from '../theme/colors';

/**
 * UI da dualidade Atleta/Capitão (BLOCO 4).
 * - Só deve ser renderizado quando user.role === 'atleta'.
 * - Se o atleta também é capitão (teams.some(t => t.captainId === user.id)),
 *   mostra os badges "Atleta" + "Capitão de [time]" e o toggle Modo Atleta/Capitão.
 * - Caso contrário, mostra o CTA "Criar Meu Time".
 * O toggle é apenas visual: grava activeContext no contextStore, sem tocar em user.role.
 */
interface Props {
  isCaptain: boolean;
  captainTeamName?: string;
  onCreateTeam: () => void;
}

export function RoleContextSwitch({ isCaptain, captainTeamName, onCreateTeam }: Props) {
  const activeContext = useContextStore((s) => s.activeContext);
  const setActiveContext = useContextStore((s) => s.setActiveContext);

  if (!isCaptain) {
    return (
      <View style={styles.ctaCard}>
        <View style={styles.ctaIconWrap}>
          <MaterialCommunityIcons name="shield-plus-outline" size={26} color={colors.accent} />
        </View>
        <View style={styles.ctaCopy}>
          <Text style={styles.ctaTitle}>Criar Meu Time</Text>
          <Text style={styles.ctaText}>Você pode ser capitão sem deixar de ser atleta.</Text>
        </View>
        <TouchableOpacity style={styles.ctaBtn} onPress={onCreateTeam} activeOpacity={0.85}>
          <Ionicons name="add" size={18} color={colors.textOnAccent} />
          <Text style={styles.ctaBtnText}>Criar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const athleteActive = activeContext === 'athlete';
  const captainActive = activeContext === 'captain';

  return (
    <View style={styles.card}>
      <View style={styles.badgesRow}>
        <View style={styles.badgeAthlete}>
          <Ionicons name="football-outline" size={13} color={colors.neon} />
          <Text style={styles.badgeAthleteText}>Atleta</Text>
        </View>
        <View style={styles.badgeCaptain}>
          <MaterialCommunityIcons name="shield-account" size={13} color={colors.accent} />
          <Text style={styles.badgeCaptainText} numberOfLines={1}>
            Capitão de {captainTeamName ?? 'meu time'}
          </Text>
        </View>
      </View>

      <View style={styles.toggle}>
        <Pressable
          onPress={() => setActiveContext('athlete')}
          style={[styles.toggleBtn, athleteActive && styles.toggleBtnActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: athleteActive }}
        >
          <Text style={[styles.toggleText, athleteActive && styles.toggleTextActive]}>
            Modo Atleta
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveContext('captain')}
          style={[styles.toggleBtn, captainActive && styles.toggleBtnActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: captainActive }}
        >
          <Text style={[styles.toggleText, captainActive && styles.toggleTextActive]}>
            Modo Capitão
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg200,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badgeAthlete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,212,255,0.12)',
  },
  badgeAthleteText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    color: colors.neon,
  },
  badgeCaptain: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.accentGlow,
  },
  badgeCaptainText: {
    flexShrink: 1,
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    color: colors.accent,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.bg300,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  toggleBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 9,
  },
  toggleBtnActive: {
    backgroundColor: colors.accent,
  },
  toggleText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  toggleTextActive: {
    color: colors.textOnAccent,
  },

  // CTA (atleta ainda não é capitão)
  ctaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bg200,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  ctaIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentGlow,
  },
  ctaCopy: {
    flex: 1,
  },
  ctaTitle: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  ctaText: {
    marginTop: 2,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  ctaBtnText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 13,
    color: colors.textOnAccent,
  },
});
