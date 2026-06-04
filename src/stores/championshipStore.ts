import { create } from 'zustand';
import { Championship } from '../types';
import { generateMockData } from '../data/mockData';

interface ChampionshipState {
  championships: Championship[];
  addChampionship: (championship: Championship) => void;
  updateChampionship: (id: string, updates: Partial<Championship>) => void;
}

const { championships: mockChampionships } = generateMockData();

export const useChampionshipStore = create<ChampionshipState>((set) => ({
  championships: mockChampionships,
  addChampionship: (championship) =>
    set((state) => ({ championships: [...state.championships, championship] })),
  updateChampionship: (id, updates) =>
    set((state) => ({
      championships: state.championships.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),
}));
