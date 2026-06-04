import React from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, shadows } from '../theme/colors';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'elevated' | 'accent' | 'dark';
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function AppCard({ children, onPress, style, variant = 'default' }: Props) {
  const pressed = useSharedValue(0);
  const normalizedVariant = variant === 'dark' ? 'elevated' : variant;

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      pressed.value,
      [0, 1],
      [
        normalizedVariant === 'elevated' ? colors.bg300 : normalizedVariant === 'accent' ? colors.accentGlow : colors.bg200,
        colors.bg300,
      ],
    ),
  }));

  const cardStyle = [
    styles.base,
    normalizedVariant === 'elevated' && styles.elevated,
    normalizedVariant === 'accent' && styles.accent,
    style,
  ];

  if (onPress) {
    return (
      <AnimatedPressable
        onPress={onPress}
        onPressIn={() => {
          pressed.value = withTiming(1, { duration: 140 });
        }}
        onPressOut={() => {
          pressed.value = withTiming(0, { duration: 180 });
        }}
        style={[cardStyle, animatedStyle]}
      >
        {children}
      </AnimatedPressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.bg200,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.shadowMd,
  },
  elevated: {
    backgroundColor: colors.bg300,
    borderColor: colors.borderStrong,
  },
  accent: {
    backgroundColor: colors.accentGlow,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
});
