import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { useChampionshipStore } from '../../stores/championshipStore';
import { useTeamStore } from '../../stores/teamStore';
import { useMatchStore } from '../../stores/matchStore';
import { useVotingStore } from '../../stores/votingStore';
import { AppCard } from '../../components/AppCard';
import { AppButton } from '../../components/AppButton';
import { colors } from '../../theme/colors';
import { Team, ChampionshipStatus } from '../../types';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';
import { isRoundComplete, getVoteResults } from '../../services/votingService';

type NavT = NavigationProp<HomeStackParamList>;
import { POSITION_LABELS } from '../../utils/constants';

type RouteT = RouteProp<HomeStackParamList, 'ChampionshipDashboard'>;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const STATUS_LABELS: Record<ChampionshipStatus, string> = {
  inscricoes_abertas: 'Inscrições abertas',
  em_andamento: 'Em andamento',
  finalizado: 'Finalizado',
};

const STATUS_BADGE_BG: Record<ChampionshipStatus, string> = {
  inscricoes_abertas: `${colors.accent}33`,
  em_andamento: `${colors.success}33`,
  finalizado: `${colors.textSecondary}33`,
};

const STATUS_BADGE_TEXT: Record<ChampionshipStatus, string> = {
  inscricoes_abertas: colors.accent,
  em_andamento: colors.success,
  finalizado: colors.textSecondary,
};

