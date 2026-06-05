import React, { useCallback, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { AllTimeRankingPlayer, AllTimeRankingTeam } from '../../types';
import { AllTimeCategory, useAllTimeRankings } from '../../hooks/useAllTimeRankings';
import { TeamColorDot } from '../../components/TeamColorDot';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { EmptyState } from '../../components/EmptyState';
import { colors } from '../../theme/colors';

// ── Tab config ────────────────────────────────────────────────────────────────

interface TabConfig {
  key: AllTimeCategory;
  label: string;
  statKey: keyof AllTimeRankingPlayer;
  statLabel: string;
}

const TABS: TabConfig[] = [
  { key: 'scorers', label: '⚽ Artilheiros', statKey: 'goals', statLabel: 'gols na carreira' },
  { key: 'titles', label: '🏆 Títulos', statKey: 'titles', statLabel: 'títulos' },
  { key: 'matches', label: '🏟️ Jogos', statKey: 'matches', statLabel: 'jogos' },
  { key: 'mvps', label: '🌟 MVPs', statKey: 'mvps', statLabel: 'prêmios MVP' },
  { key: 'teams', label: '👑 Times', statKey: 'titles', statLabel: 'títulos' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.[0] ?? '').toUpperCase();
  return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Avatar({ name, size, borderWidth = 0 }: { name: string; size: number; borderWidth?: number }) {
  const initials = getInitials(name);
  return (
    <View
      style={[
        avatarStyles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth,
          borderColor: colors.accent,
        },
      ]}
    >
      <Text style={[avatarStyles.text, { fontSize: size * 0.35 }]}>{initials}</Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontFamily: 'Barlow-Bold',
    color: colors.accent,
  },
});

function PositionBadge({ position }: { position: number }) {
  if (position === 2) {
    return <Text style={styles.medalEmoji}>🥈</Text>;
  }
  if (position === 3) {
    return <Text style={styles.medalEmoji}>🥉</Text>;
  }
  return (
    <View style={styles.positionBox}>
      <Text style={styles.positionNumber}>{position}</Text>
    </View>
  );
}

