import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Player, Team, AchievementDefinition } from '../types';
import { getCardGradient } from '../utils/playerOverall';
import { POSITION_LABELS } from '../utils/constants';

interface PlayerCardProps {
  player?: Partial<Player> | null;
  team?: Partial<Team> | null;
  position?: string;
  shirtNumber?: number;
  photoUrl?: string | null;
  teamColor?: string;
  goals?: number;
  yellowCards?: number;
  redCards?: number;
  overall?: number;
  championshipName?: string;
  topAchievements?: AchievementDefinition[];
}

interface BoundaryProps {
  children: React.ReactNode;
}

interface BoundaryState {
  hasError: boolean;
}

export class PlayerCardErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorFallback}>
          <Text style={styles.errorTitle}>Card nao disponivel</Text>
          <Text style={styles.errorSubtitle}>Jogue partidas para ativar seu card</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

export function PlayerCard({
  player,
  team,
  position = 'Atleta',
  shirtNumber = 0,
  photoUrl = null,
  teamColor = '#F5A623',
  goals = 0,
  yellowCards = 0,
  redCards = 0,
  overall = 50,
  championshipName = 'Campeonato',
  topAchievements = [],
}: PlayerCardProps) {
  const gradient = getCardGradient(overall) as [string, string, string];
  const playerName = player?.name ?? 'Atleta';
  const playerPosition = player?.position ?? position;
  const posLabel = (POSITION_LABELS[playerPosition as keyof typeof POSITION_LABELS] ?? playerPosition).toUpperCase();
  const resolvedPhotoUrl = player?.photoUrl ?? photoUrl;
  const resolvedTeamColor = team?.primaryColor ?? teamColor;

  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <Text style={styles.overall}>{overall}</Text>
      <Text style={styles.position}>{posLabel}</Text>

      <View style={styles.photoArea}>
        {resolvedPhotoUrl ? (
          <Image source={{ uri: resolvedPhotoUrl }} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.initialsContainer]}>
            <Text style={styles.initialsText}>{getInitials(playerName)}</Text>
          </View>
        )}
      </View>

      <Text style={styles.name} numberOfLines={1}>{playerName}</Text>

      <View style={[styles.teamShield, { backgroundColor: resolvedTeamColor }]} />

      <View style={styles.divider} />

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

      <Text style={styles.champName} numberOfLines={1}>
        {shirtNumber > 0 ? `#${shirtNumber} · ${championshipName}` : championshipName}
      </Text>
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
  name: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
  },
  teamShield: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginTop: 8,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignSelf: 'stretch',
    marginHorizontal: 20,
    marginVertical: 8,
  },
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
  champName: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  errorFallback: {
    width: 280,
    minHeight: 180,
    padding: 20,
    borderRadius: 20,
    backgroundColor: 'rgba(8,14,23,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  errorTitle: {
    color: '#8A9BB0',
    fontSize: 15,
    fontWeight: '700',
  },
  errorSubtitle: {
    color: '#4A5568',
    fontSize: 12,
    textAlign: 'center',
  },
});
