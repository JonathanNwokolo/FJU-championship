import { useEffect, useState } from 'react';
import { MatchAttendance } from '../types';
import { subscribeToDocument } from '../services/index';
import { attendanceDocId } from '../utils/convocationRules';

const FRIENDLY_ERROR = 'Nao foi possivel carregar sua presenca em tempo real.';

export interface UseMatchAttendanceResult {
  attendance: MatchAttendance | null;
  loading: boolean;
  error: string | null;
}

/**
 * Subscrita em tempo real à presença de um atleta específico em uma partida.
 * Para uso na visão do atleta (minha presença). O escopo é um único documento
 * match_attendance/{matchId}_{playerId}, sem carregar a partida inteira.
 * Garante unsubscribe no unmount e na troca de matchId/playerId.
 */
export function useMatchAttendance(
  matchId: string,
  playerId: string,
): UseMatchAttendanceResult {
  const [attendance, setAttendance] = useState<MatchAttendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (!matchId || !playerId) {
      setAttendance(null);
      setLoading(false);
      setError(null);
      return;
    }
    setAttendance(null);
    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToDocument<MatchAttendance>(
      'match_attendance',
      attendanceDocId(matchId, playerId),
      (doc) => {
        if (!active) return;
        setAttendance(doc);
        setLoading(false);
      },
      (err) => {
        if (!active) return;
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[useMatchAttendance] listener error:', err);
        }
        setError(FRIENDLY_ERROR);
        setLoading(false);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [matchId, playerId]);

  return { attendance, loading, error };
}
