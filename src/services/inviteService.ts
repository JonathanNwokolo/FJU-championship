import { Linking } from 'react-native';
import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { addDocument, getCollection, getDocument, updateDocument } from './firestore';
import { auth, db } from './firebase';
import { notifyJoinRequest, notifyJoinRequestResult } from './notificationService';
import { JoinRequest, Player, Team, TeamInvite } from '../types';

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_MAX_PLAYERS = 15;

function randomCode() {
  return Array.from({ length: 6 }, () =>
    INVITE_CHARS.charAt(Math.floor(Math.random() * INVITE_CHARS.length)),
  ).join('');
}

function nextAvailableNumber(players: Player[]) {
  for (let number = 1; number <= 99; number += 1) {
    if (!players.some((player) => player.number === number)) {
      return number;
    }
  }
  return 99;
}

function hasActiveTeam(player: Player) {
  return !!player.teamId && player.status !== 'sem_time';
}

export async function generateInviteCode(): Promise<string> {
  while (true) {
    const code = randomCode();
    const existing = await getCollection<Team>('teams', [
      { field: 'inviteCode', operator: '==', value: code },
    ]);
    if (existing.length === 0) {
      return code;
    }
  }
}

export function createInviteLink(inviteCode: string): string {
  return `https://fjuchampionship.app/join/${inviteCode}`;
}

export async function createTeamInvite(team: Team): Promise<string> {
  const inviteData: Omit<TeamInvite, 'id'> = {
    teamId: team.id,
    teamName: team.name,
    championshipId: team.championshipId,
    inviteCode: team.inviteCode,
    createdBy: team.captainId,
    usedBy: null,
    usedAt: null,
    expiresAt: null,
    status: 'active',
  };

  return addDocument('team_invites', inviteData);
}

export async function invalidatePreviousInvites(teamId: string): Promise<void> {
  const invites = await getCollection<TeamInvite>('team_invites', [
    { field: 'teamId', operator: '==', value: teamId },
    { field: 'status', operator: '==', value: 'active' },
  ]);

  await Promise.all(
    invites.map((invite) =>
      updateDocument('team_invites', invite.id, {
        status: 'expired',
        expiresAt: new Date().toISOString(),
      }),
    ),
  );
}

export async function joinByCode(
  code: string,
  userId: string,
  userName: string,
): Promise<'success' | 'not_found' | 'full' | 'already_member' | 'closed' | 'already_in_championship' | 'team_not_approved'> {
  const normalizedCode = code.trim().toUpperCase();

  const teams = await getCollection<Team>('teams', [
    { field: 'inviteCode', operator: '==', value: normalizedCode },
  ]);
  const team = teams[0];

  if (!team) return 'not_found';
  if (team.status !== 'aprovado') return 'team_not_approved';
  if (team.registrationOpen === false) return 'closed';

  const teamPlayers = await getCollection<Player>('players', [
    { field: 'teamId', operator: '==', value: team.id },
  ]);

  if (teamPlayers.some((player) => player.userId === userId)) {
    return 'already_member';
  }

  // Verificar se o usuário já está em outro time do mesmo campeonato
  const userPlayersInChampionship = await getCollection<Player>('players', [
    { field: 'championshipId', operator: '==', value: team.championshipId },
    { field: 'userId', operator: '==', value: userId },
  ]);
  if (userPlayersInChampionship.some(hasActiveTeam)) {
    return 'already_in_championship';
  }

  const maxPlayers = team.maxPlayers ?? DEFAULT_MAX_PLAYERS;
  if (teamPlayers.length >= maxPlayers) {
    return 'full';
  }

  const playerNumber = nextAvailableNumber(teamPlayers);
  const playerData: Omit<Player, 'id'> = {
    teamId: team.id,
    championshipId: team.championshipId,
    userId,
    name: userName,
    position: 'meia',
    number: playerNumber,
  };

  await addDocument('players', playerData);
  await updateDocument('users', userId, {
    teamId: team.id,
    championshipId: team.championshipId,
  });

  const invites = await getCollection<TeamInvite>('team_invites', [
    { field: 'inviteCode', operator: '==', value: normalizedCode },
    { field: 'status', operator: '==', value: 'active' },
  ]);

  await Promise.all(
    invites.map((invite) =>
      updateDocument('team_invites', invite.id, {
        usedBy: userId,
        usedAt: new Date().toISOString(),
        status: 'used',
      }),
    ),
  );

  return 'success';
}

