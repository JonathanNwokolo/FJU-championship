import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { captureRef } from 'react-native-view-shot';
import { PodiumCard } from '../../components/PodiumCard';
import { TeamColorDot } from '../../components/TeamColorDot';
import { EmptyState } from '../../components/EmptyState';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { useStats } from '../../hooks/useStats';
import { useAuthStore } from '../../stores/authStore';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useMatchStore } from '../../stores/matchStore';
import { useTeamStore } from '../../stores/teamStore';
import { colors, shadows } from '../../theme/colors';
import { MatchModel, TeamStanding } from '../../types';

const W = {
  pos: 28,
  pts: 32,
  num: 28,
  sg: 36,
};

type FormResult = 'V' | 'E' | 'D';

function TableHeader() {
  return (
    <View style={styles.tableHeader}>
      <Text style={[styles.th, { width: W.pos }]}>#</Text>
      <Text style={[styles.th, styles.thTeam]}>TIME</Text>
      <Text style={[styles.th, { width: W.pts }]}>P</Text>
      <Text style={[styles.th, { width: W.num }]}>J</Text>
      <Text style={[styles.th, { width: W.num }]}>V</Text>
      <Text style={[styles.th, { width: W.num }]}>E</Text>
      <Text style={[styles.th, { width: W.num }]}>D</Text>
      <Text style={[styles.th, { width: W.sg }]}>SG</Text>
    </View>
  );
}

function getPositionStyle(position: number) {
  if (position === 1) return styles.posFirst;
  if (position === 2) return styles.posSecond;
  if (position === 3) return styles.posThird;
  return null;
}

function getGoalDiffColor(value: number) {
  if (value > 0) return colors.success;
  if (value < 0) return colors.danger;
  return colors.textSecondary;
}

function getMatchResult(match: MatchModel, teamId: string): FormResult {
  const homeScore = match.homeScore ?? 0;
  const awayScore = match.awayScore ?? 0;
  if (homeScore === awayScore) return 'E';

  const won =
    (match.homeTeamId === teamId && homeScore > awayScore) ||
    (match.awayTeamId === teamId && awayScore > homeScore);
  return won ? 'V' : 'D';
}

function getTeamForm(matches: MatchModel[], teamId: string) {
  return matches
    .filter(
      (match) =>
        match.status === 'finalizado' &&
        (match.homeTeamId === teamId || match.awayTeamId === teamId),
    )
    .slice()
    .sort((a, b) => b.round - a.round)
    .slice(0, 5)
    .map((match) => getMatchResult(match, teamId));
}

function FormDots({ form }: { form: FormResult[] }) {
  return (
    <View style={styles.formDots}>
      {form.map((result, index) => (
        <View
          key={`${result}-${index}`}
          style={[
            styles.formDot,
            result === 'V' && styles.formWin,
            result === 'E' && styles.formDraw,
            result === 'D' && styles.formLoss,
          ]}
        >
          <Text style={styles.formText}>{result}</Text>
        </View>
      ))}
    </View>
  );
}

function StandingRow({
  item,
  index,
  isUserTeam,
  expanded,
  onPress,
  form,
}: {
  item: TeamStanding;
  index: number;
  isUserTeam: boolean;
  expanded: boolean;
  onPress: () => void;
  form: FormResult[];
}) {
  const position = index + 1;
  const goalDiff = item.goalDifference;
  const goalDiffText = goalDiff > 0 ? `+${goalDiff}` : `${goalDiff}`;
  const rowBg = index % 2 === 0 ? colors.bg200 : colors.bg100;

  return (
    <TouchableOpacity activeOpacity={0.82} onPress={onPress}>
      <View
        style={[
          styles.row,
          { backgroundColor: rowBg },
          isUserTeam && styles.userTeamRow,
        ]}
      >
        <View style={[styles.posCell, { width: W.pos }]}>
          {position <= 3 ? (
            <View style={[styles.posBadge, getPositionStyle(position)]}>
              <Text style={[styles.posBadgeText, position === 1 && styles.posFirstText]}>
                {position}
              </Text>
            </View>
          ) : (
            <Text style={styles.posText}>{position}</Text>
          )}
        </View>

        <View style={styles.teamCell}>
          <TeamColorDot color={item.primaryColor} size={10} />
          <Text style={styles.teamName} numberOfLines={1}>{item.teamName}</Text>
          {isUserTeam && <Text style={styles.userArrow}>›</Text>}
        </View>

        <Text style={[styles.pointsCell, { width: W.pts }]}>{item.points}</Text>
        <Text style={[styles.numCell, { width: W.num }]}>{item.played}</Text>
        <Text style={[styles.numCell, { width: W.num }]}>{item.won}</Text>
        <Text style={[styles.numCell, { width: W.num }]}>{item.drawn}</Text>
        <Text style={[styles.numCell, { width: W.num }]}>{item.lost}</Text>
        <Text style={[styles.sgCell, { width: W.sg, color: getGoalDiffColor(goalDiff) }]}>
          {goalDiffText}
        </Text>
      </View>
      {expanded && (
        <Animated.View entering={FadeIn.duration(180)} style={styles.expandedRow}>
          <Text style={styles.formLabel}>Últimas 5</Text>
          <FormDots form={form} />
        </Animated.View>
      )}
    </TouchableOpacity>
  );
}

