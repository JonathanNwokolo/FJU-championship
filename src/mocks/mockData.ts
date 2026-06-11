/**
 * Dataset da demo premium (P2) do modo mock.
 *
 * Simula um ecossistema FJU completo:
 *  - Copa FJU Tribo de Judá 2026 (em andamento)  → campeonato principal da demo
 *  - Torneio FJU Vila Ré (inscrições abertas)    → fluxos de entrada/atleta sem time
 *  - Copa FJU Retrospectiva 2025 (finalizado)    → histórico, season, carreira
 *  - Copa FJU Jardim Brasil (inscrições já encerradas via registrationsClosed)
 *
 * Regras de coerência que os testes (mockData.test.ts) verificam:
 *  - placar de cada partida finalizada/ao vivo bate com os eventos de gol;
 *  - approvedPlayersCount de cada time bate com o elenco ativo real;
 *  - sem_time/removido mantêm teamId antigo mas ficam fora do elenco ativo;
 *  - votos nunca vão para jogador do próprio time do votante.
 */
import {
  Achievement,
  AllTimeRanking,
  Announcement,
  AppUser,
  CareerStats,
  Championship,
  ChampionshipResultData,
  ChampionshipRules,
  InAppNotification,
  JoinRequest,
  MatchEvent,
  MatchEventType,
  MatchModel,
  MatchStatus,
  Player,
  PlayerHistoryEntry,
  PlayerPosition,
  RoundAward,
  RoundVote,
  Team,
  TeamInvite,
  UserRole,
} from '../types';

const now = new Date('2026-06-10T12:00:00.000Z');
const daysFromNow = (days: number, hours = 0) =>
  new Date(now.getTime() + days * 24 * 60 * 60 * 1000 + hours * 60 * 60 * 1000).toISOString();

const CHAMP_2026 = 'champ-copa-2026';
const CHAMP_OPEN = 'champ-vila-re';
const CHAMP_RETRO = 'champ-retro-2025';
const CHAMP_CLOSED = 'champ-jd-brasil';

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

function makeUser(id: string, name: string, role: UserRole, teamId?: string | null): AppUser {
  return {
    id,
    name,
    email: `${id.replace(/^(mock-)?user-/, '').replace(/[^a-z0-9]+/gi, '.')}@mock.fju`,
    role,
    photoUrl: `https://placehold.co/160x160/0D1B2A/F5A623?text=${initials(name)}`,
    ...(teamId !== undefined ? { teamId } : {}),
  };
}

function makePlayer(
  id: string,
  championshipId: string,
  teamId: string,
  name: string,
  position: PlayerPosition,
  number: number,
  userId?: string,
  extra: Partial<Player> = {},
): Player {
  return {
    id,
    championshipId,
    teamId,
    name,
    position,
    number,
    ...(userId ? { userId } : {}),
    status: 'ativo',
    joinedAt: championshipId === CHAMP_RETRO ? daysFromNow(-260) : daysFromNow(-38),
    photoUrl: `https://placehold.co/160x160/1B2838/FFFFFF?text=${initials(name)}`,
    ...extra,
  };
}

function makeMatch(
  id: string,
  championshipId: string,
  round: number,
  homeTeamId: string,
  awayTeamId: string,
  status: MatchStatus,
  scheduledAt: string,
  homeScore: number | null = null,
  awayScore: number | null = null,
  extra: Partial<MatchModel> = {},
): MatchModel {
  return {
    id,
    championshipId,
    round,
    homeTeamId,
    awayTeamId,
    homeScore,
    awayScore,
    status,
    scheduledAt,
    location: championshipId === CHAMP_RETRO ? 'Quadra FJU Central' : 'Arena Tribo de Judá',
    ...(status === 'finalizado' ? { finishedAt: scheduledAt } : {}),
    ...extra,
  };
}

// ── Usuários logáveis da demo (troque em src/config/appConfig.ts) ─────────────

export const mockUsers = {
  organizador: makeUser('mock-user-organizador', 'Rafael Monteiro', 'organizador'),
  capitao: makeUser('mock-user-capitao', 'Lucas Ferreira', 'capitao', 'team-leoes'),
  atleta: makeUser('mock-user-atleta', 'Mateus Cardoso', 'atleta', 'team-aguias'),
  atleta_sem_time: makeUser('mock-user-sem-time', 'Pedro Henrique Silva', 'atleta', null),
} satisfies Record<string, AppUser>;

// Demais usuários do ecossistema (capitães dos outros times + atletas)
export const mockExtraUsers: AppUser[] = [
  // Capitães
  makeUser('user-jonas', 'Jonas Ribeiro', 'capitao', 'team-aguias'),
  makeUser('user-igor', 'Igor Santana', 'capitao', 'team-guerreiros'),
  makeUser('user-nicolas', 'Nicolas Reis', 'capitao', 'team-alianca'),
  makeUser('user-marcos-vila', 'Marcos Paulo Andrade', 'capitao', 'team-monte-siao'),
  makeUser('user-renato', 'Renato Borges', 'capitao', 'team-renovacao'),
  makeUser('user-jair', 'Jair Bezerra', 'capitao', 'team-pendente-fju'),
  // Atletas — Leões da Fé
  makeUser('user-andre', 'André Rocha', 'atleta', 'team-leoes'),
  makeUser('user-thiago', 'Thiago Almeida', 'atleta', 'team-leoes'),
  makeUser('user-samuel', 'Samuel Costa', 'atleta', 'team-leoes'),
  makeUser('user-davi', 'Davi Oliveira', 'atleta', 'team-leoes'),
  makeUser('user-caleb', 'Caleb Martins', 'atleta', 'team-leoes'),
  makeUser('user-bruno', 'Bruno Lima', 'atleta', 'team-leoes'),
  makeUser('user-carlos', 'Carlos Nunes', 'atleta', 'team-leoes'),
  makeUser('user-vinicius', 'Vinícius Prado', 'atleta', null),
  makeUser('user-marcos-hist', 'Marcos Teixeira', 'atleta', null),
  // Atletas — Águias de Judá
  makeUser('user-elias', 'Elias Mendes', 'atleta', 'team-aguias'),
  makeUser('user-daniel', 'Daniel Souza', 'atleta', 'team-aguias'),
  makeUser('user-felipe', 'Felipe Dias', 'atleta', 'team-aguias'),
  makeUser('user-gabriel', 'Gabriel Pires', 'atleta', 'team-aguias'),
  // Atletas — Guerreiros da Vila
  makeUser('user-joao', 'João Vitor Ramos', 'atleta', 'team-guerreiros'),
  makeUser('user-ruan', 'Ruan Melo', 'atleta', 'team-guerreiros'),
  makeUser('user-alex', 'Alex Barbosa', 'atleta', 'team-guerreiros'),
  makeUser('user-henrique', 'Henrique Lopes', 'atleta', 'team-guerreiros'),
  makeUser('user-otavio', 'Otávio Nascimento', 'atleta', 'team-guerreiros'),
  // Atletas — Aliança FC
  makeUser('user-vitor', 'Vitor Hugo Alves', 'atleta', 'team-alianca'),
  makeUser('user-leo', 'Léo Camargo', 'atleta', 'team-alianca'),
  makeUser('user-estevao', 'Estêvão Brito', 'atleta', 'team-alianca'),
  makeUser('user-renan', 'Renan Farias', 'atleta', 'team-alianca'),
  makeUser('user-wesley', 'Wesley Dutra', 'atleta', 'team-alianca'),
  // Atletas — Torneio Vila Ré
  makeUser('user-rafinha', 'Rafinha Gomes', 'atleta', 'team-monte-siao'),
  makeUser('user-edson', 'Edson Luz', 'atleta', 'team-monte-siao'),
  makeUser('user-tales', 'Tales Moreira', 'atleta', 'team-monte-siao'),
  makeUser('user-kaua', 'Kauã Lima', 'atleta', 'team-renovacao'),
  makeUser('user-yuri', 'Yuri Tavares', 'atleta', 'team-renovacao'),
  makeUser('user-breno', 'Breno Sales', 'atleta', 'team-renovacao'),
  makeUser('user-marcio', 'Márcio Vieira', 'atleta', 'team-renovacao'),
  makeUser('user-ezequiel', 'Ezequiel Ramos', 'atleta', 'team-renovacao'),
  makeUser('user-saulo', 'Saulo Pinto', 'atleta', 'team-renovacao'),
  makeUser('user-heitor', 'Heitor Campos', 'atleta', 'team-renovacao'),
  // Atletas avulsos (pedidos/fila de espera)
  makeUser('user-tiago', 'Tiago Esperança', 'atleta', null),
  makeUser('user-cesar', 'César Aprovado', 'atleta', 'team-aguias'),
  makeUser('user-douglas', 'Douglas Pena', 'atleta', null),
];

// ── Campeonatos ───────────────────────────────────────────────────────────────

