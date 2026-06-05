import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  FlatList,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Line } from 'react-native-svg';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import BottomSheet, {
  BottomSheetView,
  BottomSheetBackdrop,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';

import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useTeamStore } from '../../stores/teamStore';
import { useMatchStore } from '../../stores/matchStore';
import { useVotingStore } from '../../stores/votingStore';
import { AppButton } from '../../components/AppButton';
import { Badge } from '../../components/Badge';
import { SectionHeader } from '../../components/SectionHeader';
import { TeamColorDot } from '../../components/TeamColorDot';
import { colors } from '../../theme/colors';
import { Team, Player, ChampionshipStatus, MatchModel, MatchEvent } from '../../types';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';
import { isRoundComplete, closeVoting } from '../../services/votingService';
import { updateDocument, addDocument, deleteDocument, getCollection } from '../../services/firestore';
import { calculateStandings, calculateTopScorers } from '../../services/statsService';
import { saveChampionshipResult } from '../../hooks/useChampionshipHistory';
import { finishChampionship } from '../../services/championshipFinisher';
import { notifyTeamApproved, notifyTeamRejected } from '../../services/notificationService';
import { POSITION_LABELS, POSITION_COLORS } from '../../utils/constants';
import { useAnnouncementsBadge } from '../../hooks/useAnnouncementsBadge';

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

// ─── Grid Stat Card ──────────────────────────────────────────────────────────
function GridStatCard({
  icon,
  value,
  label,
  highlight,
}: {
  icon: string;
  value: string;
  label: string;
  highlight?: boolean;
}) {
  return (
    <View style={[gridStatStyles.card, highlight && gridStatStyles.cardHighlight]}>
      <Text style={gridStatStyles.icon}>{icon}</Text>
      <Text style={[gridStatStyles.value, highlight && gridStatStyles.valueHighlight]}>{value}</Text>
      <Text style={gridStatStyles.label}>{label}</Text>
    </View>
  );
}

const gridStatStyles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: colors.bg200,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
  },
  cardHighlight: {
    borderColor: colors.accent,
    backgroundColor: colors.accentGlow,
  },
  icon: { fontSize: 20 },
  value: {
    fontFamily: 'Barlow-Black',
    fontSize: 22,
    color: colors.textPrimary,
  },
  valueHighlight: {
    color: colors.accent,
  },
  label: {
    fontFamily: 'Barlow-Medium',
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
  },
});

// ─── Timeline Event Item ─────────────────────────────────────────────────────
function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  if (hours < 24) return `há ${hours}h`;
  if (days < 7) return `há ${days}d`;
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

interface TimelineItem {
  id: string;
  icon: string;
  text: string;
  timestamp: string;
  type: 'team_approved' | 'match_finished' | 'goal' | 'card' | 'started';
}

function TimelineEventRow({ item }: { item: TimelineItem }) {
  return (
    <View style={timelineStyles.row}>
      <Text style={timelineStyles.icon}>{item.icon}</Text>
      <View style={timelineStyles.content}>
        <Text style={timelineStyles.text} numberOfLines={2}>{item.text}</Text>
        <Text style={timelineStyles.time}>{formatRelativeTime(item.timestamp)}</Text>
      </View>
    </View>
  );
}

const timelineStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  icon: { fontSize: 18, marginTop: 2 },
  content: { flex: 1, gap: 2 },
  text: {
    fontFamily: 'Barlow-Medium',
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  time: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textMuted,
  },
});

