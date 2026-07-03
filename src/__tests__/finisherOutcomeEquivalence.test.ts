/**
 * Bloco 11 — Fase 2, item 13: teste de equivalência mínima.
 *
 * O finisher NÃO foi refatorado para consumir `computeChampionshipOutcome` nesta
 * fase (não há suíte de testes do finisher que sirva de rede de segurança para a
 * troca do cálculo de desfecho). Em vez disso, este teste executa o finisher real
 * contra um Firestore em memória e prova que o desfecho que ele PERSISTE
 * (championship_results + player_history + achievements de fim de campeonato) é
 * IGUAL ao que `computeChampionshipOutcome` calcula. Assim garantimos que o
 * reprocessamento (que usa o domínio puro) reconcilia exatamente para o mesmo
 * estado que o encerramento original produziria — documentando o ponto de reuso
 * ainda pendente sem arriscar a finalização existente.
 */
import type {
  Achievement,
  Championship,
  ChampionshipResultData,
  ChampionshipRules,
  MatchEvent,
  MatchModel,
  Player,
  PlayerHistoryEntry,
  RoundAward,
  Team,
} from '../types';

// ─── Firestore em memória (mock do módulo de acesso) ───────────────────────────
type AnyDoc = Record<string, unknown> & { id: string };
const mockStore: Record<string, AnyDoc[]> = {};
let mockAutoId = 1;

function mockColl(name: string): AnyDoc[] {
  if (!mockStore[name]) mockStore[name] = [];
  return mockStore[name];
}
function mockReset() {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockAutoId = 1;
}

jest.mock('../config/appConfig', () => ({
  MOCK_DATA_ENABLED: false,
  USE_MOCK: false,
  MOCK_ACTIVE_USER: 'organizador',
  ALLOW_ORGANIZER_SELF_ASSIGN: false,
}));

jest.mock('../services/firestore', () => ({
  getCollection: async (name: string, filters?: Array<{ field: string; operator: string; value: unknown }>) =>
    mockColl(name)
      .filter((doc) =>
        (filters ?? []).every((f) => f.operator !== '==' || (doc as Record<string, unknown>)[f.field] === f.value),
      )
      .map((d) => ({ ...d })),
  getDocument: async (name: string, id: string) => {
    const d = mockColl(name).find((x) => x.id === id);
    return d ? { ...d } : null;
  },
  setDocument: async (name: string, id: string, data: object) => {
    const coll = mockColl(name);
    const idx = coll.findIndex((x) => x.id === id);
    const doc = { ...(data as object), id } as AnyDoc;
    if (idx >= 0) coll[idx] = doc;
    else coll.push(doc);
    return id;
  },
  upsertDocument: async (name: string, id: string, data: object) => {
    const coll = mockColl(name);
    const idx = coll.findIndex((x) => x.id === id);
    if (idx >= 0) coll[idx] = { ...coll[idx], ...(data as object), id };
    else coll.push({ ...(data as object), id } as AnyDoc);
  },
  addDocument: async (name: string, data: object) => {
    const id = `auto-${mockAutoId++}`;
    mockColl(name).push({ ...(data as object), id } as AnyDoc);
    return id;
  },
  updateDocument: async (name: string, id: string, data: object) => {
    const coll = mockColl(name);
    const idx = coll.findIndex((x) => x.id === id);
    if (idx >= 0) coll[idx] = { ...coll[idx], ...(data as object) };
  },
}));

jest.mock('../services/achievementService', () => ({
  hasAchievement: async (playerId: string, achievementId: string) =>
    mockColl(`players/${playerId}/achievements`).some((a) => a.id === achievementId),
  grantAchievement: async (a: Achievement) => {
    const coll = mockColl(`players/${a.playerId}/achievements`);
    const idx = coll.findIndex((x) => x.id === a.achievementId);
    const doc = { ...a, id: a.achievementId } as AnyDoc;
    if (idx >= 0) coll[idx] = doc;
    else coll.push(doc);
  },
}));

jest.mock('../services/notificationService', () => ({
  getTokensForChampionship: async () => [],
  sendPushNotification: async () => undefined,
}));

import { finishChampionship } from '../services/championshipFinisher';
import { computeChampionshipOutcome } from '../utils/championshipReprocessing';