const baseRules: ChampionshipRules = {
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  tiebreakers: ['points', 'goalDifference', 'goalsFor'],
  fairPlay: true,
  roundAwards: true,
  craqueDaRodada: true,
  yellowCardLimit: 2,
  redCardSuspend: true,
  manualApproval: true,
};

export const mockChampionships: Championship[] = [
  {
    id: CHAMP_2026,
    name: 'Copa FJU Tribo de Judá 2026',
    format: 'pontos_corridos',
    status: 'em_andamento',
    currentRound: 3,
    totalRounds: 6,
    organizerId: mockUsers.organizador.id,
    inviteCode: 'JUDA26',
    createdAt: daysFromNow(-45),
    registrationDeadline: daysFromNow(-20),
    fixturesGenerated: true,
    drawCompletedAt: daysFromNow(-18),
    season: '2026',
    edition: 2,
    isOfficial: true,
    maxTeams: 8,
    liveMode: true,
    registrationSettings: { approvalRequired: true },
    rules: baseRules,
  },
  {
    id: CHAMP_OPEN,
    name: 'Torneio FJU Vila Ré',
    format: 'pontos_corridos',
    status: 'inscricoes_abertas',
    currentRound: 0,
    totalRounds: 3,
    organizerId: mockUsers.organizador.id,
    inviteCode: 'VILARE',
    createdAt: daysFromNow(-10),
    registrationDeadline: daysFromNow(12),
    fixturesGenerated: false,
    season: '2026',
    edition: 1,
    maxTeams: 6,
    registrationSettings: { approvalRequired: true },
    rules: { ...baseRules, yellowCardLimit: 3 },
  },
  {
    id: CHAMP_RETRO,
    name: 'Copa FJU Retrospectiva 2025',
    format: 'pontos_corridos',
    status: 'finalizado',
    currentRound: 3,
    totalRounds: 3,
    organizerId: mockUsers.organizador.id,
    inviteCode: 'RETRO5',
    createdAt: daysFromNow(-280),
    finishedAt: daysFromNow(-200),
    fixturesGenerated: true,
    season: '2025',
    edition: 1,
    isOfficial: true,
    rules: { ...baseRules, yellowCardLimit: 3 },
  },
  {
    // Caso extremo: inscrições encerradas manualmente antes do prazo.
    id: CHAMP_CLOSED,
    name: 'Copa FJU Jardim Brasil',
    format: 'mata_mata',
    status: 'inscricoes_abertas',
    registrationsClosed: true,
    currentRound: 0,
    totalRounds: 2,
    organizerId: mockUsers.organizador.id,
    inviteCode: 'JDBR26',
    createdAt: daysFromNow(-6),
    registrationDeadline: daysFromNow(20),
    fixturesGenerated: false,
    season: '2026',
    rules: { ...baseRules, yellowCardLimit: 3 },
  },
];

// ── Times ─────────────────────────────────────────────────────────────────────

export const mockTeams: Team[] = [
  // Copa FJU Tribo de Judá 2026
  {
    id: 'team-leoes',
    championshipId: CHAMP_2026,
    name: 'Leões da Fé',
    primaryColor: '#F5A623',
    secondaryColor: '#0D1B2A',
    captainId: mockUsers.capitao.id,
    status: 'aprovado',
    inviteCode: 'LEOES1',
    inviteLink: 'https://fjuchampionship.app/join/LEOES1',
    logoPreset: 'lion_01',
    maxPlayers: 10,
    registrationOpen: true,
    approvedPlayersCount: 8, // 6 ativos + 1 suspenso + 1 lesionado (com vaga)
    pendingRequests: [mockUsers.atleta_sem_time.id],
    createdAt: daysFromNow(-40),
  },
  {
    id: 'team-aguias',
    championshipId: CHAMP_2026,
    name: 'Águias de Judá',
    primaryColor: '#38BDF8',
    secondaryColor: '#0F172A',
    captainId: 'user-jonas',
    status: 'aprovado',
    inviteCode: 'AGUIA2',
    logoPreset: 'eagle_01',
    maxPlayers: 8,
    registrationOpen: true,
    approvedPlayersCount: 6,
    createdAt: daysFromNow(-40),
  },
  {
    id: 'team-guerreiros',
    championshipId: CHAMP_2026,
    name: 'Guerreiros da Vila',
    primaryColor: '#22C55E',
    secondaryColor: '#052E16',
    captainId: 'user-igor',
    status: 'aprovado',
    inviteCode: 'GUERR3',
    logoPreset: 'sword_01',
    maxPlayers: 8,
    registrationOpen: true,
    approvedPlayersCount: 6, // 5 ativos + 1 suspenso
    createdAt: daysFromNow(-39),
  },
  {
    id: 'team-alianca',
    championshipId: CHAMP_2026,
    name: 'Aliança FC',
    primaryColor: '#A78BFA',
    secondaryColor: '#1E1B4B',
    captainId: 'user-nicolas',
    status: 'aprovado',
    inviteCode: 'ALIAN4',
    logoPreset: 'cross_01',
    maxPlayers: 8,
    registrationOpen: true,
    approvedPlayersCount: 7, // 6 ativos (1 convidado) + 1 lesionado
    createdAt: daysFromNow(-39),
  },
  // Torneio FJU Vila Ré (inscrições abertas)
  {
    id: 'team-monte-siao',
    championshipId: CHAMP_OPEN,
    name: 'Monte Sião FC',
    primaryColor: '#FB7185',
    secondaryColor: '#4C0519',
    captainId: 'user-marcos-vila',
    status: 'aprovado',
    inviteCode: 'MSIAO5',
    logoPreset: 'star_01',
    maxPlayers: 10,
    registrationOpen: true,
    approvedPlayersCount: 4, // tem vaga
    createdAt: daysFromNow(-8),
  },
  {
    id: 'team-renovacao',
    championshipId: CHAMP_OPEN,
    name: 'Renovação United',
    primaryColor: '#F97316',
    secondaryColor: '#431407',
    captainId: 'user-renato',
    status: 'aprovado',
    inviteCode: 'RENOV6',
    logoPreset: 'fire_01',
    maxPlayers: 8,
    registrationOpen: true,
    approvedPlayersCount: 8, // CHEIO → alimenta fila de espera
    createdAt: daysFromNow(-7),
  },
  {
    id: 'team-pendente-fju',
    championshipId: CHAMP_OPEN,
    name: 'Time Pendente FJU',
    primaryColor: '#94A3B8',
    secondaryColor: '#1E293B',
    captainId: 'user-jair',
    status: 'pendente',
    inviteCode: 'PENDE7',
    logoPreset: 'shield_01',
    maxPlayers: 8,
    registrationOpen: true,
    approvedPlayersCount: 1,
    createdAt: daysFromNow(-2),
  },
  // Copa FJU Retrospectiva 2025 (histórico)
  {
    id: 'team-retro-leoes',
    championshipId: CHAMP_RETRO,
    name: 'Leões da Fé',
    primaryColor: '#F5A623',
    secondaryColor: '#0D1B2A',
    captainId: mockUsers.capitao.id,
    status: 'aprovado',
    inviteCode: 'RLEOES',
    logoPreset: 'lion_01',
    maxPlayers: 10,
    approvedPlayersCount: 4,
    createdAt: daysFromNow(-270),
  },
  {
    id: 'team-retro-aguias',
    championshipId: CHAMP_RETRO,
    name: 'Águias de Judá',
    primaryColor: '#38BDF8',
    secondaryColor: '#0F172A',
    captainId: 'user-jonas',
    status: 'aprovado',
    inviteCode: 'RAGUIA',
    logoPreset: 'eagle_01',
    maxPlayers: 10,
    approvedPlayersCount: 3,
    createdAt: daysFromNow(-270),
  },
  {
    id: 'team-retro-guerreiros',
    championshipId: CHAMP_RETRO,
    name: 'Guerreiros da Vila',
    primaryColor: '#22C55E',
    secondaryColor: '#052E16',
    captainId: 'user-igor',
    status: 'aprovado',
    inviteCode: 'RGUERR',
    logoPreset: 'sword_01',
    maxPlayers: 10,
    approvedPlayersCount: 2,
    createdAt: daysFromNow(-269),
  },
  {
    id: 'team-retro-alianca',
    championshipId: CHAMP_RETRO,
    name: 'Aliança FC',
    primaryColor: '#A78BFA',
    secondaryColor: '#1E1B4B',
    captainId: 'user-nicolas',
    status: 'aprovado',
    inviteCode: 'RALIAN',
    logoPreset: 'cross_01',
    maxPlayers: 10,
    approvedPlayersCount: 2,
    createdAt: daysFromNow(-269),
  },
];

// ── Players ───────────────────────────────────────────────────────────────────

