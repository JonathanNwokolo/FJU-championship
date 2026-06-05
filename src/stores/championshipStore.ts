import { create } from 'zustand';
import { Championship } from '../types';

interface ChampionshipState {
  championships: Championship[];
  loading: boolean;
  selectedChampionshipId: string | null;
  setChampionships: (championships: Championship[]) => void;
  addChampionship: (championship: Championship) => void;
  updateChampionship: (id: string, updates: Partial<Championship>) => void;
  setSelectedChampionshipId: (id: string | null) => void;
}

export const useChampionshipStore = create<ChampionshipState>((set, get) => ({
  championships: [],
  loading: true,
  selectedChampionshipId: null,
  setChampionships: (championships) => {
    const current = get().selectedChampionshipId;
    const stillExists = current != null && championships.some((c) => c.id === current);
    const autoSelect = stillExists
      ? current
      : championships.find((c) => c.status === 'em_andamento')?.id ??
        championships.find((c) => c.status === 'inscricoes_abertas')?.id ??
        championships[0]?.id ??
        null;
    set({ championships, loading: false, selectedChampionshipId: autoSelect });
  },
  addChampionship: (championship) =>
    set((state) => ({ championships: [...state.championships, championship] })),
  updateChampionship: (id, updates) =>
    set((state) => ({
      championships: state.championships.map((c) =>
        c.id === id ? { ...c, ...updates } : c,
      ),
    })),
  setSelectedChampionshipId: (id) => set({ selectedChampionshipId: id }),
}));
