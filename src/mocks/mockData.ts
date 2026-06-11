import {
  AllTimeRanking,
  Announcement,
  AppUser,
  CareerStats,
  Championship,
  ChampionshipResultData,
  InAppNotification,
  JoinRequest,
  MatchEvent,
  MatchModel,
  Player,
  PlayerHistoryEntry,
  RoundAward,
  RoundVote,
  Team,
  TeamInvite,
} from '../types';

const now = new Date('2026-06-10T12:00:00.000Z');
const daysFromNow = (days: number) =>
  new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

export const mockUsers = {
  organizador: {
    id: 'mock-user-organizador',
    name: 'Rafael Organizador',
    email: 'organizador@mock.fju',
    role: 'organizador',
    photoUrl: 'https://placehold.co/160x160/111827/F5A623?text=RO',
  },
  capitao: {
    id: 'mock-user-capitao',
    name: 'Lucas Capitao',
    email: 'capitao@mock.fju',
    role: 'capitao',
    teamId: 'team-lions',
    photoUrl: 'https://placehold.co/160x160/111827/22C55E?text=LC',
  },
  atleta: {
    id: 'mock-user-atleta',
    name: 'Mateus Atleta',
    email: 'atleta@mock.fju',
    role: 'atleta',
    teamId: 'team-eagles',
    photoUrl: 'https://placehold.co/160x160/111827/38BDF8?text=MA',
  },
  atleta_sem_time: {
    id: 'mock-user-sem-time',
    name: 'Pedro Sem Time',
    email: 'sem.time@mock.fju',
    role: 'atleta',
    teamId: null,
    photoUrl: 'https://placehold.co/160x160/111827/E879F9?text=PS',
  },
} satisfies Record<string, AppUser>;

export const mockChampionships: Championship[] = [
  {
    id: 'champ-open',
    name: 'Copa FJU Inscricoes',
    format: 'pontos_corridos',
    status: 'inscricoes_abertas',
    currentRound: 0,
    totalRounds: 3,
    organizerId: mockUsers.organizador.id,
    inviteCode: 'ABERTA',
    createdAt: daysFromNow(-14),
    registrationDeadline: daysFromNow(10),
    fixturesGenerated: false,
    registrationSettings: { approvalRequired: true },
    rules: {
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      tiebreakers: ['points', 'goalDifference', 'goalsFor'],
      fairPlay: true,
      roundAwards: true,
      craqueDaRodada: true,
      yellowCardLimit: 3,
      redCardSuspend: true,
      manualApproval: true,
    },
  },
  {
    id: 'champ-active',
    name: 'Liga FJU Demo',
    format: 'pontos_corridos',
    status: 'em_andamento',
    currentRound: 2,
    totalRounds: 3,
    organizerId: mockUsers.organizador.id,
    inviteCode: 'LIGA56',
    createdAt: daysFromNow(-40),
    fixturesGenerated: true,
    rules: {
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      tiebreakers: ['points', 'goalDifference', 'goalsFor'],
      fairPlay: true,
      roundAwards: true,
      craqueDaRodada: true,
      yellowCardLimit: 3,
      redCardSuspend: true,
      manualApproval: true,
    },
  },
  {
    id: 'champ-finished',
    name: 'Torneio FJU Encerrado',
    format: 'mata_mata',
    status: 'finalizado',
    currentRound: 3,
    totalRounds: 3,
    organizerId: mockUsers.organizador.id,
    inviteCode: 'FINAL9',
    createdAt: daysFromNow(-120),
    finishedAt: daysFromNow(-30),
    fixturesGenerated: true,
    rules: {
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      tiebreakers: ['points', 'goalDifference', 'goalsFor'],
      fairPlay: true,
      roundAwards: true,
      craqueDaRodada: true,
      yellowCardLimit: 3,
      redCardSuspend: true,
      manualApproval: true,
    },
  },
];