export const mockPlayers: Player[] = [
  // Leões da Fé — 6 ativos, 1 suspenso, 1 lesionado, 1 sem_time, 1 removido
  makePlayer('p-leoes-lucas', CHAMP_2026, 'team-leoes', 'Lucas Ferreira', 'meia', 10, mockUsers.capitao.id),
  makePlayer('p-leoes-andre', CHAMP_2026, 'team-leoes', 'André Rocha', 'atacante', 9, 'user-andre'),
  makePlayer('p-leoes-thiago', CHAMP_2026, 'team-leoes', 'Thiago Almeida', 'zagueiro', 4, 'user-thiago'),
  makePlayer('p-leoes-samuel', CHAMP_2026, 'team-leoes', 'Samuel Costa', 'goleiro', 1, 'user-samuel'),
  makePlayer('p-leoes-davi', CHAMP_2026, 'team-leoes', 'Davi Oliveira', 'lateral', 2, 'user-davi'),
  makePlayer('p-leoes-caleb', CHAMP_2026, 'team-leoes', 'Caleb Martins', 'volante', 5, 'user-caleb'),
  makePlayer('p-leoes-bruno', CHAMP_2026, 'team-leoes', 'Bruno Lima', 'zagueiro', 3, 'user-bruno', {
    status: 'suspenso', // 2 amarelos (R1 + R2) com yellowCardLimit 2 → fora da rodada 3
    yellowCards: 2,
    suspendedRound: 3,
  }),
  makePlayer('p-leoes-carlos', CHAMP_2026, 'team-leoes', 'Carlos Nunes', 'atacante', 11, 'user-carlos', {
    status: 'lesionado',
  }),
  makePlayer('p-leoes-vinicius', CHAMP_2026, 'team-leoes', 'Vinícius Prado', 'meia', 15, 'user-vinicius', {
    status: 'sem_time', // saiu após a rodada 2; gol histórico preservado nos eventos
    leftAt: daysFromNow(-5),
  }),
  makePlayer('p-leoes-marcos', CHAMP_2026, 'team-leoes', 'Marcos Teixeira', 'atacante', 20, 'user-marcos-hist', {
    status: 'removido', // removido do elenco, mas tem gol na rodada 1 (histórico)
    leftAt: daysFromNow(-10),
  }),

  // Águias de Judá — 6 ativos (capitão zagueiro, artilheiro, goleiro)
  makePlayer('p-aguias-jonas', CHAMP_2026, 'team-aguias', 'Jonas Ribeiro', 'zagueiro', 3, 'user-jonas'),
  makePlayer('p-aguias-mateus', CHAMP_2026, 'team-aguias', 'Mateus Cardoso', 'atacante', 11, mockUsers.atleta.id),
  makePlayer('p-aguias-elias', CHAMP_2026, 'team-aguias', 'Elias Mendes', 'goleiro', 1, 'user-elias'),
  makePlayer('p-aguias-daniel', CHAMP_2026, 'team-aguias', 'Daniel Souza', 'meia', 8, 'user-daniel'),
  makePlayer('p-aguias-felipe', CHAMP_2026, 'team-aguias', 'Felipe Dias', 'lateral', 6, 'user-felipe'),
  makePlayer('p-aguias-gabriel', CHAMP_2026, 'team-aguias', 'Gabriel Pires', 'volante', 5, 'user-gabriel'),

  // Guerreiros da Vila — 5 ativos (1 com amarelo acumulado), 1 suspenso por vermelho
  makePlayer('p-guer-igor', CHAMP_2026, 'team-guerreiros', 'Igor Santana', 'meia', 7, 'user-igor'),
  makePlayer('p-guer-joao', CHAMP_2026, 'team-guerreiros', 'João Vitor Ramos', 'atacante', 19, 'user-joao', {
    yellowCards: 1, // pendurado: mais um amarelo e será suspenso
  }),
  makePlayer('p-guer-ruan', CHAMP_2026, 'team-guerreiros', 'Ruan Melo', 'goleiro', 12, 'user-ruan'),
  makePlayer('p-guer-alex', CHAMP_2026, 'team-guerreiros', 'Alex Barbosa', 'zagueiro', 4, 'user-alex'),
  makePlayer('p-guer-henrique', CHAMP_2026, 'team-guerreiros', 'Henrique Lopes', 'lateral', 2, 'user-henrique'),
  makePlayer('p-guer-otavio', CHAMP_2026, 'team-guerreiros', 'Otávio Nascimento', 'volante', 5, 'user-otavio', {
    status: 'suspenso', // cartão vermelho na rodada 2 → fora da rodada 3
    suspendedRound: 3,
  }),

  // Aliança FC — 5 ativos + 1 convidado, 1 lesionado
  makePlayer('p-ali-nicolas', CHAMP_2026, 'team-alianca', 'Nicolas Reis', 'volante', 5, 'user-nicolas'),
  makePlayer('p-ali-vitor', CHAMP_2026, 'team-alianca', 'Vitor Hugo Alves', 'atacante', 17, 'user-vitor'),
  makePlayer('p-ali-leo', CHAMP_2026, 'team-alianca', 'Léo Camargo', 'goleiro', 1, 'user-leo'),
  makePlayer('p-ali-estevao', CHAMP_2026, 'team-alianca', 'Estêvão Brito', 'meia', 8, 'user-estevao'),
  makePlayer('p-ali-renan', CHAMP_2026, 'team-alianca', 'Renan Farias', 'zagueiro', 3, 'user-renan'),
  makePlayer('p-ali-wesley', CHAMP_2026, 'team-alianca', 'Wesley Dutra', 'lateral', 6, 'user-wesley', {
    status: 'lesionado',
  }),
  makePlayer('p-ali-convidado', CHAMP_2026, 'team-alianca', 'Juninho da Vila', 'atacante', 21, undefined, {
    guestPlayer: true,
    joinedAt: daysFromNow(-12),
  }),

  // Atleta sem time com teamId antigo (saiu das Águias; pedido pendente nos Leões)
  makePlayer('p-sem-time-pedro', CHAMP_2026, 'team-aguias', 'Pedro Henrique Silva', 'meia', 14, mockUsers.atleta_sem_time.id, {
    status: 'sem_time',
    leftAt: daysFromNow(-8),
  }),

  // Torneio Vila Ré — Monte Sião FC (com vaga)
  makePlayer('p-ms-marcos', CHAMP_OPEN, 'team-monte-siao', 'Marcos Paulo Andrade', 'meia', 10, 'user-marcos-vila', { joinedAt: daysFromNow(-8) }),
  makePlayer('p-ms-rafinha', CHAMP_OPEN, 'team-monte-siao', 'Rafinha Gomes', 'atacante', 7, 'user-rafinha', { joinedAt: daysFromNow(-7) }),
  makePlayer('p-ms-edson', CHAMP_OPEN, 'team-monte-siao', 'Edson Luz', 'goleiro', 1, 'user-edson', { joinedAt: daysFromNow(-7) }),
  makePlayer('p-ms-tales', CHAMP_OPEN, 'team-monte-siao', 'Tales Moreira', 'zagueiro', 4, 'user-tales', { joinedAt: daysFromNow(-6) }),

  // Torneio Vila Ré — Renovação United (cheio: 8/8)
  makePlayer('p-ren-renato', CHAMP_OPEN, 'team-renovacao', 'Renato Borges', 'meia', 10, 'user-renato', { joinedAt: daysFromNow(-7) }),
  makePlayer('p-ren-kaua', CHAMP_OPEN, 'team-renovacao', 'Kauã Lima', 'atacante', 9, 'user-kaua', { joinedAt: daysFromNow(-6) }),
  makePlayer('p-ren-yuri', CHAMP_OPEN, 'team-renovacao', 'Yuri Tavares', 'goleiro', 1, 'user-yuri', { joinedAt: daysFromNow(-6) }),
  makePlayer('p-ren-breno', CHAMP_OPEN, 'team-renovacao', 'Breno Sales', 'zagueiro', 4, 'user-breno', { joinedAt: daysFromNow(-6) }),
  makePlayer('p-ren-marcio', CHAMP_OPEN, 'team-renovacao', 'Márcio Vieira', 'lateral', 2, 'user-marcio', { joinedAt: daysFromNow(-5) }),
  makePlayer('p-ren-ezequiel', CHAMP_OPEN, 'team-renovacao', 'Ezequiel Ramos', 'volante', 5, 'user-ezequiel', { joinedAt: daysFromNow(-5) }),
  makePlayer('p-ren-saulo', CHAMP_OPEN, 'team-renovacao', 'Saulo Pinto', 'meia', 8, 'user-saulo', { joinedAt: daysFromNow(-5) }),
  makePlayer('p-ren-heitor', CHAMP_OPEN, 'team-renovacao', 'Heitor Campos', 'atacante', 11, 'user-heitor', { joinedAt: daysFromNow(-4) }),

  // Torneio Vila Ré — Time Pendente FJU
  makePlayer('p-tp-jair', CHAMP_OPEN, 'team-pendente-fju', 'Jair Bezerra', 'meia', 10, 'user-jair', { joinedAt: daysFromNow(-2) }),

  // Copa Retrospectiva 2025 — elencos históricos (mesmos userIds → carreira coerente)
  makePlayer('p-retro-lucas', CHAMP_RETRO, 'team-retro-leoes', 'Lucas Ferreira', 'meia', 10, mockUsers.capitao.id),
  makePlayer('p-retro-andre', CHAMP_RETRO, 'team-retro-leoes', 'André Rocha', 'atacante', 9, 'user-andre'),
  makePlayer('p-retro-samuel', CHAMP_RETRO, 'team-retro-leoes', 'Samuel Costa', 'goleiro', 1, 'user-samuel'),
  makePlayer('p-retro-bruno', CHAMP_RETRO, 'team-retro-leoes', 'Bruno Lima', 'zagueiro', 3, 'user-bruno'),
  makePlayer('p-retro-mateus', CHAMP_RETRO, 'team-retro-aguias', 'Mateus Cardoso', 'atacante', 11, mockUsers.atleta.id),
  makePlayer('p-retro-jonas', CHAMP_RETRO, 'team-retro-aguias', 'Jonas Ribeiro', 'zagueiro', 3, 'user-jonas'),
  makePlayer('p-retro-pedro', CHAMP_RETRO, 'team-retro-aguias', 'Pedro Henrique Silva', 'meia', 14, mockUsers.atleta_sem_time.id),
  makePlayer('p-retro-igor', CHAMP_RETRO, 'team-retro-guerreiros', 'Igor Santana', 'meia', 7, 'user-igor'),
  makePlayer('p-retro-otavio', CHAMP_RETRO, 'team-retro-guerreiros', 'Otávio Nascimento', 'volante', 5, 'user-otavio'),
  makePlayer('p-retro-nicolas', CHAMP_RETRO, 'team-retro-alianca', 'Nicolas Reis', 'volante', 5, 'user-nicolas'),
  makePlayer('p-retro-vitor', CHAMP_RETRO, 'team-retro-alianca', 'Vitor Hugo Alves', 'atacante', 17, 'user-vitor'),
];