// First place — player
function PlayerFirstCard({
  item,
  statKey,
  statLabel,
}: {
  item: AllTimeRankingPlayer;
  statKey: keyof AllTimeRankingPlayer;
  statLabel: string;
}) {
  const statValue = (item[statKey] as number | undefined) ?? 0;
  return (
    <LinearGradient
      colors={['rgba(245,166,35,0.16)', colors.bg200]}
      style={styles.firstCard}
    >
      <View style={styles.firstTopBorder} />
      <View style={styles.firstCardRow}>
        <View style={styles.firstLeft}>
          <Text style={styles.firstRankLabel}>👑 #1</Text>
          <Avatar name={item.name} size={56} borderWidth={2} />
          <View style={styles.firstNameBlock}>
            <Text style={styles.firstName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.firstTeam} numberOfLines={1}>{item.teamName}</Text>
          </View>
        </View>
        <View style={styles.firstRight}>
          <Text style={styles.firstStatNumber}>{statValue}</Text>
          <Text style={styles.firstStatLabel}>{statLabel}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

// Rows 2–10 — player
function PlayerRow({
  item,
  index,
  statKey,
  statLabel,
}: {
  item: AllTimeRankingPlayer;
  index: number;
  statKey: keyof AllTimeRankingPlayer;
  statLabel: string;
}) {
  const position = index + 1;
  const statValue = (item[statKey] as number | undefined) ?? 0;
  const bg = index % 2 === 0 ? colors.bg200 : colors.bg300;
  return (
    <View style={[styles.playerRow, { backgroundColor: bg }]}>
      <PositionBadge position={position} />
      <View style={styles.rowAvatar}>
        <Avatar name={item.name} size={44} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.rowTeam} numberOfLines={1}>{item.teamName}</Text>
      </View>
      <View style={styles.rowStat}>
        <Text style={styles.rowStatNumber}>{statValue}</Text>
        <Text style={styles.rowStatLabel}>{statLabel}</Text>
      </View>
    </View>
  );
}

// First place — team
function TeamFirstCard({ item }: { item: AllTimeRankingTeam }) {
  return (
    <LinearGradient
      colors={['rgba(245,166,35,0.16)', colors.bg200]}
      style={styles.firstCard}
    >
      <View style={styles.firstTopBorder} />
      <View style={styles.firstCardRow}>
        <View style={styles.firstLeft}>
          <Text style={styles.firstRankLabel}>👑 #1</Text>
          <TeamColorDot color={colors.accent} size={20} />
          <View style={styles.firstNameBlock}>
            <Text style={styles.firstName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.firstTeam} numberOfLines={1}>
              {item.participations} participação{item.participations !== 1 ? 'ões' : ''}
            </Text>
          </View>
        </View>
        <View style={styles.firstRight}>
          <Text style={styles.firstStatNumber}>{item.titles}</Text>
          <Text style={styles.firstStatLabel}>títulos</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

// Rows 2–10 — team
function TeamRow({ item, index }: { item: AllTimeRankingTeam; index: number }) {
  const position = index + 1;
  const bg = index % 2 === 0 ? colors.bg200 : colors.bg300;
  return (
    <View style={[styles.playerRow, { backgroundColor: bg }]}>
      <PositionBadge position={position} />
      <View style={styles.rowAvatar}>
        <TeamColorDot color={colors.accent} size={16} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.rowTeam} numberOfLines={1}>
          {item.titles} título{item.titles !== 1 ? 's' : ''} · {item.participations} participação{item.participations !== 1 ? 'ões' : ''}
        </Text>
      </View>
      <View style={styles.rowStat}>
        <Text style={styles.rowStatNumber}>{item.titles}</Text>
        <Text style={styles.rowStatLabel}>títulos</Text>
      </View>
    </View>
  );
}

// Loading skeleton rows
function LoadingSkeleton() {
  return (
    <View style={{ padding: 16, gap: 10 }}>
      <SkeletonLoader width="100%" height={110} borderRadius={16} />
      {[0, 1, 2, 3, 4].map((i) => (
        <SkeletonLoader key={i} width="100%" height={64} borderRadius={12} />
      ))}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export function AllTimeRankingsScreen() {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState<AllTimeCategory>('scorers');

  const { players, teams, loading } = useAllTimeRankings(activeTab);

  const activeTabConfig = TABS.find((t) => t.key === activeTab)!;
  const isTeamsTab = activeTab === 'teams';
  const listData: AllTimeRankingPlayer[] | AllTimeRankingTeam[] = isTeamsTab ? teams : players;

  const renderItem = useCallback(
    ({ item, index }: { item: AllTimeRankingPlayer | AllTimeRankingTeam; index: number }) => {
      if (isTeamsTab) {
        const team = item as AllTimeRankingTeam;
        if (index === 0) return <TeamFirstCard item={team} />;
        return <TeamRow item={team} index={index} />;
      }
      const player = item as AllTimeRankingPlayer;
      if (index === 0) {
        return (
          <PlayerFirstCard
            item={player}
            statKey={activeTabConfig.statKey}
            statLabel={activeTabConfig.statLabel}
          />
        );
      }
      return (
        <PlayerRow
          item={player}
          index={index}
          statKey={activeTabConfig.statKey}
          statLabel={activeTabConfig.statLabel}
        />
      );
    },
    [isTeamsTab, activeTabConfig],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg200} />

      {/* ── Header ── */}
      <LinearGradient
        colors={['rgba(245,166,35,0.10)', colors.bg200]}
        style={styles.header}
      >
        <View style={styles.trophyBg} pointerEvents="none">
          <Ionicons name="trophy" size={100} color={colors.accent} style={{ opacity: 0.08 }} />
        </View>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={26} color={colors.accent} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>HALL DA FAMA</Text>
          <Text style={styles.headerSubtitle}>FJU Championship — Todos os tempos</Text>
        </View>
      </LinearGradient>

      {/* ── Tabs ── */}
      <View style={styles.tabsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsList}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Content ── */}
      {loading ? (
        <LoadingSkeleton />
      ) : listData.length === 0 ? (
        <EmptyState
          icon="🏆"
          title="Sem dados ainda"
          description="O ranking será formado ao longo dos campeonatos"
        />
      ) : (
        <FlatList
          data={listData as AllTimeRankingPlayer[]}
          keyExtractor={(_, index) => `${activeTab}-${index}`}
          renderItem={renderItem}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg100,
  },

  // Header
  header: {
    paddingTop: 12,
    paddingBottom: 20,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  trophyBg: {
    position: 'absolute',
    right: -8,
    top: -10,
  },
  backBtn: {
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  headerContent: {
    gap: 2,
  },
  headerTitle: {
    fontFamily: 'Barlow-Black',
    fontSize: 28,
    color: colors.accentLight,
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textSecondary,
  },

  // Tabs
  tabsWrapper: {
    backgroundColor: colors.bg200,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabsList: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.bg300,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.textOnAccent,
  },

  // List
  list: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  listContent: {
    paddingBottom: 40,
  },

  // First place card (shared)
  firstCard: {
    marginHorizontal: 0,
    minHeight: 110,
    overflow: 'hidden',
  },
  firstTopBorder: {
    height: 3,
    backgroundColor: colors.accentLight,
  },
  firstCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  firstLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  firstRankLabel: {
    fontFamily: 'Barlow-Black',
    fontSize: 16,
    color: colors.accentLight,
    minWidth: 36,
  },
  firstNameBlock: {
    flex: 1,
    gap: 2,
  },
  firstName: {
    fontFamily: 'Barlow-Bold',
    fontSize: 16,
    color: colors.textPrimary,
  },
  firstTeam: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  firstRight: {
    alignItems: 'flex-end',
    minWidth: 64,
  },
  firstStatNumber: {
    fontFamily: 'Barlow-Black',
    fontSize: 48,
    color: colors.accent,
    lineHeight: 52,
  },
  firstStatLabel: {
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'right',
  },

  // Player / team row (positions 2–10)
  playerRow: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  medalEmoji: {
    fontSize: 22,
    width: 32,
    textAlign: 'center',
  },
  positionBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.bg300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  positionNumber: {
    fontFamily: 'Barlow-Bold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  rowAvatar: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowInfo: {
    flex: 1,
    gap: 1,
  },
  rowName: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  rowTeam: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  rowStat: {
    alignItems: 'flex-end',
  },
  rowStatNumber: {
    fontFamily: 'Barlow-Black',
    fontSize: 24,
    color: colors.accent,
    lineHeight: 26,
  },
  rowStatLabel: {
    fontFamily: 'Barlow-Regular',
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'right',
  },
});
