import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import BottomSheet, {
  BottomSheetView,
  BottomSheetBackdrop,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { AppButton } from '../../components/AppButton';
import { EmptyState } from '../../components/EmptyState';
import { useTeamStore } from '../../stores/teamStore';
import { Player, PlayerPosition } from '../../types';
import { colors } from '../../theme/colors';
import { POSITION_COLORS, POSITION_LABELS } from '../../utils/constants';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';

type Props = NativeStackScreenProps<HomeStackParamList, 'ManageRoster'>;

const POSITIONS: PlayerPosition[] = ['goleiro', 'zagueiro', 'lateral', 'meia', 'atacante'];

function getInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

function PlayerRow({
  player,
  onPress,
  onDelete,
}: {
  player: Player;
  onPress: () => void;
  onDelete: () => void;
}) {
  const posColor = POSITION_COLORS[player.position] ?? colors.textSecondary;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={rowStyles.container}>
      <View style={[rowStyles.avatar, { backgroundColor: `${posColor}22` }]}>
        <Text style={[rowStyles.initials, { color: posColor }]}>{getInitials(player.name)}</Text>
      </View>
      <View style={rowStyles.info}>
        <Text style={rowStyles.name} numberOfLines={1}>{player.name}</Text>
        <View style={rowStyles.meta}>
          <View style={[rowStyles.posBadge, { backgroundColor: `${posColor}20` }]}>
            <Text style={[rowStyles.posText, { color: posColor }]}>
              {POSITION_LABELS[player.position]}
            </Text>
          </View>
          <Text style={rowStyles.number}>#{player.number}</Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={onDelete}
        style={rowStyles.deleteBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={rowStyles.deleteIcon}>🗑</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export function ManageRosterScreen({ route, navigation }: Props) {
  const { teamId } = route.params;
  const { teams, players, addPlayer, removePlayer } = useTeamStore();

  const team = teams.find((t) => t.id === teamId);
  const roster = players.filter((p) => p.teamId === teamId);

  // ── BottomSheet ────────────────────────────────────────────────────────────
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['55%', '75%'], []);
  const [newName, setNewName] = useState('');
  const [newPosition, setNewPosition] = useState<PlayerPosition>('meia');
  const [newNumber, setNewNumber] = useState('');
  const [nameError, setNameError] = useState('');
  const [numberError, setNumberError] = useState('');

  const openSheet = useCallback(() => {
    setNewName('');
    setNewPosition('meia');
    setNewNumber('');
    setNameError('');
    setNumberError('');
    sheetRef.current?.expand();
  }, []);

  const closeSheet = useCallback(() => {
    sheetRef.current?.close();
  }, []);

  const handleAddPlayer = () => {
    let valid = true;
    if (!newName.trim()) { setNameError('Digite o nome do atleta'); valid = false; }
    const num = parseInt(newNumber);
    if (!newNumber || isNaN(num) || num < 1 || num > 99) {
      setNumberError('Número entre 1 e 99');
      valid = false;
    } else if (roster.some((p) => p.number === num)) {
      setNumberError('Número já em uso');
      valid = false;
    }
    if (!valid) return;

    addPlayer({
      id: `player-${Date.now()}`,
      teamId,
      name: newName.trim(),
      position: newPosition,
      number: num,
    });
    closeSheet();
  };

  const handleDelete = (player: Player) => {
    Alert.alert(
      'Remover atleta',
      `Remover ${player.name} do time?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: () => removePlayer(player.id) },
      ]
    );
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} />
    ),
    []
  );

  if (!team) return null;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {/* Team header */}
        <View style={styles.teamHeader}>
          <View style={[styles.colorDot, { backgroundColor: team.primaryColor }]} />
          <View style={[styles.colorDot, { backgroundColor: team.secondaryColor }]} />
          <Text style={styles.teamName}>{team.name}</Text>
          <View style={[styles.statusBadge, team.status === 'aprovado' ? styles.badgeAprovado : styles.badgePendente]}>
            <Text style={[styles.statusText, team.status === 'aprovado' ? styles.textAprovado : styles.textPendente]}>
              {team.status === 'aprovado' ? 'Aprovado' : 'Pendente'}
            </Text>
          </View>
        </View>

        <Text style={styles.countLabel}>{roster.length} atleta{roster.length !== 1 ? 's' : ''}</Text>

        {roster.length === 0 ? (
          <EmptyState
            icon="⚽"
            title="Sem atletas ainda"
            description="Adicione os jogadores do seu time usando o botão abaixo."
          />
        ) : (
          <FlatList
            data={roster}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <PlayerRow
                player={item}
                onPress={() =>
                  navigation.navigate('PlayerCard', {
                    playerId: item.id,
                    championshipId: team.championshipId,
                  })
                }
                onDelete={() => handleDelete(item)}
              />
            )}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Fixed add button */}
        <View style={styles.addButtonContainer}>
          <AppButton title="+ Adicionar atleta" onPress={openSheet} fullWidth />
        </View>
      </SafeAreaView>

      {/* Bottom Sheet */}
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        keyboardBehavior="extend"
        android_keyboardInputMode="adjustResize"
      >
        <BottomSheetView style={sheet.container}>
          <Text style={sheet.title}>Novo atleta</Text>

          <View style={sheet.field}>
            <Text style={sheet.label}>Nome completo</Text>
            <BottomSheetTextInput
              style={[sheet.input, !!nameError && sheet.inputError]}
              placeholder="Ex: Gabriel Santos"
              placeholderTextColor="#B0B0B0"
              value={newName}
              onChangeText={(t) => { setNewName(t); setNameError(''); }}
            />
            {!!nameError && <Text style={sheet.error}>{nameError}</Text>}
          </View>

          <View style={sheet.field}>
            <Text style={sheet.label}>Posição</Text>
            <View style={sheet.chips}>
              {POSITIONS.map((pos) => {
                const selected = pos === newPosition;
                return (
                  <TouchableOpacity
                    key={pos}
                    onPress={() => setNewPosition(pos)}
                    style={[
                      sheet.chip,
                      selected ? sheet.chipSelected : sheet.chipUnselected,
                    ]}
                  >
                    <Text style={[sheet.chipText, selected && sheet.chipTextSelected]}>
                      {POSITION_LABELS[pos]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={sheet.field}>
            <Text style={sheet.label}>Número da camisa</Text>
            <BottomSheetTextInput
              style={[sheet.input, sheet.inputSmall, !!numberError && sheet.inputError]}
              placeholder="10"
              placeholderTextColor="#B0B0B0"
              value={newNumber}
              onChangeText={(t) => { setNewNumber(t); setNumberError(''); }}
              keyboardType="number-pad"
              maxLength={2}
            />
            {!!numberError && <Text style={sheet.error}>{numberError}</Text>}
          </View>

          <AppButton
            title="Adicionar"
            onPress={handleAddPlayer}
            fullWidth
            style={sheet.submitBtn}
          />
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontSize: 15,
    fontWeight: '700',
  },
  info: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  posBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  posText: {
    fontSize: 11,
    fontWeight: '600',
  },
  number: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  deleteBtn: {
    padding: 4,
  },
  deleteIcon: {
    fontSize: 18,
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  teamName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeAprovado: { backgroundColor: `${colors.success}22` },
  badgePendente: { backgroundColor: `${colors.warning}22` },
  statusText: { fontSize: 11, fontWeight: '600' },
  textAprovado: { color: colors.success },
  textPendente: { color: colors.warning },
  countLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  list: {
    paddingBottom: 100,
  },
  addButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.background,
    borderTopWidth: 0.5,
    borderTopColor: colors.borderLight,
  },
});

const sheet = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    height: 50,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputSmall: {
    width: 80,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
  },
  inputError: {
    borderColor: colors.danger,
  },
  error: {
    fontSize: 12,
    color: colors.danger,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  chipSelected: {
    backgroundColor: colors.accent,
  },
  chipUnselected: {
    backgroundColor: colors.surface,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: colors.textOnAccent,
  },
  submitBtn: {
    marginTop: 4,
  },
});