export const mockTeams: Team[] = [
  {
    id: 'team-lions',
    championshipId: 'champ-active',
    name: 'Leoes da FJU',
    primaryColor: '#F5A623',
    secondaryColor: '#111827',
    captainId: mockUsers.capitao.id,
    status: 'aprovado',
    inviteCode: 'LIONS1',
    inviteLink: 'https://fjuchampionship.app/join/LIONS1',
    maxPlayers: 5,
    registrationOpen: true,
    approvedPlayersCount: 4,
    pendingRequests: ['mock-user-sem-time'],
    createdAt: daysFromNow(-35),
  },
  {
    id: 'team-eagles',
    championshipId: 'champ-active',
    name: 'Aguias United',
    primaryColor: '#38BDF8',
    secondaryColor: '#0F172A',
    captainId: 'mock-captain-eagles',
    status: 'aprovado',
    inviteCode: 'EAGLE2',
    maxPlayers: 5,
    registrationOpen: true,
    approvedPlayersCount: 3,
    createdAt: daysFromNow(-35),
  },
  {
    id: 'team-wolves',
    championshipId: 'champ-active',
    name: 'Wolves Arena',
    primaryColor: '#22C55E',
    secondaryColor: '#052E16',
    captainId: 'mock-captain-wolves',
    status: 'aprovado',
    inviteCode: 'WOLV33',
    maxPlayers: 3,
    registrationOpen: true,
    approvedPlayersCount: 3,
    createdAt: daysFromNow(-34),
  },
  {
    id: 'team-sharks',
    championshipId: 'champ-active',
    name: 'Sharks FC',
    primaryColor: '#A78BFA',
    secondaryColor: '#1E1B4B',
    captainId: 'mock-captain-sharks',
    status: 'aprovado',
    inviteCode: 'SHARK4',
    maxPlayers: 5,
    registrationOpen: true,
    approvedPlayersCount: 2,
    createdAt: daysFromNow(-34),
  },
  {
    id: 'team-open-pending',
    championshipId: 'champ-open',
    name: 'Novatos FJU',
    primaryColor: '#FB7185',
    secondaryColor: '#4C0519',
    captainId: 'mock-captain-pending',
    status: 'pendente',
    inviteCode: 'OPEN55',
    maxPlayers: 8,
    registrationOpen: true,
    approvedPlayersCount: 0,
    createdAt: daysFromNow(-4),
  },
];

