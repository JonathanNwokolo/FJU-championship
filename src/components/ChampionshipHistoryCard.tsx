import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { TeamColorDot } from './TeamColorDot';
import { colors } from '../theme/colors';
import { Championship } from '../types';
import { ChampionshipResult } from '../hooks/useChampionshipHistory';

interface Props {
  championship: Championship;
  result?: ChampionshipResult;
  onPress: () => void;
}

function getSeasonYear(createdAt?: string): string {
  if (!createdAt) return new Date().getFullYear().toString();
  try {
    return new Date(createdAt).getFullYear().toString();
  } catch {
    return new Date().getFullYear().toString();
  }
}

export function ChampionshipHistoryCard({ championship, result, onPress }: Props) {
  const season = getSeasonYear(championship.createdAt);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
    >
      <Text style={styles.season}>{season}</Text>
      <Text style={styles.name} numberOfLines={2}>
        {championship.name}
      </Text>
      
      {result ? (
        <View style={styles.championRow}>
          <TeamColorDot color={result.championTeamColor} size={8} />
          <Text style={styles.championText} numberOfLines={1}>
            Campeão: {result.championTeamName}
          </Text>
        </View>
      ) : (
        <Text style={styles.finishedText}>🏁 Finalizado</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 160,
    height: 110,
    backgroundColor: colors.bg200,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    justifyContent: 'space-between',
  },
  cardPressed: {
    opacity: 0.8,
  },
  season: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 11,
    color: colors.accent,
    letterSpacing: 0.5,
  },
  name: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 14,
    color: colors.textOnDark,
    lineHeight: 18,
    flex: 1,
    marginTop: 4,
  },
  championRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  championText: {
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    color: colors.success,
    flex: 1,
  },
  finishedText: {
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
});
