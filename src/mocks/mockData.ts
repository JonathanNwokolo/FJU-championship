// =============================================================================
// FJU Championship — Mock Data Completo
// Cobre 100% dos fluxos mapeados pelo Claude Code
// =============================================================================
// USO: import { MOCK } from './mockData'
// Depois use MOCK.users, MOCK.championships, MOCK.teams, etc.
// =============================================================================

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
const ts = (daysAgo: number, hours = 12) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hours, 0, 0, 0);
  return d.toISOString();
};

const futureTs = (daysAhead: number, hours = 16) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hours, 0, 0, 0);
  return d.toISOString();
};

const nowTs = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// 1. USERS (8 users — 1 org, 4 capitães, 1 dual, 2 atletas puros)
// ---------------------------------------------------------------------------
export const USERS = {
  // Organizador
  u_org_01: {
    id: 'u_org_01',
    name: 'Lucas Ferreira',
    email: 'lucas.org@fjuchamp.com',
    role: 'organizador' as const,
    photoUrl: null,
    teamId: null,
    createdAt: ts(90),
  },
  // Capitão puro — Time A (C2)
  u_cap_01: {
    id: 'u_cap_01',
    name: 'Rafael Souza',
    email: 'rafael@fjuchamp.com',
    role: 'capitao' as const,
    photoUrl: null,
    teamId: 't_c2_01',
    createdAt: ts(60),
  },
  // Capitão puro — Time B (C2)
  u_cap_02: {
    id: 'u_cap_02',
    name: 'Daniel Oliveira',
    email: 'daniel@fjuchamp.com',
    role: 'capitao' as const,
    photoUrl: null,
    teamId: 't_c2_02',
    createdAt: ts(58),
  },
  // Capitão puro — Time C (C2)
  u_cap_03: {
    id: 'u_cap_03',
    name: 'Mateus Silva',
    email: 'mateus@fjuchamp.com',
    role: 'capitao' as const,
    photoUrl: null,
    teamId: 't_c2_03',
    createdAt: ts(55),
  },
  // Capitão puro — Time D (C2)
  u_cap_04: {
    id: 'u_cap_04',
    name: 'Pedro Henrique',
    email: 'pedro@fjuchamp.com',
    role: 'capitao' as const,
    photoUrl: null,
    teamId: 't_c2_04',
    createdAt: ts(53),
  },
  // DUAL: atleta que é capitão (dualidade Bloco 4)
  u_dual_01: {
    id: 'u_dual_01',
    name: 'Gabriel Santos',
    email: 'gabriel@fjuchamp.com',
    role: 'atleta' as const, // role continua atleta!
    photoUrl: null,
    teamId: null, // NÃO auto-definido (regra de negócio)
    createdAt: ts(50),
  },
  // Atleta puro 1
  u_atl_01: {
    id: 'u_atl_01',
    name: 'Tiago Nascimento',
    email: 'tiago@fjuchamp.com',
    role: 'atleta' as const,
    photoUrl: null,
    teamId: 't_c2_01',
    createdAt: ts(45),
  },
  // Atleta puro 2
  u_atl_02: {
    id: 'u_atl_02',
    name: 'André Lima',
    email: 'andre@fjuchamp.com',
    role: 'atleta' as const,
    photoUrl: null,
    teamId: 't_c2_02',
    createdAt: ts(44),
  },
};

// ---------------------------------------------------------------------------
// 2. CHAMPIONSHIPS (4 — cada status diferente)
// ---------------------------------------------------------------------------
export const CHAMPIONSHIPS = {
  // C1 — Inscrições abertas, pontos corridos
  c1: {
    id: 'champ_c1',
    name: 'Copa FJU Tribo de Judá 2026',
    format: 'pontos_corridos' as const,
    status: 'inscricoes_abertas' as const,
    currentRound: 0,
    totalRounds: 0,
    organizerId: 'u_org_01',
    inviteCode: 'TRIBO2026',
    season: '2026',
    edition: '1ª Edição',
    maxTeams: 8,
    maxPlayers: 15,
    registrationsClosed: false,
    registrationDeadline: futureTs(14),
    registrationSettings: {
      approvalRequired: true,
    },
    rules: {
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      tiebreakers: ['saldo_gols', 'gols_marcados', 'confronto_direto', 'cartoes'],
      fairPlay: true,
      craqueDaRodada: true,
      yellowCardLimit: 3,
      redCardSuspend: 1,
      roundAwards: true,
    },
    matchVerse: true,
    liveMode: true,
    createdAt: ts(7),
  },
  // C2 — Em andamento, pontos corridos (CAMPEONATO PRINCIPAL)
  c2: {
    id: 'champ_c2',
    name: 'Liga FJU São Paulo 2026',
    format: 'pontos_corridos' as const,
    status: 'em_andamento' as const,
    currentRound: 4,
    totalRounds: 6, // 4 times = 6 rodadas (ida e volta)
    organizerId: 'u_org_01',
    inviteCode: 'LIGASP26',
    season: '2026',
    edition: '3ª Edição',
    maxTeams: 4,
    maxPlayers: 12,
    registrationsClosed: true,
    registrationDeadline: ts(30),
    registrationSettings: {
      approvalRequired: true,
    },
    rules: {
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      tiebreakers: ['saldo_gols', 'gols_marcados', 'confronto_direto', 'cartoes'],
      fairPlay: true,
      craqueDaRodada: true,
      yellowCardLimit: 3,
      redCardSuspend: 1,
      roundAwards: true,
    },
    matchVerse: true,
    liveMode: true,
    createdAt: ts(45),
  },
  // C3 — Em andamento, mata-mata
  c3: {
    id: 'champ_c3',
    name: 'Torneio Relâmpago FJU',
    format: 'mata_mata' as const,
    status: 'em_andamento' as const,
    currentRound: 2,
    totalRounds: 2, // semifinal + final
    organizerId: 'u_org_01',
    inviteCode: 'RELAMP26',
    season: '2026',
    edition: '1ª Edição',
    maxTeams: 4,
    maxPlayers: 10,
    registrationsClosed: true,
    registrationDeadline: ts(20),
    registrationSettings: {
      approvalRequired: false,
    },
    rules: {
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      tiebreakers: ['saldo_gols', 'gols_marcados'],
      fairPlay: false,
      craqueDaRodada: false,
      yellowCardLimit: 3,
      redCardSuspend: 1,
      roundAwards: false,
    },
    matchVerse: false,
    liveMode: true,
    createdAt: ts(25),
  },
  // C4 — Finalizado (para histórico/ranking/career)
  c4: {
    id: 'champ_c4',
    name: 'Copa FJU Intercelular 2025',
    format: 'pontos_corridos' as const,
    status: 'finalizado' as const,
    currentRound: 6,
    totalRounds: 6,
    organizerId: 'u_org_01',
    inviteCode: 'INTER25',
    season: '2025',
    edition: '2ª Edição',
    maxTeams: 4,
    maxPlayers: 12,
    registrationsClosed: true,
    registrationDeadline: ts(120),
    registrationSettings: {
      approvalRequired: true,
    },
    rules: {
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      tiebreakers: ['saldo_gols', 'gols_marcados', 'confronto_direto'],
      fairPlay: true,
      craqueDaRodada: true,
      yellowCardLimit: 3,
      redCardSuspend: 1,
      roundAwards: true,
    },
    matchVerse: true,
    liveMode: false,
    createdAt: ts(180),
  },
};