export const mockPlayers: Player[] = [
  { id: 'player-lions-1', teamId: 'team-lions', championshipId: 'champ-active', userId: mockUsers.capitao.id, name: 'Lucas Capitao', position: 'meia', number: 10, status: 'ativo', joinedAt: daysFromNow(-35) },
  { id: 'player-lions-2', teamId: 'team-lions', championshipId: 'champ-active', userId: 'mock-lions-2', name: 'Andre Rocha', position: 'atacante', number: 9, status: 'ativo', joinedAt: daysFromNow(-35) },
  { id: 'player-lions-3', teamId: 'team-lions', championshipId: 'champ-active', userId: 'mock-lions-3', name: 'Bruno Lima', position: 'zagueiro', number: 4, status: 'suspenso', suspendedRound: 2, yellowCards: 2, joinedAt: daysFromNow(-35) },
  { id: 'player-lions-4', teamId: 'team-lions', championshipId: 'champ-active', userId: 'mock-lions-4', name: 'Carlos Nunes', position: 'goleiro', number: 1, status: 'lesionado', joinedAt: daysFromNow(-35) },
  { id: 'player-eagles-1', teamId: 'team-eagles', championshipId: 'champ-active', userId: mockUsers.atleta.id, name: 'Mateus Atleta', position: 'atacante', number: 11, status: 'ativo', joinedAt: daysFromNow(-33) },
  { id: 'player-eagles-2', teamId: 'team-eagles', championshipId: 'champ-active', userId: 'mock-eagles-2', name: 'Daniel Souza', position: 'meia', number: 8, status: 'ativo', joinedAt: daysFromNow(-33) },
  { id: 'player-eagles-3', teamId: 'team-eagles', championshipId: 'champ-active', userId: 'mock-eagles-3', name: 'Felipe Dias', position: 'lateral', number: 6, status: 'ativo', joinedAt: daysFromNow(-33) },
  { id: 'player-wolves-1', teamId: 'team-wolves', championshipId: 'champ-active', userId: 'mock-captain-wolves', name: 'Igor Santos', position: 'meia', number: 7, status: 'ativo', joinedAt: daysFromNow(-32) },
  { id: 'player-wolves-2', teamId: 'team-wolves', championshipId: 'champ-active', userId: 'mock-wolves-2', name: 'Joao Vitor', position: 'atacante', number: 19, status: 'ativo', joinedAt: daysFromNow(-32) },
  { id: 'player-wolves-3', teamId: 'team-wolves', championshipId: 'champ-active', userId: 'mock-wolves-3', name: 'Ruan Melo', position: 'goleiro', number: 12, status: 'ativo', joinedAt: daysFromNow(-32) },
  { id: 'player-sharks-1', teamId: 'team-sharks', championshipId: 'champ-active', userId: 'mock-captain-sharks', name: 'Nicolas Reis', position: 'volante', number: 5, status: 'ativo', joinedAt: daysFromNow(-31) },
  { id: 'player-sharks-2', teamId: 'team-sharks', championshipId: 'champ-active', userId: 'mock-sharks-2', name: 'Vitor Alves', position: 'atacante', number: 17, status: 'ativo', joinedAt: daysFromNow(-31) },
  { id: 'player-old-sem-time', teamId: 'team-eagles', championshipId: 'champ-active', userId: 'mock-old-sem-time-user', name: 'Pedro Sem Time', position: 'meia', number: 15, status: 'sem_time', leftAt: daysFromNow(-3), joinedAt: daysFromNow(-30) },
  { id: 'player-removed-history', teamId: 'team-lions', championshipId: 'champ-active', userId: 'mock-removed', name: 'Marcos Historico', position: 'atacante', number: 20, status: 'removido', leftAt: daysFromNow(-6), joinedAt: daysFromNow(-32) },
  { id: 'player-guest-1', teamId: 'team-sharks', championshipId: 'champ-active', name: 'Convidado Sharks', position: 'lateral', number: 22, status: 'ativo', guestPlayer: true, joinedAt: daysFromNow(-5) },
  { id: 'player-open-1', teamId: 'team-open-pending', championshipId: 'champ-open', userId: 'mock-open-1', name: 'Atleta Pendente', position: 'meia', number: 10, status: 'ativo', joinedAt: daysFromNow(-4) },
];

export const mockMatches: MatchModel[] = [
  { id: 'match-r1-1', championshipId: 'champ-active', round: 1, homeTeamId: 'team-lions', awayTeamId: 'team-eagles', homeScore: 2, awayScore: 1, status: 'finalizado', scheduledAt: daysFromNow(-12), finishedAt: daysFromNow(-12) },
  { id: 'match-r1-2', championshipId: 'champ-active', round: 1, homeTeamId: 'team-wolves', awayTeamId: 'team-sharks', homeScore: 0, awayScore: 0, status: 'finalizado', scheduledAt: daysFromNow(-11), finishedAt: daysFromNow(-11) },
  { id: 'match-r2-1', championshipId: 'champ-active', round: 2, homeTeamId: 'team-lions', awayTeamId: 'team-wolves', homeScore: 1, awayScore: 0, status: 'ao_vivo', scheduledAt: daysFromNow(0) },
  { id: 'match-r2-2', championshipId: 'champ-active', round: 2, homeTeamId: 'team-eagles', awayTeamId: 'team-sharks', homeScore: null, awayScore: null, status: 'agendado', scheduledAt: daysFromNow(2) },
  { id: 'match-r3-1', championshipId: 'champ-active', round: 3, homeTeamId: 'team-lions', awayTeamId: 'team-sharks', homeScore: null, awayScore: null, status: 'agendado', scheduledAt: daysFromNow(7) },
  { id: 'match-r3-2', championshipId: 'champ-active', round: 3, homeTeamId: 'team-eagles', awayTeamId: 'team-wolves', homeScore: null, awayScore: null, status: 'agendado', scheduledAt: daysFromNow(8) },
  { id: 'match-finished-semi', championshipId: 'champ-finished', round: 2, homeTeamId: 'team-lions', awayTeamId: 'team-sharks', homeScore: 3, awayScore: 2, status: 'finalizado', winnerId: 'team-lions', bracketRound: 'semi', scheduledAt: daysFromNow(-45), finishedAt: daysFromNow(-45) },
  { id: 'match-finished-final', championshipId: 'champ-finished', round: 3, homeTeamId: 'team-lions', awayTeamId: 'team-eagles', homeScore: 1, awayScore: 0, status: 'finalizado', winnerId: 'team-lions', bracketRound: 'final', scheduledAt: daysFromNow(-30), finishedAt: daysFromNow(-30) },
];

