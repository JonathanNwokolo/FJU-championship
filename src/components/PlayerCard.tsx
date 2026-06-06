import React from 'react';
import { Dimensions, Image, Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  Pattern,
  Polygon,
  Rect,
  Stop,
} from 'react-native-svg';
import { Player, Team, AchievementDefinition } from '../types';
import { POSITION_LABELS } from '../utils/constants';
import { TeamColorDot } from './TeamColorDot';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.round(SCREEN_WIDTH * 0.72);
const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.4);
const AVATAR_SIZE = Math.round(CARD_WIDTH * 0.5);
const S = CARD_WIDTH / 260; // internal scale factor relative to original 260px design

export const CARD_DIMS = { width: CARD_WIDTH, height: CARD_HEIGHT };

const SHIELD_PATH =
  'M20 2 H240 Q258 2 258 20 V286 Q258 305 244 315 L151 354 Q130 366 109 354 L16 315 Q2 305 2 286 V20 Q2 2 20 2 Z';

type CardRarity = 'OURO' | 'PRATA' | 'BRONZE';

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
  matchesPlayed?: number;
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

interface RarityConfig {
  label: CardRarity;
  glow: string;
  border: string;
  gradient: [string, string, string, string];
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

function getRarityConfig(overall: number): RarityConfig {
  if (overall >= 80) {
    return {
      label: 'OURO',
      glow: '#FFD700',
      border: '#FFD700',
      gradient: ['#8B6914', '#FFD700', '#FFA500', '#8B6914'],
    };
  }

  if (overall >= 65) {
    return {
      label: 'PRATA',
      glow: '#C0C0C0',
      border: '#C0C0C0',
      gradient: ['#708090', '#E8E8E8', '#C0C0C0', '#708090'],
    };
  }

  return {
    label: 'BRONZE',
    glow: '#CD7F32',
    border: '#CD7F32',
    gradient: ['#6B3A2A', '#CD7F32', '#B8860B', '#6B3A2A'],
  };
}

function getInitial(name?: string): string {
  return name?.trim()?.[0]?.toUpperCase() ?? '?';
}

function SoccerBallIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16">
      <Circle cx={8} cy={8} r={7} fill="#FFFFFF" opacity={0.96} />
      <Polygon points="8,4.3 5.7,5.8 6.5,8.4 9.5,8.4 10.3,5.8" fill="#111111" />
      <Line x1={5.7} y1={5.8} x2={3.8} y2={7.1} stroke="#111111" strokeWidth={0.85} />
      <Line x1={10.3} y1={5.8} x2={12.2} y2={7.1} stroke="#111111" strokeWidth={0.85} />
      <Line x1={6.5} y1={8.4} x2={5.2} y2={11} stroke="#111111" strokeWidth={0.85} />
      <Line x1={9.5} y1={8.4} x2={10.8} y2={11} stroke="#111111" strokeWidth={0.85} />
      <Line x1={5.2} y1={11} x2={8} y2={12.4} stroke="#111111" strokeWidth={0.85} />
      <Line x1={10.8} y1={11} x2={8} y2={12.4} stroke="#111111" strokeWidth={0.85} />
    </Svg>
  );
}

function YellowCardIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16">
      <Rect x={3} y={2.5} width={10} height={11} rx={1.8} fill="#FFD43B" />
    </Svg>
  );
}

function RedCardIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16">
      <Rect x={3} y={2.5} width={10} height={11} rx={1.8} fill="#FF4D5A" />
    </Svg>
  );
}

function BoltIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16">
      <Path
        d="M8.8 1.8 3.9 8.4h3.2l-1 5.8 5-6.8H7.8l1-5.6Z"
        fill="#FFFFFF"
      />
    </Svg>
  );
}

function FjuShieldIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20">
      <Path
        d="M3 3.2h14v7.6c0 1.1-.5 2.1-1.4 2.8L10 18 4.4 13.6A3.5 3.5 0 0 1 3 10.8V3.2Z"
        fill="rgba(255,255,255,0.16)"
        stroke={color}
        strokeWidth={1.4}
      />
      <Path d="M6.4 7.2h7.2" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <Path d="M6.4 10h5.1" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

