import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Player, Team, AchievementDefinition } from '../types';
import { getCardGradient } from '../utils/playerOverall';
import { POSITION_LABELS } from '../utils/constants';

interface PlayerCardProps {
  player: Player;
  team: Team;
  goals: number;
  yellowCards: number;
  redCards: number;
  overall: number;
  championshipName: string;
  topAchievements?: AchievementDefinition[];
}

function getInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

export function PlayerCard({
  player,
  team,
  goals,
  yellowCards,
  redCards,
  overall,
  championshipName,
  topAchievements = [],
}: PlayerCardProps) {
  const gradient = getCardGradient(overall) as [string, string, string];
  const posLabel = (POSITION_LABELS[player.position] ?? player.position).toUpperCase();

  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      {/* Overall — absolute top-left */}
      <Text style={styles.overall}>{overall}</Text>

      {/* Position — absolute below overall */}
      <Text style={styles.position}>{posLabel}</Text>

      {/* Photo / Initials */}
      <View style={styles.photoArea}>
        {player.photoUrl ? (
          <Image source={{ uri: player.photoUrl }} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.initialsContainer]}>
            <Text style={styles.initialsText}>{getInitials(player.name)}</Text>
          </View>
        )}
      </View>

      {/* Name */}
      <Text style={styles.name} numberOfLines={1}>{player.name}</Text>

      {/* Team shield */}
      <View style={[styles.teamShield, { backgroundColor: team.primaryColor }]} />

      {/* Divider */}
      <View style={styles.divider} />

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statEmoji}>⚽</Text>
          <Text style={styles.statValue}>{goals}</Text>
          <Text style={styles.statLabel}>GOL</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statEmoji}>🟨</Text>
          <Text style={styles.statValue}>{yellowCards}</Text>
          <Text style={styles.statLabel}>AMA</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statEmoji}>🟥</Text>
          <Text style={styles.statValue}>{redCards}</Text>
          <Text style={styles.statLabel}>VER</Text>
        </View>
      </View>

      {/* Achievement badges — top 3 rarest */}
      {topAchievements.length > 0 && (
        <View style={styles.badgesRow}>
          {topAchievements.slice(0, 3).map((a) => (
            <View
              key={a.id}
              style={[styles.badgeCircle, { backgroundColor: `${a.rarityColor}33`, borderColor: a.rarityColor }]}
            >
              <Text style={styles.badgeEmoji}>{a.icon}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Championship name */}
      <Text style={styles.champName} numberOfLines={1}>{championshipName}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 280,
    height: 420,
    borderRadius: 20,
    alignItems: 'center',
    overflow: 'hidden',
  },

  // Absolute positioned top-left elements
  overall: {
    position: 'absolute',
    top: 20,
    left: 20,
    fontSize: 56,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 56,
  },
  position: {
    position: 'absolute',
    top: 78,
    left: 24,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 1,
  },

  // Photo area
  photoArea: {
    marginTop: 30,
  },
  photo: {
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  initialsContainer: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Name
  name: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
  },

  // Team shield
  teamShield: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginTop: 8,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignSelf: 'stretch',
    marginHorizontal: 20,
    marginVertical: 8,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignSelf: 'stretch',
    paddingHorizontal: 8,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statEmoji: {
    fontSize: 16,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // Achievement badges
  badgesRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  badgeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeEmoji: {
    fontSize: 16,
  },

  // Championship name
  champName: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
});
