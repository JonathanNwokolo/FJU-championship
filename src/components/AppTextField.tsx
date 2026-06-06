import React, { useState } from 'react';
import {
  KeyboardTypeOptions,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';

type IconName = keyof typeof Ionicons.glyphMap;

interface Props {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  style?: StyleProp<ViewStyle>;
  dark?: boolean;
  leftIcon?: IconName;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  maxLength?: number;
}

export function AppTextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  keyboardType = 'default',
  secureTextEntry = false,
  style,
  leftIcon,
  autoCapitalize = 'sentences',
  maxLength,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(secureTextEntry);
  const focusProgress = useSharedValue(0);

  const handleFocus = () => {
    setFocused(true);
    focusProgress.value = withTiming(1, { duration: 180 });
  };

  const handleBlur = () => {
    setFocused(false);
    focusProgress.value = withTiming(value ? 1 : 0, { duration: 180 });
  };

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(focusProgress.value, [0, 1], [colors.textSecondary, colors.accent]),
    transform: [{ translateY: withTiming(focused || value ? -2 : 0, { duration: 180 }) }],
  }));

  const underlineStyle = useAnimatedStyle(() => ({
    opacity: focusProgress.value,
  }));

  return (
    <View style={style}>
      {!!label && <Animated.Text style={[styles.label, labelStyle]}>{label}</Animated.Text>}
      <View
        style={[
          styles.inputWrap,
          focused && styles.inputWrapFocused,
          !!error && styles.inputWrapError,
        ]}
      >
        {leftIcon && (
          <Ionicons
            name={leftIcon}
            size={18}
            color={focused ? colors.accent : colors.textSecondary}
            style={styles.leftIcon}
          />
        )}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          maxLength={maxLength}
          secureTextEntry={hidden}
          onFocus={handleFocus}
          onBlur={handleBlur}
          accessibilityLabel={label || placeholder}
          style={styles.input}
        />
        {secureTextEntry && (
          <Pressable
            onPress={() => setHidden((current) => !current)}
            style={styles.eyeButton}
          >
            <Ionicons
              name={hidden ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.textSecondary}
            />
          </Pressable>
        )}
        <Animated.View style={[styles.focusLine, underlineStyle]} />
      </View>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  inputWrap: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg300,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  inputWrapFocused: {
    borderColor: colors.borderStrong,
  },
  inputWrapError: {
    borderColor: colors.danger,
  },
  input: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: 14,
    fontFamily: 'Barlow-Medium',
    fontSize: 15,
    color: colors.textPrimary,
  },
  leftIcon: {
    marginLeft: 14,
  },
  eyeButton: {
    width: 44,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: colors.accent,
  },
  errorText: {
    marginTop: 6,
    fontFamily: 'Barlow-Medium',
    fontSize: 12,
    color: colors.danger,
  },
});
