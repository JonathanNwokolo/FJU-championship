import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';

import { AppButton } from '../../components/AppButton';
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

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENT_ICON: Record<MatchEventType, string> = {
  gol: '⚽',
  cartao_amarelo: '🟨',
  cartao_vermelho: '🟥',
};

const EVENT_BG: Record<MatchEventType, string> = {
  gol: `${colors.accent}1A`,
  cartao_amarelo: `${colors.warning}1A`,
  cartao_vermelho: `${colors.danger}1A`,
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

// ─── Screen ───────────────────────────────────────────────────────────────────

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

  // Live scores derived from goal events
  const liveHomeScore = matchEvents.filter(
    (e) => e.teamId === match?.homeTeamId && e.type === 'gol',
  ).length;
  const liveAwayScore = matchEvents.filter(
    (e) => e.teamId === match?.awayTeamId && e.type === 'gol',
  ).length;

  // Score state (used in manual/non-live mode)
  const [homeScore, setHomeScore] = useState(
    match?.homeScore != null ? String(match.homeScore) : '',
  );
  const [awayScore, setAwayScore] = useState(
    match?.awayScore != null ? String(match.awayScore) : '',
  );

  // BottomSheet state
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['72%'], []);

  const [bsType, setBsType] = useState<MatchEventType>('gol');
  const [bsTeamId, setBsTeamId] = useState('');
  const [bsPlayerId, setBsPlayerId] = useState('');
  const [bsMinute, setBsMinute] = useState('');

  const bsPlayers = bsTeamId ? players.filter((p) => p.teamId === bsTeamId) : [];

  const handleTeamSelect = (teamId: string) => {
    setBsTeamId(teamId);
    setBsPlayerId('');
  };

  const handleTypeSelect = (type: MatchEventType) => {
    setBsType(type);
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
            updateMatch(matchId, { homeScore: Math.max(0, newHome), awayScore: Math.max(0, newAway) });
          }
        },
      },
    ]);
  };

  // Validation
  const homeScoreNum = homeScore === '' ? null : parseInt(homeScore, 10);
  const awayScoreNum = awayScore === '' ? null : parseInt(awayScore, 10);

  const homeGoalsRegistered = matchEvents.filter(
    (e) => e.teamId === match?.homeTeamId && e.type === 'gol',
  ).length;
  const awayGoalsRegistered = matchEvents.filter(
    (e) => e.teamId === match?.awayTeamId && e.type === 'gol',
  ).length;

  const homeGoalMismatch =
    homeScoreNum !== null && homeGoalsRegistered !== homeScoreNum;
  const awayGoalMismatch =
    awayScoreNum !== null && awayGoalsRegistered !== awayScoreNum;

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
      (p) =>
        p.teamId === match.homeTeamId || p.teamId === match.awayTeamId,
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

          const updatedMatches = matches.map((m) =>
            m.id === matchId ? updatedMatch : m,
          );

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
            Alert.alert('Partida finalizada!', '', [
              { text: 'OK', onPress: () => navigation.goBack() },
            ]);
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
      {/* ── Dark header ── */}
      <SafeAreaView style={styles.headerBg} edges={['top']}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color={colors.textOnDark} />
        </TouchableOpacity>

        <View style={styles.headerBody}>
          <View style={styles.headerTeamsRow}>
            <View style={styles.headerTeamLeft}>
              <View
                style={[styles.headerDot, { backgroundColor: homeTeam?.primaryColor ?? colors.border }]}
              />
              <Text style={styles.headerTeamName} numberOfLines={1}>
                {homeTeam?.name ?? '—'}
              </Text>
            </View>
            <Text style={styles.headerVs}>vs</Text>
            <View style={styles.headerTeamRight}>
              <Text style={[styles.headerTeamName, { textAlign: 'right' }]} numberOfLines={1}>
                {awayTeam?.name ?? '—'}
              </Text>
              <View
                style={[styles.headerDot, { backgroundColor: awayTeam?.primaryColor ?? colors.border }]}
              />
            </View>
          </View>
          <Text style={styles.headerRound}>Rodada {match.round}</Text>
        </View>
      </SafeAreaView>

      {/* ── Scrollable body ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Score section */}
        <View style={styles.scoreSection}>
          <Text style={styles.sectionLabel}>
            {isLive ? 'PLACAR AO VIVO' : 'PLACAR'}
          </Text>
          {isLive ? (
            <View style={styles.scoreRow}>
              <View style={[styles.scoreBox, styles.liveScoreBox]}>
                <Text style={styles.liveScoreNum}>{liveHomeScore}</Text>
              </View>
              <Text style={styles.scoreX}>×</Text>
              <View style={[styles.scoreBox, styles.liveScoreBox]}>
                <Text style={styles.liveScoreNum}>{liveAwayScore}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.scoreRow}>
              <View style={styles.scoreBox}>
                <TextInput
                  style={styles.scoreInput}
                  value={homeScore}
                  onChangeText={(t) => setHomeScore(t.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.border}
                  maxLength={2}
                  textAlign="center"
                />
              </View>
              <Text style={styles.scoreX}>×</Text>
              <View style={styles.scoreBox}>
                <TextInput
                  style={styles.scoreInput}
                  value={awayScore}
                  onChangeText={(t) => setAwayScore(t.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.border}
                  maxLength={2}
                  textAlign="center"
                />
              </View>
            </View>
          )}
        </View>

        <View style={styles.divider} />

        {/* Events section */}
        <View style={styles.eventsSection}>
          <Text style={styles.sectionLabel}>EVENTOS DA PARTIDA</Text>

          {/* Validation banners */}
          {homeGoalMismatch && (
            <View style={styles.warnBanner}>
              <Text style={styles.warnText}>
                ⚠️ Gols registrados ({homeGoalsRegistered}) de{' '}
                <Text style={styles.warnBold}>{homeTeam?.name}</Text> não conferem com o
                placar ({homeScoreNum})
              </Text>
            </View>
          )}
          {awayGoalMismatch && (
            <View style={styles.warnBanner}>
              <Text style={styles.warnText}>
                ⚠️ Gols registrados ({awayGoalsRegistered}) de{' '}
                <Text style={styles.warnBold}>{awayTeam?.name}</Text> não conferem com o
                placar ({awayScoreNum})
              </Text>
            </View>
          )}

          {/* Events list */}
          {matchEvents.length === 0 ? (
            <View style={styles.eventsEmpty}>
              <Text style={styles.eventsEmptyText}>Nenhum evento registrado.</Text>
            </View>
          ) : (
            matchEvents.map((event) => {
              const player = getPlayer(event.playerId);
              const team = getTeam(event.teamId);
              return (
                <View key={event.id} style={styles.eventItem}>
                  <View style={[styles.eventIconBg, { backgroundColor: EVENT_BG[event.type] }]}>
                    <Text style={styles.eventIconEmoji}>{EVENT_ICON[event.type]}</Text>
                  </View>
                  <View style={styles.eventInfo}>
                    <Text style={styles.eventPlayerName} numberOfLines={1}>
                      {player?.name ?? '—'}
                    </Text>
                    <Text style={styles.eventTeamName} numberOfLines={1}>
                      {team?.name ?? '—'}
                    </Text>
                  </View>
                  <Text style={styles.eventMinute}>{event.minute}'</Text>
                  <TouchableOpacity
                    onPress={() => handleRemoveEvent(event.id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close-circle" size={22} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              );
            })
          )}

          {/* Add event button */}
          <TouchableOpacity style={styles.addEventBtn} onPress={openBottomSheet} activeOpacity={0.8}>
            <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
            <Text style={styles.addEventText}>Adicionar evento</Text>
          </TouchableOpacity>
        </View>

        {/* Spacer so content doesn't hide behind fixed button */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Fixed bottom bar ── */}
      <SafeAreaView style={styles.bottomBar} edges={['bottom']}>
        {match.status === 'agendado' ? (
          <AppButton
            title="Iniciar Partida"
            onPress={handleStartLive}
            fullWidth
          />
        ) : (
          <AppButton
            title="Finalizar Partida"
            onPress={handleFinalize}
            disabled={!canFinalize}
            fullWidth
          />
        )}
      </SafeAreaView>

      {/* ── Achievement toast ── */}
      <AchievementToast
        queue={toastQueue}
        onDismiss={() => setToastQueue([])}
      />

      {/* ── Add Event BottomSheet ── */}
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

          {/* Event type */}
          <Text style={bsStyles.label}>TIPO</Text>
          <View style={bsStyles.typeRow}>
            {TYPE_DEFS.map((t) => {
              const isActive = bsType === t.value;
              return (
                <TouchableOpacity
                  key={t.value}
                  style={[
                    bsStyles.typeChip,
                    isActive && { backgroundColor: t.color },
                  ]}
                  onPress={() => handleTypeSelect(t.value)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[bsStyles.typeChipText, isActive && bsStyles.typeChipTextActive]}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Team */}
          <Text style={bsStyles.label}>TIME</Text>
          <View style={bsStyles.teamRow}>
            {[homeTeam, awayTeam].filter(Boolean).map((team) => {
              const isActive = bsTeamId === team!.id;
              return (
                <TouchableOpacity
                  key={team!.id}
                  style={[bsStyles.teamBtn, isActive && bsStyles.teamBtnActive]}
                  onPress={() => handleTeamSelect(team!.id)}
                  activeOpacity={0.8}
                >
                  <View
                    style={[bsStyles.teamDot, { backgroundColor: team!.primaryColor }]}
                  />
                  <Text
                    style={[bsStyles.teamBtnText, isActive && bsStyles.teamBtnTextActive]}
                    numberOfLines={1}
                  >
                    {team!.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Players */}
          {bsTeamId.length > 0 && (
            <>
              <Text style={bsStyles.label}>JOGADOR</Text>
              <View style={bsStyles.playerGrid}>
                {bsPlayers.map((player) => {
                  const isActive = bsPlayerId === player.id;
                  return (
                    <TouchableOpacity
                      key={player.id}
                      style={[bsStyles.playerChip, isActive && bsStyles.playerChipActive]}
                      onPress={() => setBsPlayerId(player.id)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          bsStyles.playerChipNum,
                          isActive && bsStyles.playerChipNumActive,
                        ]}
                      >
                        #{player.number}
                      </Text>
                      <Text
                        style={[
                          bsStyles.playerChipName,
                          isActive && bsStyles.playerChipNameActive,
                        ]}
                        numberOfLines={1}
                      >
                        {player.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Minute */}
          <Text style={bsStyles.label}>MINUTO</Text>
          <TextInput
            style={bsStyles.minuteInput}
            value={bsMinute}
            onChangeText={(t) => setBsMinute(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            placeholder="min"
            placeholderTextColor={colors.textSecondary}
            maxLength={3}
            textAlign="center"
          />

          <AppButton
            title="Registrar evento"
            onPress={handleAddEvent}
            disabled={!canAddBsEvent}
            fullWidth
            style={bsStyles.registerBtn}
          />
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

// ─── Main screen styles ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  // Header
  headerBg: { backgroundColor: colors.primaryDark },
  backBtn: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  headerBody: { paddingHorizontal: 20, paddingBottom: 16, gap: 6 },
  headerTeamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTeamLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTeamRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  headerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    flexShrink: 0,
  },
  headerTeamName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textOnDark,
  },
  headerVs: {
    fontSize: 12,
    fontWeight: '600',
    color: `${colors.textOnDark}66`,
  },
  headerRound: {
    fontSize: 12,
    color: `${colors.textOnDark}80`,
    fontWeight: '500',
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 24, paddingHorizontal: 20 },

  // Score
  scoreSection: { gap: 16 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.textSecondary,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  scoreBox: {
    width: 120,
    height: 80,
    backgroundColor: colors.surface,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreInput: {
    width: '100%',
    fontSize: 48,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    padding: 0,
  },
  scoreX: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.accent,
  },
  liveScoreBox: {
    backgroundColor: `${colors.danger}12`,
    borderWidth: 1,
    borderColor: `${colors.danger}30`,
  },
  liveScoreNum: {
    fontSize: 48,
    fontWeight: '800',
    color: colors.danger,
    textAlign: 'center',
  },

  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 24,
  },

  // Events
  eventsSection: { gap: 12 },
  eventsEmpty: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  eventsEmptyText: {
    fontSize: 14,
    color: colors.textSecondary,
  },

  // Validation banner
  warnBanner: {
    backgroundColor: `${colors.warning}18`,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    padding: 12,
  },
  warnText: {
    fontSize: 13,
    color: colors.warning,
    lineHeight: 18,
  },
  warnBold: { fontWeight: '700' },

  // Event item
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  eventIconBg: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  eventIconEmoji: { fontSize: 20 },
  eventInfo: { flex: 1, gap: 2 },
  eventPlayerName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  eventTeamName: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  eventMinute: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    minWidth: 32,
    textAlign: 'right',
  },

  // Add event button
  addEventBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  addEventText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
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

// ─── BottomSheet styles ───────────────────────────────────────────────────────

const bsStyles = StyleSheet.create({
  bg: { backgroundColor: colors.background },
  handle: { backgroundColor: colors.border },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.textSecondary,
    marginTop: 4,
  },

  // Type chips
  typeRow: { flexDirection: 'row', gap: 10 },
  typeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  typeChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  typeChipTextActive: { color: colors.primaryDark },

  // Team buttons
  teamRow: { flexDirection: 'row', gap: 10 },
  teamBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  teamBtnActive: { borderColor: colors.accent },
  teamDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    flexShrink: 0,
  },
  teamBtnText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  teamBtnTextActive: { color: colors.textPrimary },

  // Player chips
  playerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  playerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  playerChipActive: { backgroundColor: colors.accent },
  playerChipNum: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  playerChipNumActive: { color: colors.primaryDark },
  playerChipName: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  playerChipNameActive: { color: colors.primaryDark },

  // Minute input
  minuteInput: {
    width: 100,
    height: 52,
    backgroundColor: colors.surface,
    borderRadius: 12,
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    alignSelf: 'flex-start',
  },

  registerBtn: { marginTop: 8 },
});
