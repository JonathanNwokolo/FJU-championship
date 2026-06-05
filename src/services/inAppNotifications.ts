import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  writeBatch,
  getDocs,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { InAppNotification, InAppNotificationType } from '../types';

const COL = 'in_app_notifications';

export async function saveInAppNotification(
  userIds: string[],
  type: InAppNotificationType,
  title: string,
  body: string,
  data: Record<string, string | number> = {},
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    const batch = writeBatch(db);
    const colRef = collection(db, COL);
    for (const userId of userIds) {
      const ref = doc(colRef);
      batch.set(ref, {
        userId,
        type,
        title,
        body,
        data,
        read: false,
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (e) {
    console.warn('[inAppNotifications] saveInAppNotification error:', e);
  }
}

export function listenToNotifications(
  userId: string,
  onChange: (notifications: InAppNotification[]) => void,
): () => void {
  const q = query(
    collection(db, COL),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
  );

  return onSnapshot(q, (snap) => {
    const notifications: InAppNotification[] = snap.docs.map((d) => {
      const data = d.data();
      const createdAt =
        data.createdAt instanceof Timestamp
          ? data.createdAt.toDate().toISOString()
          : data.createdAt ?? new Date().toISOString();
      return {
        id: d.id,
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        data: data.data,
        read: data.read ?? false,
        createdAt,
      } as InAppNotification;
    });
    onChange(notifications);
  });
}

export async function markAsRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, COL, notificationId), { read: true });
  } catch (e) {
    console.warn('[inAppNotifications] markAsRead error:', e);
  }
}

export async function markAllAsRead(userId: string): Promise<void> {
  try {
    const q = query(collection(db, COL), where('userId', '==', userId), where('read', '==', false));
    const snap = await getDocs(q);
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
    await batch.commit();
  } catch (e) {
    console.warn('[inAppNotifications] markAllAsRead error:', e);
  }
}
