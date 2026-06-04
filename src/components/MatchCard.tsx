import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from './Badge';
import { TeamColorDot } from './TeamColorDot';
import { MatchEvent, MatchModel, Team } from '../types';
import { colors } from '../theme/colors';

interface Props {
  match: MatchModel;
  homeTeam?: Team;
  awayTeam?: Team;
  events: MatchEvent[];
  userTeamId?: string;
  canRegister?: boolean;
  onPress?: () => void;
}

function formatDateTime(value?: string) {
  if (!value) return 'A definir';
  try {
    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function getResultColor(match: MatchModel, userTeamId?: string) {
  if (!userTeamId || match.status !== 'finalizado') return 'transparent';

  const homeScore = match.homeScore ?? 0;
  const awayScore = match.awayScore ?? 0;
  if (homeScore === awayScore) return colors.textMuted;

  const userWon =
    (match.homeTeamId === userTeamId && homeScore > awayScore) ||
    (match.awayTeamId === userTeamId && awayScore > homeScore);

  return userWon ? colors.success : colors.danger;
}

function getGoalRows(events: MatchEvent[], teamId?: string) {
  if (!teamId) return [];
  return events
    .filter((event) => event.teamId === teamId && event.type === 'gol')
    .slice(0, 2);
}

export function MatchCard({
  match,
  homeTeam,
  awayTeam,
  events,
  userTeamId,
  canRegister = false,
  onPress,
}: Props) {
  const isFinished = match.status === 'finalizado';
  const isLive = match.status === 'ao_vivo';
  const homeScore = match.homeScore ?? 0;
  const awayScore = match.awayScore ?? 0;
  const homeWon = isFinished && homeScore > awayScore;
  const awayWon = isFinished && awayScore > homeScore;
  const resultColor = getResultColor(match, userTeamId);
  const homeGoals = getGoalRows(events, match.homeTeamId);
  const awayGoals = getGoalRows(events, match.awayTeamId);
  const goalRows = [...homeGoals, ...awayGoals];

  const statusColor = isLive ? colors.neon : isFinished ? colors.bg300 : colors.border;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.resultIndicator, { backgroundColor: resultColor }]} />
      <View style={[styles.statusLine, { backgroundColor: statusColor }]} />
      {canRegister && (
        <Ionicons name="create-outline" size={14} color={colors.textMuted} style={styles.editIcon} />
      )}

      <View style={styles.body}>
        <View style={styles.teamLeft}>
          <Text style={styles.teamNameLeft} numberOfLines={2}>
            {homeTeam?.name ?? 'Time A'}
          </Text>
          <TeamColorDot color={homeTeam?.primaryColor ?? colors.textMuted} />
        </View>

        <View style={styles.center}>
          {isFinished && (
            <View style={styles.scoreRow}>
              <Text style={[styles.score, homeWon && styles.scoreWinner]}>{homeScore}</Text>
              <Text style={styles.scoreDash}>—</Text>
              <Text style={[styles.score, awayWon && styles.scoreWinner]}>{awayScore}</Text>
            </View>
          )}
          {isLive && (
            <>
              <Badge label="AO VIVO" variant="live" />
              <Text style={styles.liveScore}>{homeScore} — {awayScore}</Text>
            </>
          )}
          {!isFinished && !isLive && (
            <>
              <Text style={styles.vs}>vs</Text>
              <Text style={styles.date}>{formatDateTime(match.scheduledAt)}</Text>
            </>
          )}
        </View>

        <View style={styles.teamRight}>
          <TeamColorDot color={awayTeam?.primaryColor ?? colors.textMuted} />
          <Text style={styles.teamNameRight} numberOfLines={2}>
            {awayTeam?.name ?? 'Time B'}
          </Text>
        </View>
      </View>

      {isFinished && goalRows.length > 0 && (
        <View style={styles.footer}>
          {goalRows.map((event) => (
            <Text key={event.id} style={styles.goalText} numberOfLines={1}>
              ⚽ {event.playerId.replace('player-', 'Atleta ')} · {event.minute}'
            </Text>
          ))}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 90,
    marginHorizontal: 20,
    marginVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg200,
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.88,
  },
  resultIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    zIndex: 2,
  },
  statusLine: {
    height: 3,
  },
  editIcon: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 3,
  },
  body: {
    minHeight: 87,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  teamLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  teamRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  teamNameLeft: {
    flex: 1,
    fontFamily: 'Barlow-SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
    textAlign: 'right',
  },
  teamNameRight: {
    flex: 1,
    fontFamily: 'Barlow-SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  center: {
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  score: {
    fontFamily: 'Barlow-Black',
    fontSize: 26,
    color: colors.textPrimary,
  },
  scoreWinner: {
    color: colors.accent,
  },
  scoreDash: {
    fontFamily: 'Barlow-Bold',
    fontSize: 16,
    color: colors.textMuted,
  },
  liveScore: {
    fontFamily: 'Barlow-Black',
    fontSize: 20,
    color: colors.textPrimary,
  },
  vs: {
    fontFamily: 'Barlow-Medium',
    fontSize: 14,
    color: colors.textMuted,
  },
  date: {
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  goalText: {
    maxWidth: '48%',
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    color: colors.textSecondary,
  },
});
