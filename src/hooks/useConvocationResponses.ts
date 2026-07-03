import { useEffect, useState } from 'react';
import { MatchAttendance } from '../types';
import { subscribeToCollection } from '../services/index';

const FRIENDLY_ERROR = 'Nao foi possivel carregar as respostas de presenca.';

export interface UseConvocationResponsesResult {
  responses: Map<string, MatchAttendance>;
  loading: boolean;
  error: string | null;
}

/**
 * Subscrita em tempo real às presenças de uma partida inteira.
 * Escopo: apenas o matchId informado — não carrega attendances de outros jogos.
 * Garante unsubscribe no unmount e na troca de matchId.
 * Retorna Map<playerId, MatchAttendance> para lookup O(1) na renderização.
 */
export function useConvocationResponses(matchId: string): UseConvocationResponsesResult {
  const [responses, setResponses] = useState<Map<string, MatchAttendance>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (!matchId) {
      setResponses(new Map());
      setLoading(false);
      setError(null);
      return;
    }
    setResponses(new Map());
    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToCollection<MatchAttendance>(
      'match_attendance',
      [{ field: 'matchId', operator: '==', value: matchId }],
      (docs) => {
        if (!active) return;
        const next = new Map<string, MatchAttendance>();
        for (const doc of docs) {
          if (doc.matchId === matchId) {
            next.set(doc.playerId, doc);
          }
        }
        setResponses(next);
        setLoading(false);
      },
      (err) => {
        if (!active) return;
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[useConvocationResponses] listener error:', err);
        }
        setError(FRIENDLY_ERROR);
        setLoading(false);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [matchId]);

  return { responses, loading, error };
}