// ---------------------------------------------------------------------------
// 3. TEAMS
// ---------------------------------------------------------------------------

// --- C1: Inscrições abertas (3 aprovados, 2 pendentes, 1 rejeitado) ---
const TEAMS_C1 = [
  {
    id: 't_c1_01', championshipId: 'champ_c1', name: 'Guerreiros de Judá',
    primaryColor: '#E53935', secondaryColor: '#FFFFFF',
    captainId: 'u_cap_01', status: 'aprovado' as const,
    inviteCode: 'GJ2026', maxPlayers: 15, registrationOpen: true,
    logoPreset: 'sword_01', logoUrl: null,
    createdAt: ts(6),
  },
  {
    id: 't_c1_02', championshipId: 'champ_c1', name: 'Leões de Sião',
    primaryColor: '#FF8F00', secondaryColor: '#1A1A2E',
    captainId: 'u_cap_02', status: 'aprovado' as const,
    inviteCode: 'LS2026', maxPlayers: 15, registrationOpen: true,
    logoPreset: 'lion_01', logoUrl: null,
    createdAt: ts(6),
  },
  {
    id: 't_c1_03', championshipId: 'champ_c1', name: 'Falcões da Fé',
    primaryColor: '#1E88E5', secondaryColor: '#FFFFFF',
    captainId: 'u_cap_03', status: 'aprovado' as const,
    inviteCode: 'FF2026', maxPlayers: 15, registrationOpen: true,
    logoPreset: 'eagle_01', logoUrl: null,
    createdAt: ts(5),
  },
  {
    id: 't_c1_04', championshipId: 'champ_c1', name: 'Exército Celestial',
    primaryColor: '#7B1FA2', secondaryColor: '#E1BEE7',
    captainId: 'u_cap_04', status: 'pendente' as const,
    inviteCode: 'EC2026', maxPlayers: 15, registrationOpen: true,
    logoPreset: 'shield_01', logoUrl: null,
    createdAt: ts(4),
  },
  {
    id: 't_c1_05', championshipId: 'champ_c1', name: 'Tropa de Davi',
    primaryColor: '#00897B', secondaryColor: '#FFFFFF',
    captainId: 'u_dual_01', status: 'pendente' as const,
    inviteCode: 'TD2026', maxPlayers: 15, registrationOpen: true,
    logoPreset: 'crown_01', logoUrl: null,
    createdAt: ts(3),
  },
  {
    id: 't_c1_06', championshipId: 'champ_c1', name: 'Unidos na Graça',
    primaryColor: '#546E7A', secondaryColor: '#CFD8DC',
    captainId: 'u_atl_01', status: 'rejeitado' as const,
    inviteCode: 'UG2026', maxPlayers: 15, registrationOpen: false,
    logoPreset: 'dove_01', logoUrl: null,
    createdAt: ts(3),
  },
];

// --- C2: Em andamento (4 times aprovados — CAMPEONATO PRINCIPAL) ---
const TEAMS_C2 = [
  {
    id: 't_c2_01', championshipId: 'champ_c2', name: 'Trovões de Gileade',
    primaryColor: '#F5A623', secondaryColor: '#0D1B2A',
    captainId: 'u_cap_01', status: 'aprovado' as const,
    inviteCode: 'TG26SP', maxPlayers: 12, registrationOpen: false,
    logoPreset: 'lightning_01', logoUrl: null,
    createdAt: ts(40),
  },
  {
    id: 't_c2_02', championshipId: 'champ_c2', name: 'Arsenal da Fé',
    primaryColor: '#E53935', secondaryColor: '#FFFFFF',
    captainId: 'u_cap_02', status: 'aprovado' as const,
    inviteCode: 'AF26SP', maxPlayers: 12, registrationOpen: false,
    logoPreset: 'fire_01', logoUrl: null,
    createdAt: ts(39),
  },
  {
    id: 't_c2_03', championshipId: 'champ_c2', name: 'Escudo de Abraão',
    primaryColor: '#1565C0', secondaryColor: '#BBDEFB',
    captainId: 'u_cap_03', status: 'aprovado' as const,
    inviteCode: 'EA26SP', maxPlayers: 12, registrationOpen: false,
    logoPreset: 'shield_01', logoUrl: null,
    createdAt: ts(38),
  },
  {
    id: 't_c2_04', championshipId: 'champ_c2', name: 'Estrelas do Altíssimo',
    primaryColor: '#00C853', secondaryColor: '#1B5E20',
    captainId: 'u_dual_01', // Gabriel (atleta-capitão = dualidade!)
    status: 'aprovado' as const,
    inviteCode: 'ED26SP', maxPlayers: 12, registrationOpen: false,
    logoPreset: 'star_01', logoUrl: null,
    createdAt: ts(37),
  },
];