// ── Partidas ──────────────────────────────────────────────────────────────────

export const mockMatches: MatchModel[] = [
  // Copa 2026 — Rodada 1 (finalizada): votação encerrada com craque definido
  makeMatch('m-c26-r1-1', CHAMP_2026, 1, 'team-leoes', 'team-aguias', 'finalizado', daysFromNow(-14), 3, 1, { winnerId: 'team-leoes' }),
  makeMatch('m-c26-r1-2', CHAMP_2026, 1, 'team-guerreiros', 'team-alianca', 'finalizado', daysFromNow(-14, 2), 2, 2, { winnerId: null }),
  // Rodada 2 (finalizada): votação ABERTA (sem award ainda)
  makeMatch('m-c26-r2-1', CHAMP_2026, 2, 'team-aguias', 'team-alianca', 'finalizado', daysFromNow(-7), 4, 0, { winnerId: 'team-aguias' }),
  makeMatch('m-c26-r2-2', CHAMP_2026, 2, 'team-leoes', 'team-guerreiros', 'finalizado', daysFromNow(-7, 2), 2, 2, { winnerId: null }),
  // Rodada 3 (atual): uma AO VIVO e uma agendada
  makeMatch('m-c26-r3-1', CHAMP_2026, 3, 'team-leoes', 'team-guerreiros', 'ao_vivo', daysFromNow(0, -1), 1, 0),
  makeMatch('m-c26-r3-2', CHAMP_2026, 3, 'team-aguias', 'team-alianca', 'agendado', daysFromNow(2), null, null, { location: 'Quadra Vila Ré' }),
  // Rodadas futuras (returno)
  makeMatch('m-c26-r4-1', CHAMP_2026, 4, 'team-leoes', 'team-alianca', 'agendado', daysFromNow(7)),
  makeMatch('m-c26-r4-2', CHAMP_2026, 4, 'team-aguias', 'team-guerreiros', 'agendado', daysFromNow(7, 2)),
  makeMatch('m-c26-r5-1', CHAMP_2026, 5, 'team-aguias', 'team-leoes', 'agendado', daysFromNow(14)),
  makeMatch('m-c26-r5-2', CHAMP_2026, 5, 'team-alianca', 'team-guerreiros', 'agendado', daysFromNow(14, 2)),
  makeMatch('m-c26-r6-1', CHAMP_2026, 6, 'team-guerreiros', 'team-leoes', 'agendado', daysFromNow(21)),
  makeMatch('m-c26-r6-2', CHAMP_2026, 6, 'team-alianca', 'team-aguias', 'agendado', daysFromNow(21, 2)),

  // Copa Retrospectiva 2025 — 6 partidas finalizadas (Leões campeão invicto)
  makeMatch('m-r25-r1-1', CHAMP_RETRO, 1, 'team-retro-leoes', 'team-retro-aguias', 'finalizado', daysFromNow(-214), 2, 0, { winnerId: 'team-retro-leoes' }),
  makeMatch('m-r25-r1-2', CHAMP_RETRO, 1, 'team-retro-guerreiros', 'team-retro-alianca', 'finalizado', daysFromNow(-214, 2), 0, 1, { winnerId: 'team-retro-alianca' }),
  makeMatch('m-r25-r2-1', CHAMP_RETRO, 2, 'team-retro-leoes', 'team-retro-guerreiros', 'finalizado', daysFromNow(-207), 2, 1, { winnerId: 'team-retro-leoes' }),
  makeMatch('m-r25-r2-2', CHAMP_RETRO, 2, 'team-retro-aguias', 'team-retro-alianca', 'finalizado', daysFromNow(-207, 2), 1, 0, { winnerId: 'team-retro-aguias' }),
  makeMatch('m-r25-r3-1', CHAMP_RETRO, 3, 'team-retro-leoes', 'team-retro-alianca', 'finalizado', daysFromNow(-200), 1, 1, { winnerId: null }),
  makeMatch('m-r25-r3-2', CHAMP_RETRO, 3, 'team-retro-aguias', 'team-retro-guerreiros', 'finalizado', daysFromNow(-200, 2), 1, 0, { winnerId: 'team-retro-aguias' }),
];

// ── Eventos de partida (snapshots de playerName/teamName preservados) ─────────

const playerById = new Map(mockPlayers.map((p) => [p.id, p]));
const teamById = new Map(mockTeams.map((t) => [t.id, t]));

function makeEvent(
  id: string,
  matchId: string,
  championshipId: string,
  type: MatchEventType,
  playerId: string,
  minute: number,
  createdAt: string,
): MatchEvent {
  const player = playerById.get(playerId);
  if (!player) throw new Error(`mockData: player desconhecido em evento: ${playerId}`);
  const team = teamById.get(player.teamId ?? '');
  if (!team) throw new Error(`mockData: time desconhecido em evento: ${player.teamId}`);
  return {
    id,
    matchId,
    championshipId,
    type,
    teamId: team.id,
    playerId,
    ...(player.userId ? { userId: player.userId } : {}),
    minute,
    createdAt,
    playerName: player.name,
    teamName: team.name,
  };
}

