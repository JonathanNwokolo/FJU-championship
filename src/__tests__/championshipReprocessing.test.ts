/**
 * Bloco 11 — Fase 1: domínio puro do reprocessamento.
 * Cobre o cálculo do desfecho e o diff (campeão/artilheiro/MVP/histórico +
 * reconciliação de achievements) quando uma correção muda o resultado.
 */
import type {
  Championship,
  ChampionshipRules,
  MatchEvent,
  MatchModel,
  Player,
  RoundAward,
  Team,
} from '../types';
import {
  computeChampionshipOutcome,
  diffChampionshipOutcome,
  ExpectedAchievement,
  ReprocessPlayerRow,
} from '../utils/championshipReprocessing';

const CHAMP = 'champ-reproc';

const rules: ChampionshipRules = {
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  tiebreakers: ['saldo_gols', 'gols_pro'],
  fairPlay: true,
  craqueDaRodada: true,
};

function championship(over: Partial<Championship> = {}): Championship {
  return {
    id: CHAMP,
    name: 'Copa Reprocessamento',
    format: 'pontos_corridos',
    status: 'finalizado',
    currentRound: 1,
    totalRounds: 1,
    organizerId: 'org-1',
    inviteCode: 'REP',
    rules,
    createdAt: '2026-01-01',
    season: '2026',
    ...over,
  };
}

function team(id: string, name: string): Team {
  return {
    id, championshipId: CHAMP, name, primaryColor: '#111', secondaryColor: '#fff',
    captainId: `cap-${id}`, status: 'aprovado', inviteCode: id, createdAt: '2026-01-01',
  };
}

function player(id: string, teamId: string, userId: string): Player {
  return {
    id, championshipId: CHAMP, teamId, userId, name: id, position: 'atacante', number: 9,
    status: 'ativo', joinedAt: '2026-01-01',
  };
}

function gol(id: string, matchId: string, playerId: string, teamId: string): MatchEvent {
  return {
    id, matchId, championshipId: CHAMP, type: 'gol', playerId, teamId,
    playerName: playerId, teamName: teamId, minute: 10,
  } as MatchEvent;
}

const teams = [team('A', 'Leões'), team('B', 'Tigres')];
const players = [player('pA', 'A', 'uA'), player('pB', 'B', 'uB')];

function matchAB(home: number, away: number): MatchModel {
  return {
    id: 'm1', championshipId: CHAMP, round: 1, homeTeamId: 'A', awayTeamId: 'B',
    homeScore: home, awayScore: away, status: 'finalizado',
    winnerId: home > away ? 'A' : away > home ? 'B' : null,
  } as MatchModel;
}

// A vence 2x1 → A campeão; pA artilheiro (2 gols).
const eventsAwin: MatchEvent[] = [
  gol('e1', 'm1', 'pA', 'A'), gol('e2', 'm1', 'pA', 'A'), gol('e3', 'm1', 'pB', 'B'),
];
// Correção: B vence 1x2 → B campeão; pB artilheiro (2 gols).
const eventsBwin: MatchEvent[] = [
  gol('e1', 'm1', 'pA', 'A'), gol('e2', 'm1', 'pB', 'B'), gol('e3', 'm1', 'pB', 'B'),
];

const awards: RoundAward[] = [
  { id: `${CHAMP}_1`, championshipId: CHAMP, round: 1, winnerPlayerId: 'pA', winnerName: 'pA', winnerTeamId: 'A', totalVotes: 3, closedAt: '2026-01-02' },
];

describe('computeChampionshipOutcome', () => {
  it('calcula campeão, artilheiro, MVP e achievements esperados', () => {
    const outcome = computeChampionshipOutcome({
      championship: championship(), teams, players, matches: [matchAB(2, 1)], events: eventsAwin, roundAwards: awards,
    });
    expect(outcome.result.winnerId).toBe('A');
    expect(outcome.result.runnerUpId).toBe('B');
    expect(outcome.result.topScorerId).toBe('pA');
    expect(outcome.result.topScorerGoals).toBe(2);
    expect(outcome.result.mvpPlayerId).toBe('pA');
    expect(outcome.result.totalGoals).toBe(3);

    const rowByUser = Object.fromEntries(outcome.playerRows.map((r) => [r.userId, r]));
    expect(rowByUser.uA.isChampion).toBe(true);
    expect(rowByUser.uA.goals).toBe(2);
    expect(rowByUser.uB.isChampion).toBe(false);

    const keys = outcome.expectedAchievements.map((a) => `${a.playerId}:${a.achievementId}`);
    expect(keys).toContain('pA:campeao');
    expect(keys).toContain('pA:artilheiro_campeonato');
    expect(keys).toContain('pB:vice_campeao');
    // sem cartões e com jogo disputado → fair play para os dois
    expect(keys).toContain('pA:fair_play_campeonato');
    expect(keys).toContain('pB:fair_play_campeonato');
  });

  it('é determinístico (mesma entrada → mesma saída)', () => {
    const input = { championship: championship(), teams, players, matches: [matchAB(2, 1)], events: eventsAwin, roundAwards: awards };
    expect(computeChampionshipOutcome(input)).toEqual(computeChampionshipOutcome(input));
  });
});

