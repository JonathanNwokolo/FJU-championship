import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { captureRef } from 'react-native-view-shot';
import { DeviceMotion } from 'expo-sensors';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { HomeStackParamList } from '../../navigation/HomeStackNavigator';
import { useCareerStats } from '../../hooks/useCareerStats';
import { useAthleteProfile } from '../../hooks/useAthleteProfile';
import { AppButton } from '../../components/AppButton';
import { colors } from '../../theme/colors';
import { POSITION_LABELS } from '../../utils/constants';

type Props = NativeStackScreenProps<HomeStackParamList, 'CareerCard'>;

const RAD_TO_DEG = 180 / Math.PI;

function getInitials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

type Tier = 'rookie' | 'veterano' | 'lenda' | 'icone';

function getTier(titles: number): Tier {
  if (titles >= 5) return 'icone';
  if (titles >= 3) return 'lenda';
  if (titles >= 1) return 'veterano';
  return 'rookie';
}

const TIER_CONFIG: Record<
  Tier,
  { gradient: [string, string]; label: string; labelColor: string; borderColor: string; glow: boolean }
> = {
  rookie: {
    gradient: ['#1A2535', '#0F1923'],
    label: 'ROOKIE',
    labelColor: '#CD7F32',
    borderColor: '#CD7F32',
    glow: false,
  },
  veterano: {
    gradient: ['#1a3a2a', '#00C853'],
    label: 'VETERANO',
    labelColor: '#00C853',
    borderColor: '#00C853',
    glow: false,
  },
  lenda: {
    gradient: ['#1a2a3a', '#F5A623'],
    label: 'LENDA',
    labelColor: '#F5A623',
    borderColor: '#F5A623',
    glow: false,
  },
  icone: {
    gradient: ['#2a1a0a', '#FFD700'],
    label: 'ÍCONE FJU',
    labelColor: '#FFD700',
    borderColor: '#FFD700',
    glow: true,
  },
};

// ── Inner card component (captured for sharing) ─────────────────────────────

interface CardProps {
  name: string;
  photoUrl?: string;
  teamName: string;
  positionLabel: string;
  avgOverall: number;
  titles: number;
  goals: number;
  assists: number;
  matches: number;
  mvps: number;
  seasons: number;
  firstYear: string;
  tier: Tier;
}

function StatRow({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <View style={cardStyles.statRow}>
      <Text style={cardStyles.statIcon}>{icon}</Text>
      <Text style={cardStyles.statValue}>{value}</Text>
      <Text style={cardStyles.statLabel}>{label}</Text>
    </View>
  );
}

