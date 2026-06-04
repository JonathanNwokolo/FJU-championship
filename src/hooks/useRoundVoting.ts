import { useMemo } from 'react';
import { useVotingStore } from '../stores/votingStore';
import { useAuthStore } from '../stores/authStore';
import { RoundAward } from '../types';

export interface VoteResult {
  playerId: string;
  votes: number;
}

export interface RoundVotingState {
  results: VoteResult[];
  totalVotes: number;
  hasCurrentUserVoted: boolean;
  winner: RoundAward | null;
  loading: false;
}

export function useRoundVoting(
  championshipId: string,
  round: number,
): RoundVotingState {
  const votes = useVotingStore((s) => s.votes);
  const awards = useVotingStore((s) => s.awards);
  const user = useAuthStore((s) => s.user);

  const results = useMemo<VoteResult[]>(() => {
    const roundVotes = votes.filter(
      (v) => v.championshipId === championshipId && v.round === round,
    );
    const tally: Record<string, number> = {};
    for (const v of roundVotes) {
      tally[v.candidatePlayerId] = (tally[v.candidatePlayerId] ?? 0) + 1;
    }
    return Object.entries(tally)
      .map(([playerId, count]) => ({ playerId, votes: count }))
      .sort((a, b) => b.votes - a.votes);
  }, [votes, championshipId, round]);

  const totalVotes = useMemo(
    () => votes.filter((v) => v.championshipId === championshipId && v.round === round).length,
    [votes, championshipId, round],
  );

  const hasCurrentUserVoted = useMemo(
    () =>
      user
        ? votes.some(
            (v) =>
              v.championshipId === championshipId &&
              v.round === round &&
              v.voterId === user.id,
          )
        : false,
    [votes, user, championshipId, round],
  );

  const winner = useMemo(
    () =>
      awards.find((a) => a.championshipId === championshipId && a.round === round) ?? null,
    [awards, championshipId, round],
  );

  return { results, totalVotes, hasCurrentUserVoted, winner, loading: false };
}
