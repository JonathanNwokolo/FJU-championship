import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  SlideInLeft,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
// @ts-ignore
import ConfettiCannon from 'react-native-confetti-cannon';

import * as Haptics from 'expo-haptics';
import { colors } from '../../theme/colors';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useMatchStore } from '../../stores/matchStore';
import { useTeamStore } from '../../stores/teamStore';
import { generateRoundRobin, generateBracketFixtures } from '../../utils/roundRobin';
import { setDocument, updateDocument } from '../../services/firestore';
import { MatchModel, Team } from '../../types';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';

type RouteT = RouteProp<HomeStackParamList, 'DrawFullscreen'>;

const { width: W, height: H } = Dimensions.get('window');

// ─── Utilitários ──────────────────────────────────────────────────────────────

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function buildMatchModels(
  rounds: Array<Array<[string, string]>>,
  championshipId: string,
): MatchModel[] {
  return rounds.flatMap((pairs, roundIdx) =>
    pairs.map(([a, b]) => ({
      id: makeId(),
      championshipId,
      round: roundIdx + 1,
      homeTeamId: roundIdx % 2 === 0 ? a : b,
      awayTeamId: roundIdx % 2 === 0 ? b : a,
      homeScore: null,
      awayScore: null,
      status: 'agendado' as const,
    })),
  );
}

// ─── TeamCard ─────────────────────────────────────────────────────────────────

interface TeamCardProps {
  team: Team;
  index: number;
  shuffleActive: boolean;
  visible: boolean;
}

function TeamCard({ team, index, shuffleActive, visible }: TeamCardProps) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const opacity = useSharedValue(1);
  const offsets = useRef({ dx: (Math.random() - 0.5) * 60, dy: (Math.random() - 0.5) * 40 });

  useEffect(() => {
    const { dx, dy } = offsets.current;
    if (shuffleActive) {
      tx.value = withRepeat(
        withSequence(
          withTiming(dx, { duration: 280 }),
          withTiming(-dx * 0.7, { duration: 280 }),
          withTiming(dx * 0.3, { duration: 200 }),
          withTiming(0, { duration: 200 }),
        ),
        -1,
        false,
      );
      ty.value = withRepeat(
        withSequence(
          withTiming(dy, { duration: 340 }),
          withTiming(-dy * 0.7, { duration: 340 }),
          withTiming(0, { duration: 240 }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(tx);
      cancelAnimation(ty);
      tx.value = withSpring(0);
      ty.value = withSpring(0);
    }
  }, [shuffleActive]);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: 350 });
  }, [visible]);

  const anim = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).duration(300)}
      style={[tcStyles.card, anim]}
    >
      <View style={[tcStyles.dot, { backgroundColor: team.primaryColor }]} />
      <Text style={tcStyles.name} numberOfLines={2}>{team.name}</Text>
    </Animated.View>
  );
}

const tcStyles = StyleSheet.create({
  card: {
    width: 100,
    height: 100,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    margin: 6,
    borderWidth: 1,
    borderColor: '#FFFFFF18',
    gap: 6,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#FFFFFF40',
  },
  name: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textOnDark,
    textAlign: 'center',
    lineHeight: 16,
  },
});

// ─── PulsingText ──────────────────────────────────────────────────────────────

function PulsingText({ text, style }: { text: string; style?: object }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.2, { duration: 600 }),
        withTiming(1, { duration: 600 }),
      ),
      -1,
      false,
    );
  }, []);

  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={anim}>
      <Text style={style}>{text}</Text>
    </Animated.View>
  );
}

// ─── Particle ─────────────────────────────────────────────────────────────────

function Particle({ x }: { x: number }) {
  const opacity = useSharedValue(1);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    opacity.value = withTiming(0, { duration: 1000 });
    ty.value = withTiming(-80, { duration: 1000 });
    scale.value = withTiming(0, { duration: 1000 });
  }, []);

  const anim = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: x }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return <Animated.View style={[styles.particle, anim]} />;
}

// ─── BigButton ────────────────────────────────────────────────────────────────

