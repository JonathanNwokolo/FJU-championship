import { useAchievementStore } from '../stores/achievementStore';
import { Achievement, AchievementDefinition } from '../types';
import { ACHIEVEMENTS, RARITY_ORDER } from '../utils/achievementDefinitions';

export interface UnlockedAchievement extends AchievementDefinition {
  unlockedAt: string;
  matchId?: string;
  round?: number;
}

export function usePlayerAchievements(playerId: string, championshipId: string) {
  const { achievements, loading } = useAchievementStore((s) => ({
    achievements: s.getPlayerAchievements(playerId, championshipId),
    loading: false,
  }));

  const unlockedMap = new Map<string, Achievement>();
  for (const a of achievements) {
    unlockedMap.set(a.achievementId, a);
  }

  const unlocked: UnlockedAchievement[] = ACHIEVEMENTS
    .filter((def) => unlockedMap.has(def.id))
    .map((def) => {
      const a = unlockedMap.get(def.id)!;
      return { ...def, unlockedAt: a.unlockedAt, matchId: a.matchId, round: a.round };
    })
    .sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]);

  return { unlocked, loading };
}
