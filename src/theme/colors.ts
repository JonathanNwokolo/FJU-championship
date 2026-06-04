export const colors = {
  bg100: '#080E17',
  bg200: '#0F1923',
  bg300: '#1A2535',
  accent: '#F5A623',
  accentDim: '#C47D0E',
  accentGlow: 'rgba(245,166,35,0.12)',
  success: '#00C853',
  danger: '#FF3B47',
  warning: '#F5A623',
  neon: '#00D4FF',
  textPrimary: '#F8FAFC',
  textSecondary: 'rgba(248,250,252,0.62)',
  textMuted: 'rgba(248,250,252,0.42)',
  textOnDark: '#F8FAFC',
  textOnAccent: '#080E17',
  border: 'rgba(255,255,255,0.06)',
  borderLight: 'rgba(255,255,255,0.04)',
  borderStrong: 'rgba(255,255,255,0.14)',
  whiteOverlay: 'rgba(255,255,255,0.12)',
  blackOverlay: 'rgba(0,0,0,0.35)',
  live: '#00D4FF',

  primaryDark: '#080E17',
  primary: '#0F1923',
  accentLight: '#F5A623',
  background: '#080E17',
  surface: '#0F1923',
  surfaceDark: '#1A2535',
};

export const gradients = {
  hero: ['#0F1923', '#080E17'],
  accent: ['#F5A623', '#C47D0E'],
  accentReverse: ['#C47D0E', '#F5A623'],
  success: ['#00C853', '#007A32'],
  danger: ['#FF3B47', '#B0000A'],
  card: ['rgba(26,37,53,0.95)', 'rgba(15,25,35,0.98)'],
  darkOverlay: ['transparent', 'rgba(8,14,23,0.95)'],
  shimmer: ['rgba(255,255,255,0)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0)'],
} as const;

export const shadows = {
  shadowMd: {
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 8,
  },
  shadowGlow: {
    shadowColor: '#F5A623',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 8,
  },
};
