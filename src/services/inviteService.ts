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
import {
  addDocument,
  deleteDocument,
  getCollection,
  getDocument,
  setDocument,
  updateDocument,
} from './firestore';
import { auth, db } from './firebase';
import { notifyJoinRequest, notifyJoinRequestResult } from './notificationService';
import { Championship, JoinRequest, MatchEvent, Player, Team, TeamInvite } from '../types';
import {
  countActivePlayersInTeam as countActivePlayers,
  isActiveRosterPlayer,
  isPlayerInTeamActive,
  isTeamCaptain,
} from '../utils/teamRules';
import { MOCK_DATA_ENABLED as USE_MOCK } from '../config/appConfig';
import { getMockActiveUser } from '../mocks/mockDb';

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_MAX_PLAYERS = 15;

function teamMembershipId(teamId: string, userId: string): string {
  return `${teamId}_${userId}`;
}

function activeTeamMembership(data: {
  teamId: string;
  championshipId: string;
  userId: string;
  playerId: string;
}) {
  return {
    teamId: data.teamId,
    championshipId: data.championshipId,
    userId: data.userId,
    playerId: data.playerId,
    status: 'ativo',
    updatedAt: new Date().toISOString(),
  };
}

async function setActiveTeamMembership(data: {
  teamId: string;
  championshipId: string;
  userId: string;
  playerId: string;
}): Promise<void> {
  await setDocument('team_memberships', teamMembershipId(data.teamId, data.userId), activeTeamMembership(data));
}

