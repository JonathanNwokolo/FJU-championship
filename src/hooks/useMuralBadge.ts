import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, isFirebaseConfigured } from '../services/firebase';

function storageKey(championshipId: string) {
  return `mural_last_visit_${championshipId}`;
}

export function useMuralBadge(championshipId: string) {
  const [hasBadge, setHasBadge] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured) return;

    const q = query(
      collection(db, 'mural_posts'),
      where('championshipId', '==', championshipId),
      orderBy('createdAt', 'desc'),
      limit(1),
    );

    return onSnapshot(q, async (snap) => {
      if (snap.empty) {
        setHasBadge(false);
        return;
      }
      const ts = snap.docs[0].data().createdAt;
      const latestMs = ts instanceof Timestamp ? ts.toMillis() : Date.now();
      const saved = await AsyncStorage.getItem(storageKey(championshipId));
      const lastVisitMs = saved ? parseInt(saved, 10) : 0;
      setHasBadge(latestMs > lastVisitMs);
    });
  }, [championshipId]);

  return hasBadge;
}

export async function markMuralVisited(championshipId: string) {
  await AsyncStorage.setItem(storageKey(championshipId), String(Date.now()));
}
