import { useEffect, useState } from 'react';
import { subscribeToCollection } from '../services/index';
import { JoinRequest } from '../types';

export function usePendingJoinRequests(teamId?: string) {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) {
      setRequests([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeToCollection<JoinRequest>(
      'join_requests',
      [
        { field: 'teamId', operator: '==', value: teamId },
        { field: 'status', operator: '==', value: 'pending' },
      ],
      (data) => {
        const sorted = [...data].sort((a, b) => {
          const aTime = new Date(a.createdAt).getTime();
          const bTime = new Date(b.createdAt).getTime();
          return bTime - aTime;
        });
        setRequests(sorted);
        setLoading(false);
      },
      () => setLoading(false),
    );

    return unsubscribe;
  }, [teamId]);

  return {
    requests,
    count: requests.length,
    loading,
  };
}