export const mockMatchEvents: MatchEvent[] = [
  { id: 'event-1', matchId: 'match-r1-1', championshipId: 'champ-active', type: 'gol', teamId: 'team-lions', playerId: 'player-lions-2', playerName: 'Andre Rocha', teamName: 'Leoes da FJU', minute: 12, createdAt: daysFromNow(-12) },
  { id: 'event-2', matchId: 'match-r1-1', championshipId: 'champ-active', type: 'assistencia', teamId: 'team-lions', playerId: 'player-lions-1', playerName: 'Lucas Capitao', teamName: 'Leoes da FJU', minute: 12, createdAt: daysFromNow(-12) },
  { id: 'event-3', matchId: 'match-r1-1', championshipId: 'champ-active', type: 'gol', teamId: 'team-eagles', playerId: 'player-eagles-1', playerName: 'Mateus Atleta', teamName: 'Aguias United', minute: 31, createdAt: daysFromNow(-12) },
  { id: 'event-4', matchId: 'match-r1-1', championshipId: 'champ-active', type: 'gol', teamId: 'team-lions', playerId: 'player-removed-history', playerName: 'Marcos Historico', teamName: 'Leoes da FJU', minute: 76, createdAt: daysFromNow(-12) },
  { id: 'event-5', matchId: 'match-r1-1', championshipId: 'champ-active', type: 'cartao_amarelo', teamId: 'team-lions', playerId: 'player-lions-3', playerName: 'Bruno Lima', teamName: 'Leoes da FJU', minute: 44, createdAt: daysFromNow(-12) },
  { id: 'event-6', matchId: 'match-r1-1', championshipId: 'champ-active', type: 'cartao_vermelho', teamId: 'team-eagles', playerId: 'player-eagles-2', playerName: 'Daniel Souza', teamName: 'Aguias United', minute: 88, createdAt: daysFromNow(-12) },
  { id: 'event-7', matchId: 'match-r1-2', championshipId: 'champ-active', type: 'cartao_amarelo', teamId: 'team-wolves', playerId: 'player-wolves-1', playerName: 'Igor Santos', teamName: 'Wolves Arena', minute: 20, createdAt: daysFromNow(-11) },
  { id: 'event-8', matchId: 'match-r1-2', championshipId: 'champ-active', type: 'cartao_amarelo', teamId: 'team-sharks', playerId: 'player-sharks-1', playerName: 'Nicolas Reis', teamName: 'Sharks FC', minute: 54, createdAt: daysFromNow(-11) },
  { id: 'event-9', matchId: 'match-r2-1', championshipId: 'champ-active', type: 'gol', teamId: 'team-lions', playerId: 'player-lions-2', playerName: 'Andre Rocha', teamName: 'Leoes da FJU', minute: 18, createdAt: daysFromNow(0) },
  { id: 'event-10', matchId: 'match-r2-1', championshipId: 'champ-active', type: 'assistencia', teamId: 'team-lions', playerId: 'player-lions-1', playerName: 'Lucas Capitao', teamName: 'Leoes da FJU', minute: 18, createdAt: daysFromNow(0) },
  { id: 'event-11', matchId: 'match-r2-1', championshipId: 'champ-active', type: 'cartao_amarelo', teamId: 'team-wolves', playerId: 'player-wolves-2', playerName: 'Joao Vitor', teamName: 'Wolves Arena', minute: 47, createdAt: daysFromNow(0) },
  { id: 'event-12', matchId: 'match-finished-final', championshipId: 'champ-finished', type: 'gol', teamId: 'team-lions', playerId: 'player-lions-2', playerName: 'Andre Rocha', teamName: 'Leoes da FJU', minute: 63, createdAt: daysFromNow(-30) },
  { id: 'event-13', matchId: 'match-finished-semi', championshipId: 'champ-finished', type: 'gol', teamId: 'team-lions', playerId: 'player-lions-1', playerName: 'Lucas Capitao', teamName: 'Leoes da FJU', minute: 11, createdAt: daysFromNow(-45) },
  { id: 'event-14', matchId: 'match-finished-semi', championshipId: 'champ-finished', type: 'gol', teamId: 'team-lions', playerId: 'player-lions-2', playerName: 'Andre Rocha', teamName: 'Leoes da FJU', minute: 49, createdAt: daysFromNow(-45) },
  { id: 'event-15', matchId: 'match-finished-semi', championshipId: 'champ-finished', type: 'gol', teamId: 'team-sharks', playerId: 'player-sharks-2', playerName: 'Vitor Alves', teamName: 'Sharks FC', minute: 71, createdAt: daysFromNow(-45) },
  { id: 'event-16', matchId: 'match-finished-semi', championshipId: 'champ-finished', type: 'cartao_vermelho', teamId: 'team-sharks', playerId: 'player-sharks-1', playerName: 'Nicolas Reis', teamName: 'Sharks FC', minute: 80, createdAt: daysFromNow(-45) },
];

