import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Image,
  Alert,
  FlatList,
  Switch,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import BottomSheet, {
  BottomSheetView,
  BottomSheetBackdrop,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { AppButton } from '../../components/AppButton';
import { AppCard } from '../../components/AppCard';
import { Badge } from '../../components/Badge';
import { SectionHeader } from '../../components/SectionHeader';
import { StatTile } from '../../components/StatTile';
import { TeamColorDot } from '../../components/TeamColorDot';
import { TeamLogo } from '../../components/TeamLogo';
import { EmptyState } from '../../components/EmptyState';
import { useAuthStore } from '../../stores/authStore';
import { useTeamStore } from '../../stores/teamStore';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useMatchStore } from '../../stores/matchStore';
import { calculateStandings, getSuspendedPlayers } from '../../services/statsService';
import { updateDocument, setDocument, getDocument, getCollection } from '../../services/index';
import { respondToRequest, removePlayerFromRoster } from '../../services/inviteService';
import { Player, MatchModel, Team, TeamStanding, PlayerStatus, JoinRequest } from '../../types';
import { colors, shadows } from '../../theme/colors';
import { POSITION_COLORS, POSITION_LABELS, TEAM_COLORS } from '../../utils/constants';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';
import { useAnnouncementsBadge } from '../../hooks/useAnnouncementsBadge';
import { useTeamWaitlist } from '../../hooks/useTeamWaitlist';
import { usePendingItemsSummary } from '../../hooks/usePendingItems';
import { PendingSummaryCard } from '../../components/PendingSummaryCard';

const ORDINALS = ['1º', '2º', '3º', '4º', '5º', '6º', '7º', '8º', '9º', '10º'];

function formatWaitlistDate(createdAt: unknown): string | null {
  if (!createdAt) return null;
  let date: Date;
  if (typeof createdAt === 'object' && typeof (createdAt as { toDate?: () => Date }).toDate === 'function') {
    date = (createdAt as { toDate: () => Date }).toDate();
  } else {
    date = new Date(createdAt as string | number);
  }
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('pt-BR');
}

type NavProp = NativeStackNavigationProp<HomeStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = -80;

function getInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

// ── Team Color Picker ────────────────────────────────────────────────────────
function TeamColorPicker({
  selected,
  onSelect,
  exclude,
}: {
  selected: string;
  onSelect: (color: string) => void;
  exclude?: string;
}) {
  return (
    <View style={styles.colorPickerRow}>
      {TEAM_COLORS.map((color) => {
        const isSelected = color === selected;
        const isExcluded = color === exclude;
        return (
          <TouchableOpacity
            key={color}
            onPress={() => !isExcluded && onSelect(color)}
            disabled={isExcluded}
            style={[
              styles.colorDot,
              { backgroundColor: color },
              isSelected && styles.colorDotSelected,
              isExcluded && styles.colorDotExcluded,
            ]}
            activeOpacity={0.8}
          />
        );
      })}
    </View>
  );
}

// ── Stat Card Component ──────────────────────────────────────────────────────
function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  const iconMap: Record<string, React.ComponentProps<typeof StatTile>['icon']> = {
    '🏆': 'trophy-outline',
    '⚽': 'football-outline',
    '👥': 'people-outline',
    '📊': 'analytics-outline',
    '🟨': 'albums-outline',
    '📅': 'calendar-outline',
  };

  return (
    <StatTile
      icon={iconMap[icon]}
      value={value}
      label={label}
      compact
      style={styles.statCard}
    />
  );
}

// ── Match Result Card Component ──────────────────────────────────────────────
function MatchResultCard({
  match,
  myTeamId,
  teams,
}: {
  match: MatchModel;
  myTeamId: string;
  teams: Team[];
}) {
  const isHome = match.homeTeamId === myTeamId;
  const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
  const opponent = teams.find((t) => t.id === opponentId);
  const myScore = isHome ? match.homeScore : match.awayScore;
  const oppScore = isHome ? match.awayScore : match.homeScore;
  
  let result: 'V' | 'E' | 'D' = 'E';
  let resultColor = colors.textMuted;
  if (myScore !== null && oppScore !== null) {
    if (myScore > oppScore) { result = 'V'; resultColor = colors.success; }
    else if (myScore < oppScore) { result = 'D'; resultColor = colors.danger; }
  }

  return (
    <AppCard style={styles.matchResultCard}>
      <View style={styles.matchResultTop}>
        <Text style={styles.matchResultRound}>Rodada {match.round}</Text>
        <View style={[styles.resultBadge, { backgroundColor: `${resultColor}22` }]}>
          <Text style={[styles.resultBadgeText, { color: resultColor }]}>{result}</Text>
        </View>
      </View>
      <View style={styles.matchResultRow}>
        {opponent ? (
          <TeamLogo team={opponent} size={24} />
        ) : (
          <TeamColorDot color={colors.textMuted} size={10} />
        )}
        <Text style={styles.matchResultTeam} numberOfLines={1}>{opponent?.name ?? 'Time'}</Text>
      </View>
      <Text style={styles.matchResultScore}>
        {myScore ?? 0} × {oppScore ?? 0}
      </Text>
    </AppCard>
  );
}

