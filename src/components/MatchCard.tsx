import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from './Badge';
import { TeamColorDot } from './TeamColorDot';
import { TeamLogo } from './TeamLogo';
import { MatchEvent, MatchModel, Player, Team } from '../types';
import { colors } from '../theme/colors';


interface Props {
  match: MatchModel;
  homeTeam?: Team;
  awayTeam?: Team;
  events: MatchEvent[];
  players?: Player[];
  userTeamId?: string;
  canRegister?: boolean;
  canSchedule?: boolean;
  onSchedulePress?: () => void;
  onPress?: () => void;
}

function formatScheduledAt(value?: string | null): string | null {
  if (!value) return null;
  try {
    const d = new Date(value);
    const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' });
    const day = d.getDate().toString().padStart(2, '0');
    const month = d.toLocaleDateString('pt-BR', { month: 'short' });
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1).replace('.', '');
    return `${cap}, ${day} ${month} · ${h}h${m}`;
  } catch {
    return value;
  }
}

function isToday(value?: string | null): boolean {
  if (!value) return false;
  const d = new Date(value);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function isTomorrow(value?: string | null): boolean {
  if (!value) return false;
  const d = new Date(value);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate();
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
  players = [],
  userTeamId,
  canRegister = false,
  canSchedule = false,
  onSchedulePress,
  onPress,
}: Props) {
  const isFinished = match.status === 'finalizado';
  const isLive = match.status === 'ao_vivo';
  const isScheduled = match.status === 'agendado';
  const homeScore = match.homeScore ?? 0;
  const awayScore = match.awayScore ?? 0;
  const homeWon = isFinished && homeScore > awayScore;
  const awayWon = isFinished && awayScore > homeScore;
  const hasPenalties = match.homePenaltyScore != null && match.awayPenaltyScore != null;
  const homePenalty = match.homePenaltyScore ?? 0;
  const awayPenalty = match.awayPenaltyScore ?? 0;
  const resultColor = getResultColor(match, userTeamId);
  const hasInvalidTeams = !!match.homeTeamId && match.homeTeamId === match.awayTeamId;
  const resolvedAwayTeam = hasInvalidTeams ? undefined : awayTeam;
  const homeGoals = getGoalRows(events, match.homeTeamId);
  const awayGoals = hasInvalidTeams ? [] : getGoalRows(events, match.awayTeamId);
  const goalRows = [...homeGoals, ...awayGoals];
  const today = isScheduled && isToday(match.scheduledAt);
  const tomorrow = isScheduled && isTomorrow(match.scheduledAt);
  const scheduleBadge = today ? 'HOJE' : tomorrow ? 'AMANH\u00C3' : null;
  const formattedDate = formatScheduledAt(match.scheduledAt);

  const statusColor = hasInvalidTeams
    ? colors.danger
    : isLive
      ? colors.neon
      : isFinished
        ? colors.bg300
        : scheduleBadge
          ? colors.accent
          : colors.border;

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
          {homeTeam ? (
            <TeamLogo team={homeTeam} size={28} />
          ) : (
            <TeamColorDot color={colors.textMuted} />
          )}
        </View>

        <View style={styles.center}>
          {isFinished && (
            <>
              <View style={styles.scoreRow}>
                <Text style={[styles.score, homeWon && styles.scoreWinner]}>{homeScore}</Text>
                <Text style={styles.scoreDash}>—</Text>
                <Text style={[styles.score, awayWon && styles.scoreWinner]}>{awayScore}</Text>
              </View>
              {hasPenalties && (
                <Text style={styles.penaltyText}>
                  ({homePenalty} - {awayPenalty} pen.)
                </Text>
              )}
            </>
          )}
          {isLive && (
            <>
              <Badge label="AO VIVO" variant="live" />
              <Text style={styles.liveScore}>{homeScore} — {awayScore}</Text>
            </>
          )}
          {!isFinished && !isLive && (
            <>
              {scheduleBadge && <Badge label={scheduleBadge} variant="gold" />}
              <Text style={styles.vs}>vs</Text>
            </>
          )}
        </View>

        <View style={styles.teamRight}>
          {resolvedAwayTeam ? (
            <TeamLogo team={resolvedAwayTeam} size={28} />
          ) : (
            <TeamColorDot color={colors.textMuted} />
          )}
          <Text style={styles.teamNameRight} numberOfLines={2}>
            {resolvedAwayTeam?.name ?? 'Time B'}
          </Text>
        </View>
      </View>

      {isScheduled && (
        <View style={styles.scheduleFooter}>
          <Ionicons name="calendar-outline" size={12} color={formattedDate ? colors.accent : colors.textMuted} />
          <Text style={[styles.scheduleDate, !formattedDate && styles.scheduleDateMuted]}>
            {formattedDate ?? 'A definir'}
          </Text>
          {match.location ? (
            <>
              <Text style={styles.scheduleSep}>·</Text>
              <Ionicons name="location-outline" size={12} color={colors.textMuted} />
              <Text style={styles.scheduleLocation} numberOfLines={1}>{match.location}</Text>
            </>
          ) : null}
        </View>
      )}

      {isScheduled && canSchedule && onSchedulePress && (
        <Pressable
          style={styles.scheduleAction}
          onPress={(event) => {
            event.stopPropagation();
            onSchedulePress();
          }}
        >
          <Ionicons name="calendar-clear-outline" size={14} color={colors.accent} />
          <Text style={styles.scheduleActionText}>Agendar</Text>
        </Pressable>
      )}

      {isFinished && goalRows.length > 0 && (
        <View style={styles.footer}>
          {goalRows.map((event) => (
            <View key={event.id} style={styles.goalRow}>
              <Ionicons name="football" size={11} color={colors.textSecondary} />
              <Text style={styles.goalText} numberOfLines={1}>
                {players.find((player) => player.id === event.playerId)?.name ?? 'Atleta'} · {event.minute}'
              </Text>
            </View>
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
  penaltyText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: -2,
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
  scheduleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexWrap: 'nowrap',
  },
  scheduleDate: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 11,
    color: colors.accent,
  },
  scheduleDateMuted: {
    fontFamily: 'Barlow-Regular',
    color: colors.textMuted,
  },
  scheduleSep: {
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    color: colors.textMuted,
  },
  scheduleLocation: {
    flex: 1,
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    color: colors.textSecondary,
  },
  scheduleAction: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 14,
    marginBottom: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentGlow,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  scheduleActionText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    color: colors.accent,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  goalRow: {
    maxWidth: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  goalText: {
    flexShrink: 1,
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    color: colors.textSecondary,
  },
});
