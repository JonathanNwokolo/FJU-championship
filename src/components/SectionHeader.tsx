import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

interface Props {
  title: string;
  subtitle?: string;
  action?: {
    text: string;
    onPress: () => void;
  };
}

export function SectionHeader({ title, subtitle, action }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        {!!action && (
          <Pressable onPress={action.onPress}>
            <Text style={styles.action}>{action.text}</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  copy: {
    flex: 1,
  },
  title: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    letterSpacing: 2,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  subtitle: {
    marginTop: 2,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textMuted,
  },
  action: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    color: colors.accent,
  },
  divider: {
    height: 1,
    marginTop: 6,
    backgroundColor: colors.border,
  },
});
