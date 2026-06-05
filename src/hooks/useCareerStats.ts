import { useEffect, useState } from 'react';
import { subscribeToDocument } from '../services/firestore';
import { CareerStats } from '../types';

export function useCareerStats(userId: string | null | undefined) {
  const [careerStats, setCareerStats] = useState<CareerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setCareerStats(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = subscribeToDocument<CareerStats>(
      'career_stats',
      userId,
      (data) => {
        setCareerStats(data);
        setLoading(false);
      },
      () => {
        setCareerStats(null);
        setLoading(false);
      },
    );

    return unsub;
  }, [userId]);

  return { careerStats, loading };
}
