import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useTeamStore } from '../stores/teamStore';
import { listenToAnnouncements, countUnread } from '../services/announcementsService';
import { isActiveRosterPlayer } from '../utils/teamRules';
import { Announcement } from '../types';

export function useAnnouncementsBadge(championshipId: string) {
  const user = useAuthStore((s) => s.user);
  const players = useTeamStore((s) => s.players);
  const teams = useTeamStore((s) => s.teams);
  const [unreadCount, setUnreadCount] = useState(0);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  // Só player ATIVO define "meu time" — doc 'sem_time' guarda o teamId antigo.
  const myPlayer = players.find(
    (p) =>
      p.userId === user?.id &&
      p.championshipId === championshipId &&
      isActiveRosterPlayer(p),
  );
  const myTeam = myPlayer ? teams.find((t) => t.id === myPlayer.teamId) : undefined;
  const teamId = myTeam?.id ?? null;

  useEffect(() => {
    if (!user?.id || !championshipId) return;

    const unsub = listenToAnnouncements(
      championshipId,
      user.id,
      teamId,
      user.role,
      (list) => {
        setAnnouncements(list);
        setUnreadCount(countUnread(list, user.id));
      },
    );

    return unsub;
  }, [user?.id, user?.role, championshipId, teamId]);

  return { unreadCount, hasUnread: unreadCount > 0, announcements };
}
