import { create } from 'zustand';
import { AppUser, UserRole } from '../types';
import {
  signIn as authSignIn,
  signUp as authSignUp,
  signOut as authSignOut,
  saveRole,
  listenToAuthChanges,
} from '../services/auth';

interface AuthState {
  user: AppUser | null;
  isLoading: boolean;
  isOnboarded: boolean;

  initialize: () => () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  setRole: (role: UserRole) => Promise<void>;
  setUser: (user: AppUser) => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isLoading: true,
  isOnboarded: false,

  initialize: () => {
    return listenToAuthChanges((result) => {
      if (result) {
        set({ user: result.user, isOnboarded: result.isOnboarded, isLoading: false });
      } else {
        set({ user: null, isOnboarded: false, isLoading: false });
      }
    });
  },

  signIn: async (email, password) => {
    const { user, isOnboarded } = await authSignIn(email, password);
    set({ user, isOnboarded });
  },

  signUp: async (email, password, name) => {
    const user = await authSignUp(email, password, name);
    set({ user, isOnboarded: false });
  },

  signOut: async () => {
    await authSignOut();
    set({ user: null, isOnboarded: false });
  },

  setRole: async (role) => {
    const { user } = get();
    if (!user) return;
    set({ user: { ...user, role }, isOnboarded: true });
    await saveRole(user.id, role);
  },

  setUser: (user) => set({ user }),
}));
