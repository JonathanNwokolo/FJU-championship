import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PendingItemCard } from '../../components/PendingItemCard';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { usePendingItems } from '../../hooks/usePendingItems';
import {
  PendingGroup,
  PendingItem,
  PendingItemCategory,
  PENDING_CATEGORY_LABELS,
} from '../../types/pending';
import { resolvePendingDestination } from '../../utils/pendingRules';
import { useAuthStore } from '../../stores/authStore';
import { colors } from '../../theme/colors';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';

type HomeNavProp = NativeStackNavigationProp<HomeStackParamList>;

// ── Filtros disponíveis ───────────────────────────────────────────────────────

type FilterKey = 'all' | 'critical' | PendingItemCategory;

interface FilterOption {
  key: FilterKey;
  label: string;
}

const FILTER_OPTIONS_BASE: FilterOption[] = [
  { key: 'all', label: 'Todas' },
  { key: 'critical', label: 'Críticas' },
  { key: 'matches', label: 'Partidas' },
  { key: 'teams', label: 'Times' },
  { key: 'convocations', label: 'Convocações' },
  { key: 'attendance', label: 'Presença' },
  { key: 'championship', label: 'Campeonato' },
  { key: 'roster', label: 'Elenco' },
];

// ── Empty state ───────────────────────────────────────────────────────────────

function PendingEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <View
      style={styles.emptyWrap}
      accessible
      accessibilityRole="text"
      accessibilityLabel={filtered ? 'Nenhuma pendência neste filtro.' : 'Você está em dia! Nenhuma pendência no momento.'}
    >
      <MaterialCommunityIcons
        name={filtered ? 'filter-outline' : 'check-circle-outline'}
        size={56}
        color={colors.textMuted}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text style={styles.emptyTitle}>
        {filtered ? 'Nenhuma pendência neste filtro' : 'Você está em dia!'}
      </Text>
      <Text style={styles.emptyDesc}>
        {filtered
          ? 'Tente outro filtro para ver mais itens.'
          : 'Nenhuma ação necessária no momento.'}
      </Text>
    </View>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function PendingSkeleton() {
  return (
    <View style={styles.skeletonWrap} accessibilityLiveRegion="polite" accessibilityLabel="Carregando pendências">
      {[1, 2, 3].map((i) => (
        <SkeletonLoader key={i} width="100%" height={82} borderRadius={14} />
      ))}
    </View>
  );
}

// ── Cabeçalho de grupo ────────────────────────────────────────────────────────

