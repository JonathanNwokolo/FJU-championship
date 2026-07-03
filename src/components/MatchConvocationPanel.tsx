import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import {
  Championship,
  Convocation,
  MatchAttendance,
  MatchModel,
  Player,
  Team,
} from '../types';
import { AppButton } from './AppButton';
import { AppCard } from './AppCard';
import { isActiveRosterPlayer } from '../utils/teamRules';
import {
  EligibilityReason,
  canPlayerBeCalledUp,
  convocationDocId,
  deriveConvocationEffectiveStatus,
  groupTeamRoster,
  GroupedRosterEntry,
} from '../utils/convocationRules';
import { getSuspendedPlayers } from '../services/statsService';
import {
  saveConvocation,
  closeConvocation,
  getConvocationErrorMessage,
  respondAttendance,
  getAttendanceErrorMessage,
} from '../services/index';
import {
  notifyConvocationReceived,
  notifyAttendanceResponse,
} from '../services/notificationService';
import { useMatchConvocation } from '../hooks/useMatchConvocation';
import { useConvocationResponses } from '../hooks/useConvocationResponses';
import { useMatchAttendance } from '../hooks/useMatchAttendance';

interface Props {
  match: MatchModel;
  championship: Championship;
  homeTeam?: Team;
  awayTeam?: Team;
  players: Player[];
  allMatches: MatchModel[];
  events: import('../types').MatchEvent[];
  teams: Team[];
  userId: string;
}

const ELIGIBILITY_LABEL: Record<EligibilityReason, string> = {
  not_in_team: 'fora do time',
  inactive: 'inativo',
  wrong_championship: 'outro campeonato',
  suspended: 'suspenso',
  injured: 'lesionado',
  in_other_team: 'em outro time',
  match_started: 'partida iniciada',
  convocation_closed: 'convocação fechada',
};

const BUCKET_META: Record<
  GroupedRosterEntry['bucket'],
  { label: string; color: string; icon: string }
> = {
  confirmed: { label: 'Confirmados', color: colors.success, icon: 'checkmark-circle' },
  pending: { label: 'Pendentes', color: colors.warning, icon: 'time' },
  declined: { label: 'Recusados', color: colors.danger, icon: 'close-circle' },
  not_called: { label: 'Não convocados', color: colors.textMuted, icon: 'remove-circle-outline' },
  suspended: { label: 'Suspensos', color: colors.danger, icon: 'ban' },
  ineligible: { label: 'Inelegíveis', color: colors.textMuted, icon: 'alert-circle-outline' },
};

const BUCKET_ORDER: GroupedRosterEntry['bucket'][] = [
  'confirmed',
  'pending',
  'declined',
  'not_called',
  'suspended',
  'ineligible',
];