export const mockMatchEvents: MatchEvent[] = [
  // R1-1 — Leões 3 x 1 Águias (primeiro gol do campeonato: André aos 12')
  makeEvent('e-c26-001', 'm-c26-r1-1', CHAMP_2026, 'gol', 'p-leoes-andre', 12, daysFromNow(-14, 0.2)),
  makeEvent('e-c26-002', 'm-c26-r1-1', CHAMP_2026, 'assistencia', 'p-leoes-lucas', 12, daysFromNow(-14, 0.21)),
  makeEvent('e-c26-003', 'm-c26-r1-1', CHAMP_2026, 'gol', 'p-aguias-mateus', 28, daysFromNow(-14, 0.5)),
  makeEvent('e-c26-004', 'm-c26-r1-1', CHAMP_2026, 'cartao_amarelo', 'p-leoes-bruno', 44, daysFromNow(-14, 0.7)),
  makeEvent('e-c26-005', 'm-c26-r1-1', CHAMP_2026, 'gol', 'p-leoes-marcos', 51, daysFromNow(-14, 0.9)), // removido com gol histórico
  makeEvent('e-c26-006', 'm-c26-r1-1', CHAMP_2026, 'cartao_amarelo', 'p-aguias-daniel', 63, daysFromNow(-14, 1.1)),
  makeEvent('e-c26-007', 'm-c26-r1-1', CHAMP_2026, 'gol', 'p-leoes-andre', 76, daysFromNow(-14, 1.3)),
  makeEvent('e-c26-008', 'm-c26-r1-1', CHAMP_2026, 'assistencia', 'p-leoes-davi', 76, daysFromNow(-14, 1.31)),

  // R1-2 — Guerreiros 2 x 2 Aliança (gol de empate no fim)
  makeEvent('e-c26-009', 'm-c26-r1-2', CHAMP_2026, 'gol', 'p-guer-igor', 15, daysFromNow(-14, 2.3)),
  makeEvent('e-c26-010', 'm-c26-r1-2', CHAMP_2026, 'gol', 'p-guer-joao', 38, daysFromNow(-14, 2.6)),
  makeEvent('e-c26-011', 'm-c26-r1-2', CHAMP_2026, 'cartao_amarelo', 'p-guer-joao', 47, daysFromNow(-14, 2.8)),
  makeEvent('e-c26-012', 'm-c26-r1-2', CHAMP_2026, 'gol', 'p-ali-vitor', 55, daysFromNow(-14, 3.0)),
  makeEvent('e-c26-013', 'm-c26-r1-2', CHAMP_2026, 'cartao_amarelo', 'p-ali-renan', 71, daysFromNow(-14, 3.2)),
  makeEvent('e-c26-014', 'm-c26-r1-2', CHAMP_2026, 'gol', 'p-ali-nicolas', 88, daysFromNow(-14, 3.5)), // empate aos 88'
  makeEvent('e-c26-015', 'm-c26-r1-2', CHAMP_2026, 'assistencia', 'p-ali-estevao', 88, daysFromNow(-14, 3.51)),

  // R2-1 — Águias 4 x 0 Aliança (HAT-TRICK de Mateus Cardoso)
  makeEvent('e-c26-016', 'm-c26-r2-1', CHAMP_2026, 'gol', 'p-aguias-mateus', 9, daysFromNow(-7, 0.2)),
  makeEvent('e-c26-017', 'm-c26-r2-1', CHAMP_2026, 'assistencia', 'p-aguias-daniel', 9, daysFromNow(-7, 0.21)),
  makeEvent('e-c26-018', 'm-c26-r2-1', CHAMP_2026, 'gol', 'p-aguias-mateus', 33, daysFromNow(-7, 0.5)),
  makeEvent('e-c26-019', 'm-c26-r2-1', CHAMP_2026, 'assistencia', 'p-aguias-felipe', 33, daysFromNow(-7, 0.51)),
  makeEvent('e-c26-020', 'm-c26-r2-1', CHAMP_2026, 'cartao_amarelo', 'p-ali-estevao', 41, daysFromNow(-7, 0.7)),
  makeEvent('e-c26-021', 'm-c26-r2-1', CHAMP_2026, 'gol', 'p-aguias-mateus', 58, daysFromNow(-7, 1.0)), // hat-trick
  makeEvent('e-c26-022', 'm-c26-r2-1', CHAMP_2026, 'gol', 'p-aguias-gabriel', 71, daysFromNow(-7, 1.2)),

  // R2-2 — Leões 2 x 2 Guerreiros (gol de quem saiu + vermelho + 2º amarelo do Bruno)
  makeEvent('e-c26-023', 'm-c26-r2-2', CHAMP_2026, 'gol', 'p-leoes-vinicius', 21, daysFromNow(-7, 2.4)), // sem_time com gol histórico
  makeEvent('e-c26-024', 'm-c26-r2-2', CHAMP_2026, 'cartao_amarelo', 'p-leoes-bruno', 30, daysFromNow(-7, 2.6)), // 2º amarelo → suspenso R3
  makeEvent('e-c26-025', 'm-c26-r2-2', CHAMP_2026, 'gol', 'p-guer-joao', 35, daysFromNow(-7, 2.7)),
  makeEvent('e-c26-026', 'm-c26-r2-2', CHAMP_2026, 'gol', 'p-leoes-andre', 67, daysFromNow(-7, 3.1)),
  makeEvent('e-c26-027', 'm-c26-r2-2', CHAMP_2026, 'assistencia', 'p-leoes-caleb', 67, daysFromNow(-7, 3.11)),
  makeEvent('e-c26-028', 'm-c26-r2-2', CHAMP_2026, 'gol', 'p-guer-igor', 83, daysFromNow(-7, 3.4)), // empate
  makeEvent('e-c26-029', 'm-c26-r2-2', CHAMP_2026, 'cartao_vermelho', 'p-guer-otavio', 87, daysFromNow(-7, 3.5)), // expulso → suspenso R3

  // R3-1 — AO VIVO: Leões 1 x 0 Guerreiros
  makeEvent('e-c26-030', 'm-c26-r3-1', CHAMP_2026, 'gol', 'p-leoes-andre', 18, daysFromNow(0, -0.6)),
  makeEvent('e-c26-031', 'm-c26-r3-1', CHAMP_2026, 'assistencia', 'p-leoes-lucas', 18, daysFromNow(0, -0.59)),
  makeEvent('e-c26-032', 'm-c26-r3-1', CHAMP_2026, 'cartao_amarelo', 'p-guer-alex', 25, daysFromNow(0, -0.4)),

  // Retrospectiva 2025 — campanha do título (André: 5 gols, artilheiro)
  makeEvent('e-r25-001', 'm-r25-r1-1', CHAMP_RETRO, 'gol', 'p-retro-andre', 14, daysFromNow(-214, 0.3)),
  makeEvent('e-r25-002', 'm-r25-r1-1', CHAMP_RETRO, 'assistencia', 'p-retro-lucas', 14, daysFromNow(-214, 0.31)),
  makeEvent('e-r25-003', 'm-r25-r1-1', CHAMP_RETRO, 'gol', 'p-retro-andre', 61, daysFromNow(-214, 1.1)),
  makeEvent('e-r25-004', 'm-r25-r1-2', CHAMP_RETRO, 'gol', 'p-retro-vitor', 52, daysFromNow(-214, 3.0)),
  makeEvent('e-r25-005', 'm-r25-r1-2', CHAMP_RETRO, 'cartao_amarelo', 'p-retro-otavio', 70, daysFromNow(-214, 3.2)),
  makeEvent('e-r25-006', 'm-r25-r2-1', CHAMP_RETRO, 'gol', 'p-retro-andre', 22, daysFromNow(-207, 0.4)),
  makeEvent('e-r25-007', 'm-r25-r2-1', CHAMP_RETRO, 'gol', 'p-retro-igor', 49, daysFromNow(-207, 0.9)),
  makeEvent('e-r25-008', 'm-r25-r2-1', CHAMP_RETRO, 'gol', 'p-retro-andre', 77, daysFromNow(-207, 1.3)),
  makeEvent('e-r25-009', 'm-r25-r2-1', CHAMP_RETRO, 'assistencia', 'p-retro-lucas', 77, daysFromNow(-207, 1.31)),
  makeEvent('e-r25-010', 'm-r25-r2-1', CHAMP_RETRO, 'cartao_vermelho', 'p-retro-otavio', 85, daysFromNow(-207, 1.4)),
  makeEvent('e-r25-011', 'm-r25-r2-2', CHAMP_RETRO, 'gol', 'p-retro-mateus', 64, daysFromNow(-207, 3.1)),
  makeEvent('e-r25-012', 'm-r25-r2-2', CHAMP_RETRO, 'assistencia', 'p-retro-pedro', 64, daysFromNow(-207, 3.11)),
  makeEvent('e-r25-013', 'm-r25-r3-1', CHAMP_RETRO, 'gol', 'p-retro-andre', 39, daysFromNow(-200, 0.6)),
  makeEvent('e-r25-014', 'm-r25-r3-1', CHAMP_RETRO, 'gol', 'p-retro-vitor', 71, daysFromNow(-200, 1.2)),
  makeEvent('e-r25-015', 'm-r25-r3-1', CHAMP_RETRO, 'cartao_amarelo', 'p-retro-bruno', 80, daysFromNow(-200, 1.3)),
  makeEvent('e-r25-016', 'm-r25-r3-2', CHAMP_RETRO, 'gol', 'p-retro-mateus', 55, daysFromNow(-200, 3.0)),
  makeEvent('e-r25-017', 'm-r25-r3-2', CHAMP_RETRO, 'cartao_amarelo', 'p-retro-igor', 68, daysFromNow(-200, 3.1)),
];

// ── Votação e craque da rodada ────────────────────────────────────────────────

