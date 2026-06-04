import { useEffect, useState, useCallback, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDoc,
  doc,
  QueryConstraint,
  Timestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../services/firebase';
import { MuralPost } from '../types';
import { useAuthStore } from '../stores/authStore';

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return new Date().toISOString();
}

export function useMuralPosts(championshipId: string, round?: number) {
  const userId = useAuthStore((s) => s.user?.id);
  const [posts, setPosts] = useState<MuralPost[]>([]);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const likedRef = useRef<Set<string>>(new Set());
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!isFirebaseConfigured) return;

    const constraints: QueryConstraint[] = [
      where('championshipId', '==', championshipId),
      orderBy('createdAt', 'desc'),
    ];
    if (round !== undefined && round > 0) {
      constraints.splice(1, 0, where('round', '==', round));
    }

    const q = query(collection(db, 'mural_posts'), ...constraints);

    const unsub = onSnapshot(
      q,
      async (snap) => {
        const newPosts: MuralPost[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            championshipId: data.championshipId,
            round: data.round ?? 0,
            authorId: data.authorId,
            authorName: data.authorName,
            authorPhotoUrl: data.authorPhotoUrl ?? undefined,
            teamId: data.teamId,
            imageUrl: data.imageUrl,
            caption: data.caption || undefined,
            likesCount: data.likesCount ?? 0,
            createdAt: toIso(data.createdAt),
          } as MuralPost;
        });

        setPosts(newPosts);
        setLoading(false);

        if (userId && newPosts.length > 0) {
          const checks = await Promise.all(
            newPosts.map(async (p) => {
              const snap = await getDoc(doc(db, 'mural_posts', p.id, 'likes', userId));
              return snap.exists() ? p.id : null;
            }),
          );
          likedRef.current = new Set(checks.filter(Boolean) as string[]);
          forceRender((n) => n + 1);
        }
      },
      () => setLoading(false),
    );

    return unsub;
  }, [championshipId, round, userId]);

  const hasLiked = useCallback(
    (postId: string) => likedRef.current.has(postId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [posts],
  );

  return { posts, loading, hasLiked };
}
