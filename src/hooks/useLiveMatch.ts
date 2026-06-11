import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../services/firebase';
import { MOCK_DATA_ENABLED as USE_MOCK_DATA } from '../config/appConfig';
import { subscribeToCollection } from '../services/index';
import { MatchModel } from '../types';

export function useLiveMatch(championshipId: string) {
  const [hasLive, setHasLive] = useState(false);

  useEffect(() => {
    if (USE_MOCK_DATA) {
      if (!championshipId) {
        setHasLive(false);
        return;
      }
      return subscribeToCollection<MatchModel>(
        'matches',
        [
          { field: 'championshipId', operator: '==', value: championshipId },
          { field: 'status', operator: '==', value: 'ao_vivo' },
        ],
        (matches) => setHasLive(matches.length > 0),
      );
    }

    if (!isFirebaseConfigured || !championshipId) return;

    const q = query(
      collection(db, 'matches'),
      where('championshipId', '==', championshipId),
      where('status', '==', 'ao_vivo'),
    );

    return onSnapshot(q, (snap) => {
      setHasLive(!snap.empty);
    });
  }, [championshipId]);

  return hasLive;
}
