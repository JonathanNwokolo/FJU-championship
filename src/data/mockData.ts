import { Championship, Team, Player, MatchModel, MatchEvent } from '../types';

const CHAMPIONSHIP_ID = 'champ-001';

const teamDefs = [
  { id: 'team-01', name: 'Leões de Judá',       primary: '#F5A623', secondary: '#0D1B2A', code: 'LEOES1', captainId: 'captain-1' },
  { id: 'team-02', name: 'Guerreiros de Gideão', primary: '#E74C3C', secondary: '#FFFFFF', code: 'GUERR2', captainId: 'captain-2' },
  { id: 'team-03', name: 'Escudo da Fé',         primary: '#3498DB', secondary: '#FFFFFF', code: 'ESCUD3', captainId: 'captain-3' },
  { id: 'team-04', name: 'Tribo Real',            primary: '#9B59B6', secondary: '#FFD700', code: 'TRIBS4', captainId: 'captain-4' },
  { id: 'team-05', name: 'Exército de Davi',      primary: '#2ECC71', secondary: '#1A1A1A', code: 'EXERC5', captainId: 'captain-5' },
  { id: 'team-06', name: 'Filhos do Trovão',      primary: '#E67E22', secondary: '#2C3E50', code: 'FILHS6', captainId: 'captain-6' },
  { id: 'team-07', name: 'Águias Renovadas',      primary: '#1ABC9C', secondary: '#FFFFFF', code: 'AGUIA7', captainId: 'captain-7' },
  { id: 'team-08', name: 'Soldados de Cristo',    primary: '#2C3E50', secondary: '#F39C12', code: 'SOLID8', captainId: 'captain-8' },
];

const playerDefs: Record<string, Array<{ name: string; position: Player['position']; number: number; userId?: string }>> = {
  'team-01': [
    { name: 'Lucas Silva',      position: 'goleiro',  number: 1,  userId: 'atleta-demo' },
    { name: 'Gabriel Santos',   position: 'zagueiro', number: 4  },
    { name: 'Mateus Oliveira',  position: 'meia',     number: 10 },
    { name: 'Pedro Henrique',   position: 'atacante', number: 9  },
  ],
  'team-02': [
    { name: 'Rafael Costa',     position: 'goleiro',  number: 1  },
    { name: 'Bruno Almeida',    position: 'zagueiro', number: 5  },
    { name: 'Thiago Ferreira',  position: 'meia',     number: 8  },
    { name: 'Diego Souza',      position: 'atacante', number: 11 },
  ],
  'team-03': [
    { name: 'Felipe Rocha',     position: 'goleiro',  number: 1  },
    { name: 'Henrique Lima',    position: 'lateral',  number: 2  },
    { name: 'André Martins',    position: 'meia',     number: 6  },
    { name: 'Caio Ribeiro',     position: 'atacante', number: 9  },
  ],
  'team-04': [
    { name: 'Vinícius Pereira', position: 'goleiro',  number: 1  },
    { name: 'Eduardo Nunes',    position: 'zagueiro', number: 3  },
    { name: 'Rodrigo Cunha',    position: 'meia',     number: 10 },
    { name: 'Samuel Barbosa',   position: 'atacante', number: 7  },
  ],
  'team-05': [
    { name: 'Jonathan Gomes',   position: 'goleiro',  number: 1  },
    { name: 'Alexandre Dias',   position: 'zagueiro', number: 4  },
    { name: 'Leandro Freitas',  position: 'meia',     number: 8  },
    { name: 'Murilo Cardoso',   position: 'atacante', number: 9  },
  ],
  'team-06': [
    { name: 'Igor Nascimento',  position: 'goleiro',  number: 1  },
    { name: 'Cauã Teixeira',    position: 'lateral',  number: 2  },
    { name: 'Renan Melo',       position: 'meia',     number: 6  },
    { name: 'Gustavo Pinto',    position: 'atacante', number: 11 },
  ],
  'team-07': [
    { name: 'Davi Moreira',     position: 'goleiro',  number: 1  },
    { name: 'Enzo Cavalcanti',  position: 'zagueiro', number: 5  },
    { name: 'Luan Correia',     position: 'meia',     number: 10 },
    { name: 'Matheus Andrade',  position: 'atacante', number: 9  },
  ],
  'team-08': [
    { name: 'Ricardo Fonseca',  position: 'goleiro',  number: 1  },
    { name: 'Flávio Mendes',    position: 'lateral',  number: 3  },
    { name: 'Tiago Borges',     position: 'meia',     number: 8  },
    { name: 'Cleiton Araújo',   position: 'atacante', number: 7  },
  ],
};

