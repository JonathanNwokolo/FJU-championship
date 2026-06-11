import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';

type StatTileProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  value: string | number;
  label: string;
  subtitle?: string;
  highlight?: boolean;
  valueColor?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function StatTile({
  icon,
  value,
  label,
  subtitle,
  highlight = false,
  valueColor,
  compact = false,
  style,
}: StatTileProps) {
  const tone = valueColor ?? (highlight ? colors.accent : colors.textPrimary);

  return (
    <View style={[styles.card, highlight && styles.highlight, compact && styles.compact, style]}>
      {icon && (
        <View style={[styles.iconWrap, highlight && styles.iconWrapHighlight]}>
          <Ionicons name={icon} size={compact ? 15 : 18} color={tone} />
        </View>
      )}
      <Text
        style={[styles.value, compact && styles.valueCompact, { color: tone }]}
        numberOfLines={2}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text style={[styles.label, compact && styles.labelCompact]} numberOfLines={2}>
        {label}
      </Text>
      {subtitle && (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 92,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.bg200,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    gap: 4,
  },
  highlight: {
    backgroundColor: colors.accentGlow,
    borderColor: colors.accent,
  },
  compact: {
    minHeight: 80,
    paddingHorizontal: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg300,
  },
  iconWrapHighlight: {
    backgroundColor: colors.accentGlow,
  },
  value: {
    fontFamily: 'Barlow-Black',
    fontSize: 24,
    lineHeight: 28,
  },
  valueCompact: {
    fontSize: 22,
    textAlign: 'center',
  },
  label: {
    fontFamily: 'Barlow-Medium',
    fontSize: 12,
    color: colors.textSecondary,
  },
  labelCompact: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    color: colors.textMuted,
  },
});
