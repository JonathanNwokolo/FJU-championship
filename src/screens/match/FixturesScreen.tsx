import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Font from 'expo-font';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import Animated, { FadeInDown, FadeIn, FadeOut } from 'react-native-reanimated';
import { MatchCard } from '../../components/MatchCard';
import {
  ScheduleMatchBottomSheet,
  ScheduleMatchBottomSheetRef,
} from '../../components/ScheduleMatchBottomSheet';
import { EmptyState } from '../../components/EmptyState';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { colors } from '../../theme/colors';
import { MatchModel, BracketRound, Team, Player } from '../../types';
import { FixturesStackParamList } from '../../navigation/FixturesStackNavigator';
import { useAuthStore } from '../../stores/authStore';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useMatchStore } from '../../stores/matchStore';
import { useTeamStore } from '../../stores/teamStore';
import { getCollection } from '../../services/index';
import { registerForPushNotifications } from '../../services/notificationService';
import { isRoundComplete } from '../../services/votingService';
import { useRoundVoting } from '../../hooks/useRoundVoting';
import { getBracketRoundLabel } from '../../utils/roundRobin';
import { isActiveRosterPlayer } from '../../utils/teamRules';

type BracketColumn = {
  key: string;
  label: string;
  round: number;
  matches: MatchModel[];
};

function getStatusLabel(status: MatchModel['status']): string {
  if (status === 'finalizado') return 'Finalizado';
  if (status === 'ao_vivo') return 'Ao vivo';
  return 'Agendado';
}

