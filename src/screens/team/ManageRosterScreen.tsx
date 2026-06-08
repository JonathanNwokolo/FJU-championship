import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import Toast from 'react-native-toast-message';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '../../components/AppButton';
import { EmptyState } from '../../components/EmptyState';
import { SearchBar } from '../../components/SearchBar';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useTeamStore } from '../../stores/teamStore';
import { addDocument } from '../../services/index';
import {
  respondToRequest,
  processWaitlistOnVacancy,
  removePlayerFromRoster,
  recomputeApprovedCount,
} from '../../services/inviteService';
import { usePendingJoinRequests } from '../../hooks/usePendingJoinRequests';
import { colors } from '../../theme/colors';
import { Player, PlayerPosition } from '../../types';
import { POSITION_LABELS } from '../../utils/constants';

type Props = NativeStackScreenProps<HomeStackParamList, 'ManageRoster'>;
type TabKey = 'roster' | 'requests';

const POSITIONS: PlayerPosition[] = ['goleiro', 'zagueiro', 'lateral', 'volante', 'meia', 'atacante'];

export function ManageRosterScreen({ route, navigation }: Props) {
  const { teamId } = route.params;
  const teams = useTeamStore((s) => s.teams);
  const players = useTeamStore((s) => s.players);
  const addPlayerLocal = useTeamStore((s) => s.addPlayer);
  const removePlayerLocal = useTeamStore((s) => s.removePlayer);
  const championships = useChampionshipStore((s) => s.championships);
  const { requests, count: pendingCount } = usePendingJoinRequests(teamId);

  const team = teams.find((item) => item.id === teamId);
  const championship = championships.find((item) => item.id === team?.championshipId);
  // Elenco ATIVO: oculta atletas removidos (status='removido' mantém o doc só para
  // preservar histórico/artilharia — AUD-04) e os que saíram do time ('sem_time').
  const roster = useMemo(
    () =>
      players.filter(
        (item) =>
          item.teamId === teamId &&
          item.status !== 'removido' &&
          item.status !== 'sem_time',
      ),
    [players, teamId],
  );

  const [activeTab, setActiveTab] = useState<TabKey>('roster');
  const [searchQuery, setSearchQuery] = useState('');
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newPosition, setNewPosition] = useState<PlayerPosition>('meia');
  const [newNumber, setNewNumber] = useState('');

  const addSheetRef = useRef<BottomSheet>(null);

  const filteredRoster = roster.filter((player) =>
    player.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (!team) {
    return (
      <SafeAreaView style={styles.container}>
        <EmptyState
          icon="⚠️"
          title="Time não encontrado"
          description="Não conseguimos abrir o elenco desse time."
        />
      </SafeAreaView>
    );
  }

  const handleAddPlayer = async () => {
    const trimmedName = newName.trim();
    const parsedNumber = Number(newNumber);
    const rosterSize = roster.length;
    const maxPlayers = team.maxPlayers ?? 15;
    if (rosterSize >= maxPlayers) {
      Alert.alert('Time lotado', `Time lotado (${rosterSize}/${maxPlayers} jogadores)`);
      return;
    }
    if (!trimmedName) {
      Toast.show({ type: 'error', text1: 'Informe o nome do atleta', visibilityTime: 2200 });
      return;
    }
    if (Number.isNaN(parsedNumber) || parsedNumber < 1 || parsedNumber > 99) {
      Toast.show({ type: 'error', text1: 'Número inválido', visibilityTime: 2200 });
      return;
    }
    if (roster.some((item) => item.number === parsedNumber)) {
      Toast.show({ type: 'error', text1: 'Número já em uso', visibilityTime: 2200 });
      return;
    }

    const playerId = `player-${Date.now()}`;
    const player: Player = {
      id: playerId,
      teamId,
      championshipId: team.championshipId,
      name: trimmedName,
      position: newPosition,
      number: parsedNumber,
      status: 'ativo',
      joinedAt: new Date().toISOString(),
      guestPlayer: true,
    };

    try {
      await addDocument('players', player);
      addPlayerLocal(player);
      // Mantém a contagem de vagas (AUD-06) consistente após adição manual.
      recomputeApprovedCount(teamId).catch(() => {});
      setNewName('');
      setNewPosition('meia');
      setNewNumber('');
      addSheetRef.current?.close();
      Toast.show({ type: 'success', text1: 'Atleta adicionado', visibilityTime: 1800 });
    } catch (error) {
      console.warn('[ManageRoster] add player failed:', error);
      Toast.show({ type: 'error', text1: 'Não foi possível adicionar', visibilityTime: 2200 });
    }
  };

  const handleRemovePlayer = (player: Player) => {
    Alert.alert('Remover atleta', `Deseja remover ${player.name} do time?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            // AUD-04: preserva o atleta (soft delete) se houver histórico; só apaga
            // de fato quando não há nenhum match_event vinculado.
            const mode = await removePlayerFromRoster(player);
            removePlayerLocal(player.id);
            processWaitlistOnVacancy(teamId).catch(() => {});
            Toast.show({
              type: 'success',
              text1: mode === 'soft' ? 'Atleta removido (histórico preservado)' : 'Atleta removido',
              visibilityTime: 1800,
            });
          } catch (error) {
            console.warn('[ManageRoster] remove player failed:', error);
            Toast.show({ type: 'error', text1: 'Não foi possível remover', visibilityTime: 2200 });
          }
        },
      },
    ]);
  };

  const handleRespond = async (requestId: string, approved: boolean, requesterId: string) => {
    setRespondingId(requestId);
    try {
      await respondToRequest(requestId, approved, teamId, requesterId);
      Toast.show({
        type: 'success',
        text1: approved ? 'Solicitação aprovada' : 'Solicitação recusada',
        visibilityTime: 1800,
      });
    } catch (error) {
      console.warn('[ManageRoster] respondToRequest failed:', error);
      Toast.show({
        type: 'error',
        text1: error instanceof Error ? error.message : 'Não foi possível responder agora',
        visibilityTime: 2200,
      });
    } finally {
      setRespondingId(null);
    }
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.teamName}>{team.name}</Text>
            <Text style={styles.headerMeta}>
              {championship?.name ?? 'Campeonato'} · {roster.length}/{team.maxPlayers ?? 15} atletas
            </Text>
          </View>
          <TouchableOpacity
            style={styles.inviteButton}
            onPress={() => navigation.navigate('InviteShare', { teamId })}
          >
            <Text style={styles.inviteButtonText}>Convidar +</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'roster' && styles.tabActive]}
            onPress={() => setActiveTab('roster')}
          >
            <Text style={[styles.tabText, activeTab === 'roster' && styles.tabTextActive]}>Elenco</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'requests' && styles.tabActive]}
            onPress={() => setActiveTab('requests')}
          >
            <View style={styles.requestsTabInner}>
              <Text style={[styles.tabText, activeTab === 'requests' && styles.tabTextActive]}>
                Solicitações
              </Text>
              {pendingCount > 0 && (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>{pendingCount}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>

        {activeTab === 'roster' ? (
          <>
            <SearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Buscar atleta..."
              onClear={() => setSearchQuery('')}
            />
            <FlatList
              data={filteredRoster}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              renderItem={({ item }) => (
                <View style={styles.rosterItem}>
                  <TouchableOpacity
                    style={styles.rosterInfo}
                    activeOpacity={0.82}
                    onPress={() => {
                      if (item.userId) {
                        navigation.navigate('AthleteProfile', {
                          userId: item.userId,
                          championshipId: team.championshipId,
                        });
                      }
                    }}
                  >
                    <View style={styles.playerAvatar}>
                      <Text style={styles.playerAvatarText}>{item.name.slice(0, 1).toUpperCase()}</Text>
                    </View>
                    <View style={styles.playerCopy}>
                      <Text style={styles.playerName}>{item.name}</Text>
                      <Text style={styles.playerMeta}>
                        {POSITION_LABELS[item.position]} · #{item.number}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleRemovePlayer(item)} style={styles.deleteButton}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={
                <EmptyState
                  icon="⚽"
                  title="Nenhum atleta encontrado"
                  description="Adicione jogadores ao elenco ou ajuste a busca."
                />
              }
            />
          </>
        ) : (
          <FlatList
            data={requests}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => (
              <View style={styles.requestItem}>
                <View style={styles.requestInfo}>
                  <View style={styles.requestAvatar}>
                    <Text style={styles.requestAvatarText}>
                      {item.requesterName.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.requestCopy}>
                    <Text style={styles.requestName}>{item.requesterName}</Text>
                    <Text style={styles.requestMeta}>quer entrar no time</Text>
                    <Text style={styles.requestDate}>
                      {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                    </Text>
                  </View>
                </View>

                <View style={styles.requestActions}>
                  <TouchableOpacity
                    onPress={() => handleRespond(item.id, true, item.requesterId)}
                    style={[styles.actionChip, styles.approveChip]}
                    disabled={respondingId === item.id}
                  >
                    <Text style={styles.actionChipText}>✓ Aprovar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleRespond(item.id, false, item.requesterId)}
                    style={[styles.actionChip, styles.rejectChip]}
                    disabled={respondingId === item.id}
                  >
                    <Text style={styles.actionChipText}>✗ Recusar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <EmptyState
                icon="📨"
                title="Nenhuma solicitação pendente"
                description="Quando atletas pedirem entrada, elas aparecerão aqui."
              />
            }
          />
        )}

        {activeTab === 'roster' && (
          <View style={styles.footer}>
            <AppButton
              title="+ Adicionar atleta"
              onPress={() => addSheetRef.current?.expand()}
              fullWidth
            />
          </View>
        )}
      </SafeAreaView>

      <BottomSheet
        ref={addSheetRef}
        index={-1}
        snapPoints={['60%']}
        enablePanDownToClose
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />
        )}
      >
        <BottomSheetView style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Novo atleta</Text>
          <BottomSheetTextInput
            style={styles.sheetInput}
            value={newName}
            onChangeText={setNewName}
            placeholder="Nome completo"
            placeholderTextColor={colors.textMuted}
          />
          <View style={styles.positionWrap}>
            {POSITIONS.map((position) => {
              const selected = newPosition === position;
              return (
                <TouchableOpacity
                  key={position}
                  onPress={() => setNewPosition(position)}
                  style={[styles.positionChip, selected && styles.positionChipActive]}
                >
                  <Text style={[styles.positionChipText, selected && styles.positionChipTextActive]}>
                    {POSITION_LABELS[position]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <BottomSheetTextInput
            style={styles.sheetInput}
            value={newNumber}
            onChangeText={setNewNumber}
            placeholder="Número da camisa"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
          />
          <AppButton title="Adicionar" onPress={handleAddPlayer} fullWidth />
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerCopy: {
    flex: 1,
  },
  teamName: {
    fontFamily: 'Barlow-Bold',
    fontSize: 20,
    color: colors.textPrimary,
  },
  headerMeta: {
    marginTop: 4,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  inviteButton: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentGlow,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  inviteButtonText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    color: colors.accent,
  },
  tabs: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  tab: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg200,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.accentGlow,
    borderColor: colors.accent,
  },
  tabText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 13,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.accent,
    fontFamily: 'Barlow-SemiBold',
  },
  requestsTabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pendingBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  pendingBadgeText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 10,
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    paddingBottom: 110,
    flexGrow: 1,
  },
  rosterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.bg200,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rosterInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.bg300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerAvatarText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.accent,
  },
  playerCopy: {
    flex: 1,
  },
  playerName: {
    fontFamily: 'Barlow-Bold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  playerMeta: {
    marginTop: 3,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  deleteButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestItem: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.bg200,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  requestInfo: {
    flexDirection: 'row',
    gap: 12,
  },
  requestAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.bg300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestAvatarText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.accent,
  },
  requestCopy: {
    flex: 1,
  },
  requestName: {
    fontFamily: 'Barlow-Bold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  requestMeta: {
    marginTop: 2,
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textSecondary,
  },
  requestDate: {
    marginTop: 4,
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    color: colors.textMuted,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionChip: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveChip: {
    backgroundColor: 'rgba(0,200,83,0.18)',
  },
  rejectChip: {
    backgroundColor: 'rgba(255,59,71,0.18)',
  },
  actionChipText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    color: colors.textPrimary,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg100,
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 14,
  },
  sheetTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 18,
    color: colors.textPrimary,
  },
  sheetInput: {
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.bg300,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: 'Barlow-Medium',
    fontSize: 15,
    color: colors.textPrimary,
  },
  positionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  positionChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.bg300,
    borderWidth: 1,
    borderColor: colors.border,
  },
  positionChipActive: {
    backgroundColor: colors.accentGlow,
    borderColor: colors.accent,
  },
  positionChipText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 12,
    color: colors.textPrimary,
  },
  positionChipTextActive: {
    fontFamily: 'Barlow-SemiBold',
    color: colors.accent,
  },
});
