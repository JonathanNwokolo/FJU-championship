import React from 'react';
import {
  Pressable,
  PressableStateCallbackType,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';

type PressableScaleProps = {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
  scaleTo?: number;
};

export function PressableScale({
  children,
  onPress,
  disabled = false,
  style,
  scaleTo = 0.97,
}: PressableScaleProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={(state) => [
        state.pressed && !disabled ? { transform: [{ scale: scaleTo }] } : null,
        disabled && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.45,
  },
});
