import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AppCard } from '../../components/AppCard';
import { EmptyState } from '../../components/EmptyState';
import { SectionHeader } from '../../components/SectionHeader';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { StatTile } from '../../components/StatTile';
import { TeamLogo } from '../../components/TeamLogo';
import { TAB_NAMES } from '../../navigation/constants';
import { useStats } from '../../hooks/useStats';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useTeamStore } from '../../stores/teamStore';
import { useMatchStore } from '../../stores/matchStore';
import { colors } from '../../theme/colors';
import { PlayerDisciplineRanking, SuspendedPlayer, Team } from '../../types';

type NavProp = NavigationProp<Record<string, object | undefined>>;

function HighlightCard({
  icon,
  label,
  value,
  accent = true,
}: {
  icon: string;
  label: string;
  value: string;
  accent?: boolean;
}) {
  const iconMap: Record<string, React.ComponentProps<typeof StatTile>['icon']> = {
    '🏆': 'trophy-outline',
    '⚽': 'football-outline',
    '📊': 'analytics-outline',
    '🛡️': 'shield-checkmark-outline',
    '⚡': 'flash-outline',
    '🟨': 'albums-outline',
  };

  return (
    <StatTile
      icon={iconMap[icon]}
      label={label}
      value={value}
      compact
      highlight={accent}
      style={styles.highlightCard}
    />
  );
}

