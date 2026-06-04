export const fontSizes = {
  xs: 12,
  sm: 13,
  md: 14,
  base: 16,
  lg: 18,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const fontWeights = {
  regular: '400' as const,
  medium: '500' as const,
  semiBold: '600' as const,
  bold: '700' as const,
  extraBold: '800' as const,
};

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodyBold: { fontSize: 15, fontWeight: '600' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  stat: { fontSize: 14, fontWeight: '500' as const },
  statLarge: { fontSize: 20, fontWeight: '700' as const },
  score: { fontSize: 36, fontWeight: '800' as const, letterSpacing: -1 },
  scoreLive: { fontSize: 48, fontWeight: '800' as const, letterSpacing: -1 },
  sectionLabel: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.8 },
  badge: { fontSize: 11, fontWeight: '600' as const },
  tableHeader: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.3 },
  tableCell: { fontSize: 13, fontWeight: '500' as const },
};