async function markTeamMembershipInactive(
  teamId: string,
  userId: string,
  status: 'sem_time' | 'removido',
): Promise<void> {
  const id = teamMembershipId(teamId, userId);
  const existing = await getDocument('team_memberships', id);
  if (!existing) return;
  await updateDocument('team_memberships', id, {
    status,
    leftAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Recalcula e grava approvedPlayersCount do time a partir do elenco real.
 * Auto-corrige qualquer drift e deve ser chamado após adições/remoções fora do
 * fluxo transacional de aprovação (ex.: atleta avulso adicionado pelo capitão).
 */
export async function recomputeApprovedCount(teamId: string): Promise<void> {
  const roster = await getCollection<Player>('players', [
    { field: 'teamId', operator: '==', value: teamId },
  ]);
  await updateDocument('teams', teamId, {
    approvedPlayersCount: countActivePlayers(roster, teamId),
  });
}

/**
 * AUD-05: regra única de "inscrições abertas" para um campeonato.
 * Bloqueia entrada quando o campeonato já começou, foi finalizado, teve as
 * inscrições encerradas manualmente ou o prazo (registrationDeadline) já passou.
 */
async function isChampionshipOpenForRegistration(championshipId: string): Promise<boolean> {
  const championship = await getDocument<Championship>('championships', championshipId);
  if (!championship) return false;
  if (championship.status === 'em_andamento' || championship.status === 'finalizado') return false;
  if (championship.registrationsClosed === true) return false;
  if (
    championship.registrationDeadline &&
    new Date(championship.registrationDeadline).getTime() < Date.now()
  ) {
    return false;
  }
  return true;
}

function randomCode() {
  return Array.from({ length: 6 }, () =>
    INVITE_CHARS.charAt(Math.floor(Math.random() * INVITE_CHARS.length)),
  ).join('');
}

export function nextAvailableNumber(players: Player[]) {
  // P-20: apenas jogadores ATIVOS reservam um número. Quem saiu (sem_time/removido)
  // mantém o teamId antigo no doc, mas seu número volta a ficar livre para reuso —
  // antes esses números ficavam "presos" em elencos com rotatividade.
  const taken = new Set(
    players.filter(isActiveRosterPlayer).map((player) => player.number),
  );
  for (let number = 1; number <= 99; number += 1) {
    if (!taken.has(number)) {
      return number;
    }
  }
  return 99;
}

function hasActiveTeam(player: Player) {
  return !!player.teamId && isActiveRosterPlayer(player);
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

export type CreateTeamRegistrationResult =
  | { status: 'success'; team: Team; inviteCode: string }
  | {
      status:
        | 'championship_not_found'
        | 'closed'
        | 'captain_already_has_team'
        | 'max_teams_reached'
        | 'duplicate_name';
    };

export interface CreateTeamRegistrationInput {
  teamId: string;
  championshipId: string;
  captainId: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  logoPreset?: string;
  logoUrl?: string;
}

function normalizeTeamName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

function championshipIsClosedForTeamCreate(championship: Championship): boolean {
  return (
    championship.status === 'em_andamento' ||
    championship.status === 'finalizado' ||
    championship.registrationsClosed === true ||
    !!(
      championship.registrationDeadline &&
      new Date(championship.registrationDeadline).getTime() < Date.now()
    )
  );
}

export async function createTeamRegistration(
  input: CreateTeamRegistrationInput,
): Promise<CreateTeamRegistrationResult> {
  const trimmedName = input.name.trim();
  const normalizedName = normalizeTeamName(trimmedName);
  const inviteCode = await generateInviteCode();
  const inviteLink = createInviteLink(inviteCode);

  if (USE_MOCK) {
    const championship = await getDocument<Championship>('championships', input.championshipId);
    if (!championship) return { status: 'championship_not_found' };
    if (championshipIsClosedForTeamCreate(championship)) return { status: 'closed' };

    const existingTeams = await getCollection<Team>('teams', [
      { field: 'championshipId', operator: '==', value: input.championshipId },
    ]);
    const activeTeams = existingTeams.filter((team) => team.status !== 'rejeitado');
    if (activeTeams.some((team) => team.captainId === input.captainId)) {
      return { status: 'captain_already_has_team' };
    }
    if (activeTeams.some((team) => normalizeTeamName(team.name) === normalizedName)) {
      return { status: 'duplicate_name' };
    }
    if (championship.maxTeams != null && activeTeams.length >= championship.maxTeams) {
      return { status: 'max_teams_reached' };
    }

    const team: Team = {
      id: input.teamId,
      championshipId: input.championshipId,
      name: trimmedName,
      primaryColor: input.primaryColor,
      secondaryColor: input.secondaryColor,
      captainId: input.captainId,
      status: championship.rules?.manualApproval !== false ? 'pendente' : 'aprovado',
      inviteCode,
      inviteLink,
      maxPlayers: championship.maxPlayers ?? DEFAULT_MAX_PLAYERS,
      registrationOpen: true,
      pendingRequests: [],
      approvedPlayersCount: 0,
      createdAt: new Date().toISOString(),
      ...(input.logoPreset && { logoPreset: input.logoPreset }),
      ...(input.logoUrl && { logoUrl: input.logoUrl }),
    };

    await setDocument('teams', input.teamId, team);
    await setDocument('team_invites', input.teamId, {
      teamId: team.id,
      teamName: team.name,
      championshipId: team.championshipId,
      inviteCode,
      createdBy: team.captainId,
      usedBy: null,
      usedAt: null,
      expiresAt: null,
      status: 'active',
    });
    await updateDocument('championships', input.championshipId, {
      registeredTeamsCount: activeTeams.length + 1,
      lastTeamRegistrationId: input.teamId,
    });
    return { status: 'success', team, inviteCode };
  }

  return runTransaction(db, async (transaction) => {
    const championshipRef = doc(db, 'championships', input.championshipId);
    const teamRef = doc(db, 'teams', input.teamId);
    const inviteRef = doc(db, 'team_invites', input.teamId);

    const championshipSnap = await transaction.get(championshipRef);
    if (!championshipSnap.exists()) return { status: 'championship_not_found' };
    const championship = { id: championshipSnap.id, ...championshipSnap.data() } as Championship;
    if (championshipIsClosedForTeamCreate(championship)) return { status: 'closed' };

    const teamsSnapshot = await getDocs(
      query(collection(db, 'teams'), where('championshipId', '==', input.championshipId)),
    );
    const teams = teamsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Team);
    const activeTeams = teams.filter((team) => team.status !== 'rejeitado');

    if (activeTeams.some((team) => team.captainId === input.captainId)) {
      return { status: 'captain_already_has_team' };
    }
    if (activeTeams.some((team) => normalizeTeamName(team.name) === normalizedName)) {
      return { status: 'duplicate_name' };
    }
    if (championship.maxTeams != null && activeTeams.length >= championship.maxTeams) {
      return { status: 'max_teams_reached' };
    }

    const team: Team = {
      id: input.teamId,
      championshipId: input.championshipId,
      name: trimmedName,
      primaryColor: input.primaryColor,
      secondaryColor: input.secondaryColor,
      captainId: input.captainId,
      status: championship.rules?.manualApproval !== false ? 'pendente' : 'aprovado',
      inviteCode,
      inviteLink,
      maxPlayers: championship.maxPlayers ?? DEFAULT_MAX_PLAYERS,
      registrationOpen: true,
      pendingRequests: [],
      approvedPlayersCount: 0,
      createdAt: new Date().toISOString(),
      ...(input.logoPreset && { logoPreset: input.logoPreset }),
      ...(input.logoUrl && { logoUrl: input.logoUrl }),
    };

    transaction.set(teamRef, {
      ...team,
      createdAt: serverTimestamp(),
    });
    transaction.set(inviteRef, {
      teamId: team.id,
      teamName: team.name,
      championshipId: team.championshipId,
      inviteCode,
      createdBy: team.captainId,
      usedBy: null,
      usedAt: null,
      expiresAt: null,
      status: 'active',
      createdAt: serverTimestamp(),
    });
    transaction.update(championshipRef, {
      registeredTeamsCount: activeTeams.length + 1,
      lastTeamRegistrationId: input.teamId,
    });

    return { status: 'success', team, inviteCode };
  });
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
): Promise<'success' | 'not_found' | 'full' | 'already_member' | 'closed' | 'already_in_championship' | 'team_not_approved' | 'championship_closed'> {
  const normalizedCode = code.trim().toUpperCase();

  const teams = await getCollection<Team>('teams', [
    { field: 'inviteCode', operator: '==', value: normalizedCode },
  ]);
  const team = teams[0];

  if (!team) return 'not_found';
  if (team.status !== 'aprovado') return 'team_not_approved';
  if (team.registrationOpen === false) return 'closed';

  // AUD-05: inscrições só são permitidas com o campeonato aberto e dentro do prazo.
  if (!(await isChampionshipOpenForRegistration(team.championshipId))) {
    return 'championship_closed';
  }

  const teamPlayers = await getCollection<Player>('players', [
    { field: 'teamId', operator: '==', value: team.id },
  ]);

  if (teamPlayers.some((player) => player.userId === userId && isActiveRosterPlayer(player))) {
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

  if (USE_MOCK) {
    // Demo (cliente único): caminho simples por wrappers.
    const activeCount = countActivePlayers(teamPlayers, team.id);
    if (activeCount >= maxPlayers) {
      return 'full';
    }
    const playerData: Omit<Player, 'id'> = {
      teamId: team.id,
      championshipId: team.championshipId,
      userId,
      name: userName,
      position: 'meia',
      number: nextAvailableNumber(teamPlayers),
      status: 'ativo',
    };
    const playerId = await addDocument('players', playerData);
    await setActiveTeamMembership({
      teamId: team.id,
      championshipId: team.championshipId,
      userId,
      playerId,
    });
    await updateDocument('users', userId, {
      teamId: team.id,
      championshipId: team.championshipId,
    });
    await updateDocument('teams', team.id, {
      approvedPlayersCount: activeCount + 1,
    });
  } else {
    // P-07: capacidade + criação do player ATÔMICAS, com lock no doc do time
    // (mesmo padrão já provado em approveJoinRequest). Antes, a checagem de vaga e o
    // addDocument eram passos separados: dois atletas usando o mesmo código ao mesmo
    // tempo podiam ambos passar pela checagem e estourar maxPlayers.
    const txResult = await runTransaction<
      | 'success'
      | 'full'
      | 'already_member'
      | 'not_found'
      | 'team_not_approved'
      | 'closed'
      | 'championship_closed'
      | 'already_in_championship'
    >(db, async (transaction) => {
      const teamRef = doc(db, 'teams', team.id);
      const championshipRef = doc(db, 'championships', team.championshipId);
      const userRef = doc(db, 'users', userId);
      const teamSnap = await transaction.get(teamRef);
      if (!teamSnap.exists()) return 'not_found';
      const freshTeam = { id: teamSnap.id, ...teamSnap.data() } as Team;
      if (freshTeam.inviteCode !== normalizedCode) return 'not_found';
      if (freshTeam.status !== 'aprovado') return 'team_not_approved';
      if (freshTeam.registrationOpen === false) return 'closed';

      const championshipSnap = await transaction.get(championshipRef);
      if (!championshipSnap.exists()) return 'championship_closed';
      const championship = { id: championshipSnap.id, ...championshipSnap.data() } as Championship;
      if (
        championship.status === 'em_andamento' ||
        championship.status === 'finalizado' ||
        championship.registrationsClosed === true ||
        (championship.registrationDeadline &&
          new Date(championship.registrationDeadline).getTime() < Date.now())
      ) {
        return 'championship_closed';
      }
      await transaction.get(userRef);

      // Elenco real relido dentro do callback: em retry por contenção no doc do
      // time, a query é refeita e enxerga players recém-criados.
      const [rosterSnapshot, userPlayersSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'players'), where('teamId', '==', team.id))),
        getDocs(
          query(
            collection(db, 'players'),
            where('championshipId', '==', freshTeam.championshipId),
            where('userId', '==', userId),
          ),
        ),
      ]);
      const roster = rosterSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Player);
      const userPlayers = userPlayersSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Player);

      if (roster.some((p) => p.userId === userId && isActiveRosterPlayer(p))) {
        return 'already_member';
      }
      if (userPlayers.some(hasActiveTeam)) {
        return 'already_in_championship';
      }
      const freshMax = freshTeam.maxPlayers ?? DEFAULT_MAX_PLAYERS;
      const activeCount = countActivePlayers(roster, team.id);
      if (activeCount >= freshMax) return 'full';

      const newPlayerRef = doc(collection(db, 'players'));
      transaction.set(newPlayerRef, {
        teamId: team.id,
        championshipId: team.championshipId,
        userId,
        name: userName,
        position: 'meia',
        number: nextAvailableNumber(roster),
        status: 'ativo',
        createdAt: serverTimestamp(),
      });
      transaction.update(teamRef, {
        approvedPlayersCount: activeCount + 1,
      });
      transaction.set(doc(db, 'team_memberships', teamMembershipId(team.id, userId)), {
        teamId: team.id,
        championshipId: team.championshipId,
        userId,
        playerId: newPlayerRef.id,
        status: 'ativo',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      // O atleta é dono do próprio /users → pode atualizá-lo na mesma transação.
      transaction.update(userRef, {
        teamId: team.id,
        championshipId: team.championshipId,
      });
      return 'success';
    });

    if (txResult !== 'success') return txResult;
  }
  // approvedPlayersCount ja foi atualizado nos caminhos acima; daqui para baixo
  // apenas marcamos os convites ativos como usados.

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
): Promise<
  | 'success'
  | 'already_pending'
  | 'team_not_found'
  | 'closed'
  | 'already_member'
  | 'full'
  | 'already_in_championship'
  | 'team_not_approved'
  | 'championship_closed'