// ── Player Row with Swipe ────────────────────────────────────────────────────
function SwipeablePlayerRow({
  player,
  goals,
  yellowCards,
  isConvoked,
  onToggleConvoke,
  onPress,
  onLongPress,
  onRemove,
}: {
  player: Player;
  goals: number;
  yellowCards: number;
  isConvoked: boolean;
  onToggleConvoke: () => void;
  onPress: () => void;
  onLongPress: () => void;
  onRemove: () => void;
}) {
  const translateX = useSharedValue(0);
  const posColor = POSITION_COLORS[player.position] ?? colors.textSecondary;
  const playerStatus = player.status ?? 'ativo';
  const isActive = playerStatus === 'ativo';

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      translateX.value = Math.max(-120, Math.min(0, e.translationX));
    })
    .onEnd((e) => {
      if (e.translationX < SWIPE_THRESHOLD) {
        translateX.value = withSpring(-100);
      } else {
        translateX.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const actionsStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.abs(translateX.value) / 50),
  }));

  const getStatusBadge = () => {
    if (playerStatus === 'lesionado') {
      return (
        <View style={[styles.statusBadge, styles.statusBadgeWarning]}>
          <Text style={styles.statusBadgeText}>🤕 Lesionado</Text>
        </View>
      );
    }
    if (playerStatus === 'suspenso') {
      return (
        <View style={[styles.statusBadge, styles.statusBadgeDanger]}>
          <Text style={styles.statusBadgeText}>🚫 Suspenso</Text>
        </View>
      );
    }
    return null;
  };

  return (
    <View style={styles.swipeContainer}>
      <Animated.View style={[styles.swipeActions, actionsStyle]}>
        <TouchableOpacity style={styles.removeAction} onPress={onRemove}>
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={styles.removeActionText}>Remover</Text>
        </TouchableOpacity>
      </Animated.View>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.playerRowAnimated, animatedStyle, !isActive && styles.playerRowInactive]}>
          <TouchableOpacity onPress={onPress} onLongPress={onLongPress} activeOpacity={0.75} style={styles.playerRow}>
            {player.photoUrl ? (
              <Image source={{ uri: player.photoUrl }} style={[styles.playerAvatar, !isActive && styles.avatarInactive]} />
            ) : (
              <View style={[styles.playerAvatarPlaceholder, { backgroundColor: `${posColor}22` }, !isActive && styles.avatarInactive]}>
                <Text style={[styles.playerInitials, { color: posColor }]}>{getInitials(player.name)}</Text>
              </View>
            )}
            <View style={styles.playerInfo}>
              <View style={styles.playerNameRow}>
                <Text style={[styles.playerName, !isActive && styles.textInactive]} numberOfLines={1}>{player.name}</Text>
                {getStatusBadge()}
              </View>
              <Text style={[styles.playerPos, { color: posColor }]}>
                {POSITION_LABELS[player.position]}
              </Text>
            </View>
            <View style={styles.playerNumberBadge}>
              <Text style={styles.playerNumber}>#{player.number}</Text>
            </View>
            <View style={styles.playerStats}>
              {goals > 0 && <Text style={styles.statText}>{goals}⚽</Text>}
              {yellowCards > 0 && <Text style={styles.statText}>{yellowCards}🟨</Text>}
            </View>
            <Switch
              value={isConvoked && isActive}
              onValueChange={isActive ? onToggleConvoke : undefined}
              disabled={!isActive}
              trackColor={{ false: colors.bg300, true: colors.accent }}
              thumbColor={isConvoked && isActive ? colors.bg100 : colors.textMuted}
              style={styles.convocationSwitch}
            />
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────
export function CaptainDashboardScreen() {
  const navigation = useNavigation<NavProp>();
  const user = useAuthStore((s) => s.user);
  const { teams, players, updateTeam, removePlayer } = useTeamStore();
  const championships = useChampionshipStore((s) => s.championships);
  const { matches, events } = useMatchStore();

  // Find captain's team
  const myTeam = useMemo(
    () => teams.find((t) => t.captainId === user?.id),
    [teams, user?.id]
  );

  const championship = useMemo(
    () => myTeam ? championships.find((c) => c.id === myTeam.championshipId) : null,
    [myTeam, championships]
  );

  // Elenco ATIVO: oculta atletas removidos (AUD-04) e os que saíram do time.
  const roster = useMemo(
    () =>
      myTeam
        ? players.filter(
            (p) =>
              p.teamId === myTeam.id && p.status !== 'removido' && p.status !== 'sem_time',
          )
        : [],
    [myTeam, players]
  );

  const teamMatches = useMemo(
    () => myTeam ? matches.filter(
      (m) => m.championshipId === myTeam.championshipId &&
        (m.homeTeamId === myTeam.id || m.awayTeamId === myTeam.id)
    ) : [],
    [myTeam, matches]
  );

  const finishedMatches = useMemo(
    () => teamMatches.filter((m) => m.status === 'finalizado').sort((a, b) => b.round - a.round).slice(0, 5),
    [teamMatches]
  );

  const { unreadCount: announcementsUnread } = useAnnouncementsBadge(myTeam?.championshipId ?? '');
  const { waitlist } = useTeamWaitlist(myTeam?.id);
  const {
    criticalCount: pendingCritical,
    total: pendingTotal,
    topItem: pendingTop,
    isPartial: pendingSummaryPartial,
    partialReason: pendingPartialReason,
  } =
    usePendingItemsSummary();
  const [waitlistActionId, setWaitlistActionId] = useState<string | null>(null);

  const nextMatch = useMemo(() => {
    const pendingMatches = teamMatches.filter((m) => m.status !== 'finalizado');
    const scheduledMatches = pendingMatches
      .filter((m) => !!m.scheduledAt && !Number.isNaN(new Date(m.scheduledAt).getTime()))
      .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
    const nextScheduled = scheduledMatches.find((m) => new Date(m.scheduledAt!).getTime() >= Date.now());

    return nextScheduled ?? scheduledMatches[0] ?? pendingMatches.sort((a, b) => a.round - b.round)[0];
  }, [teamMatches]);

  // Pull-to-refresh state
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    if (!myTeam?.championshipId) return;
    setRefreshing(true);
    try {
      const champId = myTeam.championshipId;
      const [freshMatches, freshTeams, freshPlayers] = await Promise.all([
        getCollection<MatchModel>('matches', [{ field: 'championshipId', operator: '==', value: champId }]),
        getCollection<Team>('teams', [{ field: 'championshipId', operator: '==', value: champId }]),
        getCollection<Player>('players', [{ field: 'championshipId', operator: '==', value: champId }]),
      ]);
      // Merge fresh data into stores
      const prevMatches = useMatchStore.getState().matches.filter((m) => m.championshipId !== champId);
      useMatchStore.getState().setMatches([...prevMatches, ...freshMatches]);
      const prevTeams = useTeamStore.getState().teams.filter((t) => t.championshipId !== champId);
      const prevPlayers = useTeamStore.getState().players.filter((p) => p.championshipId !== champId);
      useTeamStore.getState().setTeams([...prevTeams, ...freshTeams]);
      useTeamStore.setState({ players: [...prevPlayers, ...freshPlayers] });
    } catch (e) {
      console.warn('[CaptainDashboard] onRefresh error:', e);
    } finally {
      setRefreshing(false);
    }
  }, [myTeam?.championshipId]);

  // Calculate standings
  const standings = useMemo(() => {
    if (!championship || !myTeam) return [];
    const champTeams = teams.filter((t) => t.championshipId === championship.id);
    const champMatches = matches.filter((m) => m.championshipId === championship.id);
    const champEvents = events.filter((e) => champMatches.some((m) => m.id === e.matchId));
    return calculateStandings(champMatches, champEvents, champTeams, championship.rules);
  }, [championship, myTeam, teams, matches, events]);

  const myStanding = useMemo(
    () => myTeam ? standings.find((s) => s.teamId === myTeam.id) : null,
    [standings, myTeam]
  );

  // Desfalques por suspensão na PRÓXIMA rodada. Fonte por evento (sem flag
  // persistida) — evita escalar quem está suspenso e tomar W.O.
  const suspendedNextRound = useMemo(() => {
    if (!championship || !myTeam) return [];
    const champMatches = matches.filter((m) => m.championshipId === championship.id);
    const champEvents = events.filter((e) => champMatches.some((m) => m.id === e.matchId));
    const champTeams = teams.filter((t) => t.championshipId === championship.id);
    return getSuspendedPlayers(champMatches, champEvents, roster, champTeams, championship.rules)
      .filter((s) => s.teamId === myTeam.id);
  }, [championship, myTeam, matches, events, teams, roster]);

  const myPosition = useMemo(
    () => myTeam ? standings.findIndex((s) => s.teamId === myTeam.id) + 1 : 0,
    [standings, myTeam]
  );

  // Player stats (goals, cards)
  const playerGoals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of events) {
      if (e.type === 'gol') map[e.playerId] = (map[e.playerId] ?? 0) + 1;
    }
    return map;
  }, [events]);

  const playerYellows = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of events) {
      if (e.type === 'cartao_amarelo') map[e.playerId] = (map[e.playerId] ?? 0) + 1;
    }
    return map;
  }, [events]);

  // Convocation state
  const [convocations, setConvocations] = useState<Set<string>>(new Set());
  const currentRound = championship?.currentRound ?? 1;

  useEffect(() => {
    if (!myTeam) return;
    const fetchConvocations = async () => {
      try {
        const data = await getDocument<{ playerIds: string[] }>(
          `teams/${myTeam.id}/convocations`,
          String(currentRound)
        );
        if (data?.playerIds) {
          setConvocations(new Set(data.playerIds));
        } else {
          // Default: all players convoked
          setConvocations(new Set(roster.map((p) => p.id)));
        }
      } catch {
        setConvocations(new Set(roster.map((p) => p.id)));
      }
    };
    fetchConvocations();
  }, [myTeam, currentRound, roster]);

  const handleToggleConvocation = useCallback(async (playerId: string) => {
    if (!myTeam) return;
    const newSet = new Set(convocations);
    if (newSet.has(playerId)) {
      newSet.delete(playerId);
    } else {
      newSet.add(playerId);
    }
    setConvocations(newSet);
    
    try {
      await setDocument(`teams/${myTeam.id}/convocations`, String(currentRound), {
        round: currentRound,
        playerIds: Array.from(newSet),
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Failed to save convocation', e);
    }
  }, [myTeam, currentRound, convocations]);

  // Edit team sheet
  const editSheetRef = useRef<BottomSheet>(null);
  const editSnapPoints = useMemo(() => ['65%'], []);
  const [editName, setEditName] = useState('');
  const [editPrimaryColor, setEditPrimaryColor] = useState('');
  const [editSecondaryColor, setEditSecondaryColor] = useState('');
  const [uploading, setUploading] = useState(false);

  // Player status sheet
  const playerStatusSheetRef = useRef<BottomSheet>(null);
  const playerStatusSnapPoints = useMemo(() => ['40%'], []);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  // Vacancy control
  const maxPlayers = myTeam?.maxPlayers ?? 15;
  const currentPlayers = roster.length;
  const availableSlots = Math.max(0, maxPlayers - currentPlayers);
  const occupancyPercent = maxPlayers > 0 ? (currentPlayers / maxPlayers) * 100 : 0;
  const registrationOpen = myTeam?.registrationOpen ?? true;

  const [vacancySheetOpen, setVacancySheetOpen] = useState(false);
  const [editMaxPlayers, setEditMaxPlayers] = useState(String(maxPlayers));
  const vacancySheetRef = useRef<BottomSheet>(null);

  const openEditSheet = useCallback(() => {
    if (!myTeam) return;
    setEditName(myTeam.name);
    setEditPrimaryColor(myTeam.primaryColor);
    setEditSecondaryColor(myTeam.secondaryColor);
    editSheetRef.current?.expand();
  }, [myTeam]);

  const handleSaveTeam = useCallback(async () => {
    if (!myTeam || !editName.trim()) return;
    try {
      await updateDocument('teams', myTeam.id, {
        name: editName.trim(),
        primaryColor: editPrimaryColor,
        secondaryColor: editSecondaryColor,
      });
      updateTeam(myTeam.id, {
        name: editName.trim(),
        primaryColor: editPrimaryColor,
        secondaryColor: editSecondaryColor,
      });
      editSheetRef.current?.close();
      Toast.show({ type: 'success', text1: 'Time atualizado!' });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Erro ao salvar' });
    }
  }, [myTeam, editName, editPrimaryColor, editSecondaryColor, updateTeam]);

  const handleRemovePlayer = useCallback((player: Player) => {
    Alert.alert(
      'Remover jogador',
      `Remover ${player.name} do time?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              // AUD-04: soft delete quando há histórico; remoção física só sem histórico.
              const mode = await removePlayerFromRoster(player);
              removePlayer(player.id);
              Toast.show({
                type: 'success',
                text1: mode === 'soft' ? 'Jogador removido (histórico preservado)' : 'Jogador removido',
              });
            } catch (e) {
              Toast.show({ type: 'error', text1: 'Erro ao remover' });
            }
          },
        },
      ]
    );
  }, [removePlayer]);

  // Waitlist handlers (reaproveita respondToRequest: aprova/rejeita e notifica o atleta)
  const handleApproveWaitlist = useCallback(async (entry: JoinRequest) => {
    if (!myTeam) return;
    setWaitlistActionId(entry.id);
    try {
      await respondToRequest(entry.id, true, myTeam.id, entry.requesterId);
      Toast.show({ type: 'success', text1: `${entry.requesterName} aprovado!` });
    } catch (e) {
      console.warn('[CaptainDashboard] approve waitlist failed:', e);
      Toast.show({ type: 'error', text1: e instanceof Error ? e.message : 'Erro ao aprovar' });
    } finally {
      setWaitlistActionId(null);
    }
  }, [myTeam]);

  const handleRemoveWaitlist = useCallback((entry: JoinRequest) => {
    if (!myTeam) return;
    Alert.alert(
      'Remover da fila',
      `Remover ${entry.requesterName} da fila de espera?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            setWaitlistActionId(entry.id);
            try {
              await respondToRequest(entry.id, false, myTeam.id, entry.requesterId);
              Toast.show({ type: 'success', text1: 'Removido da fila' });
            } catch (e) {
              console.warn('[CaptainDashboard] remove waitlist failed:', e);
              Toast.show({ type: 'error', text1: 'Erro ao remover' });
            } finally {
              setWaitlistActionId(null);
            }
          },
        },
      ]
    );
  }, [myTeam]);

  // Player status handlers
  const openPlayerStatusSheet = useCallback((player: Player) => {
    setSelectedPlayer(player);
    playerStatusSheetRef.current?.expand();
  }, []);

  const handleUpdatePlayerStatus = useCallback(async (status: PlayerStatus) => {
    if (!selectedPlayer) return;
    try {
      await updateDocument('players', selectedPlayer.id, { status });
      useTeamStore.getState().updatePlayer(selectedPlayer.id, { status });
      playerStatusSheetRef.current?.close();
      Toast.show({ 
        type: 'success', 
        text1: status === 'ativo' ? 'Jogador ativado' : status === 'lesionado' ? 'Marcado como lesionado' : 'Jogador suspenso',
      });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Erro ao atualizar status' });
    }
  }, [selectedPlayer]);

  // Vacancy control handlers
  const handleToggleRegistration = useCallback(async () => {
    if (!myTeam) return;
    const newValue = !registrationOpen;
    try {
      await updateDocument('teams', myTeam.id, { registrationOpen: newValue });
      updateTeam(myTeam.id, { registrationOpen: newValue });
      Toast.show({ 
        type: 'success', 
        text1: newValue ? 'Inscrições abertas' : 'Inscrições fechadas',
      });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Erro ao atualizar' });
    }
  }, [myTeam, registrationOpen, updateTeam]);

  const openVacancySheet = useCallback(() => {
    setEditMaxPlayers(String(maxPlayers));
    vacancySheetRef.current?.expand();
  }, [maxPlayers]);

  const handleSaveMaxPlayers = useCallback(async () => {
    if (!myTeam) return;
    const newMax = Math.max(currentPlayers, Math.min(30, parseInt(editMaxPlayers) || 15));
    try {
      await updateDocument('teams', myTeam.id, { maxPlayers: newMax });
      updateTeam(myTeam.id, { maxPlayers: newMax });
      vacancySheetRef.current?.close();
      Toast.show({ type: 'success', text1: `Limite ajustado para ${newMax} atletas` });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Erro ao salvar' });
    }
  }, [myTeam, currentPlayers, editMaxPlayers, updateTeam]);

  const [codeCopied, setCodeCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const handleCopyCode = useCallback(async () => {
    if (!myTeam) return;
    await Clipboard.setStringAsync(myTeam.inviteCode);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCodeCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCodeCopied(false), 1800);
    Toast.show({ type: 'success', text1: 'Código copiado!' });
  }, [myTeam]);

  const renderBackdrop = useCallback(
    (props: any) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />,
    []
  );

  // Countdown for next match
  const [countdown, setCountdown] = useState('');
  useEffect(() => {
    if (!nextMatch?.scheduledAt) {
      setCountdown('');
      return;
    }

    const updateCountdown = () => {
      const diff = new Date(nextMatch.scheduledAt!).getTime() - Date.now();
      if (diff <= 0) {
        setCountdown('Agora!');
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      if (days > 0) setCountdown(`${days}d ${hours}h`);
      else if (hours > 0) setCountdown(`${hours}h ${mins}min`);
      else setCountdown(`${mins} min`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [nextMatch?.scheduledAt]);

  if (!myTeam) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="🛡️"
            title="Você não é capitão"
            description="Crie ou assuma a capitania de um time para acessar este painel."
          />
        </View>
      </SafeAreaView>
    );
  }

  const opponent = nextMatch
    ? teams.find((t) => t.id === (nextMatch.homeTeamId === myTeam.id ? nextMatch.awayTeamId : nextMatch.homeTeamId))
    : null;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.bg200}
            title="Atualizando..."
            titleColor={colors.textSecondary}
          />
        }
      >
        {/* Hero Section */}
        <LinearGradient
          colors={[myTeam.primaryColor, myTeam.secondaryColor]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <SafeAreaView edges={['top']} style={styles.heroSafe}>
            <View style={styles.heroContent}>
              <View style={styles.heroLeft}>
                <TeamLogo team={myTeam} size={64} style={styles.heroLogo} />
              </View>
              <View style={styles.heroInfo}>
                <Text style={styles.heroName}>{myTeam.name}</Text>
                <Text style={styles.heroMeta}>
                  {roster.length} atletas · {championship?.name ?? 'Campeonato'}
                </Text>
                <Badge
                  label={myTeam.status === 'aprovado' ? 'APROVADO' : 'PENDENTE'}
                  variant={myTeam.status === 'aprovado' ? 'approved' : 'pending'}
                />
              </View>
              <View style={styles.heroActions}>
                <TouchableOpacity
                  style={styles.heroActionBtn}
                  onPress={() => {
                    if (myTeam?.championshipId) {
                      navigation.navigate('Announcements', { championshipId: myTeam.championshipId });
                    }
                  }}
                >
                  <Ionicons name="notifications-outline" size={20} color="#fff" />
                  {announcementsUnread > 0 && (
                    <View style={styles.heroActionBadge}>
                      <Text style={styles.heroActionBadgeText}>
                        {announcementsUnread > 9 ? '9+' : String(announcementsUnread)}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.heroActionBtn} onPress={openEditSheet}>
                  <Ionicons name="create-outline" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
        </LinearGradient>

        {/* Stats Section */}
        <View style={styles.section}>
          <SectionHeader title="DESEMPENHO" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.statsRow}
          >
            <StatCard icon="🏆" label="Posição" value={`${myPosition}º`} />
            <StatCard icon="⭐" label="Pontos" value={myStanding?.points ?? 0} />
            <StatCard icon="⚽" label="Gols pró" value={myStanding?.goalsFor ?? 0} />
            <StatCard icon="🛡️" label="Gols contra" value={myStanding?.goalsAgainst ?? 0} />
          </ScrollView>
        </View>

        {/* Pendências summary */}
        {(pendingTotal > 0 || pendingSummaryPartial) && (
          <View style={styles.pendingSummaryWrap}>
            <PendingSummaryCard
              total={pendingTotal}
              criticalCount={pendingCritical}
              topItem={pendingTop}
              isPartial={pendingSummaryPartial}
              partialReason={pendingPartialReason}
              onPress={() => navigation.navigate('PendingCenter')}
              testID="pending-summary-captain"
            />
          </View>
        )}

        {/* Next Match Section */}
        {nextMatch && (
          <View style={styles.section}>
            <SectionHeader title="PRÓXIMA PARTIDA" />
            <AppCard style={styles.nextMatchCard}>
              <Text style={styles.nextMatchLabel}>PROXIMA PARTIDA</Text>
              <View style={styles.nextMatchRow}>
                {opponent ? (
                  <TeamLogo team={opponent} size={32} />
                ) : (
                  <TeamColorDot color={colors.textMuted} size={14} />
                )}
                <Text style={styles.nextMatchTeam}>{opponent?.name ?? 'Adversario'}</Text>
              </View>
              <Text style={styles.nextMatchRound}>Rodada {nextMatch.round}</Text>
              {countdown && (
                <View style={styles.countdownWrap}>
                  <Ionicons name="time-outline" size={16} color={colors.accent} />
                  <Text style={styles.countdownText}>{countdown}</Text>
                </View>
              )}
            </AppCard>

            {suspendedNextRound.length > 0 && (
              <View style={styles.suspWarnCard}>
                <View style={styles.suspWarnHeader}>
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  <Text style={styles.suspWarnTitle}>
                    {suspendedNextRound.length === 1
                      ? 'Desfalque por suspensão'
                      : `${suspendedNextRound.length} desfalques por suspensão`}
                  </Text>
                </View>
                {suspendedNextRound.map((s) => (
                  <View key={s.playerId} style={styles.suspWarnRow}>
                    <Ionicons name="person-remove-outline" size={14} color={colors.textSecondary} />
                    <Text style={styles.suspWarnName} numberOfLines={1}>{s.playerName}</Text>
                    <Text style={styles.suspWarnReason}>
                      {s.reason === 'cartao_vermelho' ? 'Cartão vermelho' : 'Amarelos acumulados'}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Invite Code */}
        <View style={styles.section}>
          <AppCard style={styles.inviteCard}>
            <Text style={styles.inviteLabel}>CÓDIGO DO TIME</Text>
            <Text style={styles.inviteCode}>{myTeam.inviteCode}</Text>
            <TouchableOpacity
              style={[styles.copyBtn, codeCopied && styles.copyBtnDone]}
              onPress={handleCopyCode}
              activeOpacity={0.85}
            >
              <Ionicons
                name={codeCopied ? 'checkmark-circle' : 'copy-outline'}
                size={18}
                color={codeCopied ? colors.success : colors.accent}
              />
              <Text style={[styles.copyBtnText, codeCopied && styles.copyBtnTextDone]}>
                {codeCopied ? 'Copiado!' : 'Copiar'}
              </Text>
            </TouchableOpacity>
          </AppCard>
        </View>

        {/* Vacancy Control Section */}
        <View style={styles.section}>
          <SectionHeader title="CONTROLE DE VAGAS" />
          <AppCard style={styles.vacancyCard}>
            <View style={styles.vacancyHeader}>
              <View style={styles.vacancyInfo}>
                <Text style={styles.vacancyCount}>{currentPlayers} / {maxPlayers}</Text>
                <Text style={styles.vacancyLabel}>vagas ocupadas</Text>
              </View>
              <TouchableOpacity style={styles.adjustVacancyBtn} onPress={openVacancySheet}>
                <Ionicons name="settings-outline" size={18} color={colors.accent} />
                <Text style={styles.adjustVacancyBtnText}>Ajustar</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.progressBarWrap}>
              <View style={styles.progressBarBg}>
                <View 
                  style={[
                    styles.progressBarFill, 
                    { 
                      width: `${Math.min(100, occupancyPercent)}%`,
                      backgroundColor: occupancyPercent >= 100 ? colors.danger : occupancyPercent >= 80 ? colors.warning : colors.accent,
                    }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>
                {availableSlots > 0 ? `${availableSlots} vagas disponíveis` : 'Time completo'}
              </Text>
            </View>

            <View style={styles.registrationToggle}>
              <View style={styles.registrationToggleInfo}>
                <Ionicons 
                  name={registrationOpen ? 'checkmark-circle' : 'close-circle'} 
                  size={20} 
                  color={registrationOpen ? colors.success : colors.danger} 
                />
                <Text style={styles.registrationToggleText}>Aceitando novos atletas</Text>
              </View>
              <Switch
                value={registrationOpen}
                onValueChange={handleToggleRegistration}
                trackColor={{ false: colors.bg300, true: colors.success }}
                thumbColor="#fff"
              />
            </View>
            
            {!registrationOpen && (
              <View style={styles.closedBadge}>
                <Text style={styles.closedBadgeText}>INSCRIÇÕES FECHADAS</Text>
              </View>
            )}
          </AppCard>
        </View>

        {/* Waitlist Section — só aparece se houver gente na fila */}
        {waitlist.length > 0 && (
          <View style={styles.section}>
            <View style={styles.waitlistHeaderRow}>
              <SectionHeader title="FILA DE ESPERA" />
              <View style={styles.waitlistCountBadge}>
                <Text style={styles.waitlistCountText}>{waitlist.length}</Text>
              </View>
            </View>
            {waitlist.map((entry, index) => {
              const entryDate = formatWaitlistDate(entry.createdAt);
              const busy = waitlistActionId === entry.id;
              return (
                <AppCard key={entry.id} style={styles.waitlistCard}>
                  <View style={styles.waitlistPositionBadge}>
                    <Text style={styles.waitlistPositionText}>
                      {ORDINALS[index] ?? `${index + 1}º`}
                    </Text>
                  </View>
                  <View style={styles.waitlistInfo}>
                    <Text style={styles.waitlistName} numberOfLines={1}>{entry.requesterName}</Text>
                    {entryDate && (
                      <Text style={styles.waitlistDate}>Entrou em {entryDate}</Text>
                    )}
                  </View>
                  <View style={styles.waitlistActions}>
                    <TouchableOpacity
                      style={[styles.waitlistChip, styles.waitlistApproveChip]}
                      onPress={() => handleApproveWaitlist(entry)}
                      disabled={busy}
                    >
                      <Ionicons name="checkmark" size={16} color={colors.success} />
                      <Text style={[styles.waitlistChipText, { color: colors.success }]}>Aprovar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.waitlistChip, styles.waitlistRemoveChip]}
                      onPress={() => handleRemoveWaitlist(entry)}
                      disabled={busy}
                    >
                      <Ionicons name="close" size={16} color={colors.danger} />
                      <Text style={[styles.waitlistChipText, { color: colors.danger }]}>Remover</Text>
                    </TouchableOpacity>
                  </View>
                </AppCard>
              );
            })}
          </View>
        )}

        {/* Convocation Section */}
        <View style={styles.section}>
          <SectionHeader
            title={`CONVOCAÇÃO — Rodada ${currentRound}`}
            action={{
              text: 'Convidar +',
              onPress: handleCopyCode,
            }}
          />
          <Text style={styles.convocationHint}>
            Deslize para remover · Pressione longamente para opções · Toggle para convocar
          </Text>
          {roster.length === 0 ? (
            <EmptyState
              icon="⚽"
              title="Sem atletas"
              description="Compartilhe o código do time para adicionar jogadores."
            />
          ) : (
            roster.map((player) => (
              <SwipeablePlayerRow
                key={player.id}
                player={player}
                goals={playerGoals[player.id] ?? 0}
                yellowCards={playerYellows[player.id] ?? 0}
                isConvoked={convocations.has(player.id)}
                onToggleConvoke={() => handleToggleConvocation(player.id)}
                onPress={() => navigation.navigate('AthleteProfile', {
                  userId: player.userId,
                  championshipId: championship?.id,
                })}
                onLongPress={() => openPlayerStatusSheet(player)}
                onRemove={() => handleRemovePlayer(player)}
              />
            ))
          )}
        </View>

        {/* Recent Matches */}
        {finishedMatches.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="ÚLTIMAS PARTIDAS" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.matchesRow}
            >
              {finishedMatches.map((match) => (
                <MatchResultCard
                  key={match.id}
                  match={match}
                  myTeamId={myTeam.id}
                  teams={teams}
                />
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Edit Team BottomSheet */}
      <BottomSheet
        ref={editSheetRef}
        index={-1}
        snapPoints={editSnapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
      >
        <BottomSheetView style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Editar Time</Text>
          
          <Text style={styles.sheetLabel}>Nome do time</Text>
          <BottomSheetTextInput
            style={styles.sheetInput}
            value={editName}
            onChangeText={setEditName}
            placeholder="Nome do time"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.sheetLabel}>Cor primária</Text>
          <TeamColorPicker
            selected={editPrimaryColor}
            onSelect={setEditPrimaryColor}
            exclude={editSecondaryColor}
          />

          <Text style={styles.sheetLabel}>Cor secundária</Text>
          <TeamColorPicker
            selected={editSecondaryColor}
            onSelect={setEditSecondaryColor}
            exclude={editPrimaryColor}
          />

          <AppButton
            title="Salvar alterações"
            onPress={handleSaveTeam}
            fullWidth
            style={styles.sheetBtn}
          />
        </BottomSheetView>
      </BottomSheet>

      {/* Player Status BottomSheet */}
      <BottomSheet
        ref={playerStatusSheetRef}
        index={-1}
        snapPoints={playerStatusSnapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
      >
        <BottomSheetView style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>
            {selectedPlayer?.name ?? 'Jogador'}
          </Text>
          
          <TouchableOpacity 
            style={styles.statusOption}
            onPress={() => {
              playerStatusSheetRef.current?.close();
              if (selectedPlayer) {
                navigation.navigate('AthleteProfile', {
                  userId: selectedPlayer.userId,
                  championshipId: championship?.id,
                });
              }
            }}
          >
            <Ionicons name="person-outline" size={22} color={colors.textPrimary} />
            <Text style={styles.statusOptionText}>Ver perfil</Text>
          </TouchableOpacity>

          {selectedPlayer?.status !== 'lesionado' && (
            <TouchableOpacity 
              style={styles.statusOption}
              onPress={() => handleUpdatePlayerStatus('lesionado')}
            >
              <Text style={styles.statusOptionIcon}>🤕</Text>
              <Text style={styles.statusOptionText}>Marcar como lesionado</Text>
            </TouchableOpacity>
          )}

          {selectedPlayer?.status !== 'suspenso' && (
            <TouchableOpacity 
              style={styles.statusOption}
              onPress={() => handleUpdatePlayerStatus('suspenso')}
            >
              <Text style={styles.statusOptionIcon}>🚫</Text>
              <Text style={styles.statusOptionText}>Suspender jogador</Text>
            </TouchableOpacity>
          )}

          {selectedPlayer?.status !== 'ativo' && (
            <TouchableOpacity 
              style={[styles.statusOption, styles.statusOptionSuccess]}
              onPress={() => handleUpdatePlayerStatus('ativo')}
            >
              <Ionicons name="checkmark-circle-outline" size={22} color={colors.success} />
              <Text style={[styles.statusOptionText, { color: colors.success }]}>Reativar jogador</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity 
            style={[styles.statusOption, styles.statusOptionDanger]}
            onPress={() => {
              playerStatusSheetRef.current?.close();
              if (selectedPlayer) {
                handleRemovePlayer(selectedPlayer);
              }
            }}
          >
            <Ionicons name="trash-outline" size={22} color={colors.danger} />
            <Text style={[styles.statusOptionText, { color: colors.danger }]}>Remover do time</Text>
          </TouchableOpacity>
        </BottomSheetView>
      </BottomSheet>

      {/* Vacancy Control BottomSheet */}
      <BottomSheet
        ref={vacancySheetRef}
        index={-1}
        snapPoints={['35%']}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
      >
        <BottomSheetView style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Ajustar vagas</Text>
          
          <Text style={styles.sheetLabel}>Máximo de atletas no elenco</Text>
          <View style={styles.vacancyInputRow}>
            <TouchableOpacity
              style={styles.vacancyBtn}
              onPress={() => setEditMaxPlayers(String(Math.max(currentPlayers, parseInt(editMaxPlayers) - 1)))}
            >
              <Ionicons name="remove" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <BottomSheetTextInput
              style={styles.vacancyInput}
              value={editMaxPlayers}
              onChangeText={(t) => setEditMaxPlayers(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              maxLength={2}
            />
            <TouchableOpacity
              style={styles.vacancyBtn}
              onPress={() => setEditMaxPlayers(String(Math.min(30, parseInt(editMaxPlayers) + 1)))}
            >
              <Ionicons name="add" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.vacancyHint}>
            Mínimo: {currentPlayers} (atletas atuais) · Máximo: 30
          </Text>

          <AppButton
            title="Salvar"
            onPress={handleSaveMaxPlayers}
            fullWidth
            style={styles.sheetBtn}
          />
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  hero: {
    minHeight: 180,
  },
  heroSafe: {
    flex: 1,
  },
  heroContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 16,
  },
  heroLeft: {},
  heroLogo: {
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  heroInfo: {
    flex: 1,
    gap: 4,
  },
  heroName: {
    fontFamily: 'Barlow-Black',
    fontSize: 28,
    color: '#fff',
    lineHeight: 32,
  },
  heroMeta: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  editBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroActionBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  heroActionBadgeText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 8,
    color: '#fff',
  },
  pendingSummaryWrap: {
    marginTop: 16,
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  statsRow: {
    gap: 12,
    paddingTop: 12,
  },
  statCard: {
    width: 100,
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  statIcon: {
    fontSize: 22,
  },
  statValue: {
    fontFamily: 'Barlow-Black',
    fontSize: 24,
    color: colors.textPrimary,
  },
  statLabel: {
    fontFamily: 'Barlow-Medium',
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  nextMatchCard: {
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    marginTop: 12,
  },
  nextMatchLabel: {
    fontFamily: 'Barlow-Bold',
    fontSize: 11,
    letterSpacing: 1,
    color: colors.accent,
    marginBottom: 8,
  },
  nextMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  nextMatchTeam: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 20,
    color: colors.textPrimary,
  },
  nextMatchRound: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textSecondary,
  },
  countdownWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    backgroundColor: colors.accentGlow,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  countdownText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.accent,
  },
  suspWarnCard: {
    marginTop: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,59,71,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,71,0.28)',
  },
  suspWarnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  suspWarnTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 13,
    color: colors.danger,
  },
  suspWarnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
  },
  suspWarnName: {
    flex: 1,
    fontFamily: 'Barlow-SemiBold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  suspWarnReason: {
    fontFamily: 'Barlow-Medium',
    fontSize: 11,
    color: colors.textSecondary,
  },
  inviteCard: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: colors.bg300,
  },
  inviteLabel: {
    fontFamily: 'Barlow-Bold',
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.accent,
    marginBottom: 8,
  },
  inviteCode: {
    fontFamily: 'Barlow-Black',
    fontSize: 36,
    color: colors.textPrimary,
    letterSpacing: 4,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.accentGlow,
    borderRadius: 20,
  },
  copyBtnDone: {
    backgroundColor: 'rgba(0,200,83,0.14)',
  },
  copyBtnText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    color: colors.accent,
  },
  copyBtnTextDone: {
    color: colors.success,
  },
  convocationHint: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 8,
    marginBottom: 12,
  },
  swipeContainer: {
    marginBottom: 8,
    overflow: 'hidden',
    borderRadius: 12,
  },
  swipeActions: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 100,
    backgroundColor: colors.danger,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeAction: {
    alignItems: 'center',
    gap: 4,
  },
  removeActionText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 11,
    color: '#fff',
  },
  playerRowAnimated: {
    backgroundColor: colors.bg200,
    borderRadius: 12,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  playerAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerInitials: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
  },
  playerInfo: {
    flex: 1,
    gap: 2,
  },
  playerName: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  playerPos: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
  },
  playerNumberBadge: {
    backgroundColor: colors.bg300,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  playerNumber: {
    fontFamily: 'Barlow-Bold',
    fontSize: 13,
    color: colors.textPrimary,
  },
  playerStats: {
    flexDirection: 'row',
    gap: 6,
  },
  statText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 12,
    color: colors.textSecondary,
  },
  convocationSwitch: {
    transform: [{ scale: 0.8 }],
  },
  matchesRow: {
    gap: 12,
    paddingTop: 12,
  },
  matchResultCard: {
    width: 140,
    padding: 14,
    gap: 8,
  },
  matchResultTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchResultRound: {
    fontFamily: 'Barlow-Medium',
    fontSize: 11,
    color: colors.textMuted,
  },
  resultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  resultBadgeText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 11,
  },
  matchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  matchResultTeam: {
    fontFamily: 'Barlow-Medium',
    fontSize: 13,
    color: colors.textPrimary,
    flex: 1,
  },
  matchResultScore: {
    fontFamily: 'Barlow-Black',
    fontSize: 20,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  sheetContent: {
    padding: 20,
    gap: 16,
  },
  sheetTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 20,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  sheetLabel: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  sheetInput: {
    backgroundColor: colors.bg300,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Barlow-Medium',
    fontSize: 15,
    color: colors.textPrimary,
  },
  sheetBtn: {
    marginTop: 8,
  },
  colorPickerRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  colorDotSelected: {
    borderColor: colors.accent,
  },
  colorDotExcluded: {
    opacity: 0.25,
  },

  // Player status badges
  playerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeWarning: {
    backgroundColor: `${colors.warning}22`,
  },
  statusBadgeDanger: {
    backgroundColor: `${colors.danger}22`,
  },
  statusBadgeText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 10,
    color: colors.textPrimary,
  },
  playerRowInactive: {
    opacity: 0.7,
  },
  avatarInactive: {
    opacity: 0.5,
  },
  textInactive: {
    color: colors.textSecondary,
  },

  // Vacancy control
  vacancyCard: {
    padding: 16,
    marginTop: 12,
    gap: 16,
  },
  vacancyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  vacancyInfo: {
    gap: 2,
  },
  vacancyCount: {
    fontFamily: 'Barlow-Black',
    fontSize: 28,
    color: colors.textPrimary,
  },
  vacancyLabel: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textSecondary,
  },
  adjustVacancyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accentGlow,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  adjustVacancyBtnText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    color: colors.accent,
  },
  progressBarWrap: {
    gap: 8,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: colors.bg300,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 12,
    color: colors.textSecondary,
  },
  registrationToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  registrationToggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  registrationToggleText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 14,
    color: colors.textPrimary,
  },
  closedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: `${colors.danger}22`,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  closedBadgeText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 11,
    color: colors.danger,
    letterSpacing: 0.5,
  },

  // Player status sheet options
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statusOptionIcon: {
    fontSize: 22,
    width: 24,
    textAlign: 'center',
  },
  statusOptionText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 16,
    color: colors.textPrimary,
  },
  statusOptionSuccess: {
    borderBottomWidth: 0,
    marginTop: 8,
    backgroundColor: `${colors.success}11`,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  statusOptionDanger: {
    borderBottomWidth: 0,
    marginTop: 8,
    backgroundColor: `${colors.danger}11`,
    borderRadius: 12,
    paddingHorizontal: 14,
  },

  // Vacancy sheet
  vacancyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 8,
  },
  vacancyBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bg300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vacancyInput: {
    width: 80,
    height: 56,
    backgroundColor: colors.bg300,
    borderRadius: 12,
    fontFamily: 'Barlow-Black',
    fontSize: 28,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  vacancyHint: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },

  // Waitlist
  waitlistHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  waitlistCountBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  waitlistCountText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 12,
    color: colors.bg100,
  },
  waitlistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginTop: 12,
  },
  waitlistPositionBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitlistPositionText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 13,
    color: colors.accent,
  },
  waitlistInfo: {
    flex: 1,
    gap: 2,
  },
  waitlistName: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  waitlistDate: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textMuted,
  },
  waitlistActions: {
    flexDirection: 'row',
    gap: 8,
  },
  waitlistChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  waitlistApproveChip: {
    backgroundColor: `${colors.success}1A`,
  },
  waitlistRemoveChip: {
    backgroundColor: `${colors.danger}1A`,
  },
  waitlistChipText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
  },
});
