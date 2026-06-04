import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, gradients, shadows } from '../theme/colors';

type Variant = 'primary' | 'outline' | 'danger' | 'ghost' | 'success';

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function AppButton({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
}: Props) {
  const scale = useSharedValue(1);
  const isDisabled = disabled || loading;
  const isGradient = variant === 'primary' || variant === 'danger' || variant === 'success';

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (!isDisabled) {
      scale.value = withSpring(0.97, { damping: 16, stiffness: 260 });
      if (variant === 'primary') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 16, stiffness: 260 });
  };

  const content = (
    <>
      <Text
        style={[
          styles.text,
          styles[`${variant}Text`],
          loading && styles.loadingText,
        ]}
      >
        {title}
      </Text>
      {loading && (
        <ActivityIndicator
          color={variant === 'primary' || variant === 'danger' || variant === 'success' ? colors.textPrimary : colors.accent}
          size="small"
          style={styles.loader}
        />
      )}
    </>
  );

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      style={[
        styles.base,
        fullWidth && styles.fullWidth,
        variant === 'outline' && styles.outline,
        variant === 'ghost' && styles.ghost,
        variant === 'primary' && !isDisabled && styles.shadowGlow,
        isDisabled && styles.disabled,
        animatedStyle,
        style,
      ]}
    >
      {isGradient ? (
        <LinearGradient
          colors={variant === 'danger' ? gradients.danger : variant === 'success' ? gradients.success : gradients.accent}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          {content}
        </LinearGradient>
      ) : (
        <View style={styles.plainContent}>{content}</View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: 14,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  fullWidth: {
    width: '100%',
    alignSelf: 'stretch',
  },
  gradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  plainContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.4,
  },
  shadowGlow: {
    ...Platform.select({
      default: shadows.shadowGlow,
      web: {
        boxShadow: '0 8px 18px rgba(245, 166, 35, 0.28)',
      } as ViewStyle,
    }),
  },
  text: {
    fontFamily: 'Barlow-Bold',
    fontSize: 15,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  primaryText: {
    color: colors.textPrimary,
  },
  outlineText: {
    color: colors.accent,
  },
  dangerText: {
    color: colors.textPrimary,
  },
  successText: {
    color: colors.textPrimary,
  },
  ghostText: {
    color: colors.accent,
  },
  loadingText: {
    opacity: 0,
  },
  loader: {
    position: 'absolute',
  },
});
