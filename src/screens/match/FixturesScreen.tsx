import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useMatchStore } from '../../stores/matchStore';
import { useTeamStore } from '../../stores/teamStore';
import { useAuthStore } from '../../stores/authStore';
import { AppCard } from '../../components/AppCard';
import { EmptyState } from '../../components/EmptyState';
import { colors } from '../../theme/colors';
import { MatchModel } from '../../types';
import { FixturesStackParamList } from '../../navigation/FixturesStackNavigator';
import {
  registerForPushNotifications,
  saveTokenToFirestore,
} from '../../services/notificationService';
import { isRoundComplete } from '../../services/votingService';
import { useRoundVoting } from '../../hooks/useRoundVoting';

export function FixturesScreen() {
  const navigation = useNavigation<NavigationProp<FixturesStackParamList>>();

  const championships = useChampionshipStore((s) => s.championships);
  const matches = useMatchStore((s) => s.matches);
  const teams = useTeamStore((s) => s.teams);
  const user = useAuthStore((s) => s.user);

  const isOrganizer = user?.role === 'organizador';

  const activeChampionship = championships.find((c) => c.status === 'em_andamento');

  const champMatches = matches.filter(
    (m) => m.championshipId === activeChampionship?.id,
  );

  const totalRounds = activeChampionship?.totalRounds ?? 0;

  const [selectedRound, setSelectedRound] = useState(
    activeChampionship?.currentRound ?? 1,
  );
  const [refreshing, setRefreshing] = useState(false);

  // Voting banner pulse animation
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // Round voting state for current round
  const currentRound = activeChampionship?.currentRound ?? 1;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { hasCurrentUserVoted, winner: roundWinner } = useRoundVoting(
    activeChampionship?.id ?? '',
    currentRound,
  );

  const showVotingBanner =
    !!activeChampionship &&
    activeChampionship.rules.craqueDaRodada &&
    isRoundComplete(champMatches, currentRound) &&
    !hasCurrentUserVoted &&
    !roundWinner;

  // Pede permissão de notificação uma única vez, na primeira entrada nesta tela
  useEffect(() => {
    (async () => {
      const asked = await AsyncStorage.getItem('notifications_permission_asked');
      if (asked || !user || !activeChampionship) return;

      Alert.alert(
        'Notificações de partidas',
        'Quer receber notificações de gols e resultados em tempo real?',
        [
          { text: 'Agora não', style: 'cancel', onPress: () => AsyncStorage.setItem('notifications_permission_asked', 'denied') },
          {
            text: 'Sim, quero!',
            onPress: async () => {
              await AsyncStorage.setItem('notifications_permission_asked', 'granted');
              const token = await registerForPushNotifications();
              if (token) {
                await saveTokenToFirestore(user.id, token, activeChampionship.id);
              }
            },
          },
        ],
      );
    })();
  }, []);

  const rounds = Array.from({ length: totalRounds }, (_, i) => i + 1);

  const filteredMatches = champMatches.filter((m) => m.round === selectedRound);

  const getTeam = (teamId: string) => teams.find((t) => t.id === teamId);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  }, []);

  const handleMatchPress = (match: MatchModel) => {
    if (match.status === 'finalizado') {
      navigation.navigate('MatchSummary', { matchId: match.id });
    } else if (match.status === 'ao_vivo') {
      navigation.navigate('LiveMatch', { matchId: match.id });
    }
  };

  const handleEditPress = (match: MatchModel) => {
    navigation.navigate('MatchRegistration', { matchId: match.id });
  };

  if (!activeChampionship) {
    return (
      <SafeAreaView style={styles.emptyContainer} edges={['top']}>
        <EmptyState
          icon="📅"
          title="Sem campeonato ativo"
          description="Nenhum campeonato em andamento no momento."
        />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      {/* Dark hero header */}
      <SafeAreaView style={styles.headerBg} edges={['top']}>
        <Text style={styles.headerTitle} numberOfLines={2}>
          {activeChampionship.name}
        </Text>
        <Text style={styles.headerSub}>
          Rodada {activeChampionship.currentRound} de {totalRounds}
        </Text>
      </SafeAreaView>

      {/* Round chip selector */}
      <View style={styles.selectorWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.selectorContent}
        >
          {rounds.map((round) => {
            const isActive = round === selectedRound;
            return (
              <TouchableOpacity
                key={round}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => setSelectedRound(round)}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                  Rodada {round}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Voting banner */}
      {showVotingBanner && (
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() =>
            navigation.navigate('Voting', {
              championshipId: activeChampionship.id,
              round: currentRound,
            })
          }
        >
          <Animated.View
            style={[
              styles.votingBanner,
              {
                borderWidth: pulseAnim.interpolate({
                  inputRange: [1, 1.4],
                  outputRange: [1.5, 2.5],
                }),
              },
            ]}
          >
            <Text style={styles.votingBannerEmoji}>🌟</Text>
            <View style={styles.votingBannerBody}>
              <Text style={styles.votingBannerTitle}>
                Votar no Craque da Rodada {currentRound}
              </Text>
              <Text style={styles.votingBannerSub}>Rodada encerrada — vote agora!</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.accent} />
          </Animated.View>
        </TouchableOpacity>
      )}

      {/* Matches list */}
      <FlatList
        data={filteredMatches}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyList}>
            <EmptyState
              icon="⚽"
              title="Sem partidas"
              description="Nenhuma partida cadastrada nesta rodada."
            />
          </View>
        }
        renderItem={({ item: match }) => {
          const home = getTeam(match.homeTeamId);
          const away = getTeam(match.awayTeamId);
          const isFinished = match.status === 'finalizado';
          const isLive = match.status === 'ao_vivo';
          const isTappable = isFinished || isLive;

          return (
            <AppCard
              style={isLive ? [styles.matchCard, styles.matchCardLive] : styles.matchCard}
              onPress={isTappable ? () => handleMatchPress(match) : undefined}
            >
              <View style={styles.matchRow}>
                {/* Home team */}
                <View style={styles.teamHome}>
                  <View
                    style={[
                      styles.teamDot,
                      { backgroundColor: home?.primaryColor ?? colors.border },
                    ]}
                  />
                  <Text style={styles.teamName} numberOfLines={2}>
                    {home?.name ?? '—'}
                  </Text>
                </View>

                {/* Score or "vs" */}
                <View style={styles.scoreBox}>
                  {isFinished ? (
                    <Text style={styles.scoreText}>
                      {match.homeScore}  ×  {match.awayScore}
                    </Text>
                  ) : isLive ? (
                    <Text style={styles.liveScoreText}>
                      {match.homeScore ?? 0}  ×  {match.awayScore ?? 0}
                    </Text>
                  ) : (
                    <Text style={styles.vsText}>vs</Text>
                  )}
                </View>

                {/* Away team */}
                <View style={styles.teamAway}>
                  <Text style={[styles.teamName, styles.teamNameRight]} numberOfLines={2}>
                    {away?.name ?? '—'}
                  </Text>
                  <View
                    style={[
                      styles.teamDot,
                      { backgroundColor: away?.primaryColor ?? colors.border },
                    ]}
                  />
                </View>

                {/* Organizer edit icon on non-finished matches */}
                {isOrganizer && !isFinished && (
                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => handleEditPress(match)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="create-outline" size={20} color={colors.accent} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Status row */}
              <View style={styles.statusRow}>
                {isFinished ? (
                  <View style={styles.finishedBadge}>
                    <Text style={styles.finishedBadgeText}>Finalizado</Text>
                  </View>
                ) : isLive ? (
                  <View style={styles.liveBadge}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveBadgeText}>AO VIVO</Text>
                  </View>
                ) : (
                  <View style={styles.scheduledBadge}>
                    <Text style={styles.scheduledBadgeText}>Agendado</Text>
                  </View>
                )}
                <Text style={styles.roundLabel}>Rodada {match.round}</Text>
              </View>
            </AppCard>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  emptyContainer: { flex: 1, backgroundColor: colors.background },

  // Header
  headerBg: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: 20,
    paddingBottom: 18,
    gap: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textOnDark,
    letterSpacing: 0.2,
  },
  headerSub: {
    fontSize: 13,
    color: `${colors.textOnDark}99`,
    fontWeight: '500',
  },

  // Round selector
  selectorWrapper: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  selectorContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.accent },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextActive: { color: colors.primaryDark },

  // List
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
    gap: 10,
  },
  emptyList: { marginTop: 40 },

  // Match card
  matchCard: {
    gap: 10,
    paddingVertical: 14,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  teamHome: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teamAway: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  teamDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 0,
  },
  teamName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  teamNameRight: { textAlign: 'right' },

  scoreBox: {
    width: 72,
    alignItems: 'center',
    flexShrink: 0,
  },
  scoreText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  vsText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },

  editBtn: { marginLeft: 4, flexShrink: 0 },

  // Status row
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  finishedBadge: {
    backgroundColor: `${colors.success}20`,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  finishedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.success,
  },
  scheduledBadge: {
    backgroundColor: `${colors.textSecondary}18`,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  scheduledBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: `${colors.danger}18`,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.danger,
  },
  liveBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.danger,
    letterSpacing: 0.5,
  },
  matchCardLive: {
    borderWidth: 1,
    borderColor: `${colors.danger}30`,
  },
  liveScoreText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.danger,
    letterSpacing: 0.5,
  },
  roundLabel: {
    fontSize: 11,
    color: colors.textSecondary,
  },

  // Voting banner
  votingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 14,
    borderRadius: 14,
    backgroundColor: `${colors.accent}15`,
    borderColor: colors.accent,
    gap: 12,
  },
  votingBannerEmoji: { fontSize: 24, flexShrink: 0 },
  votingBannerBody: { flex: 1 },
  votingBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
  },
  votingBannerSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
