import { create } from 'zustand';
import { Team, Player } from '../types';
import { generateMockData } from '../data/mockData';

interface TeamState {
  teams: Team[];
  players: Player[];
  addTeam: (team: Team) => void;
  updateTeam: (id: string, updates: Partial<Team>) => void;
  addPlayer: (player: Player) => void;
  removePlayer: (playerId: string) => void;
}

const { teams: mockTeams, players: mockPlayers } = generateMockData();

export const useTeamStore = create<TeamState>((set) => ({
  teams: mockTeams,
  players: mockPlayers,
  addTeam: (team) => set((state) => ({ teams: [...state.teams, team] })),
  updateTeam: (id, updates) =>
    set((state) => ({
      teams: state.teams.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  addPlayer: (player) => set((state) => ({ players: [...state.players, player] })),
  removePlayer: (playerId) =>
    set((state) => ({ players: state.players.filter((p) => p.id !== playerId) })),
}));
