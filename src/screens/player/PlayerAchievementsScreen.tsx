import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';

import { HomeStackParamList } from '../../navigation/HomeStackNavigator';
import { useTeamStore } from '../../stores/teamStore';
import { usePlayerAchievements } from '../../hooks/usePlayerAchievements';
import { ACHIEVEMENTS, RARITY_ORDER } from '../../utils/achievementDefinitions';
import { AchievementDefinition, AchievementRarity } from '../../types';
import { colors } from '../../theme/colors';

type Props = NativeStackScreenProps<HomeStackParamList, 'PlayerAchievements'>;

const RARITY_LABELS: Record<AchievementRarity, string> = {
  lendario: 'Lendárias',
  epico: 'Épicas',
  raro: 'Raras',
  comum: 'Comuns',
};

const FILTERS = ['Todas', 'Lendárias', 'Épicas', 'Raras', 'Comuns'] as const;
const RARITY_FROM_LABEL: Record<string, AchievementRarity | null> = {
  Todas: null,
  Lendárias: 'lendario',
  Épicas: 'epico',
  Raras: 'raro',
  Comuns: 'comum',
};

function getInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function PlayerAchievementsScreen({ route, navigation }: Props) {
  const { playerId, championshipId } = route.params;
  const { players } = useTeamStore();
  const player = players.find((p) => p.id === playerId);

  const { unlocked } = usePlayerAchievements(playerId, championshipId);

  const [activeFilter, setActiveFilter] = useState<string>('Todas');
  const [selectedDef, setSelectedDef] = useState<AchievementDefinition | null>(null);
  const [selectedUnlockedAt, setSelectedUnlockedAt] = useState<string | undefined>();

  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['45%'], []);

  const unlockedIds = new Set(unlocked.map((a) => a.id));

  const allSorted = [...ACHIEVEMENTS].sort((a, b) => {
    const aUnlocked = unlockedIds.has(a.id) ? 0 : 1;
    const bUnlocked = unlockedIds.has(b.id) ? 0 : 1;
    if (aUnlocked !== bUnlocked) return aUnlocked - bUnlocked;
    return RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
  });

  const filtered = useMemo(() => {
    const rarity = RARITY_FROM_LABEL[activeFilter];
    if (!rarity) return allSorted;
    return allSorted.filter((a) => a.rarity === rarity);
  }, [activeFilter, allSorted]);

  const handleBadgeTap = (def: AchievementDefinition) => {
    const found = unlocked.find((u) => u.id === def.id);
    setSelectedDef(def);
    setSelectedUnlockedAt(found?.unlockedAt);
    sheetRef.current?.expand();
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} />
    ),
    [],
  );

  const initials = player ? getInitials(player.name) : '?';
  const total = ACHIEVEMENTS.length;
  const unlockedCount = unlocked.length;
  const progress = total > 0 ? unlockedCount / total : 0;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.playerName}>{player?.name ?? '—'}</Text>
            <Text style={styles.progressLabel}>
              {unlockedCount} / {total} conquistas
            </Text>
            {/* Progress bar */}
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
          </View>
        </View>

        {/* Filter chips */}
        <View style={styles.filtersRow}>
          {FILTERS.map((f) => {
            const active = f === activeFilter;
            return (
              <TouchableOpacity
                key={f}
                onPress={() => setActiveFilter(f)}
                style={[styles.filterChip, active && styles.filterChipActive]}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {f}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Grid */}
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => {
            const isUnlocked = unlockedIds.has(item.id);
            return (
              <TouchableOpacity
                style={styles.badgeCell}
                onPress={() => handleBadgeTap(item)}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.badgeCircle,
                    isUnlocked
                      ? { backgroundColor: `${item.rarityColor}22`, borderColor: item.rarityColor }
                      : styles.badgeLocked,
                  ]}
                >
                  <Text style={[styles.badgeEmoji, !isUnlocked && styles.badgeEmojiLocked]}>
                    {item.icon}
                  </Text>
                  {!isUnlocked && (
                    <View style={styles.lockOverlay}>
                      <Ionicons name="lock-closed" size={14} color="rgba(255,255,255,0.5)" />
                    </View>
                  )}
                </View>
                <Text
                  style={[styles.badgeName, !isUnlocked && styles.badgeNameLocked]}
                  numberOfLines={2}
                >
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </SafeAreaView>

      {/* Detail BottomSheet */}
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={sheet.bg}
        handleIndicatorStyle={sheet.handle}
      >
        <BottomSheetView style={sheet.content}>
          {selectedDef && (
            <>
              <View
                style={[
                  sheet.iconContainer,
                  {
                    backgroundColor: `${selectedDef.rarityColor}22`,
                    borderColor: selectedDef.rarityColor,
                  },
                ]}
              >
                <Text style={sheet.icon}>{selectedDef.icon}</Text>
              </View>

              <View
                style={[sheet.rarityBadge, { backgroundColor: `${selectedDef.rarityColor}22` }]}
              >
                <Text style={[sheet.rarityText, { color: selectedDef.rarityColor }]}>
                  {RARITY_LABELS[selectedDef.rarity as AchievementRarity].toUpperCase()}
                </Text>
              </View>

              <Text style={sheet.name}>{selectedDef.name}</Text>
              <Text style={sheet.desc}>{selectedDef.description}</Text>

              {selectedUnlockedAt ? (
                <View style={sheet.unlockedRow}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  <Text style={sheet.unlockedText}>
                    Desbloqueado em {formatDate(selectedUnlockedAt)}
                  </Text>
                </View>
              ) : (
                <View style={sheet.lockedRow}>
                  <Ionicons name="lock-closed" size={18} color={colors.textSecondary} />
                  <Text style={sheet.lockedText}>Ainda não desbloqueado</Text>
                </View>
              )}
            </>
          )}
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: `${colors.accent}22`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.accent,
  },
  headerInfo: {
    flex: 1,
    gap: 4,
  },
  playerName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  progressLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  progressTrack: {
    height: 4,
    backgroundColor: colors.surface,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 2,
  },

  // Filters
  filtersRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    backgroundColor: colors.accent,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterTextActive: {
    color: colors.textOnAccent,
  },

  // Grid
  grid: {
    paddingHorizontal: 8,
    paddingBottom: 32,
  },
  row: {
    justifyContent: 'flex-start',
  },
  badgeCell: {
    width: '33.33%',
    padding: 8,
    alignItems: 'center',
    gap: 6,
  },
  badgeCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  badgeLocked: {
    backgroundColor: '#2A2A2A',
    borderColor: '#3A3A3A',
  },
  badgeEmoji: {
    fontSize: 32,
  },
  badgeEmojiLocked: {
    opacity: 0.3,
  },
  lockOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
  },
  badgeName: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 14,
  },
  badgeNameLocked: {
    opacity: 0.5,
  },
});

const sheet = StyleSheet.create({
  bg: { backgroundColor: colors.background },
  handle: { backgroundColor: colors.border },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 32,
    alignItems: 'center',
    gap: 10,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  icon: {
    fontSize: 40,
  },
  rarityBadge: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 12,
  },
  rarityText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  desc: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  unlockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  unlockedText: {
    fontSize: 13,
    color: colors.success,
    fontWeight: '600',
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  lockedText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});
