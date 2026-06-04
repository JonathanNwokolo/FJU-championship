import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppUser, UserRole } from '../types';

// Mock IDs so the demo data links correctly
const MOCK_IDS: Record<UserRole, string> = {
  organizador: 'user-org-01',  // matches championship.organizerId in mock data
  capitao:     'captain-1',    // matches team-01.captainId in mock data
  atleta:      'atleta-demo',  // matches player-001.userId in mock data
};

interface AuthState {
  user: AppUser | null;
  isOnboarded: boolean;
  setUser: (name: string) => void;
  setRole: (role: UserRole) => void;
  switchRole: (role: UserRole) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isOnboarded: false,
      setUser: (name: string) => {
        set({
          user: {
            id: `user-${Date.now()}`,
            name,
            role: 'atleta',
          },
        });
      },
      setRole: (role: UserRole) => {
        const current = get().user;
        if (current) {
          set({
            user: { ...current, id: MOCK_IDS[role], role },
            isOnboarded: true,
          });
        }
      },
      switchRole: (role: UserRole) => {
        const current = get().user;
        if (current) {
          set({ user: { ...current, id: MOCK_IDS[role], role } });
        }
      },
      logout: () => set({ user: null, isOnboarded: false }),
    }),
    {
      name: 'fju-auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