// --- C3: Mata-mata (4 times) ---
const TEAMS_C3 = [
  {
    id: 't_c3_01', championshipId: 'champ_c3', name: 'Raio de Judá',
    primaryColor: '#FFD600', secondaryColor: '#000000',
    captainId: 'u_cap_01', status: 'aprovado' as const,
    inviteCode: 'RJ26R', maxPlayers: 10, registrationOpen: false,
    logoPreset: 'lightning_01', logoUrl: null,
    createdAt: ts(22),
  },
  {
    id: 't_c3_02', championshipId: 'champ_c3', name: 'Chama Viva',
    primaryColor: '#FF6D00', secondaryColor: '#FFFFFF',
    captainId: 'u_cap_02', status: 'aprovado' as const,
    inviteCode: 'CV26R', maxPlayers: 10, registrationOpen: false,
    logoPreset: 'fire_01', logoUrl: null,
    createdAt: ts(22),
  },
  {
    id: 't_c3_03', championshipId: 'champ_c3', name: 'Fortaleza Eterna',
    primaryColor: '#304FFE', secondaryColor: '#C5CAE9',
    captainId: 'u_cap_03', status: 'aprovado' as const,
    inviteCode: 'FE26R', maxPlayers: 10, registrationOpen: false,
    logoPreset: 'shield_01', logoUrl: null,
    createdAt: ts(22),
  },
  {
    id: 't_c3_04', championshipId: 'champ_c3', name: 'Centurião',
    primaryColor: '#880E4F', secondaryColor: '#FCE4EC',
    captainId: 'u_cap_04', status: 'aprovado' as const,
    inviteCode: 'CE26R', maxPlayers: 10, registrationOpen: false,
    logoPreset: 'cross_01', logoUrl: null,
    createdAt: ts(22),
  },
];

// --- C4: Finalizado (4 times) ---
const TEAMS_C4 = [
  {
    id: 't_c4_01', championshipId: 'champ_c4', name: 'Trovões de Gileade',
    primaryColor: '#F5A623', secondaryColor: '#0D1B2A',
    captainId: 'u_cap_01', status: 'aprovado' as const,
    inviteCode: 'TG25', maxPlayers: 12, registrationOpen: false,
    logoPreset: 'lightning_01', logoUrl: null,
    createdAt: ts(170),
  },
  {
    id: 't_c4_02', championshipId: 'champ_c4', name: 'Arsenal da Fé',
    primaryColor: '#E53935', secondaryColor: '#FFFFFF',
    captainId: 'u_cap_02', status: 'aprovado' as const,
    inviteCode: 'AF25', maxPlayers: 12, registrationOpen: false,
    logoPreset: 'fire_01', logoUrl: null,
    createdAt: ts(170),
  },
  {
    id: 't_c4_03', championshipId: 'champ_c4', name: 'Escudo de Abraão',
    primaryColor: '#1565C0', secondaryColor: '#BBDEFB',
    captainId: 'u_cap_03', status: 'aprovado' as const,
    inviteCode: 'EA25', maxPlayers: 12, registrationOpen: false,
    logoPreset: 'shield_01', logoUrl: null,
    createdAt: ts(170),
  },
  {
    id: 't_c4_04', championshipId: 'champ_c4', name: 'Estrelas do Altíssimo',
    primaryColor: '#00C853', secondaryColor: '#1B5E20',
    captainId: 'u_dual_01', status: 'aprovado' as const,
    inviteCode: 'ED25', maxPlayers: 12, registrationOpen: false,
    logoPreset: 'star_01', logoUrl: null,
    createdAt: ts(170),
  },
];

export const TEAMS = [...TEAMS_C1, ...TEAMS_C2, ...TEAMS_C3, ...TEAMS_C4];

// ---------------------------------------------------------------------------
// 4. PLAYERS (8-10 por time C2, variados nos outros)
// ---------------------------------------------------------------------------
type Position = 'goleiro' | 'zagueiro' | 'lateral' | 'volante' | 'meia' | 'atacante';
type PlayerStatus = 'ativo' | 'suspenso' | 'lesionado';

interface MockPlayer {
  id: string;
  teamId: string;
  championshipId: string;
  name: string;
  position: Position;
  number: number;
  userId: string | null;
  photoUrl: string | null;
  status: PlayerStatus;
  suspendedRound?: number;
  yellowCards?: number;
  guestPlayer?: boolean;
  createdAt: string;
}

// Helper pra gerar players
const mkPlayer = (
  id: string, teamId: string, champId: string, name: string,
  pos: Position, num: number, userId: string | null,
  opts: Partial<MockPlayer> = {}
): MockPlayer => ({
  id, teamId, championshipId: champId, name, position: pos, number: num,
  userId, photoUrl: null, status: 'ativo', guestPlayer: false,
  createdAt: ts(35), ...opts,
});

