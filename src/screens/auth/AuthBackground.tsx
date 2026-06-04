import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import { colors, gradients } from '../../theme/colors';

interface Props {
  children: React.ReactNode;
}

export function AuthBackground({ children }: Props) {
  return (
    <LinearGradient colors={gradients.hero} style={styles.root}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%" opacity={0.03}>
          <Defs>
            <Pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse">
              <Circle cx="2" cy="2" r="1.2" fill={colors.textPrimary} />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#dots)" />
        </Svg>
      </View>
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