function freeze(outcome: ReturnType<typeof computeChampionshipOutcome>) {
  const frozenHistoryByUser: Record<string, ReprocessPlayerRow> = Object.fromEntries(
    outcome.playerRows.map((r) => [r.userId, r]),
  );
  return {
    frozenResult: outcome.result,
    frozenHistoryByUser,
    frozenAchievements: outcome.expectedAchievements as ExpectedAchievement[],
  };
}

describe('diffChampionshipOutcome', () => {
  it('sem mudanças quando o estado é o mesmo', () => {
    const outcome = computeChampionshipOutcome({
      championship: championship(), teams, players, matches: [matchAB(2, 1)], events: eventsAwin, roundAwards: awards,
    });
    const diff = diffChampionshipOutcome({ ...freeze(outcome), recomputed: outcome });
    expect(diff.hasChanges).toBe(false);
    expect(diff.historyDeltas).toEqual([]);
    expect(diff.achievements.grant).toEqual([]);
    expect(diff.achievements.revoke).toEqual([]);
  });

  it('correção que troca o campeão gera diff + reconciliação de achievements', () => {
    const before = computeChampionshipOutcome({
      championship: championship(), teams, players, matches: [matchAB(2, 1)], events: eventsAwin, roundAwards: awards,
    });
    const after = computeChampionshipOutcome({
      championship: championship(), teams, players, matches: [matchAB(1, 2)], events: eventsBwin, roundAwards: awards,
    });
    const diff = diffChampionshipOutcome({ ...freeze(before), recomputed: after });

    expect(diff.hasChanges).toBe(true);
    expect(diff.championChanged).toBe(true);
    expect(diff.topScorerChanged).toBe(true);
    expect(diff.changedResultFields).toEqual(expect.arrayContaining(['winnerId', 'runnerUpId', 'topScorerId']));

    // histórico dos dois usuários muda (gols/campeão trocam).
    expect(diff.historyDeltas.map((d) => d.userId).sort()).toEqual(['uA', 'uB']);

    const grantKeys = diff.achievements.grant.map((a) => `${a.playerId}:${a.achievementId}`).sort();
    const revokeKeys = diff.achievements.revoke.map((a) => `${a.playerId}:${a.achievementId}`).sort();
    expect(grantKeys).toEqual(['pA:vice_campeao', 'pB:artilheiro_campeonato', 'pB:campeao']);
    expect(revokeKeys).toEqual(['pA:artilheiro_campeonato', 'pA:campeao', 'pB:vice_campeao']);
    // fair play não é tocado (permanece para ambos).
    expect(grantKeys).not.toContain('pA:fair_play_campeonato');
    expect(revokeKeys).not.toContain('pB:fair_play_campeonato');
  });

  it('revoga fair play quando um cartão passa a existir na correção', () => {
    const before = computeChampionshipOutcome({
      championship: championship(), teams, players, matches: [matchAB(2, 1)], events: eventsAwin, roundAwards: awards,
    });
    // adiciona um cartão amarelo para pA → perde fair play
    const cartao = { id: 'c1', matchId: 'm1', championshipId: CHAMP, type: 'cartao_amarelo', playerId: 'pA', teamId: 'A', playerName: 'pA', teamName: 'A', minute: 20 } as MatchEvent;
    const after = computeChampionshipOutcome({
      championship: championship(), teams, players, matches: [matchAB(2, 1)], events: [...eventsAwin, cartao], roundAwards: awards,
    });
    const diff = diffChampionshipOutcome({ ...freeze(before), recomputed: after });
    const revokeKeys = diff.achievements.revoke.map((a) => `${a.playerId}:${a.achievementId}`);
    expect(revokeKeys).toContain('pA:fair_play_campeonato');
    expect(diff.championChanged).toBe(false);
  });
});
