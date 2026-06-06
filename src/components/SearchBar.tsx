import React, { useRef, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';

interface SearchBarProps extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onClear?: () => void;
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Buscar...',
  onClear,
  ...rest
}: SearchBarProps) {
  const inputRef = useRef<TextInput>(null);
  const borderProgress = useSharedValue(0);

  const handleFocus = () => {
    borderProgress.value = withTiming(1, { duration: 200 });
  };

  const handleBlur = () => {
    borderProgress.value = withTiming(0, { duration: 200 });
  };

  const handleClear = () => {
    onChangeText('');
    onClear?.();
    inputRef.current?.focus();
  };

  const animatedBorderStyle = useAnimatedStyle(() => ({
    height: 2,
    backgroundColor: colors.accent,
    opacity: borderProgress.value,
    transform: [{ scaleX: borderProgress.value }],
  }));

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        <Ionicons name="search" size={18} color={colors.textMuted} style={styles.icon} />
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          onFocus={handleFocus}
          onBlur={handleBlur}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Campo de busca"
          {...rest}
        />
        {value.length > 0 && (
          <TouchableOpacity
            onPress={handleClear}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      <Animated.View style={animatedBorderStyle} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 20,
    marginBottom: 8,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg300,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontFamily: 'Barlow-Medium',
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
});