// ---- PLAYERS C2 (campeonato principal) ----
const PLAYERS_C2: MockPlayer[] = [
  // Time 1: Trovões de Gileade (t_c2_01, cap: u_cap_01)
  mkPlayer('p_c2_01', 't_c2_01', 'champ_c2', 'Marcos Vinícius', 'goleiro', 1, null),
  mkPlayer('p_c2_02', 't_c2_01', 'champ_c2', 'Tiago Nascimento', 'zagueiro', 3, 'u_atl_01'),
  mkPlayer('p_c2_03', 't_c2_01', 'champ_c2', 'Bruno Almeida', 'zagueiro', 4, null),
  mkPlayer('p_c2_04', 't_c2_01', 'champ_c2', 'Wesley Costa', 'lateral', 2, null),
  mkPlayer('p_c2_05', 't_c2_01', 'champ_c2', 'Felipe Araújo', 'volante', 5, null),
  mkPlayer('p_c2_06', 't_c2_01', 'champ_c2', 'Josué Ribeiro', 'meia', 8, null),
  mkPlayer('p_c2_07', 't_c2_01', 'champ_c2', 'Davi Moreira', 'meia', 10, null),
  mkPlayer('p_c2_08', 't_c2_01', 'champ_c2', 'Samuel Torres', 'atacante', 9, null),
  mkPlayer('p_c2_09', 't_c2_01', 'champ_c2', 'Elias Martins', 'atacante', 11, null),
  mkPlayer('p_c2_10', 't_c2_01', 'champ_c2', 'Calebe Nunes', 'lateral', 6, null),

  // Time 2: Arsenal da Fé (t_c2_02, cap: u_cap_02)
  mkPlayer('p_c2_11', 't_c2_02', 'champ_c2', 'Jonathan Reis', 'goleiro', 1, null),
  mkPlayer('p_c2_12', 't_c2_02', 'champ_c2', 'André Lima', 'zagueiro', 3, 'u_atl_02'),
  mkPlayer('p_c2_13', 't_c2_02', 'champ_c2', 'Igor Batista', 'zagueiro', 4, null),
  mkPlayer('p_c2_14', 't_c2_02', 'champ_c2', 'Lucas Rocha', 'lateral', 2, null),
  mkPlayer('p_c2_15', 't_c2_02', 'champ_c2', 'Matheus Pinto', 'volante', 5, null),
  mkPlayer('p_c2_16', 't_c2_02', 'champ_c2', 'Guilherme Dias', 'meia', 8, null),
  mkPlayer('p_c2_17', 't_c2_02', 'champ_c2', 'Isaque Ferreira', 'meia', 10, null),
  mkPlayer('p_c2_18', 't_c2_02', 'champ_c2', 'Noah Cardoso', 'atacante', 9, null), // ARTILHEIRO
  mkPlayer('p_c2_19', 't_c2_02', 'champ_c2', 'Enzo Oliveira', 'atacante', 11, null),
  mkPlayer('p_c2_20', 't_c2_02', 'champ_c2', 'Levi Correia', 'lateral', 6, null),

  // Time 3: Escudo de Abraão (t_c2_03, cap: u_cap_03)
  mkPlayer('p_c2_21', 't_c2_03', 'champ_c2', 'Henrique Lopes', 'goleiro', 1, null),
  mkPlayer('p_c2_22', 't_c2_03', 'champ_c2', 'Vitor Hugo', 'zagueiro', 3, null),
  mkPlayer('p_c2_23', 't_c2_03', 'champ_c2', 'Thiago Santos', 'zagueiro', 4, null),
  mkPlayer('p_c2_24', 't_c2_03', 'champ_c2', 'Jean Carlos', 'lateral', 2, null),
  mkPlayer('p_c2_25', 't_c2_03', 'champ_c2', 'Ricardo Mendes', 'volante', 5, null),
  mkPlayer('p_c2_26', 't_c2_03', 'champ_c2', 'Bernardo Azevedo', 'meia', 8, null),
  mkPlayer('p_c2_27', 't_c2_03', 'champ_c2', 'Caio César', 'meia', 10, null),
  mkPlayer('p_c2_28', 't_c2_03', 'champ_c2', 'Paulo Gustavo', 'atacante', 9, null),
  // SUSPENSO: 3 amarelos acumulados
  mkPlayer('p_c2_29', 't_c2_03', 'champ_c2', 'Arthur Vieira', 'atacante', 11, null,
    { status: 'suspenso', suspendedRound: 4, yellowCards: 3 }),
  mkPlayer('p_c2_30', 't_c2_03', 'champ_c2', 'Emanuel Silva', 'volante', 6, null),

  // Time 4: Estrelas do Altíssimo (t_c2_04, cap: u_dual_01 = atleta-capitão)
  mkPlayer('p_c2_31', 't_c2_04', 'champ_c2', 'Diego Ramos', 'goleiro', 1, null),
  mkPlayer('p_c2_32', 't_c2_04', 'champ_c2', 'Gabriel Santos', 'zagueiro', 3, 'u_dual_01'), // o próprio capitão joga!
  mkPlayer('p_c2_33', 't_c2_04', 'champ_c2', 'Murilo Freitas', 'zagueiro', 4, null),
  mkPlayer('p_c2_34', 't_c2_04', 'champ_c2', 'Yuri Andrade', 'lateral', 2, null),
  mkPlayer('p_c2_35', 't_c2_04', 'champ_c2', 'Cauã Bezerra', 'volante', 5, null),
  mkPlayer('p_c2_36', 't_c2_04', 'champ_c2', 'Nathan Pereira', 'meia', 8, null),
  mkPlayer('p_c2_37', 't_c2_04', 'champ_c2', 'Ravi Monteiro', 'meia', 10, null),
  mkPlayer('p_c2_38', 't_c2_04', 'champ_c2', 'Théo Barbosa', 'atacante', 9, null), // ARTILHEIRO empatado
  mkPlayer('p_c2_39', 't_c2_04', 'champ_c2', 'Miguel Cruz', 'atacante', 11, null),
  // LESIONADO
  mkPlayer('p_c2_40', 't_c2_04', 'champ_c2', 'Gael Teixeira', 'lateral', 6, null,
    { status: 'lesionado' }),
];

// Players simplificados para C3 e C4 (5 por time, menos detalhe)
const mkSimplePlayers = (champId: string, teamId: string, prefix: string, startIdx: number): MockPlayer[] => [
  mkPlayer(`${prefix}_01`, teamId, champId, 'Goleiro ' + teamId.slice(-2), 'goleiro', 1, null, { createdAt: ts(startIdx) }),
  mkPlayer(`${prefix}_02`, teamId, champId, 'Zagueiro ' + teamId.slice(-2), 'zagueiro', 3, null, { createdAt: ts(startIdx) }),
  mkPlayer(`${prefix}_03`, teamId, champId, 'Meia ' + teamId.slice(-2), 'meia', 10, null, { createdAt: ts(startIdx) }),
  mkPlayer(`${prefix}_04`, teamId, champId, 'Atacante A ' + teamId.slice(-2), 'atacante', 9, null, { createdAt: ts(startIdx) }),
  mkPlayer(`${prefix}_05`, teamId, champId, 'Atacante B ' + teamId.slice(-2), 'atacante', 11, null, { createdAt: ts(startIdx) }),
];

const PLAYERS_C3: MockPlayer[] = [
  ...mkSimplePlayers('champ_c3', 't_c3_01', 'p_c3_t1', 20),
  ...mkSimplePlayers('champ_c3', 't_c3_02', 'p_c3_t2', 20),
  ...mkSimplePlayers('champ_c3', 't_c3_03', 'p_c3_t3', 20),
  ...mkSimplePlayers('champ_c3', 't_c3_04', 'p_c3_t4', 20),
];

