import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  Alert,
  FlatList,
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
import { MatchEvent, MatchEventType } from '../../types';
import { FixturesStackParamList } from '../../navigation/FixturesStackNavigator';
import {
  notifyGoal,
  notifyMatchStarted,
  notifyMatchFinished,
} from '../../services/notificationService';
import { checkAndGrantAchievements } from '../../services/achievementService';
import { AchievementToast } from '../../components/AchievementToast';
import { AchievementDefinition } from '../../types';
import { ACHIEVEMENTS } from '../../utils/achievementDefinitions';
import { useVotingStore } from '../../stores/votingStore';

type RouteT = RouteProp<FixturesStackParamList, 'MatchRegistration'>;
type NavT = NativeStackNavigationProp<FixturesStackParamList>;

const EVENT_ICON: Record<MatchEventType, string> = {
  gol: '⚽',
  cartao_amarelo: '🟨',
  cartao_vermelho: '🟥',
};

const TYPE_DEFS: Array<{ value: MatchEventType; label: string; color: string }> = [
  { value: 'gol', label: '⚽ Gol', color: colors.accent },
  { value: 'cartao_amarelo', label: '🟨 Amarelo', color: colors.warning },
  { value: 'cartao_vermelho', label: '🟥 Vermelho', color: colors.danger },
];

function makeId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function EventTypePill({ type }: { type: MatchEventType }) {
  const background =
    type === 'gol'
      ? colors.accent
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
  const { awards } = useVotingStore();
  const [toastQueue, setToastQueue] = useState<AchievementDefinition[]>([]);

  const match = matches.find((m) => m.id === matchId);
  const matchEvents = events
    .filter((e) => e.matchId === matchId)
    .sort((a, b) => a.minute - b.minute);

  const homeTeam = teams.find((t) => t.id === match?.homeTeamId);
  const awayTeam = teams.find((t) => t.id === match?.awayTeamId);

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

  const bsPlayers = bsTeamId ? players.filter((p) => p.teamId === bsTeamId) : [];

  const handleTeamSelect = (teamId: string) => {
    setBsTeamId(teamId);
    setBsPlayerId('');
  };

  const openBottomSheet = () => {
    setBsType('gol');
    setBsTeamId('');
    setBsPlayerId('');
    setBsMinute('');
    bottomSheetRef.current?.expand();
  };

  const handleAddEvent = () => {
    const minute = parseInt(bsMinute, 10);
    if (!bsTeamId || !bsPlayerId || !minute) return;

    const event: MatchEvent = {
      id: makeId(),
      matchId,
      type: bsType,
      teamId: bsTeamId,
      playerId: bsPlayerId,
      minute,
    };
    addEvent(event);

    if (bsType === 'gol') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (isLive && bsType === 'gol' && match) {
      const newHome = liveHomeScore + (bsTeamId === match.homeTeamId ? 1 : 0);
      const newAway = liveAwayScore + (bsTeamId === match.awayTeamId ? 1 : 0);
      updateMatch(matchId, { homeScore: newHome, awayScore: newAway });

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
    }

    bottomSheetRef.current?.close();
  };

  const handleRemoveEvent = (eventId: string) => {
    Alert.alert('Remover evento', 'Remover este evento da partida?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => {
          const removing = matchEvents.find((e) => e.id === eventId);
          removeEvent(eventId);
          if (isLive && removing?.type === 'gol' && match) {
            const newHome = liveHomeScore - (removing.teamId === match.homeTeamId ? 1 : 0);
            const newAway = liveAwayScore - (removing.teamId === match.awayTeamId ? 1 : 0);
            updateMatch(matchId, {
              homeScore: Math.max(0, newHome),
              awayScore: Math.max(0, newAway),
            });
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

  const canFinalize = isLive || (homeScoreNum !== null && awayScoreNum !== null);
  const canAddBsEvent =
    bsTeamId.length > 0 &&
    bsPlayerId.length > 0 &&
    bsMinute.length > 0 &&
    parseInt(bsMinute, 10) > 0;

  const handleStartLive = () => {
    Alert.alert('Iniciar Partida', 'Iniciar a partida no modo ao vivo?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Iniciar',
        onPress: () => {
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
        },
      },
    ]);
  };

  const runAchievementChecks = (
    finalHome: number,
    finalAway: number,
    updatedEvents: typeof events,
    updatedMatches: typeof matches,
  ) => {
    if (!match) return;
    const champId = match.championshipId;
    const champAwards = awards.filter((a) => a.championshipId === champId);
    const allPlayers = players.filter(
      (p) => p.teamId === match.homeTeamId || p.teamId === match.awayTeamId,
    );

    const newDefs: AchievementDefinition[] = [];

    for (const p of allPlayers) {
      const granted = checkAndGrantAchievements(
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

  const handleFinalize = () => {
    if (!canFinalize) return;
    Alert.alert('Finalizar partida', 'Confirmar resultado e encerrar a partida?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Finalizar',
        onPress: () => {
          const finalHome = isLive ? liveHomeScore : homeScoreNum!;
          const finalAway = isLive ? liveAwayScore : awayScoreNum!;
          const updatedMatch = {
            ...match!,
            homeScore: finalHome,
            awayScore: finalAway,
            status: 'finalizado' as const,
            finishedAt: new Date().toISOString(),
          };
          updateMatch(matchId, {
            homeScore: finalHome,
            awayScore: finalAway,
            status: 'finalizado',
            finishedAt: updatedMatch.finishedAt,
          });

          const updatedMatches = matches.map((m) => (m.id === matchId ? updatedMatch : m));

          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

          if (match && homeTeam && awayTeam) {
            notifyMatchFinished(
              match.championshipId,
              homeTeam.name,
              awayTeam.name,
              finalHome,
              finalAway,
              matchId,
            ).catch(() => {});
          }

          runAchievementChecks(finalHome, finalAway, events, updatedMatches);

          if (isLive) {
            navigation.replace('MatchSummary', { matchId });
          } else {
            Toast.show({ type: 'success', text1: 'Partida finalizada!', text2: `${finalHome} × ${finalAway}`, visibilityTime: 2500 });
            navigation.goBack();
          }
        },
      },
    ]);
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
    <View style={styles.root}>
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
                        <TouchableOpacity onPress={() => handleRemoveEvent(event.id)}>
                          <Ionicons name="close" size={18} color={colors.textMuted} />
                        </TouchableOpacity>
                      </View>
                    </AppCard>
                  </Animated.View>
                );
              })}
            </View>
          )}

          <TouchableOpacity style={styles.addButton} onPress={openBottomSheet} activeOpacity={0.8}>
            <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
            <Text style={styles.addButtonText}>Adicionar evento</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <SafeAreaView style={styles.bottomBar} edges={['bottom']}>
        <Text style={styles.bottomInfo}>{matchEvents.length} eventos registrados</Text>
        {match.status === 'agendado' ? (
          <AppButton title="INICIAR PARTIDA" onPress={handleStartLive} fullWidth />
        ) : (
          <AppButton
            title="FINALIZAR PARTIDA"
            onPress={handleFinalize}
            disabled={!canFinalize}
            fullWidth
          />
        )}
      </SafeAreaView>

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
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            maxLength={3}
            textAlign="center"
          />

          <AppButton
            title="REGISTRAR EVENTO"
            onPress={handleAddEvent}
            disabled={!canAddBsEvent}
            fullWidth
            style={bsStyles.submitButton}
          />
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
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
