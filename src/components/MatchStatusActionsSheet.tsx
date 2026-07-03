import React, { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import {
  applyWalkover,
  applyPostpone,
  applyCancel,
  applyReactivate,
  getMatchStatusErrorMessage,
} from '../services/index';
import {
  notifyWalkover,
  notifyMatchPostponed,
  notifyMatchCancelled,
  notifyReconfirmationRequired,
} from '../services/notificationService';
import { applyConvocationStatusEffect } from '../services/convocationService';
import { markAttendancesForReconfirmation } from '../services/attendanceService';
import { useMatchStore } from '../stores/matchStore';
import { useChampionshipStore } from '../stores/championshipStore';
import { useTeamStore } from '../stores/teamStore';
import { colors } from '../theme/colors';
import { Championship, MatchModel, Team } from '../types';
import { AppButton } from './AppButton';

export type MatchStatusAction = 'wo' | 'adiar' | 'cancelar' | 'reativar';

export interface MatchStatusActionsSheetRef {
  open: (
    action: MatchStatusAction,
    match: MatchModel,
    championship: Championship,
    homeTeam?: Team,
    awayTeam?: Team,
  ) => void;
}

interface Props {
  organizerId: string;
}

function makeChangeId(): string {
  return `mstatus-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const ACTION_TITLE: Record<MatchStatusAction, string> = {
  wo: 'Aplicar W.O.',
  adiar: 'Adiar partida',
  cancelar: 'Cancelar partida',
  reativar: 'Reativar partida',
};

export const MatchStatusActionsSheet = forwardRef<MatchStatusActionsSheetRef, Props>(
  ({ organizerId }, ref) => {
    const [visible, setVisible] = useState(false);
    const [action, setAction] = useState<MatchStatusAction>('wo');
    const [match, setMatch] = useState<MatchModel | null>(null);
    const [championship, setChampionship] = useState<Championship | null>(null);
    const [homeTeam, setHomeTeam] = useState<Team | undefined>();
    const [awayTeam, setAwayTeam] = useState<Team | undefined>();

    const [reason, setReason] = useState('');
    const [winnerId, setWinnerId] = useState('');
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [loading, setLoading] = useState(false);

    const players = useTeamStore((s) => s.players);

    useImperativeHandle(ref, () => ({
      open: (nextAction, m, champ, home, away) => {
        setAction(nextAction);
        setMatch(m);
        setChampionship(champ);
        setHomeTeam(home);
        setAwayTeam(away);
        setReason('');
        setWinnerId('');
        const base = m.scheduledAt ? new Date(m.scheduledAt) : new Date();
        // Sugere uma data futura por padrão para adiar/reativar.
        const suggestion = base.getTime() > Date.now() ? base : new Date(Date.now() + 86400000);
        setSelectedDate(suggestion);
        setShowDatePicker(false);
        setShowTimePicker(false);
        setVisible(true);
      },
    }));

    const close = () => {
      if (loading) return;
      setVisible(false);
    };

    // Capitães + atletas (com userId) dos dois times — destinatários das notificações.
    const recipientUserIds = useMemo(() => {
      if (!match) return [];
      const ids = new Set<string>();
      if (homeTeam?.captainId) ids.add(homeTeam.captainId);
      if (awayTeam?.captainId) ids.add(awayTeam.captainId);
      for (const p of players) {
        if ((p.teamId === match.homeTeamId || p.teamId === match.awayTeamId) && p.userId) {
          ids.add(p.userId);
        }
      }
      return Array.from(ids);
    }, [match, homeTeam, awayTeam, players]);

    const onDateChange = (_e: DateTimePickerEvent, date?: Date) => {
      if (Platform.OS === 'android') setShowDatePicker(false);
      if (!date) return;
      const merged = new Date(date);
      merged.setHours(selectedDate.getHours(), selectedDate.getMinutes());
      setSelectedDate(merged);
    };

    const onTimeChange = (_e: DateTimePickerEvent, date?: Date) => {
      if (Platform.OS === 'android') setShowTimePicker(false);
      if (!date) return;
      const merged = new Date(selectedDate);
      merged.setHours(date.getHours(), date.getMinutes());
      setSelectedDate(merged);
    };

    const formatDate = (d: Date) =>
      d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
    const formatTime = (d: Date) =>
      `${d.getHours().toString().padStart(2, '0')}h${d.getMinutes().toString().padStart(2, '0')}`;

    const applyStoreResult = (result: {
      matchUpdate: Partial<MatchModel>;
      nextMatchIdToUpdate: string | null;
      nextMatchUpdate: Partial<MatchModel> | null;
      championshipUpdate: Partial<Championship> | null;
    }) => {
      if (!match) return;
      useMatchStore.getState().updateMatch(match.id, result.matchUpdate);
      if (result.nextMatchIdToUpdate && result.nextMatchUpdate) {
        useMatchStore.getState().updateMatch(result.nextMatchIdToUpdate, result.nextMatchUpdate);
      }
      if (result.championshipUpdate) {
        useChampionshipStore
          .getState()
          .updateChampionship(match.championshipId, result.championshipUpdate);
      }
    };

    // B5: propaga o efeito da mudança de status para as convocações dos DOIS times
    // e (no adiamento) marca as presenças para reconfirmação. Best-effort e
    // idempotente — o serviço de presença também bloqueia respostas relendo o status
    // ao vivo, então uma falha aqui não compromete a integridade.
    const propagateConvocationEffect = async (
      type: 'adiamento' | 'cancelamento' | 'wo',
      reason: string,
    ) => {
      if (!match) return;
      try {
        await Promise.all([
          applyConvocationStatusEffect(match.id, match.homeTeamId, type, reason),
          applyConvocationStatusEffect(match.id, match.awayTeamId, type, reason),
        ]);
        if (type === 'adiamento') {
          await markAttendancesForReconfirmation(match.id);
          notifyReconfirmationRequired(
            match.championshipId,
            homeTeam?.name ?? 'Time A',
            awayTeam?.name ?? 'Time B',
            match.id,
            recipientUserIds,
          ).catch(() => {});
        }
      } catch (e) {
        console.warn('[MatchStatusActionsSheet] convocation propagation error:', e);
      }
    };

    const handleConfirm = async () => {
      if (!match || !championship || loading) return;
      if (reason.trim().length < 5) {
        Toast.show({ type: 'error', text1: 'Motivo obrigatório', text2: 'Mínimo de 5 caracteres.' });
        return;
      }
      if (action === 'wo' && !winnerId) {
        Toast.show({ type: 'error', text1: 'Escolha o vencedor do W.O.' });
        return;
      }

      const allMatches = useMatchStore.getState().matches;
      const baseCtx = {
        changeId: makeChangeId(),
        organizerId,
        reason: reason.trim(),
        match,
        championship,
        allMatches,
        expectedStatusVersion: match.statusVersion ?? 0,
      };

      setLoading(true);
      try {
        const homeName = homeTeam?.name ?? 'Time A';
        const awayName = awayTeam?.name ?? 'Time B';

        if (action === 'wo') {
          const result = await applyWalkover({ ...baseCtx, winnerId });
          if (!result.idempotent) {
            applyStoreResult(result);
            await propagateConvocationEffect('wo', reason.trim());
            const winnerName = winnerId === match.homeTeamId ? homeName : awayName;
            notifyWalkover(
              match.championshipId,
              homeName,
              awayName,
              winnerName,
              match.id,
              recipientUserIds,
            ).catch(() => {});
          }
          Toast.show({ type: 'success', text1: 'W.O. aplicado', text2: '3 x 0 registrado.' });
        } else if (action === 'adiar') {
          const newScheduledAt = selectedDate.toISOString();
          const result = await applyPostpone({ ...baseCtx, newScheduledAt });
          if (!result.idempotent) {
            applyStoreResult(result);
            await propagateConvocationEffect('adiamento', reason.trim());
            notifyMatchPostponed(
              match.championshipId,
              homeName,
              awayName,
              selectedDate,
              match.id,
              recipientUserIds,
            ).catch(() => {});
          }
          Toast.show({ type: 'success', text1: 'Partida adiada' });
        } else if (action === 'cancelar') {
          const result = await applyCancel(baseCtx);
          if (!result.idempotent) {
            applyStoreResult(result);
            await propagateConvocationEffect('cancelamento', reason.trim());
            notifyMatchCancelled(
              match.championshipId,
              homeName,
              awayName,
              match.id,
              recipientUserIds,
            ).catch(() => {});
          }
          Toast.show({ type: 'success', text1: 'Partida cancelada' });
        } else {
          const newScheduledAt = selectedDate.toISOString();
          const result = await applyReactivate({ ...baseCtx, newScheduledAt });
          if (!result.idempotent) applyStoreResult(result);
          Toast.show({ type: 'success', text1: 'Partida reativada' });
        }

        setVisible(false);
      } catch (err) {
        console.error('[MatchStatusActionsSheet] action error:', err);
        Toast.show({ type: 'error', text1: 'Ação bloqueada', text2: getMatchStatusErrorMessage(err) });
      } finally {
        setLoading(false);
      }
    };

    const showWinnerPicker = action === 'wo';
    const showDateInputs = action === 'adiar' || action === 'reativar';

    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>{ACTION_TITLE[action]}</Text>
              <Pressable onPress={close} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            {match && (
              <Text style={styles.subtitle}>
                {homeTeam?.name ?? 'Casa'} vs {awayTeam?.name ?? 'Fora'} · Rodada {match.round}
              </Text>
            )}

            {showWinnerPicker && (
              <>
                <Text style={styles.label}>Time vencedor</Text>
                <View style={styles.winnerRow}>
                  <Pressable
                    style={[styles.winnerBtn, winnerId === match?.homeTeamId && styles.winnerBtnActive]}
                    onPress={() => match && setWinnerId(match.homeTeamId)}
                  >
                    <Text style={styles.winnerText} numberOfLines={1}>
                      {homeTeam?.name ?? 'Casa'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.winnerBtn, winnerId === match?.awayTeamId && styles.winnerBtnActive]}
                    onPress={() => match && setWinnerId(match.awayTeamId)}
                  >
                    <Text style={styles.winnerText} numberOfLines={1}>
                      {awayTeam?.name ?? 'Fora'}
                    </Text>
                  </Pressable>
                </View>
                <Text style={styles.hint}>Placar do W.O.: 3 x 0 para o vencedor.</Text>
              </>
            )}

            {showDateInputs && (
              <>
                <Text style={styles.label}>Nova data</Text>
                <Pressable style={styles.pickerButton} onPress={() => setShowDatePicker(true)}>
                  <Ionicons name="calendar-outline" size={18} color={colors.accent} />
                  <Text style={styles.pickerButtonText}>{formatDate(selectedDate)}</Text>
                </Pressable>
                {showDatePicker && (
                  <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    minimumDate={new Date()}
                    onChange={onDateChange}
                    themeVariant="dark"
                  />
                )}
                <Text style={styles.label}>Horário</Text>
                <Pressable style={styles.pickerButton} onPress={() => setShowTimePicker(true)}>
                  <Ionicons name="time-outline" size={18} color={colors.accent} />
                  <Text style={styles.pickerButtonText}>{formatTime(selectedDate)}</Text>
                </Pressable>
                {showTimePicker && (
                  <DateTimePicker
                    value={selectedDate}
                    mode="time"
                    is24Hour
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onTimeChange}
                    themeVariant="dark"
                  />
                )}
              </>
            )}

            <Text style={styles.label}>Motivo (obrigatório)</Text>
            <TextInput
              style={styles.reasonInput}
              value={reason}
              onChangeText={setReason}
              placeholder="Descreva o motivo desta ação"
              placeholderTextColor={colors.textMuted}
              multiline
            />

            <View style={styles.footer}>
              {loading ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <AppButton title="Confirmar" onPress={handleConfirm} fullWidth />
              )}
            </View>
          </View>
        </View>
      </Modal>
    );
  },
);

MatchStatusActionsSheet.displayName = 'MatchStatusActionsSheet';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  sheet: {
    backgroundColor: colors.bg200,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: 'Barlow-Bold',
    fontSize: 18,
    color: colors.textPrimary,
  },
  subtitle: {
    marginTop: 4,
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textSecondary,
  },
  label: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 8,
  },
  winnerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  winnerBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: colors.bg300,
    borderWidth: 1,
    borderColor: colors.border,
  },
  winnerBtnActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(245,166,35,0.15)',
  },
  winnerText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  hint: {
    marginTop: 8,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textMuted,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.bg300,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerButtonText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  reasonInput: {
    minHeight: 64,
    borderRadius: 12,
    padding: 12,
    backgroundColor: colors.bg300,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: 'Barlow-Regular',
    fontSize: 14,
    color: colors.textPrimary,
    textAlignVertical: 'top',
  },
  footer: {
    marginTop: 22,
    alignItems: 'center',
  },
});
