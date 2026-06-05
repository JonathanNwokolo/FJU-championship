import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { captureRef } from 'react-native-view-shot';
import { AppCard } from '../../components/AppCard';
import { SectionHeader } from '../../components/SectionHeader';
import { TeamColorDot } from '../../components/TeamColorDot';
import { colors } from '../../theme/colors';
import { useMatchStore } from '../../stores/matchStore';
import { useTeamStore } from '../../stores/teamStore';
import { FixturesStackParamList } from '../../navigation/FixturesStackNavigator';
import { MatchEvent, Player, Team } from '../../types';

type RouteT = RouteProp<FixturesStackParamList, 'MatchSummary'>;
type SummaryTab = 'eventos' | 'estatisticas';

function EventRow({
  event,
  players,
  teams,
}: {
  event: MatchEvent;
  players: Player[];
  teams: Team[];
}) {
  const player = players.find((item) => item.id === event.playerId);
  const team = teams.find((item) => item.id === event.teamId);
  const iconName =
    event.type === 'gol'
      ? 'football-outline'
      : event.type === 'cartao_amarelo'
        ? 'square'
        : 'square';
  const iconColor =
    event.type === 'gol'
      ? colors.accent
      : event.type === 'cartao_amarelo'
        ? colors.warning
        : colors.danger;

  return (
    <AppCard style={cardStyles.card}>
      <View style={cardStyles.row}>
        <View
          style={[
            cardStyles.iconWrap,
            {
              backgroundColor:
                event.type === 'gol'
                  ? colors.accentGlow
                  : event.type === 'cartao_amarelo'
                    ? 'rgba(245,166,35,0.15)'
                    : 'rgba(255,59,71,0.15)',
            },
          ]}
        >
          <Ionicons name={iconName} size={14} color={iconColor} />
        </View>
        <View style={cardStyles.copy}>
          <Text style={cardStyles.name} numberOfLines={1}>
            {player?.name ?? 'Jogador'}
          </Text>
          <Text style={cardStyles.teamName} numberOfLines={1}>
            {team?.name ?? 'Time'}
          </Text>
        </View>
        <View style={cardStyles.minutePill}>
          <Text style={cardStyles.minute}>{event.minute}'</Text>
        </View>
      </View>
    </AppCard>
  );
}

function StatBar({
  label,
  leftValue,
  rightValue,
  leftColor,
  rightColor,
}: {
  label: string;
  leftValue: number;
  rightValue: number;
  leftColor: string;
  rightColor: string;
}) {
  const total = leftValue + rightValue;
  const leftPercent = total === 0 ? 50 : (leftValue / total) * 100;
  const rightPercent = total === 0 ? 50 : (rightValue / total) * 100;

  return (
    <View style={statStyles.block}>
      <View style={statStyles.header}>
        <Text style={statStyles.sideValue}>{leftValue}</Text>
        <Text style={statStyles.label}>{label}</Text>
        <Text style={statStyles.sideValue}>{rightValue}</Text>
      </View>
      <View style={statStyles.track}>
        <View
          style={[
            statStyles.fillLeft,
            { width: `${leftPercent}%`, backgroundColor: leftColor },
          ]}
        />
        <View
          style={[
            statStyles.fillRight,
            { width: `${rightPercent}%`, backgroundColor: rightColor },
          ]}
        />
      </View>
    </View>
  );
}

