import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../../theme/colors';
import { useMatchStore } from '../../stores/matchStore';
import { useTeamStore } from '../../stores/teamStore';
import { FixturesStackParamList } from '../../navigation/FixturesStackNavigator';

type RouteT = RouteProp<FixturesStackParamList, 'LiveMatch'>;
type NavT = NativeStackNavigationProp<FixturesStackParamList, 'LiveMatch'>;

const EVENT_ICON: Record<string, string> = {
  gol: '⚽',
  cartao_amarelo: '🟨',
  cartao_vermelho: '🟥',
};

export function LiveMatchScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { matchId } = route.params;

  const matches = useMatchStore((s) => s.matches);
  const events = useMatchStore((s) => s.events);
  const { teams, players } = useTeamStore();

  const match = matches.find((m) => m.id === matchId);
  const matchEvents = events
    .filter((e) => e.matchId === matchId)
    .sort((a, b) => a.minute - b.minute);

  const homeTeam = match ? teams.find((t) => t.id === match.homeTeamId) : null;
  const awayTeam = match ? teams.find((t) => t.id === match.awayTeamId) : null;

  // Auto-navigate when match finishes
  useEffect(() => {
    if (match?.status === 'finalizado') {
      navigation.replace('MatchSummary', { matchId });
    }
  }, [match?.status]);

  // GOOOL! animation
  const goalCount = matchEvents.filter((e) => e.type === 'gol').length;
  const prevGoalCount = useRef(goalCount);
  const goalAnimValue = useRef(new Animated.Value(0)).current;
  const [showGoal, setShowGoal] = useState(false);

  useEffect(() => {
    if (goalCount > prevGoalCount.current) {
      setShowGoal(true);
      goalAnimValue.setValue(0);
      Animated.sequence([
        Animated.timing(goalAnimValue, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.delay(1400),
        Animated.timing(goalAnimValue, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start(() => setShowGoal(false));
    }
    prevGoalCount.current = goalCount;
  }, [goalCount]);

  const goalScale = goalAnimValue.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0.3, 1.15, 1],
  });

  // Pulsing dot for AO VIVO badge
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.2, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  if (!match) return null;

  return (
    <View style={styles.root}>
      {/* Hero header */}
      <SafeAreaView style={styles.heroBg} edges={['top']}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color={colors.textOnDark} />
        </TouchableOpacity>

        <Text style={styles.heroRound}>Rodada {match.round}</Text>

        <View style={styles.liveBadge}>
          <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
          <Text style={styles.liveBadgeText}>AO VIVO</Text>
        </View>

        <View style={styles.heroScoreRow}>
          <Text
            style={[styles.heroTeamName, { color: homeTeam?.primaryColor ?? colors.textOnDark }]}
            numberOfLines={2}
          >
            {homeTeam?.name ?? '—'}
          </Text>
          <View style={styles.heroScoreCenter}>
            <Text style={styles.heroScore}>
              {match.homeScore ?? 0}
              <Text style={styles.heroScoreX}> × </Text>
              {match.awayScore ?? 0}
            </Text>
          </View>
          <Text
            style={[
              styles.heroTeamName,
              styles.heroTeamNameRight,
              { color: awayTeam?.primaryColor ?? colors.textOnDark },
            ]}
            numberOfLines={2}
          >
            {awayTeam?.name ?? '—'}
          </Text>
        </View>

        <View style={styles.heroDotsRow}>
          <View style={[styles.heroDot, { backgroundColor: homeTeam?.primaryColor ?? colors.border }]} />
          <View style={[styles.heroDot, { backgroundColor: awayTeam?.primaryColor ?? colors.border }]} />
        </View>
      </SafeAreaView>

      {/* Events timeline */}
      <FlatList
        data={[...matchEvents].reverse()}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<Text style={styles.sectionLabel}>EVENTOS</Text>}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Aguardando eventos...</Text>
        }
        renderItem={({ item: event }) => {
          const player = players.find((p) => p.id === event.playerId);
          const isHome = event.teamId === match.homeTeamId;
          return (
            <View style={styles.eventRow}>
              <View style={styles.eventSide}>
                {isHome && (
                  <>
                    <Text style={styles.eventIcon}>{EVENT_ICON[event.type]}</Text>
                    <Text style={styles.eventName} numberOfLines={1}>
                      {player?.name ?? '—'}
                    </Text>
                  </>
                )}
              </View>
              <Text style={styles.eventMinute}>{event.minute}'</Text>
              <View style={[styles.eventSide, styles.eventSideRight]}>
                {!isHome && (
                  <>
                    <Text
                      style={[styles.eventName, { textAlign: 'right' }]}
                      numberOfLines={1}
                    >
                      {player?.name ?? '—'}
                    </Text>
                    <Text style={styles.eventIcon}>{EVENT_ICON[event.type]}</Text>
                  </>
                )}
              </View>
            </View>
          );
        }}
      />

      {/* GOOOL! overlay */}
      {showGoal && (
        <Animated.View
          style={[styles.goalOverlay, { opacity: goalAnimValue }]}
          pointerEvents="none"
        >
          <Animated.Text
            style={[styles.goalText, { transform: [{ scale: goalScale }] }]}
          >
            GOOOL! ⚽
          </Animated.Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  heroBg: {
    backgroundColor: colors.primaryDark,
    paddingBottom: 24,
  },
  backBtn: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  heroRound: {
    fontSize: 12,
    fontWeight: '600',
    color: `${colors.textOnDark}66`,
    textAlign: 'center',
    marginBottom: 10,
  },

  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    backgroundColor: `${colors.danger}28`,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 16,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  liveBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.danger,
    letterSpacing: 1,
  },

  heroScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 8,
  },
  heroTeamName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
    color: colors.textOnDark,
  },
  heroTeamNameRight: { textAlign: 'right' },
  heroScoreCenter: { alignItems: 'center', flexShrink: 0 },
  heroScore: {
    fontSize: 52,
    fontWeight: '900',
    color: colors.textOnDark,
    letterSpacing: -1,
  },
  heroScoreX: {
    fontSize: 32,
    fontWeight: '400',
    color: `${colors.textOnDark}55`,
  },
  heroDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 14,
  },
  heroDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  listContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.textSecondary,
    marginBottom: 14,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 24,
  },

  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: 6,
  },
  eventSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eventSideRight: { justifyContent: 'flex-end' },
  eventIcon: { fontSize: 15, flexShrink: 0 },
  eventName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  eventMinute: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    width: 30,
    textAlign: 'center',
    flexShrink: 0,
  },

  goalOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: `${colors.primaryDark}DD`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  goalText: {
    fontSize: 52,
    fontWeight: '900',
    color: colors.accent,
    textShadowColor: `${colors.accent}88`,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
});