> {
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
  if (team.status !== 'aprovado') return 'team_not_approved';
  if (team.registrationOpen === false) return 'closed';
  if (!(await isChampionshipOpenForRegistration(team.championshipId))) {
    return 'championship_closed';
  }

  const roster = await getCollection<Player>('players', [
    { field: 'teamId', operator: '==', value: teamId },
  ]);
  if (roster.some((player) => player.userId === requesterId && isActiveRosterPlayer(player))) {
    return 'already_member';
  }
  if (countActivePlayers(roster, teamId) >= (team.maxPlayers ?? DEFAULT_MAX_PLAYERS)) return 'full';

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

  // NÃO atualizar teams.pendingRequests: o atleta não tem permissão de update em
  // /teams (rules). O capitão enxerga os pedidos via query em /join_requests.
  await notifyJoinRequest(team.captainId, team.name, requesterName);
  return 'success';
}

/**
 * AUD-06 + P1: aprovação de atleta dentro de uma runTransaction.
 * A capacidade é SEMPRE calculada a partir do elenco real em /players
 * (ativo/suspenso/lesionado ocupam vaga; sem_time/removido não).
 * team.approvedPlayersCount é cache/lock denormalizado: a capacidade ainda é
 * calculada pelo elenco real, mas a transação lê E escreve o MESMO documento do
 * time para serializar aprovações simultâneas. No retry o elenco é recarregado e
 * enxerga o atleta já aprovado.
 * Ao aprovar, approvedPlayersCount é regravado a partir do elenco real
 * (mantido apenas como cache denormalizado, auto-corrigido a cada aprovação).
 */