export const mockJoinRequests: JoinRequest[] = [
  { id: 'join-request-pending', teamId: 'team-lions', teamName: 'Leoes da FJU', championshipId: 'champ-active', requesterId: mockUsers.atleta_sem_time.id, requesterName: mockUsers.atleta_sem_time.name, requesterPhotoUrl: mockUsers.atleta_sem_time.photoUrl ?? '', status: 'pending', type: 'request', createdAt: daysFromNow(-1), respondedAt: null },
  { id: 'join-request-waitlist', teamId: 'team-wolves', teamName: 'Wolves Arena', championshipId: 'champ-active', requesterId: 'mock-waitlist-user', requesterName: 'Tiago Espera', requesterPhotoUrl: '', status: 'pending', type: 'waitlist', createdAt: daysFromNow(-2), respondedAt: null },
  { id: 'join-request-approved', teamId: 'team-eagles', teamName: 'Aguias United', championshipId: 'champ-active', requesterId: 'mock-approved-user', requesterName: 'Cesar Aprovado', requesterPhotoUrl: '', status: 'approved', type: 'request', createdAt: daysFromNow(-8), respondedAt: daysFromNow(-7) },
];

export const mockTeamInvites: TeamInvite[] = [
  { id: 'invite-lions-active', teamId: 'team-lions', teamName: 'Leoes da FJU', championshipId: 'champ-active', inviteCode: 'LIONS1', createdBy: mockUsers.capitao.id, usedBy: null, usedAt: null, expiresAt: null, status: 'active' },
  { id: 'invite-eagles-active', teamId: 'team-eagles', teamName: 'Aguias United', championshipId: 'champ-active', inviteCode: 'EAGLE2', createdBy: 'mock-captain-eagles', usedBy: null, usedAt: null, expiresAt: null, status: 'active' },
];