export function MatchConvocationPanel({
  match,
  championship,
  homeTeam,
  awayTeam,
  players,
  allMatches,
  events,
  teams,
  userId,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [optimisticConvocations, setOptimisticConvocations] = useState<Record<string, Convocation>>({});
  const [optimisticAttendances, setOptimisticAttendances] = useState<Record<string, MatchAttendance>>({});
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [declineReason, setDeclineReason] = useState('');
  const [showDecline, setShowDecline] = useState(false);

  const teamIds = useMemo(() => [match.homeTeamId, match.awayTeamId], [match]);
  const homeConvocationState = useMatchConvocation(match.id, match.homeTeamId);
  const awayConvocationState = useMatchConvocation(match.id, match.awayTeamId);

  const suspendedIds = useMemo(() => {
    const suspended = getSuspendedPlayers(allMatches, events, players, teams, championship.rules);
    return new Set(suspended.map((s) => s.playerId));
  }, [allMatches, events, players, teams, championship.rules]);

  // Subscriptions escopadas à partida — sem refresh manual.
  // Garante unsubscribe no unmount e na troca de partida.
  // Qual time o usuário capitaneia nesta partida (se algum).
  const captainTeam = useMemo<Team | undefined>(() => {
    if (homeTeam?.captainId === userId) return homeTeam;
    if (awayTeam?.captainId === userId) return awayTeam;
    return undefined;
  }, [homeTeam, awayTeam, userId]);

  // Atleta logado nesta partida (se for jogador de um dos times).
  const myPlayer = useMemo<Player | undefined>(
    () => players.find((p) => teamIds.includes(p.teamId ?? '') && p.userId === userId),
    [players, teamIds, userId],
  );

  const responsesState = useConvocationResponses(match.id);
  const myAttendanceState = useMatchAttendance(match.id, myPlayer?.id ?? '');

  const pickFreshConvocation = useCallback(
    (snapshot: Convocation | null, optimistic: Convocation | undefined) => {
      if (!optimistic) return snapshot;
      if (!snapshot) return optimistic;
      return (snapshot.version ?? 0) >= (optimistic.version ?? 0) ? snapshot : optimistic;
    },
    [],
  );

  const pickFreshAttendance = useCallback(
    (snapshot: MatchAttendance | null, optimistic: MatchAttendance | undefined) => {
      if (!optimistic) return snapshot;
      if (!snapshot) return optimistic;
      return (snapshot.version ?? 0) >= (optimistic.version ?? 0) ? snapshot : optimistic;
    },
    [],
  );

  const convByTeam = useMemo<Record<string, Convocation | null>>(() => {
    const homeDocId = convocationDocId(match.id, match.homeTeamId);
    const awayDocId = convocationDocId(match.id, match.awayTeamId);
    return {
      [match.homeTeamId]: pickFreshConvocation(
        homeConvocationState.convocation,
        optimisticConvocations[homeDocId],
      ),
      [match.awayTeamId]: pickFreshConvocation(
        awayConvocationState.convocation,
        optimisticConvocations[awayDocId],
      ),
    };
  }, [
    awayConvocationState.convocation,
    homeConvocationState.convocation,
    match.awayTeamId,
    match.homeTeamId,
    match.id,
    optimisticConvocations,
    pickFreshConvocation,
  ]);

  const myAttendance = useMemo(
    () =>
      myPlayer
        ? pickFreshAttendance(
            myAttendanceState.attendance,
            optimisticAttendances[`${match.id}_${myPlayer.id}`],
          )
        : null,
    [
      match.id,
      myAttendanceState.attendance,
      myPlayer,
      optimisticAttendances,
      pickFreshAttendance,
    ],
  );

  const attendanceByPlayer = useMemo(() => {
    const map = new Map(responsesState.responses);
    for (const attendance of Object.values(optimisticAttendances)) {
      if (attendance.matchId !== match.id) continue;
      const snapshot = map.get(attendance.playerId) ?? null;
      map.set(attendance.playerId, pickFreshAttendance(snapshot, attendance) as MatchAttendance);
    }
    if (myPlayer && myAttendance) {
      const snapshot = map.get(myPlayer.id) ?? null;
      map.set(myPlayer.id, pickFreshAttendance(snapshot, myAttendance) as MatchAttendance);
    }
    return map;
  }, [
    match.id,
    myAttendance,
    myPlayer,
    optimisticAttendances,
    pickFreshAttendance,
    responsesState.responses,
  ]);

  // Estado efetivo derivado do status real da partida — garante consistência
  // visual mesmo se applyConvocationStatusEffect ainda não propagou.
  const captainEffective = useMemo(
    () =>
      captainTeam
        ? deriveConvocationEffectiveStatus(
            match.status,
            convByTeam[captainTeam.id] ?? null,
          )
        : null,
    [captainTeam, match.status, convByTeam],
  );

  const myEffective = useMemo(
    () =>
      myPlayer
        ? deriveConvocationEffectiveStatus(
            match.status,
            convByTeam[myPlayer.teamId ?? ''] ?? null,
          )
        : null,
    [myPlayer, match.status, convByTeam],
  );

  const rosterFor = useCallback(
    (teamId: string) => players.filter((p) => p.teamId === teamId && isActiveRosterPlayer(p)),
    [players],
  );

  // ── Capitão: lista de elegíveis para edição ─────────────────────────────────
  const eligibleForCaptain = useMemo(() => {
    if (!captainTeam) return [];
    return rosterFor(captainTeam.id).map((p) => ({
      player: p,
      eligibility: canPlayerBeCalledUp(p, match, {
        suspended: suspendedIds.has(p.id),
        // Usa estado efetivo para bloquear quando match já não aceita edição.
        convocationOpen:
          captainEffective?.effectiveStatus === 'open' &&
          !captainEffective?.responseBlocked,
      }),
    }));
  }, [captainTeam, captainEffective, rosterFor, match, suspendedIds]);

  const startEditing = useCallback(() => {
    if (!captainTeam) return;
    const conv = convByTeam[captainTeam.id] ?? null;
    const initial = conv?.playerIds
      ? new Set(conv.playerIds)
      : new Set(eligibleForCaptain.filter((e) => e.eligibility.eligible).map((e) => e.player.id));
    setSelected(initial);
    setEditing(true);
  }, [captainTeam, convByTeam, eligibleForCaptain]);

  const toggle = useCallback((playerId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!captainTeam || saving) return;
    const conv = convByTeam[captainTeam.id] ?? null;
    const playerIds = Array.from(selected);
    if (playerIds.length === 0) {
      Toast.show({ type: 'error', text1: 'Selecione ao menos um atleta.' });
      return;
    }
    setSaving(true);
    try {
      const { convocation } = await saveConvocation({
        matchId: match.id,
        teamId: captainTeam.id,
        championshipId: championship.id,
        captainId: userId,
        playerIds,
        suspendedPlayerIds: Array.from(suspendedIds),
        expectedVersion: conv?.version ?? 0,
      });
      const recipients = rosterFor(captainTeam.id)
        .filter((p) => playerIds.includes(p.id) && p.userId)
        .map((p) => p.userId as string);
      notifyConvocationReceived(
        championship.id,
        captainTeam.name,
        homeTeam?.name ?? 'Time A',
        awayTeam?.name ?? 'Time B',
        match.id,
        recipients,
      ).catch(() => {});
      setOptimisticConvocations((prev) => ({ ...prev, [convocation.id]: convocation }));
      setEditing(false);
      Toast.show({ type: 'success', text1: 'Convocação salva' });
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Não salvo', text2: getConvocationErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }, [
    captainTeam,
    convByTeam,
    selected,
    saving,
    match,
    championship,
    userId,
    suspendedIds,
    rosterFor,
    homeTeam,
    awayTeam,
  ]);

  const handleClose = useCallback(async () => {
    if (!captainTeam || saving) return;
    const conv = convByTeam[captainTeam.id] ?? null;
    if (!conv) return;
    setSaving(true);
    try {
      const { convocation } = await closeConvocation({
        matchId: match.id,
        teamId: captainTeam.id,
        captainId: userId,
        expectedVersion: conv.version,
      });
      setOptimisticConvocations((prev) => ({ ...prev, [convocation.id]: convocation }));
      Toast.show({ type: 'success', text1: 'Convocação encerrada' });
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Erro', text2: getConvocationErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }, [captainTeam, convByTeam, saving, match.id, userId]);

  const handleResend = useCallback(() => {
    if (!captainTeam) return;
    const conv = convByTeam[captainTeam.id] ?? null;
    if (!conv) return;
    const recipients = rosterFor(captainTeam.id)
      .filter((p) => conv.playerIds.includes(p.id) && p.userId)
      .map((p) => p.userId as string);
    notifyConvocationReceived(
      championship.id,
      captainTeam.name,
      homeTeam?.name ?? 'Time A',
      awayTeam?.name ?? 'Time B',
      match.id,
      recipients,
    ).catch(() => {});
    Toast.show({ type: 'success', text1: 'Aviso reenviado' });
  }, [captainTeam, convByTeam, rosterFor, championship.id, homeTeam, awayTeam, match.id]);

  // ── Atleta: responder presença ──────────────────────────────────────────────
  const myConvocation = myPlayer ? convByTeam[myPlayer.teamId ?? ''] ?? null : null;
  const myIsCalledUp = !!myPlayer && !!myConvocation?.playerIds.includes(myPlayer.id);
  // requiresReconfirmation deriva do estado efetivo (adiamento) + flag do doc de presença.
  const myNeedsReconfirm =
    !!myEffective?.requiresReconfirmation || !!myAttendance?.reconfirmationRequired;

  const respond = useCallback(
    async (response: 'confirmed' | 'declined', reason?: string) => {
      if (!myPlayer || !myConvocation || saving) return;
      setSaving(true);
      try {
        const { attendance } = await respondAttendance({
          matchId: match.id,
          teamId: myPlayer.teamId as string,
          championshipId: championship.id,
          playerId: myPlayer.id,
          userId,
          response,
          declineReason: reason ?? null,
          expectedVersion: myAttendance?.version ?? 0,
        });
        setOptimisticAttendances((prev) => ({ ...prev, [attendance.id]: attendance }));
        const captainId =
          myPlayer.teamId === homeTeam?.id ? homeTeam?.captainId : awayTeam?.captainId;
        if (captainId) {
          notifyAttendanceResponse(
            championship.id,
            captainId,
            myPlayer.name,
            response === 'confirmed',
            match.id,
          ).catch(() => {});
        }
        setShowDecline(false);
        setDeclineReason('');
        Toast.show({
          type: 'success',
          text1: response === 'confirmed' ? 'Presença confirmada' : 'Presença recusada',
        });
      } catch (err) {
        Toast.show({ type: 'error', text1: 'Erro', text2: getAttendanceErrorMessage(err) });
      } finally {
        setSaving(false);
      }
    },
    [myPlayer, myConvocation, saving, match.id, championship.id, userId, myAttendance, homeTeam, awayTeam],
  );

  const loading =
    homeConvocationState.loading ||
    awayConvocationState.loading ||
    responsesState.loading ||
    myAttendanceState.loading;

  const listenerError =
    homeConvocationState.error ||
    awayConvocationState.error ||
    responsesState.error ||
    myAttendanceState.error;

  if (loading) {
    return (
      <AppCard style={styles.card}>
        <ActivityIndicator color={colors.accent} />
      </AppCard>
    );
  }

  return (
    <View style={styles.wrapper}>
      {listenerError && (
        <AppCard style={styles.card}>
          <Text style={styles.muted}>{listenerError}</Text>
        </AppCard>
      )}

      {/* Atleta — bloco de presença */}
      {myPlayer && (
        <AppCard style={styles.card}>
          <Text style={styles.cardTitle}>Minha presença</Text>
          {!myIsCalledUp ? (
            <Text style={styles.muted}>Você ainda não foi convocado para esta partida.</Text>
          ) : myEffective?.effectiveStatus === 'cancelled' ? (
            <Text style={styles.muted}>Partida cancelada — convocação encerrada.</Text>
          ) : myEffective?.effectiveStatus === 'completed' ? (
            <Text style={styles.muted}>Resultado por W.O. — convocação concluída.</Text>
          ) : myEffective?.responseBlocked ? (
            <Text style={styles.muted}>Partida em andamento — respostas encerradas.</Text>
          ) : (
            <>
              {myNeedsReconfirm && (
                <View style={styles.reconfirmBanner}>
                  <Ionicons name="refresh" size={14} color={colors.warning} />
                  <Text style={styles.reconfirmText}>
                    Partida remarcada — reconfirme sua presença.
                  </Text>
                </View>
              )}
              <Text style={styles.currentStatus}>
                {myAttendance && !myNeedsReconfirm
                  ? myAttendance.response === 'confirmed'
                    ? '✅ Você confirmou presença.'
                    : myAttendance.response === 'declined'
                    ? '🚷 Você recusou a convocação.'
                    : 'Aguardando sua resposta.'
                  : 'Aguardando sua resposta.'}
              </Text>
              {showDecline ? (
                <>
                  <TextInput
                    style={styles.reasonInput}
                    value={declineReason}
                    onChangeText={setDeclineReason}
                    placeholder="Motivo (opcional)"
                    placeholderTextColor={colors.textMuted}
                  />
                  <View style={styles.row}>
                    <AppButton
                      title="Confirmar recusa"
                      variant="outline"
                      onPress={() => respond('declined', declineReason.trim() || undefined)}
                    />
                    <AppButton title="Voltar" variant="ghost" onPress={() => setShowDecline(false)} />
                  </View>
                </>
              ) : (
                <View style={styles.row}>
                  <AppButton title="Confirmar" onPress={() => respond('confirmed')} />
                  <AppButton title="Recusar" variant="outline" onPress={() => setShowDecline(true)} />
                </View>
              )}
            </>
          )}
        </AppCard>
      )}

      {/* Capitão — gerenciar convocação */}
      {captainTeam && (
        <AppCard style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Convocação · {captainTeam.name}</Text>
            {captainEffective?.effectiveStatus === 'open' &&
              !captainEffective?.responseBlocked &&
              !editing && (
              <Pressable onPress={startEditing} hitSlop={8}>
                <Ionicons name="create-outline" size={20} color={colors.accent} />
              </Pressable>
            )}
          </View>

          {!convByTeam[captainTeam.id] && !editing && (
            <Text style={styles.muted}>Convocação ainda não criada.</Text>
          )}

          {editing ? (
            <>
              {eligibleForCaptain.map(({ player, eligibility }) => {
                const checked = selected.has(player.id);
                const disabled = !eligibility.eligible;
                return (
                  <Pressable
                    key={player.id}
                    style={styles.playerRow}
                    disabled={disabled}
                    onPress={() => toggle(player.id)}
                  >
                    <Ionicons
                      name={checked ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={disabled ? colors.textMuted : checked ? colors.accent : colors.textSecondary}
                    />
                    <Text style={[styles.playerName, disabled && styles.muted]}>
                      #{player.number} {player.name}
                    </Text>
                    {disabled && eligibility.reason && (
                      <Text style={styles.tagMuted}>{ELIGIBILITY_LABEL[eligibility.reason]}</Text>
                    )}
                  </Pressable>
                );
              })}
              <View style={styles.row}>
                {saving ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <>
                    <AppButton title="Salvar" onPress={handleSave} />
                    <AppButton title="Cancelar" variant="ghost" onPress={() => setEditing(false)} />
                  </>
                )}
              </View>
            </>
          ) : (
            convByTeam[captainTeam.id] && (
              <View style={styles.captainActions}>
                {captainEffective?.effectiveStatus === 'open' &&
                  !captainEffective?.responseBlocked && (
                  <>
                    <AppButton title="Reenviar aviso" variant="ghost" onPress={handleResend} />
                    <AppButton title="Encerrar" variant="outline" onPress={handleClose} />
                  </>
                )}
                {(captainEffective?.effectiveStatus !== 'open' ||
                  captainEffective?.responseBlocked) && (
                  <Text style={styles.muted}>
                    {captainEffective?.effectiveStatus === 'cancelled'
                      ? 'Convocação cancelada.'
                      : captainEffective?.effectiveStatus === 'completed'
                      ? 'Convocação concluída (W.O.).'
                      : captainEffective?.responseBlocked
                      ? 'Partida em andamento.'
                      : 'Convocação encerrada.'}
                  </Text>
                )}
              </View>
            )
          )}
        </AppCard>
      )}

      {/* Agrupamento por time (B8) */}
      {teamIds.map((teamId) => {
        const team = teams.find((t) => t.id === teamId);
        const conv = convByTeam[teamId] ?? null;
        const grouped = groupTeamRoster(
          rosterFor(teamId),
          conv,
          attendanceByPlayer,
          suspendedIds,
        );
        const byBucket = new Map<GroupedRosterEntry['bucket'], GroupedRosterEntry[]>();
        for (const g of grouped) {
          if (!byBucket.has(g.bucket)) byBucket.set(g.bucket, []);
          byBucket.get(g.bucket)!.push(g);
        }
        return (
          <AppCard key={teamId} style={styles.card}>
            <Text style={styles.cardTitle}>{team?.name ?? 'Time'}</Text>
            {!conv && <Text style={styles.muted}>Sem convocação registrada.</Text>}
            {BUCKET_ORDER.map((bucket) => {
              const entries = byBucket.get(bucket);
              if (!entries || entries.length === 0) return null;
              const meta = BUCKET_META[bucket];
              return (
                <View key={bucket} style={styles.bucketBlock}>
                  <View style={styles.bucketHeader}>
                    <Ionicons name={meta.icon as never} size={14} color={meta.color} />
                    <Text style={[styles.bucketLabel, { color: meta.color }]}>
                      {meta.label} ({entries.length})
                    </Text>
                  </View>
                  {entries.map((e) => (
                    <View key={e.player.id} style={styles.groupedRow}>
                      <Text style={styles.playerName}>
                        #{e.player.number} {e.player.name}
                      </Text>
                      {e.bucket === 'declined' && e.attendance?.declineReason && (
                        <Text style={styles.tagMuted} numberOfLines={1}>
                          {e.attendance.declineReason}
                        </Text>
                      )}
                      {e.reconfirmationRequired && (
                        <Ionicons name="refresh" size={13} color={colors.warning} />
                      )}
                    </View>
                  ))}
                </View>
              );
            })}
          </AppCard>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 12 },
  card: { padding: 16, gap: 10 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontFamily: 'Barlow-Bold', fontSize: 15, color: colors.textPrimary },
  muted: { fontFamily: 'Barlow-Regular', fontSize: 13, color: colors.textMuted },
  currentStatus: { fontFamily: 'Barlow-Medium', fontSize: 14, color: colors.textPrimary },
  row: { flexDirection: 'row', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  captainActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  groupedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  playerName: { fontFamily: 'Barlow-Medium', fontSize: 14, color: colors.textPrimary, flex: 1 },
  tagMuted: { fontFamily: 'Barlow-Regular', fontSize: 11, color: colors.textMuted },
  reconfirmBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245,166,35,0.12)',
    borderRadius: 8,
    padding: 8,
  },
  reconfirmText: { fontFamily: 'Barlow-Medium', fontSize: 12, color: colors.warning, flex: 1 },
  reasonInput: {
    borderRadius: 10,
    padding: 10,
    backgroundColor: colors.bg300,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: 'Barlow-Regular',
    fontSize: 14,
    color: colors.textPrimary,
  },
  bucketBlock: { gap: 2, marginTop: 4 },
  bucketHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bucketLabel: { fontFamily: 'Barlow-SemiBold', fontSize: 12 },
});
