import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RoundVote, RoundAward } from '../types';

interface VotingState {
  votes: RoundVote[];
  awards: RoundAward[];
  addVote: (vote: RoundVote) => void;
  addAward: (award: RoundAward) => void;
}

export const useVotingStore = create<VotingState>()(
  persist(
    (set) => ({
      votes: [],
      awards: [],
      addVote: (vote) => set((s) => ({ votes: [...s.votes, vote] })),
      addAward: (award) => set((s) => ({ awards: [...s.awards, award] })),
    }),
    {
      name: 'fju-voting-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
