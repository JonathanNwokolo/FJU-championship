export type UserRole = 'organizador' | 'capitao' | 'atleta';

export interface AppUser {
  id: string;
  name: string;
  email?: string;
  role: UserRole;
  photoUrl?: string;
  teamId?: string | null;
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
  redCardSuspend?: boolean;
  manualApproval?: boolean;
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
  registrationDeadline?: string;
  registrationsClosed?: boolean;
  finishedAt?: string;
  season?: string;
  edition?: number;
  isOfficial?: boolean;
  maxPlayers?: number;
  maxTeams?: number;
  matchVerse?: boolean;
  liveMode?: boolean;
  // Campos para grupos + mata-mata
  groups?: Record<string, { id: string; name: string }[]>;
  groupStageComplete?: boolean;
  knockoutStartRound?: number;
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
  inviteLink?: string;
  maxPlayers?: number;
  registrationOpen?: boolean;
  pendingRequests?: string[];
  createdAt: string;
}

export type PlayerPosition = 'goleiro' | 'zagueiro' | 'lateral' | 'volante' | 'meia' | 'atacante';
export type PlayerStatus = 'ativo' | 'suspenso' | 'lesionado' | 'sem_time';

export interface Player {
  id: string;
  teamId: string | null;
  championshipId?: string;
  userId?: string;
  name: string;
  position: PlayerPosition;
  number: number;
  photoUrl?: string;
  status?: PlayerStatus;
  joinedAt?: string;
  leftAt?: string | null;
  suspendedRound?: number;   // rodada em que o jogador está suspenso (não pode jogar)
  yellowCards?: number;       // amarelos acumulados no ciclo atual
  guestPlayer?: boolean;      // true = adicionado manualmente pelo capitão, sem userId
}

export type TeamInviteStatus = 'active' | 'used' | 'expired';

export interface TeamInvite {
  id: string;
  teamId: string;
  teamName: string;
  championshipId: string;
  inviteCode: string;
  createdBy: string;
  usedBy: string | null;
  usedAt: string | null;
  expiresAt: string | null;
  status: TeamInviteStatus;
}

export type JoinRequestStatus = 'pending' | 'approved' | 'rejected';
export type JoinRequestType = 'request' | 'waitlist';

export interface JoinRequest {
  id: string;
  teamId: string;
  teamName: string;
  championshipId: string;
  requesterId: string;
  requesterName: string;
  requesterPhotoUrl: string;
  status: JoinRequestStatus;
  type?: JoinRequestType;
  createdAt: string;
  respondedAt: string | null;
}

export type MatchStatus = 'agendado' | 'ao_vivo' | 'finalizado';

// Labels para fases do mata-mata
export type BracketRound = 'final' | 'semi' | 'quartas' | 'oitavas' | 'fase_16' | 'fase_32' | 'grupo';

export interface MatchModel {
  id: string;
  championshipId: string;
  round: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  scheduledAt?: string | null;
  location?: string | null;
  scheduledBy?: string;
  finishedAt?: string;
  // Campos para mata-mata
  winnerId?: string | null;
  nextMatchId?: string | null;
  bracketRound?: BracketRound;
  bracketPosition?: number; // posição no bracket (0, 1, 2, 3 para quartas, etc.)
  // Campos para grupos
  groupId?: string;
  homePenaltyScore?: number | null;
  awayPenaltyScore?: number | null;
}

export type MatchEventType = 'gol' | 'assistencia' | 'cartao_amarelo' | 'cartao_vermelho';

export interface MatchEvent {
  id: string;
  matchId: string;
  championshipId: string;
  type: MatchEventType;
  teamId: string;
  playerId: string;
  userId?: string;
  minute: number;
  createdAt?: string;
}

export interface PlayerHistoryEntry {
  id: string;
  userId: string;
  championshipId: string;
  championshipName: string;
  teamId: string;
  teamName: string;
  season: string;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  matchesPlayed: number;
  overall: number;
  finishedAt: string;
  position: string;
  isChampion: boolean;
  isMvp: boolean;
  roundMvpCount: number;
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

// ── In-App Notifications ───────────────────────────────────────────────────────

export type InAppNotificationType =
  | 'goal'
  | 'match_started'
  | 'match_finished'
  | 'match_scheduled'
  | 'team_approved'
  | 'team_rejected'
  | 'join_request'
  | 'join_request_approved'
  | 'join_request_rejected'
  | 'waitlist_spot_available';

export interface InAppNotification {
  id: string;
  userId: string;
  type: InAppNotificationType;
  title: string;
  body: string;
  data?: Record<string, string | number>;
  read: boolean;
  createdAt: string;
}

// ── Announcements ─────────────────────────────────────────────────────────────

export type AnnouncementAudience = 'todos' | 'capitaes' | 'atletas' | 'time_especifico';
export type AnnouncementPriority = 'normal' | 'urgente';

export interface Announcement {
  id: string;
  championshipId: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  title: string;
  body: string;
  targetAudience: AnnouncementAudience;
  targetTeamId?: string;
  priority: AnnouncementPriority;
  createdAt: string;
  readBy: string[];
}

// ── Career Stats ──────────────────────────────────────────────────────────────

export interface CareerStats {
  id?: string;
  userId: string;
  name: string;
  lastTeamName: string;
  totalGoals: number;
  totalAssists: number;
  totalMatches: number;
  totalTitles: number;
  totalMvps: number;
  totalChampionships: number;
  bestOverall: number;
  bestSeason: string;
  bestSeasonGoals: number;
  firstSeasonYear: string;
  updatedAt: string;
}

// ── All-Time Rankings ─────────────────────────────────────────────────────────

export interface AllTimeRankingPlayer {
  userId: string;
  name: string;
  teamName: string;
  goals?: number;
  titles?: number;
  matches?: number;
  mvps?: number;
  seasons: number;
}

export interface AllTimeRankingTeam {
  teamId: string;
  name: string;
  titles: number;
  participations: number;
}

export interface AllTimeRanking {
  players?: AllTimeRankingPlayer[];
  teams?: AllTimeRankingTeam[];
}

// ── Championship Results (Firestore) ───────────────────────────────────────────

export interface ChampionshipResultData {
  id: string;
  championshipId: string;
  championshipName: string;
  season: string;
  format: string;
  totalTeams: number;
  totalPlayers: number;
  totalMatches: number;
  totalGoals: number;
  winnerId: string;
  winnerName: string;
  winnerTeamColor?: string;
  runnerUpId: string;
  runnerUpName: string;
  topScorerId: string;
  topScorerName: string;
  topScorerGoals: number;
  bestDefenseId: string;
  bestDefenseName: string;
  bestDefenseGoals: number;
  mvpPlayerId?: string;
  mvpPlayerName?: string;
  mvpVotes?: number;
  fairPlayTeamId?: string;
  fairPlayTeamName?: string;
  fairPlayCards?: number;
  finishedAt: string;
  organizerId: string;
}
