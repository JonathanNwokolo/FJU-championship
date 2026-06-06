import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  FlatList,
  ListRenderItem,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { TeamColorDot } from '../../components/TeamColorDot';
import { TeamLogo } from '../../components/TeamLogo';
import { Badge } from '../../components/Badge';
import { colors, gradients } from '../../theme/colors';
import { useMatchStore } from '../../stores/matchStore';
import { useTeamStore } from '../../stores/teamStore';
import { FixturesStackParamList } from '../../navigation/FixturesStackNavigator';
import { MatchEvent } from '../../types';

type RouteT = RouteProp<FixturesStackParamList, 'LiveMatch'>;
type NavT = NativeStackNavigationProp<FixturesStackParamList>;

const EVENT_META = {
  gol: { label: 'Gol', icon: 'football-outline', tint: colors.accent },
  assistencia: { label: 'Assistência', icon: 'footsteps-outline', tint: colors.success },
  cartao_amarelo: { label: 'Amarelo', icon: 'square', tint: colors.warning },
  cartao_vermelho: { label: 'Vermelho', icon: 'square', tint: colors.danger },
} as const;

function EventTimelineCard({
  event,
  index,
  homeTeamId,
}: {
  event: MatchEvent;
  index: number;
  homeTeamId?: string;
}) {
  const { players, teams } = useTeamStore();
  const player = players.find((item) => item.id === event.playerId);
  const team = teams.find((item) => item.id === event.teamId);
  const meta = EVENT_META[event.type];
  const isHomeEvent = event.teamId === homeTeamId;

  return (
    <Animated.View entering={FadeInDown.delay(index * 45).duration(260)}>
      <View
        style={[
          styles.timelineCard,
          isHomeEvent ? styles.timelineCardHome : styles.timelineCardAway,
        ]}
      >
        <View style={styles.timelineMinute}>
          <Text style={styles.timelineMinuteText}>{event.minute}'</Text>
        </View>
        <View
          style={[
            styles.timelineIconWrap,
            {
              backgroundColor:
                event.type === 'gol'
                  ? colors.accentGlow
                  : event.type === 'assistencia'
                    ? 'rgba(46,204,113,0.15)'
                    : event.type === 'cartao_amarelo'
                      ? 'rgba(245,166,35,0.15)'
                      : 'rgba(255,59,71,0.15)',
            },
          ]}
        >
          <Ionicons
            name={meta.icon}
            size={event.type === 'gol' ? 16 : 14}
            color={meta.tint}
          />
        </View>
        <View style={styles.timelineCopy}>
          <Text style={styles.timelinePlayer} numberOfLines={1}>
            {player?.name ?? 'Jogador'}
          </Text>
          <View style={styles.timelineSubRow}>
            <Text style={styles.timelineType}>{meta.label}</Text>
            <Text style={styles.timelineTeam} numberOfLines={1}>
              {team?.name ?? 'Time'}
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

export function LiveMatchScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { matchId } = route.params;

  const { matches, events } = useMatchStore();
  const { teams } = useTeamStore();

  const match = matches.find((item) => item.id === matchId);
  const matchEvents = useMemo(
    () =>
      events
        .filter((event) => event.matchId === matchId)
        .sort((a, b) => b.minute - a.minute),
    [events, matchId],
  );

  const homeTeam = teams.find((item) => item.id === match?.homeTeamId);
  const awayTeam = teams.find((item) => item.id === match?.awayTeamId);

  const [showGoal, setShowGoal] = useState(false);
  const overlayOpacity = useRef(new RNAnimated.Value(0)).current;
  const overlayScale = useRef(new RNAnimated.Value(0.92)).current;
  const pulse = useRef(new RNAnimated.Value(1)).current;
  const previousGoalCount = useRef(
    matchEvents.filter((event) => event.type === 'gol').length,
  );

  useEffect(() => {
    if (match?.status === 'finalizado') {
      navigation.replace('MatchSummary', { matchId });
    }
  }, [match?.status, matchId, navigation]);

  useEffect(() => {
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulse, {
          toValue: 1.18,
          duration: 700,
          useNativeDriver: true,
        }),
        RNAnimated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [pulse]);

  useEffect(() => {
    const goalCount = matchEvents.filter((event) => event.type === 'gol').length;
    if (goalCount > previousGoalCount.current) {
      previousGoalCount.current = goalCount;
      setShowGoal(true);
      overlayOpacity.setValue(0);
      overlayScale.setValue(0.92);
      RNAnimated.sequence([
        RNAnimated.parallel([
          RNAnimated.timing(overlayOpacity, {
            toValue: 1,
            duration: 240,
            useNativeDriver: true,
          }),
          RNAnimated.spring(overlayScale, {
            toValue: 1,
            tension: 90,
            friction: 8,
            useNativeDriver: true,
          }),
        ]),
        RNAnimated.delay(900),
        RNAnimated.timing(overlayOpacity, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start(() => setShowGoal(false));
    } else {
      previousGoalCount.current = goalCount;
    }
  }, [matchEvents, overlayOpacity, overlayScale]);

  const renderItem: ListRenderItem<MatchEvent> = ({ item, index }) => (
    <EventTimelineCard event={item} index={index} homeTeamId={match?.homeTeamId} />
  );

  if (!match) {
    return null;
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.hero} style={styles.hero}>
        <SafeAreaView edges={['top']} style={styles.heroSafe}>
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>

            <View style={styles.liveBadgeWrap}>
              <Badge label="AO VIVO" variant="live" />
              <RNAnimated.View
                style={[
                  styles.livePulseDot,
                  {
                    transform: [{ scale: pulse }],
                  },
                ]}
              />
            </View>

            <View style={styles.topBarSpacer} />
          </View>

          <Text style={styles.roundLabel}>RODADA {match.round}</Text>

          <View style={styles.scoreRow}>
            <View style={styles.teamColumn}>
              {homeTeam ? (
                <TeamLogo team={homeTeam} size={48} />
              ) : (
                <TeamColorDot color={colors.textMuted} size={14} />
              )}
              <Text style={styles.teamName} numberOfLines={2}>
                {homeTeam?.name ?? 'Casa'}
              </Text>
            </View>

            <View style={styles.scoreWrap}>
              <Text style={styles.scoreValue}>
                {match.homeScore ?? 0}
                <Text style={styles.scoreDivider}> - </Text>
                {match.awayScore ?? 0}
              </Text>
            </View>

            <View style={[styles.teamColumn, styles.teamColumnRight]}>
              <Text style={[styles.teamName, styles.teamNameRight]} numberOfLines={2}>
                {awayTeam?.name ?? 'Fora'}
              </Text>
              {awayTeam ? (
                <TeamLogo team={awayTeam} size={48} />
              ) : (
                <TeamColorDot color={colors.textMuted} size={14} />
              )}
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <View style={styles.timelineSection}>
        <View style={styles.timelineHeader}>
          <Text style={styles.timelineHeaderTitle}>TIMELINE DA PARTIDA</Text>
          <Text style={styles.timelineHeaderCount}>{matchEvents.length} eventos</Text>
        </View>

        <FlatList
          data={matchEvents}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          inverted
          contentContainerStyle={styles.timelineListContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="flash-outline" size={54} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>Partida iniciada</Text>
              <Text style={styles.emptySubtitle}>
                Os eventos ao vivo vao aparecer aqui conforme forem registrados.
              </Text>
            </View>
          }
        />
      </View>

      {showGoal ? (
        <RNAnimated.View
          pointerEvents="none"
          style={[
            styles.goalOverlay,
            {
              opacity: overlayOpacity,
              transform: [{ scale: overlayScale }],
            },
          ]}
        >
          <LinearGradient
            colors={['rgba(245,166,35,0.92)', 'rgba(196,125,14,0.88)']}
            style={styles.goalOverlayGradient}
          >
            <Text style={styles.goalOverlayLabel}>GOOOL!</Text>
          </LinearGradient>
        </RNAnimated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  hero: {
    paddingBottom: 24,
  },
  heroSafe: {
    paddingHorizontal: 20,
  },
  topBar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  livePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.neon,
  },
  topBarSpacer: {
    width: 36,
  },
  roundLabel: {
    marginTop: 18,
    textAlign: 'center',
    fontFamily: 'Barlow-Bold',
    fontSize: 11,
    letterSpacing: 1.8,
    color: colors.accent,
  },
  scoreRow: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  teamColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 10,
  },
  teamColumnRight: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  teamName: {
    textAlign: 'center',
    fontFamily: 'Barlow-SemiBold',
    fontSize: 20,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  teamNameRight: {
    textAlign: 'center',
  },
  scoreWrap: {
    minWidth: 160,
    alignItems: 'center',
  },
  scoreValue: {
    fontFamily: 'Barlow-Black',
    fontSize: 72,
    lineHeight: 78,
    color: colors.accent,
    letterSpacing: 0,
  },
  scoreDivider: {
    color: colors.textMuted,
  },
  timelineSection: {
    flex: 1,
    paddingTop: 18,
  },
  timelineHeader: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timelineHeaderTitle: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    letterSpacing: 1.8,
    color: colors.textSecondary,
  },
  timelineHeaderCount: {
    fontFamily: 'Barlow-Medium',
    fontSize: 12,
    color: colors.textMuted,
  },
  timelineListContent: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 10,
  },
  timelineCard: {
    minHeight: 72,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg200,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timelineCardHome: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  timelineCardAway: {
    borderRightWidth: 3,
    borderRightColor: colors.neon,
  },
  timelineMinute: {
    width: 42,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg300,
  },
  timelineMinuteText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  timelineIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineCopy: {
    flex: 1,
  },
  timelinePlayer: {
    fontFamily: 'Barlow-Bold',
    fontSize: 16,
    color: colors.textPrimary,
  },
  timelineSubRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timelineType: {
    fontFamily: 'Barlow-Medium',
    fontSize: 12,
    color: colors.textSecondary,
  },
  timelineTeam: {
    flex: 1,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textMuted,
  },
  emptyWrap: {
    minHeight: 300,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    marginTop: 18,
    fontFamily: 'Barlow-Bold',
    fontSize: 20,
    color: colors.textPrimary,
  },
  emptySubtitle: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: 'Barlow-Regular',
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  goalOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,14,23,0.2)',
  },
  goalOverlayGradient: {
    minWidth: 260,
    paddingHorizontal: 26,
    paddingVertical: 22,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalOverlayLabel: {
    fontFamily: 'Barlow-Black',
    fontSize: 56,
    color: colors.textOnAccent,
    letterSpacing: 0,
  },
});