// ─── Fixture ───────────────────────────────────────────────────────────────────
const CHAMP = 'champ-eq';
const RULES: ChampionshipRules = {
  pointsWin: 3, pointsDraw: 1, pointsLoss: 0,
  tiebreakers: ['saldo_gols', 'gols_pro'], fairPlay: true, craqueDaRodada: true,
};
const championship: Championship = {
  id: CHAMP, name: 'Copa Equivalência', format: 'pontos_corridos', status: 'em_andamento',
  currentRound: 1, totalRounds: 1, organizerId: 'org-1', inviteCode: 'EQ', rules: RULES,
  createdAt: '2026-01-01', season: '2026',
};
const teams: Team[] = [
  { id: 'A', championshipId: CHAMP, name: 'Leões', primaryColor: '#111', secondaryColor: '#fff', captainId: 'cA', status: 'aprovado', inviteCode: 'A', createdAt: '2026-01-01' },
  { id: 'B', championshipId: CHAMP, name: 'Tigres', primaryColor: '#222', secondaryColor: '#fff', captainId: 'cB', status: 'aprovado', inviteCode: 'B', createdAt: '2026-01-01' },
];
const players: Player[] = [
  { id: 'pA', championshipId: CHAMP, teamId: 'A', userId: 'uA', name: 'Ana', position: 'atacante', number: 9, status: 'ativo', joinedAt: '2026-01-01' },
  { id: 'pB', championshipId: CHAMP, teamId: 'B', userId: 'uB', name: 'Bia', position: 'atacante', number: 10, status: 'ativo', joinedAt: '2026-01-01' },
];
const matches: MatchModel[] = [
  { id: 'm1', championshipId: CHAMP, round: 1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 1, status: 'finalizado', winnerId: 'A' } as MatchModel,
];
const events: MatchEvent[] = [
  { id: 'e1', matchId: 'm1', championshipId: CHAMP, type: 'gol', playerId: 'pA', teamId: 'A', playerName: 'Ana', teamName: 'Leões', minute: 10 },
  { id: 'e2', matchId: 'm1', championshipId: CHAMP, type: 'gol', playerId: 'pA', teamId: 'A', playerName: 'Ana', teamName: 'Leões', minute: 20 },
  { id: 'e3', matchId: 'm1', championshipId: CHAMP, type: 'gol', playerId: 'pB', teamId: 'B', playerName: 'Bia', teamName: 'Tigres', minute: 30 },
] as MatchEvent[];
const roundAwards: RoundAward[] = [
  { id: `${CHAMP}_1`, championshipId: CHAMP, round: 1, winnerPlayerId: 'pA', winnerName: 'Ana', winnerTeamId: 'A', totalVotes: 5, closedAt: '2026-01-05' },
];

function seedAll() {
  mockReset();
  mockColl('championships').push({ ...championship });
  teams.forEach((t) => mockColl('teams').push({ ...t }));
  players.forEach((p) => mockColl('players').push({ ...p }));
  matches.forEach((m) => mockColl('matches').push({ ...m }));
  events.forEach((e) => mockColl('match_events').push({ ...e } as unknown as AnyDoc));
  roundAwards.forEach((a) => mockColl('round_awards').push({ ...a }));
}

describe('finishChampionship ≡ computeChampionshipOutcome', () => {
  it('o desfecho persistido pelo finisher é idêntico ao domínio puro', async () => {
    seedAll();
    const outcome = computeChampionshipOutcome({ championship, teams, players, matches, events, roundAwards });

    const res = await finishChampionship(CHAMP);
    expect(res.success).toBe(true);

    // 1. championship_results
    const persisted = mockColl('championship_results').find((r) => r.id === CHAMP) as unknown as ChampionshipResultData;
    for (const field of [
      'winnerId', 'runnerUpId', 'topScorerId', 'topScorerGoals', 'bestDefenseId',
      'mvpPlayerId', 'fairPlayTeamId', 'totalGoals', 'totalMatches', 'totalTeams', 'totalPlayers',
    ] as const) {
      expect(persisted[field]).toEqual((outcome.result as unknown as Record<string, unknown>)[field]);
    }

    // 2. player_history por usuário
    const history = mockColl('player_history') as unknown as PlayerHistoryEntry[];
    const persistedByUser = Object.fromEntries(history.map((h) => [h.userId, h]));
    const outcomeByUser = Object.fromEntries(outcome.playerRows.map((r) => [r.userId, r]));
    expect(Object.keys(persistedByUser).sort()).toEqual(Object.keys(outcomeByUser).sort());
    for (const userId of Object.keys(outcomeByUser)) {
      const p = persistedByUser[userId];
      const o = outcomeByUser[userId];
      expect({ goals: p.goals, assists: p.assists, matchesPlayed: p.matchesPlayed, overall: p.overall, isChampion: p.isChampion, roundMvpCount: p.roundMvpCount }).toEqual(
        { goals: o.goals, assists: o.assists, matchesPlayed: o.matchesPlayed, overall: o.overall, isChampion: o.isChampion, roundMvpCount: o.roundMvpCount },
      );
    }

    // 3. achievements de fim de campeonato concedidos
    const granted: string[] = [];
    for (const p of players) {
      for (const a of mockColl(`players/${p.id}/achievements`)) granted.push(`${p.id}:${a.id}`);
    }
    const expected = outcome.expectedAchievements.map((a) => `${a.playerId}:${a.achievementId}`);
    expect(granted.sort()).toEqual(expected.sort());
  });
});
