import { useEffect, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../services/firebase';
import { useAuthStore } from '../stores/authStore';

export function usePostLikes(postId: string) {
  const userId = useAuthStore((s) => s.user?.id);
  const [count, setCount] = useState(0);
  const [hasLiked, setHasLiked] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured || !postId) return;

    const q = query(collection(db, 'mural_posts', postId, 'likes'));
    return onSnapshot(q, (snap) => {
      setCount(snap.size);
      setHasLiked(snap.docs.some((d) => d.id === userId));
    });
  }, [postId, userId]);

  return { count, hasLiked };
}
