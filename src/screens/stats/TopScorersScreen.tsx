import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { TeamColorDot } from '../../components/TeamColorDot';
import { EmptyState } from '../../components/EmptyState';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { TAB_NAMES } from '../../navigation/constants';
import { useStats } from '../../hooks/useStats';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useTeamStore } from '../../stores/teamStore';
import { colors } from '../../theme/colors';
import { PlayerScorer } from '../../types';

type NavProp = NavigationProp<Record<string, object | undefined>>;

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

type RankedGroup = {
  rank: number;
  goals: number;
  players: PlayerScorer[];
};

function PositionBadge({ rank }: { rank: number }) {
  if (rank === 2) return <Text style={styles.medal}>🥈</Text>;
  if (rank === 3) return <Text style={styles.medal}>🥉</Text>;

  return (
    <View style={styles.positionBadge}>
      <Text style={styles.positionText}>{rank}</Text>
    </View>
  );
}

function ScorerGroupRow({
  group,
  getPhoto,
  onOpenAthlete,
}: {
  group: RankedGroup;
  getPhoto: (playerId: string) => string | undefined;
  onOpenAthlete: (playerId: string) => void;
}) {
  return (
    <View style={styles.groupRow}>
      <PositionBadge rank={group.rank} />
      <View style={styles.groupPlayers}>
        {group.players.map((player) => {
          const photoUrl = getPhoto(player.playerId);
          return (
            <TouchableOpacity
              key={player.playerId}
              style={styles.playerRow}
              activeOpacity={0.82}
              onPress={() => onOpenAthlete(player.playerId)}
            >
              <View style={[styles.avatar, { borderColor: `${player.teamColor}66` }]}>
                <Text style={styles.avatarText}>
                  {photoUrl ? '' : getInitials(player.playerName)}
                </Text>
              </View>
              <View style={styles.playerCopy}>
                <Text style={styles.playerName} numberOfLines={1}>{player.playerName}</Text>
                <Text style={styles.teamName} numberOfLines={1}>{player.teamName}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.goalsCol}>
        <Text style={styles.goalsValue}>{group.goals}</Text>
        <Ionicons name="football-outline" size={13} color={colors.textSecondary} style={styles.goalsIcon} />
      </View>
    </View>
  );
}

export function TopScorersScreen() {
  const navigation = useNavigation<NavProp>();
  const allChampionships = useChampionshipStore((s) => s.championships);
  const isLoading = useChampionshipStore((s) => s.loading);
  const activeChampionship =
    allChampionships.find((c) => c.status === 'em_andamento') ??
    allChampionships.find((c) => c.status === 'inscricoes_abertas') ??
    allChampionships[0];
  const champId = activeChampionship?.id ?? '';
  const { topScorers, totalGoals } = useStats(champId);
  const players = useTeamStore((s) => s.players);

  const grouped = useMemo<RankedGroup[]>(() => {
    const groups: RankedGroup[] = [];
    let previousGoals: number | null = null;
    let currentRank = 0;

    topScorers.forEach((player, index) => {
      if (player.goals !== previousGoals) {
        currentRank = index + 1;
        groups.push({
          rank: currentRank,
          goals: player.goals,
          players: [player],
        });
        previousGoals = player.goals;
      } else {
        groups[groups.length - 1].players.push(player);
      }
    });

    return groups;
  }, [topScorers]);

  const leader = grouped[0]?.players[0];

  const getPhoto = (playerId: string) =>
    players.find((player) => player.id === playerId)?.photoUrl;

  const openAthlete = (playerId: string) => {
    const player = players.find((item) => item.id === playerId);
    if (!player?.userId) return;
    navigation.navigate(TAB_NAMES.PERFIL, {
      screen: 'AthleteProfile',
      params: {
        userId: player.userId,
        championshipId: champId,
      },
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Artilheiros</Text>
        </View>
        <View style={styles.skeletonWrap}>
          <SkeletonLoader width="100%" height={140} borderRadius={18} />
          {[0, 1, 2].map((i) => (
            <SkeletonLoader key={i} width="100%" height={64} borderRadius={0} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Artilheiros</Text>
        <View style={styles.totalBadge}>
          <Ionicons name="football" size={13} color={colors.accent} />
          <Text style={styles.totalBadgeText}>{totalGoals} gols</Text>
        </View>
      </View>

      {leader && (
        <LinearGradient
          colors={[colors.bg300, colors.bg200]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroAccent} />
          <Text style={styles.crown}>👑</Text>
          <View style={styles.heroRow}>
            <View style={[styles.heroAvatar, { borderColor: colors.accent }]}>
              <Text style={styles.heroAvatarText}>{getInitials(leader.playerName)}</Text>
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>#1 ARTILHEIRO</Text>
              <TouchableOpacity activeOpacity={0.82} onPress={() => openAthlete(leader.playerId)}>
                <Text style={styles.heroName} numberOfLines={2}>{leader.playerName}</Text>
              </TouchableOpacity>
              <View style={styles.heroTeamRow}>
                <TeamColorDot color={leader.teamColor} size={10} />
                <Text style={styles.heroTeam}>{leader.teamName}</Text>
              </View>
              <View style={styles.heroGoalsRow}>
                <Text style={styles.heroGoals}>{leader.goals}</Text>
                <Text style={styles.heroGoalsLabel}>gols</Text>
              </View>
            </View>
          </View>
        </LinearGradient>
      )}

      <FlatList
        data={grouped.slice(1)}
        keyExtractor={(item) => `${item.rank}-${item.goals}`}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(260)}>
            <ScorerGroupRow group={item} getPhoto={getPhoto} onOpenAthlete={openAthlete} />
          </Animated.View>
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !leader ? (
            <View style={styles.empty}>
              <EmptyState
                icon="⚽"
                title="Nenhum gol marcado ainda"
                description="Os artilheiros aparecerão aqui conforme os gols forem registrados nas partidas."
              />
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: colors.bg200,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontFamily: 'Barlow-Bold',
    fontSize: 22,
    color: colors.textPrimary,
  },
  totalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.accentGlow,
  },
  totalBadgeText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    color: colors.accent,
  },
  heroCard: {
    height: 140,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  heroAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: colors.accent,
  },
  crown: {
    position: 'absolute',
    top: 12,
    right: 14,
    fontSize: 22,
  },
  heroRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  heroAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg200,
  },
  heroAvatarText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 24,
    color: colors.textPrimary,
  },
  heroCopy: {
    flex: 1,
  },
  heroEyebrow: {
    fontFamily: 'Barlow-Bold',
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.accent,
    textTransform: 'uppercase',
  },
  heroName: {
    marginTop: 4,
    fontFamily: 'Barlow-Bold',
    fontSize: 24,
    lineHeight: 26,
    color: colors.textPrimary,
  },
  heroTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  heroTeam: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textSecondary,
  },
  heroGoalsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginTop: 6,
  },
  heroGoals: {
    fontFamily: 'Barlow-Black',
    fontSize: 42,
    lineHeight: 42,
    color: colors.accent,
  },
  heroGoalsLabel: {
    marginBottom: 6,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  listContent: {
    paddingBottom: 24,
  },
  groupRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg200,
  },
  medal: {
    width: 28,
    textAlign: 'center',
    fontSize: 20,
  },
  positionBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg300,
  },
  positionText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  groupPlayers: {
    flex: 1,
    gap: 8,
    paddingVertical: 10,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg300,
    borderWidth: 1,
  },
  avatarText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  playerCopy: {
    flex: 1,
    minWidth: 0,
  },
  playerName: {
    fontFamily: 'Barlow-Bold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  teamName: {
    marginTop: 2,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  goalsCol: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  goalsValue: {
    fontFamily: 'Barlow-Black',
    fontSize: 24,
    color: colors.accent,
  },
  goalsIcon: {
    marginBottom: 4,
  },
  empty: {
    flex: 1,
    minHeight: 300,
  },
  emptyText: {
    fontFamily: 'Barlow-Regular',
    fontSize: 14,
    color: colors.textSecondary,
  },
  skeletonWrap: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 8,
  },
});