// ─── Discipline Row ──────────────────────────────────────────────────────────
function DisciplineRow({
  player,
  team,
  yellowCards,
  redCards,
  isSuspended,
}: {
  player: Player;
  team: Team | undefined;
  yellowCards: number;
  redCards: number;
  isSuspended: boolean;
}) {
  const posColor = POSITION_COLORS[player.position] ?? colors.textSecondary;
  
  return (
    <View style={[disciplineStyles.row, isSuspended && disciplineStyles.rowSuspended]}>
      {player.photoUrl ? (
        <Image source={{ uri: player.photoUrl }} style={disciplineStyles.avatar} />
      ) : (
        <View style={[disciplineStyles.avatarPlaceholder, { backgroundColor: `${posColor}22` }]}>
          <Text style={[disciplineStyles.initials, { color: posColor }]}>
            {player.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
          </Text>
        </View>
      )}
      <View style={disciplineStyles.info}>
        <Text style={disciplineStyles.name} numberOfLines={1}>{player.name}</Text>
        <View style={disciplineStyles.teamRow}>
          <TeamColorDot color={team?.primaryColor ?? colors.textMuted} size={8} />
          <Text style={disciplineStyles.teamName} numberOfLines={1}>{team?.name ?? 'Time'}</Text>
        </View>
      </View>
      <View style={disciplineStyles.cards}>
        {yellowCards > 0 && (
          <View style={disciplineStyles.cardBadge}>
            <Text style={disciplineStyles.cardText}>🟨 {yellowCards}</Text>
          </View>
        )}
        {redCards > 0 && (
          <View style={[disciplineStyles.cardBadge, disciplineStyles.cardBadgeRed]}>
            <Text style={disciplineStyles.cardText}>🟥 {redCards}</Text>
          </View>
        )}
      </View>
      {isSuspended && (
        <View style={disciplineStyles.suspendedBadge}>
          <Text style={disciplineStyles.suspendedText}>SUSPENSO</Text>
        </View>
      )}
    </View>
  );
}

const disciplineStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.bg200,
    borderRadius: 12,
    marginBottom: 8,
    gap: 10,
  },
  rowSuspended: {
    backgroundColor: `${colors.danger}15`,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
  },
  info: { flex: 1, gap: 2 },
  name: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  teamName: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  cards: {
    flexDirection: 'row',
    gap: 6,
  },
  cardBadge: {
    backgroundColor: colors.bg300,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  cardBadgeRed: {
    backgroundColor: `${colors.danger}22`,
  },
  cardText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 12,
    color: colors.textPrimary,
  },
  suspendedBadge: {
    backgroundColor: colors.danger,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  suspendedText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 10,
    color: '#fff',
    letterSpacing: 0.5,
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
            const { players: allPlayers } = useTeamStore.getState();
            const champPlayers = allPlayers.filter((p) =>
              champTeams.some((t) => t.id === p.teamId),
            );

            const awardData = await closeVoting(championshipId, round, champPlayers);
            if (!awardData) {
              Alert.alert('Sem votos', 'Nenhum voto registrado nesta rodada.');
              return;
            }

            try {
              const docId = await addDocument('round_awards', awardData);
              const award = { ...awardData, id: docId };
              addAward(award);
              navigation.navigate('RoundAward', { championshipId, round });
            } catch {
              Alert.alert('Erro', 'Não foi possível encerrar a votação.');
            }
          },
        },
      ],
    );
  };

  const [teamFilter, setTeamFilter] = useState<'todos' | 'pendente' | 'aprovado'>('todos');
  const [editMatchBottomSheetOpen, setEditMatchBottomSheetOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchModel | null>(null);
  const [editHomeScore, setEditHomeScore] = useState('');
  const [editAwayScore, setEditAwayScore] = useState('');
  const [finishingChampionship, setFinishingChampionship] = useState(false);

  const { unreadCount: announcementsUnread } = useAnnouncementsBadge(championshipId);
  
  const editMatchSheetRef = useRef<BottomSheet>(null);
  
  // Events from all matches for timeline
  const { events } = useMatchStore.getState();
  const champEvents = events.filter(e => {
    const match = matches.find(m => m.id === e.matchId);
    return match !== undefined;
  });

  if (!championship) return null;

  const champTeams = teams.filter((t) => t.championshipId === championshipId);
  const approvedTeams = champTeams.filter((t) => t.status === 'aprovado');
  const pendingTeams = champTeams.filter((t) => t.status === 'pendente');
  const finishedMatches = matches.filter((m) => m.status === 'finalizado');
  const champPlayers = players.filter((p) => champTeams.some((t) => t.id === p.teamId));

  // ─── Computed stats for grid ───
  const totalGoals = champEvents.filter((e) => e.type === 'gol').length;
  const totalYellowCards = champEvents.filter((e) => e.type === 'cartao_amarelo').length;
  const totalRedCards = champEvents.filter((e) => e.type === 'cartao_vermelho').length;
  const avgGoalsPerMatch = finishedMatches.length > 0 
    ? (totalGoals / finishedMatches.length).toFixed(1) 
    : '0.0';

  // ─── Timeline events ───
  const timelineEvents = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    
    // Team approved events
    champTeams
      .filter(t => t.status === 'aprovado')
      .forEach(t => {
        items.push({
          id: `team-${t.id}`,
          icon: '✅',
          text: `${t.name} foi aprovado no campeonato`,
          timestamp: t.createdAt,
          type: 'team_approved',
        });
      });
    
    // Match finished events
    finishedMatches.forEach(m => {
      const home = champTeams.find(t => t.id === m.homeTeamId);
      const away = champTeams.find(t => t.id === m.awayTeamId);
      items.push({
        id: `match-${m.id}`,
        icon: '⚽',
        text: `${home?.name ?? 'Time'} ${m.homeScore} x ${m.awayScore} ${away?.name ?? 'Time'}`,
        timestamp: m.finishedAt ?? m.scheduledAt ?? new Date().toISOString(),
        type: 'match_finished',
      });
    });
    
    // Goal events (limited)
    champEvents
      .filter(e => e.type === 'gol')
      .slice(0, 10)
      .forEach(e => {
        const player = champPlayers.find(p => p.id === e.playerId);
        const team = champTeams.find(t => t.id === e.teamId);
        items.push({
          id: `event-${e.id}`,
          icon: '⚽',
          text: `Gol de ${player?.name ?? 'Jogador'} (${team?.name ?? 'Time'})`,
          timestamp: e.createdAt ?? new Date().toISOString(),
          type: 'goal',
        });
      });
    
    // Sort by timestamp descending
    return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 15);
  }, [champTeams, finishedMatches, champEvents, champPlayers]);

  // ─── Discipline data ───
  const playerDiscipline = useMemo(() => {
    const disciplineMap = new Map<string, { yellow: number; red: number }>();
    
    champEvents.forEach(e => {
      if (e.type === 'cartao_amarelo' || e.type === 'cartao_vermelho') {
        const current = disciplineMap.get(e.playerId) ?? { yellow: 0, red: 0 };
        if (e.type === 'cartao_amarelo') current.yellow++;
        else current.red++;
        disciplineMap.set(e.playerId, current);
      }
    });
    
    const yellowLimit = championship?.rules.yellowCardLimit ?? 3;
    
    return champPlayers
      .filter(p => {
        const disc = disciplineMap.get(p.id);
        return disc && (disc.yellow > 0 || disc.red > 0);
      })
      .map(p => {
        const disc = disciplineMap.get(p.id)!;
        const isSuspended = disc.red > 0 || disc.yellow >= yellowLimit;
        return { player: p, ...disc, isSuspended };
      })
      .sort((a, b) => {
        // Suspended first, then by total cards
        if (a.isSuspended !== b.isSuspended) return a.isSuspended ? -1 : 1;
        return (b.yellow + b.red * 2) - (a.yellow + a.red * 2);
      });
  }, [champPlayers, champEvents, championship?.rules.yellowCardLimit]);

  // ─── Registration deadline ───
  const registrationDeadline = championship?.registrationDeadline;

  const isDeadlinePassed = useMemo(() => {
    if (!registrationDeadline) return false;
    return new Date(registrationDeadline).getTime() < Date.now();
  }, [registrationDeadline]);

  const deadlineCountdown = useMemo(() => {
    if (!registrationDeadline) return null;
    const deadline = new Date(registrationDeadline).getTime();
    const now = Date.now();
    const diff = deadline - now;

    if (diff <= 0) return 'Encerrado';

    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);

    if (days > 0) return `${days}d ${hours}h restantes`;
    return `${hours}h restantes`;
  }, [registrationDeadline]);

  // Auto-close registrations when deadline passes
  useEffect(() => {
    if (
      registrationDeadline &&
      championship.status === 'inscricoes_abertas' &&
      !championship.registrationsClosed &&
      new Date(registrationDeadline).getTime() < Date.now()
    ) {
      updateDocument('championships', championshipId, { registrationsClosed: true }).catch(() => {});
      useChampionshipStore.getState().updateChampionship(championshipId, { registrationsClosed: true });
    }
  }, [registrationDeadline, championship.status, championship.registrationsClosed, championshipId]);

  const displayedTeams =
    teamFilter === 'todos' ? champTeams : champTeams.filter((t) => t.status === teamFilter);

  const minTeamsToStart =
    championship.format === 'mata_mata' ? 2
    : championship.format === 'grupos_e_mata_mata' ? 4
    : 2;
  const showGenerateButton =
    championship.status === 'inscricoes_abertas' && approvedTeams.length >= minTeamsToStart;

  const handleApprove = (team: Team) => {
    updateTeam(team.id, { status: 'aprovado' });
    updateDocument('teams', team.id, { status: 'aprovado' }).catch(() => {});
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Toast.show({ type: 'success', text1: 'Time aprovado!', text2: team.name, visibilityTime: 2500 });
    // Notifica o capitão do time
    if (team.captainId && championship?.name) {
      notifyTeamApproved(team.captainId, team.name, championship.name).catch(() => {});
    }
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
            updateDocument('teams', team.id, { status: 'rejeitado' }).catch(() => {});
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Toast.show({ type: 'error', text1: 'Time rejeitado', text2: team.name, visibilityTime: 2500 });
            // Notifica o capitão do time
            if (team.captainId && championship?.name) {
              notifyTeamRejected(team.captainId, team.name, championship.name).catch(() => {});
            }
          },
        },
      ],
    );
  };

  const handleGenerateTable = () => {
    navigation.navigate('DrawFullscreen', { championshipId });
  };

  // ─── Edit match result ───
  const openEditMatchSheet = useCallback((match: MatchModel) => {
    setSelectedMatch(match);
    setEditHomeScore(match.homeScore?.toString() ?? '');
    setEditAwayScore(match.awayScore?.toString() ?? '');
    editMatchSheetRef.current?.snapToIndex(0);
  }, []);

  const handleSaveMatchResult = useCallback(async () => {
    if (!selectedMatch) return;

    const homeScore = parseInt(editHomeScore, 10);
    const awayScore = parseInt(editAwayScore, 10);

    if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
      Alert.alert('Erro', 'Placar inválido');
      return;
    }

    try {
      // Delete existing goal events for this match so artilheiros don't reflect stale data.
      // Cards are kept (they affect suspensions). Use MatchRegistration for full attribution.
      const { events: allEvents, removeEvent } = useMatchStore.getState();
      const goalEventsToDelete = allEvents.filter(
        (e) => e.matchId === selectedMatch.id && e.type === 'gol',
      );
      await Promise.all(
        goalEventsToDelete.map((e) => deleteDocument('match_events', e.id).catch(() => {})),
      );
      goalEventsToDelete.forEach((e) => removeEvent(e.id));

      await updateDocument('matches', selectedMatch.id, {
        homeScore,
        awayScore,
        status: 'finalizado',
        finishedAt: new Date().toISOString(),
      });

      useMatchStore.getState().updateMatch(selectedMatch.id, {
        homeScore,
        awayScore,
        status: 'finalizado',
        finishedAt: new Date().toISOString(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({ type: 'success', text1: 'Resultado atualizado!', visibilityTime: 2000 });
      editMatchSheetRef.current?.close();
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível salvar o resultado');
    }
  }, [selectedMatch, editHomeScore, editAwayScore]);

  // ─── Export PDF report ───
  const handleExportReport = useCallback(async () => {
    try {
      const standings = calculateStandings(matches, champEvents, champTeams, championship.rules);
      const topScorers = calculateTopScorers(champEvents, champPlayers, champTeams);
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #0D1B2A; text-align: center; margin-bottom: 5px; }
            h2 { color: #F5A623; margin-top: 30px; border-bottom: 2px solid #F5A623; padding-bottom: 5px; }
            .subtitle { text-align: center; color: #666; margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #0D1B2A; color: white; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .gold { background-color: #FFF8E1; }
            .stat-grid { display: flex; flex-wrap: wrap; gap: 15px; margin-top: 15px; }
            .stat-box { flex: 1; min-width: 120px; background: #f5f5f5; padding: 15px; border-radius: 8px; text-align: center; }
            .stat-value { font-size: 28px; font-weight: bold; color: #0D1B2A; }
            .stat-label { color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <h1>${championship.name}</h1>
          <p class="subtitle">Relatório gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
          
          <div class="stat-grid">
            <div class="stat-box">
              <div class="stat-value">${champTeams.length}</div>
              <div class="stat-label">Times</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${champPlayers.length}</div>
              <div class="stat-label">Atletas</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${finishedMatches.length}</div>
              <div class="stat-label">Partidas</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${totalGoals}</div>
              <div class="stat-label">Gols</div>
            </div>
          </div>
          
          <h2>📊 Classificação</h2>
          <table>
            <tr>
              <th>#</th>
              <th>Time</th>
              <th>J</th>
              <th>V</th>
              <th>E</th>
              <th>D</th>
              <th>GP</th>
              <th>GC</th>
              <th>SG</th>
              <th>PTS</th>
            </tr>
            ${standings.map((s, i) => `
              <tr class="${i === 0 ? 'gold' : ''}">
                <td>${i + 1}</td>
                <td>${s.teamName}</td>
                <td>${s.played}</td>
                <td>${s.won}</td>
                <td>${s.drawn}</td>
                <td>${s.lost}</td>
                <td>${s.goalsFor}</td>
                <td>${s.goalsAgainst}</td>
                <td>${s.goalDifference}</td>
                <td><strong>${s.points}</strong></td>
              </tr>
            `).join('')}
          </table>
          
          <h2>⚽ Artilheiros</h2>
          <table>
            <tr>
              <th>#</th>
              <th>Jogador</th>
              <th>Time</th>
              <th>Gols</th>
            </tr>
            ${topScorers.slice(0, 10).map((s, i) => `
              <tr class="${i === 0 ? 'gold' : ''}">
                <td>${i + 1}</td>
                <td>${s.playerName}</td>
                <td>${s.teamName}</td>
                <td><strong>${s.goals}</strong></td>
              </tr>
            `).join('')}
          </table>
          
          <h2>🟨 Disciplina</h2>
          <table>
            <tr>
              <th>Jogador</th>
              <th>Time</th>
              <th>Amarelos</th>
              <th>Vermelhos</th>
              <th>Status</th>
            </tr>
            ${playerDiscipline.slice(0, 15).map(d => {
              const team = champTeams.find(t => t.id === d.player.teamId);
              return `
                <tr>
                  <td>${d.player.name}</td>
                  <td>${team?.name ?? '-'}</td>
                  <td>${d.yellow}</td>
                  <td>${d.red}</td>
                  <td>${d.isSuspended ? '<strong style="color: red;">SUSPENSO</strong>' : 'OK'}</td>
                </tr>
              `;
            }).join('')}
          </table>
          
          <h2>📅 Resultados</h2>
          <table>
            <tr>
              <th>Rodada</th>
              <th>Mandante</th>
              <th>Placar</th>
              <th>Visitante</th>
            </tr>
            ${finishedMatches.map(m => {
              const home = champTeams.find(t => t.id === m.homeTeamId);
              const away = champTeams.find(t => t.id === m.awayTeamId);
              return `
                <tr>
                  <td>${m.round}</td>
                  <td>${home?.name ?? '-'}</td>
                  <td><strong>${m.homeScore} x ${m.awayScore}</strong></td>
                  <td>${away?.name ?? '-'}</td>
                </tr>
              `;
            }).join('')}
          </table>
        </body>
        </html>
      `;
      
      const { uri } = await Print.printToFileAsync({ html });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Relatório - ${championship.name}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Sucesso', `PDF salvo em: ${uri}`);
      }
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert('Erro', 'Não foi possível gerar o relatório');
    }
  }, [championship, matches, champTeams, champPlayers, champEvents, finishedMatches, totalGoals, playerDiscipline]);

  // ─── Close championship ───
  const allMatchesFinished = matches.length > 0 && matches.every((m) => m.status === 'finalizado');
  const canCloseChampionship =
    championship.status === 'em_andamento' && allMatchesFinished && !finishingChampionship;

  const handleCloseChampionship = useCallback(() => {
    // First confirmation
    Alert.alert(
      '⚠️ Encerrar campeonato',
      'Tem certeza que deseja encerrar o campeonato? Esta ação é IRREVERSÍVEL.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          onPress: () => {
            // Second confirmation
            Alert.alert(
              '🏆 Confirmar encerramento',
              `Ao confirmar, o campeonato "${championship.name}" será encerrado oficialmente.\n\n• A classificação final será registrada\n• Os destaques serão calculados\n• Os participantes serão notificados\n\nDeseja prosseguir?`,
              [
                { text: 'Voltar', style: 'cancel' },
                {
                  text: 'ENCERRAR CAMPEONATO',
                  style: 'destructive',
                  onPress: async () => {
                    setFinishingChampionship(true);
                    try {
                      // Use the new finisher service
                      const result = await finishChampionship(championshipId);
                      
                      if (result.success) {
                        // Update local store
                        useChampionshipStore.getState().updateChampionship(championshipId, {
                          status: 'finalizado',
                          finishedAt: new Date().toISOString(),
                        });

                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        Toast.show({ 
                          type: 'success', 
                          text1: '🏆 Campeonato encerrado!', 
                          text2: 'Todos os participantes foram notificados.',
                          visibilityTime: 3000,
                        });

                        // Navigate to celebration screen (readOnly: false shows confetti)
                        navigation.navigate('ChampionshipResult', { 
                          championshipId, 
                          readOnly: false,
                        });
                      } else {
                        Alert.alert('Erro', result.error ?? 'Não foi possível encerrar o campeonato');
                      }
                    } catch (error) {
                      console.error('[CloseChampionship]', error);
                      Alert.alert('Erro', 'Não foi possível encerrar o campeonato');
                    } finally {
                      setFinishingChampionship(false);
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }, [championship, championshipId, champPlayers, champEvents, finishedMatches]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    []
  );

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

        {/* Header row: back + bell */}
        <View style={[styles.heroTopRow, { paddingTop: insets.top }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={26} color={colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Announcements', { championshipId })}
            style={styles.bellBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="notifications-outline" size={24} color={colors.accent} />
            {announcementsUnread > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>
                  {announcementsUnread > 9 ? '9+' : String(announcementsUnread)}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Status + name + format */}
        <View style={styles.heroContent}>
          <View style={styles.heroBadgesRow}>
            <Badge
              label={STATUS_LABELS[championship.status]}
              variant={STATUS_BADGE_VARIANT[championship.status]}
            />
            {(isDeadlinePassed || championship.registrationsClosed) &&
              championship.status === 'inscricoes_abertas' && (
                <View style={styles.closedBadge}>
                  <Text style={styles.closedBadgeText}>INSCRIÇÕES ENCERRADAS</Text>
                </View>
              )}
          </View>
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

        {/* ─── VISÃO GERAL ─── */}
        <View style={styles.section}>
          <SectionHeader title="VISÃO GERAL" />
          <View style={styles.statsGrid}>
            <GridStatCard 
              icon="🏆" 
              value={`${approvedTeams.length}/${champTeams.length}`} 
              label="Times aprovados" 
              highlight 
            />
            <GridStatCard 
              icon="⚽" 
              value={String(totalGoals)} 
              label="Total de gols" 
            />
            <GridStatCard 
              icon="📊" 
              value={avgGoalsPerMatch} 
              label="Média gols/partida" 
            />
            <GridStatCard 
              icon="🟨" 
              value={String(totalYellowCards)} 
              label="Cartões amarelos" 
            />
            <GridStatCard 
              icon="🟥" 
              value={String(totalRedCards)} 
              label="Cartões vermelhos" 
            />
            <GridStatCard 
              icon="✅" 
              value={`${finishedMatches.length}/${matches.length}`} 
              label="Partidas finalizadas" 
            />
          </View>
          
          {/* Registration deadline countdown */}
          {registrationDeadline && championship.status === 'inscricoes_abertas' && (
            <View style={styles.deadlineCard}>
              <Ionicons name="time-outline" size={20} color={colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={styles.deadlineLabel}>Prazo de inscrições</Text>
                <Text style={styles.deadlineDate}>
                  {new Date(registrationDeadline).toLocaleDateString('pt-BR', { 
                    day: '2-digit', 
                    month: 'long', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
              <View style={styles.deadlineCountdown}>
                <Text style={styles.deadlineCountdownText}>{deadlineCountdown}</Text>
              </View>
            </View>
          )}
          
          {/* Action buttons */}
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={handleExportReport}
              activeOpacity={0.8}
            >
              <Ionicons name="download-outline" size={20} color={colors.accent} />
              <Text style={styles.actionButtonText}>Exportar PDF</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── LINHA DO TEMPO ─── */}
        {timelineEvents.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="LINHA DO TEMPO" subtitle="Eventos recentes" />
            <View style={styles.timelineCard}>
              {timelineEvents.slice(0, 8).map((item, index) => (
                <TimelineEventRow key={item.id} item={item} />
              ))}
              {timelineEvents.length === 0 && (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>Nenhum evento ainda.</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ─── DISCIPLINA ─── */}
        {playerDiscipline.length > 0 && (
          <View style={styles.section}>
            <SectionHeader 
              title="DISCIPLINA" 
              subtitle={`${playerDiscipline.filter(d => d.isSuspended).length} suspenso(s)`} 
            />
            <View style={styles.sectionBody}>
              {playerDiscipline.slice(0, 10).map((d) => (
                <DisciplineRow
                  key={d.player.id}
                  player={d.player}
                  team={champTeams.find(t => t.id === d.player.teamId)}
                  yellowCards={d.yellow}
                  redCards={d.red}
                  isSuspended={d.isSuspended}
                />
              ))}
            </View>
          </View>
        )}

        {/* ─── PARTIDAS (editar resultado) ─── */}
        {finishedMatches.length > 0 && (
          <View style={styles.section}>
            <SectionHeader 
              title="RESULTADOS" 
              subtitle="Toque para editar" 
            />
            <View style={styles.sectionBody}>
              {finishedMatches.slice(0, 5).map((match) => {
                const home = champTeams.find(t => t.id === match.homeTeamId);
                const away = champTeams.find(t => t.id === match.awayTeamId);
                return (
                  <TouchableOpacity 
                    key={match.id} 
                    style={styles.matchResultCard}
                    onPress={() => openEditMatchSheet(match)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.matchRoundBadge}>
                      <Text style={styles.matchRoundText}>R{match.round}</Text>
                    </View>
                    <View style={styles.matchTeamsRow}>
                      <View style={styles.matchTeam}>
                        <TeamColorDot color={home?.primaryColor ?? '#555'} size={10} />
                        <Text style={styles.matchTeamName} numberOfLines={1}>{home?.name ?? 'Time'}</Text>
                      </View>
                      <View style={styles.matchScoreBox}>
                        <Text style={styles.matchScore}>{match.homeScore} - {match.awayScore}</Text>
                      </View>
                      <View style={[styles.matchTeam, { justifyContent: 'flex-end' }]}>
                        <Text style={styles.matchTeamName} numberOfLines={1}>{away?.name ?? 'Time'}</Text>
                        <TeamColorDot color={away?.primaryColor ?? '#555'} size={10} />
                      </View>
                    </View>
                    <Ionicons name="pencil" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Teams section */}
        <View style={styles.section}>
          <SectionHeader
            title="TIMES INSCRITOS"
            subtitle={`${champTeams.length} ${champTeams.length === 1 ? 'time' : 'times'}`}
          />

          {/* Filter tabs */}
          <View style={styles.filterRow}>
            {(['todos', 'pendente', 'aprovado'] as const).map((f) => {
              const active = teamFilter === f;
              const label =
                f === 'todos' ? 'Todos' : f === 'pendente' ? 'Pendentes' : 'Aprovados';
              const count = f === 'todos' ? champTeams.length : champTeams.filter((t) => t.status === f).length;
              return (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterTab, active && styles.filterTabActive]}
                  onPress={() => setTeamFilter(f)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.filterTabText, active && styles.filterTabTextActive]}>
                    {label}
                  </Text>
                  {count > 0 && (
                    <View
                      style={[
                        styles.filterBadge,
                        f === 'pendente' && count > 0
                          ? styles.filterBadgeDanger
                          : styles.filterBadgeNeutral,
                        active && styles.filterBadgeActive,
                      ]}
                    >
                      <Text style={styles.filterBadgeText}>{count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.sectionBody}>
            {displayedTeams.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  {champTeams.length === 0
                    ? 'Nenhum time inscrito ainda.'
                    : teamFilter === 'pendente'
                    ? 'Nenhum time pendente.'
                    : 'Nenhum time aprovado.'}
                </Text>
              </View>
            ) : (
              displayedTeams.map((team) => (
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

        {/* ─── ENCERRAR CAMPEONATO ─── */}
        {(canCloseChampionship || finishingChampionship) && (
          <View style={[styles.section, styles.closeChampSection]}>
            <View style={styles.closeChampCard}>
              <Ionicons name="trophy" size={28} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.closeChampTitle}>
                  {finishingChampionship ? 'Encerrando campeonato...' : 'Todas as partidas finalizadas!'}
                </Text>
                <Text style={styles.closeChampSubtitle}>
                  {finishingChampionship 
                    ? 'Aguarde enquanto processamos os resultados finais.' 
                    : 'O campeonato está pronto para ser encerrado oficialmente.'}
                </Text>
              </View>
            </View>
            <AppButton
              title={finishingChampionship ? 'PROCESSANDO...' : 'ENCERRAR CAMPEONATO'}
              variant="danger"
              onPress={handleCloseChampionship}
              fullWidth
              disabled={finishingChampionship}
              loading={finishingChampionship}
              style={{ marginTop: 14 }}
            />
          </View>
        )}

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

      {/* ─── EDIT MATCH BOTTOM SHEET ─── */}
      <BottomSheet
        ref={editMatchSheetRef}
        index={-1}
        snapPoints={['45%']}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <BottomSheetView style={styles.sheetContent}>
          {selectedMatch && (() => {
            const home = champTeams.find(t => t.id === selectedMatch.homeTeamId);
            const away = champTeams.find(t => t.id === selectedMatch.awayTeamId);
            return (
              <>
                <Text style={styles.sheetTitle}>Editar Resultado</Text>
                <Text style={styles.sheetSubtitle}>Rodada {selectedMatch.round}</Text>
                
                <View style={styles.sheetScoreRow}>
                  <View style={styles.sheetTeamCol}>
                    <TeamColorDot color={home?.primaryColor ?? '#555'} size={12} />
                    <Text style={styles.sheetTeamName} numberOfLines={1}>{home?.name}</Text>
                    <BottomSheetTextInput
                      style={styles.sheetScoreInput}
                      value={editHomeScore}
                      onChangeText={setEditHomeScore}
                      keyboardType="number-pad"
                      maxLength={2}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                  
                  <Text style={styles.sheetVs}>X</Text>
                  
                  <View style={styles.sheetTeamCol}>
                    <TeamColorDot color={away?.primaryColor ?? '#555'} size={12} />
                    <Text style={styles.sheetTeamName} numberOfLines={1}>{away?.name}</Text>
                    <BottomSheetTextInput
                      style={styles.sheetScoreInput}
                      value={editAwayScore}
                      onChangeText={setEditAwayScore}
                      keyboardType="number-pad"
                      maxLength={2}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                </View>
                
                <AppButton
                  title="SALVAR RESULTADO"
                  onPress={handleSaveMatchResult}
                  fullWidth
                  style={{ marginTop: 20 }}
                />
              </>
            );
          })()}
        </BottomSheetView>
      </BottomSheet>
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
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.whiteOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.whiteOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  bellBadgeText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 9,
    color: '#fff',
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

  // ─── Filter tabs ───
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.bg200,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterTabActive: {
    backgroundColor: colors.accentGlow,
    borderColor: colors.accent,
  },
  filterTabText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    color: colors.textSecondary,
  },
  filterTabTextActive: {
    color: colors.accent,
  },
  filterBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeDanger: {
    backgroundColor: colors.danger,
  },
  filterBadgeNeutral: {
    backgroundColor: colors.bg300,
  },
  filterBadgeActive: {
    backgroundColor: colors.accent,
  },
  filterBadgeText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 10,
    color: '#fff',
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

  // ─── Stats Grid ───
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },

  // ─── Deadline ───
  deadlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: `${colors.warning}15`,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: 14,
    marginTop: 16,
  },
  deadlineLabel: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    color: colors.textSecondary,
  },
  deadlineDate: {
    fontFamily: 'Barlow-Medium',
    fontSize: 13,
    color: colors.textPrimary,
    marginTop: 2,
  },
  deadlineCountdown: {
    backgroundColor: colors.warning,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deadlineCountdownText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 11,
    color: '#fff',
  },

  // ─── Action Buttons ───
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accentGlow,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingVertical: 12,
  },
  actionButtonText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    color: colors.accent,
  },

  // ─── Timeline ───
  timelineCard: {
    backgroundColor: colors.bg200,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginTop: 14,
  },

  // ─── Match Result Card ───
  matchResultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bg200,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  matchRoundBadge: {
    backgroundColor: colors.bg300,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  matchRoundText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 11,
    color: colors.textMuted,
  },
  matchTeamsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  matchTeam: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  matchTeamName: {
    fontFamily: 'Barlow-Medium',
    fontSize: 13,
    color: colors.textPrimary,
    flex: 1,
  },
  matchScoreBox: {
    backgroundColor: colors.bg300,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  matchScore: {
    fontFamily: 'Barlow-Black',
    fontSize: 14,
    color: colors.textPrimary,
  },

  // ─── Hero badges row ───
  heroBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  closedBadge: {
    backgroundColor: colors.danger,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  closedBadgeText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 10,
    color: '#fff',
    letterSpacing: 0.5,
  },

  // ─── Close Championship ───
  closeChampSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 24,
  },
  closeChampCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.accentGlow,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: 16,
  },
  closeChampTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  closeChampSubtitle: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 3,
    lineHeight: 16,
  },

  // ─── Bottom Sheet ───
  sheetBg: {
    backgroundColor: colors.bg100,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  sheetHandle: {
    backgroundColor: colors.border,
    width: 40,
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
  },
  sheetTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 20,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  sheetSubtitle: {
    fontFamily: 'Barlow-Medium',
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  sheetScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    gap: 16,
  },
  sheetTeamCol: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  sheetTeamName: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 14,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  sheetScoreInput: {
    width: 60,
    height: 56,
    backgroundColor: colors.bg200,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    fontFamily: 'Barlow-Black',
    fontSize: 24,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  sheetVs: {
    fontFamily: 'Barlow-Bold',
    fontSize: 18,
    color: colors.textMuted,
  },
});
