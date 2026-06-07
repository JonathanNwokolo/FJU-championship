import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  arrayUnion,
  getDocs,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  Announcement,
  AnnouncementAudience,
  AnnouncementPriority,
  UserRole,
} from '../types';
import { getTokensForChampionship, getTokensForUsers, sendPushNotification } from './notificationService';

const COL = 'announcements';

// ── Create ────────────────────────────────────────────────────────────────────

export async function createAnnouncement(data: {
  championshipId: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  title: string;
  body: string;
  targetAudience: AnnouncementAudience;
  targetTeamId?: string;
  priority: AnnouncementPriority;
}): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    readBy: [],
    createdAt: serverTimestamp(),
  });

  // Fire push notifications for the target audience (best-effort)
  notifyAudienceForAnnouncement(data).catch(() => {});

  return ref.id;
}

async function notifyAudienceForAnnouncement(data: {
  championshipId: string;
  authorName: string;
  title: string;
  body: string;
  targetAudience: AnnouncementAudience;
  targetTeamId?: string;
}): Promise<void> {
  try {
    let tokens: string[] = [];

    if (data.targetAudience === 'todos') {
      tokens = await getTokensForChampionship(data.championshipId);
    } else if (data.targetAudience === 'time_especifico' && data.targetTeamId) {
      // Get players from specific team
      const q = query(
        collection(db, 'players'),
        where('teamId', '==', data.targetTeamId),
        where('championshipId', '==', data.championshipId),
      );
      const snap = await getDocs(q);
      const userIds = snap.docs.map((d) => d.data().userId).filter(Boolean) as string[];
      tokens = await getTokensForUsers(userIds);
    } else {
      // capitaes or atletas — get all then filter client-side via push (simplified: send to all)
      tokens = await getTokensForChampionship(data.championshipId);
    }

    if (tokens.length > 0) {
      const prefix = data.targetAudience === 'todos' ? '' : '📢 ';
      await sendPushNotification(
        tokens,
        `${prefix}${data.authorName}: ${data.title}`,
        data.body,
        { type: 'announcement', championshipId: data.championshipId },
      );
    }
  } catch (e) {
    console.warn('[announcements] notifyAudience error:', e);
  }
}

// ── Listen ────────────────────────────────────────────────────────────────────

export function listenToAnnouncements(
  championshipId: string,
  userId: string,
  teamId: string | null,
  role: UserRole,
  onChange: (announcements: Announcement[]) => void,
): () => void {
  const q = query(
    collection(db, COL),
    where('championshipId', '==', championshipId),
    orderBy('createdAt', 'desc'),
  );

  return onSnapshot(
    q,
    (snap) => {
      const all = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          championshipId: data.championshipId,
          authorId: data.authorId,
          authorName: data.authorName,
          authorRole: data.authorRole,
          title: data.title,
          body: data.body,
          targetAudience: data.targetAudience,
          targetTeamId: data.targetTeamId,
          priority: data.priority ?? 'normal',
          createdAt:
            data.createdAt instanceof Timestamp
              ? data.createdAt.toDate().toISOString()
              : data.createdAt ?? new Date().toISOString(),
          readBy: data.readBy ?? [],
        } as Announcement;
      });

      const filtered = all.filter((a: Announcement) => {
        if (role === 'organizador') return true;
        if (a.targetAudience === 'todos') return true;
        if (a.targetAudience === 'capitaes') return role === 'capitao';
        if (a.targetAudience === 'atletas') return role === 'atleta';
        if (a.targetAudience === 'time_especifico') return a.targetTeamId === teamId;
        return false;
      });

      onChange(filtered);
    },
    (error) => {
      console.warn('[announcementsService] listenToAnnouncements error:', error);
      // Retorna lista vazia em caso de erro para encerrar o loading
      onChange([]);
    },
  );
}

// ── Mark as read ──────────────────────────────────────────────────────────────

export async function markAnnouncementAsRead(
  announcementId: string,
  userId: string,
): Promise<void> {
  try {
    await updateDoc(doc(db, COL, announcementId), {
      readBy: arrayUnion(userId),
    });
  } catch (e) {
    console.warn('[announcements] markAsRead error:', e);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function countUnread(announcements: Announcement[], userId: string): number {
  return announcements.filter((a) => !a.readBy.includes(userId)).length;
}

export const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  todos: 'Todos',
  capitaes: 'Só capitães',
  atletas: 'Só atletas',
  time_especifico: 'Time específico',
};
