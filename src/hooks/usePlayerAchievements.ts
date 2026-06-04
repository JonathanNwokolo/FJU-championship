import { useMemo } from 'react';
import { useAchievementStore } from '../stores/achievementStore';
import { Achievement, AchievementDefinition } from '../types';
import { ACHIEVEMENTS, RARITY_ORDER } from '../utils/achievementDefinitions';

export interface UnlockedAchievement extends AchievementDefinition {
  unlockedAt: string;
  matchId?: string;
  round?: number;
}

export function usePlayerAchievements(playerId: string, championshipId: string) {
  const achievements = useAchievementStore((s) => s.achievements);

  const unlocked = useMemo(() => {
    const playerAchievements = achievements.filter(
      (a) => a.playerId === playerId && a.championshipId === championshipId,
    );

    const unlockedMap = new Map<string, Achievement>();
    for (const a of playerAchievements) {
      unlockedMap.set(a.achievementId, a);
    }

    return ACHIEVEMENTS
      .filter((def) => unlockedMap.has(def.id))
      .map((def) => {
        const a = unlockedMap.get(def.id)!;
        return { ...def, unlockedAt: a.unlockedAt, matchId: a.matchId, round: a.round };
      })
      .sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]);
  }, [achievements, playerId, championshipId]);

  return { unlocked, loading: false };
}
