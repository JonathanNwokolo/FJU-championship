import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../../theme/colors';
import { useMatchStore } from '../../stores/matchStore';
import { useTeamStore } from '../../stores/teamStore';
import { MatchEvent, Player, Team } from '../../types';
import { FixturesStackParamList } from '../../navigation/FixturesStackNavigator';

type RouteT = RouteProp<FixturesStackParamList, 'MatchSummary'>;

function EventRow({ event, players, teams }: {
  event: MatchEvent;
  players: Player[];
  teams: Team[];
}) {
  const player = players.find((p) => p.id === event.playerId);
  const team = teams.find((t) => t.id === event.teamId);
  const icon = event.type === 'gol' ? '⚽' : event.type === 'cartao_amarelo' ? '🟨' : '🟥';

  return (
    <View style={cardStyles.row}>
      <Text style={cardStyles.icon}>{icon}</Text>
      <Text style={cardStyles.name} numberOfLines={1}>
        {player?.name ?? '—'}
      </Text>
      {event.type !== 'gol' && (
        <Text style={cardStyles.teamName} numberOfLines={1}>
          {team?.name ?? '—'}
        </Text>
      )}
      <Text style={cardStyles.minute}>{event.minute}'</Text>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  icon: { fontSize: 16, flexShrink: 0 },
  name: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  teamName: { fontSize: 12, color: colors.textSecondary, flexShrink: 1 },
  minute: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    minWidth: 30,
    textAlign: 'right',
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export function MatchSummaryScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteT>();
  const { matchId } = route.params;

  const { matches, events } = useMatchStore();
  const { teams, players } = useTeamStore();

  const match = matches.find((m) => m.id === matchId);
  const matchEvents = events
    .filter((e) => e.matchId === matchId)
    .sort((a, b) => a.minute - b.minute);

  const homeTeam = teams.find((t) => t.id === match?.homeTeamId);
  const awayTeam = teams.find((t) => t.id === match?.awayTeamId);

  const homeGoals = matchEvents.filter(
    (e) => e.teamId === match?.homeTeamId && e.type === 'gol',
  );
  const awayGoals = matchEvents.filter(
    (e) => e.teamId === match?.awayTeamId && e.type === 'gol',
  );
  const cards = matchEvents.filter(
    (e) => e.type === 'cartao_amarelo' || e.type === 'cartao_vermelho',
  );

  const maxGoalRows = Math.max(homeGoals.length, awayGoals.length);

  if (!match) return null;

  return (
    <View style={styles.root}>
      {/* ── Hero header ── */}
      <SafeAreaView style={styles.heroBg} edges={['top']}>
        {/* Back */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color={colors.textOnDark} />
        </TouchableOpacity>

        {/* Round label */}
        <Text style={styles.heroRound}>Rodada {match.round}</Text>

        {/* Score row */}
        <View style={styles.heroScoreRow}>
          <Text
            style={[styles.heroTeamName, { color: homeTeam?.primaryColor ?? colors.textOnDark }]}
            numberOfLines={2}
          >
            {homeTeam?.name ?? '—'}
          </Text>

          <View style={styles.heroScoreCenter}>
            <Text style={styles.heroScore}>
              {match.homeScore ?? 0}
              <Text style={styles.heroScoreX}> × </Text>
              {match.awayScore ?? 0}
            </Text>
          </View>

          <Text
            style={[styles.heroTeamName, styles.heroTeamNameRight, { color: awayTeam?.primaryColor ?? colors.textOnDark }]}
            numberOfLines={2}
          >
            {awayTeam?.name ?? '—'}
          </Text>
        </View>

        {/* Team color dots */}
        <View style={styles.heroDotsRow}>
          <View style={[styles.heroDot, { backgroundColor: homeTeam?.primaryColor ?? colors.border }]} />
          <View style={[styles.heroDot, { backgroundColor: awayTeam?.primaryColor ?? colors.border }]} />
        </View>
      </SafeAreaView>

      {/* ── Content ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Goals section */}
        <Text style={styles.sectionLabel}>GOLS</Text>

        {maxGoalRows === 0 ? (
          <Text style={styles.emptyText}>Nenhum gol registrado.</Text>
        ) : (
          <View style={styles.goalsContainer}>
            {/* Header row */}
            <View style={styles.goalsHeaderRow}>
              <View style={styles.goalsColHeader}>
                <View style={[styles.goalHeaderDot, { backgroundColor: homeTeam?.primaryColor }]} />
                <Text style={styles.goalsColHeaderText} numberOfLines={1}>
                  {homeTeam?.name ?? '—'}
                </Text>
              </View>
              <View style={styles.goalsDivider} />
              <View style={[styles.goalsColHeader, styles.goalsColHeaderRight]}>
                <Text style={[styles.goalsColHeaderText, { textAlign: 'right' }]} numberOfLines={1}>
                  {awayTeam?.name ?? '—'}
                </Text>
                <View style={[styles.goalHeaderDot, { backgroundColor: awayTeam?.primaryColor }]} />
              </View>
            </View>

            {/* Goal rows */}
            {Array.from({ length: maxGoalRows }).map((_, i) => {
              const homeGoal = homeGoals[i];
              const awayGoal = awayGoals[i];
              const homePlayer = homeGoal ? players.find((p) => p.id === homeGoal.playerId) : null;
              const awayPlayer = awayGoal ? players.find((p) => p.id === awayGoal.playerId) : null;

              return (
                <View key={i} style={styles.goalsRow}>
                  {/* Home goal cell */}
                  <View style={styles.goalsCell}>
                    {homeGoal ? (
                      <Text style={styles.goalText} numberOfLines={1}>
                        ⚽ {homePlayer?.name ?? '—'}{' '}
                        <Text style={styles.goalMinute}>{homeGoal.minute}'</Text>
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.goalsDivider} />

                  {/* Away goal cell */}
                  <View style={[styles.goalsCell, styles.goalsCellRight]}>
                    {awayGoal ? (
                      <Text style={[styles.goalText, { textAlign: 'right' }]} numberOfLines={1}>
                        <Text style={styles.goalMinute}>{awayGoal.minute}'</Text>{' '}
                        {awayPlayer?.name ?? '—'} ⚽
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Cards section */}
        {cards.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 28 }]}>CARTÕES</Text>
            <View style={styles.cardsContainer}>
              {cards.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  players={players}
                  teams={teams}
                />
              ))}
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  // Hero
  heroBg: {
    backgroundColor: colors.primaryDark,
    paddingBottom: 20,
  },
  backBtn: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  heroRound: {
    fontSize: 12,
    fontWeight: '600',
    color: `${colors.textOnDark}66`,
    textAlign: 'center',
    marginBottom: 8,
  },
  heroScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 8,
  },
  heroTeamName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
  },
  heroTeamNameRight: { textAlign: 'right' },
  heroScoreCenter: { alignItems: 'center', flexShrink: 0 },
  heroScore: {
    fontSize: 48,
    fontWeight: '900',
    color: colors.textOnDark,
    letterSpacing: -1,
    textAlign: 'center',
  },
  heroScoreX: {
    fontSize: 32,
    fontWeight: '400',
    color: `${colors.textOnDark}66`,
  },
  heroDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 12,
  },
  heroDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  // Content
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
  },

  // Goals two-column layout
  goalsContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  goalsHeaderRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingVertical: 10,
  },
  goalsColHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  goalsColHeaderRight: { justifyContent: 'flex-end' },
  goalHeaderDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  goalsColHeaderText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  goalsDivider: { width: 1, backgroundColor: colors.borderLight },
  goalsRow: { flexDirection: 'row', minHeight: 40 },
  goalsCell: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  goalsCellRight: { alignItems: 'flex-end' },
  goalText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  goalMinute: { color: colors.textSecondary, fontWeight: '400' },

  // Cards list
  cardsContainer: {
    backgroundColor: colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
});
