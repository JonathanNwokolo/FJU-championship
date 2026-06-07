import { useEffect, useState } from 'react';
import { subscribeToDocument } from '../services/index';
import { AllTimeRanking, AllTimeRankingPlayer, AllTimeRankingTeam } from '../types';

export type AllTimeCategory = 'scorers' | 'titles' | 'matches' | 'mvps' | 'teams';

export function useAllTimeRankings(category: AllTimeCategory) {
  const [data, setData] = useState<AllTimeRanking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToDocument<AllTimeRanking>(
      'all_time_rankings',
      category,
      (doc) => {
        setData(doc);
        setLoading(false);
      },
      () => {
        setData(null);
        setLoading(false);
      },
    );
    return unsub;
  }, [category]);

  return {
    players: (data?.players ?? []) as AllTimeRankingPlayer[],
    teams: (data?.teams ?? []) as AllTimeRankingTeam[],
    loading,
  };
}
