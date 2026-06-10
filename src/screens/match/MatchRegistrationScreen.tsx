import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import Animated, { SlideInLeft } from 'react-native-reanimated';
import { AppButton } from '../../components/AppButton';
import { AppCard } from '../../components/AppCard';
import { SectionHeader } from '../../components/SectionHeader';
import { TeamColorDot } from '../../components/TeamColorDot';
import { colors } from '../../theme/colors';
import { useMatchStore } from '../../stores/matchStore';
import { useTeamStore } from '../../stores/teamStore';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useAuthStore } from '../../stores/authStore';
import { Championship, MatchEvent, MatchEventType, MatchModel } from '../../types';
import { addDocument, updateDocument, deleteDocument } from '../../services/index';
import { db } from '../../services/firebase';
import { collection, doc, runTransaction, serverTimestamp, writeBatch } from 'firebase/firestore';
import { FixturesStackParamList } from '../../navigation/FixturesStackNavigator';
import {
  notifyGoal,
  notifyMatchStarted,
  notifyMatchFinished,
} from '../../services/notificationService';
import { checkAndGrantAchievements } from '../../services/achievementService';
import { getPlayerSuspensionReason } from '../../services/statsService';
import { finishChampionship } from '../../services/championshipFinisher';
import { AchievementToast } from '../../components/AchievementToast';
import { AchievementDefinition } from '../../types';
import { ACHIEVEMENTS } from '../../utils/achievementDefinitions';
import { isPlayerInTeamActive } from '../../utils/teamRules';
import { useVotingStore } from '../../stores/votingStore';
import { generateBracketFixtures, getGroupClassified } from '../../utils/roundRobin';

type RouteT = RouteProp<FixturesStackParamList, 'MatchRegistration'>;
type NavT = NativeStackNavigationProp<FixturesStackParamList>;

const EVENT_ICON: Record<MatchEventType, string> = {
  gol: '⚽',
  assistencia: '👟',
  cartao_amarelo: '🟨',
  cartao_vermelho: '🟥',
};

const TYPE_DEFS: Array<{ value: MatchEventType; label: string; color: string }> = [
  { value: 'gol', label: '⚽ Gol', color: colors.accent },
  { value: 'assistencia', label: '👟 Assistência', color: colors.success },
  { value: 'cartao_amarelo', label: '🟨 Amarelo', color: colors.warning },
  { value: 'cartao_vermelho', label: '🟥 Vermelho', color: colors.danger },
];

type GroupKnockoutPlan = {
  knockoutMatches: MatchModel[];
  championshipUpdate: Pick<
    Championship,
    'groupStageComplete' | 'knockoutStartRound' | 'totalRounds'
  >;
  groupMatchIds: string[];
};

type FinalizeTransactionResult = {
  suspendedPlayerIds: string[];
  reactivatedPlayerIds: string[];
  nextCurrentRound: number | null;
  nextMatchIdToUpdate: string | null;
  nextMatchUpdate: Partial<MatchModel> | null;
  knockoutFinalReached: boolean;
  groupKnockoutMatches: MatchModel[];
  groupChampionshipUpdate: GroupKnockoutPlan['championshipUpdate'] | null;
};

function EventTypePill({ type }: { type: MatchEventType }) {
  const background =
    type === 'gol'
      ? colors.accent
      : type === 'assistencia'
      ? colors.success
      : type === 'cartao_amarelo'
      ? colors.warning
      : colors.danger;

  return (
    <View style={[styles.eventIconPill, { backgroundColor: background }]}>
      <Text style={styles.eventIconText}>{EVENT_ICON[type]}</Text>
    </View>
  );
}