export function FixturesScreen() {
  const navigation = useNavigation<NavigationProp<FixturesStackParamList>>();

  const championships = useChampionshipStore((s) => s.championships);
  const matches = useMatchStore((s) => s.matches);
  const events = useMatchStore((s) => s.events);
  const teams = useTeamStore((s) => s.teams);
  const players = useTeamStore((s) => s.players);
  const user = useAuthStore((s) => s.user);

  const isBarlowMediumLoaded = Font.isLoaded('Barlow-Medium');
  const isBarlowSemiBoldLoaded = Font.isLoaded('Barlow-SemiBold');
  const activeChampionship =
    championships.find((c) => c.status === 'em_andamento') ??
    championships.find((c) => c.status === 'inscricoes_abertas') ??
    championships[0];
  // Gestão de partidas (iniciar/registrar/encerrar) exige ser o organizador DONO
  // do campeonato ativo. Para os demais, a tela de confrontos é somente leitura.
  const isOrganizer =
    user?.role === 'organizador' && activeChampionship?.organizerId === user?.id;
  const champMatches = matches.filter((m) => m.championshipId === activeChampionship?.id);
  const totalRounds = activeChampionship?.totalRounds ?? 0;
  const format = activeChampionship?.format ?? 'pontos_corridos';
  const isKnockout = format === 'mata_mata';
  const isGroupsAndKnockout = format === 'grupos_e_mata_mata';
  const bracketMatches = useMemo(
    () =>
      champMatches
        .filter((match) => match.bracketRound && match.bracketRound !== 'grupo')
        .sort((a, b) => {
          if (a.round !== b.round) return a.round - b.round;
          return (a.bracketPosition ?? 0) - (b.bracketPosition ?? 0);
        }),
    [champMatches],
  );
  const shouldShowBracket =
    (isKnockout || isGroupsAndKnockout) && bracketMatches.length > 0;
  const bracketColumns = useMemo<BracketColumn[]>(() => {
    const byRound = new Map<number, MatchModel[]>();
    bracketMatches.forEach((match) => {
      const group = byRound.get(match.round) ?? [];
      group.push(match);
      byRound.set(match.round, group);
    });

    return Array.from(byRound.entries())
      .sort(([roundA], [roundB]) => roundA - roundB)
      .map(([round, roundMatches]) => {
        const firstMatch = roundMatches[0];
        const label = firstMatch.bracketRound
          ? getBracketRoundLabel(firstMatch.bracketRound)
          : `Rodada ${round}`;

        return {
          key: `${round}-${label}`,
          label,
          round,
          matches: roundMatches.sort(
            (a, b) => (a.bracketPosition ?? 0) - (b.bracketPosition ?? 0),
          ),
        };
      });
  }, [bracketMatches]);
  const championTeam = useMemo(() => {
    const finalMatch = bracketMatches.find(
      (match) => match.bracketRound === 'final' && match.status === 'finalizado' && match.winnerId,
    );
    if (!finalMatch?.winnerId) return undefined;
    return teams.find((team) => team.id === finalMatch.winnerId);
  }, [bracketMatches, teams]);

  // Para mata-mata, obter as fases únicas do bracket
  const getBracketPhases = (): { round: number; label: string; bracketRound?: BracketRound }[] => {
    if (isKnockout || isGroupsAndKnockout) {
      const uniqueRounds = [...new Set(champMatches.map((m) => m.round))].sort((a, b) => a - b);
      return uniqueRounds.map((round) => {
        const matchOfRound = champMatches.find((m) => m.round === round);
        const bracketRound = matchOfRound?.bracketRound;
        const label = bracketRound ? getBracketRoundLabel(bracketRound) : `Rodada ${round}`;
        return { round, label, bracketRound };
      });
    }
    return Array.from({ length: totalRounds }, (_, i) => ({
      round: i + 1,
      label: `Rodada ${i + 1}`,
    }));
  };

  const roundPhases = getBracketPhases();
  const rounds = roundPhases.map((p) => p.round);

  const isLoading = useChampionshipStore((s) => s.loading);
  const [selectedRound, setSelectedRound] = useState(activeChampionship?.currentRound ?? 1);
  const [refreshing, setRefreshing] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const roundScrollRef = useRef<ScrollView>(null);
  const scheduleSheetRef = useRef<ScheduleMatchBottomSheetRef>(null);
  const pulseAnim = useRef(new RNAnimated.Value(1)).current;

  const currentRound = activeChampionship?.currentRound ?? 1;
  const { hasCurrentUserVoted, winner: roundWinner } = useRoundVoting(
    activeChampionship?.id ?? '',
    currentRound,
  );

  // Só player ATIVO define "meu time" — doc 'sem_time' guarda o teamId antigo.
  const myPlayer = players.find(
    (player) => player.userId === user?.id && isActiveRosterPlayer(player),
  );
  const myTeam =
    user?.role === 'capitao'
      ? teams.find((team) => team.captainId === user.id)
      : myPlayer
        ? teams.find((team) => team.id === myPlayer.teamId)
        : undefined;
  const userTeamId = isOrganizer ? undefined : myTeam?.id;

  const filteredMatches = champMatches.filter((m) => m.round === selectedRound);

  const showVotingBanner =
    !!activeChampionship &&
    activeChampionship.rules.craqueDaRodada &&
    isRoundComplete(champMatches, currentRound) &&
    !hasCurrentUserVoted &&
    !roundWinner;

  useEffect(() => {
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulseAnim, { toValue: 1.4, duration: 800, useNativeDriver: true }),
        RNAnimated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  useEffect(() => {
    roundScrollRef.current?.scrollTo({
      x: Math.max(0, (selectedRound - 1) * 104 - 20),
      animated: true,
    });
  }, [selectedRound]);

  useEffect(() => {
    const parent = navigation.getParent();
    if (!parent) return;
    const unsubscribe = (parent as any).addListener('tabPress', () => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (!user?.id) return;
    registerForPushNotifications(user.id);
  }, [user?.id]);

  const getTeam = (teamId: string) => teams.find((t) => t.id === teamId);

  const renderBracketTeam = (match: MatchModel, teamId: string, label: 'A' | 'B') => {
    const team = teamId ? getTeam(teamId) : undefined;
    const isWinner = !!teamId && match.status === 'finalizado' && match.winnerId === teamId;

    return (
      <View style={[styles.bracketTeamRow, isWinner && styles.bracketTeamWinner]}>
        <Text
          style={[
            styles.bracketTeamName,
            !team && styles.bracketTeamUnknown,
            isWinner && styles.bracketTeamNameWinner,
          ]}
          numberOfLines={1}
        >
          {team?.name ?? '?'}
        </Text>
        {match.status === 'finalizado' ? (
          <Text style={[styles.bracketScore, isWinner && styles.bracketScoreWinner]}>
            {label === 'A' ? match.homeScore ?? '-' : match.awayScore ?? '-'}
          </Text>
        ) : null}
      </View>
    );
  };

  const renderBracket = () => {
    if (!shouldShowBracket) return null;

    return (
      <View style={styles.bracketWrap}>
        <View style={styles.bracketHeader}>
          <Text style={styles.bracketTitle}>Árvore do mata-mata</Text>
          <Text style={styles.bracketSubtitle}>Chaveamento</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.bracketScrollContent}
        >
          {bracketColumns.map((column) => (
            <View key={column.key} style={styles.bracketColumn}>
              <Text style={styles.bracketColumnTitle}>{column.label}</Text>
              <View style={styles.bracketColumnMatches}>
                {column.matches.map((match) => (
                  <Pressable
                    key={match.id}
                    onPress={() => handleMatchPress(match)}
                    style={({ pressed }) => [
                      styles.bracketMatchCard,
                      pressed && styles.bracketMatchCardPressed,
                    ]}
                  >
                    <View style={styles.bracketStatusRow}>
                      <View
                        style={[
                          styles.bracketStatusDot,
                          match.status === 'ao_vivo' && styles.bracketStatusDotLive,
                          match.status === 'finalizado' && styles.bracketStatusDotFinished,
                        ]}
                      />
                      <Text style={styles.bracketStatusText}>{getStatusLabel(match.status)}</Text>
                    </View>
                    {renderBracketTeam(match, match.homeTeamId, 'A')}
                    {renderBracketTeam(match, match.awayTeamId, 'B')}
                  </Pressable>
                ))}
              </View>
            </View>
          ))}

          {championTeam ? (
            <View style={styles.championColumn}>
              <Text style={styles.bracketColumnTitle}>Campeão</Text>
              <View style={styles.championCard}>
                <Ionicons name="trophy" size={18} color={colors.accent} />
                <Text style={styles.championName} numberOfLines={2}>
                  {championTeam.name}
                </Text>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </View>
    );
  };

  const handleOpenSchedule = useCallback((match: MatchModel) => {
    scheduleSheetRef.current?.open(
      match,
      getTeam(match.homeTeamId),
      getTeam(match.awayTeamId),
    );
  }, [teams]);

  const handleMatchScheduled = useCallback((matchId: string, updates: Partial<MatchModel>) => {
    useMatchStore.getState().updateMatch(matchId, updates);
  }, []);

  const onRefresh = useCallback(async () => {
    if (!activeChampionship?.id) {
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    try {
      const champId = activeChampionship.id;
      const [freshMatches, freshTeams, freshPlayers] = await Promise.all([
        getCollection<MatchModel>('matches', [{ field: 'championshipId', operator: '==', value: champId }]),
        getCollection<Team>('teams', [{ field: 'championshipId', operator: '==', value: champId }]),
        getCollection<Player>('players', [{ field: 'championshipId', operator: '==', value: champId }]),
      ]);
      // Merge fresh data into stores
      const prevMatches = useMatchStore.getState().matches.filter((m) => m.championshipId !== champId);
      useMatchStore.getState().setMatches([...prevMatches, ...freshMatches]);
      const prevTeams = useTeamStore.getState().teams.filter((t) => t.championshipId !== champId);
      const prevPlayers = useTeamStore.getState().players.filter((p) => p.championshipId !== champId);
      useTeamStore.getState().setTeams([...prevTeams, ...freshTeams]);
      useTeamStore.setState({ players: [...prevPlayers, ...freshPlayers] });
    } catch (e) {
      console.warn('[FixturesScreen] onRefresh error:', e);
    } finally {
      setRefreshing(false);
    }
  }, [activeChampionship?.id]);

  const handleMatchPress = (match: MatchModel) => {
    const status = match.status;

    if (status === 'finalizado') {
      navigation.navigate('MatchSummary', { matchId: match.id });
      return;
    }

    if (status === 'ao_vivo') {
      navigation.navigate('LiveMatch', { matchId: match.id });
      return;
    }

    if (status === 'agendado') {
      navigation.navigate(isOrganizer ? 'MatchRegistration' : 'PreMatch', { matchId: match.id });
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.emptyContainer} edges={['top']}>
        <View style={styles.skeletonWrap}>
          {[0, 1, 2].map((i) => (
            <SkeletonLoader key={i} width="100%" height={90} borderRadius={16} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  if (!activeChampionship) {
    return (
      <SafeAreaView style={styles.emptyContainer} edges={['top']}>
        <EmptyState
          icon="📅"
          title="Tabela não gerada"
          description="Aguardando o organizador realizar o sorteio para gerar a tabela de confrontos."
        />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.header} edges={['top']}>
        <Text style={styles.title}>
          {isKnockout ? 'Chaveamento' : isGroupsAndKnockout ? 'Fase de Grupos' : 'Confrontos'}
        </Text>
        <ScrollView
          ref={roundScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.roundsContent}
        >
          {roundPhases.map((phase) => {
            const active = phase.round === selectedRound;
            return (
              <Pressable
                key={phase.round}
                onPress={() => setSelectedRound(phase.round)}
                style={[
                  styles.roundChip,
                  active && styles.roundChipActive,
                  active && styles.roundChipScale,
                ]}
              >
                <Text
                  style={[
                    styles.roundChipText,
                    { fontFamily: isBarlowMediumLoaded ? 'Barlow-Medium' : undefined },
                    active && styles.roundChipTextActive,
                    active && {
                      fontFamily: isBarlowSemiBoldLoaded ? 'Barlow-SemiBold' : undefined,
                    },
                  ]}
                >
                  {phase.label}
                </Text>
                {active && <View style={styles.roundUnderline} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      {showVotingBanner && (
        <Pressable
          onPress={() =>
            navigation.navigate('Voting', {
              championshipId: activeChampionship.id,
              round: currentRound,
            })
          }
        >
          <RNAnimated.View
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
            <Text style={styles.votingBannerEmoji}>★</Text>
            <View style={styles.votingBannerBody}>
              <Text style={styles.votingBannerTitle}>
                Votar no Craque da Rodada {currentRound}
              </Text>
              <Text style={styles.votingBannerSub}>Rodada encerrada — vote agora!</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.accent} />
          </RNAnimated.View>
        </Pressable>
      )}

      {renderBracket()}

      <Animated.View
        key={selectedRound}
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(120)}
        style={styles.listWrap}
      >
        <FlatList
          ref={flatListRef}
          data={filteredMatches}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            filteredMatches.length === 0 && styles.listEmptyContent,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
              progressBackgroundColor={colors.bg200}
              title="Atualizando..."
              titleColor={colors.textSecondary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyList}>
              <EmptyState
                icon="📅"
                title="Nenhuma partida"
                description="Ainda não há partidas registradas para esta rodada."
              />
            </View>
          }
          renderItem={({ item: match, index }) => {
            // All matches are now pressable - scheduled matches go to PreMatch for non-organizers
            const isPressable = true;

            return (
              <Animated.View entering={FadeInDown.delay(index * 50).duration(280)}>
                <MatchCard
                  match={match}
                  homeTeam={getTeam(match.homeTeamId)}
                  awayTeam={getTeam(match.awayTeamId)}
                  events={events.filter((event) => event.matchId === match.id)}
                  players={players}
                  userTeamId={userTeamId}
                  canRegister={isOrganizer && match.status === 'agendado'}
                  canSchedule={isOrganizer && match.status === 'agendado'}
                  onSchedulePress={() => handleOpenSchedule(match)}
                  onPress={isPressable ? () => handleMatchPress(match) : undefined}
                />
              </Animated.View>
            );
          }}
        />
      </Animated.View>

      <ScheduleMatchBottomSheet
        ref={scheduleSheetRef}
        userId={user?.id ?? ''}
        onScheduled={handleMatchScheduled}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg100,
    gap: 14,
  },
  header: {
    height: 110,
    backgroundColor: colors.bg200,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 20,
    paddingBottom: 12,
    justifyContent: 'flex-end',
  },
  title: {
    fontFamily: 'Barlow-Bold',
    fontSize: 22,
    color: colors.textPrimary,
    marginBottom: 14,
  },
  roundsContent: {
    gap: 8,
    paddingRight: 20,
  },
  roundChip: {
    position: 'relative',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.bg300,
  },
  roundChipActive: {
    backgroundColor: colors.accent,
  },
  roundChipScale: {
    transform: [{ scale: 1.05 }],
  },
  roundChipText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  roundChipTextActive: {
    color: colors.bg100,
  },
  roundUnderline: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 4,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.bg100,
    opacity: 0.35,
  },
  listWrap: {
    flex: 1,
  },
  bracketWrap: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg100,
    paddingTop: 14,
    paddingBottom: 12,
  },
  bracketHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  bracketTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 16,
    color: colors.textPrimary,
  },
  bracketSubtitle: {
    fontFamily: 'Barlow-Medium',
    fontSize: 12,
    color: colors.textMuted,
  },
  bracketScrollContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  bracketColumn: {
    width: 164,
  },
  championColumn: {
    width: 132,
  },
  bracketColumnTitle: {
    marginBottom: 8,
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  bracketColumnMatches: {
    gap: 10,
  },
  bracketMatchCard: {
    minHeight: 112,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg200,
    padding: 10,
    gap: 8,
  },
  bracketMatchCardPressed: {
    opacity: 0.88,
  },
  bracketStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bracketStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.textMuted,
  },
  bracketStatusDotLive: {
    backgroundColor: colors.neon,
  },
  bracketStatusDotFinished: {
    backgroundColor: colors.success,
  },
  bracketStatusText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  bracketTeamRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderRadius: 8,
    backgroundColor: colors.bg300,
    paddingHorizontal: 8,
  },
  bracketTeamWinner: {
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentGlow,
  },
  bracketTeamName: {
    flex: 1,
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    color: colors.textPrimary,
  },
  bracketTeamUnknown: {
    color: colors.textMuted,
  },
  bracketTeamNameWinner: {
    color: colors.accent,
  },
  bracketScore: {
    minWidth: 18,
    textAlign: 'right',
    fontFamily: 'Barlow-Black',
    fontSize: 14,
    color: colors.textPrimary,
  },
  bracketScoreWinner: {
    color: colors.accent,
  },
  championCard: {
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentGlow,
    padding: 12,
  },
  championName: {
    fontFamily: 'Barlow-Bold',
    fontSize: 13,
    color: colors.accent,
    textAlign: 'center',
  },
  listContent: {
    paddingTop: 16,
    paddingBottom: 28,
  },
  listEmptyContent: {
    flexGrow: 1,
  },
  skeletonWrap: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  emptyList: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  emptyText: {
    fontFamily: 'Barlow-Regular',
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  votingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.accentGlow,
    borderColor: colors.accent,
    gap: 12,
  },
  votingBannerEmoji: {
    fontFamily: 'Barlow-Black',
    fontSize: 24,
    color: colors.accent,
  },
  votingBannerBody: {
    flex: 1,
  },
  votingBannerTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.accent,
  },
  votingBannerSub: {
    marginTop: 2,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
});
