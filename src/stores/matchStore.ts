import { create } from 'zustand';
import { MatchModel, MatchEvent } from '../types';

interface MatchState {
  matches: MatchModel[];
  events: MatchEvent[];
  loading: boolean;
  setMatches: (matches: MatchModel[]) => void;
  setEvents: (events: MatchEvent[]) => void;
  addMatches: (matches: MatchModel[]) => void;
  updateMatch: (id: string, updates: Partial<MatchModel>) => void;
  addEvent: (event: MatchEvent) => void;
  removeEvent: (eventId: string) => void;
  startMatch: (id: string) => void;
}

export const useMatchStore = create<MatchState>((set) => ({
  matches: [],
  events: [],
  loading: true,
  setMatches: (matches) => set({ matches, loading: false }),
  setEvents: (events) => set({ events }),
  addMatches: (matches) =>
    set((state) => ({ matches: [...state.matches, ...matches] })),
  updateMatch: (id, updates) =>
    set((state) => ({
      matches: state.matches.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),
  addEvent: (event) => set((state) => ({ events: [...state.events, event] })),
  removeEvent: (eventId) =>
    set((state) => ({ events: state.events.filter((e) => e.id !== eventId) })),
  startMatch: (id) =>
    set((state) => ({
      matches: state.matches.map((m) =>
        m.id === id ? { ...m, status: 'ao_vivo', homeScore: 0, awayScore: 0 } : m,
      ),
    })),
}));
