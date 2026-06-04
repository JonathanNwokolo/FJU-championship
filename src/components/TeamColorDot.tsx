import React from 'react';
import { StyleSheet, View } from 'react-native';

interface Props {
  color: string;
  size?: number;
}

export function TeamColorDot({ color, size = 10 }: Props) {
  return (
    <View
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          shadowColor: color,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 6,
    elevation: 2,
  },
});
