import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AppCard } from '../../components/AppCard';
import { Badge } from '../../components/Badge';
import { TeamColorDot } from '../../components/TeamColorDot';
import { EmptyState } from '../../components/EmptyState';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { colors } from '../../theme/colors';
import { useChampionshipHistory } from '../../hooks/useChampionshipHistory';
import { useMatchStore } from '../../stores/matchStore';
import { useTeamStore } from '../../stores/teamStore';
import { Championship } from '../../types';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'ChampionshipHistory'>;

function formatChampionshipFormat(format: Championship['format']) {
  const labels: Record<Championship['format'], string> = {
    pontos_corridos: 'Pontos corridos',
    mata_mata: 'Mata-mata',
    grupos_e_mata_mata: 'Grupos + mata-mata',
  };
  return labels[format];
}

function getSeasonYear(createdAt?: string): string {
  if (!createdAt) return new Date().getFullYear().toString();
  try {
    return new Date(createdAt).getFullYear().toString();
  } catch {
    return new Date().getFullYear().toString();
  }
}

export function ChampionshipHistoryScreen() {
  const navigation = useNavigation<NavProp>();
  const { championships, results, loading } = useChampionshipHistory();
  const teams = useTeamStore((s) => s.teams);
  const matches = useMatchStore((s) => s.matches);

  // Sort by finishedAt desc
  const sortedChampionships = [...championships].sort((a, b) => {
    const aResult = results[a.id];
    const bResult = results[b.id];
    const aDate = aResult?.finishedAt ?? a.createdAt ?? '';
    const bDate = bResult?.finishedAt ?? b.createdAt ?? '';
    return bDate.localeCompare(aDate);
  });

  const handlePress = (championship: Championship) => {
    navigation.navigate('ChampionshipResult', { championshipId: championship.id });
  };

  const renderItem = ({ item }: { item: Championship }) => {
    const result = results[item.id];
    const champTeams = teams.filter((t) => t.championshipId === item.id);
    const champMatches = matches.filter((m) => m.championshipId === item.id);
    const season = getSeasonYear(item.createdAt);

    return (
      <TouchableOpacity onPress={() => handlePress(item)} activeOpacity={0.7}>
        <AppCard style={styles.card}>
          <View style={styles.mainRow}>
            <Ionicons name="trophy" size={24} color={colors.accent} />
            <View style={styles.titleBlock}>
              <Text style={styles.champName} numberOfLines={1}>
                {item.name}
              </Text>
            </View>
            <Badge label={season} variant="round" />
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoText}>{formatChampionshipFormat(item.format)}</Text>
            <Text style={styles.infoDivider}>|</Text>
            <Text style={styles.infoText}>{champTeams.length} times</Text>
            <Text style={styles.infoDivider}>|</Text>
            <Text style={styles.infoText}>{champMatches.length} partidas</Text>
          </View>

          {result && (
            <View style={styles.championRow}>
              <Text style={styles.championLabel}>🏆 Campeão:</Text>
              <TeamColorDot color={result.championTeamColor} size={8} />
              <Text style={styles.championName} numberOfLines={1}>
                {result.championTeamName}
              </Text>
            </View>
          )}
        </AppCard>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={26} color={colors.accent} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Histórico</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.skeletonWrap}>
          {[1, 2, 3].map((i) => (
            <SkeletonLoader key={i} width="100%" height={120} borderRadius={16} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color={colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Histórico</Text>
        <View style={{ width: 26 }} />
      </View>

      <FlatList
        data={sortedChampionships}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="🏆"
            title="Nenhum campeonato finalizado"
            description="Os campeonatos encerrados aparecerão aqui."
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg200,
  },
  headerTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 20,
    color: colors.textPrimary,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  skeletonWrap: {
    padding: 16,
    gap: 12,
  },
  card: {
    padding: 16,
    gap: 10,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleBlock: {
    flex: 1,
  },
  champName: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 17,
    color: colors.textPrimary,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textSecondary,
  },
  infoDivider: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textMuted,
  },
  championRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  championLabel: {
    fontFamily: 'Barlow-Medium',
    fontSize: 13,
    color: colors.textSecondary,
  },
  championName: {
    flex: 1,
    fontFamily: 'Barlow-SemiBold',
    fontSize: 14,
    color: colors.success,
  },
});
