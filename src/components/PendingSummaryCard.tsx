import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PendingItem, PendingItemSeverity } from '../types/pending';
import { colors } from '../theme/colors';

interface Props {
  total: number;
  criticalCount: number;
  topItem: PendingItem | null;
  onPress: () => void;
  testID?: string;
  isPartial?: boolean;
  partialReason?: string | null;
}

function severityColor(severity: PendingItemSeverity): string {
  switch (severity) {
    case 'critical': return colors.danger;
    case 'high': return colors.warning;
    case 'medium': return colors.neon;
    default: return colors.textMuted;
  }
}

export function PendingSummaryCard({
  total,
  criticalCount,
  topItem,
  onPress,
  testID,
  isPartial = false,
  partialReason = null,
}: Props) {
  if (total === 0 && !isPartial) return null;

  const hasCritical = criticalCount > 0;
  const accentColor = hasCritical ? colors.danger : isPartial ? colors.neon : colors.warning;
  const borderColor = hasCritical
    ? 'rgba(255,59,71,0.30)'
    : isPartial
      ? 'rgba(0,212,255,0.24)'
      : 'rgba(245,166,35,0.28)';
  const topText = topItem?.title ?? partialReason;

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: `${accentColor}20` }}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`Central de Pendencias: ${total} pendencia(s)${
        hasCritical ? `, ${criticalCount} critica(s)` : ''
      }. ${partialReason ?? ''} ${
        topItem ? `Mais urgente: ${topItem.title}.` : ''
      } Toque para ver todas.`}
      testID={testID}
    >
      <View style={[styles.card, { borderColor }]}>
        <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

        <View style={[styles.iconWrap, { backgroundColor: `${accentColor}15` }]}>
          <MaterialCommunityIcons
            name={hasCritical ? 'alert-circle' : isPartial ? 'progress-question' : 'bell-badge-outline'}
            size={22}
            color={accentColor}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </View>

        <View style={styles.body}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Pendencias</Text>
            <View style={[styles.badge, { backgroundColor: `${accentColor}20` }]}>
              <Text style={[styles.badgeText, { color: accentColor }]}>
                {isPartial && total === 0 ? '!' : total > 99 ? '99+' : String(total)}
              </Text>
            </View>
          </View>

          {hasCritical && (
            <View style={styles.criticalRow}>
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={12}
                color={colors.danger}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              <Text style={styles.criticalText}>
                {criticalCount} critica{criticalCount !== 1 ? 's' : ''} - acao necessaria
              </Text>
            </View>
          )}

          {topText && (
            <Text
              style={[styles.topItem, { color: topItem ? severityColor(topItem.severity) : colors.textSecondary }]}
              numberOfLines={2}
            >
              {topText}
            </Text>
          )}
        </View>

        <View style={styles.ctaWrap}>
          <Text style={[styles.ctaText, { color: accentColor }]}>Ver todas</Text>
          <MaterialCommunityIcons
            name="chevron-right"
            size={16}
            color={accentColor}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    marginHorizontal: 20,
    marginBottom: 6,
  },
  pressed: {
    opacity: 0.82,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: colors.bg200,
    overflow: 'hidden',
    paddingVertical: 12,
    paddingRight: 12,
  },
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
    marginRight: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    gap: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: 'Barlow-Bold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  badge: {
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: 'center',
  },
  badgeText: {
    fontFamily: 'Barlow-Black',
    fontSize: 12,
  },
  criticalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  criticalText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 12,
    color: colors.danger,
  },
  topItem: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
  },
  ctaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: 8,
  },
  ctaText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
  },
});
