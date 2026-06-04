import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { TeamStanding } from '../types';
import { colors, shadows } from '../theme/colors';

interface Props {
  standing?: TeamStanding;
  place: 1 | 2 | 3;
}

const podiumConfig = {
  1: {
    height: 110,
    icon: '🏆',
    borderColor: colors.accent,
    nameSize: 18,
    gradient: [colors.accentGlow, 'rgba(245,166,35,0.04)'] as const,
  },
  2: {
    height: 90,
    icon: '🥈',
    borderColor: colors.borderStrong,
    nameSize: 15,
    gradient: [colors.bg300, colors.bg300] as const,
  },
  3: {
    height: 80,
    icon: '🥉',
    borderColor: colors.border,
    nameSize: 15,
    gradient: [colors.bg300, colors.bg300] as const,
  },
};

export function PodiumCard({ standing, place }: Props) {
  const config = podiumConfig[place];

  return (
    <LinearGradient
      colors={config.gradient}
      style={[
        styles.card,
        {
          height: config.height,
          borderColor: config.borderColor,
        },
        place === 1 && styles.firstCard,
      ]}
    >
      <Text style={styles.icon}>{config.icon}</Text>
      <Text style={[styles.name, { fontSize: config.nameSize }]} numberOfLines={1}>
        {standing?.teamName ?? '--'}
      </Text>
      <View style={styles.pointsRow}>
        <Text style={styles.points}>{standing?.points ?? 0}</Text>
        <Text style={styles.pts}>pts</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  firstCard: {
    ...shadows.shadowGlow,
  },
  icon: {
    fontSize: 22,
    marginBottom: 4,
  },
  name: {
    width: '100%',
    fontFamily: 'Barlow-Bold',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  pointsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    marginTop: 2,
  },
  points: {
    fontFamily: 'Barlow-Black',
    fontSize: 28,
    color: colors.accent,
    lineHeight: 32,
  },
  pts: {
    marginBottom: 4,
    fontFamily: 'Barlow-SemiBold',
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
});
