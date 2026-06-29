import { RoundAward } from '../types';

jest.mock('../services/firestore', () => ({
  addDocument: jest.fn(),
  getCollection: jest.fn(),
  getDocument: jest.fn(),
  setDocument: jest.fn(),
  updateDocument: jest.fn(),
  upsertDocument: jest.fn(),
}));

jest.mock('../services/achievementService', () => ({
  grantAchievement: jest.fn(),
  hasAchievement: jest.fn(),
}));

jest.mock('../services/notificationService', () => ({
  getTokensForChampionship: jest.fn(),
  sendPushNotification: jest.fn(),
}));

import { dedupeRoundAwards } from '../services/championshipFinisher';

function award(id: string, round: number, votes: number): RoundAward {
  return {
    id,
    championshipId: 'champ-1',
    round,
    winnerPlayerId: `p-${id}`,
    winnerName: id,
    winnerTeamId: 'team-1',
    totalVotes: votes,
    closedAt: '2026-06-01',
  };
}

function awardWithWinner(
  id: string,
  round: number,
  winnerPlayerId: string,
  closedAt: string,
): RoundAward {
  return {
    ...award(id, round, 1),
    winnerPlayerId,
    winnerName: winnerPlayerId,
    closedAt,
  };
}

describe('championshipFinisher round_awards legado', () => {
  it('deduplica awards por campeonato e rodada preferindo o id deterministico', () => {
    const result = dedupeRoundAwards([
      award('auto-id', 1, 2),
      award('champ-1_1', 1, 5),
      award('champ-1_2', 2, 3),
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.id).sort()).toEqual(['champ-1_1', 'champ-1_2']);
  });

  it('mantem um legado quando ainda nao existe documento deterministico da rodada', () => {
    const result = dedupeRoundAwards([
      awardWithWinner('auto-id-a', 1, 'player-a', '2026-06-01'),
      awardWithWinner('auto-id-b', 1, 'player-a', '2026-06-02'),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('auto-id-a');
  });

  it('dois legados conflitantes escolhem de forma estavel e geram alerta', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const newer = awardWithWinner('legacy-b', 1, 'player-b', '2026-06-02');
    const older = awardWithWinner('legacy-a', 1, 'player-a', '2026-06-01');

    const first = dedupeRoundAwards([newer, older]);
    const second = dedupeRoundAwards([older, newer]);

    expect(first).toHaveLength(1);
    expect(first[0].id).toBe('legacy-a');
    expect(second[0].id).toBe('legacy-a');
    expect(warn).toHaveBeenCalledWith(
      '[championshipFinisher] conflicting legacy round_awards for champ-1_1; using oldest closedAt then id',
    );

    warn.mockRestore();
  });
});
