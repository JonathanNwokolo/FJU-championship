import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Achievement } from '../types';
import { addDocument } from '../services/firestore';

interface AchievementState {
  achievements: Achievement[];
  grantAchievement: (achievement: Achievement) => void;
  hasAchievement: (playerId: string, achievementId: string) => boolean;
  getPlayerAchievements: (playerId: string, championshipId: string) => Achievement[];
  reset: () => void;
}

export const useAchievementStore = create<AchievementState>()(
  persist(
    (set, get) => ({
      achievements: [],

      grantAchievement: (achievement) =>
        set((state) => {
          const exists = state.achievements.some(
            (a) =>
              a.playerId === achievement.playerId &&
              a.achievementId === achievement.achievementId &&
              a.championshipId === achievement.championshipId,
          );
          if (exists) return state;

          // Persiste no Firestore para não perder ao reinstalar o app
          addDocument('achievements', achievement).catch((e) =>
            console.warn('[achievementStore] Firestore write error:', e),
          );

          return { achievements: [...state.achievements, achievement] };
        }),

      hasAchievement: (playerId, achievementId) => {
        return get().achievements.some(
          (a) => a.playerId === playerId && a.achievementId === achievementId,
        );
      },

      getPlayerAchievements: (playerId, championshipId) => {
        return get().achievements.filter(
          (a) => a.playerId === playerId && a.championshipId === championshipId,
        );
      },

      reset: () => set({ achievements: [] }),
    }),
    {
      name: 'fju-achievements-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
