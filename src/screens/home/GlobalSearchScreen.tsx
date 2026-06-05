import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useTeamStore } from '../../stores/teamStore';
import { colors } from '../../theme/colors';
import { Championship, Team, Player } from '../../types';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';

type NavProp = NativeStackNavigationProp<HomeStackParamList>;

type SearchResult =
  | { kind: 'championship'; data: Championship }
  | { kind: 'team'; data: Team; championshipName: string }
  | { kind: 'player'; data: Player; teamName: string; championshipName: string };

const POSITION_LABELS: Record<string, string> = {
  goleiro: 'Goleiro',
  zagueiro: 'Zagueiro',
  lateral: 'Lateral',
  volante: 'Volante',
  meia: 'Meia',
  atacante: 'Atacante',
};

const FORMAT_LABELS: Record<string, string> = {
  pontos_corridos: 'Pontos corridos',
  mata_mata: 'Mata-mata',
  grupos_e_mata_mata: 'Grupos + Mata-mata',
};

const STATUS_LABELS: Record<string, string> = {
  inscricoes_abertas: 'Inscrições abertas',
  em_andamento: 'Em andamento',
  finalizado: 'Finalizado',
};

function ChampionshipRow({ championship, onPress }: { championship: Championship; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={[styles.resultIcon, { backgroundColor: `${colors.accent}20` }]}>
        <Text style={styles.resultIconText}>🏆</Text>
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle} numberOfLines={1}>{championship.name}</Text>
        <Text style={styles.rowMeta}>
          {FORMAT_LABELS[championship.format]} · {STATUS_LABELS[championship.status]}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function TeamRow({ team, championshipName, onPress }: { team: Team; championshipName: string; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={[styles.resultIcon, { backgroundColor: `${team.primaryColor}30` }]}>
        <View style={[styles.teamColorDot, { backgroundColor: team.primaryColor }]} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle} numberOfLines={1}>{team.name}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>{championshipName}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function PlayerRow({
  player,
  teamName,
  championshipName,
  onPress,
}: {
  player: Player;
  teamName: string;
  championshipName: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={[styles.resultIcon, { backgroundColor: `${colors.neon}20` }]}>
        <Text style={styles.resultIconText}>👤</Text>
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {player.name}{player.number ? ` · #${player.number}` : ''}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {POSITION_LABELS[player.position] ?? player.position} · {teamName}
        </Text>
        <Text style={styles.rowSubMeta} numberOfLines={1}>{championshipName}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

export function GlobalSearchScreen() {
  const navigation = useNavigation<NavProp>();
  const championships = useChampionshipStore((s) => s.championships);
  const { teams, players } = useTeamStore();

  const [query, setQuery] = useState('');

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    const out: SearchResult[] = [];

    championships.forEach((c) => {
      if (c.name.toLowerCase().includes(q)) {
        out.push({ kind: 'championship', data: c });
      }
    });

    teams.forEach((t) => {
      if (t.name.toLowerCase().includes(q)) {
        const champ = championships.find((c) => c.id === t.championshipId);
        out.push({ kind: 'team', data: t, championshipName: champ?.name ?? '' });
      }
    });

    players.forEach((p) => {
      const nameMatch = p.name.toLowerCase().includes(q);
      const posMatch = (POSITION_LABELS[p.position] ?? '').toLowerCase().includes(q);
      if (nameMatch || posMatch) {
        const team = teams.find((t) => t.id === p.teamId);
        const champ = team ? championships.find((c) => c.id === team.championshipId) : undefined;
        out.push({
          kind: 'player',
          data: p,
          teamName: team?.name ?? '',
          championshipName: champ?.name ?? '',
        });
      }
    });

    return out.slice(0, 50);
  }, [query, championships, teams, players]);

  const handleResultPress = useCallback((result: SearchResult) => {
    if (result.kind === 'championship') {
      navigation.navigate('ChampionshipDashboard', { championshipId: result.data.id });
    } else if (result.kind === 'team') {
      navigation.navigate('ManageRoster', { teamId: result.data.id });
    } else {
      const team = teams.find((t) => t.id === result.data.teamId);
      if (team) {
        navigation.navigate('PlayerCard', {
          playerId: result.data.id,
          championshipId: team.championshipId,
        });
      }
    }
  }, [navigation, teams]);

  const renderItem = useCallback(({ item }: { item: SearchResult }) => {
    if (item.kind === 'championship') {
      return (
        <ChampionshipRow
          championship={item.data}
          onPress={() => handleResultPress(item)}
        />
      );
    }
    if (item.kind === 'team') {
      return (
        <TeamRow
          team={item.data}
          championshipName={item.championshipName}
          onPress={() => handleResultPress(item)}
        />
      );
    }
    return (
      <PlayerRow
        player={item.data}
        teamName={item.teamName}
        championshipName={item.championshipName}
        onPress={() => handleResultPress(item)}
      />
    );
  }, [handleResultPress]);

  const sectionLabel = useMemo(() => {
    if (query.trim().length < 2) return null;
    if (results.length === 0) return `Sem resultados para "${query}"`;
    return `${results.length} resultado${results.length !== 1 ? 's' : ''}`;
  }, [query, results]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.accent} />
        </TouchableOpacity>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar campeonatos, times, jogadores..."
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {sectionLabel && (
        <Text style={styles.sectionLabel}>{sectionLabel}</Text>
      )}

      {query.trim().length < 2 ? (
        <View style={styles.hintWrap}>
          <Text style={styles.hintIcon}>🔍</Text>
          <Text style={styles.hintTitle}>Pesquise no campeonato</Text>
          <Text style={styles.hintDesc}>
            Digite pelo menos 2 caracteres para buscar campeonatos, times ou jogadores.
          </Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.hintWrap}>
          <Text style={styles.hintIcon}>😕</Text>
          <Text style={styles.hintTitle}>Nada encontrado</Text>
          <Text style={styles.hintDesc}>Tente outro termo de busca.</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) =>
            `${item.kind}-${item.data.id}`
          }
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg200,
    gap: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg300,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
  },
  searchIcon: {
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Barlow-Regular',
    fontSize: 15,
    color: colors.textPrimary,
  },
  sectionLabel: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  list: {
    paddingBottom: 32,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  resultIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  resultIconText: {
    fontSize: 20,
  },
  teamColorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  rowMeta: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  rowSubMeta: {
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    color: colors.textMuted,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 72,
  },
  hintWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  hintIcon: {
    fontSize: 48,
  },
  hintTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 18,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  hintDesc: {
    fontFamily: 'Barlow-Regular',
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
