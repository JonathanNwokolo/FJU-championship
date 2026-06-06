import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Achievement } from '../types';

/**
 * Display cache ONLY.
 *
 * The source of truth for whether a player owns an achievement is Firestore
 * (`players/{playerId}/achievements/{achievementId}`), checked by
 * `hasAchievement` in achievementService before any grant. This store just
 * mirrors achievements for fast rendering of badges/toasts and holds no
 * dedup/granting logic of its own.
 */
interface AchievementState {
  achievements: Achievement[];
  cacheAchievement: (achievement: Achievement) => void;
  setAchievements: (achievements: Achievement[]) => void;
  getPlayerAchievements: (playerId: string, championshipId: string) => Achievement[];
  reset: () => void;
}

export const useAchievementStore = create<AchievementState>()(
  persist(
    (set, get) => ({
      achievements: [],

      // Upsert by (player, achievement, championship) to keep the cache tidy.
      // This is cache hygiene, not source-of-truth dedup.
      cacheAchievement: (achievement) =>
        set((state) => {
          const others = state.achievements.filter(
            (a) =>
              !(
                a.playerId === achievement.playerId &&
                a.achievementId === achievement.achievementId &&
                a.championshipId === achievement.championshipId
              ),
          );
          return { achievements: [...others, achievement] };
        }),

      setAchievements: (achievements) => set({ achievements }),

      getPlayerAchievements: (playerId, championshipId) =>
        get().achievements.filter(
          (a) => a.playerId === playerId && a.championshipId === championshipId,
        ),

      reset: () => set({ achievements: [] }),
    }),
    {
      name: 'fju-achievements-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
