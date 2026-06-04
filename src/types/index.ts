export type UserRole = 'organizador' | 'capitao' | 'atleta';

export interface AppUser {
  id: string;
  name: string;
  role: UserRole;
}

export type ChampionshipFormat = 'pontos_corridos' | 'mata_mata' | 'grupos_e_mata_mata';
export type ChampionshipStatus = 'inscricoes_abertas' | 'em_andamento' | 'finalizado';

export interface ChampionshipRules {
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  tiebreakers: string[];
  fairPlay: boolean;
  craqueDaRodada: boolean;
  yellowCardLimit?: number;
}

export interface Championship {
  id: string;
  name: string;
  format: ChampionshipFormat;
  status: ChampionshipStatus;
  currentRound: number;
  totalRounds: number;
  organizerId: string;
  inviteCode: string;
  rules: ChampionshipRules;
  createdAt: string;
}

export type TeamStatus = 'pendente' | 'aprovado' | 'rejeitado';

export interface Team {
  id: string;
  championshipId: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  captainId: string;
  status: TeamStatus;
  inviteCode: string;
  createdAt: string;
}

export type PlayerPosition = 'goleiro' | 'zagueiro' | 'lateral' | 'meia' | 'atacante';

export interface Player {
  id: string;
  teamId: string;
  userId?: string;
  name: string;
  position: PlayerPosition;
  number: number;
  photoUrl?: string;
}

export type MatchStatus = 'agendado' | 'ao_vivo' | 'finalizado';

export interface MatchModel {
  id: string;
  championshipId: string;
  round: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  scheduledAt?: string;
  finishedAt?: string;
}

export type MatchEventType = 'gol' | 'cartao_amarelo' | 'cartao_vermelho';

export interface MatchEvent {
  id: string;
  matchId: string;
  type: MatchEventType;
  teamId: string;
  playerId: string;
  minute: number;
}

export interface TeamStats {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  yellowCards: number;
  redCards: number;
}

export interface TopScorer {
  playerId: string;
  teamId: string;
  goals: number;
}

export interface TeamStanding {
  teamId: string;
  teamName: string;
  primaryColor: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  yellowCards: number;
  redCards: number;
  fairPlayScore: number;
}

export interface PlayerScorer {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  goals: number;
}

export interface SuspendedPlayer {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  reason: 'cartao_vermelho' | 'amarelos_acumulados';
}

export interface RoundVote {
  id: string;
  championshipId: string;
  round: number;
  voterId: string;
  candidatePlayerId: string;
  createdAt: string;
}

export interface RoundAward {
  id: string;
  championshipId: string;
  round: number;
  winnerPlayerId: string;
  winnerName: string;
  winnerTeamId: string;
  totalVotes: number;
  closedAt: string;
}

// ── Achievements ──────────────────────────────────────────────────────────────

export type AchievementRarity = 'comum' | 'raro' | 'epico' | 'lendario';

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: AchievementRarity;
  rarityColor: string;
}

export interface Achievement {
  achievementId: string;
  playerId: string;
  championshipId: string;
  unlockedAt: string; // ISO string
  matchId?: string;
  round?: number;
}

// ── Mural ─────────────────────────────────────────────────────────────────────

export interface MuralPost {
  id: string;
  championshipId: string;
  round: number; // 0 = geral (não vinculado a rodada)
  authorId: string;
  authorName: string;
  authorPhotoUrl?: string;
  teamId: string;
  imageUrl: string;
  caption?: string;
  likesCount: number;
  createdAt: string; // ISO string
}