function ShieldArtwork({
  borderColor,
  glowColor,
  gradient,
}: {
  borderColor: string;
  glowColor: string;
  gradient: [string, string, string, string];
}) {
  return (
    <Svg width={CARD_WIDTH} height={CARD_HEIGHT} viewBox="0 0 260 360" style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgLinearGradient id="cardGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={gradient[0]} />
          <Stop offset="38%" stopColor={gradient[1]} />
          <Stop offset="68%" stopColor={gradient[2]} />
          <Stop offset="100%" stopColor={gradient[3]} />
        </SvgLinearGradient>
        <SvgLinearGradient id="shimmerGradient" x1="100%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="rgba(255,255,255,0)" />
          <Stop offset="52%" stopColor="rgba(255,255,255,0.25)" />
          <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </SvgLinearGradient>
        <SvgLinearGradient id="topGlow" x1="50%" y1="0%" x2="50%" y2="100%">
          <Stop offset="0%" stopColor="rgba(255,255,255,0.28)" />
          <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </SvgLinearGradient>
        <Pattern id="hexPattern" width="26" height="22" patternUnits="userSpaceOnUse">
          <Path
            d="M6.5 1 12.5 1 18.5 6 12.5 11 6.5 11 .5 6 6.5 1Z"
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity={0.2}
            strokeWidth={0.8}
          />
          <Path
            d="M19.5 12 25.5 12 31.5 17 25.5 22 19.5 22 13.5 17 19.5 12Z"
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity={0.2}
            strokeWidth={0.8}
          />
        </Pattern>
      </Defs>

      <Path d={SHIELD_PATH} fill="url(#cardGradient)" />
      <Path d={SHIELD_PATH} fill="#000000" opacity={0.14} />
      <Path d={SHIELD_PATH} fill="url(#hexPattern)" opacity={0.08} />
      <Path d={SHIELD_PATH} fill="url(#topGlow)" />
      <Path d={SHIELD_PATH} stroke={borderColor} strokeWidth={3} fill="none" />
      <Path d={SHIELD_PATH} stroke={glowColor} strokeOpacity={0.32} strokeWidth={6} fill="none" />
      <G opacity={0.85}>
        <Path d={SHIELD_PATH} fill="url(#shimmerGradient)" />
      </G>
    </Svg>
  );
}

function getCardShadow(glowColor: string): ViewStyle {
  if (Platform.OS === 'web') {
    return {
      boxShadow: `0 0 20px ${glowColor}, 0 12px 34px rgba(0,0,0,0.32)`,
    } as ViewStyle;
  }

  return {
    shadowColor: glowColor,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 15,
  };
}