export function MatchRegistrationScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { matchId } = route.params;

  const { matches, events, addEvent, removeEvent, updateMatch, startMatch } = useMatchStore();
  const { teams, players } = useTeamStore();
  const { championships, updateChampionship } = useChampionshipStore();
  const user = useAuthStore((s) => s.user);
  const { awards } = useVotingStore();
  const [toastQueue, setToastQueue] = useState<AchievementDefinition[]>([]);
  const [showPenaltySheet, setShowPenaltySheet] = useState(false);
  const [penaltyHome, setPenaltyHome] = useState('');
  const [penaltyAway, setPenaltyAway] = useState('');
  const [pendingFinalScores, setPendingFinalScores] = useState<{ home: number; away: number } | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  // FE-01: estados de loading para evitar double-submit em ações críticas
  const [addingEvent, setAddingEvent] = useState(false);
  const [removingEventId, setRemovingEventId] = useState<string | null>(null);
  const [startingMatch, setStartingMatch] = useState(false);

  const match = matches.find((m) => m.id === matchId);
  const matchEvents = events
    .filter((e) => e.matchId === matchId)
    .sort((a, b) => a.minute - b.minute);

  const homeTeam = teams.find((t) => t.id === match?.homeTeamId);
  const awayTeam = teams.find((t) => t.id === match?.awayTeamId);
  const matchChampionship = championships.find((c) => c.id === match?.championshipId);
  const canManageMatch =
    user?.role === 'organizador' && matchChampionship?.organizerId === user?.id;

  const isLive = match?.status === 'ao_vivo';

  const liveHomeScore = matchEvents.filter(
    (e) => e.teamId === match?.homeTeamId && e.type === 'gol',
  ).length;
  const liveAwayScore = matchEvents.filter(
    (e) => e.teamId === match?.awayTeamId && e.type === 'gol',
  ).length;

  const [homeScore, setHomeScore] = useState(
    match?.homeScore != null ? String(match.homeScore) : '',
  );
  const [awayScore, setAwayScore] = useState(
    match?.awayScore != null ? String(match.awayScore) : '',
  );
  const [homeFocused, setHomeFocused] = useState(false);
  const [awayFocused, setAwayFocused] = useState(false);

  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['74%'], []);

  const [bsType, setBsType] = useState<MatchEventType>('gol');
  const [bsTeamId, setBsTeamId] = useState('');
  const [bsPlayerId, setBsPlayerId] = useState('');
  const [bsMinute, setBsMinute] = useState('');

  const championshipRules = championships.find((c) => c.id === match?.championshipId)?.rules;
  const yellowLimit = championshipRules?.yellowCardLimit ?? 3;
  const redCardSuspend = championshipRules?.redCardSuspend !== false;

  // Finished matches drive the cycle-based suspension calculation (cards from the
  // current, not-yet-finalized match correctly do not count toward this round).
  const finishedMatches = useMemo(
    () => matches.filter((m) => m.status === 'finalizado'),
    [matches],
  );

  const checkSuspended = useCallback(
    (p: (typeof players)[0]) => {
      if (p.status === 'suspenso' || p.status === 'lesionado') return true;
      if (p.suspendedRound != null && match && p.suspendedRound === match.round) return true;
      if (
        match &&
        getPlayerSuspensionReason(events, finishedMatches, p.id, match.round, yellowLimit) != null
      ) {
        return true;
      }
      return false;
    },
    [match, events, finishedMatches, yellowLimit],
  );

  // Filter players to only show active, non-suspended players.
  // Atletas removidos (AUD-04) mantêm teamId para preservar histórico, mas NÃO
  // podem receber novos eventos — por isso são excluídos do seletor.
  const bsPlayers = bsTeamId
    ? players.filter((p) => isPlayerInTeamActive(p, bsTeamId) && !checkSuspended(p))
    : [];

  const suspendedWarning = useMemo(
    () =>
      match
        ? players.filter(
            (p) =>
              (isPlayerInTeamActive(p, match.homeTeamId) ||
                isPlayerInTeamActive(p, match.awayTeamId)) &&
              checkSuspended(p),
          )
        : [],
    [players, match, checkSuspended],
  );

  const handleTeamSelect = (teamId: string) => {
    setBsTeamId(teamId);
    setBsPlayerId('');
  };

  const openBottomSheet = () => {
    if (!canManageMatch) return;
    setBsType('gol');
    setBsTeamId('');
    setBsPlayerId('');
    setBsMinute('');
    bottomSheetRef.current?.expand();
  };

  const handleAddEvent = async () => {
    // FE-01: bloqueia double-submit
    if (!canManageMatch || addingEvent) return;
    const minute = parseInt(bsMinute, 10);
    if (!bsTeamId || !bsPlayerId || !minute || !match) return;
    if (minute < 1 || minute > 120) {
      Alert.alert('Minuto inválido', 'Informe um minuto entre 1 e 120.');
      return;
    }

    bottomSheetRef.current?.close();
    setAddingEvent(true);

    try {
      const createdAt = new Date().toISOString();
      // AUD-04: grava snapshot do nome do atleta/time no próprio evento, para que a
      // artilharia, disciplina e o histórico não dependam do documento do player/team
      // continuar existindo (ex.: atleta removido depois).
      const playerSnapshot = players.find((p) => p.id === bsPlayerId);
      const teamSnapshot = teams.find((t) => t.id === bsTeamId);
      const eventData = {
        matchId,
        championshipId: match.championshipId,
        type: bsType,
        teamId: bsTeamId,
        playerId: bsPlayerId,
        playerName: playerSnapshot?.name ?? '',
        teamName: teamSnapshot?.name ?? '',
        minute,
        createdAt,
      };

      // FE-01: para GOLS no modo ao vivo, usamos batch atômico para evento + placar
      if (isLive && bsType === 'gol') {
        const newHome = liveHomeScore + (bsTeamId === match.homeTeamId ? 1 : 0);
        const newAway = liveAwayScore + (bsTeamId === match.awayTeamId ? 1 : 0);
        const eventRef = doc(collection(db, 'match_events'));
        const batch = writeBatch(db);

        batch.set(eventRef, {
          ...eventData,
          createdAt: serverTimestamp(),
        });
        batch.update(doc(db, 'matches', matchId), { homeScore: newHome, awayScore: newAway });

        // FE-01: evento + placar confirmam juntos antes de refletir no store local.
        await batch.commit();

        const event: MatchEvent = {
          id: eventRef.id,
          matchId,
          championshipId: match.championshipId,
          type: bsType,
          teamId: bsTeamId,
          playerId: bsPlayerId,
          playerName: eventData.playerName,
          teamName: eventData.teamName,
          minute,
          createdAt,
        };
        addEvent(event);
        updateMatch(matchId, { homeScore: newHome, awayScore: newAway });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

        const scorer = players.find((p) => p.id === bsPlayerId);
        const scorerTeam = teams.find((t) => t.id === bsTeamId);
        if (scorer && scorerTeam && homeTeam && awayTeam) {
          notifyGoal(
            match.championshipId,
            scorer.name,
            scorerTeam.name,
            homeTeam.name,
            awayTeam.name,
            newHome,
            newAway,
          ).catch(() => {});
        }
      } else {
        // Eventos não-gol ou partida não ao vivo
        const firestoreId = await addDocument('match_events', eventData);
        const event: MatchEvent = {
          id: firestoreId,
          matchId,
          championshipId: match.championshipId,
          type: bsType,
          teamId: bsTeamId,
          playerId: bsPlayerId,
          playerName: eventData.playerName,
          teamName: eventData.teamName,
          minute,
          createdAt,
        };
        addEvent(event);

        if (bsType === 'gol') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      }
    } catch (err) {
      console.warn('[MatchRegistration] addEvent error:', err);
      Alert.alert(
        'Erro ao registrar evento',
        bsType === 'gol'
          ? 'Falha ao registrar o gol. Verifique a conexão e tente novamente.'
          : 'Falha ao registrar o evento. Verifique a conexão e tente novamente.',
      );
    } finally {
      setAddingEvent(false);
    }
  };

  const handleRemoveEvent = (eventId: string) => {
    // FE-01: bloqueia se já está removendo outro evento
    if (!canManageMatch || removingEventId) return;
    Alert.alert('Remover evento', 'Remover este evento da partida?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          const removing = matchEvents.find((e) => e.id === eventId);
          if (!removing) return;

          setRemovingEventId(eventId);
          try {
            // FE-01: para GOLS no modo ao vivo, aguarda confirmação do Firestore
            if (isLive && removing.type === 'gol' && match) {
              const newHome = Math.max(0, liveHomeScore - (removing.teamId === match.homeTeamId ? 1 : 0));
              const newAway = Math.max(0, liveAwayScore - (removing.teamId === match.awayTeamId ? 1 : 0));
              const batch = writeBatch(db);

              batch.delete(doc(db, 'match_events', eventId));
              batch.update(doc(db, 'matches', matchId), { homeScore: newHome, awayScore: newAway });

              await batch.commit();

              removeEvent(eventId);
              updateMatch(matchId, { homeScore: newHome, awayScore: newAway });
            } else {
              await deleteDocument('match_events', eventId);
              removeEvent(eventId);
            }
          } catch (err) {
            console.warn('[MatchRegistration] removeEvent error:', err);
            Alert.alert(
              'Erro ao remover evento',
              removing.type === 'gol'
                ? 'Falha ao remover o gol. Verifique a conexão e tente novamente.'
                : 'Falha ao remover o evento. Verifique a conexão e tente novamente.',
            );
          } finally {
            setRemovingEventId(null);
          }
        },
      },
    ]);
  };

  const homeScoreNum = homeScore === '' ? null : parseInt(homeScore, 10);
  const awayScoreNum = awayScore === '' ? null : parseInt(awayScore, 10);

  const homeGoalsRegistered = matchEvents.filter(
    (e) => e.teamId === match?.homeTeamId && e.type === 'gol',
  ).length;
  const awayGoalsRegistered = matchEvents.filter(
    (e) => e.teamId === match?.awayTeamId && e.type === 'gol',
  ).length;

  const homeGoalMismatch = homeScoreNum !== null && homeGoalsRegistered !== homeScoreNum;
  const awayGoalMismatch = awayScoreNum !== null && awayGoalsRegistered !== awayScoreNum;

  const canFinalize = canManageMatch && (isLive || (homeScoreNum !== null && awayScoreNum !== null));
  const bsMinuteNumber = parseInt(bsMinute, 10);
  const isBsMinuteValid =
    Number.isInteger(bsMinuteNumber) && bsMinuteNumber >= 1 && bsMinuteNumber <= 120;
  const canAddBsEvent =
    canManageMatch &&
    bsTeamId.length > 0 &&
    bsPlayerId.length > 0 &&
    bsMinute.length > 0 &&
    isBsMinuteValid;

  const handleStartLive = () => {
    // FE-01: bloqueia se já está iniciando
    if (!canManageMatch || startingMatch) return;
    Alert.alert('Iniciar Partida', 'Iniciar a partida no modo ao vivo?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Iniciar',
        onPress: async () => {
          setStartingMatch(true);
          try {
            // FE-01: aguarda confirmação do Firestore ANTES de atualizar estado local
            await updateDocument('matches', matchId, { status: 'ao_vivo', homeScore: 0, awayScore: 0 });
            startMatch(matchId);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            if (match && homeTeam && awayTeam) {
              notifyMatchStarted(
                match.championshipId,
                homeTeam.name,
                awayTeam.name,
                matchId,
              ).catch(() => {});
            }
          } catch (err) {
            console.warn('[MatchRegistration] startMatch error:', err);
            Alert.alert(
              'Erro ao iniciar partida',
              'Falha ao iniciar a partida. Verifique a conexão e tente novamente.',
            );
          } finally {
            setStartingMatch(false);
          }
        },
      },
    ]);
  };

  const runAchievementChecks = async (
    updatedEvents: typeof events,
    updatedMatches: typeof matches,
  ) => {
    if (!match) return;
    const champId = match.championshipId;
    const champAwards = awards.filter((a) => a.championshipId === champId);
    // Conquistas novas só para o elenco atual (quem saiu não ganha conquista nova).
    const allPlayers = players.filter(
      (p) =>
        isPlayerInTeamActive(p, match.homeTeamId) ||
        isPlayerInTeamActive(p, match.awayTeamId),
    );

    const newDefs: AchievementDefinition[] = [];

    for (const p of allPlayers) {
      const granted = await checkAndGrantAchievements(
        p.id,
        champId,
        updatedEvents,
        updatedMatches,
        players,
        champAwards,
      );
      for (const a of granted) {
        const def = ACHIEVEMENTS.find((d) => d.id === a.achievementId);
        if (def) newDefs.push(def);
      }
    }

    if (newDefs.length > 0) {
      setToastQueue(newDefs);
    }
  };

  // Continuação da finalização (pênaltis no mata-mata, vencedor e confirmação).
  const proceedFinalize = (finalHome: number, finalAway: number) => {
    const championship = championships.find((c) => c.id === match?.championshipId);
    const isKnockout = championship?.format === 'mata_mata' || match?.bracketRound;
    const isTie = finalHome === finalAway;

    // No mata-mata, empate requer pênaltis — abre modal cross-platform
    if (isKnockout && isTie) {
      setPenaltyHome('');
      setPenaltyAway('');
      setPendingFinalScores({ home: finalHome, away: finalAway });
      setShowPenaltySheet(true);
      return;
    }

    // Determinar vencedor (se houver)
    let winnerId: string | null = null;
    if (isKnockout) {
      winnerId = finalHome > finalAway ? match!.homeTeamId : match!.awayTeamId;
    }

    Alert.alert('Finalizar partida', 'Confirmar resultado e encerrar a partida?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Finalizar',
        onPress: () => finalizeMatch(finalHome, finalAway, winnerId, null, null),
      },
    ]);
  };

  const handleFinalize = () => {
    if (!canManageMatch || !canFinalize) return;

    const finalHome = isLive ? liveHomeScore : homeScoreNum!;
    const finalAway = isLive ? liveAwayScore : awayScoreNum!;

    // AUD-03: no placar manual, se o placar informado divergir dos gols registrados
    // em match_events, exige confirmação explícita (a artilharia usa apenas os eventos).
    // No modo ao vivo o placar É derivado dos eventos, então nunca diverge.
    if (!isLive && (homeGoalsRegistered !== finalHome || awayGoalsRegistered !== finalAway)) {
      Alert.alert(
        'Placar diferente dos gols registrados',
        `O placar informado (${finalHome}x${finalAway}) não corresponde aos gols registrados ` +
          `(${homeGoalsRegistered}x${awayGoalsRegistered}). Deseja finalizar mesmo assim? ` +
          `A artilharia usará apenas os gols registrados.`,
        [
          { text: 'Corrigir eventos', style: 'cancel' },
          { text: 'Finalizar assim mesmo', onPress: () => proceedFinalize(finalHome, finalAway) },
        ],
      );
      return;
    }

    proceedFinalize(finalHome, finalAway);
  };

  const finalizeMatch = async (
    finalHome: number,
    finalAway: number,
    winnerId: string | null,
    homePenalty: number | null,
    awayPenalty: number | null,
  ) => {
    if (!canManageMatch || finalizing) return;
    setFinalizing(true);
    try {
      if (!match) {
        throw new Error('Partida não encontrada.');
      }
      const championship = championships.find((c) => c.id === match.championshipId);
      if (!championship) {
        throw new Error('Campeonato não encontrado.');
      }

      const finishedAt = new Date().toISOString();
      const isKnockout = championship.format === 'mata_mata' || !!match.bracketRound;

      const updatedMatchData: Partial<MatchModel> = {
        homeScore: finalHome,
        awayScore: finalAway,
        status: 'finalizado',
        finishedAt,
      };

      if (winnerId) {
        updatedMatchData.winnerId = winnerId;
      }
      if (homePenalty !== null) {
        updatedMatchData.homePenaltyScore = homePenalty;
        updatedMatchData.awayPenaltyScore = awayPenalty;
      }

      const updatedMatch: MatchModel = {
        ...match,
        ...updatedMatchData,
        status: 'finalizado',
      };

      const buildGroupKnockoutPlan = (): GroupKnockoutPlan | null => {
        if (
          championship.format !== 'grupos_e_mata_mata' ||
          championship.groupStageComplete ||
          !match.groupId ||
          !championship.groups
        ) {
          return null;
        }

        const champMatches = matches.filter((m) => m.championshipId === championship.id);
        const updatedChampMatches = champMatches.map((m) =>
          m.id === matchId ? updatedMatch : m,
        );
        const groupMatches = updatedChampMatches.filter((m) => m.groupId);
        const allGroupMatchesFinished = groupMatches.every((m) => m.status === 'finalizado');

        if (!allGroupMatchesFinished) {
          return null;
        }

        const groups = championship.groups as Record<string, { id: string; name: string }[]>;
        const classifiedTeams = getGroupClassified(
          updatedChampMatches,
          Object.fromEntries(
            Object.entries(groups).map(([groupId, teamList]) => [
              groupId,
              teamList.map((t) => teams.find((team) => team.id === t.id)!).filter(Boolean),
            ]),
          ),
          2,
        );
        const knockoutMatches = generateBracketFixtures(classifiedTeams as any, championship.id);
        const maxGroupRound = Math.max(...groupMatches.map((m) => m.round), 0);

        knockoutMatches.forEach((m) => {
          m.round = m.round + maxGroupRound;
        });

        return {
          knockoutMatches,
          championshipUpdate: {
            groupStageComplete: true,
            knockoutStartRound: maxGroupRound + 1,
            totalRounds: maxGroupRound + Math.ceil(Math.log2(classifiedTeams.length)),
          },
          groupMatchIds: Array.from(new Set([...groupMatches.map((m) => m.id), matchId])),
        };
      };

      const groupKnockoutPlan = buildGroupKnockoutPlan();
      const transactionResult = await runTransaction<FinalizeTransactionResult>(
        db,
        async (transaction) => {
          const matchRef = doc(db, 'matches', matchId);
          const championshipRef = doc(db, 'championships', championship.id);
          const roundMatchIds = Array.from(
            new Set([
              ...matches
                .filter((m) => m.championshipId === championship.id && m.round === match.round)
                .map((m) => m.id),
              matchId,
            ]),
          );
          const roundMatchRefs = roundMatchIds.map((id) => doc(db, 'matches', id));
          const groupMatchRefs =
            groupKnockoutPlan?.groupMatchIds.map((id) => doc(db, 'matches', id)) ?? [];

          let nextMatchUpdate: Partial<MatchModel> | null = null;
          let nextMatchIdToUpdate: string | null = null;
          let knockoutFinalReached = false;

          if (isKnockout && winnerId && match.nextMatchId) {
            const bracketPos = match.bracketPosition ?? 0;
            nextMatchUpdate = bracketPos % 2 === 0
              ? { homeTeamId: winnerId }
              : { awayTeamId: winnerId };
            nextMatchIdToUpdate = match.nextMatchId;
          } else if (isKnockout && winnerId && !match.nextMatchId) {
            knockoutFinalReached = true;
          }

          const nextMatchRef = nextMatchIdToUpdate
            ? doc(db, 'matches', nextMatchIdToUpdate)
            : null;

          const matchSnap = await transaction.get(matchRef);
          const championshipSnap = await transaction.get(championshipRef);
          const nextMatchSnap = nextMatchRef ? await transaction.get(nextMatchRef) : null;
          const roundMatchSnaps = await Promise.all(
            roundMatchRefs.map((ref) => transaction.get(ref)),
          );
          const groupMatchSnaps = await Promise.all(
            groupMatchRefs.map((ref) => transaction.get(ref)),
          );

          if (!matchSnap.exists()) {
            throw new Error('Partida não encontrada.');
          }
          if (!championshipSnap.exists()) {
            throw new Error('Campeonato não encontrado.');
          }

          const persistedMatch = { id: matchSnap.id, ...matchSnap.data() } as MatchModel;
          const persistedChampionship = {
            id: championshipSnap.id,
            ...championshipSnap.data(),
          } as Championship;

          if (persistedMatch.status === 'finalizado') {
            throw new Error('Esta partida já foi finalizada.');
          }
          if (persistedChampionship.status === 'finalizado') {
            throw new Error('Este campeonato já foi finalizado.');
          }

          if (nextMatchRef && nextMatchUpdate) {
            if (!nextMatchSnap?.exists()) {
              throw new Error('Próxima partida do mata-mata não encontrada.');
            }

            const nextMatch = {
              id: nextMatchSnap.id,
              ...nextMatchSnap.data(),
            } as MatchModel;
            const slot = nextMatchUpdate.homeTeamId != null ? 'homeTeamId' : 'awayTeamId';
            const existingSlotTeam = nextMatch[slot];

            if (existingSlotTeam && existingSlotTeam !== winnerId) {
              throw new Error('A próxima partida já recebeu outro vencedor.');
            }
          }

          const suspendedPlayerIds: string[] = [];
          const reactivatedPlayerIds: string[] = [];
          const championshipUpdate: Partial<Championship> = {};

          transaction.update(matchRef, updatedMatchData);

          if (redCardSuspend) {
            const nextRound = match.round + 1;
            const redCardPlayerIds = Array.from(
              new Set(
                matchEvents
                  .filter((e) => e.type === 'cartao_vermelho')
                  .map((e) => e.playerId),
              ),
            );

            for (const pid of redCardPlayerIds) {
              transaction.update(doc(db, 'players', pid), {
                status: 'suspenso',
                suspendedRound: nextRound,
              });
              suspendedPlayerIds.push(pid);
            }
          }

          const suspendedInRound = players.filter(
            (p) => p.suspendedRound === match.round && p.status === 'suspenso',
          );

          for (const p of suspendedInRound) {
            transaction.update(doc(db, 'players', p.id), {
              status: 'ativo',
              suspendedRound: null,
            });
            reactivatedPlayerIds.push(p.id);
          }

          let nextCurrentRound: number | null = null;
          const persistedRoundMatches = roundMatchSnaps
            .filter((snap) => snap.exists())
            .map((snap) => ({ id: snap.id, ...snap.data() }) as MatchModel);
          const roundMatchesAfterUpdate = persistedRoundMatches.map((m) =>
            m.id === matchId ? { ...m, ...updatedMatchData, status: 'finalizado' as const } : m,
          );
          const roundComplete =
            roundMatchesAfterUpdate.length > 0 &&
            roundMatchesAfterUpdate.every((m) => m.status === 'finalizado');

          if (roundComplete && persistedChampionship.currentRound === match.round) {
            nextCurrentRound = match.round + 1;
            championshipUpdate.currentRound = nextCurrentRound;
          }

          if (nextMatchRef && nextMatchUpdate) {
            transaction.update(nextMatchRef, nextMatchUpdate);
          }

          let groupKnockoutMatches: MatchModel[] = [];
          let groupChampionshipUpdate: GroupKnockoutPlan['championshipUpdate'] | null = null;

          if (groupKnockoutPlan && !persistedChampionship.groupStageComplete) {
            const persistedGroupMatches = groupMatchSnaps
              .filter((snap) => snap.exists())
              .map((snap) => ({ id: snap.id, ...snap.data() }) as MatchModel);
            const groupMatchesAfterUpdate = persistedGroupMatches.map((m) =>
              m.id === matchId ? { ...m, ...updatedMatchData, status: 'finalizado' as const } : m,
            );
            const allGroupMatchesFinished = groupMatchesAfterUpdate.every(
              (m) => m.status === 'finalizado',
            );

            if (allGroupMatchesFinished) {
              for (const km of groupKnockoutPlan.knockoutMatches) {
                transaction.set(doc(db, 'matches', km.id), {
                  ...km,
                  createdAt: finishedAt,
                });
              }
              Object.assign(championshipUpdate, groupKnockoutPlan.championshipUpdate);
              groupKnockoutMatches = groupKnockoutPlan.knockoutMatches;
              groupChampionshipUpdate = groupKnockoutPlan.championshipUpdate;
            }
          }

          if (Object.keys(championshipUpdate).length > 0) {
            transaction.update(championshipRef, championshipUpdate);
          }

          return {
            suspendedPlayerIds,
            reactivatedPlayerIds,
            nextCurrentRound,
            nextMatchIdToUpdate,
            nextMatchUpdate,
            knockoutFinalReached,
            groupKnockoutMatches,
            groupChampionshipUpdate,
          };
        },
      );

      updateMatch(matchId, updatedMatchData);

      if (redCardSuspend) {
        const nextRound = match.round + 1;
        for (const pid of transactionResult.suspendedPlayerIds) {
          useTeamStore.getState().updatePlayer(pid, { status: 'suspenso', suspendedRound: nextRound });
        }
      }

      for (const pid of transactionResult.reactivatedPlayerIds) {
        useTeamStore.getState().updatePlayer(pid, { status: 'ativo', suspendedRound: undefined });
      }

      if (transactionResult.nextCurrentRound != null) {
        updateChampionship(match.championshipId, { currentRound: transactionResult.nextCurrentRound });
      }

      if (transactionResult.nextMatchIdToUpdate && transactionResult.nextMatchUpdate) {
        updateMatch(transactionResult.nextMatchIdToUpdate, transactionResult.nextMatchUpdate);
      }

      if (
        transactionResult.groupKnockoutMatches.length > 0 &&
        transactionResult.groupChampionshipUpdate
      ) {
        useMatchStore.getState().addMatches(transactionResult.groupKnockoutMatches);
        updateChampionship(championship.id, transactionResult.groupChampionshipUpdate);

        Toast.show({
          type: 'success',
          text1: '⚽ Fase de Grupos Encerrada!',
          text2: 'As eliminatórias foram geradas.',
          visibilityTime: 3500,
        });
      }

      if (transactionResult.knockoutFinalReached) {
        try {
          const result = await finishChampionship(match.championshipId, {
            skipPendingMatchesCheck: true,
          });
          if (result.success) {
            updateChampionship(match.championshipId, { status: 'finalizado' });
            Toast.show({
              type: 'success',
              text1: '🏆 Campeonato Finalizado!',
              text2: `${teams.find((t) => t.id === winnerId)?.name} é o campeão!`,
              visibilityTime: 4000,
            });
          } else {
            console.warn('[MatchRegistration] finishChampionship failed:', result.error);
          }
        } catch (e) {
          console.warn('[MatchRegistration] finishChampionship failed:', e);
        }
      }

      const updatedMatches = matches.map((m) => (m.id === matchId ? updatedMatch : m));

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (homeTeam && awayTeam) {
        notifyMatchFinished(
          match.championshipId,
          homeTeam.name,
          awayTeam.name,
          finalHome,
          finalAway,
          matchId,
        ).catch(() => {});
      }

      runAchievementChecks(events, updatedMatches).catch(() => {});

      if (isLive) {
        navigation.replace('MatchSummary', { matchId });
      } else {
        const penaltyText = homePenalty !== null ? ` (${homePenalty}-${awayPenalty} pen.)` : '';
        Toast.show({
          type: 'success',
          text1: 'Partida finalizada!',
          text2: `${finalHome} × ${finalAway}${penaltyText}`,
          visibilityTime: 2500,
        });
        navigation.goBack();
      }
    } catch (err) {
      // BE-04: Em caso de falha, mostrar erro claro e NÃO navegar
      console.error('[MatchRegistration] finalizeMatch error:', err);
      Alert.alert(
        'Erro ao finalizar partida',
        'Não foi possível finalizar a partida. Verifique a conexão e tente novamente.',
      );
    } finally {
      setFinalizing(false);
    }
  };

  const handleConfirmPenalty = () => {
    if (!canManageMatch) return;
    const hp = parseInt(penaltyHome, 10);
    const ap = parseInt(penaltyAway, 10);
    if (isNaN(hp) || isNaN(ap) || hp === ap) {
      Toast.show({ type: 'error', text1: 'Pênaltis inválidos', text2: 'Os valores devem ser números distintos', visibilityTime: 2500 });
      return;
    }
    if (!pendingFinalScores || !match) return;
    const winnerId = hp > ap ? match.homeTeamId : match.awayTeamId;
    setShowPenaltySheet(false);
    setPendingFinalScores(null);
    finalizeMatch(pendingFinalScores.home, pendingFinalScores.away, winnerId, hp, ap);
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    [],
  );

  const getPlayer = (playerId: string) => players.find((p) => p.id === playerId);
  const getTeam = (teamId: string) => teams.find((t) => t.id === teamId);

  if (!match) return null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
    <View style={styles.root}>
      {/* Modal de pênaltis — substitui Alert.prompt (funciona em iOS e Android) */}
      <Modal
        visible={showPenaltySheet}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPenaltySheet(false)}
      >
        <View style={penaltyStyles.overlay}>
          <View style={penaltyStyles.sheet}>
            <Text style={penaltyStyles.title}>Disputa de Pênaltis</Text>
            <Text style={penaltyStyles.subtitle}>
              Placar: {pendingFinalScores?.home ?? 0} × {pendingFinalScores?.away ?? 0}
            </Text>
            <View style={penaltyStyles.row}>
              <View style={penaltyStyles.teamCol}>
                <Text style={penaltyStyles.teamLabel} numberOfLines={1}>
                  {homeTeam?.name ?? 'Casa'}
                </Text>
                <TextInput
                  style={penaltyStyles.input}
                  value={penaltyHome}
                  onChangeText={(t) => setPenaltyHome(t.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  maxLength={2}
                  textAlign="center"
                />
              </View>
              <Text style={penaltyStyles.divider}>×</Text>
              <View style={penaltyStyles.teamCol}>
                <Text style={penaltyStyles.teamLabel} numberOfLines={1}>
                  {awayTeam?.name ?? 'Fora'}
                </Text>
                <TextInput
                  style={penaltyStyles.input}
                  value={penaltyAway}
                  onChangeText={(t) => setPenaltyAway(t.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  maxLength={2}
                  textAlign="center"
                />
              </View>
            </View>
            <View style={penaltyStyles.actions}>
              <TouchableOpacity
                style={[penaltyStyles.btn, penaltyStyles.btnCancel]}
                onPress={() => setShowPenaltySheet(false)}
              >
                <Text style={penaltyStyles.btnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[penaltyStyles.btn, penaltyStyles.btnConfirm]}
                onPress={handleConfirmPenalty}
              >
                <Text style={penaltyStyles.btnConfirmText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <SafeAreaView style={styles.header} edges={['top']}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.roundLabel}>RODADA {match.round}</Text>
        <Text style={styles.title} numberOfLines={2}>
          {homeTeam?.name ?? 'Time Casa'} vs {awayTeam?.name ?? 'Time Fora'}
        </Text>
        <View style={styles.headerColorBar}>
          <View style={[styles.headerColorHalf, { backgroundColor: homeTeam?.primaryColor ?? colors.border }]} />
          <View style={[styles.headerColorHalf, { backgroundColor: awayTeam?.primaryColor ?? colors.border }]} />
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.scorePanel}>
          <View style={styles.scoreTeamCol}>
            <View style={styles.scoreTeamInline}>
              <Text style={styles.scoreTeamNameLeft} numberOfLines={2}>{homeTeam?.name ?? 'Casa'}</Text>
              <TeamColorDot color={homeTeam?.primaryColor ?? colors.textMuted} size={16} />
            </View>
          </View>

          <View style={styles.scoreInputsWrap}>
            {isLive ? (
              <View style={styles.liveInputsRow}>
                <View style={styles.scoreInputBox}>
                  <Text style={styles.liveScoreText}>{liveHomeScore}</Text>
                </View>
                <Text style={styles.scoreDivider}>—</Text>
                <View style={styles.scoreInputBox}>
                  <Text style={styles.liveScoreText}>{liveAwayScore}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.liveInputsRow}>
                <View style={[styles.scoreInputBox, homeFocused && styles.scoreInputFocused]}>
                  <TextInput
                    style={styles.scoreInput}
                    value={homeScore}
                    onChangeText={(t) => setHomeScore(t.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    maxLength={2}
                    textAlign="center"
                    onFocus={() => setHomeFocused(true)}
                    onBlur={() => setHomeFocused(false)}
                  />
                </View>
                <Text style={styles.scoreDivider}>—</Text>
                <View style={[styles.scoreInputBox, awayFocused && styles.scoreInputFocused]}>
                  <TextInput
                    style={styles.scoreInput}
                    value={awayScore}
                    onChangeText={(t) => setAwayScore(t.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    maxLength={2}
                    textAlign="center"
                    onFocus={() => setAwayFocused(true)}
                    onBlur={() => setAwayFocused(false)}
                  />
                </View>
              </View>
            )}
          </View>

          <View style={styles.scoreTeamCol}>
            <View style={[styles.scoreTeamInline, styles.scoreTeamInlineRight]}>
              <TeamColorDot color={awayTeam?.primaryColor ?? colors.textMuted} size={16} />
              <Text style={styles.scoreTeamNameRight} numberOfLines={2}>{awayTeam?.name ?? 'Fora'}</Text>
            </View>
          </View>
        </View>

        {suspendedWarning.length > 0 && (
          <View style={styles.suspensionBanner}>
            <Text style={styles.suspensionBannerTitle}>🚫 Jogadores suspensos nesta rodada</Text>
            {suspendedWarning.map((p) => (
              <Text key={p.id} style={styles.suspensionBannerItem}>
                • {p.name} ({teams.find((t) => t.id === p.teamId)?.name ?? ''})
              </Text>
            ))}
          </View>
        )}

        {(homeGoalMismatch || awayGoalMismatch) && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>
              ⚠️ Gols registrados ({homeGoalsRegistered + awayGoalsRegistered}) não conferem com o placar ({(homeScoreNum ?? 0) + (awayScoreNum ?? 0)})
            </Text>
          </View>
        )}

        <View style={styles.eventsSection}>
          <SectionHeader title="EVENTOS DA PARTIDA" />

          {matchEvents.length === 0 ? (
            <Text style={styles.emptyEvents}>Nenhum evento registrado.</Text>
          ) : (
            <View style={styles.eventsList}>
              {matchEvents.map((event, index) => {
                const player = getPlayer(event.playerId);
                const team = getTeam(event.teamId);

                return (
                  <Animated.View key={event.id} entering={SlideInLeft.delay(index * 40).duration(220)}>
                    <AppCard style={styles.eventCard}>
                      <View style={styles.eventRow}>
                        <EventTypePill type={event.type} />
                        <View style={styles.minuteBadge}>
                          <Text style={styles.minuteBadgeText}>{event.minute}'</Text>
                        </View>
                        <View style={styles.eventCopy}>
                          <Text style={styles.eventPlayer}>{player?.name ?? '—'}</Text>
                          <Text style={styles.eventTeam}>{team?.name ?? '—'}</Text>
                        </View>
                        {canManageMatch && (
                          <TouchableOpacity
                            onPress={() => handleRemoveEvent(event.id)}
                            disabled={removingEventId === event.id}
                          >
                            {removingEventId === event.id ? (
                              <Text style={{ fontSize: 12, color: colors.textMuted }}>...</Text>
                            ) : (
                              <Ionicons name="close" size={18} color={colors.textMuted} />
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    </AppCard>
                  </Animated.View>
                );
              })}
            </View>
          )}

          {canManageMatch && (
            <TouchableOpacity
              style={[styles.addButton, addingEvent && { opacity: 0.5 }]}
              onPress={openBottomSheet}
              activeOpacity={0.8}
              disabled={addingEvent}
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
              <Text style={styles.addButtonText}>Adicionar evento</Text>
            </TouchableOpacity>
          )}
        </View>

        {canManageMatch && <View style={styles.bottomSpacer} />}
      </ScrollView>

      {canManageMatch && (
        <SafeAreaView style={styles.bottomBar} edges={['bottom']}>
          <Text style={styles.bottomInfo}>{matchEvents.length} eventos registrados</Text>
          {match.status === 'agendado' ? (
            <AppButton
              title="INICIAR PARTIDA"
              onPress={handleStartLive}
              disabled={startingMatch}
              loading={startingMatch}
              fullWidth
            />
          ) : (
            <AppButton
              title="FINALIZAR PARTIDA"
              onPress={handleFinalize}
              disabled={!canFinalize || finalizing}
              loading={finalizing}
              fullWidth
            />
          )}
        </SafeAreaView>
      )}

      <AchievementToast queue={toastQueue} onDismiss={() => setToastQueue([])} />

      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={bsStyles.bg}
        handleIndicatorStyle={bsStyles.handle}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        <BottomSheetScrollView
          contentContainerStyle={bsStyles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={bsStyles.title}>Registrar evento</Text>

          <View style={bsStyles.typeRow}>
            {TYPE_DEFS.map((type) => {
              const active = bsType === type.value;
              return (
                <TouchableOpacity
                  key={type.value}
                  style={[bsStyles.typeChip, active && { backgroundColor: type.color }]}
                  onPress={() => setBsType(type.value)}
                  activeOpacity={0.8}
                >
                  <Text style={[bsStyles.typeChipText, active && bsStyles.typeChipTextActive]}>
                    {type.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={bsStyles.teamRow}>
            {[homeTeam, awayTeam].filter(Boolean).map((team) => {
              const active = bsTeamId === team!.id;
              return (
                <TouchableOpacity
                  key={team!.id}
                  style={[bsStyles.teamButton, active && bsStyles.teamButtonActive]}
                  onPress={() => handleTeamSelect(team!.id)}
                >
                  <TeamColorDot color={team!.primaryColor} size={12} />
                  <Text style={[bsStyles.teamButtonText, active && bsStyles.teamButtonTextActive]} numberOfLines={2}>
                    {team!.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {bsTeamId.length > 0 && (
            <>
              <Text style={bsStyles.label}>JOGADOR</Text>
              <FlatList
                data={bsPlayers}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                contentContainerStyle={bsStyles.playerList}
                renderItem={({ item }) => {
                  const active = bsPlayerId === item.id;
                  return (
                    <TouchableOpacity
                      style={[bsStyles.playerRow, active && bsStyles.playerRowActive]}
                      onPress={() => setBsPlayerId(item.id)}
                    >
                      <Text style={[bsStyles.playerNumber, active && bsStyles.playerNumberActive]}>
                        #{item.number}
                      </Text>
                      <Text style={[bsStyles.playerName, active && bsStyles.playerNameActive]}>
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </>
          )}

          <Text style={bsStyles.label}>MINUTO</Text>
          <TextInput
            style={bsStyles.minuteInput}
            value={bsMinute}
            onChangeText={(t) => setBsMinute(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            placeholder="1-120"
            placeholderTextColor={colors.textMuted}
            maxLength={3}
            textAlign="center"
          />

          <AppButton
            title={addingEvent ? "REGISTRANDO..." : "REGISTRAR EVENTO"}
            onPress={handleAddEvent}
            disabled={!canAddBsEvent || addingEvent}
            loading={addingEvent}
            fullWidth
            style={bsStyles.submitButton}
          />
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  header: {
    backgroundColor: colors.bg200,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  roundLabel: {
    fontFamily: 'Barlow-Bold',
    fontSize: 10,
    color: colors.accent,
    letterSpacing: 1.6,
  },
  title: {
    marginTop: 6,
    fontFamily: 'Barlow-Bold',
    fontSize: 24,
    lineHeight: 28,
    color: colors.textPrimary,
  },
  headerColorBar: {
    flexDirection: 'row',
    height: 3,
    marginTop: 16,
    borderRadius: 2,
    overflow: 'hidden',
  },
  headerColorHalf: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  scorePanel: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    borderRadius: 18,
    backgroundColor: colors.bg200,
    gap: 12,
  },
  scoreTeamCol: {
    flex: 1,
  },
  scoreTeamInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  scoreTeamInlineRight: {
    justifyContent: 'flex-start',
  },
  scoreTeamNameLeft: {
    flex: 1,
    fontFamily: 'Barlow-SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
    textAlign: 'right',
  },
  scoreTeamNameRight: {
    flex: 1,
    fontFamily: 'Barlow-SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  scoreInputsWrap: {
    width: 120,
    alignItems: 'center',
  },
  liveInputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scoreInputBox: {
    width: 50,
    height: 70,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg300,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  scoreInputFocused: {
    borderBottomColor: colors.accent,
  },
  scoreInput: {
    width: '100%',
    fontFamily: 'Barlow-Black',
    fontSize: 42,
    color: colors.textPrimary,
    textAlign: 'center',
    padding: 0,
  },
  liveScoreText: {
    fontFamily: 'Barlow-Black',
    fontSize: 42,
    color: colors.textPrimary,
  },
  scoreDivider: {
    fontFamily: 'Barlow-Bold',
    fontSize: 26,
    color: colors.textMuted,
  },
  suspensionBanner: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(231,76,60,0.10)',
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
    gap: 4,
  },
  suspensionBannerTitle: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    color: colors.danger,
  },
  suspensionBannerItem: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  warningBanner: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,59,71,0.12)',
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
  },
  warningText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 13,
    lineHeight: 18,
    color: colors.warning,
  },
  eventsSection: {
    marginTop: 24,
  },
  emptyEvents: {
    marginTop: 16,
    fontFamily: 'Barlow-Regular',
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  eventsList: {
    gap: 10,
    marginTop: 12,
  },
  eventCard: {
    padding: 12,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eventIconPill: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventIconText: {
    fontSize: 12,
  },
  minuteBadge: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.bg300,
  },
  minuteBadgeText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 12,
    color: colors.textPrimary,
  },
  eventCopy: {
    flex: 1,
  },
  eventPlayer: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  eventTeam: {
    marginTop: 2,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 10,
  },
  addButtonText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 15,
    color: colors.accent,
  },
  bottomSpacer: {
    height: 120,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg200,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  bottomInfo: {
    marginBottom: 10,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

const bsStyles = StyleSheet.create({
  bg: {
    backgroundColor: colors.bg200,
  },
  handle: {
    backgroundColor: colors.borderStrong,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  title: {
    fontFamily: 'Barlow-Bold',
    fontSize: 20,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  label: {
    marginTop: 16,
    marginBottom: 8,
    fontFamily: 'Barlow-Bold',
    fontSize: 11,
    color: colors.textSecondary,
    letterSpacing: 1.4,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typeChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.bg300,
  },
  typeChipText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  typeChipTextActive: {
    color: colors.textPrimary,
  },
  teamRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  teamButton: {
    width: 80,
    height: 50,
    paddingHorizontal: 10,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg300,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  teamButtonActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentGlow,
  },
  teamButtonText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  teamButtonTextActive: {
    color: colors.textPrimary,
  },
  playerList: {
    gap: 8,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.bg300,
    borderWidth: 1,
    borderColor: colors.border,
  },
  playerRowActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentGlow,
  },
  playerNumber: {
    fontFamily: 'Barlow-Bold',
    fontSize: 13,
    color: colors.accent,
  },
  playerNumberActive: {
    color: colors.textPrimary,
  },
  playerName: {
    flex: 1,
    fontFamily: 'Barlow-Medium',
    fontSize: 14,
    color: colors.textPrimary,
  },
  playerNameActive: {
    color: colors.textPrimary,
  },
  minuteInput: {
    width: 110,
    height: 64,
    alignSelf: 'center',
    borderRadius: 16,
    backgroundColor: colors.bg300,
    fontFamily: 'Barlow-Black',
    fontSize: 32,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  submitButton: {
    marginTop: 20,
  },
});

const penaltyStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    width: '100%',
    backgroundColor: colors.bg200,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontFamily: 'Barlow-Bold',
    fontSize: 20,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 6,
    fontFamily: 'Barlow-Regular',
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 20,
  },
  teamCol: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  teamLabel: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  input: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: colors.bg300,
    fontFamily: 'Barlow-Black',
    fontSize: 34,
    color: colors.textPrimary,
    textAlign: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  divider: {
    fontFamily: 'Barlow-Bold',
    fontSize: 28,
    color: colors.textMuted,
    marginTop: 24,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancel: {
    backgroundColor: colors.bg300,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnCancelText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 15,
    color: colors.textSecondary,
  },
  btnConfirm: {
    backgroundColor: colors.accent,
  },
  btnConfirmText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 15,
    color: colors.bg100,
  },
});