export async function requestToJoin(
  teamId: string,
  requesterId: string,
  requesterName: string,
): Promise<'success' | 'already_pending' | 'team_not_found' | 'closed' | 'already_member' | 'full' | 'already_in_championship'> {
  const pending = await getCollection<JoinRequest>('join_requests', [
    { field: 'teamId', operator: '==', value: teamId },
    { field: 'requesterId', operator: '==', value: requesterId },
    { field: 'status', operator: '==', value: 'pending' },
  ]);

  if (pending.length > 0) {
    return 'already_pending';
  }

  const team = await getDocument<Team>('teams', teamId);
  if (!team) return 'team_not_found';
  if (team.registrationOpen === false) return 'closed';

  const roster = await getCollection<Player>('players', [
    { field: 'teamId', operator: '==', value: teamId },
  ]);
  if (roster.some((player) => player.userId === requesterId)) return 'already_member';
  if (roster.length >= (team.maxPlayers ?? DEFAULT_MAX_PLAYERS)) return 'full';

  // Verificar se o usuário já está em outro time do mesmo campeonato
  const userPlayersInChampionship = await getCollection<Player>('players', [
    { field: 'championshipId', operator: '==', value: team.championshipId },
    { field: 'userId', operator: '==', value: requesterId },
  ]);
  if (userPlayersInChampionship.some(hasActiveTeam)) {
    return 'already_in_championship';
  }

  const userData = await getDocument<{ photoUrl?: string }>('users', requesterId);

  await addDocument('join_requests', {
    teamId,
    teamName: team.name,
    championshipId: team.championshipId,
    requesterId,
    requesterName,
    requesterPhotoUrl: userData?.photoUrl ?? '',
    status: 'pending',
    respondedAt: null,
  });

  const updatedPendingRequests = Array.from(new Set([...(team.pendingRequests ?? []), requesterId]));
  await updateDocument('teams', teamId, { pendingRequests: updatedPendingRequests });
  await notifyJoinRequest(team.captainId, team.name, requesterName);
  return 'success';
}

export async function respondToRequest(
  requestId: string,
  approved: boolean,
  teamId: string,
  requesterId: string,
): Promise<void> {
  const requests = await getCollection<JoinRequest>('join_requests', [
    { field: 'teamId', operator: '==', value: teamId },
    { field: 'requesterId', operator: '==', value: requesterId },
    { field: 'status', operator: '==', value: 'pending' },
  ]);
  const request = requests.find((item) => item.id === requestId) ?? requests[0];
  if (!request) return;

  await updateDocument('join_requests', requestId, {
    status: approved ? 'approved' : 'rejected',
    respondedAt: new Date().toISOString(),
  });

  const team = await getDocument<Team>('teams', teamId);

  if (team) {
    await updateDocument('teams', teamId, {
      pendingRequests: (team.pendingRequests ?? []).filter((id) => id !== requesterId),
    });
  }

  if (approved && team) {
    const teamPlayers = await getCollection<Player>('players', [
      { field: 'teamId', operator: '==', value: teamId },
    ]);
    if (!teamPlayers.some((player) => player.userId === requesterId)) {
      await addDocument('players', {
        teamId,
        championshipId: team.championshipId,
        userId: requesterId,
        name: request.requesterName,
        position: 'meia',
        number: nextAvailableNumber(teamPlayers),
        photoUrl: request.requesterPhotoUrl,
      });
    }
    await updateDocument('users', requesterId, {
      teamId,
      championshipId: team.championshipId,
    });
  }

  await notifyJoinRequestResult(
    requesterId,
    approved,
    request.teamName,
  );
}

export async function shareInviteViaWhatsApp(
  teamName: string,
  inviteCode: string,
  championshipName: string,
) {
  const msg = `🏆 Você foi convidado para o time *${teamName}* na *${championshipName}*!\n\nBaixe o app FJU Championship e use o código: *${inviteCode}*`;
  return Linking.openURL(`whatsapp://send?text=${encodeURIComponent(msg)}`);
}

export async function regenerateTeamInvite(team: Team) {
  const inviteCode = await generateInviteCode();
  const inviteLink = createInviteLink(inviteCode);

  await invalidatePreviousInvites(team.id);
  await updateDocument('teams', team.id, { inviteCode, inviteLink });
  await createTeamInvite({ ...team, inviteCode, inviteLink });

  return { inviteCode, inviteLink };
}

// ─── Waitlist Functions ───────────────────────────────────────────────────────

export async function joinWaitlist(
  teamId: string,
  requesterId: string,
  requesterName: string,
): Promise<'success' | 'already_waiting' | 'error'> {
  try {
    // Check if already in waitlist
    const existing = await getCollection<JoinRequest>('join_requests', [
      { field: 'teamId', operator: '==', value: teamId },
      { field: 'requesterId', operator: '==', value: requesterId },
      { field: 'type', operator: '==', value: 'waitlist' },
      { field: 'status', operator: '==', value: 'pending' },
    ]);

    if (existing.length > 0) {
      return 'already_waiting';
    }

    const team = await getDocument<Team>('teams', teamId);
    if (!team) return 'error';

    const userData = await getDocument<{ photoUrl?: string }>('users', requesterId);

    await addDocument('join_requests', {
      teamId,
      teamName: team.name,
      championshipId: team.championshipId,
      requesterId,
      requesterName,
      requesterPhotoUrl: userData?.photoUrl ?? '',
      status: 'pending',
      type: 'waitlist',
      respondedAt: null,
    });

    return 'success';
  } catch (error) {
    console.warn('[inviteService] joinWaitlist error:', error);
    return 'error';
  }
}

