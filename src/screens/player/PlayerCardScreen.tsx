import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import { captureRef } from 'react-native-view-shot';
import { DeviceMotion } from 'expo-sensors';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { HomeStackParamList } from '../../navigation/HomeStackNavigator';
import { useTeamStore } from '../../stores/teamStore';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useVotingStore } from '../../stores/votingStore';
import { usePlayerStats } from '../../hooks/usePlayerStats';
import { usePlayerAchievements } from '../../hooks/usePlayerAchievements';
import { PlayerCard, PlayerCardErrorBoundary } from '../../components/PlayerCard';
import { AppButton } from '../../components/AppButton';
import { colors } from '../../theme/colors';
import { RARITY_ORDER } from '../../utils/achievementDefinitions';

type Props = NativeStackScreenProps<HomeStackParamList, 'PlayerCard'>;

const RAD_TO_DEG = 180 / Math.PI;

export function PlayerCardScreen({ route, navigation }: Props) {
  const { playerId, championshipId } = route.params;

  const players = useTeamStore((s) => s.players);
  const teams = useTeamStore((s) => s.teams);
  const championships = useChampionshipStore((s) => s.championships);

  const player = useMemo(
    () => players.find((p) => p.id === playerId),
    [players, playerId],
  );
  const team = useMemo(
    () => (player ? teams.find((t) => t.id === player.teamId) : undefined),
    [player, teams],
  );
  const championship = useMemo(
    () => championships.find((c) => c.id === championshipId),
    [championships, championshipId],
  );

  const { goals, assists, yellowCards, redCards, overall, matchesPlayed } = usePlayerStats(playerId, championshipId);
  const { unlocked } = usePlayerAchievements(playerId, championshipId);

  const awards = useVotingStore((s) => s.awards);
  const mvps = useMemo(
    () =>
      awards.filter(
        (a) => a.championshipId === championshipId && a.winnerPlayerId === playerId,
      ).length,
    [awards, championshipId, playerId],
  );
  const topAchievements = useMemo(
    () =>
      [...unlocked]
        .sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity])
        .slice(0, 3),
    [unlocked],
  );

  const rotateX = useSharedValue(0);
  const rotateY = useSharedValue(0);

  useEffect(() => {
    let subscription: { remove: () => void } | null = null;

    (async () => {
      try {
        const available = await DeviceMotion.isAvailableAsync();
        if (!available) return;

        if (typeof DeviceMotion.requestPermissionsAsync === 'function') {
          const { status } = await DeviceMotion.requestPermissionsAsync();
          if (status !== 'granted') return;
        }
        DeviceMotion.setUpdateInterval(50);
        subscription = DeviceMotion.addListener(({ rotation }) => {
          if (!rotation) return;
          const targetX = Math.max(-15, Math.min(15, (rotation.beta ?? 0) * RAD_TO_DEG / 4));
          const targetY = Math.max(-15, Math.min(15, (rotation.gamma ?? 0) * RAD_TO_DEG / 4));
          rotateX.value = withSpring(targetX, { damping: 15 });
          rotateY.value = withSpring(targetY, { damping: 15 });
        });
      } catch {
        // DeviceMotion unavailable (simulator, etc.)
      }
    })();

    return () => subscription?.remove();
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

  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  // Toque leve ao abrir o card-assinatura.
  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const handleShare = async () => {
    if (!cardRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSharing(true);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1.0 });
      const dest = `${FileSystem.cacheDirectory}player-card-${player?.id}.png`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      await Sharing.shareAsync(dest, {
        mimeType: 'image/png',
        dialogTitle: 'Compartilhar card do atleta',
      });
    } catch (e) {
      console.warn('Share failed', e);
    } finally {
      setSharing(false);
    }
  };

  if (!player || !team) {
    return (
      <LinearGradient
        colors={[colors.primaryDark, colors.primary]}
        style={styles.root}
      >
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.center}>
            <Text style={styles.errorText}>Jogador não encontrado</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[colors.primaryDark, colors.primary]}
      style={styles.root}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Card do Atleta</Text>
          <View style={styles.backBtn} />
        </View>

        <View style={styles.center}>
          <Animated.View
            style={[styles.cardGlow, animatedCardStyle]}
            entering={FadeIn.duration(420)}
          >
            <View ref={cardRef} collapsable={false}>
              <PlayerCardErrorBoundary>
                <PlayerCard
                  player={player}
                  team={team}
                  goals={goals}
                  assists={assists}
                  matchesPlayed={matchesPlayed}
                  mvps={mvps}
                  yellowCards={yellowCards}
                  redCards={redCards}
                  overall={overall}
                  championshipName={championship?.name ?? 'Campeonato'}
                  topAchievements={topAchievements}
                />
              </PlayerCardErrorBoundary>
            </View>

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

        <View style={styles.shareArea}>
          <View style={styles.btnRow}>
            <AppButton
              title="🏆 Conquistas"
              onPress={() => navigation.navigate('PlayerAchievements', { playerId, championshipId })}
              style={[styles.achievementsBtn, styles.halfBtn]}
            />
            <AppButton
              title="📊 Estatísticas"
              onPress={() => navigation.navigate('PlayerStatsDetail', { playerId, championshipId })}
              style={[styles.achievementsBtn, styles.halfBtn]}
            />
          </View>
          <AppButton
            title={sharing ? 'Gerando imagem...' : '✦ Compartilhar card'}
            onPress={handleShare}
            fullWidth
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
    fontSize: 16,
    fontFamily: 'Barlow-Bold',
    color: '#FFFFFF',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardGlow: {
    borderRadius: 24,
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 28,
    elevation: 16,
  },
  shareArea: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 10,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  halfBtn: {
    flex: 1,
  },
  achievementsBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  errorText: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