export const mockAnnouncements: Announcement[] = [
  { id: 'announcement-all', championshipId: 'champ-active', authorId: mockUsers.organizador.id, authorName: mockUsers.organizador.name, authorRole: 'organizador', title: 'Rodada 2 liberada', body: 'Confrontos da rodada 2 ja estao disponiveis.', targetAudience: 'todos', priority: 'normal', createdAt: daysFromNow(-1), readBy: [] },
  { id: 'announcement-captains', championshipId: 'champ-active', authorId: mockUsers.organizador.id, authorName: mockUsers.organizador.name, authorRole: 'organizador', title: 'Capitaes, confirmem horarios', body: 'Atualizem os horarios pendentes antes de sexta.', targetAudience: 'capitaes', priority: 'urgente', createdAt: daysFromNow(-2), readBy: [mockUsers.capitao.id] },
  { id: 'announcement-team', championshipId: 'champ-active', authorId: mockUsers.organizador.id, authorName: mockUsers.organizador.name, authorRole: 'organizador', title: 'Aviso ao Leoes', body: 'Uniforme principal obrigatorio na proxima partida.', targetAudience: 'time_especifico', targetTeamId: 'team-lions', priority: 'normal', createdAt: daysFromNow(-3), readBy: [] },
];

export const mockNotifications: InAppNotification[] = [
  { id: 'notification-1', userId: mockUsers.capitao.id, type: 'join_request', title: 'Novo pedido', body: 'Pedro Sem Time quer entrar no Leoes da FJU', data: { teamId: 'team-lions' }, read: false, createdAt: daysFromNow(-1) },
  { id: 'notification-2', userId: mockUsers.organizador.id, type: 'match_started', title: 'Partida ao vivo', body: 'Leoes da FJU x Wolves Arena comecou', data: { matchId: 'match-r2-1' }, read: false, createdAt: daysFromNow(0) },
  { id: 'notification-3', userId: mockUsers.atleta.id, type: 'goal', title: 'GOL!', body: 'Andre Rocha marcou para Leoes da FJU', data: { matchId: 'match-r2-1' }, read: true, createdAt: daysFromNow(0) },
  { id: 'notification-4', userId: mockUsers.atleta_sem_time.id, type: 'waitlist_spot_available', title: 'Vaga aberta', body: 'Uma vaga abriu no Sharks FC', data: { inviteCode: 'SHARK4' }, read: false, createdAt: daysFromNow(-1) },
];

export const mockRoundVotes: RoundVote[] = [
  { id: 'vote-1', championshipId: 'champ-active', round: 1, voterId: mockUsers.capitao.id, candidatePlayerId: 'player-eagles-1', createdAt: daysFromNow(-10) },
  { id: 'vote-2', championshipId: 'champ-active', round: 1, voterId: mockUsers.atleta.id, candidatePlayerId: 'player-lions-2', createdAt: daysFromNow(-10) },
  { id: 'vote-3', championshipId: 'champ-active', round: 1, voterId: 'mock-captain-wolves', candidatePlayerId: 'player-lions-2', createdAt: daysFromNow(-10) },
  { id: 'vote-4', championshipId: 'champ-active', round: 1, voterId: 'mock-captain-sharks', candidatePlayerId: 'player-eagles-1', createdAt: daysFromNow(-10) },
  { id: 'vote-5', championshipId: 'champ-active', round: 1, voterId: mockUsers.atleta_sem_time.id, candidatePlayerId: 'player-lions-2', createdAt: daysFromNow(-10) },
];

export const mockRoundAwards: RoundAward[] = [
  { id: 'award-round-1', championshipId: 'champ-active', round: 1, winnerPlayerId: 'player-lions-2', winnerName: 'Andre Rocha', winnerTeamId: 'team-lions', totalVotes: 3, closedAt: daysFromNow(-9) },
];