const PLAYERS_C4: MockPlayer[] = [
  ...mkSimplePlayers('champ_c4', 't_c4_01', 'p_c4_t1', 160),
  ...mkSimplePlayers('champ_c4', 't_c4_02', 'p_c4_t2', 160),
  ...mkSimplePlayers('champ_c4', 't_c4_03', 'p_c4_t3', 160),
  ...mkSimplePlayers('champ_c4', 't_c4_04', 'p_c4_t4', 160),
];

export const PLAYERS = [...PLAYERS_C2, ...PLAYERS_C3, ...PLAYERS_C4];

// ---------------------------------------------------------------------------
// 5. MATCHES C2 — Pontos Corridos (4 times = 6 rodadas ida/volta)
// ---------------------------------------------------------------------------
// Round-robin 4 times: AB+CD, AC+BD, AD+BC (ida) + volta = 6 rodadas
// Rodadas 1-3: finalizadas. Rodada 4: 1 ao_vivo + 1 agendada. Rodadas 5-6: agendadas.

type MatchStatus = 'agendado' | 'ao_vivo' | 'finalizado';

interface MockMatch {
  id: string;
  championshipId: string;
  round: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
  scheduledAt: string | null;
  finishedAt: string | null;
  location: string | null;
  // mata-mata extras
  bracketRound?: number;
  bracketPosition?: number;
  nextMatchId?: string;
  winnerId?: string;
  homePenaltyScore?: number;
  awayPenaltyScore?: number;
}

const T1 = 't_c2_01', T2 = 't_c2_02', T3 = 't_c2_03', T4 = 't_c2_04';

export const MATCHES_C2: MockMatch[] = [
  // --- RODADA 1 (finalizada, 21 dias atrás) ---
  { id: 'm_c2_r1_1', championshipId: 'champ_c2', round: 1,
    homeTeamId: T1, awayTeamId: T2, homeScore: 2, awayScore: 1,
    status: 'finalizado', scheduledAt: ts(21, 10), finishedAt: ts(21, 12), location: 'Campo FJU Zona Norte' },
  { id: 'm_c2_r1_2', championshipId: 'champ_c2', round: 1,
    homeTeamId: T3, awayTeamId: T4, homeScore: 0, awayScore: 0,
    status: 'finalizado', scheduledAt: ts(21, 14), finishedAt: ts(21, 16), location: 'Campo FJU Zona Norte' },

  // --- RODADA 2 (finalizada, 14 dias atrás) ---
  { id: 'm_c2_r2_1', championshipId: 'champ_c2', round: 2,
    homeTeamId: T1, awayTeamId: T3, homeScore: 1, awayScore: 1,
    status: 'finalizado', scheduledAt: ts(14, 10), finishedAt: ts(14, 12), location: 'Campo FJU Centro' },
  { id: 'm_c2_r2_2', championshipId: 'champ_c2', round: 2,
    homeTeamId: T2, awayTeamId: T4, homeScore: 3, awayScore: 2,
    status: 'finalizado', scheduledAt: ts(14, 14), finishedAt: ts(14, 16), location: 'Campo FJU Centro' },

  // --- RODADA 3 (finalizada, 7 dias atrás) ---
  { id: 'm_c2_r3_1', championshipId: 'champ_c2', round: 3,
    homeTeamId: T1, awayTeamId: T4, homeScore: 4, awayScore: 1,
    status: 'finalizado', scheduledAt: ts(7, 10), finishedAt: ts(7, 12), location: 'Campo FJU Zona Sul' },
  { id: 'm_c2_r3_2', championshipId: 'champ_c2', round: 3,
    homeTeamId: T2, awayTeamId: T3, homeScore: 0, awayScore: 2,
    status: 'finalizado', scheduledAt: ts(7, 14), finishedAt: ts(7, 16), location: 'Campo FJU Zona Sul' },

  // --- RODADA 4 (atual: 1 AO VIVO + 1 agendada HOJE) ---
  { id: 'm_c2_r4_1', championshipId: 'champ_c2', round: 4,
    homeTeamId: T2, awayTeamId: T1, homeScore: 1, awayScore: 2,
    status: 'ao_vivo', scheduledAt: nowTs(), finishedAt: null, location: 'Campo FJU Zona Norte' },
  { id: 'm_c2_r4_2', championshipId: 'champ_c2', round: 4,
    homeTeamId: T4, awayTeamId: T3, homeScore: 0, awayScore: 0,
    status: 'agendado', scheduledAt: futureTs(0, 18), finishedAt: null, location: 'Campo FJU Zona Norte' },

  // --- RODADA 5 (agendada amanhã) ---
  { id: 'm_c2_r5_1', championshipId: 'champ_c2', round: 5,
    homeTeamId: T3, awayTeamId: T1, homeScore: 0, awayScore: 0,
    status: 'agendado', scheduledAt: futureTs(1, 10), finishedAt: null, location: 'Campo FJU Centro' },
  { id: 'm_c2_r5_2', championshipId: 'champ_c2', round: 5,
    homeTeamId: T4, awayTeamId: T2, homeScore: 0, awayScore: 0,
    status: 'agendado', scheduledAt: futureTs(1, 14), finishedAt: null, location: 'Campo FJU Centro' },

  // --- RODADA 6 (agendada, data indefinida) ---
  { id: 'm_c2_r6_1', championshipId: 'champ_c2', round: 6,
    homeTeamId: T4, awayTeamId: T1, homeScore: 0, awayScore: 0,
    status: 'agendado', scheduledAt: null, finishedAt: null, location: null },
  { id: 'm_c2_r6_2', championshipId: 'champ_c2', round: 6,
    homeTeamId: T3, awayTeamId: T2, homeScore: 0, awayScore: 0,
    status: 'agendado', scheduledAt: null, finishedAt: null, location: null },
];

