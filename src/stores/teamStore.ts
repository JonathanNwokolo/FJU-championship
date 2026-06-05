import { create } from 'zustand';
import { Team, Player } from '../types';

interface TeamState {
  teams: Team[];
  players: Player[];
  loading: boolean;
  setTeams: (teams: Team[]) => void;
  setPlayers: (players: Player[]) => void;
  addTeam: (team: Team) => void;
  updateTeam: (id: string, updates: Partial<Team>) => void;
  addPlayer: (player: Player) => void;
  updatePlayer: (id: string, updates: Partial<Player>) => void;
  removePlayer: (playerId: string) => void;
}

export const useTeamStore = create<TeamState>((set) => ({
  teams: [],
  players: [],
  loading: true,
  setTeams: (teams) => set({ teams, loading: false }),
  setPlayers: (players) => set({ players }),
  addTeam: (team) => set((state) => ({ teams: [...state.teams, team] })),
  updateTeam: (id, updates) =>
    set((state) => ({
      teams: state.teams.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  addPlayer: (player) => set((state) => ({ players: [...state.players, player] })),
  updatePlayer: (id, updates) =>
    set((state) => ({
      players: state.players.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    })),
  removePlayer: (playerId) =>
    set((state) => ({ players: state.players.filter((p) => p.id !== playerId) })),
}));