export const mockChampionshipResults: ChampionshipResultData[] = [
  {
    id: 'champ-finished',
    championshipId: 'champ-finished',
    championshipName: 'Torneio FJU Encerrado',
    season: '2026',
    format: 'mata_mata',
    totalTeams: 4,
    totalPlayers: 16,
    totalMatches: 3,
    totalGoals: 8,
    winnerId: 'team-lions',
    winnerName: 'Leoes da FJU',
    winnerTeamColor: '#F5A623',
    runnerUpId: 'team-eagles',
    runnerUpName: 'Aguias United',
    topScorerId: 'player-lions-2',
    topScorerName: 'Andre Rocha',
    topScorerGoals: 4,
    bestDefenseId: 'team-lions',
    bestDefenseName: 'Leoes da FJU',
    bestDefenseGoals: 2,
    mvpPlayerId: 'player-lions-2',
    mvpPlayerName: 'Andre Rocha',
    mvpVotes: 7,
    fairPlayTeamId: 'team-eagles',
    fairPlayTeamName: 'Aguias United',
    fairPlayCards: 1,
    finishedAt: daysFromNow(-30),
    organizerId: mockUsers.organizador.id,
  },
];

export const mockPlayerHistory: PlayerHistoryEntry[] = [
  { id: 'history-lucas-2026', userId: mockUsers.capitao.id, championshipId: 'champ-finished', championshipName: 'Torneio FJU Encerrado', teamId: 'team-lions', teamName: 'Leoes da FJU', season: '2026', goals: 1, assists: 2, yellowCards: 1, redCards: 0, matchesPlayed: 3, overall: 87, finishedAt: daysFromNow(-30), position: 'meia', isChampion: true, isMvp: false, roundMvpCount: 1 },
  { id: 'history-mateus-2026', userId: mockUsers.atleta.id, championshipId: 'champ-finished', championshipName: 'Torneio FJU Encerrado', teamId: 'team-eagles', teamName: 'Aguias United', season: '2026', goals: 2, assists: 0, yellowCards: 0, redCards: 0, matchesPlayed: 3, overall: 82, finishedAt: daysFromNow(-30), position: 'atacante', isChampion: false, isMvp: false, roundMvpCount: 0 },
];

export const mockCareerStats: CareerStats[] = [
  { id: mockUsers.capitao.id, userId: mockUsers.capitao.id, name: mockUsers.capitao.name, lastTeamName: 'Leoes da FJU', totalGoals: 9, totalAssists: 12, totalMatches: 24, totalTitles: 2, totalMvps: 1, totalChampionships: 4, bestOverall: 88, bestSeason: '2026', bestSeasonGoals: 5, firstSeasonYear: '2024', updatedAt: daysFromNow(-30) },
  { id: mockUsers.atleta.id, userId: mockUsers.atleta.id, name: mockUsers.atleta.name, lastTeamName: 'Aguias United', totalGoals: 14, totalAssists: 4, totalMatches: 20, totalTitles: 0, totalMvps: 0, totalChampionships: 3, bestOverall: 84, bestSeason: '2026', bestSeasonGoals: 7, firstSeasonYear: '2025', updatedAt: daysFromNow(-30) },
];

export const mockAllTimeRankings: Array<AllTimeRanking & { id: string }> = [
  {
    id: 'global',
    players: [
      { userId: mockUsers.atleta.id, name: mockUsers.atleta.name, teamName: 'Aguias United', goals: 14, titles: 0, matches: 20, mvps: 0, seasons: 3 },
      { userId: mockUsers.capitao.id, name: mockUsers.capitao.name, teamName: 'Leoes da FJU', goals: 9, titles: 2, matches: 24, mvps: 1, seasons: 4 },
    ],
    teams: [
      { teamId: 'team-lions', name: 'Leoes da FJU', titles: 2, participations: 4 },
      { teamId: 'team-eagles', name: 'Aguias United', titles: 0, participations: 3 },
    ],
  },
];

export const mockCollections = {
  users: Object.values(mockUsers),
  championships: mockChampionships,
  teams: mockTeams,
  players: mockPlayers,
  matches: mockMatches,
  match_events: mockMatchEvents,
  join_requests: mockJoinRequests,
  team_invites: mockTeamInvites,
  announcements: mockAnnouncements,
  in_app_notifications: mockNotifications,
  round_votes: mockRoundVotes,
  round_awards: mockRoundAwards,
  championship_results: mockChampionshipResults,
  player_history: mockPlayerHistory,
  career_stats: mockCareerStats,
  all_time_rankings: mockAllTimeRankings,
};