// ---------------------------------------------------------------------------
// 6. MATCHES C3 — Mata-mata (semifinais + final)
// ---------------------------------------------------------------------------
export const MATCHES_C3: MockMatch[] = [
  // Semi 1: Raio de Judá 2x1 Chama Viva (finalizado)
  { id: 'm_c3_s1', championshipId: 'champ_c3', round: 1,
    homeTeamId: 't_c3_01', awayTeamId: 't_c3_02', homeScore: 2, awayScore: 1,
    status: 'finalizado', scheduledAt: ts(10, 10), finishedAt: ts(10, 12),
    location: 'Campo FJU',
    bracketRound: 1, bracketPosition: 1, nextMatchId: 'm_c3_final', winnerId: 't_c3_01' },
  // Semi 2: Fortaleza 1x1 Centurião → pênaltis 4x3 (finalizado)
  { id: 'm_c3_s2', championshipId: 'champ_c3', round: 1,
    homeTeamId: 't_c3_03', awayTeamId: 't_c3_04', homeScore: 1, awayScore: 1,
    status: 'finalizado', scheduledAt: ts(10, 14), finishedAt: ts(10, 16),
    location: 'Campo FJU',
    bracketRound: 1, bracketPosition: 2, nextMatchId: 'm_c3_final',
    winnerId: 't_c3_03', homePenaltyScore: 4, awayPenaltyScore: 3 },
  // Final: Raio de Judá vs Fortaleza Eterna (agendada)
  { id: 'm_c3_final', championshipId: 'champ_c3', round: 2,
    homeTeamId: 't_c3_01', awayTeamId: 't_c3_03', homeScore: 0, awayScore: 0,
    status: 'agendado', scheduledAt: futureTs(3, 16), finishedAt: null,
    location: 'Campo FJU Arena',
    bracketRound: 2, bracketPosition: 1 },
];

export const MATCHES = [...MATCHES_C2, ...MATCHES_C3];

// ---------------------------------------------------------------------------
// 7. MATCH EVENTS C2 — Coerentes com os placares!
// ---------------------------------------------------------------------------
type EventType = 'gol' | 'assistencia' | 'cartao_amarelo' | 'cartao_vermelho';

interface MockMatchEvent {
  id: string;
  matchId: string;
  championshipId: string;
  type: EventType;
  teamId: string;
  playerId: string;
  userId: string | null;
  minute: number;
  createdAt: string;
}

const mkEvt = (
  id: string, matchId: string, type: EventType,
  teamId: string, playerId: string, minute: number,
  userId: string | null = null
): MockMatchEvent => ({
  id, matchId, championshipId: 'champ_c2', type, teamId, playerId,
  userId, minute, createdAt: ts(21),
});

export const MATCH_EVENTS: MockMatchEvent[] = [
  // === RODADA 1 ===
  // m_c2_r1_1: Trovões 2 x 1 Arsenal
  mkEvt('ev_001', 'm_c2_r1_1', 'gol', T1, 'p_c2_08', 15),         // Samuel (T1)
  mkEvt('ev_002', 'm_c2_r1_1', 'assistencia', T1, 'p_c2_07', 15),  // Davi assistiu
  mkEvt('ev_003', 'm_c2_r1_1', 'gol', T2, 'p_c2_18', 32),         // Noah (T2) — artilheiro
  mkEvt('ev_004', 'm_c2_r1_1', 'gol', T1, 'p_c2_09', 67),         // Elias (T1)
  mkEvt('ev_005', 'm_c2_r1_1', 'cartao_amarelo', T2, 'p_c2_15', 44), // Matheus (T2)
  // m_c2_r1_2: Escudo 0 x 0 Estrelas (sem gols, mas com cartões)
  mkEvt('ev_006', 'm_c2_r1_2', 'cartao_amarelo', T3, 'p_c2_29', 55), // Arthur (T3) — 1º amarelo
  mkEvt('ev_007', 'm_c2_r1_2', 'cartao_amarelo', T4, 'p_c2_35', 72), // Cauã (T4)

  // === RODADA 2 ===
  // m_c2_r2_1: Trovões 1 x 1 Escudo
  mkEvt('ev_008', 'm_c2_r2_1', 'gol', T1, 'p_c2_07', 23),         // Davi (T1)
  mkEvt('ev_009', 'm_c2_r2_1', 'gol', T3, 'p_c2_28', 78),         // Paulo Gustavo (T3)
  mkEvt('ev_010', 'm_c2_r2_1', 'cartao_amarelo', T3, 'p_c2_29', 40), // Arthur 2º amarelo
  // m_c2_r2_2: Arsenal 3 x 2 Estrelas
  mkEvt('ev_011', 'm_c2_r2_2', 'gol', T2, 'p_c2_18', 10),         // Noah (T2)
  mkEvt('ev_012', 'm_c2_r2_2', 'gol', T2, 'p_c2_18', 35),         // Noah (T2) — hat trick loading
  mkEvt('ev_013', 'm_c2_r2_2', 'gol', T4, 'p_c2_38', 42),         // Théo (T4)
  mkEvt('ev_014', 'm_c2_r2_2', 'gol', T2, 'p_c2_19', 58),         // Enzo (T2)
  mkEvt('ev_015', 'm_c2_r2_2', 'gol', T4, 'p_c2_38', 71),         // Théo (T4) — empata artilharia
  mkEvt('ev_016', 'm_c2_r2_2', 'assistencia', T4, 'p_c2_37', 71), // Ravi assistiu

  // === RODADA 3 ===
  // m_c2_r3_1: Trovões 4 x 1 Estrelas (GOLEADA)
  mkEvt('ev_017', 'm_c2_r3_1', 'gol', T1, 'p_c2_08', 5),          // Samuel (T1)
  mkEvt('ev_018', 'm_c2_r3_1', 'gol', T1, 'p_c2_08', 22),         // Samuel (T1) — doblete
  mkEvt('ev_019', 'm_c2_r3_1', 'gol', T1, 'p_c2_07', 50),         // Davi (T1)
  mkEvt('ev_020', 'm_c2_r3_1', 'gol', T4, 'p_c2_38', 60),         // Théo (T4)
  mkEvt('ev_021', 'm_c2_r3_1', 'gol', T1, 'p_c2_09', 85),         // Elias (T1)
  mkEvt('ev_022', 'm_c2_r3_1', 'cartao_vermelho', T4, 'p_c2_34', 75), // Yuri vermelho
  // m_c2_r3_2: Arsenal 0 x 2 Escudo
  mkEvt('ev_023', 'm_c2_r3_2', 'gol', T3, 'p_c2_27', 33),         // Caio César (T3)
  mkEvt('ev_024', 'm_c2_r3_2', 'gol', T3, 'p_c2_28', 68),         // Paulo Gustavo (T3)
  mkEvt('ev_025', 'm_c2_r3_2', 'cartao_amarelo', T3, 'p_c2_29', 88), // Arthur 3º amarelo → SUSPENSO!
  mkEvt('ev_026', 'm_c2_r3_2', 'cartao_amarelo', T2, 'p_c2_13', 90), // Igor (T2)

  // === RODADA 4 (AO VIVO: Arsenal 1 x 2 Trovões, minuto ~55) ===
  mkEvt('ev_027', 'm_c2_r4_1', 'gol', T1, 'p_c2_08', 12),         // Samuel (T1) — artilheiro!
  mkEvt('ev_028', 'm_c2_r4_1', 'gol', T2, 'p_c2_18', 28),         // Noah (T2)
  mkEvt('ev_029', 'm_c2_r4_1', 'gol', T1, 'p_c2_07', 51),         // Davi (T1)
  mkEvt('ev_030', 'm_c2_r4_1', 'cartao_amarelo', T2, 'p_c2_14', 38), // Lucas Rocha
];

