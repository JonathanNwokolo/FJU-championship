import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RoundVote, RoundAward } from '../types';

interface VotingState {
  votes: RoundVote[];
  awards: RoundAward[];
  addVote: (vote: RoundVote) => void;
  addAward: (award: RoundAward) => void;
  setVotes: (votes: RoundVote[]) => void;
  setAwards: (awards: RoundAward[]) => void;
  reset: () => void;
}

export const useVotingStore = create<VotingState>()(
  persist(
    (set) => ({
      votes: [],
      awards: [],
      addVote: (vote) =>
        set((s) => ({
          votes: s.votes.some((v) => v.id === vote.id) ? s.votes : [...s.votes, vote],
        })),
      addAward: (award) =>
        set((s) => ({
          awards: s.awards.some((a) => a.id === award.id) ? s.awards : [...s.awards, award],
        })),
      setVotes: (votes) => set({ votes }),
      setAwards: (awards) => set({ awards }),
      reset: () => set({ votes: [], awards: [] }),
    }),
    {
      name: 'fju-voting-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
