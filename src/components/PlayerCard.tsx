import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  assists?: number;
  matchesPlayed?: number;
  mvps?: number;
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

// Cores de acento por tier (ouro / prata / bronze) usadas em bordas, glow e brilho.
function getTierAccents(overall: number) {
  if (overall >= 85) {
    return { glow: '#FFD700', border: '#FFE9A8', shine: 'rgba(255,245,205,0.55)' };
  }
  if (overall >= 70) {
    return { glow: '#C0C0C0', border: '#EEF1F4', shine: 'rgba(255,255,255,0.6)' };
  }
  return { glow: '#CD7F32', border: '#F1CDA4', shine: 'rgba(255,236,214,0.5)' };
}

function StatCell({ value, label, accent }: { value: number; label: string; accent?: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, accent ? { color: accent } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function PlayerCard({
  player,
  team,
  position = 'Atleta',
  shirtNumber = 0,
  photoUrl = null,
  teamColor = '#F5A623',
  goals = 0,
  assists = 0,
  matchesPlayed = 0,
  mvps = 0,
  yellowCards = 0,
  redCards = 0,
  overall = 50,
  championshipName = 'Campeonato',
  topAchievements = [],
}: PlayerCardProps) {
  const gradient = getCardGradient(overall) as [string, string, string];
  const accents = getTierAccents(overall);
  const playerName = player?.name ?? 'Atleta';
  const playerPosition = player?.position ?? position;
  const posLabel = (POSITION_LABELS[playerPosition as keyof typeof POSITION_LABELS] ?? playerPosition).toUpperCase();
  const resolvedPhotoUrl = player?.photoUrl ?? photoUrl;
  const resolvedTeamColor = team?.primaryColor ?? teamColor;
  const teamLogoUrl = team?.logoUrl;
  const teamName = team?.name ?? 'Time';
  const resolvedShirt = shirtNumber || player?.number || 0;

  // Fundo rico: gradiente base do tier composto com camadas de brilho diagonal,
  // textura sutil e vinheta para dar profundidade premium.
  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.card, { borderColor: accents.border }]}
    >
      {/* Brilho diagonal superior */}
      <LinearGradient
        colors={[accents.shine, 'transparent', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Textura sutil em faixa diagonal */}
      <LinearGradient
        colors={['transparent', 'rgba(255,255,255,0.10)', 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        locations={[0.35, 0.5, 0.65]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Vinheta vertical (escurece topo e base) */}
      <LinearGradient
        colors={['rgba(0,0,0,0.18)', 'transparent', 'transparent', 'rgba(0,0,0,0.34)']}
        locations={[0, 0.22, 0.7, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Borda interna clara (efeito de borda dupla) */}
      <View style={styles.innerBorder} pointerEvents="none" />

      <View style={styles.content}>
        {/* Topo: overall + posição à esquerda, selo FJU à direita */}
        <View style={styles.topRow}>
          <View style={styles.overallBlock}>
            <Text style={styles.overall}>{overall}</Text>
            <Text style={styles.position}>{posLabel}</Text>
          </View>
          <View style={[styles.seal, { borderColor: accents.border }]}>
            <Ionicons name="trophy" size={16} color={accents.glow} />
            <Text style={styles.sealText}>FJU</Text>
          </View>
        </View>

        {/* Centro: foto ou avatar premium com glow e borda */}
        <View style={styles.photoArea}>
          <View style={[styles.photoGlow, { backgroundColor: accents.glow }]} />
          <View style={[styles.photoRing, { borderColor: accents.border, shadowColor: accents.glow }]}>
            {resolvedPhotoUrl ? (
              <Image source={{ uri: resolvedPhotoUrl }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.initialsContainer]}>
                <Text style={styles.initialsText}>{getInitials(playerName)}</Text>
              </View>
            )}
          </View>
          {resolvedShirt > 0 && (
            <View style={[styles.shirtBadge, { borderColor: accents.border }]}>
              <Text style={styles.shirtText}>#{resolvedShirt}</Text>
            </View>
          )}
        </View>

        {/* Nome do atleta em destaque */}
        <Text style={styles.name} numberOfLines={1}>{playerName}</Text>

        {/* Identidade do time: escudo/cor + nome */}
        <View style={styles.teamRow}>
          {teamLogoUrl ? (
            <Image source={{ uri: teamLogoUrl }} style={styles.teamLogo} />
          ) : (
            <View style={[styles.teamDot, { backgroundColor: resolvedTeamColor }]} />
          )}
          <Text style={styles.teamName} numberOfLines={1}>{teamName}</Text>
        </View>

        <View style={styles.divider} />

        {/* Estatísticas: grade 3 x 2 */}
        <View style={styles.statsGrid}>
          <StatCell value={goals} label="GOLS" />
          <StatCell value={assists} label="ASSIST" />
          <StatCell value={matchesPlayed} label="JOGOS" />
          <StatCell value={yellowCards} label="AMAREL" accent="#FFD23F" />
          <StatCell value={redCards} label="VERMEL" accent="#FF6B72" />
          <StatCell value={mvps} label="MVPS" accent={accents.glow} />
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

        <Text style={styles.champName} numberOfLines={1}>{championshipName}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 300,
    height: 480,
    borderRadius: 24,
    borderWidth: 2,
    overflow: 'hidden',
  },
  innerBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    margin: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    alignItems: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  overallBlock: {
    alignItems: 'flex-start',
  },
  overall: {
    fontSize: 60,
    fontFamily: 'Barlow-Black',
    color: '#FFFFFF',
    lineHeight: 60,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  position: {
    fontSize: 14,
    fontFamily: 'Barlow-ExtraBold',
    color: '#FFFFFF',
    letterSpacing: 1.5,
    marginTop: -4,
    marginLeft: 2,
  },
  seal: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.22)',
    gap: 1,
  },
  sealText: {
    fontSize: 10,
    fontFamily: 'Barlow-Black',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  photoArea: {
    marginTop: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoGlow: {
    position: 'absolute',
    width: 156,
    height: 156,
    borderRadius: 78,
    opacity: 0.28,
  },
  photoRing: {
    width: 138,
    height: 138,
    borderRadius: 69,
    borderWidth: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.12)',
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  initialsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    fontSize: 52,
    fontFamily: 'Barlow-Black',
    color: '#FFFFFF',
  },
  shirtBadge: {
    position: 'absolute',
    bottom: -6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  shirtText: {
    fontSize: 12,
    fontFamily: 'Barlow-Bold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 24,
    fontFamily: 'Barlow-Black',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 8,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    maxWidth: '90%',
  },
  teamLogo: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
  teamDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  teamName: {
    fontSize: 13,
    fontFamily: 'Barlow-SemiBold',
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.28)',
    alignSelf: 'stretch',
    marginTop: 14,
    marginBottom: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignSelf: 'stretch',
    marginTop: 6,
  },
  statCell: {
    width: '33.33%',
    alignItems: 'center',
    paddingVertical: 6,
  },
  statValue: {
    fontSize: 22,
    fontFamily: 'Barlow-Black',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.75)',
    fontFamily: 'Barlow-Bold',
    letterSpacing: 0.8,
    marginTop: -2,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
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
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    fontFamily: 'Barlow-SemiBold',
    letterSpacing: 0.5,
    marginTop: 'auto',
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  errorFallback: {
    width: 300,
    minHeight: 180,
    padding: 20,
    borderRadius: 24,
    backgroundColor: 'rgba(8,14,23,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  errorTitle: {
    color: '#8A9BB0',
    fontSize: 15,
    fontFamily: 'Barlow-Bold',
  },
  errorSubtitle: {
    color: '#4A5568',
    fontSize: 12,
    textAlign: 'center',
  },
});