function GroupHeader({ label }: { label: string }) {
  return (
    <View style={styles.groupHeader} accessible accessibilityRole="header">
      <Text style={styles.groupLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

// ── Tela principal ─────────────────────────────────────────────────────────────

export function PendingCenterScreen() {
  const navigation = useNavigation<HomeNavProp>();
  const user = useAuthStore((s) => s.user);
  const { items, groups, total, criticalCount, loading, error, refresh } = usePendingItems();

  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  // Filtra itens e reconstrói grupos para o filtro ativo
  const displayedGroups = useMemo((): PendingGroup[] => {
    if (activeFilter === 'all') return groups;

    let filtered: PendingItem[];
    if (activeFilter === 'critical') {
      filtered = items.filter((i) => i.severity === 'critical');
    } else {
      filtered = items.filter((i) => i.category === activeFilter);
    }

    if (filtered.length === 0) return [];

    // Reagrupa mantendo a ordem de categoria
    const map = new Map<PendingItemCategory, PendingItem[]>();
    for (const item of filtered) {
      const existing = map.get(item.category) ?? [];
      existing.push(item);
      map.set(item.category, existing);
    }

    const categories = activeFilter === 'critical'
      ? Array.from(map.keys())
      : [activeFilter as PendingItemCategory];

    return categories
      .filter((cat) => map.has(cat))
      .map((cat) => ({
        category: cat,
        label: PENDING_CATEGORY_LABELS[cat],
        items: map.get(cat)!,
      }));
  }, [items, groups, activeFilter]);

  // Filtros disponíveis com contagem
  const filterOptions = useMemo((): (FilterOption & { count: number })[] => {
    return FILTER_OPTIONS_BASE.map((opt) => {
      let count = 0;
      if (opt.key === 'all') count = total;
      else if (opt.key === 'critical') count = criticalCount;
      else count = items.filter((i) => i.category === opt.key).length;
      return { ...opt, count };
    }).filter((opt) => opt.key === 'all' || opt.count > 0);
  }, [items, total, criticalCount]);

  useEffect(() => {
    if (!filterOptions.some((option) => option.key === activeFilter)) {
      setActiveFilter('all');
    }
  }, [activeFilter, filterOptions]);

  const navigateToItem = useCallback(
    (item: PendingItem) => {
      if (!item.destination) return;
      const resolved = resolvePendingDestination(item.destination, user?.role);
      if (!resolved) return;

      if (resolved.stack === 'home') {
        (navigation as HomeNavProp).navigate(
          resolved.screen as keyof HomeStackParamList,
          resolved.params as any,
        );
      } else if (resolved.stack === 'fixtures') {
        navigation.getParent()?.navigate('Confrontos', {
          screen: resolved.screen,
          params: resolved.params,
        });
      } else if (resolved.stack === 'captain') {
        navigation.getParent()?.navigate('Time', {
          screen: resolved.screen,
          params: resolved.params,
        });
      }
    },
    [navigation],
  );

  const sectionData = displayedGroups.map((g) => ({
    title: g.label,
    data: g.items,
  }));

  const isFiltered = activeFilter !== 'all';
  const isEmpty = displayedGroups.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.accent} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Pendências</Text>
          {total > 0 && (
            <Text style={styles.headerSub}>
              {total} item{total !== 1 ? 'ns' : ''}{criticalCount > 0 ? ` · ${criticalCount} crítico${criticalCount !== 1 ? 's' : ''}` : ''}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={refresh}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.refreshBtn}
          accessibilityRole="button"
          accessibilityLabel="Atualizar pendências"
        >
          <MaterialCommunityIcons name="refresh" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Filtros */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        keyboardShouldPersistTaps="handled"
        accessibilityRole="tablist"
      >
        {filterOptions.map((opt) => {
          const isActive = activeFilter === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setActiveFilter(opt.key)}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${opt.label}, ${opt.count} item${opt.count !== 1 ? 'ns' : ''}`}
            >
              <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                {opt.label}
              </Text>
              {opt.count > 0 && (
                <View style={[styles.filterBadge, isActive && styles.filterBadgeActive]}>
                  <Text style={[styles.filterBadgeText, isActive && styles.filterBadgeTextActive]}>
                    {opt.count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Erro */}
      {error && (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <MaterialCommunityIcons name="wifi-alert" size={16} color={colors.warning} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={refresh} accessibilityRole="button" accessibilityLabel="Tentar novamente">
            <Text style={styles.errorRetry}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Conteúdo */}
      {loading ? (
        <PendingSkeleton />
      ) : isEmpty ? (
        <PendingEmptyState filtered={isFiltered} />
      ) : (
        <SectionList
          sections={sectionData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <GroupHeader label={section.title} />
          )}
          renderItem={({ item }) => (
            <PendingItemCard
              item={item}
              onPress={item.destination ? () => navigateToItem(item) : undefined}
              testID={`pending-item-${item.id}`}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
              progressBackgroundColor={colors.bg200}
            />
          }
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.bg200,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    marginRight: 8,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 20,
    color: colors.textPrimary,
  },
  headerSub: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  refreshBtn: {
    marginLeft: 8,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.bg200,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.bg300,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.accentGlow,
    borderColor: colors.accent,
  },
  filterText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 13,
    color: colors.textSecondary,
  },
  filterTextActive: {
    color: colors.accent,
    fontFamily: 'Barlow-SemiBold',
  },
  filterBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg100,
    paddingHorizontal: 4,
  },
  filterBadgeActive: {
    backgroundColor: colors.accent,
  },
  filterBadgeText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 10,
    color: colors.textSecondary,
  },
  filterBadgeTextActive: {
    color: colors.bg100,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(245,166,35,0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245,166,35,0.20)',
  },
  errorText: {
    flex: 1,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.warning,
  },
  errorRetry: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    color: colors.accent,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
    paddingTop: 8,
  },
  groupHeader: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  groupLabel: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  separator: {
    height: 8,
  },
  sectionSeparator: {
    height: 0,
  },
  skeletonWrap: {
    padding: 16,
    gap: 10,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 18,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyDesc: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
});
