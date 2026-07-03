import { useEffect, useState } from 'react';
import { Convocation } from '../types';
import { subscribeToDocument } from '../services/index';
import { convocationDocId } from '../utils/convocationRules';

const FRIENDLY_ERROR = 'Nao foi possivel carregar a convocacao em tempo real.';

export interface UseMatchConvocationResult {
  convocation: Convocation | null;
  loading: boolean;
  error: string | null;
}

/**
 * Subscrita em tempo real ao documento de convocação de um time em uma partida.
 * Escopo: apenas o matchId + teamId informados (não carrega toda a coleção).
 * Garante unsubscribe no unmount e na troca de matchId/teamId.
 */
export function useMatchConvocation(
  matchId: string,
  teamId: string,
): UseMatchConvocationResult {
  const [convocation, setConvocation] = useState<Convocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (!matchId || !teamId) {
      setConvocation(null);
      setLoading(false);
      setError(null);
      return;
    }
    setConvocation(null);
    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToDocument<Convocation>(
      'match_convocations',
      convocationDocId(matchId, teamId),
      (doc) => {
        if (!active) return;
        setConvocation(doc);
        setLoading(false);
      },
      (err) => {
        if (!active) return;
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[useMatchConvocation] listener error:', err);
        }
        setError(FRIENDLY_ERROR);
        setLoading(false);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [matchId, teamId]);

  return { convocation, loading, error };
}
