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

const variantStyles: Record<BadgeVariant, { bg: string; text: string; border: string }> = {
  live: { bg: 'rgba(0,212,255,0.15)', text: colors.neon, border: 'rgba(0,212,255,0.35)' },
  win: { bg: 'rgba(0,200,83,0.15)', text: colors.success, border: 'rgba(0,200,83,0.3)' },
  draw: { bg: 'rgba(248,250,252,0.15)', text: colors.textSecondary, border: 'rgba(248,250,252,0.18)' },
  loss: { bg: 'rgba(255,59,71,0.15)', text: colors.danger, border: 'rgba(255,59,71,0.3)' },
  pending: { bg: 'rgba(245,166,35,0.15)', text: colors.warning, border: 'rgba(245,166,35,0.32)' },
  approved: { bg: 'rgba(0,200,83,0.15)', text: colors.success, border: 'rgba(0,200,83,0.3)' },
  gold: { bg: 'rgba(245,166,35,0.16)', text: colors.accent, border: 'rgba(245,166,35,0.34)' },
  silver: { bg: 'rgba(203,213,225,0.15)', text: '#CBD5E1', border: 'rgba(203,213,225,0.3)' },
  bronze: { bg: 'rgba(205,127,50,0.16)', text: '#CD7F32', border: 'rgba(205,127,50,0.32)' },
  round: { bg: 'rgba(255,255,255,0.08)', text: colors.textSecondary, border: 'rgba(255,255,255,0.12)' },
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
    <View style={[styles.badge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
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
    borderWidth: 1,
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