// Round-robin schedule: [homeTeamId, awayTeamId][] per round
const schedule: Array<[string, string][]> = [
  [ ['team-01','team-02'], ['team-03','team-04'], ['team-05','team-06'], ['team-07','team-08'] ],
  [ ['team-01','team-03'], ['team-02','team-05'], ['team-04','team-07'], ['team-06','team-08'] ],
  [ ['team-01','team-04'], ['team-02','team-06'], ['team-03','team-07'], ['team-05','team-08'] ],
  [ ['team-01','team-05'], ['team-02','team-07'], ['team-03','team-08'], ['team-04','team-06'] ],
  [ ['team-01','team-06'], ['team-02','team-08'], ['team-03','team-05'], ['team-04','team-07'] ],
  [ ['team-01','team-07'], ['team-02','team-04'], ['team-03','team-06'], ['team-05','team-08'] ],
  [ ['team-01','team-08'], ['team-02','team-03'], ['team-04','team-05'], ['team-06','team-07'] ],
];

const finishedScores: Array<Array<[number, number]>> = [
  [ [2,1], [0,0], [3,1], [1,2] ],
  [ [1,1], [2,0], [0,1], [2,2] ],
  [ [3,0], [1,1], [2,1], [0,2] ],
];

const OPEN_CHAMPIONSHIP_ID = 'champ-002';

