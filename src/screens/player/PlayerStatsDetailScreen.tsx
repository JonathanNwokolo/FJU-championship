import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';
import { useTeamStore } from '../../stores/teamStore';
import { usePlayerStats, MatchPerformance } from '../../hooks/usePlayerStats';
import { Team } from '../../types';
import { colors, gradients } from '../../theme/colors';

type Props = NativeStackScreenProps<HomeStackParamList, 'PlayerStatsDetail'>;

const EVENT_ICONS: Record<string, string> = {
  gol: '⚽',
  cartao_amarelo: '🟨',
  cartao_vermelho: '🟥',
};

function StatBadge({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <View style={styles.statBadge}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function GoalBarChart({
  performances,
  teams,
}: {
  performances: MatchPerformance[];
  teams: Team[];
}) {
  if (performances.length === 0) return null;

  const maxGoals = Math.max(...performances.map((p) => p.goals), 1);

  return (
    <View style={styles.chartWrap}>
      <Text style={styles.sectionTitle}>Gols por Rodada</Text>
      <View style={styles.chart}>
        {performances
          .slice()
          .reverse()
          .map((p) => {
            const height = Math.max(4, (p.goals / maxGoals) * 80);
            return (
              <View key={p.match.id} style={styles.barCol}>
                <View style={styles.barContainer}>
                  {p.goals > 0 && (
                    <View style={[styles.bar, { height }]}>
                      <Text style={styles.barGoalNum}>{p.goals}</Text>
                    </View>
                  )}
                  {p.goals === 0 && <View style={[styles.barEmpty, { height: 4 }]} />}
                </View>
                <Text style={styles.barLabel}>R{p.match.round}</Text>
              </View>
            );
          })}
      </View>
    </View>
  );
}

function MatchRow({
  performance,
  teams,
}: {
  performance: MatchPerformance;
  teams: Team[];
}) {
  const { match, events, goals, yellowCards, redCards } = performance;
  const home = teams.find((t) => t.id === match.homeTeamId);
  const away = teams.find((t) => t.id === match.awayTeamId);

  return (
    <View style={styles.matchRow}>
      <View style={styles.matchRowHeader}>
        <Text style={styles.matchRound}>Rodada {match.round}</Text>
        <Text style={styles.matchScore}>
          {home?.name ?? 'Casa'} {match.homeScore ?? 0} × {match.awayScore ?? 0} {away?.name ?? 'Fora'}
        </Text>
      </View>

      <View style={styles.eventsRow}>
        {events.map((e, i) => (
          <View key={i} style={styles.eventChip}>
            <Text style={styles.eventIcon}>{EVENT_ICONS[e.type] ?? '•'}</Text>
            <Text style={styles.eventMinute}>{e.minute}'</Text>
          </View>
        ))}
      </View>

      <View style={styles.matchMiniStats}>
        {goals > 0 && (
          <Text style={styles.miniStat}>⚽ {goals} gol{goals > 1 ? 's' : ''}</Text>
        )}
        {yellowCards > 0 && (
          <Text style={styles.miniStat}>🟨 {yellowCards}</Text>
        )}
        {redCards > 0 && (
          <Text style={styles.miniStat}>🟥 {redCards}</Text>
        )}
      </View>
    </View>
  );
}

export function PlayerStatsDetailScreen({ route, navigation }: Props) {
  const { playerId, championshipId } = route.params;

  const { teams, players } = useTeamStore();
  const player = useMemo(() => players.find((p) => p.id === playerId), [players, playerId]);
  const team = useMemo(
    () => (player ? teams.find((t) => t.id === player.teamId) : undefined),
    [player, teams],
  );

  const { goals, yellowCards, redCards, overall, matchBreakdown } = usePlayerStats(
    playerId,
    championshipId,
  );

  const matchesPlayed = matchBreakdown.length;
  const avgGoals = matchesPlayed > 0 ? (goals / matchesPlayed).toFixed(2) : '0.00';

  return (
    <LinearGradient colors={[colors.bg200, colors.bg100]} style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color={colors.accent} />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerName} numberOfLines={1}>{player?.name ?? 'Jogador'}</Text>
            <Text style={styles.headerTeam} numberOfLines={1}>{team?.name ?? ''}</Text>
          </View>
          <View style={styles.overallBadge}>
            <Text style={styles.overallLabel}>OVR</Text>
            <Text style={styles.overallValue}>{overall}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Totais */}
          <View style={styles.statsRow}>
            <StatBadge icon="⚽" value={goals} label="Gols" />
            <StatBadge icon="🎯" value={matchesPlayed} label="Jogos" />
            <StatBadge icon="📊" value={parseFloat(avgGoals)} label="Média" />
            <StatBadge icon="🟨" value={yellowCards} label="Amarelos" />
            <StatBadge icon="🟥" value={redCards} label="Vermelhos" />
          </View>

          {/* Gráfico de barras */}
          <GoalBarChart performances={matchBreakdown} teams={teams} />

          {/* Histórico por partida */}
          {matchBreakdown.length > 0 ? (
            <View style={styles.historySection}>
              <Text style={styles.sectionTitle}>Histórico de Partidas</Text>
              {matchBreakdown.map((p) => (
                <MatchRow key={p.match.id} performance={p} teams={teams} />
              ))}
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>Nenhuma participação registrada</Text>
              <Text style={styles.emptyDesc}>
                As partidas em que você participar com gols ou cartões aparecerão aqui.
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
  },
  headerName: {
    fontFamily: 'Barlow-Bold',
    fontSize: 18,
    color: colors.textPrimary,
  },
  headerTeam: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  overallBadge: {
    alignItems: 'center',
    backgroundColor: colors.accentGlow,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  overallLabel: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 10,
    color: colors.accent,
    letterSpacing: 1,
  },
  overallValue: {
    fontFamily: 'Barlow-Black',
    fontSize: 22,
    color: colors.accent,
    lineHeight: 24,
  },
  content: {
    paddingBottom: 32,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statBadge: {
    alignItems: 'center',
    gap: 4,
  },
  statIcon: {
    fontSize: 22,
  },
  statValue: {
    fontFamily: 'Barlow-Black',
    fontSize: 20,
    color: colors.textPrimary,
  },
  statLabel: {
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    color: colors.textSecondary,
  },
  chartWrap: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    minHeight: 100,
  },
  barCol: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  barContainer: {
    justifyContent: 'flex-end',
    height: 80,
  },
  bar: {
    width: '100%',
    minWidth: 24,
    backgroundColor: colors.accent,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 3,
  },
  barGoalNum: {
    fontFamily: 'Barlow-Bold',
    fontSize: 11,
    color: colors.textOnAccent,
  },
  barEmpty: {
    width: '100%',
    minWidth: 24,
    backgroundColor: colors.bg300,
    borderRadius: 4,
  },
  barLabel: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 10,
    color: colors.textMuted,
  },
  historySection: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 12,
  },
  matchRow: {
    backgroundColor: colors.bg200,
    borderRadius: 14,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  matchRowHeader: {
    gap: 4,
  },
  matchRound: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  matchScore: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  eventsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  eventChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.bg300,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  eventIcon: {
    fontSize: 14,
  },
  eventMinute: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    color: colors.textPrimary,
  },
  matchMiniStats: {
    flexDirection: 'row',
    gap: 12,
  },
  miniStat: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 16,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyDesc: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
