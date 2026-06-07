import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { updateDocument } from '../services/index';
import { notifyMatchScheduled } from '../services/notificationService';
import { colors } from '../theme/colors';
import { MatchModel, Team } from '../types';
import { AppButton } from './AppButton';

export interface ScheduleMatchBottomSheetRef {
  open: (match: MatchModel, homeTeam?: Team, awayTeam?: Team) => void;
}

interface Props {
  userId: string;
  onScheduled?: (matchId: string, updates: Partial<MatchModel>) => void;
}

export const ScheduleMatchBottomSheet = forwardRef<ScheduleMatchBottomSheetRef, Props>(
  ({ userId, onScheduled }, ref) => {
    const sheetRef = useRef<BottomSheet>(null);
    const snapPoints = useMemo(() => ['60%', '80%'], []);

    const [match, setMatch] = useState<MatchModel | null>(null);
    const [homeTeam, setHomeTeam] = useState<Team | undefined>();
    const [awayTeam, setAwayTeam] = useState<Team | undefined>();

    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [location, setLocation] = useState('');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [loading, setLoading] = useState(false);

    useImperativeHandle(ref, () => ({
      open: (m, home, away) => {
        setMatch(m);
        setHomeTeam(home);
        setAwayTeam(away);
        setSelectedDate(m.scheduledAt ? new Date(m.scheduledAt) : new Date());
        setLocation(m.location ?? '');
        setShowDatePicker(false);
        setShowTimePicker(false);
        sheetRef.current?.expand();
      },
    }));

    const handleClose = useCallback(() => {
      sheetRef.current?.close();
    }, []);

    const renderBackdrop = useCallback(
      (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.55} />
      ),
      [],
    );

    const onDateChange = (_event: DateTimePickerEvent, date?: Date) => {
      if (Platform.OS === 'android') setShowDatePicker(false);
      if (!date) return;
      const merged = new Date(date);
      merged.setHours(selectedDate.getHours(), selectedDate.getMinutes());
      setSelectedDate(merged);
    };

    const onTimeChange = (_event: DateTimePickerEvent, date?: Date) => {
      if (Platform.OS === 'android') setShowTimePicker(false);
      if (!date) return;
      const merged = new Date(selectedDate);
      merged.setHours(date.getHours(), date.getMinutes());
      setSelectedDate(merged);
    };

    const formatDate = (d: Date) =>
      d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

    const formatTime = (d: Date) =>
      `${d.getHours().toString().padStart(2, '0')}h${d.getMinutes().toString().padStart(2, '0')}`;

    const handleConfirm = async () => {
      if (!match) return;
      setLoading(true);
      const updates: Partial<MatchModel> = {
        scheduledAt: selectedDate.toISOString(),
        location: location.trim() || null,
        scheduledBy: userId,
      };
      try {
        await updateDocument('matches', match.id, updates);

        const captainIds = [homeTeam?.captainId, awayTeam?.captainId].filter(Boolean) as string[];
        await notifyMatchScheduled(
          captainIds,
          homeTeam?.name ?? 'Time A',
          awayTeam?.name ?? 'Time B',
          selectedDate,
          location.trim() || null,
          match.id,
        );

        onScheduled?.(match.id, updates);
        Toast.show({ type: 'success', text1: 'Partida agendada!' });
        handleClose();
      } catch (e) {
        console.warn('[ScheduleMatchBottomSheet] confirm error:', e);
        Toast.show({ type: 'error', text1: 'Erro ao agendar partida' });
      } finally {
        setLoading(false);
      }
    };

    return (
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handle}
        keyboardBehavior="extend"
      >
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Agendar Partida</Text>
              {homeTeam && awayTeam && (
                <Text style={styles.subtitle}>
                  {homeTeam.name} <Text style={styles.vs}>vs</Text> {awayTeam.name}
                </Text>
              )}
            </View>
            <Pressable onPress={handleClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Date picker */}
          <Text style={styles.label}>Data</Text>
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
              style={styles.iosPicker}
              themeVariant="dark"
            />
          )}

          {/* Time picker */}
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
              style={styles.iosPicker}
              themeVariant="dark"
            />
          )}

          {/* Location input */}
          <Text style={styles.label}>Local</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="location-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
            <BottomSheetTextInput
              style={styles.input}
              placeholder="Ex: Campo da Igreja Central"
              placeholderTextColor={colors.textMuted}
              value={location}
              onChangeText={setLocation}
              maxLength={80}
              returnKeyType="done"
            />
          </View>

          {/* Confirm button */}
          <View style={styles.footer}>
            {loading ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <AppButton
                title="Confirmar agendamento"
                onPress={handleConfirm}
                fullWidth
              />
            )}
          </View>
        </View>
      </BottomSheet>
    );
  },
);

ScheduleMatchBottomSheet.displayName = 'ScheduleMatchBottomSheet';

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: colors.bg200,
  },
  handle: {
    backgroundColor: colors.borderStrong,
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: {
    fontFamily: 'Barlow-Bold',
    fontSize: 20,
    color: colors.textPrimary,
  },
  subtitle: {
    marginTop: 2,
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textSecondary,
  },
  vs: {
    color: colors.textMuted,
  },
  label: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 16,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 50,
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
  iosPicker: {
    marginTop: 4,
    backgroundColor: colors.bg300,
    borderRadius: 12,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.bg300,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontFamily: 'Barlow-Regular',
    fontSize: 15,
    color: colors.textPrimary,
  },
  footer: {
    marginTop: 28,
    alignItems: 'center',
  },
});