// ---------------------------------------------------------------------------
// 8. ARTILHARIA / CLASSIFICAÇÃO (referência para conferência)
// ---------------------------------------------------------------------------
/*
  ARTILHARIA após rodada 4 (ao vivo):
  Samuel Torres (T1)  → 4 gols (R1, R3x2, R4)
  Noah Cardoso (T2)   → 4 gols (R1, R2x2, R4)        ← EMPATE!
  Théo Barbosa (T4)   → 3 gols (R2, R2, R3)
  Davi Moreira (T1)   → 3 gols (R2, R3, R4)
  Elias Martins (T1)  → 2 gols (R1, R3)
  Paulo Gustavo (T3)  → 2 gols (R2, R3)

  CLASSIFICAÇÃO após R3 (R4 em andamento):
  1. Trovões    → V3 E1 D0 = 10pts | GM 8 GS 2 SG +6
  2. Arsenal    → V1 E0 D2 = 3pts  | GM 4 GS 5 SG -1
  3. Escudo     → V1 E2 D0 = 5pts  | GM 3 GS 1 SG +2  (melhor defesa)
  4. Estrelas   → V0 E1 D2 = 1pts  | GM 3 GS 7 SG -4
*/

// ---------------------------------------------------------------------------
// 9. ROUND VOTES & AWARDS (craque da rodada — C2 rodada 3)
// ---------------------------------------------------------------------------
export const ROUND_VOTES = [
  { id: 'rv_01', championshipId: 'champ_c2', round: 3, voterId: 'u_cap_01', playerId: 'p_c2_08', createdAt: ts(6) },
  { id: 'rv_02', championshipId: 'champ_c2', round: 3, voterId: 'u_cap_02', playerId: 'p_c2_08', createdAt: ts(6) },
  { id: 'rv_03', championshipId: 'champ_c2', round: 3, voterId: 'u_cap_03', playerId: 'p_c2_27', createdAt: ts(6) },
  { id: 'rv_04', championshipId: 'champ_c2', round: 3, voterId: 'u_dual_01', playerId: 'p_c2_08', createdAt: ts(6) },
];

export const ROUND_AWARDS = [
  { id: 'ra_01', championshipId: 'champ_c2', round: 3,
    playerId: 'p_c2_08', playerName: 'Samuel Torres', teamId: 't_c2_01',
    votes: 3, totalVoters: 4, createdAt: ts(5) },
];

// ---------------------------------------------------------------------------
// 10. CHAMPIONSHIP RESULTS (C4 — finalizado)
// ---------------------------------------------------------------------------
export const CHAMPIONSHIP_RESULTS = [
  {
    id: 'champ_c4',
    championshipId: 'champ_c4',
    winner: { teamId: 't_c4_01', teamName: 'Trovões de Gileade' },
    runnerUp: { teamId: 't_c4_02', teamName: 'Arsenal da Fé' },
    thirdPlace: { teamId: 't_c4_03', teamName: 'Escudo de Abraão' },
    topScorer: { playerId: 'p_c4_t1_04', playerName: 'Atacante A 01', goals: 8, teamId: 't_c4_01' },
    bestDefense: { teamId: 't_c4_03', teamName: 'Escudo de Abraão', goalsConceded: 3 },
    mvp: { playerId: 'p_c4_t1_04', playerName: 'Atacante A 01', teamId: 't_c4_01' },
    fairPlayTeam: { teamId: 't_c4_04', teamName: 'Estrelas do Altíssimo' },
    totalMatches: 12,
    totalGoals: 28,
    createdAt: ts(100),
  },
];

// ---------------------------------------------------------------------------
// 11. PLAYER HISTORY (≥2 temporadas para gráfico de evolução)
// ---------------------------------------------------------------------------
export const PLAYER_HISTORY = [
  // Gabriel (dual) jogou nas 2 edições
  { id: 'ph_01', userId: 'u_dual_01', playerId: 'p_c4_t4_02', championshipId: 'champ_c4',
    championshipName: 'Copa FJU Intercelular 2025', season: '2025',
    teamName: 'Estrelas do Altíssimo', position: 'zagueiro',
    stats: { matches: 6, goals: 1, assists: 2, yellowCards: 1, redCards: 0 },
    overall: 72, createdAt: ts(100) },
  { id: 'ph_02', userId: 'u_dual_01', playerId: 'p_c2_32', championshipId: 'champ_c2',
    championshipName: 'Liga FJU São Paulo 2026', season: '2026',
    teamName: 'Estrelas do Altíssimo', position: 'zagueiro',
    stats: { matches: 3, goals: 0, assists: 1, yellowCards: 0, redCards: 0 },
    overall: 75, createdAt: ts(7) },
  // Tiago (atleta puro) — 2 temporadas
  { id: 'ph_03', userId: 'u_atl_01', playerId: 'p_c4_t1_02', championshipId: 'champ_c4',
    championshipName: 'Copa FJU Intercelular 2025', season: '2025',
    teamName: 'Trovões de Gileade', position: 'zagueiro',
    stats: { matches: 6, goals: 0, assists: 1, yellowCards: 2, redCards: 0 },
    overall: 68, createdAt: ts(100) },
  { id: 'ph_04', userId: 'u_atl_01', playerId: 'p_c2_02', championshipId: 'champ_c2',
    championshipName: 'Liga FJU São Paulo 2026', season: '2026',
    teamName: 'Trovões de Gileade', position: 'zagueiro',
    stats: { matches: 3, goals: 0, assists: 0, yellowCards: 1, redCards: 0 },
    overall: 70, createdAt: ts(7) },
];

