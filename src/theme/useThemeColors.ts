import { useThemeStore } from '../stores/themeStore';
import { colors, gradients, shadows } from './colors';
import { lightColors, lightGradients } from './lightColors';

export function useThemeColors() {
  const isDark = useThemeStore((s) => s.isDark);
  return isDark ? colors : (lightColors as typeof colors);
}

export function useThemeGradients() {
  const isDark = useThemeStore((s) => s.isDark);
  return isDark ? gradients : lightGradients;
}

export function useThemeShadows() {
  return shadows;
}