export function generateMockData() {
  const championship: Championship = {
    id: CHAMPIONSHIP_ID,
    name: 'Copa Tribo de Judá 2026',
    format: 'pontos_corridos',
    status: 'em_andamento',
    currentRound: 3,
    totalRounds: 7,
    organizerId: 'user-org-01',
    inviteCode: 'TRIBO6',
    rules: {
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      tiebreakers: ['saldo_gols', 'gols_pro', 'confronto_direto', 'fair_play'],
      fairPlay: true,
      craqueDaRodada: true,
      yellowCardLimit: 3,
    },
    createdAt: '2026-01-15T10:00:00Z',
  };

  const openChampionship: Championship = {
    id: OPEN_CHAMPIONSHIP_ID,
    name: 'Torneio FJU Verão 2026',
    format: 'pontos_corridos',
    status: 'inscricoes_abertas',
    currentRound: 0,
    totalRounds: 7,
    organizerId: 'user-org-01',
    inviteCode: 'VERAO6',
    rules: {
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      tiebreakers: ['saldo_gols', 'gols_pro', 'confronto_direto', 'fair_play'],
      fairPlay: true,
      craqueDaRodada: true,
      yellowCardLimit: 3,
    },
    createdAt: '2026-05-01T10:00:00Z',
  };

  const teams: Team[] = teamDefs.map((t) => ({
    id: t.id,
    championshipId: CHAMPIONSHIP_ID,
    name: t.name,
    primaryColor: t.primary,
    secondaryColor: t.secondary,
    captainId: t.captainId,
    status: 'aprovado',
    inviteCode: t.code,
    createdAt: '2026-01-20T10:00:00Z',
  }));

  const players: Player[] = [];
  let playerIndex = 1;
  for (const teamId of Object.keys(playerDefs)) {
    for (const p of playerDefs[teamId]) {
      players.push({
        id: `player-${String(playerIndex).padStart(3, '0')}`,
        teamId,
        userId: p.userId,
        name: p.name,
        position: p.position,
        number: p.number,
      });
      playerIndex++;
    }
  }

  const matches: MatchModel[] = [];
  let matchIndex = 1;

  for (let roundIdx = 0; roundIdx < schedule.length; roundIdx++) {
    const round = roundIdx + 1;
    const isFinished = round <= 3;

    for (let m = 0; m < schedule[roundIdx].length; m++) {
      const [homeTeamId, awayTeamId] = schedule[roundIdx][m];
      const matchId = `match-${String(matchIndex).padStart(3, '0')}`;
      let homeScore: number | null = null;
      let awayScore: number | null = null;

      if (isFinished) {
        [homeScore, awayScore] = finishedScores[roundIdx][m];
      }

      matches.push({
        id: matchId,
        championshipId: CHAMPIONSHIP_ID,
        round,
        homeTeamId,
        awayTeamId,
        homeScore,
        awayScore,
        status: isFinished ? 'finalizado' : 'agendado',
        scheduledAt: `2026-0${round + 1}-${String(10 + m).padStart(2, '0')}T15:00:00Z`,
        finishedAt: isFinished ? `2026-0${round + 1}-${String(10 + m).padStart(2, '0')}T17:00:00Z` : undefined,
      });

      matchIndex++;
    }
  }

  // Deterministic events for finalized rounds 1–3 (29 goals + 10 cards = 39 events)
  //
  // Player ID reference (playerIndex order matches teamDefs key order):
  //   team-01 → 001(GK Lucas) 002(Gabriel) 003(Mateus)  004(Pedro)
  //   team-02 → 005(GK Rafael) 006(Bruno)  007(Thiago)  008(Diego)
  //   team-03 → 009(GK Felipe) 010(Henrique) 011(André) 012(Caio)
  //   team-04 → 013(GK Vinícius) 014(Eduardo) 015(Rodrigo) 016(Samuel)
  //   team-05 → 017(GK Jonathan) 018(Alexandre) 019(Leandro) 020(Murilo)
  //   team-06 → 021(GK Igor) 022(Cauã) 023(Renan) 024(Gustavo)
  //   team-07 → 025(GK Davi) 026(Enzo) 027(Luan) 028(Matheus)
  //   team-08 → 029(GK Ricardo) 030(Flávio) 031(Tiago) 032(Cleiton)
  //
  // Suspensions after R3:
  //   player-014 (Eduardo Nunes, team-04) → cartao_vermelho in match-009
  //   player-019 (Leandro Freitas, team-05) → 3 amarelos across R1/R2/R3
  const matchEvents: MatchEvent[] = [
    // ── R1 match-001: team-01 2–1 team-02 ────────────────────────────────
    { id: 'event-001', matchId: 'match-001', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-01', playerId: 'player-004', minute: 23 },
    { id: 'event-002', matchId: 'match-001', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-01', playerId: 'player-003', minute: 67 },
    { id: 'event-003', matchId: 'match-001', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-02', playerId: 'player-008', minute: 45 },
    { id: 'event-004', matchId: 'match-001', championshipId: CHAMPIONSHIP_ID, type: 'cartao_amarelo', teamId: 'team-02', playerId: 'player-006', minute: 50 },
    // ── R1 match-002: team-03 0–0 team-04 ── no goals ────────────────────
    // ── R1 match-003: team-05 3–1 team-06 ────────────────────────────────
    { id: 'event-005', matchId: 'match-003', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-05', playerId: 'player-020', minute: 12 },
    { id: 'event-006', matchId: 'match-003', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-05', playerId: 'player-019', minute: 35 },
    { id: 'event-007', matchId: 'match-003', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-05', playerId: 'player-020', minute: 78 },
    { id: 'event-008', matchId: 'match-003', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-06', playerId: 'player-024', minute: 55 },
    { id: 'event-009', matchId: 'match-003', championshipId: CHAMPIONSHIP_ID, type: 'cartao_amarelo', teamId: 'team-06', playerId: 'player-022', minute: 33 },
    { id: 'event-010', matchId: 'match-003', championshipId: CHAMPIONSHIP_ID, type: 'cartao_amarelo', teamId: 'team-05', playerId: 'player-019', minute: 72 },
    // ── R1 match-004: team-07 1–2 team-08 ────────────────────────────────
    { id: 'event-011', matchId: 'match-004', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-07', playerId: 'player-028', minute: 34 },
    { id: 'event-012', matchId: 'match-004', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-08', playerId: 'player-032', minute: 56 },
    { id: 'event-013', matchId: 'match-004', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-08', playerId: 'player-032', minute: 82 },
    // ── R2 match-005: team-01 1–1 team-03 ────────────────────────────────
    { id: 'event-014', matchId: 'match-005', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-01', playerId: 'player-004', minute: 30 },
    { id: 'event-015', matchId: 'match-005', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-03', playerId: 'player-012', minute: 71 },
    // ── R2 match-006: team-02 2–0 team-05 ────────────────────────────────
    { id: 'event-016', matchId: 'match-006', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-02', playerId: 'player-008', minute: 18 },
    { id: 'event-017', matchId: 'match-006', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-02', playerId: 'player-007', minute: 53 },
    { id: 'event-018', matchId: 'match-006', championshipId: CHAMPIONSHIP_ID, type: 'cartao_amarelo', teamId: 'team-05', playerId: 'player-019', minute: 48 },
    // ── R2 match-007: team-04 0–1 team-07 ────────────────────────────────
    { id: 'event-019', matchId: 'match-007', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-07', playerId: 'player-027', minute: 62 },
    // ── R2 match-008: team-06 2–2 team-08 ────────────────────────────────
    { id: 'event-020', matchId: 'match-008', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-06', playerId: 'player-024', minute: 14 },
    { id: 'event-021', matchId: 'match-008', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-06', playerId: 'player-023', minute: 77 },
    { id: 'event-022', matchId: 'match-008', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-08', playerId: 'player-032', minute: 38 },
    { id: 'event-023', matchId: 'match-008', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-08', playerId: 'player-031', minute: 85 },
    { id: 'event-024', matchId: 'match-008', championshipId: CHAMPIONSHIP_ID, type: 'cartao_amarelo', teamId: 'team-08', playerId: 'player-030', minute: 25 },
    // ── R3 match-009: team-01 3–0 team-04 ────────────────────────────────
    { id: 'event-025', matchId: 'match-009', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-01', playerId: 'player-004', minute:  8 },
    { id: 'event-026', matchId: 'match-009', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-01', playerId: 'player-003', minute: 45 },
    { id: 'event-027', matchId: 'match-009', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-01', playerId: 'player-002', minute: 89 },
    { id: 'event-028', matchId: 'match-009', championshipId: CHAMPIONSHIP_ID, type: 'cartao_vermelho',teamId: 'team-04', playerId: 'player-014', minute: 88 },
    // ── R3 match-010: team-02 1–1 team-06 ────────────────────────────────
    { id: 'event-029', matchId: 'match-010', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-02', playerId: 'player-008', minute: 27 },
    { id: 'event-030', matchId: 'match-010', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-06', playerId: 'player-024', minute: 64 },
    { id: 'event-031', matchId: 'match-010', championshipId: CHAMPIONSHIP_ID, type: 'cartao_amarelo', teamId: 'team-02', playerId: 'player-007', minute: 42 },
    // ── R3 match-011: team-03 2–1 team-07 ────────────────────────────────
    { id: 'event-032', matchId: 'match-011', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-03', playerId: 'player-011', minute: 19 },
    { id: 'event-033', matchId: 'match-011', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-03', playerId: 'player-012', minute: 73 },
    { id: 'event-034', matchId: 'match-011', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-07', playerId: 'player-028', minute: 41 },
    { id: 'event-035', matchId: 'match-011', championshipId: CHAMPIONSHIP_ID, type: 'cartao_amarelo', teamId: 'team-07', playerId: 'player-026', minute: 15 },
    // ── R3 match-012: team-05 0–2 team-08 ────────────────────────────────
    { id: 'event-036', matchId: 'match-012', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-08', playerId: 'player-032', minute: 31 },
    { id: 'event-037', matchId: 'match-012', championshipId: CHAMPIONSHIP_ID, type: 'gol',            teamId: 'team-08', playerId: 'player-030', minute: 68 },
    { id: 'event-038', matchId: 'match-012', championshipId: CHAMPIONSHIP_ID, type: 'cartao_amarelo', teamId: 'team-05', playerId: 'player-018', minute: 60 },
    { id: 'event-039', matchId: 'match-012', championshipId: CHAMPIONSHIP_ID, type: 'cartao_amarelo', teamId: 'team-05', playerId: 'player-019', minute: 55 },
  ];

  return { championships: [championship, openChampionship], teams, players, matches, matchEvents };
}