// ---------------------------------------------------------------------------
// 12. CAREER STATS
// ---------------------------------------------------------------------------
export const CAREER_STATS = [
  { id: 'u_dual_01', userId: 'u_dual_01',
    totalMatches: 9, totalGoals: 1, totalAssists: 3,
    totalYellowCards: 1, totalRedCards: 0,
    championships: 2, titles: 0, mvps: 0,
    currentOverall: 75 },
  { id: 'u_atl_01', userId: 'u_atl_01',
    totalMatches: 9, totalGoals: 0, totalAssists: 1,
    totalYellowCards: 3, totalRedCards: 0,
    championships: 2, titles: 1, mvps: 0,
    currentOverall: 70 },
];

// ---------------------------------------------------------------------------
// 13. ALL TIME RANKINGS
// ---------------------------------------------------------------------------
export const ALL_TIME_RANKINGS = {
  top_scorers: {
    id: 'top_scorers',
    entries: [
      { playerId: 'p_c4_t1_04', playerName: 'Atacante A 01', goals: 8, teamName: 'Trovões de Gileade' },
      { playerId: 'p_c2_08', playerName: 'Samuel Torres', goals: 4, teamName: 'Trovões de Gileade' },
      { playerId: 'p_c2_18', playerName: 'Noah Cardoso', goals: 4, teamName: 'Arsenal da Fé' },
    ],
  },
  top_titles: {
    id: 'top_titles',
    entries: [
      { teamId: 't_c4_01', teamName: 'Trovões de Gileade', titles: 1 },
    ],
  },
  top_matches: {
    id: 'top_matches',
    entries: [
      { playerId: 'p_c4_t1_04', playerName: 'Atacante A 01', matches: 12 },
    ],
  },
  top_mvps: {
    id: 'top_mvps',
    entries: [
      { playerId: 'p_c4_t1_04', playerName: 'Atacante A 01', mvps: 1 },
      { playerId: 'p_c2_08', playerName: 'Samuel Torres', mvps: 1 },
    ],
  },
  top_teams: {
    id: 'top_teams',
    entries: [
      { teamId: 't_c4_01', teamName: 'Trovões de Gileade', points: 10, wins: 3 },
    ],
  },
};

// ---------------------------------------------------------------------------
// 14. AUXILIARES (notificações, convites, anúncios, convocações)
// ---------------------------------------------------------------------------
export const IN_APP_NOTIFICATIONS = [
  { id: 'notif_01', userId: 'u_dual_01', title: 'Time aprovado!',
    body: 'Estrelas do Altíssimo foi aprovado na Liga FJU São Paulo 2026.',
    read: false, type: 'team_approved', createdAt: ts(2) },
  { id: 'notif_02', userId: 'u_dual_01', title: 'Partida ao vivo',
    body: 'Arsenal da Fé x Trovões de Gileade está acontecendo agora!',
    read: true, type: 'match_live', createdAt: ts(0) },
  { id: 'notif_03', userId: 'u_atl_01', title: 'Craque da Rodada 3',
    body: 'Samuel Torres foi eleito craque da rodada!',
    read: false, type: 'round_award', createdAt: ts(5) },
];

export const ANNOUNCEMENTS = [
  { id: 'ann_01', championshipId: 'champ_c2', title: 'Rodada 4 confirmada!',
    body: 'As partidas da rodada 4 serão no Campo FJU Zona Norte. Confira os horários.',
    authorId: 'u_org_01', createdAt: ts(1) },
];

export const TEAM_INVITES = [
  { id: 'inv_01', teamId: 't_c1_04', code: 'EC2026-INVITE',
    createdBy: 'u_cap_04', status: 'active', createdAt: ts(4) },
];

export const JOIN_REQUESTS = [
  { id: 'jr_01', teamId: 't_c1_04', userId: 'u_atl_02', playerName: 'André Lima',
    status: 'pending', createdAt: ts(3) },
];

export const CONVOCATIONS = [
  // Convocação do time Trovões para rodada 4
  { teamId: 't_c2_01', round: 4,
    playerIds: ['p_c2_01', 'p_c2_02', 'p_c2_03', 'p_c2_04', 'p_c2_05',
                'p_c2_06', 'p_c2_07', 'p_c2_08', 'p_c2_09'],
    updatedAt: ts(1) },
  // Convocação do time Estrelas para rodada 4 (sem o lesionado)
  { teamId: 't_c2_04', round: 4,
    playerIds: ['p_c2_31', 'p_c2_32', 'p_c2_33', 'p_c2_34', 'p_c2_35',
                'p_c2_36', 'p_c2_37', 'p_c2_38', 'p_c2_39'],
    // p_c2_40 (Gael, lesionado) NÃO convocado
    updatedAt: ts(1) },
];

// ---------------------------------------------------------------------------
// EXPORT CONSOLIDADO
// ---------------------------------------------------------------------------
export const MOCK = {
  users: USERS,
  championships: CHAMPIONSHIPS,
  teams: TEAMS,
  players: PLAYERS,
  matches: MATCHES,
  matchEvents: MATCH_EVENTS,
  roundVotes: ROUND_VOTES,
  roundAwards: ROUND_AWARDS,
  championshipResults: CHAMPIONSHIP_RESULTS,
  playerHistory: PLAYER_HISTORY,
  careerStats: CAREER_STATS,
  allTimeRankings: ALL_TIME_RANKINGS,
  inAppNotifications: IN_APP_NOTIFICATIONS,
  announcements: ANNOUNCEMENTS,
  teamInvites: TEAM_INVITES,
  joinRequests: JOIN_REQUESTS,
  convocations: CONVOCATIONS,
};

export default MOCK;