export function MatchSummaryScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteT>();
  const { matchId } = route.params;
  const [activeTab, setActiveTab] = useState<SummaryTab>('eventos');
  const [sharing, setSharing] = useState(false);
  const shareRef = useRef<View>(null);

  const { matches, events } = useMatchStore();
  const { teams, players } = useTeamStore();

  const match = matches.find((item) => item.id === matchId);
  const matchEvents = events
    .filter((event) => event.matchId === matchId)
    .sort((a, b) => a.minute - b.minute);

  const homeTeam = teams.find((item) => item.id === match?.homeTeamId);
  const awayTeam = teams.find((item) => item.id === match?.awayTeamId);

  const homeGoals = matchEvents.filter(
    (event) => event.teamId === match?.homeTeamId && event.type === 'gol',
  );
  const awayGoals = matchEvents.filter(
    (event) => event.teamId === match?.awayTeamId && event.type === 'gol',
  );
  const cards = matchEvents.filter(
    (event) =>
      event.type === 'cartao_amarelo' || event.type === 'cartao_vermelho',
  );

  const homeShots =
    homeGoals.length * 3 +
    cards.filter((event) => event.teamId === match?.homeTeamId).length;
  const awayShots =
    awayGoals.length * 3 +
    cards.filter((event) => event.teamId === match?.awayTeamId).length;
  const homeCards = cards.filter((event) => event.teamId === match?.homeTeamId).length;
  const awayCards = cards.filter((event) => event.teamId === match?.awayTeamId).length;

  const estimatedPossession = useMemo(() => {
    const homeBase = homeGoals.length + 1;
    const awayBase = awayGoals.length + 1;
    const total = homeBase + awayBase;
    return {
      home: Math.round((homeBase / total) * 100),
      away: Math.round((awayBase / total) * 100),
    };
  }, [awayGoals.length, homeGoals.length]);

  const handleShare = async () => {
    if (!shareRef.current) return;
    setSharing(true);
    try {
      const uri = await captureRef(shareRef, { format: 'png', quality: 1.0 });
      const dest = `${FileSystem.cacheDirectory}match-result-${matchId}.png`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      await Sharing.shareAsync(dest, {
        mimeType: 'image/png',
        dialogTitle: 'Compartilhar resultado',
      });
    } catch (e) {
      console.warn('Share failed', e);
    } finally {
      setSharing(false);
    }
  };

  if (!match) {
    return null;
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.heroBg} edges={['top']}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color={colors.textOnDark} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.shareBtn}
          onPress={handleShare}
          disabled={sharing}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {sharing ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name="share-outline" size={24} color={colors.textOnDark} />
          )}
        </TouchableOpacity>

        <Text style={styles.heroRound}>RODADA {match.round}</Text>

        {/* Shareable View - hidden but used for capture */}
        <View
          ref={shareRef}
          collapsable={false}
          style={styles.shareableResult}
        >
          <LinearGradient
            colors={[colors.bg200, colors.bg100]}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.shareableChampName}>FJU Championship</Text>
          <Text style={styles.shareableRound}>Rodada {match.round}</Text>
          <View style={styles.shareableScoreRow}>
            <View style={styles.shareableTeam}>
              <View style={[styles.shareableColorDot, { backgroundColor: homeTeam?.primaryColor }]} />
              <Text style={styles.shareableTeamName} numberOfLines={2}>{homeTeam?.name ?? 'Casa'}</Text>
            </View>
            <Text style={styles.shareableScore}>
              {match.homeScore ?? 0} - {match.awayScore ?? 0}
              {match.homePenaltyScore != null && (
                `\n(${match.homePenaltyScore}-${match.awayPenaltyScore} pen.)`
              )}
            </Text>
            <View style={[styles.shareableTeam, { alignItems: 'flex-end' }]}>
              <View style={[styles.shareableColorDot, { backgroundColor: awayTeam?.primaryColor }]} />
              <Text style={[styles.shareableTeamName, { textAlign: 'right' }]} numberOfLines={2}>{awayTeam?.name ?? 'Fora'}</Text>
            </View>
          </View>
          {(homeGoals.length > 0 || awayGoals.length > 0) && (
            <View style={styles.shareableScorers}>
              <Text style={styles.shareableScorersLabel}>⚽ Goleadores</Text>
              {[...homeGoals, ...awayGoals].slice(0, 6).map((goal, idx) => {
                const scorer = players.find((p) => p.id === goal.playerId);
                return (
                  <Text key={idx} style={styles.shareableScorerName}>
                    {scorer?.name ?? 'Jogador'} ({goal.minute}')
                  </Text>
                );
              })}
            </View>
          )}
          <Text style={styles.shareableWatermark}>FJU Championship App</Text>
        </View>

        <View style={styles.heroScoreShell}>
          <LinearGradient
            colors={[homeTeam?.primaryColor ?? colors.accent, 'rgba(0,0,0,0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.sideGlowLeft}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0)', awayTeam?.primaryColor ?? colors.neon]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.sideGlowRight}
          />

          <View style={styles.heroTeamsRow}>
            <View style={styles.heroTeamBlock}>
              <TeamColorDot color={homeTeam?.primaryColor ?? colors.textMuted} size={12} />
              <Text style={styles.heroTeamName} numberOfLines={2}>
                {homeTeam?.name ?? 'Casa'}
              </Text>
            </View>

            <View style={styles.heroScoreContainer}>
              <Text style={styles.heroScore}>
                {match.homeScore ?? 0}
                <Text style={styles.heroScoreX}> - </Text>
                {match.awayScore ?? 0}
              </Text>
              {match.homePenaltyScore != null && (
                <Text style={styles.heroPenaltyText}>
                  ({match.homePenaltyScore}-{match.awayPenaltyScore} pen.)
                </Text>
              )}
            </View>

            <View style={[styles.heroTeamBlock, styles.heroTeamBlockRight]}>
              <Text style={[styles.heroTeamName, styles.heroTeamNameRight]} numberOfLines={2}>
                {awayTeam?.name ?? 'Fora'}
              </Text>
              <TeamColorDot color={awayTeam?.primaryColor ?? colors.textMuted} size={12} />
            </View>
          </View>
        </View>

        <View style={styles.tabRow}>
          {(['eventos', 'estatisticas'] as SummaryTab[]).map((tab) => {
            const active = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tabButton, active && styles.tabButtonActive]}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.85}
              >
                <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>
                  {tab === 'eventos' ? 'Eventos' : 'Estatisticas do jogo'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'eventos' ? (
          <Animated.View entering={FadeIn.duration(220)}>
            <SectionHeader title="EVENTOS" subtitle={`${matchEvents.length} registros`} />

            {matchEvents.length === 0 ? (
              <View style={styles.emptyBlock}>
                <Ionicons name="document-text-outline" size={54} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>Sem eventos registrados</Text>
                <Text style={styles.emptyText}>
                  Quando os lances forem adicionados, eles vao aparecer aqui em ordem cronologica.
                </Text>
              </View>
            ) : (
              <View style={styles.eventsList}>
                {matchEvents.map((event) => (
                  <EventRow key={event.id} event={event} players={players} teams={teams} />
                ))}
              </View>
            )}
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(220)}>
            <SectionHeader title="ESTATISTICAS DO JOGO" />
            <AppCard style={styles.statsCard}>
              <StatBar
                label="POSSE"
                leftValue={estimatedPossession.home}
                rightValue={estimatedPossession.away}
                leftColor={homeTeam?.primaryColor ?? colors.accent}
                rightColor={awayTeam?.primaryColor ?? colors.neon}
              />
              <StatBar
                label="CHUTES"
                leftValue={homeShots}
                rightValue={awayShots}
                leftColor={homeTeam?.primaryColor ?? colors.accent}
                rightColor={awayTeam?.primaryColor ?? colors.neon}
              />
              <StatBar
                label="CARTOES"
                leftValue={homeCards}
                rightValue={awayCards}
                leftColor={colors.warning}
                rightColor={colors.warning}
              />
            </AppCard>

            <View style={styles.statsNote}>
              <Text style={styles.statsNoteText}>
                Posse calculada por aproximacao com base no volume ofensivo registrado.
              </Text>
            </View>
          </Animated.View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    marginTop: 10,
    padding: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
  },
  name: {
    fontFamily: 'Barlow-Bold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  teamName: {
    marginTop: 2,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  minutePill: {
    minWidth: 42,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.bg300,
    alignItems: 'center',
  },
  minute: {
    fontFamily: 'Barlow-Bold',
    fontSize: 13,
    color: colors.textPrimary,
  },
});

