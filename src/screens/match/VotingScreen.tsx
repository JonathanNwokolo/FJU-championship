import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../../theme/colors';
import { AppButton } from '../../components/AppButton';
import { AppCard } from '../../components/AppCard';
import { useMatchStore } from '../../stores/matchStore';
import { useTeamStore } from '../../stores/teamStore';
import { useAuthStore } from '../../stores/authStore';
import { useRoundVoting } from '../../hooks/useRoundVoting';
import { getCandidatesForRound, isRoundComplete, submitVote } from '../../services/votingService';
import { isActiveRosterPlayer } from '../../utils/teamRules';
import { Player } from '../../types';
import { FixturesStackParamList } from '../../navigation/FixturesStackNavigator';

type RouteT = RouteProp<FixturesStackParamList, 'Voting'>;
type NavT = NavigationProp<FixturesStackParamList>;

function getInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

export function VotingScreen() {
  const navigation = useNavigation<NavT>();
  const { params } = useRoute<RouteT>();
  const { championshipId, round } = params;

  const { matches, events } = useMatchStore();
  const { teams, players } = useTeamStore();
  const user = useAuthStore((s) => s.user);

  const { results, totalVotes, hasCurrentUserVoted, winner } = useRoundVoting(
    championshipId,
    round,
  );

  // Time atual do votante: só player ATIVO conta — um doc 'sem_time' guarda o
  // teamId antigo e não pode definir o time do usuário.
  const userTeamId = user
    ? players.find(
        (p) =>
          p.userId === user.id &&
          p.championshipId === championshipId &&
          isActiveRosterPlayer(p),
      )?.teamId
    : undefined;

  const championshipMatches = matches.filter((match) => match.championshipId === championshipId);
  const roundComplete = isRoundComplete(championshipMatches, round);
  const allCandidates = getCandidatesForRound(championshipId, round, events, players, matches);
  // Votante não pode votar em jogador do próprio time
  const candidates = userTeamId
    ? allCandidates.filter((p) => p.teamId !== userTeamId)
    : allCandidates;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const showVoting = roundComplete && !hasCurrentUserVoted && !winner;

  const handleVote = async () => {
    if (!selectedId || !user) return;
    setSubmitting(true);
    try {
      await submitVote(championshipId, round, user.id, selectedId);
    } catch (e: any) {
      Alert.alert('Erro', e.message ?? 'Não foi possível registrar o voto.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSeeWinner = () => {
    navigation.navigate('RoundAward', { championshipId, round });
  };

  // ── Phase 1: Voting ────────────────────────────────────────────────────────

  const renderCandidate = ({ item: player }: { item: Player }) => {
    const isSelected = selectedId === player.id;
    const team = teams.find((t) => t.id === player.teamId);
    const goals = events.filter(
      (e) =>
        e.playerId === player.id &&
        e.type === 'gol' &&
        matches.some(
          (m) =>
            m.id === e.matchId &&
            m.championshipId === championshipId &&
            m.round === round,
        ),
    ).length;

    return (
      <TouchableOpacity
        onPress={() => setSelectedId(player.id)}
        activeOpacity={0.8}
        style={[styles.candidateCard, isSelected && styles.candidateCardSelected]}
      >
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: team?.primaryColor ?? colors.accent }]}>
          <Text style={styles.avatarText}>{getInitials(player.name)}</Text>
        </View>

        {/* Info */}
        <View style={styles.candidateInfo}>
          <Text style={styles.candidateName} numberOfLines={1}>
            {player.name}
          </Text>
          <View style={styles.teamRow}>
            <View style={[styles.teamDot, { backgroundColor: team?.primaryColor ?? colors.accent }]} />
            <Text style={styles.teamName} numberOfLines={1}>
              {team?.name ?? '—'}
            </Text>
          </View>
        </View>

        {/* Goals badge */}
        {goals > 0 && (
          <View style={styles.goalBadge}>
            <Text style={styles.goalBadgeText}>⚽ {goals}</Text>
          </View>
        )}

        {/* Check */}
        {isSelected && (
          <Ionicons name="checkmark-circle" size={24} color={colors.accent} />
        )}
      </TouchableOpacity>
    );
  };

  // ── Phase 2: Live results ──────────────────────────────────────────────────

  const maxVotes = results[0]?.votes ?? 1;

  const renderResult = ({
    item,
    index,
  }: {
    item: { playerId: string; votes: number };
    index: number;
  }) => {
    const player = players.find((p) => p.id === item.playerId);
    const team = teams.find((t) => t.id === player?.teamId);
    const isLeader = index === 0;

    return (
      <View style={[styles.resultRow, isLeader && styles.resultRowLeader]}>
        <Text style={styles.resultPosition}>{index + 1}</Text>
        {isLeader && <Text style={styles.leaderStar}>🌟</Text>}
        <View style={styles.resultInfo}>
          <Text style={styles.resultName} numberOfLines={1}>
            {player?.name ?? '—'}
          </Text>
          <Text style={styles.resultTeam} numberOfLines={1}>
            {team?.name ?? '—'}
          </Text>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${(item.votes / maxVotes) * 100}%` },
              ]}
            />
          </View>
        </View>
        <Text style={styles.resultVotes}>{item.votes}</Text>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <SafeAreaView style={styles.headerBg} edges={['top']}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color={colors.textOnDark} />
        </TouchableOpacity>
        <View style={styles.headerBody}>
          <Text style={styles.headerTitle}>🌟 Craque da Rodada {round}</Text>
          <Text style={styles.headerSub}>
            {showVoting
              ? 'Escolha o melhor jogador desta rodada'
              : 'Resultado da votação'}
          </Text>
        </View>
      </SafeAreaView>

      {!roundComplete ? (
        <View style={styles.unavailableBox}>
          <Ionicons name="lock-closed-outline" size={28} color={colors.textMuted} />
          <Text style={styles.unavailableTitle}>Votação abre após o fim da rodada</Text>
        </View>
      ) : showVoting ? (
        /* ── FASE 1: VOTAÇÃO ── */
        <>
          <FlatList
            data={candidates}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={renderCandidate}
            ListFooterComponent={
              user?.role !== 'organizador' ? (
                <Text style={styles.hint}>
                  Você pode votar em qualquer jogador que não seja do seu time
                </Text>
              ) : null
            }
          />
          <SafeAreaView style={styles.bottomBar} edges={['bottom']}>
            <AppButton
              title="Confirmar voto"
              onPress={handleVote}
              disabled={!selectedId || submitting}
              fullWidth
            />
          </SafeAreaView>
        </>
      ) : (
        /* ── FASE 2: RESULTADO AO VIVO ── */
        <>
          <FlatList
            data={results}
            keyExtractor={(r) => r.playerId}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={renderResult}
            ListFooterComponent={
              <View style={styles.footerBox}>
                <Text style={styles.footerVotes}>{totalVotes} votos no total</Text>
                {winner && (
                  <AppButton
                    title="🏆 Ver vencedor"
                    onPress={handleSeeWinner}
                    fullWidth
                    style={styles.winnerBtn}
                  />
                )}
              </View>
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  // Header
  headerBg: { backgroundColor: colors.primaryDark, paddingBottom: 16 },
  backBtn: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  headerBody: { paddingHorizontal: 20, gap: 4 },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 0.3,
  },
  headerSub: {
    fontSize: 13,
    color: `${colors.textOnDark}99`,
    fontWeight: '500',
  },

  // List
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 120,
    gap: 10,
  },

  // Candidate card (Phase 1)
  candidateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    gap: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  candidateCardSelected: {
    borderColor: colors.accent,
    backgroundColor: `${colors.accent}10`,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  candidateInfo: { flex: 1, gap: 4 },
  candidateName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  teamDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  teamName: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  goalBadge: {
    backgroundColor: `${colors.accent}22`,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  goalBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },

  // Results (Phase 2)
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  resultRowLeader: {
    backgroundColor: `${colors.accent}15`,
    borderWidth: 1,
    borderColor: `${colors.accent}40`,
  },
  resultPosition: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textSecondary,
    width: 22,
    textAlign: 'center',
    flexShrink: 0,
  },
  leaderStar: { fontSize: 18, flexShrink: 0 },
  resultInfo: { flex: 1, gap: 3 },
  resultName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  resultTeam: { fontSize: 12, color: colors.textSecondary },
  progressBarBg: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.borderLight,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  resultVotes: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    flexShrink: 0,
    minWidth: 28,
    textAlign: 'right',
  },

  // Footer
  footerBox: {
    marginTop: 20,
    alignItems: 'center',
    gap: 16,
  },
  footerVotes: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  winnerBtn: {},

  // Hint
  hint: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
  },
  unavailableBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  unavailableTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
});