export async function getWaitlistPosition(
  teamId: string,
  requesterId: string,
): Promise<number> {
  const waitlist = await getCollection<JoinRequest>('join_requests', [
    { field: 'teamId', operator: '==', value: teamId },
    { field: 'type', operator: '==', value: 'waitlist' },
    { field: 'status', operator: '==', value: 'pending' },
  ]);

  // Sort by createdAt to get position
  waitlist.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  
  const position = waitlist.findIndex((r) => r.requesterId === requesterId);
  return position >= 0 ? position + 1 : 0;
}

export async function processWaitlistOnVacancy(teamId: string): Promise<void> {
  const team = await getDocument<Team>('teams', teamId);
  if (!team) return;

  const roster = await getCollection<Player>('players', [
    { field: 'teamId', operator: '==', value: teamId },
  ]);

  const maxPlayers = team.maxPlayers ?? DEFAULT_MAX_PLAYERS;
  if (roster.length >= maxPlayers) return;

  // Get first person in waitlist
  const waitlist = await getCollection<JoinRequest>('join_requests', [
    { field: 'teamId', operator: '==', value: teamId },
    { field: 'type', operator: '==', value: 'waitlist' },
    { field: 'status', operator: '==', value: 'pending' },
  ]);

  if (waitlist.length === 0) return;

  // Sort by createdAt and get first
  waitlist.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const firstInLine = waitlist[0];

  // Notify the first person in waitlist that a spot opened
  try {
    const { notifyWaitlistSpotAvailable } = await import('./notificationService');
    await notifyWaitlistSpotAvailable(
      firstInLine.requesterId,
      team.name,
      team.inviteCode,
    );
  } catch (error) {
    console.warn('[inviteService] Failed to notify waitlist:', error);
  }
}

export type LeaveTeamResult =
  | 'success'
  | 'not_authenticated'
  | 'not_found'
  | 'not_allowed'
  | 'championship_finished'
  | 'blocked_only_player_pending_matches';

export async function leaveTeam(
  playerId: string,
  teamId: string,
  championshipId: string,
): Promise<LeaveTeamResult> {
  const userId = auth.currentUser?.uid;
  if (!userId) return 'not_authenticated';

  const rosterSnapshot = await getDocs(query(collection(db, 'players'), where('teamId', '==', teamId)));
  const matchSnapshot = await getDocs(query(collection(db, 'matches'), where('championshipId', '==', championshipId)));
  const waitlistSnapshot = await getDocs(query(
    collection(db, 'join_requests'),
    where('championshipId', '==', championshipId),
    where('requesterId', '==', userId),
    where('status', '==', 'pending'),
  ));

  return runTransaction(db, async (transaction) => {
    const playerRef = doc(db, 'players', playerId);
    const teamRef = doc(db, 'teams', teamId);
    const championshipRef = doc(db, 'championships', championshipId);
    const userRef = doc(db, 'users', userId);

    const [playerSnap, teamSnap, championshipSnap] = await Promise.all([
      transaction.get(playerRef),
      transaction.get(teamRef),
      transaction.get(championshipRef),
    ]);

    if (!playerSnap.exists() || !teamSnap.exists() || !championshipSnap.exists()) {
      return 'not_found';
    }

    const player = { id: playerSnap.id, ...playerSnap.data() } as Player;
    const team = { id: teamSnap.id, ...teamSnap.data() } as Team;
    const championship = championshipSnap.data();

    if (player.userId !== userId || player.teamId !== teamId || team.championshipId !== championshipId) {
      return 'not_allowed';
    }

    if (team.captainId === userId) {
      return 'not_allowed';
    }

    if (championship.status === 'finalizado') {
      return 'championship_finished';
    }

    const rosterSnaps = await Promise.all(
      rosterSnapshot.docs.map((rosterDoc) => transaction.get(rosterDoc.ref)),
    );
    const activeRoster = rosterSnaps
      .filter((snap) => snap.exists())
      .map((snap) => ({ id: snap.id, ...snap.data() }) as Player)
      .filter((rosterPlayer) => rosterPlayer.teamId === teamId && rosterPlayer.status !== 'sem_time');

    const matchSnaps = await Promise.all(
      matchSnapshot.docs.map((matchDoc) => transaction.get(matchDoc.ref)),
    );
    const hasPendingTeamMatch = matchSnaps
      .filter((snap) => snap.exists())
      .some((snap) => {
        const match = snap.data();
        return (
          match.championshipId === championshipId &&
          match.status !== 'finalizado' &&
          (match.homeTeamId === teamId || match.awayTeamId === teamId)
        );
      });

    if (activeRoster.length <= 1 && hasPendingTeamMatch) {
      return 'blocked_only_player_pending_matches';
    }

    transaction.update(playerRef, {
      teamId: null,
      status: 'sem_time',
      leftAt: serverTimestamp(),
    });

    transaction.update(userRef, {
      teamId: null,
      championshipId: null,
    });

    waitlistSnapshot.docs.forEach((requestDoc) => {
      const request = requestDoc.data() as JoinRequest;
      if (request.type === 'waitlist' || request.teamId === teamId) {
        transaction.delete(requestDoc.ref);
      }
    });

    return 'success';
  });
}
