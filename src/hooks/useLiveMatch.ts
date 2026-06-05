import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../services/firebase';

export function useLiveMatch(championshipId: string) {
  const [hasLive, setHasLive] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured) return;

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
