import { useEffect, useState, useCallback, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDoc,
  getDocs,
  doc,
  limit,
  startAfter,
  QueryConstraint,
  QueryDocumentSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../services/firebase';
import { MuralPost } from '../types';
import { useAuthStore } from '../stores/authStore';

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return new Date().toISOString();
}

const PAGE_SIZE = 20;

export function useMuralPosts(championshipId: string, round?: number) {
  const userId = useAuthStore((s) => s.user?.id);
  const [posts, setPosts] = useState<MuralPost[]>([]);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const likedRef = useRef<Set<string>>(new Set());
  const lastDocRef = useRef<QueryDocumentSnapshot | null>(null);
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!isFirebaseConfigured) return;

    const constraints: QueryConstraint[] = [
      where('championshipId', '==', championshipId),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE),
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
        setHasMore(newPosts.length >= PAGE_SIZE);
        lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;

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

  const loadMore = useCallback(async () => {
    if (!isFirebaseConfigured || loadingMore || !hasMore || !lastDocRef.current) return;

    setLoadingMore(true);
    try {
      const constraints: QueryConstraint[] = [
        where('championshipId', '==', championshipId),
        orderBy('createdAt', 'desc'),
        startAfter(lastDocRef.current),
        limit(PAGE_SIZE),
      ];
      if (round !== undefined && round > 0) {
        constraints.splice(1, 0, where('round', '==', round));
      }

      const q = query(collection(db, 'mural_posts'), ...constraints);
      const snap = await getDocs(q);

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

      if (newPosts.length > 0) {
        setPosts((prev) => [...prev, ...newPosts]);
        lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
        setHasMore(newPosts.length >= PAGE_SIZE);

        if (userId) {
          const checks = await Promise.all(
            newPosts.map(async (p) => {
              const likeSnap = await getDoc(doc(db, 'mural_posts', p.id, 'likes', userId));
              return likeSnap.exists() ? p.id : null;
            }),
          );
          checks.filter(Boolean).forEach((id) => likedRef.current.add(id as string));
          forceRender((n) => n + 1);
        }
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.warn('[useMuralPosts] loadMore error:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [championshipId, round, userId, loadingMore, hasMore]);

  return { posts, loading, loadingMore, hasMore, hasLiked, loadMore };
}
