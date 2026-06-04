import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useStats } from '../../hooks/useStats';
import { PlayerScorer } from '../../types';

const CHAMP_ID = 'champ-001';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

// ─── Row ──────────────────────────────────────────────────────────────────────

interface ScorerRowProps {
  item: PlayerScorer;
  rank: number;
}

function ScorerRow({ item, rank }: ScorerRowProps) {
  const medal = MEDALS[rank];

  return (
    <View style={styles.row}>
      {/* Rank */}
      {medal ? (
        <Text style={styles.medal}>{medal}</Text>
      ) : (
        <View style={[styles.rankBadge, rank === 1 && styles.rankBadgeFirst]}>
          <Text style={[styles.rankText, rank === 1 && styles.rankTextFirst]}>{rank}</Text>
        </View>
      )}

      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: item.teamColor }]}>
        <Text style={styles.avatarText}>{getInitials(item.playerName)}</Text>
      </View>

      {/* Name + team */}
      <View style={styles.info}>
        <Text style={styles.playerName} numberOfLines={1}>{item.playerName}</Text>
        <Text style={styles.teamName} numberOfLines={1}>{item.teamName}</Text>
      </View>

      {/* Goals */}
      <View style={styles.goalsWrap}>
        <Text style={styles.goalsCount}>{item.goals}</Text>
        <Text style={styles.goalsBall}>⚽</Text>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function TopScorersScreen() {
  const { topScorers } = useStats(CHAMP_ID);

  // Compute rank respecting ties in goals count
  const ranked = topScorers.map((s) => ({
    ...s,
    rank: topScorers.findIndex((p) => p.goals === s.goals) + 1,
  }));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.pageHeader}>
        <Text style={styles.title}>Artilheiros</Text>
        <Ionicons name="trophy" size={22} color={colors.accent} />
      </View>

      <FlatList
        data={ranked}
        keyExtractor={(item) => item.playerId}
        renderItem={({ item }) => <ScorerRow item={item} rank={item.rank} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nenhum gol registrado ainda.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },

  listContent: { paddingHorizontal: 16, paddingVertical: 4, paddingBottom: 24 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 72,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },

  medal: { fontSize: 26, width: 36, textAlign: 'center' },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeFirst: { backgroundColor: colors.accent },
  rankText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  rankTextFirst: { color: colors.primaryDark },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  info: { flex: 1 },
  playerName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  teamName: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  goalsWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  goalsCount: { fontSize: 24, fontWeight: '800', color: colors.accent },
  goalsBall: { fontSize: 14 },

  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 14, color: colors.textSecondary },
});
