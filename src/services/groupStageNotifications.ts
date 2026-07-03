import type { GroupStageQualificationSnapshot, MatchModel, Player, Team } from '../types';
import { getCollection } from './firestore';
import { normalizeGroupId } from '../utils/groupStageStructure';
import {
  notifyGroupFixturesGenerated,
  notifyGroupsGenerated,
  notifyKnockoutGenerated,
  notifyKnockoutMatchDefined,
  notifyTeamEliminated,
  notifyTeamQualified,
} from './notificationService';

/**
 * Bloco 10.4 — orquestração das notificações do formato grupos + mata-mata.
 *
 * Todas as funções são chamadas pelo groupStageService APÓS a transação concluir e
 * SOMENTE quando o resultado não é idempotente (o call site garante isso, cumprindo
 * "não emitir em retry idempotente"). São best-effort: qualquer falha é engolida
 * para nunca reverter/mascarar a geração já persistida.
 */

interface ChampionshipAudience {
  all: string[];
  byTeam: Map<string, string[]>;
}

async function collectChampionshipAudience(
  championshipId: string,
  teams: Team[],
): Promise<ChampionshipAudience> {
  const byTeam = new Map<string, string[]>();
  const all = new Set<string>();

  for (const team of teams) {
    if (team.captainId) {
      all.add(team.captainId);
      byTeam.set(team.id, [team.captainId]);
    }
  }

  let players: Player[] = [];
  try {
    players = await getCollection<Player>('players', [
      { field: 'championshipId', operator: '==', value: championshipId },
    ]);
  } catch {
    players = [];
  }

  for (const player of players) {
    if (!player.userId) continue;
    all.add(player.userId);
    if (player.teamId) {
      const current = byTeam.get(player.teamId) ?? [];
      if (!current.includes(player.userId)) current.push(player.userId);
      byTeam.set(player.teamId, current);
    }
  }

  return { all: [...all], byTeam };
}

export async function emitGroupsGeneratedNotifications(
  championshipId: string,
  teams: Team[],
  generationVersion: number,
): Promise<void> {
  try {
    const audience = await collectChampionshipAudience(championshipId, teams);
    await notifyGroupsGenerated(championshipId, audience.all, generationVersion);
  } catch {
    // best-effort: geração já persistida não deve falhar por causa de notificação.
  }
}

export async function emitGroupFixturesGeneratedNotifications(
  championshipId: string,
  teams: Team[],
  fixturesVersion: number,
): Promise<void> {
  try {
    const audience = await collectChampionshipAudience(championshipId, teams);
    await notifyGroupFixturesGenerated(championshipId, audience.all, fixturesVersion);
  } catch {
    // best-effort
  }
}

export async function emitGroupStageTransitionNotifications(input: {
  championshipId: string;
  teams: Team[];
  snapshot: GroupStageQualificationSnapshot;
  knockoutMatches: MatchModel[];
  knockoutGenerationVersion: number;
}): Promise<void> {
  try {
    const { championshipId, teams, snapshot, knockoutMatches, knockoutGenerationVersion } = input;
    const audience = await collectChampionshipAudience(championshipId, teams);
    const qualifiedTeamIds = new Set(snapshot.qualifiers.map((q) => q.teamId));

    // Mata-mata gerado — todos os envolvidos.
    await notifyKnockoutGenerated(championshipId, audience.all, knockoutGenerationVersion);

    // Classificados e eliminados — por time, após snapshot persistido.
    for (const team of teams) {
      const teamUsers = audience.byTeam.get(team.id) ?? [];
      if (teamUsers.length === 0) continue;
      if (qualifiedTeamIds.has(team.id)) {
        await notifyTeamQualified(championshipId, team.id, team.name, snapshot.version, teamUsers);
      } else if (normalizeGroupId(team.groupId, championshipId) || team.groupAssignmentVersion != null) {
        await notifyTeamEliminated(championshipId, team.id, team.name, snapshot.version, teamUsers);
      }
    }

    // Partidas eliminatórias já definidas (ambos os slots preenchidos).
    for (const match of knockoutMatches) {
      if (!match.homeTeamId || !match.awayTeamId) continue;
      const recipients = [
        ...(audience.byTeam.get(match.homeTeamId) ?? []),
        ...(audience.byTeam.get(match.awayTeamId) ?? []),
      ];
      if (recipients.length === 0) continue;
      await notifyKnockoutMatchDefined(
        championshipId,
        match.id,
        match.originSnapshotVersion ?? snapshot.version,
        recipients,
      );
    }
  } catch {
    // best-effort
  }
}