function SuspendedRow({
  item,
  onPress,
}: {
  item: SuspendedPlayer;
  onPress: () => void;
}) {
  const isRed = item.reason === 'cartao_vermelho';

  return (
    <TouchableOpacity style={styles.suspendedRow} activeOpacity={0.82} onPress={onPress}>
      <View style={styles.suspendedAvatar}>
        <Text style={styles.suspendedAvatarText}>
          {item.playerName.slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View style={styles.suspendedCopy}>
        <Text style={styles.suspendedName}>{item.playerName}</Text>
        <Text style={styles.suspendedTeam}>{item.teamName}</Text>
      </View>
      <Text style={[styles.suspendedReason, isRed ? styles.reasonDanger : styles.reasonWarning]}>
        {isRed ? 'Cartao vermelho' : '3 amarelos'}
      </Text>
    </TouchableOpacity>
  );
}

function DisciplineRow({
  item,
  team,
  onPress,
}: {
  item: PlayerDisciplineRanking;
  team?: Team;
  onPress: () => void;
}) {
  return (
    <AppCard style={styles.disciplineCard} onPress={onPress}>
      <View style={styles.disciplineMain}>
        {team ? (
          <TeamLogo team={team} size={36} />
        ) : (
          <View style={[styles.disciplineFallbackLogo, { backgroundColor: `${item.teamColor}22` }]}>
            <Text style={[styles.disciplineFallbackText, { color: item.teamColor }]}>
              {(item.teamName[0] ?? '?').toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.disciplineCopy}>
          <Text style={styles.disciplineName} numberOfLines={1}>{item.playerName}</Text>
          <Text style={styles.disciplineTeam} numberOfLines={1}>
            {item.teamName || 'Time nao informado'}
          </Text>
        </View>
      </View>

      <View style={styles.disciplineStats}>
        <View style={[styles.cardBadge, styles.yellowBadge]}>
          <Text style={styles.cardBadgeLabel}>A</Text>
          <Text style={styles.cardBadgeValue}>{item.yellowCards}</Text>
        </View>
        <View style={[styles.cardBadge, styles.redBadge]}>
          <Text style={styles.cardBadgeLabel}>V</Text>
          <Text style={styles.cardBadgeValue}>{item.redCards}</Text>
        </View>
      </View>
    </AppCard>
  );
}

function StatsSkeletonView() {
  return (
    <>
      <View style={styles.grid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <AppCard key={i} style={styles.highlightCard}>
            <SkeletonLoader width={28} height={28} borderRadius={8} variant="shimmer" />
            <SkeletonLoader width="70%" height={22} variant="shimmer" />
            <SkeletonLoader width="50%" height={10} variant="shimmer" />
          </AppCard>
        ))}
      </View>

      <AppCard style={styles.roundLeaderCard}>
        <SkeletonLoader width="40%" height={10} variant="shimmer" />
        <View style={styles.skeletonLeaderRow}>
          <SkeletonLoader width="55%" height={22} variant="shimmer" />
          <SkeletonLoader width={48} height={24} variant="shimmer" />
        </View>
      </AppCard>

      <View style={styles.disciplineSection}>
        <SkeletonLoader width={110} height={14} variant="shimmer" />
        <View style={styles.disciplineList}>
          {Array.from({ length: 3 }).map((_, i) => (
            <AppCard key={i} style={styles.disciplineCard}>
              <View style={styles.disciplineMain}>
                <SkeletonLoader width={36} height={36} borderRadius={18} variant="shimmer" />
                <View style={styles.disciplineCopy}>
                  <SkeletonLoader width="70%" height={14} variant="shimmer" />
                  <View style={styles.skeletonSpacer} />
                  <SkeletonLoader width="45%" height={12} variant="shimmer" />
                </View>
              </View>
              <View style={styles.disciplineStats}>
                <SkeletonLoader width={44} height={36} borderRadius={8} variant="shimmer" />
                <SkeletonLoader width={44} height={36} borderRadius={8} variant="shimmer" />
              </View>
            </AppCard>
          ))}
        </View>
      </View>
    </>
  );
}

export function StatsOverviewScreen() {
  const navigation = useNavigation<NavProp>();
  const champId = useChampionshipStore((s) => s.selectedChampionshipId) ?? '';
  const championshipsLoading = useChampionshipStore((s) => s.loading);
  const teamsLoading = useTeamStore((s) => s.loading);
  const matchesLoading = useMatchStore((s) => s.loading);
  const { players, teams } = useTeamStore();
  const {
    standings,
    disciplineRanking,
    bestAttack,
    bestDefense,
    roundMVP,
    suspendedPlayers,
    totalGoals,
    finishedCount,
    currentRound,
  } = useStats(champId);

  const leader = standings[0];
  const avgGoals = finishedCount > 0 ? (totalGoals / finishedCount).toFixed(1) : '0.0';
  const totalYellowCards = standings.reduce((sum, standing) => sum + standing.yellowCards, 0);

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

  // Loading real dos stores: começa true e vira false após a 1ª hidratação
  // (snapshot/seed). Campeonato sem partidas NÃO é loading — apenas dados zerados.
  const showSkeleton = championshipsLoading || teamsLoading || matchesLoading;

  if (showSkeleton) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <StatsSkeletonView />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          <HighlightCard icon="🏆" label="Lider" value={leader?.teamName ?? '—'} accent={false} />
          <HighlightCard icon="⚽" label="Gols totais" value={String(totalGoals)} />
          <HighlightCard icon="📊" label="Media/jogo" value={avgGoals} />
          <HighlightCard icon="🛡️" label="Melhor defesa" value={bestDefense?.teamName ?? '—'} accent={false} />
          <HighlightCard icon="⚡" label="Melhor ataque" value={bestAttack?.teamName ?? '—'} accent={false} />
          <HighlightCard icon="🟨" label="Cartoes" value={String(totalYellowCards)} />
        </View>

        <AppCard variant="accent" style={styles.roundLeaderCard}>
          <Text style={styles.roundLeaderEyebrow}>TIME DA RODADA</Text>
          <View style={styles.roundLeaderRow}>
            <View style={styles.roundLeaderCopy}>
              <Text style={styles.roundLeaderName}>{roundMVP?.teamName ?? '—'}</Text>
              <Text style={styles.roundLeaderSub}>Rodada {currentRound}</Text>
            </View>
            <Text style={styles.roundLeaderPoints}>{roundMVP?.points ?? 0} pts</Text>
          </View>
        </AppCard>

        <View style={styles.disciplineSection}>
          <SectionHeader title="DISCIPLINA" />
          {disciplineRanking.length > 0 ? (
            <View style={styles.disciplineList}>
              {disciplineRanking.map((player, index) => (
                <Animated.View
                  key={player.playerId}
                  entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(260)}
                >
                  <DisciplineRow
                    item={player}
                    team={teams.find((team) => team.id === player.teamId)}
                    onPress={() => openAthlete(player.playerId)}
                  />
                </Animated.View>
              ))}
            </View>
          ) : (
            <AppCard style={styles.disciplineEmptyCard}>
              <EmptyState
                icon="shield-outline"
                title="Nenhum cartao registrado"
                description="Os rankings de disciplina aparecem aqui quando amarelos ou vermelhos forem lancados nas partidas."
              />
            </AppCard>
          )}
        </View>

        {suspendedPlayers.length > 0 && (
          <View style={styles.suspendedSection}>
            <View style={styles.suspendedHeaderWrap}>
              <SectionHeader title="SUSPENSOS NA PROXIMA RODADA" />
            </View>
            <View style={styles.suspendedList}>
              {suspendedPlayers.map((player) => (
                <SuspendedRow
                  key={player.playerId}
                  item={player}
                  onPress={() => openAthlete(player.playerId)}
                />
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  content: {
    padding: 20,
    paddingBottom: 28,
    gap: 18,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  highlightCard: {
    width: '47.5%',
    height: 100,
    padding: 16,
    justifyContent: 'space-between',
  },
  highlightIcon: {
    fontSize: 28,
  },
  highlightValue: {
    fontFamily: 'Barlow-Black',
    fontSize: 24,
    color: colors.accent,
    lineHeight: 26,
  },
  highlightValueText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 18,
    color: colors.textPrimary,
  },
  highlightLabel: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  roundLeaderCard: {
    width: '100%',
    padding: 18,
    backgroundColor: colors.accentGlow,
  },
  roundLeaderEyebrow: {
    fontFamily: 'Barlow-Bold',
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.accent,
  },
  roundLeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  roundLeaderCopy: {
    flex: 1,
  },
  roundLeaderName: {
    fontFamily: 'Barlow-Bold',
    fontSize: 22,
    color: colors.textPrimary,
  },
  roundLeaderSub: {
    marginTop: 2,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  roundLeaderPoints: {
    fontFamily: 'Barlow-Black',
    fontSize: 28,
    color: colors.accent,
  },
  disciplineSection: {
    width: '100%',
    gap: 10,
  },
  skeletonLeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  skeletonSpacer: {
    height: 6,
  },
  disciplineList: {
    gap: 10,
  },
  disciplineCard: {
    minHeight: 72,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  disciplineMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  disciplineFallbackLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disciplineFallbackText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 13,
  },
  disciplineCopy: {
    flex: 1,
    minWidth: 0,
  },
  disciplineName: {
    fontFamily: 'Barlow-Bold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  disciplineTeam: {
    marginTop: 2,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  disciplineStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardBadge: {
    minWidth: 44,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  yellowBadge: {
    backgroundColor: 'rgba(245,166,35,0.12)',
    borderColor: 'rgba(245,166,35,0.3)',
  },
  redBadge: {
    backgroundColor: 'rgba(255,59,71,0.12)',
    borderColor: 'rgba(255,59,71,0.3)',
  },
  cardBadgeLabel: {
    fontFamily: 'Barlow-Bold',
    fontSize: 10,
    color: colors.textSecondary,
  },
  cardBadgeValue: {
    marginTop: 1,
    fontFamily: 'Barlow-Black',
    fontSize: 16,
    color: colors.textPrimary,
  },
  disciplineEmptyCard: {
    minHeight: 190,
    justifyContent: 'center',
  },
  suspendedSection: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: 'rgba(255,184,0,0.08)',
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.14)',
    overflow: 'hidden',
  },
  suspendedHeaderWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  suspendedList: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  suspendedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  suspendedAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg300,
  },
  suspendedAvatarText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  suspendedCopy: {
    flex: 1,
  },
  suspendedName: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  suspendedTeam: {
    marginTop: 2,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  suspendedReason: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
  },
  reasonDanger: {
    color: colors.danger,
  },
  reasonWarning: {
    color: colors.warning,
  },
});
