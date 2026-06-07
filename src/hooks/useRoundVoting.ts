import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { useVotingStore } from '../stores/votingStore';
import { useAuthStore } from '../stores/authStore';
import { RoundAward, RoundVote } from '../types';

export interface VoteResult {
  playerId: string;
  votes: number;
}

export interface RoundVotingState {
  results: VoteResult[];
  totalVotes: number;
  hasCurrentUserVoted: boolean;
  winner: RoundAward | null;
  loading: boolean;
}

export function useRoundVoting(
  championshipId: string,
  round: number,
): RoundVotingState {
  const { setVotes, setAwards } = useVotingStore();
  const votes = useVotingStore((s) => s.votes);
  const awards = useVotingStore((s) => s.awards);
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!championshipId) return;

    setLoading(true);

    const votesQuery = query(
      collection(db, 'round_votes'),
      where('championshipId', '==', championshipId),
      where('round', '==', round),
    );
    const awardsQuery = query(
      collection(db, 'round_awards'),
      where('championshipId', '==', championshipId),
      where('round', '==', round),
    );

    const unsubVotes = onSnapshot(votesQuery, (snap) => {
      const fresh = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RoundVote));
      const other = useVotingStore
        .getState()
        .votes.filter((v: RoundVote) => !(v.championshipId === championshipId && v.round === round));
      setVotes([...other, ...fresh]);
      setLoading(false);
    });

    const unsubAwards = onSnapshot(awardsQuery, (snap) => {
      const fresh = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RoundAward));
      const other = useVotingStore
        .getState()
        .awards.filter((a: RoundAward) => !(a.championshipId === championshipId && a.round === round));
      setAwards([...other, ...fresh]);
    });

    return () => {
      unsubVotes();
      unsubAwards();
    };
  }, [championshipId, round, setVotes, setAwards]);

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

  return { results, totalVotes, hasCurrentUserVoted, winner, loading };
}