const statStyles = StyleSheet.create({
  block: {
    marginTop: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    color: colors.textSecondary,
    letterSpacing: 1.4,
  },
  sideValue: {
    width: 40,
    textAlign: 'center',
    fontFamily: 'Barlow-Black',
    fontSize: 20,
    color: colors.accent,
  },
  track: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.bg300,
    flexDirection: 'row',
  },
  fillLeft: {
    height: '100%',
  },
  fillRight: {
    height: '100%',
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  heroBg: {
    backgroundColor: colors.bg200,
    paddingBottom: 18,
  },
  backBtn: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  shareBtn: {
    position: 'absolute',
    right: 16,
    top: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bg300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroRound: {
    fontFamily: 'Barlow-Bold',
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.accent,
    textAlign: 'center',
    marginBottom: 12,
  },
  heroScoreShell: {
    marginHorizontal: 20,
    minHeight: 170,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: colors.bg200,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    paddingHorizontal: 18,
    position: 'relative',
  },
  sideGlowLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 56,
  },
  sideGlowRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 56,
  },
  heroTeamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroTeamBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroTeamBlockRight: {
    justifyContent: 'flex-end',
  },
  heroTeamName: {
    flex: 1,
    fontFamily: 'Barlow-SemiBold',
    fontSize: 17,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  heroTeamNameRight: {
    textAlign: 'right',
  },
  heroScoreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroScore: {
    fontFamily: 'Barlow-Black',
    fontSize: 56,
    color: colors.textOnDark,
    letterSpacing: 0,
    textAlign: 'center',
  },
  heroScoreX: {
    fontFamily: 'Barlow-Bold',
    fontSize: 38,
    color: colors.textMuted,
  },
  heroPenaltyText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 14,
    color: colors.textMuted,
    marginTop: -4,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 16,
  },
  tabButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg300,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabButtonActive: {
    backgroundColor: colors.accentGlow,
    borderColor: colors.accent,
  },
  tabButtonText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  tabButtonTextActive: {
    color: colors.textPrimary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  eventsList: {
    marginTop: 8,
  },
  emptyBlock: {
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  emptyTitle: {
    marginTop: 16,
    fontFamily: 'Barlow-Bold',
    fontSize: 18,
    color: colors.textPrimary,
  },
  emptyText: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: 'Barlow-Regular',
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  statsCard: {
    marginTop: 8,
    padding: 16,
  },
  statsNote: {
    marginTop: 14,
    paddingHorizontal: 6,
  },
  statsNoteText: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textMuted,
  },
  bottomSpacer: {
    height: 40,
  },
  // Shareable Result Styles
  shareableResult: {
    position: 'absolute',
    left: -9999,
    top: 0,
    width: 400,
    padding: 24,
    backgroundColor: colors.bg200,
    borderRadius: 20,
    overflow: 'hidden',
  },
  shareableChampName: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.accent,
    textAlign: 'center',
    letterSpacing: 1,
  },
  shareableRound: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  shareableScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  shareableTeam: {
    flex: 1,
    gap: 6,
  },
  shareableColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  shareableTeamName: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 16,
    color: colors.textPrimary,
  },
  shareableScore: {
    fontFamily: 'Barlow-Black',
    fontSize: 48,
    color: colors.textOnDark,
    letterSpacing: 2,
  },
  shareableScorers: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  shareableScorersLabel: {
    fontFamily: 'Barlow-Bold',
    fontSize: 12,
    color: colors.accent,
    marginBottom: 6,
  },
  shareableScorerName: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  shareableWatermark: {
    marginTop: 16,
    fontFamily: 'Barlow-Regular',
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