export function StandingsScreen() {
  const navigation = useNavigation();
  const allChampionships = useChampionshipStore((s) => s.championships);
  const isLoading = useChampionshipStore((s) => s.loading);
  const activeChampionship =
    allChampionships.find((c) => c.status === 'em_andamento') ??
    allChampionships.find((c) => c.status === 'inscricoes_abertas') ??
    allChampionships[0];
  const champId = activeChampionship?.id ?? '';
  const { standings, championshipName } = useStats(champId);
  const matches = useMatchStore((s) => s.matches);
  const teams = useTeamStore((s) => s.teams);
  const players = useTeamStore((s) => s.players);
  const user = useAuthStore((s) => s.user);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const tableRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const handleShare = useCallback(async () => {
    if (!tableRef.current) return;
    setSharing(true);
    try {
      const uri = await captureRef(tableRef, { format: 'png', quality: 1.0 });
      const dest = `${FileSystem.cacheDirectory}standings-${champId}.png`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      await Sharing.shareAsync(dest, {
        mimeType: 'image/png',
        dialogTitle: 'Compartilhar classificação',
      });
    } catch (e) {
      console.warn('Share failed', e);
    } finally {
      setSharing(false);
    }
  }, [champId]);

  useEffect(() => {
    const parent = (navigation as any).getParent?.();
    if (!parent) return;
    const unsubscribe = parent.addListener('tabPress', () => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return unsubscribe;
  }, [navigation]);

  const myPlayer = players.find((player) => player.userId === user?.id);
  const myTeam =
    user?.role === 'capitao'
      ? teams.find((team) => team.captainId === user.id)
      : myPlayer
        ? teams.find((team) => team.id === myPlayer.teamId)
        : undefined;

  const podium = useMemo(() => standings.slice(0, 3), [standings]);

  const formByTeam = useMemo(() => {
    const result: Record<string, FormResult[]> = {};
    for (const standing of standings) {
      result[standing.teamId] = getTeamForm(matches, standing.teamId);
    }
    return result;
  }, [matches, standings]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Classificação</Text>
        </View>
        <View style={styles.skeletonWrap}>
          <SkeletonLoader width="100%" height={120} borderRadius={16} />
          {[0, 1, 2, 3, 4].map((i) => (
            <SkeletonLoader key={i} width="100%" height={52} borderRadius={0} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Classificação</Text>
          <TouchableOpacity
            style={styles.shareBtn}
            onPress={handleShare}
            disabled={sharing || standings.length === 0}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {sharing ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="share-outline" size={22} color={colors.textPrimary} />
            )}
          </TouchableOpacity>
        </View>
        {!!championshipName && (
          <Text style={styles.subtitle} numberOfLines={1}>{championshipName}</Text>
        )}
      </View>

      <FlatList
        ref={flatListRef}
        data={standings}
        keyExtractor={(item) => item.teamId}
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
        ListHeaderComponent={
          <>
            <View style={styles.podiumWrap}>
              <View style={styles.podiumRow}>
                <View style={styles.podiumSide}>
                  <PodiumCard place={2} standing={podium[1]} />
                </View>
                <View style={styles.podiumCenter}>
                  <PodiumCard place={1} standing={podium[0]} />
                </View>
                <View style={styles.podiumSide}>
                  <PodiumCard place={3} standing={podium[2]} />
                </View>
              </View>
            </View>
            <TableHeader />
          </>
        }
        renderItem={({ item, index }) => (
          <StandingRow
            item={item}
            index={index}
            isUserTeam={myTeam?.id === item.teamId}
            expanded={expandedTeamId === item.teamId}
            onPress={() =>
              setExpandedTeamId((current) => (current === item.teamId ? null : item.teamId))
            }
            form={formByTeam[item.teamId] ?? []}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="🏆"
            title="Classificação indisponível"
            description="Nenhum campeonato ativo encontrado. Aguarde o organizador iniciar o campeonato."
          />
        }
        ListFooterComponent={
          standings.length > 0 ? (
            <Text style={styles.legend}>
              P: Pontos · J: Jogos · V: Vitórias · E: Empates · D: Derrotas · SG: Saldo de gols
            </Text>
          ) : null
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />

      {/* Hidden shareable table for capture */}
      <View
        ref={tableRef}
        collapsable={false}
        style={styles.shareableTable}
      >
        <View style={styles.shareableHeader}>
          <Text style={styles.shareableChampName}>🏆 {championshipName || 'Classificação'}</Text>
          <Text style={styles.shareableSubtitle}>FJU Championship</Text>
        </View>
        <View style={styles.shareableTableHeader}>
          <Text style={[styles.shareTh, { width: W.pos }]}>#</Text>
          <Text style={[styles.shareTh, styles.shareThTeam]}>TIME</Text>
          <Text style={[styles.shareTh, { width: W.pts }]}>P</Text>
          <Text style={[styles.shareTh, { width: W.num }]}>J</Text>
          <Text style={[styles.shareTh, { width: W.num }]}>V</Text>
          <Text style={[styles.shareTh, { width: W.num }]}>E</Text>
          <Text style={[styles.shareTh, { width: W.num }]}>D</Text>
          <Text style={[styles.shareTh, { width: W.sg }]}>SG</Text>
        </View>
        {standings.map((item, index) => {
          const position = index + 1;
          const goalDiff = item.goalDifference;
          const goalDiffText = goalDiff > 0 ? `+${goalDiff}` : `${goalDiff}`;
          const rowBg = index % 2 === 0 ? colors.bg200 : colors.bg100;
          return (
            <View
              key={item.teamId}
              style={[styles.shareRow, { backgroundColor: rowBg }]}
            >
              <View style={[styles.sharePosCell, { width: W.pos }]}>
                {position <= 3 ? (
                  <View style={[
                    styles.sharePosBadge,
                    position === 1 && styles.sharePosFirst,
                    position === 2 && styles.sharePosSecond,
                    position === 3 && styles.sharePosThird,
                  ]}>
                    <Text style={[
                      styles.sharePosBadgeText,
                      position === 1 && { color: colors.bg100 },
                    ]}>{position}</Text>
                  </View>
                ) : (
                  <Text style={styles.sharePosText}>{position}</Text>
                )}
              </View>
              <View style={styles.shareTeamCell}>
                <View style={[styles.shareColorDot, { backgroundColor: item.primaryColor }]} />
                <Text style={styles.shareTeamName} numberOfLines={1}>{item.teamName}</Text>
              </View>
              <Text style={[styles.sharePointsCell, { width: W.pts }]}>{item.points}</Text>
              <Text style={[styles.shareNumCell, { width: W.num }]}>{item.played}</Text>
              <Text style={[styles.shareNumCell, { width: W.num }]}>{item.won}</Text>
              <Text style={[styles.shareNumCell, { width: W.num }]}>{item.drawn}</Text>
              <Text style={[styles.shareNumCell, { width: W.num }]}>{item.lost}</Text>
              <Text style={[
                styles.shareSgCell,
                { width: W.sg, color: getGoalDiffColor(goalDiff) },
              ]}>{goalDiffText}</Text>
            </View>
          );
        })}
        <Text style={styles.shareableWatermark}>FJU Championship App</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  header: {
    backgroundColor: colors.bg200,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shareBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Barlow-Bold',
    fontSize: 22,
    color: colors.textPrimary,
  },
  subtitle: {
    marginTop: 4,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.accent,
  },
  listContent: {
    paddingBottom: 28,
  },
  podiumWrap: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
  },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  podiumSide: {
    flex: 1,
  },
  podiumCenter: {
    flex: 1.18,
  },
  tableHeader: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg300,
    paddingHorizontal: 8,
  },
  th: {
    fontFamily: 'Barlow-Bold',
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.textMuted,
    textAlign: 'center',
  },
  thTeam: {
    flex: 1,
    textAlign: 'left',
    paddingLeft: 8,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  userTeamRow: {
    backgroundColor: colors.accentGlow,
  },
  posCell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  posBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posFirst: {
    backgroundColor: colors.accent,
    ...shadows.shadowGlow,
  },
  posSecond: {
    backgroundColor: colors.bg300,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  posThird: {
    backgroundColor: colors.bg300,
  },
  posBadgeText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 13,
    color: colors.textPrimary,
  },
  posFirstText: {
    color: colors.bg100,
  },
  posText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.textSecondary,
  },
  teamCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minWidth: 0,
  },
  teamName: {
    flex: 1,
    fontFamily: 'Barlow-SemiBold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  userArrow: {
    fontFamily: 'Barlow-Bold',
    fontSize: 18,
    color: colors.accent,
    paddingRight: 2,
  },
  pointsCell: {
    fontFamily: 'Barlow-Black',
    fontSize: 16,
    color: colors.accent,
    textAlign: 'center',
  },
  numCell: {
    fontFamily: 'Barlow-Medium',
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  sgCell: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    textAlign: 'center',
  },
  expandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 56,
    paddingVertical: 10,
    backgroundColor: colors.bg200,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  formLabel: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  formDots: {
    flexDirection: 'row',
    gap: 6,
  },
  formDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formWin: {
    backgroundColor: colors.success,
  },
  formDraw: {
    backgroundColor: colors.warning,
  },
  formLoss: {
    backgroundColor: colors.danger,
  },
  formText: {
    display: 'none',
  },
  legend: {
    marginTop: 16,
    paddingHorizontal: 24,
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
  skeletonWrap: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 8,
  },
  // Shareable Table Styles
  shareableTable: {
    position: 'absolute',
    left: -9999,
    top: 0,
    width: 400,
    backgroundColor: colors.bg100,
    borderRadius: 16,
    overflow: 'hidden',
    paddingBottom: 16,
  },
  shareableHeader: {
    backgroundColor: colors.bg200,
    padding: 16,
    alignItems: 'center',
  },
  shareableChampName: {
    fontFamily: 'Barlow-Bold',
    fontSize: 18,
    color: colors.textPrimary,
  },
  shareableSubtitle: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.accent,
    marginTop: 4,
  },
  shareableTableHeader: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg300,
    paddingHorizontal: 8,
  },
  shareTh: {
    fontFamily: 'Barlow-Bold',
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.textMuted,
    textAlign: 'center',
  },
  shareThTeam: {
    flex: 1,
    textAlign: 'left',
    paddingLeft: 8,
  },
  shareRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sharePosCell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharePosBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg300,
  },
  sharePosFirst: {
    backgroundColor: colors.accent,
  },
  sharePosSecond: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  sharePosThird: {
    backgroundColor: colors.bg300,
  },
  sharePosBadgeText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 12,
    color: colors.textPrimary,
  },
  sharePosText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 12,
    color: colors.textSecondary,
  },
  shareTeamCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  shareColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  shareTeamName: {
    flex: 1,
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    color: colors.textPrimary,
  },
  sharePointsCell: {
    fontFamily: 'Barlow-Black',
    fontSize: 14,
    color: colors.accent,
    textAlign: 'center',
  },
  shareNumCell: {
    fontFamily: 'Barlow-Medium',
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  shareSgCell: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    textAlign: 'center',
  },
  shareableWatermark: {
    marginTop: 12,
    fontFamily: 'Barlow-Regular',
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