export function ChampionshipDashboardScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { championshipId } = route.params;

  const championships = useChampionshipStore((s) => s.championships);
  const championship = championships.find((c) => c.id === championshipId);
  const { teams, players, updateTeam } = useTeamStore();
  const allMatches = useMatchStore((s) => s.matches);
  const matches = allMatches.filter((m) => m.championshipId === championshipId);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Voting
  const { votes, awards, addAward } = useVotingStore();
  const craquesEnabled = championship?.rules.craqueDaRodada ?? false;

  const completedRounds = Array.from(
    { length: championship?.totalRounds ?? 0 },
    (_, i) => i + 1,
  ).filter((r) => isRoundComplete(matches, r));

  const handleCloseVoting = (round: number) => {
    Alert.alert(
      `Encerrar votação da Rodada ${round}`,
      'Calcular o vencedor e encerrar a votação desta rodada?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Encerrar',
          onPress: async () => {
            const results = await getVoteResults(championshipId, round);
            if (results.length === 0) {
              Alert.alert('Sem votos', 'Nenhum voto registrado nesta rodada.');
              return;
            }
            const topPlayerId = results[0].playerId;
            const { players, teams } = useTeamStore.getState();
            const wp = players.find((p) => p.id === topPlayerId);
            const wt = teams.find((t) => t.id === wp?.teamId);
            if (!wp || !wt) return;

            const award = {
              id: `award-${championshipId}-${round}`,
              championshipId,
              round,
              winnerPlayerId: topPlayerId,
              winnerName: wp.name,
              winnerTeamId: wt.id,
              totalVotes: results.reduce((s, r) => s + r.votes, 0),
              closedAt: new Date().toISOString(),
            };
            addAward(award);
            navigation.navigate('RoundAward', { championshipId, round });
          },
        },
      ],
    );
  };

  if (!championship) return null;

  const champTeams = teams.filter((t) => t.championshipId === championshipId);
  const approvedTeams = champTeams.filter((t) => t.status === 'aprovado');
  const pendingTeams = champTeams.filter((t) => t.status === 'pendente');
  const finishedMatches = matches.filter((m) => m.status === 'finalizado');
  const champPlayers = players.filter((p) =>
    champTeams.some((t) => t.id === p.teamId),
  );

  const showGenerateButton =
    championship.status === 'inscricoes_abertas' && approvedTeams.length >= 3;

  const toggleExpand = (teamId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => ({ ...prev, [teamId]: !prev[teamId] }));
  };

  const handleApprove = (team: Team) => {
    updateTeam(team.id, { status: 'aprovado' });
  };

  const handleReject = (team: Team) => {
    Alert.alert(
      'Rejeitar time',
      `Tem certeza que deseja rejeitar "${team.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Rejeitar',
          style: 'destructive',
          onPress: () => updateTeam(team.id, { status: 'rejeitado' }),
        },
      ],
    );
  };

  const handleGenerateTable = () => {
    navigation.navigate('DrawFullscreen', { championshipId });
  };

  const metrics = [
    { icon: '🛡️', value: String(champTeams.length), label: 'Times' },
    { icon: '👥', value: String(champPlayers.length), label: 'Atletas' },
    { icon: '⏳', value: String(pendingTeams.length), label: 'Pendentes' },
    {
      icon: '⚽',
      value: `${finishedMatches.length}/${matches.length}`,
      label: 'Partidas',
    },
  ];

  return (
    <View style={styles.root}>
      {/* Dark header */}
      <View style={styles.headerBg}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="chevron-back" size={26} color={colors.textOnDark} />
            </TouchableOpacity>
            <View style={styles.headerContent}>
              <Text style={styles.headerTitle} numberOfLines={2}>
                {championship.name}
              </Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: STATUS_BADGE_BG[championship.status] },
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    { color: STATUS_BADGE_TEXT[championship.status] },
                  ]}
                >
                  {STATUS_LABELS[championship.status]}
                </Text>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </View>

      {/* Body */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: showGenerateButton ? 110 : 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Metrics */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.metricsRow}
        >
          {metrics.map((m) => (
            <AppCard key={m.label} style={styles.metricCard}>
              <Text style={styles.metricIcon}>{m.icon}</Text>
              <Text style={styles.metricValue}>{m.value}</Text>
              <Text style={styles.metricLabel}>{m.label}</Text>
            </AppCard>
          ))}
        </ScrollView>

        {/* Teams */}
        <Text style={styles.sectionLabel}>TIMES</Text>

        {champTeams.length === 0 ? (
          <AppCard style={styles.emptyCard}>
            <Text style={styles.emptyText}>Nenhum time inscrito ainda.</Text>
          </AppCard>
        ) : (
          (champTeams as Team[]).map((team) => {
            const teamPlayers = players.filter((p) => p.teamId === team.id);
            const isExpanded = expanded[team.id] ?? false;

            return (
              <AppCard key={team.id} style={styles.teamCard}>
                {/* Row: color dot + name + badge + chevron */}
                <TouchableOpacity
                  onPress={() => toggleExpand(team.id)}
                  activeOpacity={0.75}
                  style={styles.teamRow}
                >
                  <View
                    style={[
                      styles.teamColorDot,
                      { backgroundColor: team.primaryColor },
                    ]}
                  />
                  <Text style={styles.teamName} numberOfLines={1}>
                    {team.name}
                  </Text>
                  <View
                    style={[
                      styles.teamBadge,
                      {
                        backgroundColor:
                          team.status === 'aprovado'
                            ? `${colors.success}22`
                            : `${colors.warning}22`,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.teamBadgeText,
                        {
                          color:
                            team.status === 'aprovado'
                              ? colors.success
                              : colors.warning,
                        },
                      ]}
                    >
                      {team.status === 'aprovado' ? 'Aprovado' : 'Pendente'}
                    </Text>
                  </View>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>

                {/* Pending: approve / reject buttons */}
                {team.status === 'pendente' && (
                  <View style={styles.pendingActions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.approveBtn]}
                      onPress={() => handleApprove(team)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.actionBtnText}>Aprovar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.rejectBtn]}
                      onPress={() => handleReject(team)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.actionBtnText}>Rejeitar</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Approved + collapsed: player count */}
                {team.status === 'aprovado' && !isExpanded && (
                  <Text style={styles.playerCount}>
                    {teamPlayers.length}{' '}
                    {teamPlayers.length === 1 ? 'jogador' : 'jogadores'}
                  </Text>
                )}

                {/* Expanded: player list */}
                {isExpanded && (
                  <View style={styles.playerList}>
                    <View style={styles.divider} />
                    {teamPlayers.length === 0 ? (
                      <Text style={styles.noPlayers}>
                        Nenhum atleta cadastrado.
                      </Text>
                    ) : (
                      teamPlayers.map((player) => (
                        <View key={player.id} style={styles.playerRow}>
                          <Text style={styles.playerNumber}>
                            #{player.number}
                          </Text>
                          <Text style={styles.playerName} numberOfLines={1}>
                            {player.name}
                          </Text>
                          <Text style={styles.playerPosition}>
                            {POSITION_LABELS[player.position] ?? player.position}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                )}
              </AppCard>
            );
          })
        )}

        {/* Votações (organizador + craqueDaRodada habilitado) */}
        {craquesEnabled && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 24 }]}>VOTAÇÕES</Text>

            {completedRounds.length === 0 ? (
              <AppCard style={styles.emptyCard}>
                <Text style={styles.emptyText}>Nenhuma rodada encerrada ainda.</Text>
              </AppCard>
            ) : (
              completedRounds.map((round) => {
                const roundAward = awards.find(
                  (a) => a.championshipId === championshipId && a.round === round,
                );
                const roundVoteCount = votes.filter(
                  (v) => v.championshipId === championshipId && v.round === round,
                ).length;

                return (
                  <AppCard key={round} style={styles.votingCard}>
                    <View style={styles.votingCardRow}>
                      <Text style={styles.votingRoundLabel}>Rodada {round}</Text>
                      <Text style={styles.votingVoteCount}>
                        {roundVoteCount} voto{roundVoteCount !== 1 ? 's' : ''}
                      </Text>
                    </View>

                    {roundAward ? (
                      <TouchableOpacity
                        style={styles.votingWinnerRow}
                        onPress={() => navigation.navigate('RoundAward', { championshipId, round })}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.votingTrophyEmoji}>🏆</Text>
                        <View style={styles.votingWinnerInfo}>
                          <Text style={styles.votingWinnerName} numberOfLines={1}>
                            {roundAward.winnerName}
                          </Text>
                          <Text style={styles.votingWinnerSub}>Craque da rodada</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.accent} />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.closeVotingBtn}
                        onPress={() => handleCloseVoting(round)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.closeVotingBtnText}>
                          Encerrar votação da Rodada {round}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </AppCard>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      {/* Fixed bottom button */}
      {showGenerateButton && (
        <View style={styles.bottomBar}>
          <AppButton
            title="Realizar sorteio e gerar tabela"
            onPress={handleGenerateTable}
            fullWidth
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  // Header
  headerBg: { backgroundColor: colors.primaryDark },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  backBtn: { padding: 2 },
  headerContent: { flex: 1, gap: 6 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textOnDark,
    lineHeight: 24,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },

  // Body
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 20 },

  // Metrics
  metricsRow: { gap: 10, paddingBottom: 4, marginBottom: 24 },
  metricCard: {
    width: 100,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  metricIcon: { fontSize: 22 },
  metricValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  metricLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Section label
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: colors.textSecondary,
    marginBottom: 12,
  },

  // Team cards
  teamCard: { marginBottom: 12 },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  teamColorDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 0,
  },
  teamName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  teamBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  teamBadgeText: { fontSize: 11, fontWeight: '600' },

  // Approve / reject
  pendingActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtn: { backgroundColor: colors.success },
  rejectBtn: { backgroundColor: colors.danger },
  actionBtnText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },

  // Player count (collapsed)
  playerCount: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
  },

  // Player list (expanded)
  playerList: { marginTop: 8 },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginBottom: 10,
  },
  noPlayers: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 8,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 10,
  },
  playerNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
    width: 32,
  },
  playerName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  playerPosition: {
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },

  // Empty
  emptyCard: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { fontSize: 14, color: colors.textSecondary },

  // Bottom bar
  bottomBar: {
    padding: 16,
    paddingBottom: 24,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  // Votações section
  votingCard: { marginBottom: 12, gap: 10 },
  votingCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  votingRoundLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  votingVoteCount: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  votingWinnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: `${colors.accent}12`,
    borderRadius: 10,
    padding: 10,
  },
  votingTrophyEmoji: { fontSize: 20, flexShrink: 0 },
  votingWinnerInfo: { flex: 1 },
  votingWinnerName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
  },
  votingWinnerSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  closeVotingBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  closeVotingBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryDark,
  },
});
