import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'app_theme';

interface ThemeState {
  isDark: boolean;
  initialized: boolean;
  initialize: () => Promise<void>;
  toggleTheme: () => Promise<void>;
  setDark: (dark: boolean) => Promise<void>;
}

export const useThemeStore = create<ThemeState>()((set, get) => ({
  isDark: true,
  initialized: false,

  initialize: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      // Default: dark mode (true). If user stored a preference, use it.
      const isDark = stored === null ? true : stored === 'dark';
      set({ isDark, initialized: true });
    } catch {
      set({ initialized: true });
    }
  },

  toggleTheme: async () => {
    const newValue = !get().isDark;
    set({ isDark: newValue });
    try {
      await AsyncStorage.setItem(STORAGE_KEY, newValue ? 'dark' : 'light');
    } catch (e) {
      console.warn('[themeStore] persist error:', e);
    }
  },

  setDark: async (dark: boolean) => {
    set({ isDark: dark });
    try {
      await AsyncStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
    } catch (e) {
      console.warn('[themeStore] persist error:', e);
    }
  },
}));
