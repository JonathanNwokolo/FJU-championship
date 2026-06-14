import React, { useEffect, useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';

type SkeletonVariant = 'pulse' | 'shimmer';

interface Props {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  variant?: SkeletonVariant;
}

const SHIMMER_COLORS = [
  'rgba(255,255,255,0)',
  'rgba(255,255,255,0.08)',
  'rgba(255,255,255,0)',
] as const;

function PulseSkeleton({ width, height, borderRadius }: Omit<Props, 'variant'>) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 600 }),
        withTiming(0.3, { duration: 600 }),
      ),
      -1,
      false,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.base,
        { width, height, borderRadius } as ViewStyle,
        animatedStyle,
      ]}
    />
  );
}

function ShimmerSkeleton({ width, height, borderRadius }: Omit<Props, 'variant'>) {
  const [boxWidth, setBoxWidth] = useState(0);
  const progress = useSharedValue(-1);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 1100 }), -1, false);
  }, [progress]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * (boxWidth || 0) }],
  }));

  return (
    <View
      onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)}
      style={[
        styles.base,
        styles.shimmerBase,
        { width, height, borderRadius } as ViewStyle,
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, sweepStyle]}>
        <LinearGradient
          colors={SHIMMER_COLORS}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

export function SkeletonLoader({
  width,
  height,
  borderRadius = 8,
  variant = 'pulse',
}: Props) {
  if (variant === 'shimmer') {
    return <ShimmerSkeleton width={width} height={height} borderRadius={borderRadius} />;
  }
  return <PulseSkeleton width={width} height={height} borderRadius={borderRadius} />;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.bg300,
  },
  shimmerBase: {
    overflow: 'hidden',
  },
});
