import { MOCK_DATA_ENABLED } from '../config/appConfig';
import { useAchievementStore } from '../stores/achievementStore';
import { mockAchievements } from './mockData';

let seeded = false;

/**
 * Hidrata os stores locais que funcionam como cache de exibição (não passam
 * pelo mockDb). Hoje apenas o achievementStore: na produção ele é alimentado
 * pelos grants do achievementService; na demo, semeamos as conquistas do
 * dataset para PlayerCard/AthleteProfile/PlayerAchievements não ficarem vazios.
 *
 * No-op quando USE_MOCK_DATA = false.
 */
export function seedMockStores(): void {
  if (!MOCK_DATA_ENABLED || seeded) return;
  seeded = true;
  useAchievementStore
    .getState()
    .setAchievements(mockAchievements.map(({ id: _id, ...achievement }) => achievement));
}
