import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { listenToNotifications } from '../services/inAppNotifications';

export function useNotificationBadge() {
  const user = useAuthStore((s) => s.user);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    const unsub = listenToNotifications(user.id, (notifications) => {
      setUnreadCount(notifications.filter((n) => !n.read).length);
    });
    return unsub;
  }, [user?.id]);

  return { unreadCount, hasUnread: unreadCount > 0 };
}
