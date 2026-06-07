import { useEffect, useState } from 'react';
import { subscribeToCollection } from '../services/index';
import { JoinRequest } from '../types';

/**
 * Converte createdAt (Firestore Timestamp, ISO string ou number) em millis.
 * Entradas sem data válida vão para o fim da fila.
 */
function entryMillis(createdAt: unknown): number {
  if (!createdAt) return Number.MAX_SAFE_INTEGER;
  if (typeof createdAt === 'object' && typeof (createdAt as { toDate?: () => Date }).toDate === 'function') {
    return (createdAt as { toDate: () => Date }).toDate().getTime();
  }
  const time = new Date(createdAt as string | number).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

/**
 * Fila de espera do time em tempo real (onSnapshot).
 * Reaproveita o índice teamId+status; filtra type='waitlist' no cliente.
 * Ordena por data de entrada (quem entrou primeiro aparece primeiro).
 */
export function useTeamWaitlist(teamId?: string) {
  const [waitlist, setWaitlist] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) {
      setWaitlist([]);
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
        const sorted = data
          .filter((item) => item.type === 'waitlist')
          .sort((a, b) => entryMillis(a.createdAt) - entryMillis(b.createdAt));
        setWaitlist(sorted);
        setLoading(false);
      },
      () => setLoading(false),
    );

    return unsubscribe;
  }, [teamId]);

  return {
    waitlist,
    count: waitlist.length,
    loading,
  };
}
