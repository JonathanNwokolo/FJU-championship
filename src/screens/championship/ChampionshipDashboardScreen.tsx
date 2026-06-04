import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Line } from 'react-native-svg';

import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useTeamStore } from '../../stores/teamStore';
import { useMatchStore } from '../../stores/matchStore';
import { useVotingStore } from '../../stores/votingStore';
import { AppButton } from '../../components/AppButton';
import { Badge } from '../../components/Badge';
import { SectionHeader } from '../../components/SectionHeader';
import { colors } from '../../theme/colors';
import { Team, Player, ChampionshipStatus } from '../../types';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';
import { isRoundComplete, getVoteResults } from '../../services/votingService';
import { POSITION_LABELS } from '../../utils/constants';

type NavT = NavigationProp<HomeStackParamList>;
type RouteT = RouteProp<HomeStackParamList, 'ChampionshipDashboard'>;

const { width: SCREEN_W } = Dimensions.get('window');
const HERO_H = 200;

const STATUS_BADGE_VARIANT: Record<ChampionshipStatus, 'pending' | 'approved' | 'round'> = {
  inscricoes_abertas: 'pending',
  em_andamento: 'approved',
  finalizado: 'round',
};

const STATUS_LABELS: Record<ChampionshipStatus, string> = {
  inscricoes_abertas: 'Inscrições abertas',
  em_andamento: 'Em andamento',
  finalizado: 'Finalizado',
};

const FORMAT_LABELS: Record<string, string> = {
  pontos_corridos: 'Pontos corridos',
  mata_mata: 'Mata-mata',
  grupos_e_mata_mata: 'Grupos + mata-mata',
};

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.startsWith('#') ? hex.slice(1) : hex;
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(cleaned);
  if (!result) return `rgba(100,100,100,${alpha})`;
  return `rgba(${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)},${alpha})`;
}

// ─── Diagonal lines decoration ───────────────────────────────────────────────
function DiagonalLines() {
  const spacing = 28;
  const count = Math.ceil((SCREEN_W + HERO_H) / spacing) + 2;
  return (
    <Svg width={SCREEN_W} height={HERO_H} style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }, (_, i) => {
        const x = -HERO_H + i * spacing;
        return (
          <Line
            key={i}
            x1={x}
            y1={0}
            x2={x + HERO_H}
            y2={HERO_H}
            stroke="white"
            strokeWidth={1}
            opacity={0.04}
          />
        );
      })}
    </Svg>
  );
}