export async function approveJoinRequest(
  teamId: string,
  requesterId: string,
  requesterName: string,
  requesterPhotoUrl: string,
): Promise<'success' | 'full' | 'already_member' | 'team_not_found'> {
  if (USE_MOCK) {
    const team = await getDocument<Team>('teams', teamId);
    if (!team) return 'team_not_found';

    const roster = await getCollection<Player>('players', [
      { field: 'teamId', operator: '==', value: teamId },
    ]);
    if (roster.some((p) => p.userId === requesterId && isActiveRosterPlayer(p))) {
      return 'already_member';
    }

    const activeCount = countActivePlayers(roster, teamId);
    if (activeCount >= (team.maxPlayers ?? DEFAULT_MAX_PLAYERS)) return 'full';

    const playerId = await addDocument('players', {
      teamId,
      championshipId: team.championshipId,
      userId: requesterId,
      name: requesterName,
      position: 'meia',
      number: nextAvailableNumber(roster),
      photoUrl: requesterPhotoUrl ?? '',
      status: 'ativo',
      joinedAt: new Date().toISOString(),
    });
    await setActiveTeamMembership({
      teamId,
      championshipId: team.championshipId,
      userId: requesterId,
      playerId,
    });
    await updateDocument('teams', teamId, {
      approvedPlayersCount: activeCount + 1,
      pendingRequests: (team.pendingRequests ?? []).filter((id) => id !== requesterId),
    });

    return 'success';
  }

  return runTransaction(db, async (transaction) => {
    const teamRef = doc(db, 'teams', teamId);
    const teamSnap = await transaction.get(teamRef);
    if (!teamSnap.exists()) return 'team_not_found';
    const team = { id: teamSnap.id, ...teamSnap.data() } as Team;

    // Elenco real lido DENTRO do callback: se a transação fizer retry por
    // contenção no doc do time, a query é refeita e vê o player recém-criado.
    const rosterSnapshot = await getDocs(
      query(collection(db, 'players'), where('teamId', '==', teamId)),
    );
    const roster = rosterSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Player);

    if (roster.some((p) => p.userId === requesterId && isActiveRosterPlayer(p))) {
      return 'already_member';
    }

    const maxPlayers = team.maxPlayers ?? DEFAULT_MAX_PLAYERS;
    const activeCount = countActivePlayers(roster, teamId);
    if (activeCount >= maxPlayers) return 'full';

    const newPlayerRef = doc(collection(db, 'players'));
    transaction.set(newPlayerRef, {
      teamId,
      championshipId: team.championshipId,
      userId: requesterId,
      name: requesterName,
      position: 'meia',
      number: nextAvailableNumber(roster),
      photoUrl: requesterPhotoUrl ?? '',
      status: 'ativo',
      joinedAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
    });
    transaction.set(doc(db, 'team_memberships', teamMembershipId(teamId, requesterId)), {
      teamId,
      championshipId: team.championshipId,
      userId: requesterId,
      playerId: newPlayerRef.id,
      status: 'ativo',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.update(teamRef, {
      approvedPlayersCount: activeCount + 1,
      pendingRequests: (team.pendingRequests ?? []).filter((id) => id !== requesterId),
    });

    return 'success';
  });
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

  if (approved) {
    const result = await approveJoinRequest(
      teamId,
      requesterId,
      request.requesterName,
      request.requesterPhotoUrl,
    );
    if (result === 'full') {
      throw new Error('Elenco já está completo.');
    }
    if (result === 'team_not_found') {
      throw new Error('Time não encontrado.');
    }

    // 'success' ou 'already_member': confirma a solicitação e vincula o usuário.
    await updateDocument('join_requests', requestId, {
      status: 'approved',
      respondedAt: new Date().toISOString(),
    });
    // Limpeza idempotente de pendingRequests (a transação já remove no caso success).
    const team = await getDocument<Team>('teams', teamId);
    if (team) {
      await updateDocument('teams', teamId, {
        pendingRequests: (team.pendingRequests ?? []).filter((id) => id !== requesterId),
      });
    }
    // NÃO escrever em /users/{requesterId}: o capitão não é dono desse documento
    // (rules). A associação do atleta é descoberta via /players (useFirestoreSync).
    await notifyJoinRequestResult(requesterId, true, request.teamName);
    return;
  }

  // ── Recusa (fluxo inalterado) ───────────────────────────────────────────────
  await updateDocument('join_requests', requestId, {
    status: 'rejected',
    respondedAt: new Date().toISOString(),
  });

  const team = await getDocument<Team>('teams', teamId);
  if (team) {
    await updateDocument('teams', teamId, {
      pendingRequests: (team.pendingRequests ?? []).filter((id) => id !== requesterId),
    });
  }

  await notifyJoinRequestResult(requesterId, false, request.teamName);
}

/**
 * AUD-04: remoção de atleta segura para o histórico.
 * Se o atleta tem qualquer match_event (gol, cartão, assistência), NÃO apaga o
 * documento — apenas marca status='removido' (preservando teamId/championshipId
 * para artilharia, disciplina e histórico final). Sem histórico, remove de fato.
 * Em ambos os casos mantém a contagem de vagas do time consistente.
 *
 * Retorna 'soft' (preservado) ou 'hard' (removido fisicamente).
 */
export async function removePlayerFromRoster(player: Player): Promise<'soft' | 'hard'> {
  const events = await getCollection<MatchEvent>('match_events', [
    { field: 'playerId', operator: '==', value: player.id },
  ]);
  const hasHistory = events.length > 0;

  if (hasHistory) {
    await updateDocument('players', player.id, {
      status: 'removido',
      leftAt: new Date().toISOString(),
    });
  } else {
    await deleteDocument('players', player.id);
  }

  // NÃO escrever em /users/{player.userId}: o capitão não é dono desse documento
  // (rules). O update em /players acima é suficiente para o sync.

  if (player.teamId && player.userId) {
    await markTeamMembershipInactive(player.teamId, player.userId, 'removido');
  }

  // Recalcula a contagem autoritativa de vagas após a remoção (auto-corrige drift).
  if (player.teamId) {
    await recomputeApprovedCount(player.teamId);
  }

  return hasHistory ? 'soft' : 'hard';
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
    if (team.status !== 'aprovado') return 'error';
    if (!(await isChampionshipOpenForRegistration(team.championshipId))) return 'error';

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
  if (countActivePlayers(roster, teamId) >= maxPlayers) return;

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
  const userId = USE_MOCK ? getMockActiveUser().id : auth.currentUser?.uid;
  if (!userId) return 'not_authenticated';

  if (USE_MOCK) {
    const [player, team, championship] = await Promise.all([
      getDocument<Player>('players', playerId),
      getDocument<Team>('teams', teamId),
      getDocument<Championship>('championships', championshipId),
    ]);

    if (!player || !team || !championship) return 'not_found';
    if (player.userId !== userId || player.teamId !== teamId || team.championshipId !== championshipId) {
      return 'not_allowed';
    }
    if (isTeamCaptain(userId, team)) return 'not_allowed';
    if (championship.status === 'finalizado') return 'championship_finished';

    const roster = await getCollection<Player>('players', [
      { field: 'teamId', operator: '==', value: teamId },
    ]);
    const matches = await getCollection<{ status: string; homeTeamId: string; awayTeamId: string }>('matches', [
      { field: 'championshipId', operator: '==', value: championshipId },
    ]);
    const activeRoster = roster.filter((item) => isPlayerInTeamActive(item, teamId));
    const nextApprovedPlayersCount = Math.max(
      0,
      countActivePlayers(roster, teamId) - (isPlayerInTeamActive(player, teamId) ? 1 : 0),
    );
    const hasPendingTeamMatch = matches.some(
      (match) =>
        match.status !== 'finalizado' &&
        (match.homeTeamId === teamId || match.awayTeamId === teamId),
    );
    if (activeRoster.length <= 1 && hasPendingTeamMatch) {
      return 'blocked_only_player_pending_matches';
    }

    await updateDocument('players', playerId, {
      status: 'sem_time',
      leftAt: new Date().toISOString(),
    });
    await updateDocument('users', userId, { teamId: null, championshipId: null });
    await markTeamMembershipInactive(teamId, userId, 'sem_time');
    await updateDocument('teams', teamId, {
      approvedPlayersCount: nextApprovedPlayersCount,
    });

    const pendingRequests = await getCollection<JoinRequest>('join_requests', [
      { field: 'championshipId', operator: '==', value: championshipId },
      { field: 'requesterId', operator: '==', value: userId },
      { field: 'status', operator: '==', value: 'pending' },
    ]);
    await Promise.all(
      pendingRequests
        .filter((request) => request.type === 'waitlist' || request.teamId === teamId)
        .map((request) => deleteDocument('join_requests', request.id)),
    );

    return 'success';
  }

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
    const membershipRef = doc(db, 'team_memberships', teamMembershipId(teamId, userId));

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

    if (isTeamCaptain(userId, team)) {
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
      .filter((rosterPlayer) => rosterPlayer.teamId === teamId && isActiveRosterPlayer(rosterPlayer));

    const matchSnaps = await Promise.all(
      matchSnapshot.docs.map((matchDoc) => transaction.get(matchDoc.ref)),
    );
    const membershipSnap = await transaction.get(membershipRef);
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

    // Apenas status: as rules de /players proíbem o atleta mudar o próprio teamId
    // (isNotChangingTeamOrChampionship). 'sem_time' já tira o atleta do elenco
    // ativo em todas as contagens/telas (isActiveRosterPlayer).
    transaction.update(playerRef, {
      status: 'sem_time',
      leftAt: serverTimestamp(),
    });

    const nextApprovedPlayersCount = Math.max(
      0,
      (team.approvedPlayersCount ?? activeRoster.length) -
        (isPlayerInTeamActive(player, teamId) ? 1 : 0),
    );
    transaction.update(teamRef, {
      approvedPlayersCount: nextApprovedPlayersCount,
    });

    transaction.update(userRef, {
      teamId: null,
      championshipId: null,
    });

    if (membershipSnap.exists()) {
      transaction.update(membershipRef, {
        status: 'sem_time',
        leftAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    waitlistSnapshot.docs.forEach((requestDoc) => {
      const request = requestDoc.data() as JoinRequest;
      if (request.type === 'waitlist' || request.teamId === teamId) {
        transaction.delete(requestDoc.ref);
      }
    });

    return 'success';
  });
}