function StatItem({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <View style={styles.statItem}>
      <View style={styles.statIconWrap}>{icon}</View>
      <Text style={styles.statValue}>{value}</Text>
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
  yellowCards = 0,
  redCards = 0,
  matchesPlayed = 0,
  overall = 50,
  championshipName = 'Campeonato',
}: PlayerCardProps) {
  const playerName = (player?.name ?? 'Atleta').toUpperCase();
  const playerPosition = player?.position ?? position;
  const posLabel = (POSITION_LABELS[playerPosition as keyof typeof POSITION_LABELS] ?? playerPosition).toUpperCase();
  const resolvedPhotoUrl = player?.photoUrl ?? photoUrl;
  const resolvedTeamColor = team?.primaryColor ?? teamColor;
  const teamName = team?.name ?? 'SEM TIME';
  const rarity = getRarityConfig(overall);

  return (
    <View style={[styles.cardShell, getCardShadow(rarity.glow)]}>
      <ShieldArtwork borderColor={rarity.border} glowColor={rarity.glow} gradient={rarity.gradient} />

      <View pointerEvents="none" style={styles.shimmerOverlay}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.shimmerGradient}
        />
      </View>

      <Text style={styles.overall}>{overall}</Text>
      <Text style={styles.position}>{posLabel}</Text>

      <View style={styles.logoWrap}>
        <FjuShieldIcon color="#FFFFFF" />
        <Text style={styles.logoText}>FJU</Text>
      </View>

      <View style={styles.avatarZone}>
        <View style={styles.avatarRing}>
          {resolvedPhotoUrl ? (
            <Image source={{ uri: resolvedPhotoUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>{getInitial(playerName)}</Text>
            </View>
          )}
        </View>
      </View>

      <Text style={styles.playerName} numberOfLines={1}>
        {playerName}
      </Text>

      <View style={styles.teamRow}>
        <TeamColorDot color={resolvedTeamColor} size={12} />
        <Text style={styles.teamName} numberOfLines={1}>
          {teamName}
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.statsRow}>
        <StatItem icon={<SoccerBallIcon />} value={goals} label="GOL" />
        <View style={styles.statDivider} />
        <StatItem icon={<YellowCardIcon />} value={yellowCards} label="AMA" />
        <View style={styles.statDivider} />
        <StatItem icon={<RedCardIcon />} value={redCards} label="VER" />
        <View style={styles.statDivider} />
        <StatItem icon={<BoltIcon />} value={matchesPlayed} label="JGS" />
      </View>

      <Text style={styles.footerText} numberOfLines={1}>
        FJU CHAMPIONSHIP
      </Text>

      <Text style={styles.hiddenMeta} numberOfLines={1}>
        {shirtNumber > 0 ? `#${shirtNumber} · ${rarity.label} · ${championshipName}` : `${rarity.label} · ${championshipName}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardShell: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  shimmerOverlay: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  shimmerGradient: {
    position: 'absolute',
    top: -50,
    left: Math.round(-70 * S),
    width: CARD_WIDTH + Math.round(140 * S),
    height: CARD_HEIGHT + Math.round(100 * S),
    transform: [{ rotate: '-24deg' }],
  },
  overall: {
    position: 'absolute',
    top: Math.round(18 * S),
    left: Math.round(18 * S),
    color: '#FFFFFF',
    fontFamily: 'Barlow-Black',
    fontSize: Math.round(58 * S),
    lineHeight: Math.round(58 * S),
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
  },
  position: {
    position: 'absolute',
    top: Math.round(78 * S),
    left: Math.round(22 * S),
    color: '#FFFFFF',
    fontFamily: 'Barlow-Bold',
    fontSize: Math.round(13 * S),
    letterSpacing: 1,
  },
  logoWrap: {
    position: 'absolute',
    top: Math.round(18 * S),
    right: Math.round(16 * S),
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logoText: {
    color: '#FFFFFF',
    fontFamily: 'Barlow-Bold',
    fontSize: Math.round(11 * S),
  },
  avatarZone: {
    marginTop: Math.round(108 * S),
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.6)',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 6,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontFamily: 'Barlow-Black',
    fontSize: Math.round(64 * S),
    lineHeight: Math.round(68 * S),
  },
  playerName: {
    marginTop: Math.round(8 * S),
    paddingHorizontal: Math.round(20 * S),
    color: '#FFFFFF',
    fontFamily: 'Barlow-Black',
    fontSize: Math.round(22 * S),
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 4,
  },
  teamRow: {
    marginTop: Math.round(4 * S),
    maxWidth: Math.round(180 * S),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  teamName: {
    flexShrink: 1,
    color: 'rgba(255,255,255,0.9)',
    fontFamily: 'Barlow-Medium',
    fontSize: Math.round(12 * S),
  },
  divider: {
    height: 1,
    alignSelf: 'stretch',
    marginHorizontal: Math.round(20 * S),
    marginTop: Math.round(10 * S),
    marginBottom: Math.round(6 * S),
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  statsRow: {
    width: '100%',
    paddingHorizontal: Math.round(12 * S),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statItem: {
    flex: 1,
    minHeight: Math.round(48 * S),
    alignItems: 'center',
    justifyContent: 'center',
  },
  statIconWrap: {
    height: 18,
    justifyContent: 'center',
    marginBottom: 2,
  },
  statValue: {
    color: '#FFFFFF',
    fontFamily: 'Barlow-Black',
    fontSize: Math.round(18 * S),
    lineHeight: Math.round(20 * S),
  },
  statLabel: {
    marginTop: 1,
    color: '#FFFFFF',
    fontFamily: 'Barlow-Bold',
    fontSize: Math.round(8 * S),
    letterSpacing: 1,
  },
  statDivider: {
    width: 1,
    height: Math.round(32 * S),
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  footerText: {
    marginTop: 'auto',
    marginBottom: Math.round(8 * S),
    alignSelf: 'center',
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'Barlow-SemiBold',
    fontSize: 7,
    letterSpacing: 4,
    textAlign: 'center',
  },
  hiddenMeta: {
    position: 'absolute',
    bottom: 2,
    opacity: 0,
    fontSize: 1,
  },
  errorFallback: {
    width: CARD_WIDTH,
    minHeight: 180,
    padding: 20,
    borderRadius: 20,
    backgroundColor: 'rgba(8,14,23,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    color: '#8A9BB0',
    fontFamily: 'Barlow-Bold',
    fontSize: 15,
  },
  errorSubtitle: {
    marginTop: 6,
    color: '#4A5568',
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    textAlign: 'center',
  },
});
