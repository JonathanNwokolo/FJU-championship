import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Badge } from '../../components/Badge';
import { useAuthStore } from '../../stores/authStore';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useTeamStore } from '../../stores/teamStore';
import { useMatchStore } from '../../stores/matchStore';
import { getCollection } from '../../services/index';
import { Championship, ChampionshipFormat, ChampionshipStatus, Team, MatchModel, Player } from '../../types';
import { OrganizerStackParamList } from '../../navigation/OrganizerStackNavigator';
import { TAB_NAMES } from '../../navigation/constants';
import { colors } from '../../theme/colors';

type NavProp = NativeStackNavigationProp<OrganizerStackParamList, 'OrganizerHome'>;

const HEADER_DARK = '#0D1B2A';

const FORMAT_LABELS: Record<ChampionshipFormat, string> = {
  pontos_corridos: 'Pontos corridos',
  mata_mata: 'Mata-mata',
  grupos_e_mata_mata: 'Grupos + mata-mata',
};

const STATUS_LABELS: Record<ChampionshipStatus, string> = {
  inscricoes_abertas: 'Inscrições abertas',
  em_andamento: 'Em andamento',
  finalizado: 'Finalizado',
};

const STATUS_VARIANT: Record<ChampionshipStatus, 'pending' | 'approved' | 'round'> = {
  inscricoes_abertas: 'pending',
  em_andamento: 'approved',
  finalizado: 'round',
};

export function OrganizerHomeScreen() {
  const navigation = useNavigation<NavProp>();
  const user = useAuthStore((s) => s.user);
  const championships = useChampionshipStore((s) => s.championships);
  const teams = useTeamStore((s) => s.teams);
  const [refreshing, setRefreshing] = useState(false);

  const myChamps = useMemo(
    () => championships.filter((c) => c.organizerId === user?.id),
    [championships, user?.id],
  );

  // Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Busca todos os campeonatos do organizador e dados relacionados
      const freshChampionships = await getCollection<Championship>('championships', [
        { field: 'organizerId', operator: '==', value: user?.id },
      ]);
      
      // Busca times e partidas de todos os campeonatos do organizador
      const champIds = freshChampionships.map((c) => c.id);
      const allTeams: Team[] = [];
      const allMatches: MatchModel[] = [];
      const allPlayers: Player[] = [];

      for (const champId of champIds) {
        const [freshTeams, freshMatches, freshPlayers] = await Promise.all([
          getCollection<Team>('teams', [{ field: 'championshipId', operator: '==', value: champId }]),
          getCollection<MatchModel>('matches', [{ field: 'championshipId', operator: '==', value: champId }]),
          getCollection<Player>('players', [{ field: 'championshipId', operator: '==', value: champId }]),
        ]);
        allTeams.push(...freshTeams);
        allMatches.push(...freshMatches);
        allPlayers.push(...freshPlayers);
      }

      // Atualiza stores
      useChampionshipStore.getState().setChampionships(freshChampionships);
      
      // Merge data para não perder dados de outros campeonatos
      const existingTeamIds = new Set(allTeams.map((t) => t.id));
      const existingMatchIds = new Set(allMatches.map((m) => m.id));
      const existingPlayerIds = new Set(allPlayers.map((p) => p.id));
      
      const prevTeams = useTeamStore.getState().teams.filter((t) => !existingTeamIds.has(t.id) && !champIds.includes(t.championshipId));
      const prevMatches = useMatchStore.getState().matches.filter((m) => !existingMatchIds.has(m.id) && !champIds.includes(m.championshipId));
      const prevPlayers = useTeamStore.getState().players.filter((p) => !existingPlayerIds.has(p.id) && (!p.championshipId || !champIds.includes(p.championshipId)));
      
      useTeamStore.getState().setTeams([...prevTeams, ...allTeams]);
      useMatchStore.getState().setMatches([...prevMatches, ...allMatches]);
      useTeamStore.setState({ players: [...prevPlayers, ...allPlayers] });
    } catch (e) {
      console.warn('[OrganizerHome] onRefresh error:', e);
    } finally {
      setRefreshing(false);
    }
  }, [user?.id]);

  // A criação de campeonato vive na stack da aba Início — navegamos via o pai.
  const goToCreate = () => {
    navigation.getParent()?.navigate({
      name: TAB_NAMES.INICIO,
      params: { screen: 'CreateChampionship' },
    } as never);
  };

  const goToManage = (championshipId: string) => {
    navigation.navigate('ChampionshipManage', { championshipId });
  };

  const renderCard = ({ item }: { item: Championship }) => {
    const teamsCount = teams.filter((t) => t.championshipId === item.id).length;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => goToManage(item.id)}
        activeOpacity={0.85}
      >
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <Badge label={STATUS_LABELS[item.status]} variant={STATUS_VARIANT[item.status]} />
        </View>
        <Text style={styles.cardFormat}>{FORMAT_LABELS[item.format]}</Text>
        <View style={styles.cardMetaRow}>
          <View style={styles.cardMetaItem}>
            <Ionicons name="shield-outline" size={15} color={colors.accent} />
            <Text style={styles.cardMetaText}>
              {teamsCount} {teamsCount === 1 ? 'time' : 'times'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <Text style={styles.headerTitle}>Meus Campeonatos</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={goToCreate}
          activeOpacity={0.85}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Criar campeonato"
        >
          <Ionicons name="add" size={26} color={colors.textOnAccent} />
        </TouchableOpacity>
      </SafeAreaView>

      <FlatList
        data={myChamps}
        keyExtractor={(item) => item.id}
        renderItem={renderCard}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.bg200}
            title="Atualizando..."
            titleColor={colors.textSecondary}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          myChamps.length === 0 && styles.listEmpty,
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="trophy-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyText}>Nenhum campeonato criado. Crie o primeiro!</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={goToCreate} activeOpacity={0.85}>
              <Ionicons name="add" size={18} color={colors.textOnAccent} />
              <Text style={styles.emptyBtnText}>Criar campeonato</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  header: {
    backgroundColor: HEADER_DARK,
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 24,
    color: colors.textOnDark,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 20,
    gap: 12,
  },
  listEmpty: {
    flexGrow: 1,
  },
  card: {
    backgroundColor: colors.bg200,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontFamily: 'Barlow-SemiBold',
    fontSize: 18,
    color: colors.textPrimary,
  },
  cardFormat: {
    marginTop: 8,
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textSecondary,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  cardMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardMetaText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 13,
    color: colors.textPrimary,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  emptyText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  emptyBtnText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.textOnAccent,
  },
});
