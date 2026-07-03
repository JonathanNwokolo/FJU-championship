import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/authStore';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useTeamStore } from '../../stores/teamStore';
import { useMatchStore } from '../../stores/matchStore';
import { EmptyState } from '../../components/EmptyState';
import { TeamColorDot } from '../../components/TeamColorDot';
import { colors } from '../../theme/colors';
import { MatchModel, Team } from '../../types';
import { FixturesStackParamList } from '../../navigation/FixturesStackNavigator';
import { normalizeGroupId } from '../../utils/groupStageStructure';
import {
  filterGroupFixtures,
  summarizeGroupStageDashboard,
  SupportedGroupId,
  type GroupFixtureFilter,
} from '../../utils/groupStagePresentation';

type NavT = NavigationProp<FixturesStackParamList>;
type RouteT = RouteProp<FixturesStackParamList, 'GroupFixtures'>;

type FilterKey = GroupFixtureFilter;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'A', label: 'Grupo A' },
  { key: 'B', label: 'Grupo B' },
  { key: 'proximas', label: 'Próximas' },
  { key: 'finalizadas', label: 'Finalizadas' },
];

const STATUS_META: Record<
  MatchModel['status'],
  { label: string; color: string }
> = {
  agendado: { label: 'Agendado', color: colors.textMuted },
  ao_vivo: { label: 'Ao vivo', color: colors.neon },
  finalizado: { label: 'Finalizado', color: colors.success },
  wo: { label: 'W.O.', color: colors.warning },
  adiado: { label: 'Adiado', color: colors.warning },
  cancelado: { label: 'Cancelado', color: colors.danger },
};

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function GroupFixturesScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { championshipId, groupId: initialGroup } = route.params;

  const championships = useChampionshipStore((s) => s.championships);
  const championship = championships.find((c) => c.id === championshipId);
  const user = useAuthStore((s) => s.user);
  const allTeams = useTeamStore((s) => s.teams);
  const allMatches = useMatchStore((s) => s.matches);

  const isOrganizer =
    user?.role === 'organizador' && championship?.organizerId === user?.id;

  const [filter, setFilter] = useState<FilterKey>(
    initialGroup === 'A' || initialGroup === 'B' ? initialGroup : 'todas',
  );

  const teams = useMemo(
    () => allTeams.filter((t) => t.championshipId === championshipId),
    [allTeams, championshipId],
  );
  const teamById = useMemo(() => {
    const map = new Map<string, Team>();
    teams.forEach((t) => map.set(t.id, t));
    return map;
  }, [teams]);

  const matches = useMemo(
    () => allMatches.filter((m) => m.championshipId === championshipId),
    [allMatches, championshipId],
  );

  const summary = useMemo(
    () => (championship ? summarizeGroupStageDashboard(championship, teams, matches) : null),
    [championship, teams, matches],
  );

  const filtered = useMemo(
    () => (championship ? filterGroupFixtures(matches, championship, filter) : []),
    [matches, championship, filter],
  );

  const handlePress = (match: MatchModel) => {
    if (match.status === 'finalizado' || match.status === 'wo') {
      navigation.navigate('MatchSummary', { matchId: match.id });
      return;
    }
    if (match.status === 'ao_vivo') {
      navigation.navigate('LiveMatch', { matchId: match.id });
      return;
    }
    if (match.status === 'agendado' && isOrganizer) {
      navigation.navigate('MatchRegistration', { matchId: match.id });
      return;
    }
    navigation.navigate('PreMatch', { matchId: match.id });
  };

  const header = (
    <SafeAreaView style={styles.header} edges={['top']}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={26} color={colors.accent} />
        </TouchableOpacity>
        <Text style={styles.title}>Partidas dos grupos</Text>
        <View style={styles.backBtn} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersRow}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
              accessibilityRole="button"
              accessibilityLabel={`Filtrar: ${f.label}`}
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );

  if (!championship || summary?.isGroupsFormat !== true) {
    return (
      <View style={styles.root}>
        {header}
        <EmptyState
          icon="📋"
          title="Sem fase de grupos"
          description="Este campeonato não usa o formato de grupos + mata-mata."
        />
      </View>
    );
  }

  if (!summary.hasGeneratedFixtures) {
    return (
      <View style={styles.root}>
        {header}
        <EmptyState
          icon="📅"
          title="Partidas não geradas"
          description="As partidas dos grupos ainda não foram geradas pelo organizador."
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {header}
      {filtered.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="Nada por aqui"
          description="Nenhuma partida corresponde a este filtro."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {filtered.map((match) => {
            const group = normalizeGroupId(match.groupId, championshipId) as SupportedGroupId | null;
            const home = teamById.get(match.homeTeamId);
            const away = teamById.get(match.awayTeamId);
            const meta = STATUS_META[match.status];
            const date = formatDate(match.scheduledAt);
            const showScore = match.status === 'finalizado' || match.status === 'wo';
            const round = match.groupRound ?? match.round;
            return (
              <Pressable
                key={match.id}
                onPress={() => handlePress(match)}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                accessibilityRole="button"
                accessibilityLabel={
                  `Grupo ${group ?? '?'}, rodada ${round}. ` +
                  `${home?.name ?? 'Time'} contra ${away?.name ?? 'Time'}. ${meta.label}.`
                }
              >
                <View style={styles.cardTop}>
                  <View style={styles.groupBadge}>
                    <Text style={styles.groupBadgeText}>Grupo {group ?? '?'}</Text>
                  </View>
                  <Text style={styles.roundText}>Rodada {round}</Text>
                  <View style={styles.statusWrap}>
                    <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
                    <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                </View>
                <View style={styles.teamsRow}>
                  <View style={styles.teamSide}>
                    <TeamColorDot color={home?.primaryColor ?? colors.textMuted} size={10} />
                    <Text style={styles.teamName} numberOfLines={1}>
                      {home?.name ?? 'Time'}
                    </Text>
                  </View>
                  <Text style={styles.score}>
                    {showScore ? `${match.homeScore ?? 0} - ${match.awayScore ?? 0}` : 'vs'}
                  </Text>
                  <View style={[styles.teamSide, styles.teamSideRight]}>
                    <Text style={styles.teamName} numberOfLines={1}>
                      {away?.name ?? 'Time'}
                    </Text>
                    <TeamColorDot color={away?.primaryColor ?? colors.textMuted} size={10} />
                  </View>
                </View>
                {date ? <Text style={styles.dateText}>{date}</Text> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg100 },
  header: {
    backgroundColor: colors.bg200,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Barlow-Bold', fontSize: 18, color: colors.textPrimary },
  filtersRow: { gap: 8, paddingHorizontal: 16, paddingTop: 4 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: colors.bg300,
  },
  filterChipActive: { backgroundColor: colors.accent },
  filterText: { fontFamily: 'Barlow-Medium', fontSize: 13, color: colors.textSecondary },
  filterTextActive: { color: colors.bg100 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: colors.bg200,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
  },
  cardPressed: { opacity: 0.85 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupBadge: {
    backgroundColor: colors.bg300,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  groupBadgeText: { fontFamily: 'Barlow-Bold', fontSize: 11, color: colors.accent },
  roundText: { flex: 1, fontFamily: 'Barlow-Medium', fontSize: 12, color: colors.textMuted },
  statusWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: 'Barlow-SemiBold', fontSize: 11, textTransform: 'uppercase' },
  teamsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  teamSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamSideRight: { justifyContent: 'flex-end' },
  teamName: { fontFamily: 'Barlow-SemiBold', fontSize: 14, color: colors.textPrimary, flexShrink: 1 },
  score: { fontFamily: 'Barlow-Black', fontSize: 16, color: colors.textPrimary, minWidth: 44, textAlign: 'center' },
  dateText: { fontFamily: 'Barlow-Regular', fontSize: 12, color: colors.textMuted },
});
