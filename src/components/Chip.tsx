import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';
import { PressableScale } from './PressableScale';

type ChipVariant = 'default' | 'gold' | 'danger' | 'success';

type ChipProps = {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  badgeCount?: number;
  disabled?: boolean;
  variant?: ChipVariant;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
};

const variantColors: Record<ChipVariant, string> = {
  default: colors.accent,
  gold: colors.accent,
  danger: colors.danger,
  success: colors.success,
};

export function Chip({
  label,
  active = false,
  onPress,
  icon,
  badgeCount,
  disabled = false,
  variant = 'default',
  size = 'md',
  style,
}: ChipProps) {
  const tone = variantColors[variant];
  const hasBadge = typeof badgeCount === 'number' && badgeCount > 0;

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.98}
      style={[
        styles.base,
        size === 'sm' ? styles.small : styles.medium,
        active && { backgroundColor: `${tone}1F`, borderColor: tone },
        style,
      ]}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={size === 'sm' ? 13 : 15}
          color={active ? tone : colors.textSecondary}
        />
      )}
      <Text
        style={[
          styles.label,
          size === 'sm' && styles.labelSmall,
          active && { color: tone, fontFamily: 'Barlow-SemiBold' },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {hasBadge && (
        <View style={[styles.badge, active && { backgroundColor: tone }]}>
          <Text style={[styles.badgeText, active && { color: colors.bg100 }]}>
            {badgeCount}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    backgroundColor: colors.bg200,
    borderWidth: 1,
    borderColor: colors.border,
  },
  medium: {
    minHeight: 42,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  small: {
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  label: {
    fontFamily: 'Barlow-Medium',
    fontSize: 13,
    color: colors.textSecondary,
  },
  labelSmall: {
    fontSize: 12,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    backgroundColor: colors.bg300,
  },
  badgeText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 10,
    color: colors.textPrimary,
  },
});