export const mockRoundVotes: RoundVote[] = [
  // Rodada 1 (encerrada): 6 votos — ninguém vota no próprio time
  { id: `${CHAMP_2026}_1_${mockUsers.capitao.id}`, championshipId: CHAMP_2026, round: 1, voterId: mockUsers.capitao.id, candidatePlayerId: 'p-aguias-mateus', createdAt: daysFromNow(-13) },
  { id: `${CHAMP_2026}_1_${mockUsers.atleta.id}`, championshipId: CHAMP_2026, round: 1, voterId: mockUsers.atleta.id, candidatePlayerId: 'p-leoes-andre', createdAt: daysFromNow(-13, 1) },
  { id: `${CHAMP_2026}_1_user-jonas`, championshipId: CHAMP_2026, round: 1, voterId: 'user-jonas', candidatePlayerId: 'p-leoes-andre', createdAt: daysFromNow(-13, 2) },
  { id: `${CHAMP_2026}_1_user-igor`, championshipId: CHAMP_2026, round: 1, voterId: 'user-igor', candidatePlayerId: 'p-leoes-andre', createdAt: daysFromNow(-13, 3) },
  { id: `${CHAMP_2026}_1_user-nicolas`, championshipId: CHAMP_2026, round: 1, voterId: 'user-nicolas', candidatePlayerId: 'p-leoes-andre', createdAt: daysFromNow(-13, 4) },
  { id: `${CHAMP_2026}_1_${mockUsers.atleta_sem_time.id}`, championshipId: CHAMP_2026, round: 1, voterId: mockUsers.atleta_sem_time.id, candidatePlayerId: 'p-aguias-mateus', createdAt: daysFromNow(-13, 5) },
  // Rodada 2 (ABERTA): votos parciais, nenhum dos usuários logáveis votou ainda
  { id: `${CHAMP_2026}_2_user-vitor`, championshipId: CHAMP_2026, round: 2, voterId: 'user-vitor', candidatePlayerId: 'p-aguias-mateus', createdAt: daysFromNow(-6) },
  { id: `${CHAMP_2026}_2_user-ruan`, championshipId: CHAMP_2026, round: 2, voterId: 'user-ruan', candidatePlayerId: 'p-aguias-mateus', createdAt: daysFromNow(-6, 1) },
  { id: `${CHAMP_2026}_2_user-daniel`, championshipId: CHAMP_2026, round: 2, voterId: 'user-daniel', candidatePlayerId: 'p-leoes-andre', createdAt: daysFromNow(-6, 2) },
];

export const mockRoundAwards: RoundAward[] = [
  // Copa 2026 — rodada 1 encerrada (André 4 x 2 Mateus)
  { id: 'award-c26-r1', championshipId: CHAMP_2026, round: 1, winnerPlayerId: 'p-leoes-andre', winnerName: 'André Rocha', winnerTeamId: 'team-leoes', totalVotes: 6, closedAt: daysFromNow(-12) },
  // Retrospectiva 2025 — craques históricos
  { id: 'award-r25-r1', championshipId: CHAMP_RETRO, round: 1, winnerPlayerId: 'p-retro-andre', winnerName: 'André Rocha', winnerTeamId: 'team-retro-leoes', totalVotes: 5, closedAt: daysFromNow(-212) },
  { id: 'award-r25-r3', championshipId: CHAMP_RETRO, round: 3, winnerPlayerId: 'p-retro-mateus', winnerName: 'Mateus Cardoso', winnerTeamId: 'team-retro-aguias', totalVotes: 4, closedAt: daysFromNow(-198) },
];

// ── Resultado do campeonato finalizado ────────────────────────────────────────

export const mockChampionshipResults: ChampionshipResultData[] = [
  {
    id: CHAMP_RETRO,
    championshipId: CHAMP_RETRO,
    championshipName: 'Copa FJU Retrospectiva 2025',
    season: '2025',
    format: 'pontos_corridos',
    totalTeams: 4,
    totalPlayers: 11,
    totalMatches: 6,
    totalGoals: 10,
    winnerId: 'team-retro-leoes',
    winnerName: 'Leões da Fé',
    winnerTeamColor: '#F5A623',
    runnerUpId: 'team-retro-aguias',
    runnerUpName: 'Águias de Judá',
    topScorerId: 'p-retro-andre',
    topScorerName: 'André Rocha',
    topScorerGoals: 5,
    bestDefenseId: 'team-retro-leoes',
    bestDefenseName: 'Leões da Fé',
    bestDefenseGoals: 2,
    mvpPlayerId: 'p-retro-andre',
    mvpPlayerName: 'André Rocha',
    mvpVotes: 5,
    fairPlayTeamId: 'team-retro-aguias',
    fairPlayTeamName: 'Águias de Judá',
    fairPlayCards: 0,
    finishedAt: daysFromNow(-200),
    organizerId: mockUsers.organizador.id,
  },
];

// ── Histórico de atleta (campeonato finalizado) ───────────────────────────────

function makeHistory(
  id: string,
  userId: string,
  teamId: 'team-retro-leoes' | 'team-retro-aguias' | 'team-retro-guerreiros' | 'team-retro-alianca',
  position: string,
  stats: Partial<PlayerHistoryEntry>,
): PlayerHistoryEntry {
  const team = teamById.get(teamId)!;
  return {
    id,
    userId,
    championshipId: CHAMP_RETRO,
    championshipName: 'Copa FJU Retrospectiva 2025',
    teamId,
    teamName: team.name,
    season: '2025',
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    matchesPlayed: 3,
    overall: 75,
    finishedAt: daysFromNow(-200),
    position,
    isChampion: teamId === 'team-retro-leoes',
    isMvp: false,
    roundMvpCount: 0,
    ...stats,
  };
}

export const mockPlayerHistory: PlayerHistoryEntry[] = [
  makeHistory('h-r25-lucas', mockUsers.capitao.id, 'team-retro-leoes', 'meia', { assists: 2, overall: 86 }),
  makeHistory('h-r25-andre', 'user-andre', 'team-retro-leoes', 'atacante', { goals: 5, overall: 94, isMvp: true, roundMvpCount: 1 }),
  makeHistory('h-r25-samuel', 'user-samuel', 'team-retro-leoes', 'goleiro', { overall: 84 }),
  makeHistory('h-r25-bruno', 'user-bruno', 'team-retro-leoes', 'zagueiro', { yellowCards: 2, overall: 78 }),
  makeHistory('h-r25-mateus', mockUsers.atleta.id, 'team-retro-aguias', 'atacante', { goals: 2, overall: 85, roundMvpCount: 1 }),
  makeHistory('h-r25-jonas', 'user-jonas', 'team-retro-aguias', 'zagueiro', { overall: 80 }),
  makeHistory('h-r25-pedro', mockUsers.atleta_sem_time.id, 'team-retro-aguias', 'meia', { assists: 1, overall: 76 }),
  makeHistory('h-r25-igor', 'user-igor', 'team-retro-guerreiros', 'meia', { goals: 1, overall: 77 }),
  makeHistory('h-r25-otavio', 'user-otavio', 'team-retro-guerreiros', 'volante', { yellowCards: 1, redCards: 1, matchesPlayed: 2, overall: 65 }), // saiu no meio do campeonato
  makeHistory('h-r25-nicolas', 'user-nicolas', 'team-retro-alianca', 'volante', { overall: 75 }),
  makeHistory('h-r25-vitor', 'user-vitor', 'team-retro-alianca', 'atacante', { goals: 2, overall: 81 }),
];

// ── Carreira ──────────────────────────────────────────────────────────────────

export const mockCareerStats: CareerStats[] = [
  { id: mockUsers.capitao.id, userId: mockUsers.capitao.id, name: 'Lucas Ferreira', lastTeamName: 'Leões da Fé', totalGoals: 7, totalAssists: 15, totalMatches: 28, totalTitles: 2, totalMvps: 0, totalChampionships: 5, bestOverall: 88, bestSeason: '2025', bestSeasonGoals: 3, firstSeasonYear: '2023', updatedAt: daysFromNow(-200) },
  { id: 'user-andre', userId: 'user-andre', name: 'André Rocha', lastTeamName: 'Leões da Fé', totalGoals: 31, totalAssists: 6, totalMatches: 30, totalTitles: 2, totalMvps: 1, totalChampionships: 5, bestOverall: 94, bestSeason: '2025', bestSeasonGoals: 9, firstSeasonYear: '2023', updatedAt: daysFromNow(-200) },
  { id: mockUsers.atleta.id, userId: mockUsers.atleta.id, name: 'Mateus Cardoso', lastTeamName: 'Águias de Judá', totalGoals: 18, totalAssists: 4, totalMatches: 22, totalTitles: 0, totalMvps: 0, totalChampionships: 4, bestOverall: 85, bestSeason: '2025', bestSeasonGoals: 7, firstSeasonYear: '2024', updatedAt: daysFromNow(-200) },
  { id: 'user-samuel', userId: 'user-samuel', name: 'Samuel Costa', lastTeamName: 'Leões da Fé', totalGoals: 0, totalAssists: 1, totalMatches: 26, totalTitles: 2, totalMvps: 0, totalChampionships: 4, bestOverall: 84, bestSeason: '2025', bestSeasonGoals: 0, firstSeasonYear: '2023', updatedAt: daysFromNow(-200) },
  { id: 'user-marcos-hist', userId: 'user-marcos-hist', name: 'Marcos Teixeira', lastTeamName: 'Leões da Fé', totalGoals: 11, totalAssists: 2, totalMatches: 18, totalTitles: 1, totalMvps: 0, totalChampionships: 3, bestOverall: 82, bestSeason: '2024', bestSeasonGoals: 6, firstSeasonYear: '2024', updatedAt: daysFromNow(-10) },
  { id: mockUsers.atleta_sem_time.id, userId: mockUsers.atleta_sem_time.id, name: 'Pedro Henrique Silva', lastTeamName: 'Águias de Judá', totalGoals: 3, totalAssists: 5, totalMatches: 15, totalTitles: 0, totalMvps: 0, totalChampionships: 3, bestOverall: 76, bestSeason: '2025', bestSeasonGoals: 2, firstSeasonYear: '2024', updatedAt: daysFromNow(-8) },
];

