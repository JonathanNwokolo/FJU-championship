import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppCard } from '../../components/AppCard';
import { colors } from '../../theme/colors';
import { useStats } from '../../hooks/useStats';
import { SuspendedPlayer } from '../../types';

const CHAMP_ID = 'champ-001';

// ─── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: string;
  label: string;
  value: string;
  sub?: string;
}

function StatCard({ icon, label, value, sub }: StatCardProps) {
  return (
    <AppCard style={styles.statCard}>
      <Text style={styles.cardIcon}>{icon}</Text>
      <Text style={styles.cardValue} numberOfLines={2}>{value}</Text>
      {!!sub && <Text style={styles.cardSub} numberOfLines={1}>{sub}</Text>}
      <Text style={styles.cardLabel} numberOfLines={1}>{label}</Text>
    </AppCard>
  );
}

// ─── Suspended row ────────────────────────────────────────────────────────────

function SuspendedRow({ item }: { item: SuspendedPlayer }) {
  const isRed = item.reason === 'cartao_vermelho';
  return (
    <View style={styles.suspendedRow}>
      <Text style={styles.suspendedIcon}>{isRed ? '🟥' : '🟨'}</Text>
      <View style={styles.suspendedInfo}>
        <Text style={styles.suspendedName} numberOfLines={1}>{item.playerName}</Text>
        <Text style={styles.suspendedTeam} numberOfLines={1}>{item.teamName}</Text>
      </View>
      <View style={[
        styles.suspendedBadge,
        { backgroundColor: isRed ? `${colors.danger}18` : `${colors.warning}18` },
      ]}>
        <Text style={[
          styles.suspendedBadgeText,
          { color: isRed ? colors.danger : colors.warning },
        ]}>
          {isRed ? 'Cartão vermelho' : '3 amarelos'}
        </Text>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function StatsOverviewScreen() {
  const {
    standings,
    bestAttack,
    bestDefense,
    roundMVP,
    suspendedPlayers,
    totalGoals,
    finishedCount,
    currentRound,
  } = useStats(CHAMP_ID);

  const leader = standings[0];
  const avgGoals =
    finishedCount > 0 ? (totalGoals / finishedCount).toFixed(1) : '—';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.pageHeader}>
        <Text style={styles.title}>Estatísticas</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* 2-column grid */}
        <View style={styles.grid}>
          <StatCard
            icon="🏆"
            label="Líder"
            value={leader?.teamName ?? '—'}
            sub={leader ? `${leader.points} pontos` : undefined}
          />
          <StatCard
            icon="⚽"
            label="Melhor ataque"
            value={bestAttack?.teamName ?? '—'}
            sub={bestAttack ? `${bestAttack.goalsFor} gols marcados` : undefined}
          />
          <StatCard
            icon="🛡️"
            label="Melhor defesa"
            value={bestDefense?.teamName ?? '—'}
            sub={bestDefense ? `${bestDefense.goalsAgainst} sofridos` : undefined}
          />
          <StatCard
            icon="🌟"
            label={`Time da rodada ${currentRound}`}
            value={roundMVP?.teamName ?? '—'}
            sub={
              roundMVP
                ? `${roundMVP.goalsFor}-${roundMVP.goalsAgainst} na rodada`
                : undefined
            }
          />
          <StatCard
            icon="📊"
            label="Total de gols"
            value={String(totalGoals)}
          />
          <StatCard
            icon="📈"
            label="Média gols/partida"
            value={avgGoals}
          />
        </View>

        {/* Suspended players */}
        {suspendedPlayers.length > 0 && (
          <View style={styles.suspendedSection}>
            <Text style={styles.sectionTitle}>Suspensos — próxima rodada</Text>
            {suspendedPlayers.map((sp) => (
              <SuspendedRow key={sp.playerId} item={sp} />
            ))}
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
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

  content: { padding: 16, gap: 16 },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    flexBasis: '45%',
    gap: 4,
    padding: 14,
    minWidth: 140,
  },
  cardIcon: { fontSize: 28 },
  cardValue: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, marginTop: 4 },
  cardSub: { fontSize: 12, color: colors.accent, fontWeight: '600' },
  cardLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },

  // Suspended section
  suspendedSection: {
    backgroundColor: colors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.textSecondary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  suspendedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  suspendedIcon: { fontSize: 20 },
  suspendedInfo: { flex: 1 },
  suspendedName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  suspendedTeam: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  suspendedBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  suspendedBadgeText: { fontSize: 11, fontWeight: '700' },
});