function CareerCardView({
  name,
  photoUrl,
  teamName,
  positionLabel,
  avgOverall,
  titles,
  goals,
  assists,
  matches,
  mvps,
  seasons,
  firstYear,
  tier,
}: CardProps) {
  const cfg = TIER_CONFIG[tier];
  const currentYear = new Date().getFullYear();

  return (
    <LinearGradient
      colors={cfg.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={cardStyles.card}
    >
      {/* Absolute overlays: overall, position, FJU, rarity */}
      <Text style={cardStyles.overall}>{avgOverall}</Text>
      <Text style={cardStyles.position}>{positionLabel}</Text>
      <Text style={cardStyles.fjuLabel}>FJU</Text>

      <View style={cardStyles.rarityBadge}>
        <Text
          style={[
            cardStyles.rarityText,
            { color: cfg.labelColor },
            cfg.glow && cardStyles.rarityGlow,
          ]}
        >
          {cfg.label}
        </Text>
      </View>

      {/* Flow content — starts below the absolute number overlay */}
      <View style={cardStyles.flowContent}>
        {/* Photo */}
        <View style={[cardStyles.photoRing, { borderColor: cfg.borderColor }]}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={cardStyles.photo} />
          ) : (
            <View style={[cardStyles.photoFallback, { backgroundColor: cfg.borderColor + '22' }]}>
              <Text style={[cardStyles.photoInitials, { color: cfg.labelColor }]}>
                {getInitials(name)}
              </Text>
            </View>
          )}
        </View>

        {/* Name + team */}
        <Text style={cardStyles.playerName} numberOfLines={1}>{name}</Text>
        <Text style={[cardStyles.teamCaption, { color: cfg.labelColor }]} numberOfLines={1}>
          {teamName}
        </Text>

        {/* Divider */}
        <View style={cardStyles.divider} />

        {/* Stats grid: 2 columns × 3 rows */}
        <View style={cardStyles.statsGrid}>
          <View style={cardStyles.statsCol}>
            <StatRow icon="⚽" value={goals} label="GOL" />
            <StatRow icon="🅰️" value={assists} label="ASS" />
            <StatRow icon="🏟️" value={matches} label="JGS" />
          </View>
          <View style={cardStyles.statsColDivider} />
          <View style={cardStyles.statsCol}>
            <StatRow icon="🏆" value={titles} label="TIT" />
            <StatRow icon="🌟" value={mvps} label="MVP" />
            <StatRow icon="📅" value={seasons} label="TMP" />
          </View>
        </View>

      </View>

      {/* Footer — pinned to bottom so it never overlaps the stats */}
      <View style={cardStyles.footer}>
        <Text style={cardStyles.footerTitle}>FJU CHAMPIONSHIP</Text>
        <Text style={cardStyles.footerYear}>
          {firstYear || String(currentYear)} — {currentYear}
        </Text>
      </View>
    </LinearGradient>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    width: 300,
    height: 480,
    borderRadius: 24,
    overflow: 'hidden',
  },
  // Absolute overlays
  overall: {
    position: 'absolute',
    top: 20,
    left: 20,
    fontFamily: 'Barlow-Black',
    fontSize: 64,
    color: '#FFFFFF',
    lineHeight: 68,
  },
  position: {
    position: 'absolute',
    top: 85,
    left: 24,
    fontFamily: 'Barlow-Medium',
    fontSize: 14,
    color: '#FFFFFF',
  },
  fjuLabel: {
    position: 'absolute',
    top: 108,
    left: 24,
    fontFamily: 'Barlow-Black',
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 3,
  },
  rarityBadge: {
    position: 'absolute',
    top: 20,
    right: 16,
  },
  rarityText: {
    fontFamily: 'Barlow-Black',
    fontSize: 10,
    letterSpacing: 1.5,
    textAlign: 'right',
  },
  rarityGlow: {
    textShadowColor: '#FFD700',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  // Flow content
  flowContent: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 128,
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  photoRing: {
    width: 166,
    height: 166,
    borderRadius: 83,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photo: {
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  photoFallback: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInitials: {
    fontFamily: 'Barlow-Black',
    fontSize: 52,
  },
  playerName: {
    marginTop: 10,
    fontFamily: 'Barlow-Black',
    fontSize: 22,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  teamCaption: {
    marginTop: 2,
    fontFamily: 'Barlow-Medium',
    fontSize: 11,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 0,
    marginTop: 10,
    marginBottom: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    alignItems: 'flex-start',
    gap: 8,
    flex: 1,
  },
  statsCol: {
    flex: 1,
    gap: 6,
  },
  statsColDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'stretch',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statIcon: {
    fontSize: 14,
    width: 20,
    textAlign: 'center',
  },
  statValue: {
    fontFamily: 'Barlow-Black',
    fontSize: 22,
    color: '#FFFFFF',
    minWidth: 32,
  },
  statLabel: {
    fontFamily: 'Barlow-Regular',
    fontSize: 9,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.5,
  },
  footer: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 2,
  },
  footerTitle: {
    fontFamily: 'Barlow-Black',
    fontSize: 8,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 4,
    textAlign: 'center',
  },
  footerYear: {
    fontFamily: 'Barlow-Regular',
    fontSize: 9,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
});

// ── Screen ───────────────────────────────────────────────────────────────────

export function CareerCardScreen({ route, navigation }: Props) {
  const { userId } = route.params;

  const { careerStats } = useCareerStats(userId);
  const { user, player, team, overall, history } = useAthleteProfile(userId, undefined);

  const profileName = user?.name ?? player?.name ?? careerStats?.name ?? 'Atleta';
  const profilePhoto = player?.photoUrl ?? user?.photoUrl;
  const teamName = team?.name ?? careerStats?.lastTeamName ?? 'Sem time';
  const positionLabel =
    player?.position ? (POSITION_LABELS[player.position] ?? player.position) : '—';

  const titles = careerStats?.totalTitles ?? 0;
  const tier = getTier(titles);

  const avgOverall = useMemo(() => {
    const all = [...history.map((h) => h.overall)];
    if (overall > 0) all.push(overall);
    if (!all.length) return careerStats?.bestOverall ?? 75;
    return Math.round(all.reduce((a, b) => a + b, 0) / all.length);
  }, [history, overall, careerStats?.bestOverall]);

  // ── 3D device motion ───────────────────────────────────────────────────────
  const rotateX = useSharedValue(0);
  const rotateY = useSharedValue(0);

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    (async () => {
      try {
        if (typeof DeviceMotion.requestPermissionsAsync === 'function') {
          const { status } = await DeviceMotion.requestPermissionsAsync();
          if (status !== 'granted') return;
        }
        DeviceMotion.setUpdateInterval(50);
        sub = DeviceMotion.addListener(({ rotation }) => {
          if (!rotation) return;
          const tx = Math.max(-15, Math.min(15, ((rotation.beta ?? 0) * RAD_TO_DEG) / 4));
          const ty = Math.max(-15, Math.min(15, ((rotation.gamma ?? 0) * RAD_TO_DEG) / 4));
          rotateX.value = withSpring(tx, { damping: 15 });
          rotateY.value = withSpring(ty, { damping: 15 });
        });
      } catch {
        // DeviceMotion not available (simulator, etc.)
      }
    })();
    return () => sub?.remove();
  }, []);

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateX: `${rotateX.value}deg` },
      { rotateY: `${rotateY.value}deg` },
    ],
  }));

  const animatedGlareStyle = useAnimatedStyle(() => ({
    opacity: Math.abs(rotateY.value) / 15,
  }));

  // ── Share ──────────────────────────────────────────────────────────────────
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    if (!cardRef.current) return;
    setSharing(true);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1.0 });
      const dest = `${FileSystem.cacheDirectory}career-card-${userId}.png`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      await Sharing.shareAsync(dest, {
        mimeType: 'image/png',
        dialogTitle: 'Compartilhar card de carreira',
      });
    } catch (e) {
      console.warn('Career card share failed', e);
    } finally {
      setSharing(false);
    }
  };

  return (
    <LinearGradient colors={[colors.bg100, colors.bg200]} style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.accent} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Card de Carreira</Text>
          <View style={styles.backBtn} />
        </View>

        {/* 3D card */}
        <View style={styles.center}>
          <Animated.View style={animatedCardStyle}>
            {/* Flat capture target */}
            <View ref={cardRef} collapsable={false}>
              <CareerCardView
                name={profileName}
                photoUrl={profilePhoto}
                teamName={teamName}
                positionLabel={positionLabel}
                avgOverall={avgOverall}
                titles={titles}
                goals={careerStats?.totalGoals ?? 0}
                assists={careerStats?.totalAssists ?? 0}
                matches={careerStats?.totalMatches ?? 0}
                mvps={careerStats?.totalMvps ?? 0}
                seasons={careerStats?.totalChampionships ?? 0}
                firstYear={careerStats?.firstSeasonYear ?? ''}
                tier={tier}
              />
            </View>

            {/* Animated glare overlay — not captured */}
            <Animated.View
              style={[StyleSheet.absoluteFill, animatedGlareStyle]}
              pointerEvents="none"
            >
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.15)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, { borderRadius: 24 }]}
              />
            </Animated.View>
          </Animated.View>
        </View>

        {/* Share button */}
        <View style={styles.shareArea}>
          <AppButton
            title={sharing ? 'Gerando imagem...' : '📤 Compartilhar card'}
            onPress={handleShare}
            fullWidth
            disabled={sharing}
          />
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 18,
    color: colors.textPrimary,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareArea: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
});
