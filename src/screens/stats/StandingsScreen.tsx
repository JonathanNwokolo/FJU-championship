import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { useStats } from '../../hooks/useStats';
import { TeamStanding } from '../../types';

const CHAMP_ID = 'champ-001';

const W = { pos: 28, pts: 28, num: 24 };

// ─── Header row ───────────────────────────────────────────────────────────────

function TableHeader() {
  return (
    <View style={styles.tableHeader}>
      <Text style={[styles.th, { width: W.pos }]}>#</Text>
      <Text style={[styles.th, styles.thTeam]}>Time</Text>
      <Text style={[styles.th, { width: W.pts }]}>P</Text>
      <Text style={[styles.th, { width: W.num }]}>J</Text>
      <Text style={[styles.th, { width: W.num }]}>V</Text>
      <Text style={[styles.th, { width: W.num }]}>E</Text>
      <Text style={[styles.th, { width: W.num }]}>D</Text>
      <Text style={[styles.th, { width: W.num }]}>GP</Text>
      <Text style={[styles.th, { width: W.num }]}>GC</Text>
      <Text style={[styles.th, { width: W.num }]}>SG</Text>
    </View>
  );
}

// ─── Data row ─────────────────────────────────────────────────────────────────

function TableRow({ item, index }: { item: TeamStanding; index: number }) {
  const leader = index === 0;
  const sg = item.goalDifference;
  const sgStr = sg > 0 ? `+${sg}` : `${sg}`;

  return (
    <View style={[styles.row, leader && styles.leaderRow]}>
      {/* Position */}
      <View style={[styles.posWrap, { width: W.pos }]}>
        {leader ? (
          <View style={styles.posBadge}>
            <Text style={styles.posBadgeText}>1</Text>
          </View>
        ) : (
          <Text style={styles.posText}>{index + 1}</Text>
        )}
      </View>

      {/* Team */}
      <View style={styles.teamCell}>
        <View style={[styles.teamDot, { backgroundColor: item.primaryColor }]} />
        <Text style={styles.teamName} numberOfLines={1}>{item.teamName}</Text>
      </View>

      {/* Stats */}
      <Text style={[styles.cell, styles.ptsCell, { width: W.pts }]}>{item.points}</Text>
      <Text style={[styles.cell, { width: W.num }]}>{item.played}</Text>
      <Text style={[styles.cell, { width: W.num }]}>{item.won}</Text>
      <Text style={[styles.cell, { width: W.num }]}>{item.drawn}</Text>
      <Text style={[styles.cell, { width: W.num }]}>{item.lost}</Text>
      <Text style={[styles.cell, { width: W.num }]}>{item.goalsFor}</Text>
      <Text style={[styles.cell, { width: W.num }]}>{item.goalsAgainst}</Text>
      <Text style={[styles.cell, styles.sgCell, { width: W.num }]}>{sgStr}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function StandingsScreen() {
  const { standings, championshipName } = useStats(CHAMP_ID);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Page header */}
      <View style={styles.pageHeader}>
        <Text style={styles.title}>Classificação</Text>
        {!!championshipName && (
          <Text style={styles.subtitle} numberOfLines={1}>{championshipName}</Text>
        )}
      </View>

      {/* Fixed table header */}
      <TableHeader />

      {/* Rows */}
      <FlatList
        data={standings}
        keyExtractor={(item) => item.teamId}
        renderItem={({ item, index }) => <TableRow item={item} index={index} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  pageHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryDark,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  th: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textOnDark,
    textAlign: 'center',
  },
  thTeam: { flex: 1, textAlign: 'left', paddingLeft: 6 },

  listContent: { paddingBottom: 20 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  leaderRow: { backgroundColor: `${colors.accent}0F` },

  posWrap: { alignItems: 'center', justifyContent: 'center' },
  posBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posBadgeText: { fontSize: 11, fontWeight: '800', color: colors.primaryDark },
  posText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' },

  teamCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 2,
  },
  teamDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  teamName: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.textPrimary },

  cell: { fontSize: 12, textAlign: 'center', color: colors.textPrimary },
  ptsCell: { fontWeight: '700' },
  sgCell: { color: colors.textSecondary, fontSize: 11 },
});
