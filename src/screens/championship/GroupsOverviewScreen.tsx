import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useTeamStore } from '../../stores/teamStore';
import { useMatchStore } from '../../stores/matchStore';
import { EmptyState } from '../../components/EmptyState';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { TeamColorDot } from '../../components/TeamColorDot';
import { colors } from '../../theme/colors';
import { GroupStandingRow } from '../../types';
import { FixturesStackParamList } from '../../navigation/FixturesStackNavigator';
import { calculateAllStandings } from '../../utils/groupStageTransition';
import {
  getQualifiedStatusLabel,
  getTiebreakReasonLabel,
  isNotableTiebreak,
  summarizeGroupStageDashboard,
  describeStandingRowForAccessibility,
  SupportedGroupId,
} from '../../utils/groupStagePresentation';

type NavT = NavigationProp<FixturesStackParamList>;
type RouteT = RouteProp<FixturesStackParamList, 'GroupsOverview'>;

const GROUP_LABELS: Record<SupportedGroupId, string> = { A: 'Grupo A', B: 'Grupo B' };

function StatusChip({ row }: { row: GroupStandingRow }) {
  const label = getQualifiedStatusLabel(row.qualifiedStatus);
  const style =
    row.qualifiedStatus === 'qualified'
      ? styles.chipQualified
      : row.qualifiedStatus === 'not_qualified'
        ? styles.chipEliminated
        : styles.chipUndecided;
  return (
    <View style={[styles.chip, style]}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

function StandingsTable({
  groupId,
  rows,
  qualifiersPerGroup,
}: {
  groupId: SupportedGroupId;
  rows: GroupStandingRow[];
  qualifiersPerGroup: number;
}) {
  return (
    <View style={styles.groupCard}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupTitle}>{GROUP_LABELS[groupId]}</Text>
        <Text style={styles.groupHint}>{qualifiersPerGroup} classificam</Text>
      </View>

      {/* Header row */}
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.thPos]}>#</Text>
        <Text style={[styles.thTeam]}>Time</Text>
        <Text style={styles.thStat}>P</Text>
        <Text style={styles.thStat}>J</Text>
        <Text style={styles.thStat}>V</Text>
        <Text style={styles.thStat}>E</Text>
        <Text style={styles.thStat}>D</Text>
        <Text style={styles.thStat}>SG</Text>
      </View>

      {rows.map((row) => {
        const tiebreak = isNotableTiebreak(row.tiebreakReason)
          ? getTiebreakReasonLabel(row.tiebreakReason)
          : null;
        const isQualified = row.qualifiedStatus === 'qualified';
        return (
          <View
            key={row.teamId}
            style={[styles.tableRow, isQualified && styles.tableRowQualified]}
            accessibilityLabel={describeStandingRowForAccessibility(row)}
          >
            <View style={styles.rowTop}>
              <Text style={[styles.tdPos, isQualified && styles.tdPosQualified]}>
                {row.position}
              </Text>
              <View style={styles.tdTeamWrap}>
                <TeamColorDot color={row.primaryColor ?? colors.textMuted} size={9} />
                <Text style={styles.tdTeam} numberOfLines={1}>
                  {row.teamName}
                </Text>
              </View>
              <Text style={[styles.tdStat, styles.tdPoints]}>{row.points}</Text>
              <Text style={styles.tdStat}>{row.played}</Text>
              <Text style={styles.tdStat}>{row.wins}</Text>
              <Text style={styles.tdStat}>{row.draws}</Text>
              <Text style={styles.tdStat}>{row.losses}</Text>
              <Text style={styles.tdStat}>
                {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
              </Text>
            </View>
            <View style={styles.rowBottom}>
              <StatusChip row={row} />
              <Text style={styles.rowGoals}>
                {row.goalsFor} GP · {row.goalsAgainst} GC
              </Text>
              {tiebreak ? <Text style={styles.rowTiebreak}>{tiebreak}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function GroupsOverviewScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { championshipId } = route.params;

  const championships = useChampionshipStore((s) => s.championships);
  const loading = useChampionshipStore((s) => s.loading);
  const championship = championships.find((c) => c.id === championshipId);
  const allTeams = useTeamStore((s) => s.teams);
  const allMatches = useMatchStore((s) => s.matches);
  const allEvents = useMatchStore((s) => s.events);

  const teams = useMemo(
    () => allTeams.filter((t) => t.championshipId === championshipId),
    [allTeams, championshipId],
  );
  const matches = useMemo(
    () => allMatches.filter((m) => m.championshipId === championshipId),
    [allMatches, championshipId],
  );

  const summary = useMemo(
    () => (championship ? summarizeGroupStageDashboard(championship, teams, matches) : null),
    [championship, teams, matches],
  );

  const standings = useMemo(() => {
    if (!championship || !summary?.hasGeneratedGroups) return null;
    try {
      const events = allEvents.filter((e) => e.championshipId === championshipId);
      return calculateAllStandings(championship, teams, matches, events);
    } catch {
      return 'error' as const;
    }
  }, [championship, summary?.hasGeneratedGroups, teams, matches, allEvents, championshipId]);

  const header = (
    <SafeAreaView style={styles.header} edges={['top']}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.backBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Voltar"
      >
        <Ionicons name="chevron-back" size={26} color={colors.accent} />
      </TouchableOpacity>
      <Text style={styles.title}>Grupos</Text>
      <View style={styles.backBtn} />
    </SafeAreaView>
  );

  if (loading && !championship) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.skeletonWrap}>
          {[0, 1].map((i) => (
            <SkeletonLoader key={i} width="100%" height={160} borderRadius={16} />
          ))}
        </View>
      </View>
    );
  }

  if (!championship || summary?.isGroupsFormat !== true) {
    return (
      <View style={styles.root}>
        {header}
        <EmptyState
          icon="📋"
          title="Sem fase de grupos"
          description="Este campeonato não usa o formato de grupos + mata-mata."
        />
      </View>
    );
  }

  if (!summary.hasGeneratedGroups) {
    return (
      <View style={styles.root}>
        {header}
        <EmptyState
          icon="🎲"
          title="Grupos ainda não gerados"
          description="O organizador ainda não realizou o sorteio dos grupos. Volte em breve."
        />
      </View>
    );
  }

  if (standings === 'error' || !standings) {
    return (
      <View style={styles.root}>
        {header}
        <EmptyState
          icon="⚠️"
          title="Classificação indisponível"
          description="Não foi possível montar a classificação dos grupos agora. Puxe para atualizar mais tarde."
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {!summary.hasGeneratedFixtures && (
          <View style={styles.noticeCard}>
            <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
            <Text style={styles.noticeText}>
              Grupos sorteados. As partidas ainda não foram geradas — a classificação começa
              zerada.
            </Text>
          </View>
        )}

        <StandingsTable
          groupId="A"
          rows={standings.A}
          qualifiersPerGroup={summary.qualifiersPerGroup}
        />
        <StandingsTable
          groupId="B"
          rows={standings.B}
          qualifiersPerGroup={summary.qualifiersPerGroup}
        />

        {summary.hasGeneratedFixtures && (
          <TouchableOpacity
            style={styles.fixturesBtn}
            onPress={() => navigation.navigate('GroupFixtures', { championshipId })}
            accessibilityRole="button"
            accessibilityLabel="Ver partidas dos grupos"
            activeOpacity={0.85}
          >
            <Ionicons name="calendar-outline" size={18} color={colors.accent} />
            <Text style={styles.fixturesBtnText}>Ver partidas dos grupos</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg100 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.bg200,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Barlow-Bold', fontSize: 20, color: colors.textPrimary },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  skeletonWrap: { padding: 16, gap: 16 },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.accentGlow,
    borderRadius: 12,
    padding: 12,
  },
  noticeText: { flex: 1, fontFamily: 'Barlow-Regular', fontSize: 13, color: colors.textSecondary },
  groupCard: {
    backgroundColor: colors.bg200,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.bg300,
  },
  groupTitle: { fontFamily: 'Barlow-Bold', fontSize: 16, color: colors.textPrimary },
  groupHint: { fontFamily: 'Barlow-Medium', fontSize: 12, color: colors.textMuted },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  thPos: { width: 22, fontFamily: 'Barlow-SemiBold', fontSize: 11, color: colors.textMuted },
  thTeam: { flex: 1, fontFamily: 'Barlow-SemiBold', fontSize: 11, color: colors.textMuted },
  thStat: {
    width: 26,
    textAlign: 'center',
    fontFamily: 'Barlow-SemiBold',
    fontSize: 11,
    color: colors.textMuted,
  },
  tableRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    gap: 6,
  },
  tableRowQualified: {
    backgroundColor: colors.accentGlow,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  tdPos: { width: 22, fontFamily: 'Barlow-Bold', fontSize: 14, color: colors.textSecondary },
  tdPosQualified: { color: colors.accent },
  tdTeamWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 6 },
  tdTeam: { flex: 1, fontFamily: 'Barlow-SemiBold', fontSize: 14, color: colors.textPrimary },
  tdStat: { width: 26, textAlign: 'center', fontFamily: 'Barlow-Medium', fontSize: 13, color: colors.textSecondary },
  tdPoints: { fontFamily: 'Barlow-Black', color: colors.textPrimary },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  rowGoals: { fontFamily: 'Barlow-Regular', fontSize: 11, color: colors.textMuted },
  rowTiebreak: { fontFamily: 'Barlow-Medium', fontSize: 11, color: colors.accent },
  chip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  chipQualified: { backgroundColor: `${colors.success}22` },
  chipEliminated: { backgroundColor: `${colors.danger}22` },
  chipUndecided: { backgroundColor: colors.bg300 },
  chipText: { fontFamily: 'Barlow-SemiBold', fontSize: 10, color: colors.textSecondary },
  fixturesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bg200,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  fixturesBtnText: { flex: 1, fontFamily: 'Barlow-SemiBold', fontSize: 14, color: colors.textPrimary },
});
