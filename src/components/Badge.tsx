import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';

type BadgeVariant =
  | 'live'
  | 'win'
  | 'draw'
  | 'loss'
  | 'pending'
  | 'approved'
  | 'gold'
  | 'silver'
  | 'bronze'
  | 'round';

interface Props {
  label: string;
  variant: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, { bg: string; text: string }> = {
  live: { bg: 'rgba(0,212,255,0.15)', text: colors.neon },
  win: { bg: 'rgba(0,200,83,0.15)', text: colors.success },
  draw: { bg: 'rgba(248,250,252,0.15)', text: colors.textSecondary },
  loss: { bg: 'rgba(255,59,71,0.15)', text: colors.danger },
  pending: { bg: 'rgba(245,166,35,0.15)', text: colors.warning },
  approved: { bg: 'rgba(0,200,83,0.15)', text: colors.success },
  gold: { bg: 'rgba(245,166,35,0.16)', text: colors.accent },
  silver: { bg: 'rgba(203,213,225,0.15)', text: '#CBD5E1' },
  bronze: { bg: 'rgba(205,127,50,0.16)', text: '#CD7F32' },
  round: { bg: 'rgba(255,255,255,0.08)', text: colors.textSecondary },
};

export function Badge({ label, variant }: Props) {
  const pulse = useSharedValue(0.4);
  const tone = variantStyles[variant];

  useEffect(() => {
    if (variant === 'live') {
      pulse.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
    }
  }, [pulse, variant]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      {variant === 'live' && (
        <Animated.View style={[styles.liveDot, pulseStyle]} />
      )}
      <Text style={[styles.text, { color: tone.text }]}>
        {variant === 'live' ? 'AO VIVO' : label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.neon,
  },
  text: {
    fontFamily: 'Barlow-Bold',
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