// ── Rankings gerais (um doc por categoria: scorers/titles/matches/mvps/teams) ─

const rankingPlayers = {
  andre: { userId: 'user-andre', name: 'André Rocha', teamName: 'Leões da Fé' },
  mateus: { userId: mockUsers.atleta.id, name: 'Mateus Cardoso', teamName: 'Águias de Judá' },
  lucas: { userId: mockUsers.capitao.id, name: 'Lucas Ferreira', teamName: 'Leões da Fé' },
  marcos: { userId: 'user-marcos-hist', name: 'Marcos Teixeira', teamName: 'Leões da Fé' },
  igor: { userId: 'user-igor', name: 'Igor Santana', teamName: 'Guerreiros da Vila' },
  vitor: { userId: 'user-vitor', name: 'Vitor Hugo Alves', teamName: 'Aliança FC' },
  nicolas: { userId: 'user-nicolas', name: 'Nicolas Reis', teamName: 'Aliança FC' },
  samuel: { userId: 'user-samuel', name: 'Samuel Costa', teamName: 'Leões da Fé' },
};

export const mockAllTimeRankings: Array<AllTimeRanking & { id: string }> = [
  {
    id: 'scorers',
    players: [
      { ...rankingPlayers.andre, goals: 31, seasons: 5 },
      { ...rankingPlayers.mateus, goals: 18, seasons: 4 },
      { ...rankingPlayers.marcos, goals: 11, seasons: 3 },
      { ...rankingPlayers.igor, goals: 9, seasons: 4 },
      { ...rankingPlayers.vitor, goals: 8, seasons: 3 },
      { ...rankingPlayers.lucas, goals: 7, seasons: 5 },
      { ...rankingPlayers.nicolas, goals: 5, seasons: 3 },
    ],
  },
  {
    id: 'titles',
    players: [
      { ...rankingPlayers.lucas, titles: 2, seasons: 5 },
      { ...rankingPlayers.andre, titles: 2, seasons: 5 },
      { ...rankingPlayers.samuel, titles: 2, seasons: 4 },
      { ...rankingPlayers.marcos, titles: 1, seasons: 3 },
    ],
  },
  {
    id: 'matches',
    players: [
      { ...rankingPlayers.andre, matches: 30, seasons: 5 },
      { ...rankingPlayers.lucas, matches: 28, seasons: 5 },
      { ...rankingPlayers.samuel, matches: 26, seasons: 4 },
      { ...rankingPlayers.mateus, matches: 22, seasons: 4 },
      { ...rankingPlayers.marcos, matches: 18, seasons: 3 },
    ],
  },
  {
    id: 'mvps',
    players: [
      { ...rankingPlayers.andre, mvps: 1, seasons: 5 },
      { ...rankingPlayers.mateus, mvps: 1, seasons: 4 },
      { ...rankingPlayers.igor, mvps: 1, seasons: 4 },
    ],
  },
  {
    id: 'teams',
    teams: [
      { teamId: 'team-leoes', name: 'Leões da Fé', titles: 2, participations: 5 },
      { teamId: 'team-aguias', name: 'Águias de Judá', titles: 1, participations: 5 },
      { teamId: 'team-guerreiros', name: 'Guerreiros da Vila', titles: 0, participations: 4 },
      { teamId: 'team-alianca', name: 'Aliança FC', titles: 0, participations: 3 },
      { teamId: 'team-renovacao', name: 'Renovação United', titles: 1, participations: 2 },
      { teamId: 'team-monte-siao', name: 'Monte Sião FC', titles: 0, participations: 1 },
    ],
  },
];

// ── Conquistas (players/{id}/achievements) ────────────────────────────────────

function makeAchievement(
  playerId: string,
  achievementId: string,
  championshipId: string,
  unlockedAt: string,
  matchId?: string,
  round?: number,
): Achievement & { id: string } {
  return { id: achievementId, achievementId, playerId, championshipId, unlockedAt, matchId, round };
}

export const mockAchievements: Array<Achievement & { id: string }> = [
  // Copa 2026
  makeAchievement('p-leoes-andre', 'primeiro_gol', CHAMP_2026, daysFromNow(-14, 1.5), 'm-c26-r1-1'),
  makeAchievement('p-leoes-andre', 'artilheiro_rodada', CHAMP_2026, daysFromNow(-13), undefined, 1),
  makeAchievement('p-leoes-andre', 'gol_decisivo', CHAMP_2026, daysFromNow(-14, 1.5), 'm-c26-r1-1', 1),
  makeAchievement('p-leoes-andre', 'craque_rodada', CHAMP_2026, daysFromNow(-12), undefined, 1),
  makeAchievement('p-aguias-mateus', 'hat_trick', CHAMP_2026, daysFromNow(-7, 1.5), 'm-c26-r2-1', 2),
  makeAchievement('p-aguias-mateus', 'artilheiro_rodada', CHAMP_2026, daysFromNow(-6), undefined, 2),
  makeAchievement('p-aguias-mateus', 'gol_decisivo', CHAMP_2026, daysFromNow(-7, 1.5), 'm-c26-r2-1', 2),
  makeAchievement('p-leoes-lucas', 'fair_play_rodada', CHAMP_2026, daysFromNow(-13), undefined, 1),
  makeAchievement('p-leoes-lucas', 'invicto_rodada', CHAMP_2026, daysFromNow(-13), undefined, 1),
  makeAchievement('p-aguias-elias', 'clean_sheet', CHAMP_2026, daysFromNow(-7, 1.5), 'm-c26-r2-1', 2),
  makeAchievement('p-ali-nicolas', 'fair_play_rodada', CHAMP_2026, daysFromNow(-13), undefined, 1),
  // Retrospectiva 2025
  makeAchievement('p-retro-andre', 'campeao', CHAMP_RETRO, daysFromNow(-200)),
  makeAchievement('p-retro-andre', 'artilheiro_campeonato', CHAMP_RETRO, daysFromNow(-200)),
  makeAchievement('p-retro-andre', 'cinco_gols', CHAMP_RETRO, daysFromNow(-200)),
  makeAchievement('p-retro-andre', 'craque_rodada', CHAMP_RETRO, daysFromNow(-212), undefined, 1),
  makeAchievement('p-retro-lucas', 'campeao', CHAMP_RETRO, daysFromNow(-200)),
  makeAchievement('p-retro-lucas', 'fair_play_campeonato', CHAMP_RETRO, daysFromNow(-200)),
  makeAchievement('p-retro-samuel', 'campeao', CHAMP_RETRO, daysFromNow(-200)),
  makeAchievement('p-retro-samuel', 'clean_sheet', CHAMP_RETRO, daysFromNow(-214, 1.5), 'm-r25-r1-1', 1),
  makeAchievement('p-retro-mateus', 'vice_campeao', CHAMP_RETRO, daysFromNow(-200)),
  makeAchievement('p-retro-mateus', 'craque_rodada', CHAMP_RETRO, daysFromNow(-198), undefined, 3),
  makeAchievement('p-retro-pedro', 'vice_campeao', CHAMP_RETRO, daysFromNow(-200)),
  makeAchievement('p-retro-pedro', 'fair_play_campeonato', CHAMP_RETRO, daysFromNow(-200)),
];

// ── Comunicados ───────────────────────────────────────────────────────────────

function makeAnnouncement(
  id: string,
  championshipId: string,
  title: string,
  body: string,
  targetAudience: Announcement['targetAudience'],
  priority: Announcement['priority'],
  createdAt: string,
  readBy: string[] = [],
  targetTeamId?: string,
): Announcement {
  return {
    id,
    championshipId,
    authorId: mockUsers.organizador.id,
    authorName: mockUsers.organizador.name,
    authorRole: 'organizador',
    title,
    body,
    targetAudience,
    ...(targetTeamId ? { targetTeamId } : {}),
    priority,
    createdAt,
    readBy,
  };
}

