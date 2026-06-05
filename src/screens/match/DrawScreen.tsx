import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '../../components/AppButton';
import { colors } from '../../theme/colors';
import { useTeamStore } from '../../stores/teamStore';
import { useMatchStore } from '../../stores/matchStore';
import { useChampionshipStore } from '../../stores/championshipStore';
import {
  generateRoundRobinFixtures,
  generateBracketFixtures,
  generateGroupStageFixtures,
} from '../../utils/roundRobin';
import { Team } from '../../types';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';

type RouteT = RouteProp<HomeStackParamList, 'DrawScreen'>;

type DrawPhase = 'shuffling' | 'revealing' | 'done';

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Animated team card ───────────────────────────────────────────────────────

interface CardProps {
  team: Team;
  phase: DrawPhase;
  revealIndex: number;
}

function AnimatedTeamCard({ team, phase, revealIndex }: CardProps) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const rot = useSharedValue(0);
  const opacity = useSharedValue(1);

  const offsets = useRef({
    dx: (Math.random() - 0.5) * 56,
    dy: (Math.random() - 0.5) * 36,
    dr: (Math.random() - 0.5) * 14,
  });

  useEffect(() => {
    const { dx, dy, dr } = offsets.current;

    if (phase === 'shuffling') {
      opacity.value = 1;
      tx.value = withRepeat(
        withSequence(
          withTiming(dx, { duration: 280 }),
          withTiming(-dx * 0.6, { duration: 280 }),
          withTiming(dx * 0.3, { duration: 280 }),
          withTiming(0, { duration: 280 }),
        ),
        -1,
        false,
      );
      ty.value = withRepeat(
        withSequence(
          withTiming(dy, { duration: 320 }),
          withTiming(-dy * 0.6, { duration: 320 }),
          withTiming(dy * 0.3, { duration: 320 }),
          withTiming(0, { duration: 320 }),
        ),
        -1,
        false,
      );
      rot.value = withRepeat(
        withSequence(
          withTiming(dr, { duration: 380 }),
          withTiming(-dr, { duration: 380 }),
          withTiming(0, { duration: 380 }),
        ),
        -1,
        false,
      );
    } else if (phase === 'revealing') {
      cancelAnimation(tx);
      cancelAnimation(ty);
      cancelAnimation(rot);
      tx.value = withTiming(0, { duration: 250 });
      ty.value = withTiming(0, { duration: 250 });
      rot.value = withTiming(0, { duration: 250 });
      opacity.value = withSequence(
        withTiming(0, { duration: 120 }),
        withDelay(revealIndex * 200, withTiming(1, { duration: 380 })),
      );
    }
  }, [phase]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${rot.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[cardStyles.card, animStyle]}>
      <View style={[cardStyles.dot, { backgroundColor: team.primaryColor }]} />
      <Text style={cardStyles.name} numberOfLines={2}>
        {team.name}
      </Text>
    </Animated.View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    width: '46%',
    backgroundColor: '#1B2838',
    borderRadius: 14,
    padding: 14,
    margin: '2%',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#FFFFFF18',
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#FFFFFF30',
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textOnDark,
    textAlign: 'center',
    lineHeight: 18,
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export function DrawScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteT>();
  const { championshipId } = route.params;

  const teams = useTeamStore((s) => s.teams);
  const championships = useChampionshipStore((s) => s.championships);
  const addMatches = useMatchStore((s) => s.addMatches);
  const updateChampionship = useChampionshipStore((s) => s.updateChampionship);

  const championship = championships.find((c) => c.id === championshipId);

  const approvedTeams = teams.filter(
    (t) => t.championshipId === championshipId && t.status === 'aprovado',
  );

  const [shuffledTeams] = useState<Team[]>(() => fisherYates(approvedTeams));
  const [phase, setPhase] = useState<DrawPhase>('shuffling');

  const format = championship?.format ?? 'pontos_corridos';

  // Cálculo de rodadas baseado no formato
  const calculateTotalRounds = () => {
    if (format === 'mata_mata') {
      // Mata-mata: log2(n) rodadas
      return Math.ceil(Math.log2(approvedTeams.length));
    } else if (format === 'grupos_e_mata_mata') {
      // Grupos + mata-mata: rodadas dos grupos + rodadas do bracket
      const teamsPerGroup = Math.ceil(approvedTeams.length / 2); // 2 grupos por padrão
      const groupRounds = teamsPerGroup - 1;
      const classifiedTeams = 4; // 2 por grupo
      const bracketRounds = Math.ceil(Math.log2(classifiedTeams));
      return groupRounds + bracketRounds;
    }
    // Pontos corridos
    return approvedTeams.length % 2 === 0
      ? approvedTeams.length - 1
      : approvedTeams.length;
  };

  const totalRounds = calculateTotalRounds();

  const calculateTotalMatches = () => {
    if (format === 'mata_mata') {
      // Mata-mata: n-1 partidas para n times
      return approvedTeams.length - 1;
    } else if (format === 'grupos_e_mata_mata') {
      const teamsPerGroup = Math.ceil(approvedTeams.length / 2);
      const matchesPerGroup = (teamsPerGroup * (teamsPerGroup - 1)) / 2;
      const groupMatches = matchesPerGroup * 2;
      const bracketMatches = 3; // semi + semi + final
      return groupMatches + bracketMatches;
    }
    return totalRounds * Math.floor(approvedTeams.length / 2);
  };

  const totalMatches = calculateTotalMatches();

  useEffect(() => {
    const revealEnd = 2500 + shuffledTeams.length * 200 + 700;
    const t1 = setTimeout(() => setPhase('revealing'), 2500);
    const t2 = setTimeout(() => setPhase('done'), revealEnd);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const handleConfirm = () => {
    let newMatches;

    if (format === 'mata_mata') {
      newMatches = generateBracketFixtures(approvedTeams, championshipId);
    } else if (format === 'grupos_e_mata_mata') {
      const { groupMatches, groups } = generateGroupStageFixtures(
        approvedTeams,
        championshipId,
        2, // número de grupos
      );
      newMatches = groupMatches;
      // Salvar informação dos grupos no campeonato
      updateChampionship(championshipId, {
        groups: groups as any,
      });
    } else {
      newMatches = generateRoundRobinFixtures(approvedTeams, championshipId);
    }

    addMatches(newMatches);
    updateChampionship(championshipId, {
      status: 'em_andamento',
      currentRound: 1,
      totalRounds,
    });
    // Switch to Confrontos tab (parent of the home stack)
    (navigation.getParent() as any)?.navigate('Confrontos');
  };

  const phaseLabel =
    phase === 'shuffling'
      ? 'Sorteando times...'
      : phase === 'revealing'
      ? 'Revelando ordem!'
      : 'Tabela gerada com sucesso!';

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Back button (only before done) */}
        {phase !== 'done' && (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={26} color={colors.textOnDark} />
          </TouchableOpacity>
        )}

        {/* Header */}
        <View style={styles.headerArea}>
          {phase === 'done' ? (
            <Text style={styles.successIcon}>🏆</Text>
          ) : (
            <Text style={styles.diceIcon}>🎲</Text>
          )}
          <Text
            style={[
              styles.phaseLabel,
              phase === 'done' && styles.phaseLabelDone,
            ]}
          >
            {phaseLabel}
          </Text>
          {championship && phase !== 'done' && (
            <Text style={styles.champName}>{championship.name}</Text>
          )}
        </View>

        {/* Phases 1 & 2 — team cards grid */}
        {phase !== 'done' && (
          <View style={styles.grid}>
            {shuffledTeams.map((team, index) => (
              <AnimatedTeamCard
                key={team.id}
                team={team}
                phase={phase}
                revealIndex={index}
              />
            ))}
          </View>
        )}

        {/* Phase 3 — confirmation */}
        {phase === 'done' && (
          <View style={styles.doneContainer}>
            <Text style={styles.summaryText}>
              {totalRounds} rodadas • {totalMatches} partidas
            </Text>

            {/* Revealed order list */}
            <ScrollView
              style={styles.teamsList}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.teamsListContent}
            >
              {shuffledTeams.map((team, i) => (
                <View key={team.id} style={styles.teamRow}>
                  <Text style={styles.teamRank}>{i + 1}</Text>
                  <View
                    style={[styles.teamRowDot, { backgroundColor: team.primaryColor }]}
                  />
                  <Text style={styles.teamRowName}>{team.name}</Text>
                </View>
              ))}
            </ScrollView>

            <AppButton
              title="Ver confrontos"
              onPress={handleConfirm}
              fullWidth
            />
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primaryDark },
  safe: { flex: 1 },

  backBtn: {
    position: 'absolute',
    top: 56,
    left: 16,
    zIndex: 10,
    padding: 4,
  },

  headerArea: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 20,
    paddingHorizontal: 24,
    gap: 8,
  },
  diceIcon: { fontSize: 40 },
  successIcon: { fontSize: 40 },
  phaseLabel: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textOnDark,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  phaseLabelDone: { color: colors.accent },
  champName: {
    fontSize: 13,
    color: `${colors.textOnDark}99`,
    textAlign: 'center',
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    justifyContent: 'center',
  },

  // Phase 3
  doneContainer: {
    flex: 1,
    paddingHorizontal: 20,
    gap: 16,
  },
  summaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: `${colors.textOnDark}CC`,
    textAlign: 'center',
  },
  teamsList: { flex: 1 },
  teamsListContent: { gap: 10 },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1B2838',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#FFFFFF12',
  },
  teamRank: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.accent,
    width: 24,
    textAlign: 'center',
  },
  teamRowDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#FFFFFF30',
  },
  teamRowName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textOnDark,
  },
});