function BigButton({
  title,
  onPress,
  loading,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity
      style={bbStyles.btn}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator color={colors.textOnAccent} />
      ) : (
        <Text style={bbStyles.text}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const bbStyles = StyleSheet.create({
  btn: {
    height: 60,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    width: '100%',
    ...Platform.select({
      default: {
        shadowColor: colors.accent,
        shadowOpacity: 0.3,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 8,
        elevation: 4,
      },
      web: {},
    }),
  },
  text: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textOnAccent,
  },
});

// ─── Tela principal ───────────────────────────────────────────────────────────

type Phase = 'presenting' | 'shuffling' | 'revealing' | 'confirmed';
type ParticleItem = { id: string; x: number };

export function DrawFullscreenScreen() {
  useKeepAwake();

  const navigation = useNavigation();
  const route = useRoute<RouteT>();
  const { championshipId } = route.params;

  const storeTeams = useTeamStore((s) => s.teams);
  const championships = useChampionshipStore((s) => s.championships);
  const addMatches = useMatchStore((s) => s.addMatches);
  const updateChampionship = useChampionshipStore((s) => s.updateChampionship);

  const championship = championships.find((c) => c.id === championshipId);
  const approvedTeams = storeTeams.filter(
    (t) => t.championshipId === championshipId && t.status === 'aprovado',
  );
  const teamsById = Object.fromEntries(storeTeams.map((t) => [t.id, t]));

  const isBracket =
    championship?.format === 'mata_mata' || championship?.format === 'grupos_e_mata_mata';

  const [phase, setPhase] = useState<Phase>('presenting');
  const [shuffledTeams, setShuffledTeams] = useState<Team[]>(approvedTeams);
  const [rounds, setRounds] = useState<Array<Array<[string, string]>>>([]);
  // Stores full MatchModel list for bracket formats (mata_mata / grupos_e_mata_mata)
  const [bracketMatches, setBracketMatches] = useState<MatchModel[]>([]);
  const [currentRevealRound, setCurrentRevealRound] = useState(0);
  const [visibleMatchCount, setVisibleMatchCount] = useState(0);
  const [shuffleActive, setShuffleActive] = useState(false);
  const [cardsVisible, setCardsVisible] = useState(true);
  const [particles, setParticles] = useState<ParticleItem[]>([]);
  const [loading, setLoading] = useState(false);

  const confettiLeft = useRef<any>(null);
  const confettiCenter = useRef<any>(null);
  const confettiRight = useRef<any>(null);
  const pendingTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Oculta status bar enquanto a tela estiver aberta
  useEffect(() => {
    StatusBar.setHidden(true, 'fade');
    return () => {
      StatusBar.setHidden(false, 'fade');
      pendingTimers.current.forEach(clearTimeout);
    };
  }, []);

  // Partículas douradas
  const spawnParticles = useCallback(() => {
    const wave: ParticleItem[] = Array.from({ length: 8 }, (_, i) => ({
      id: `p-${Date.now()}-${i}`,
      x: (Math.random() - 0.5) * 200,
    }));
    setParticles((prev) => [...prev, ...wave]);
    const ids = wave.map((p) => p.id);
    const t = setTimeout(
      () => setParticles((prev) => prev.filter((p) => !ids.includes(p.id))),
      1300,
    );
    pendingTimers.current.push(t);
  }, []);

  // Revelação progressiva das partidas
  useEffect(() => {
    if (phase !== 'revealing') return;
    setVisibleMatchCount(0);
    const currentRound = rounds[currentRevealRound] ?? [];
    const ts = currentRound.map((_, i) => {
      const t = setTimeout(() => {
        setVisibleMatchCount(i + 1);
        spawnParticles();
      }, 400 + i * 600);
      return t;
    });
    pendingTimers.current.push(...ts);
    return () => ts.forEach(clearTimeout);
  }, [phase, currentRevealRound, rounds, spawnParticles]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleStartDraw = () => {
    const shuffled = fisherYates(approvedTeams);
    setShuffledTeams(shuffled);

    if (isBracket) {
      // Bracket formats: generate full MatchModel list and convert round 1 to display pairs
      const matches = generateBracketFixtures(shuffled, championshipId);
      setBracketMatches(matches);
      // Only show first-round matchups (future rounds depend on results)
      const firstRoundPairs: Array<[string, string]> = matches
        .filter((m) => m.round === 1 && m.homeTeamId && m.awayTeamId)
        .map((m) => [m.homeTeamId, m.awayTeamId] as [string, string]);
      setRounds([firstRoundPairs]);
    } else {
      const roundPairs = generateRoundRobin(shuffled.map((t) => t.id));
      setRounds(roundPairs);
    }

    setPhase('shuffling');
    setShuffleActive(true);

    const t1 = setTimeout(() => {
      setShuffleActive(false);
      const t2 = setTimeout(() => {
        setCardsVisible(false);
        const t3 = setTimeout(() => {
          setPhase('revealing');
          setCurrentRevealRound(0);
        }, 450);
        pendingTimers.current.push(t3);
      }, 800);
      pendingTimers.current.push(t2);
    }, 3000);
    pendingTimers.current.push(t1);
  };

  const handleNextRound = () => {
    setVisibleMatchCount(0);
    setCurrentRevealRound((r) => r + 1);
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      // For bracket formats use the pre-generated MatchModel list; for round-robin build from pairs
      const matchModels = isBracket
        ? bracketMatches
        : buildMatchModels(rounds, championshipId);
      const totalRounds = isBracket
        ? Math.max(...matchModels.map((m) => m.round), 1)
        : rounds.length;
      const champUpdate = { status: 'em_andamento', currentRound: 1, totalRounds };

      await Promise.all(matchModels.map((m) => setDocument('matches', m.id, m)));
      await updateDocument('championships', championshipId, champUpdate);

      addMatches(matchModels);
      updateChampionship(championshipId, champUpdate as any);

      setPhase('confirmed');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      confettiLeft.current?.shoot();
      confettiCenter.current?.shoot();
      confettiRight.current?.shoot();

      const t = setTimeout(() => {
        StatusBar.setHidden(false, 'fade');
        (navigation.getParent() as any)?.navigate('Confrontos');
      }, 2500);
      pendingTimers.current.push(t);
    } catch (err) {
      console.warn('[DrawFullscreen] handleConfirm failed:', err);
      Alert.alert('Erro', 'Não foi possível gerar os confrontos. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleExit = () => {
    Alert.alert('Cancelar sorteio?', 'O sorteio será descartado.', [
      { text: 'Não', style: 'cancel' },
      {
        text: 'Sim, sair',
        style: 'destructive',
        onPress: () => {
          StatusBar.setHidden(false, 'fade');
          navigation.goBack();
        },
      },
    ]);
  };

  // ── Derivados ────────────────────────────────────────────────────────────────

  const currentRoundMatches = rounds[currentRevealRound] ?? [];
  const isLastRound = currentRevealRound === rounds.length - 1;
  const allRevealed =
    visibleMatchCount >= currentRoundMatches.length && currentRoundMatches.length > 0;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <LinearGradient colors={[colors.primaryDark, '#0A1520']} style={styles.root}>
      {/* Botão fechar (sempre visível) */}
      <TouchableOpacity
        style={styles.closeBtn}
        onPress={handleExit}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="close" size={26} color={`${colors.textOnDark}BB`} />
      </TouchableOpacity>

      {/* Canhões de confete */}
      <ConfettiCannon
        ref={confettiLeft}
        count={80}
        origin={{ x: 0, y: H * 0.6 }}
        autoStart={false}
        fadeOut
      />
      <ConfettiCannon
        ref={confettiCenter}
        count={120}
        origin={{ x: W / 2, y: H * 0.6 }}
        autoStart={false}
        fadeOut
      />
      <ConfettiCannon
        ref={confettiRight}
        count={80}
        origin={{ x: W, y: H * 0.6 }}
        autoStart={false}
        fadeOut
      />

      {/* Partículas douradas */}
      <View style={styles.particleOrigin} pointerEvents="none">
        {particles.map((p) => (
          <Particle key={p.id} x={p.x} />
        ))}
      </View>

      {/* ── FASE 1 & 2: apresentação + embaralhamento ─────────────────────── */}
      {(phase === 'presenting' || phase === 'shuffling') && (
        <ScrollView
          contentContainerStyle={styles.presentContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={phase === 'presenting'}
        >
          <Text style={styles.headerLabel}>⚽ SORTEIO</Text>
          {championship && (
            <Text style={styles.champTitle}>{championship.name}</Text>
          )}

          {phase === 'shuffling' && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.shufflingWrap}>
              <PulsingText text="SORTEANDO..." style={styles.shufflingText} />
            </Animated.View>
          )}

          <View style={styles.grid}>
            {shuffledTeams.map((team, i) => (
              <TeamCard
                key={team.id}
                team={team}
                index={i}
                shuffleActive={shuffleActive}
                visible={cardsVisible}
              />
            ))}
          </View>

          {phase === 'presenting' && (
            <View style={styles.startBtnWrap}>
              <BigButton title="INICIAR SORTEIO" onPress={handleStartDraw} />
            </View>
          )}
        </ScrollView>
      )}

      {/* ── FASE 3: revelação rodada a rodada ─────────────────────────────── */}
      {phase === 'revealing' && (
        <ScrollView
          contentContainerStyle={styles.revealContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            key={`rt-${currentRevealRound}`}
            entering={FadeIn.duration(400)}
          >
            <Text style={styles.roundTitle}>RODADA {currentRevealRound + 1}</Text>
          </Animated.View>

          {currentRoundMatches.slice(0, visibleMatchCount).map(([homeId, awayId], i) => {
            const home = teamsById[homeId];
            const away = teamsById[awayId];
            if (!home || !away) return null;
            return (
              <Animated.View
                key={`m-${currentRevealRound}-${i}`}
                entering={SlideInLeft.duration(400)}
                style={styles.matchCard}
              >
                <View style={styles.matchRow}>
                  <View style={[styles.teamDot, { backgroundColor: home.primaryColor }]} />
                  <Text style={styles.matchTeamName} numberOfLines={1}>
                    {home.name}
                  </Text>
                  <Text style={styles.vsText}>VS</Text>
                  <Text
                    style={[styles.matchTeamName, styles.matchTeamRight]}
                    numberOfLines={1}
                  >
                    {away.name}
                  </Text>
                  <View style={[styles.teamDot, { backgroundColor: away.primaryColor }]} />
                </View>
              </Animated.View>
            );
          })}

          {allRevealed && (
            <Animated.View entering={FadeIn.duration(400)} style={styles.nextBtnWrap}>
              <BigButton
                title={isLastRound ? 'CONFIRMAR TABELA E INICIAR' : 'PRÓXIMA RODADA'}
                onPress={isLastRound ? handleConfirm : handleNextRound}
                loading={loading}
              />
            </Animated.View>
          )}
        </ScrollView>
      )}

      {/* ── FASE 4: confirmação ───────────────────────────────────────────── */}
      {phase === 'confirmed' && (
        <Animated.View entering={FadeIn.duration(400)} style={styles.confirmedWrap}>
          <Text style={styles.confirmedText}>CAMPEONATO INICIADO! 🏆</Text>
        </Animated.View>
      )}
    </LinearGradient>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  closeBtn: {
    position: 'absolute',
    top: 52,
    right: 20,
    zIndex: 100,
    padding: 4,
  },

  particleOrigin: {
    position: 'absolute',
    top: H * 0.35,
    left: W / 2,
    width: 0,
    height: 0,
    zIndex: 50,
    overflow: 'visible',
  },
  particle: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accentLight,
  },

  // Apresentação / embaralhamento
  presentContent: {
    paddingTop: 80,
    paddingHorizontal: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  headerLabel: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.accentLight,
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 8,
  },
  champTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.textOnDark,
    textAlign: 'center',
    lineHeight: 38,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  shufflingWrap: {
    marginBottom: 8,
  },
  shufflingText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.accentLight,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 12,
  },
  startBtnWrap: {
    marginTop: 40,
    width: '100%',
    paddingHorizontal: 20,
  },

  // Revelação
  revealContent: {
    paddingTop: 80,
    paddingHorizontal: 40,
    paddingBottom: 60,
    alignItems: 'stretch',
  },
  roundTitle: {
    fontSize: 48,
    fontWeight: '900',
    color: colors.accentLight,
    textAlign: 'center',
    letterSpacing: 3,
    marginBottom: 24,
  },
  matchCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 20,
    marginVertical: 8,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    flexShrink: 0,
    borderWidth: 1.5,
    borderColor: '#FFFFFF40',
  },
  matchTeamName: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: colors.textOnDark,
    marginHorizontal: 10,
  },
  matchTeamRight: {
    textAlign: 'right',
  },
  vsText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textSecondary,
    marginHorizontal: 4,
  },
  nextBtnWrap: {
    marginTop: 32,
  },

  // Confirmação
  confirmedWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  confirmedText: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.textOnDark,
    textAlign: 'center',
    lineHeight: 44,
  },
});
