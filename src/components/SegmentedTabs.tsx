import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';
import { Chip } from './Chip';

type SegmentedTabItem = {
  key: string;
  label: string;
  badgeCount?: number;
  icon?: keyof typeof Ionicons.glyphMap;
};

type SegmentedTabsProps = {
  tabs: SegmentedTabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  style?: StyleProp<ViewStyle>;
};

export function SegmentedTabs({ tabs, activeKey, onChange, style }: SegmentedTabsProps) {
  return (
    <View style={[styles.container, style]}>
      {tabs.map((tab) => (
        <Chip
          key={tab.key}
          label={tab.label}
          icon={tab.icon}
          badgeCount={tab.badgeCount}
          active={activeKey === tab.key}
          onPress={() => onChange(tab.key)}
          style={styles.tab}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    padding: 4,
    borderRadius: 16,
    backgroundColor: colors.bg300,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    flex: 1,
    backgroundColor: colors.bg200,
  },
});