// ─── Stat card ───────────────────────────────────────────────────────────────
function StatCard({
  icon,
  value,
  label,
  valueColor,
}: {
  icon: string;
  value: string;
  label: string;
  valueColor: string;
}) {
  return (
    <View style={statStyles.card}>
      <Text style={statStyles.icon}>{icon}</Text>
      <Text style={[statStyles.value, { color: valueColor }]}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: {
    width: 90,
    height: 80,
    backgroundColor: colors.bg200,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  icon: { fontSize: 18 },
  value: {
    fontFamily: 'Barlow-Black',
    fontSize: 24,
    lineHeight: 28,
  },
  label: {
    fontFamily: 'Barlow-Medium',
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
  },
});

// ─── Team admin card ──────────────────────────────────────────────────────────
function TeamAdminCard({
  team,
  players,
  onApprove,
  onReject,
}: {
  team: Team;
  players: Player[];
  onApprove: (t: Team) => void;
  onReject: (t: Team) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    Animated.timing(expandAnim, {
      toValue: expanded ? 0 : 1,
      duration: 280,
      useNativeDriver: false,
    }).start();
    setExpanded((prev) => !prev);
  };

  const maxHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.max(players.length * 57 + 20, 60)],
  });

  const isApproved = team.status === 'aprovado';
  const primaryHex = team.primaryColor ?? '#555555';

  return (
    <View
      style={[
        cardStyles.card,
        isApproved && cardStyles.cardApproved,
      ]}
    >
      {/* Gradient header row */}
      <TouchableOpacity onPress={toggle} activeOpacity={0.85}>
        <LinearGradient
          colors={[hexToRgba(primaryHex, 0.15), hexToRgba(primaryHex, 0)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={cardStyles.header}
        >
          <Text style={cardStyles.teamName} numberOfLines={1}>
            {team.name}
          </Text>
          <Badge
            label={isApproved ? 'Aprovado' : team.status === 'rejeitado' ? 'Rejeitado' : 'Pendente'}
            variant={isApproved ? 'approved' : 'pending'}
          />
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textMuted}
          />
        </LinearGradient>
      </TouchableOpacity>

      {/* Approve / reject buttons */}
      {team.status === 'pendente' && (
        <View style={cardStyles.pendingRow}>
          <AppButton
            title="✓ APROVAR"
            variant="success"
            onPress={() => onApprove(team)}
            style={cardStyles.actionBtn}
          />
          <AppButton
            title="✗ REJEITAR"
            variant="danger"
            onPress={() => onReject(team)}
            style={cardStyles.actionBtn}
          />
        </View>
      )}

      {/* Expandable player list */}
      <Animated.View style={{ maxHeight, overflow: 'hidden' }}>
        <View style={cardStyles.playerList}>
          {players.length === 0 ? (
            <Text style={cardStyles.noPlayers}>Nenhum atleta cadastrado.</Text>
          ) : (
            players.map((player, idx) => (
              <React.Fragment key={player.id}>
                {idx > 0 && <View style={cardStyles.playerDivider} />}
                <View style={cardStyles.playerRow}>
                  <View style={cardStyles.numBadge}>
                    <Text style={cardStyles.numText}>#{player.number}</Text>
                  </View>
                  <Text style={cardStyles.playerName} numberOfLines={1}>
                    {player.name}
                  </Text>
                  <View style={cardStyles.posBadge}>
                    <Text style={cardStyles.posText}>
                      {POSITION_LABELS[player.position] ?? player.position}
                    </Text>
                  </View>
                </View>
              </React.Fragment>
            ))
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg200,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 12,
      },
      android: { elevation: 4 },
    }),
  },
  cardApproved: {
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  teamName: {
    flex: 1,
    fontFamily: 'Barlow-SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  pendingRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  actionBtn: {
    flex: 1,
    height: 36,
    alignSelf: 'stretch',
  },
  playerList: {
    backgroundColor: colors.bg100,
  },
  noPlayers: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 12,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  playerDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },
  numBadge: {
    backgroundColor: colors.bg300,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 32,
    alignItems: 'center',
  },
  numText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 11,
    color: colors.accent,
  },
  playerName: {
    flex: 1,
    fontFamily: 'Barlow-Medium',
    fontSize: 13,
    color: colors.textPrimary,
  },
  posBadge: {
    backgroundColor: colors.bg300,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  posText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 10,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export function ChampionshipDashboardScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { championshipId } = route.params;
  const insets = useSafeAreaInsets();

  const championships = useChampionshipStore((s) => s.championships);
  const championship = championships.find((c) => c.id === championshipId);
  const { teams, players, updateTeam } = useTeamStore();
  const allMatches = useMatchStore((s) => s.matches);
  const matches = allMatches.filter((m) => m.championshipId === championshipId);

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
  const champPlayers = players.filter((p) => champTeams.some((t) => t.id === p.teamId));

  const showGenerateButton =
    championship.status === 'inscricoes_abertas' && approvedTeams.length >= 3;

  const handleApprove = (team: Team) => {
    updateTeam(team.id, { status: 'aprovado' });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Toast.show({ type: 'success', text1: 'Time aprovado!', text2: team.name, visibilityTime: 2500 });
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
          onPress: () => {
            updateTeam(team.id, { status: 'rejeitado' });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Toast.show({ type: 'error', text1: 'Time rejeitado', text2: team.name, visibilityTime: 2500 });
          },
        },
      ],
    );
  };

  const handleGenerateTable = () => {
    navigation.navigate('DrawFullscreen', { championshipId });
  };

  return (
    <View style={styles.root}>
      {/* ─── HERO ─── */}
      <LinearGradient
        colors={[colors.bg300, colors.bg100]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <DiagonalLines />

        {/* Trophy decoration */}
        <View style={styles.trophyDecor}>
          <Ionicons name="trophy" size={120} color="white" />
        </View>

        {/* Back button with safe area */}
        <View style={{ paddingTop: insets.top }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={26} color={colors.accent} />
          </TouchableOpacity>
        </View>

        {/* Status + name + format */}
        <View style={styles.heroContent}>
          <Badge
            label={STATUS_LABELS[championship.status]}
            variant={STATUS_BADGE_VARIANT[championship.status]}
          />
          <Text style={styles.heroTitle} numberOfLines={2}>
            {championship.name}
          </Text>
          <Text style={styles.heroSubtitle}>
            {FORMAT_LABELS[championship.format] ?? championship.format}
          </Text>
        </View>
      </LinearGradient>

      {/* ─── SCROLLABLE BODY ─── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: showGenerateButton ? 120 : 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Metrics */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.metricsRow}
        >
          <StatCard
            icon="🛡️"
            value={String(champTeams.length)}
            label="Times"
            valueColor={colors.accent}
          />
          <StatCard
            icon="👥"
            value={String(champPlayers.length)}
            label="Atletas"
            valueColor={colors.textPrimary}
          />
          <StatCard
            icon="⏳"
            value={String(pendingTeams.length)}
            label="Pendentes"
            valueColor={pendingTeams.length > 0 ? colors.warning : colors.textPrimary}
          />
          <StatCard
            icon="⚽"
            value={`${finishedMatches.length}/${matches.length}`}
            label="Partidas"
            valueColor={colors.textPrimary}
          />
        </ScrollView>

        {/* Teams section */}
        <View style={styles.section}>
          <SectionHeader
            title="TIMES INSCRITOS"
            subtitle={`${champTeams.length} ${champTeams.length === 1 ? 'time' : 'times'}`}
          />
          <View style={styles.sectionBody}>
            {champTeams.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>Nenhum time inscrito ainda.</Text>
              </View>
            ) : (
              (champTeams as Team[]).map((team) => (
                <TeamAdminCard
                  key={team.id}
                  team={team}
                  players={players.filter((p) => p.teamId === team.id)}
                  onApprove={handleApprove}
                  onReject={handleReject}
                />
              ))
            )}
          </View>
        </View>

        {/* Voting section */}
        {craquesEnabled && (
          <View style={styles.section}>
            <SectionHeader title="VOTAÇÕES" />
            <View style={styles.sectionBody}>
              {completedRounds.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>Nenhuma rodada encerrada ainda.</Text>
                </View>
              ) : (
                completedRounds.map((round) => {
                  const roundAward = awards.find(
                    (a) => a.championshipId === championshipId && a.round === round,
                  );
                  const roundVoteCount = votes.filter(
                    (v) => v.championshipId === championshipId && v.round === round,
                  ).length;

                  return (
                    <View key={round} style={styles.votingCard}>
                      <View style={styles.votingCardTop}>
                        <Text style={styles.votingRoundLabel}>Rodada {round}</Text>
                        <Text style={styles.votingVoteCount}>
                          {roundVoteCount} voto{roundVoteCount !== 1 ? 's' : ''}
                        </Text>
                      </View>

                      {roundAward ? (
                        <TouchableOpacity
                          style={styles.votingWinnerRow}
                          onPress={() =>
                            navigation.navigate('RoundAward', { championshipId, round })
                          }
                          activeOpacity={0.8}
                        >
                          <Text style={styles.votingTrophy}>🏆</Text>
                          <View style={{ flex: 1 }}>
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
                    </View>
                  );
                })
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* ─── BOTTOM BAR ─── */}
      {showGenerateButton && (
        <View style={[styles.bottomBar, { paddingBottom: (insets.bottom || 0) + 16 }]}>
          <AppButton
            title="REALIZAR SORTEIO E GERAR TABELA"
            onPress={handleGenerateTable}
            fullWidth
          />
          <Text style={styles.bottomHint}>Mínimo de 3 times aprovados necessário</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg100,
  },

  // ─── Hero ───
  hero: {
    minHeight: HERO_H,
    overflow: 'hidden',
  },
  trophyDecor: {
    position: 'absolute',
    right: -14,
    bottom: 8,
    opacity: 0.08,
    transform: [{ rotate: '15deg' }],
  },
  backBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.whiteOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 12,
    gap: 6,
  },
  heroTitle: {
    fontFamily: 'Barlow-Black',
    fontSize: 26,
    color: colors.textPrimary,
    lineHeight: 30,
  },
  heroSubtitle: {
    fontFamily: 'Barlow-Medium',
    fontSize: 12,
    color: colors.accent,
    letterSpacing: 0.4,
  },

  // ─── Body ───
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },

  // ─── Metrics ───
  metricsRow: {
    gap: 10,
    paddingBottom: 4,
    marginBottom: 28,
  },

  // ─── Section ───
  section: {
    marginBottom: 28,
  },
  sectionBody: {
    marginTop: 14,
  },

  // ─── Empty ───
  emptyCard: {
    backgroundColor: colors.bg200,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontFamily: 'Barlow-Regular',
    fontSize: 14,
    color: colors.textSecondary,
  },

  // ─── Voting ───
  votingCard: {
    backgroundColor: colors.bg200,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  votingCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  votingRoundLabel: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  votingVoteCount: {
    fontFamily: 'Barlow-Medium',
    fontSize: 12,
    color: colors.textSecondary,
  },
  votingWinnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.accentGlow,
    borderRadius: 10,
    padding: 10,
  },
  votingTrophy: { fontSize: 20 },
  votingWinnerName: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.accent,
  },
  votingWinnerSub: {
    fontFamily: 'Barlow-Regular',
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
    fontFamily: 'Barlow-Bold',
    fontSize: 13,
    color: colors.textOnAccent,
  },

  // ─── Bottom bar ───
  bottomBar: {
    paddingTop: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.bg200,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  bottomHint: {
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