export const mockAnnouncements: Announcement[] = [
  makeAnnouncement('a-c26-reuniao', CHAMP_2026, 'Reunião antes da rodada 3', 'Todos os times devem chegar 30 minutos antes do primeiro jogo para a oração e o alinhamento da rodada.', 'todos', 'urgente', daysFromNow(0, -3)),
  makeAnnouncement('a-c26-horarios', CHAMP_2026, 'Horário dos jogos confirmado', 'Rodada 3 confirmada: Leões x Guerreiros às 19h e Águias x Aliança às 20h, na Arena Tribo de Judá.', 'todos', 'normal', daysFromNow(-1), [mockUsers.capitao.id, mockUsers.atleta.id]),
  makeAnnouncement('a-c26-uniformes', CHAMP_2026, 'Atenção aos uniformes', 'Atletas: jogo só com uniforme completo e numerado. Sem caneleira não entra em quadra.', 'atletas', 'normal', daysFromNow(-2)),
  makeAnnouncement('a-c26-capitaes', CHAMP_2026, 'Capitães: confirmar elenco', 'Capitães, confirmem a convocação da rodada 3 até sexta-feira às 18h no painel do time.', 'capitaes', 'urgente', daysFromNow(-2, 4), [mockUsers.capitao.id]),
  makeAnnouncement('a-c26-final', CHAMP_2026, 'Final da Copa FJU se aproxima', 'Faltam 4 rodadas! A final está prevista para o dia 15/07 com premiação especial para campeão, artilheiro e craque.', 'todos', 'normal', daysFromNow(-4)),
  makeAnnouncement('a-c26-leoes', CHAMP_2026, 'Aviso ao Leões da Fé', 'Leões: uniforme principal dourado obrigatório na rodada 3 (conflito de cores com os Guerreiros).', 'time_especifico', 'normal', daysFromNow(-1, 6), [], 'team-leoes'),
  makeAnnouncement('a-vila-inscricoes', CHAMP_OPEN, 'Inscrições abertas na Vila Ré', 'O Torneio FJU Vila Ré está com inscrições abertas até 22/06. Monte seu time e participe!', 'todos', 'normal', daysFromNow(-5)),
];

// ── Notificações in-app ───────────────────────────────────────────────────────

export const mockNotifications: InAppNotification[] = [
  // Capitão (Lucas)
  { id: 'n-cap-pedido', userId: mockUsers.capitao.id, type: 'join_request', title: 'Novo pedido de entrada', body: 'Pedro Henrique Silva quer entrar no Leões da Fé', data: { teamId: 'team-leoes' }, read: false, createdAt: daysFromNow(-1) },
  { id: 'n-cap-gol', userId: mockUsers.capitao.id, type: 'goal', title: 'GOL do Leões! ⚽', body: 'André Rocha abriu o placar contra os Guerreiros', data: { matchId: 'm-c26-r3-1' }, read: false, createdAt: daysFromNow(0, -0.5) },
  { id: 'n-cap-agenda', userId: mockUsers.capitao.id, type: 'match_scheduled', title: 'Partida agendada', body: 'Leões da Fé x Aliança FC marcada para a rodada 4', data: { matchId: 'm-c26-r4-1' }, read: true, createdAt: daysFromNow(-3) },
  // Organizador
  { id: 'n-org-live', userId: mockUsers.organizador.id, type: 'match_started', title: 'Partida ao vivo', body: 'Leões da Fé x Guerreiros da Vila começou na Arena Tribo de Judá', data: { matchId: 'm-c26-r3-1' }, read: false, createdAt: daysFromNow(0, -1) },
  { id: 'n-org-fim', userId: mockUsers.organizador.id, type: 'match_finished', title: 'Partida encerrada', body: 'Águias de Judá 4 x 0 Aliança FC — hat-trick de Mateus Cardoso', data: { matchId: 'm-c26-r2-1' }, read: true, createdAt: daysFromNow(-7, 2) },
  // Atleta (Mateus)
  { id: 'n-atl-gol', userId: mockUsers.atleta.id, type: 'goal', title: 'Hat-trick! 🔥', body: 'Você marcou 3 gols contra o Aliança FC', data: { matchId: 'm-c26-r2-1' }, read: true, createdAt: daysFromNow(-7, 1.5) },
  { id: 'n-atl-agenda', userId: mockUsers.atleta.id, type: 'match_scheduled', title: 'Próximo jogo', body: 'Águias de Judá x Aliança FC nesta sexta às 20h', data: { matchId: 'm-c26-r3-2' }, read: false, createdAt: daysFromNow(-1, 2) },
  // Atleta sem time (Pedro)
  { id: 'n-st-vaga', userId: mockUsers.atleta_sem_time.id, type: 'waitlist_spot_available', title: 'Vaga disponível!', body: 'Abriu uma vaga no Monte Sião FC — corra para garantir', data: { inviteCode: 'MSIAO5' }, read: false, createdAt: daysFromNow(0, -4) },
  { id: 'n-st-pendente', userId: mockUsers.atleta_sem_time.id, type: 'join_request', title: 'Pedido enviado', body: 'Seu pedido para o Leões da Fé está aguardando o capitão', data: { teamId: 'team-leoes' }, read: true, createdAt: daysFromNow(-1) },
];

// ── Convites e pedidos ────────────────────────────────────────────────────────

export const mockTeamInvites: TeamInvite[] = [
  { id: 'inv-leoes-active', teamId: 'team-leoes', teamName: 'Leões da Fé', championshipId: CHAMP_2026, inviteCode: 'LEOES1', createdBy: mockUsers.capitao.id, usedBy: null, usedAt: null, expiresAt: null, status: 'active' },
  { id: 'inv-aguias-active', teamId: 'team-aguias', teamName: 'Águias de Judá', championshipId: CHAMP_2026, inviteCode: 'AGUIA2', createdBy: 'user-jonas', usedBy: null, usedAt: null, expiresAt: null, status: 'active' },
  { id: 'inv-guer-used', teamId: 'team-guerreiros', teamName: 'Guerreiros da Vila', championshipId: CHAMP_2026, inviteCode: 'GUERR3', createdBy: 'user-igor', usedBy: 'user-henrique', usedAt: daysFromNow(-20), expiresAt: null, status: 'used' },
  { id: 'inv-ali-expired', teamId: 'team-alianca', teamName: 'Aliança FC', championshipId: CHAMP_2026, inviteCode: 'ALIAN4', createdBy: 'user-nicolas', usedBy: null, usedAt: null, expiresAt: daysFromNow(-2), status: 'expired' },
];

export const mockJoinRequests: JoinRequest[] = [
  { id: 'jr-pedro-pending', teamId: 'team-leoes', teamName: 'Leões da Fé', championshipId: CHAMP_2026, requesterId: mockUsers.atleta_sem_time.id, requesterName: mockUsers.atleta_sem_time.name, requesterPhotoUrl: mockUsers.atleta_sem_time.photoUrl ?? '', status: 'pending', type: 'request', createdAt: daysFromNow(-1), respondedAt: null },
  { id: 'jr-tiago-waitlist', teamId: 'team-renovacao', teamName: 'Renovação United', championshipId: CHAMP_OPEN, requesterId: 'user-tiago', requesterName: 'Tiago Esperança', requesterPhotoUrl: '', status: 'pending', type: 'waitlist', createdAt: daysFromNow(-2), respondedAt: null },
  { id: 'jr-cesar-approved', teamId: 'team-aguias', teamName: 'Águias de Judá', championshipId: CHAMP_2026, requesterId: 'user-cesar', requesterName: 'César Aprovado', requesterPhotoUrl: '', status: 'approved', type: 'request', createdAt: daysFromNow(-22), respondedAt: daysFromNow(-21) },
  { id: 'jr-douglas-rejected', teamId: 'team-guerreiros', teamName: 'Guerreiros da Vila', championshipId: CHAMP_2026, requesterId: 'user-douglas', requesterName: 'Douglas Pena', requesterPhotoUrl: '', status: 'rejected', type: 'request', createdAt: daysFromNow(-9), respondedAt: daysFromNow(-9, 5) },
];

// ── Convocação da rodada (teams/{id}/convocations/{round}) ────────────────────

export const mockLeoesConvocations: Array<{ id: string; playerIds: string[] }> = [
  {
    id: '3', // rodada atual — suspenso (Bruno) e lesionado (Carlos) ficam fora
    playerIds: ['p-leoes-lucas', 'p-leoes-andre', 'p-leoes-thiago', 'p-leoes-samuel', 'p-leoes-davi', 'p-leoes-caleb'],
  },
];

// ── Agregação das collections (consumida pelo mockDb) ─────────────────────────

const achievementSubcollections: Record<string, Array<Achievement & { id: string }>> = {};
for (const achievement of mockAchievements) {
  const key = `players/${achievement.playerId}/achievements`;
  (achievementSubcollections[key] ??= []).push(achievement);
}

export const mockCollections = {
  users: [...Object.values(mockUsers), ...mockExtraUsers],
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
  'teams/team-leoes/convocations': mockLeoesConvocations,
  ...achievementSubcollections,
};
