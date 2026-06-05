/**
 * Championship Finisher Service
 *
 * Handles the complete flow of finishing a championship:
 * - Calculates final standings and stats
 * - Creates championship_results document
 * - Creates player_history for each player (with career fields)
 * - Upserts career_stats per userId
 * - Rebuilds all_time_rankings (top 10 per category)
 * - Grants end-of-championship achievements
 * - Updates championship status
 * - Sends push notifications to all participants
 */

import {
  Championship,
  Team,
  Player,
  MatchModel,
  MatchEvent,
  RoundAward,
  ChampionshipResultData,
  CareerStats,
  AllTimeRankingPlayer,
  AllTimeRankingTeam,
} from '../types';
import {
  addDocument,
  setDocument,
  upsertDocument,
  updateDocument,
  getDocument,
  getCollection,
} from './firestore';
import { calculateStandings, calculateTopScorers } from './statsService';
import { useAchievementStore } from '../stores/achievementStore';
import { getTokensForChampionship, sendPushNotification } from './notificationService';

interface FinishChampionshipResult {
  success: boolean;
  resultData?: ChampionshipResultData;
  error?: string;
}

export async function finishChampionship(
  championshipId: string,
): Promise<FinishChampionshipResult> {
  try {
    // 1. Fetch all necessary data
    const [championships, teams, players, matches, events, roundAwards] = await Promise.all([
      getCollection<Championship>('championships', [
        { field: 'id', operator: '==', value: championshipId },
      ]),
      getCollection<Team>('teams', [
        { field: 'championshipId', operator: '==', value: championshipId },
      ]),
      getCollection<Player>('players', [
        { field: 'championshipId', operator: '==', value: championshipId },
      ]),
      getCollection<MatchModel>('matches', [
        { field: 'championshipId', operator: '==', value: championshipId },
      ]),
      getCollection<MatchEvent>('match_events', [
        { field: 'championshipId', operator: '==', value: championshipId },
      ]),
      getCollection<RoundAward>('round_awards', [
        { field: 'championshipId', operator: '==', value: championshipId },
      ]),
    ]);

    const championship = championships[0];
    if (!championship) {
      return { success: false, error: 'Campeonato não encontrado' };
    }

    const matchIds = new Set(matches.map((m) => m.id));
    const champEvents = events.filter((e) => matchIds.has(e.matchId));
    const finishedMatches = matches.filter((m) => m.status === 'finalizado');

    // 2. Calculate final results
    const standings = calculateStandings(finishedMatches, champEvents, teams, championship.rules);
    const topScorers = calculateTopScorers(champEvents, players, teams);

    const winner = standings[0];
    const runnerUp = standings[1];

    const winnerTeam = teams.find((t) => t.id === winner?.teamId);
    const runnerUpTeam = teams.find((t) => t.id === runnerUp?.teamId);

    const topScorer = topScorers[0];
    const topScorerPlayer = players.find((p) => p.id === topScorer?.playerId);

    const bestDefense = [...standings].sort((a, b) => a.goalsAgainst - b.goalsAgainst)[0];
    const bestDefenseTeam = teams.find((t) => t.id === bestDefense?.teamId);

    // MVP: player with most total votes across all round_awards
    const votesByPlayer: Record<string, { name: string; teamId: string; votes: number }> = {};
    for (const award of roundAwards) {
      const key = award.winnerPlayerId;
      if (!votesByPlayer[key]) {
        votesByPlayer[key] = { name: award.winnerName, teamId: award.winnerTeamId, votes: 0 };
      }
      votesByPlayer[key].votes += award.totalVotes;
    }
    const mvpEntry = Object.entries(votesByPlayer).sort((a, b) => b[1].votes - a[1].votes)[0];
    const mvpPlayerId = mvpEntry?.[0];
    const mvpPlayerName = mvpEntry?.[1].name;
    const mvpVotes = mvpEntry?.[1].votes ?? 0;

    const fairPlayTeam = [...standings].sort((a, b) => a.fairPlayScore - b.fairPlayScore)[0];
    const fairPlayTeamData = teams.find((t) => t.id === fairPlayTeam?.teamId);

    const totalGoals = champEvents.filter((e) => e.type === 'gol').length;
    const now = new Date().toISOString();
    // Prefer explicit season field; fall back to year of createdAt
    const season = championship.season ?? new Date(championship.createdAt).getFullYear().toString();

    // 3. Create championship_results document
    const resultData: ChampionshipResultData = {
      id: championshipId,
      championshipId,
      championshipName: championship.name,
      season,
      format: championship.format,
      totalTeams: teams.length,
      totalPlayers: players.length,
      totalMatches: finishedMatches.length,
      totalGoals,
      winnerId: winnerTeam?.id ?? '',
      winnerName: winnerTeam?.name ?? '',
      winnerTeamColor: winnerTeam?.primaryColor,
      runnerUpId: runnerUpTeam?.id ?? '',
      runnerUpName: runnerUpTeam?.name ?? '',
      topScorerId: topScorerPlayer?.id ?? '',
      topScorerName: topScorerPlayer?.name ?? '',
      topScorerGoals: topScorer?.goals ?? 0,
      bestDefenseId: bestDefenseTeam?.id ?? '',
      bestDefenseName: bestDefenseTeam?.name ?? '',
      bestDefenseGoals: bestDefense?.goalsAgainst ?? 0,
      mvpPlayerId,
      mvpPlayerName,
      mvpVotes,
      fairPlayTeamId: fairPlayTeamData?.id,
      fairPlayTeamName: fairPlayTeamData?.name,
      fairPlayCards: fairPlayTeam?.fairPlayScore,
      finishedAt: now,
      organizerId: championship.organizerId,
    };

    await setDocument('championship_results', championshipId, resultData);

    // Build round MVP count per player.id (not userId)
    const roundMvpCountByPlayerId: Record<string, number> = {};
    for (const award of roundAwards) {
      roundMvpCountByPlayerId[award.winnerPlayerId] =
        (roundMvpCountByPlayerId[award.winnerPlayerId] ?? 0) + 1;
    }

    // 4. Create player_history for each player, grant achievements, upsert career_stats
    const achievementStore = useAchievementStore.getState();

    for (const player of players) {
      const playerGoals = champEvents.filter(
        (e) => e.type === 'gol' && e.playerId === player.id,
      ).length;
      const playerAssists = champEvents.filter(
        (e) => e.type === 'assistencia' && e.playerId === player.id,
      ).length;
      const playerYellowCards = champEvents.filter(
        (e) => e.type === 'cartao_amarelo' && e.playerId === player.id,
      ).length;
      const playerRedCards = champEvents.filter(
        (e) => e.type === 'cartao_vermelho' && e.playerId === player.id,
      ).length;
      const playerMatchesPlayed = finishedMatches.filter(
        (m) => m.homeTeamId === player.teamId || m.awayTeamId === player.teamId,
      ).length;

      const team = teams.find((t) => t.id === player.teamId);
      const isChampion = player.teamId === winnerTeam?.id;
      const roundMvpCount = roundMvpCountByPlayerId[player.id] ?? 0;
      const isMvp = roundMvpCount > 0;
      const playerOverall = calculatePlayerOverall(
        playerGoals,
        playerMatchesPlayed,
        playerYellowCards,
        playerRedCards,
      );

      if (player.userId) {
        await addDocument('player_history', {
          playerId: player.id,
          userId: player.userId,
          championshipId,
          championshipName: championship.name,
          teamId: player.teamId ?? '',
          teamName: team?.name ?? '',
          season,
          goals: playerGoals,
          assists: playerAssists,
          yellowCards: playerYellowCards,
          redCards: playerRedCards,
          matchesPlayed: playerMatchesPlayed,
          overall: playerOverall,
          finishedAt: now,
          position: player.position,
          isChampion,
          isMvp,
          roundMvpCount,
        });

        // Upsert career_stats/{userId}
        await upsertCareerStats({
          userId: player.userId,
          name: player.name,
          teamName: team?.name ?? '',
          goals: playerGoals,
          assists: playerAssists,
          matchesPlayed: playerMatchesPlayed,
          isChampion,
          roundMvpCount,
          overall: playerOverall,
          season,
          now,
        });
      }

      // Grant achievements
      if (isChampion && !achievementStore.hasAchievement(player.id, 'campeao')) {
        achievementStore.grantAchievement({
          achievementId: 'campeao',
          playerId: player.id,
          championshipId,
          unlockedAt: now,
        });
      }

      if (player.teamId === runnerUpTeam?.id && !achievementStore.hasAchievement(player.id, 'vice_campeao')) {
        achievementStore.grantAchievement({
          achievementId: 'vice_campeao',
          playerId: player.id,
          championshipId,
          unlockedAt: now,
        });
      }

      if (player.id === topScorerPlayer?.id && !achievementStore.hasAchievement(player.id, 'artilheiro_campeonato')) {
        achievementStore.grantAchievement({
          achievementId: 'artilheiro_campeonato',
          playerId: player.id,
          championshipId,
          unlockedAt: now,
        });
      }

      if (
        playerYellowCards === 0 &&
        playerRedCards === 0 &&
        playerMatchesPlayed > 0 &&
        !achievementStore.hasAchievement(player.id, 'fair_play_campeonato')
      ) {
        achievementStore.grantAchievement({
          achievementId: 'fair_play_campeonato',
          playerId: player.id,
          championshipId,
          unlockedAt: now,
        });
      }
    }

    // 5. Rebuild all_time_rankings
    await rebuildAllTimeRankings();

    // 6. Update championship status
    await updateDocument('championships', championshipId, {
      status: 'finalizado',
      finishedAt: now,
    });

    // 7. Send push notification to all participants
    try {
      const tokens = await getTokensForChampionship(championshipId);
      if (tokens.length > 0) {
        await sendPushNotification(
          tokens,
          '🏆 Campeonato encerrado!',
          `${championship.name} chegou ao fim! Campeão: ${winnerTeam?.name ?? 'Time vencedor'}`,
          { championshipId, type: 'championship_finished' },
        );
      }
    } catch (notifyError) {
      console.warn('[finishChampionship] Push notification error:', notifyError);
    }

    return { success: true, resultData };
  } catch (error) {
    console.error('[finishChampionship] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

// ── Career Stats upsert ───────────────────────────────────────────────────────

interface UpsertCareerStatsParams {
  userId: string;
  name: string;
  teamName: string;
  goals: number;
  assists: number;
  matchesPlayed: number;
  isChampion: boolean;
  roundMvpCount: number;
  overall: number;
  season: string;
  now: string;
}

async function upsertCareerStats(params: UpsertCareerStatsParams): Promise<void> {
  const { userId, name, teamName, goals, assists, matchesPlayed, isChampion, roundMvpCount, overall, season, now } = params;

  const existing = await getDocument<CareerStats>('career_stats', userId);

  if (!existing) {
    await setDocument<CareerStats>('career_stats', userId, {
      userId,
      name,
      lastTeamName: teamName,
      totalGoals: goals,
      totalAssists: assists,
      totalMatches: matchesPlayed,
      totalTitles: isChampion ? 1 : 0,
      totalMvps: roundMvpCount,
      totalChampionships: 1,
      bestOverall: overall,
      bestSeason: season,
      bestSeasonGoals: goals,
      firstSeasonYear: season,
      updatedAt: now,
    });
    return;
  }

  const isBetterSeason = goals > existing.bestSeasonGoals;

  await upsertDocument<Omit<CareerStats, 'id'>>('career_stats', userId, {
    userId,
    name,
    lastTeamName: teamName,
    totalGoals: existing.totalGoals + goals,
    totalAssists: (existing.totalAssists ?? 0) + assists,
    totalMatches: existing.totalMatches + matchesPlayed,
    totalTitles: existing.totalTitles + (isChampion ? 1 : 0),
    totalMvps: existing.totalMvps + roundMvpCount,
    totalChampionships: existing.totalChampionships + 1,
    bestOverall: Math.max(existing.bestOverall, overall),
    bestSeason: isBetterSeason ? season : existing.bestSeason,
    bestSeasonGoals: isBetterSeason ? goals : existing.bestSeasonGoals,
    firstSeasonYear: existing.firstSeasonYear,
    updatedAt: now,
  });
}

// ── All-Time Rankings rebuild ─────────────────────────────────────────────────

async function rebuildAllTimeRankings(): Promise<void> {
  const [allCareerStats, allResults] = await Promise.all([
    getCollection<CareerStats>('career_stats'),
    getCollection<ChampionshipResultData>('championship_results'),
  ]);

  const toPlayer = (s: CareerStats): Omit<AllTimeRankingPlayer, 'goals' | 'titles' | 'matches' | 'mvps'> => ({
    userId: s.userId,
    name: s.name,
    teamName: s.lastTeamName,
    seasons: s.totalChampionships,
  });

  const topScorers: AllTimeRankingPlayer[] = [...allCareerStats]
    .sort((a, b) => b.totalGoals - a.totalGoals)
    .slice(0, 10)
    .map((s) => ({ ...toPlayer(s), goals: s.totalGoals }));

  const topTitles: AllTimeRankingPlayer[] = [...allCareerStats]
    .sort((a, b) => b.totalTitles - a.totalTitles)
    .slice(0, 10)
    .map((s) => ({ ...toPlayer(s), titles: s.totalTitles }));

  const topMatches: AllTimeRankingPlayer[] = [...allCareerStats]
    .sort((a, b) => b.totalMatches - a.totalMatches)
    .slice(0, 10)
    .map((s) => ({ ...toPlayer(s), matches: s.totalMatches }));

  const topMvps: AllTimeRankingPlayer[] = [...allCareerStats]
    .sort((a, b) => b.totalMvps - a.totalMvps)
    .slice(0, 10)
    .map((s) => ({ ...toPlayer(s), mvps: s.totalMvps }));

  // Team titles: group by winner name across all results
  const teamTitleMap: Record<string, { teamId: string; name: string; titles: number }> = {};
  for (const result of allResults) {
    if (!result.winnerId || !result.winnerName) continue;
    const key = result.winnerName;
    if (!teamTitleMap[key]) {
      teamTitleMap[key] = { teamId: result.winnerId, name: result.winnerName, titles: 0 };
    }
    teamTitleMap[key].titles += 1;
  }
  const topTeams: AllTimeRankingTeam[] = Object.values(teamTitleMap)
    .sort((a, b) => b.titles - a.titles)
    .slice(0, 10)
    .map((t) => ({ teamId: t.teamId, name: t.name, titles: t.titles, participations: t.titles }));

  await Promise.all([
    upsertDocument('all_time_rankings', 'top_scorers', { players: topScorers }),
    upsertDocument('all_time_rankings', 'top_titles', { players: topTitles }),
    upsertDocument('all_time_rankings', 'top_matches', { players: topMatches }),
    upsertDocument('all_time_rankings', 'top_mvps', { players: topMvps }),
    upsertDocument('all_time_rankings', 'top_teams', { teams: topTeams }),
  ]);
}

// ── Overall calculation ───────────────────────────────────────────────────────

function calculatePlayerOverall(
  goals: number,
  matchesPlayed: number,
  yellowCards: number,
  redCards: number,
): number {
  let overall = 50;
  overall += Math.min(goals * 3, 30);
  overall += Math.min(matchesPlayed * 1.5, 15);
  overall -= yellowCards * 1;
  overall -= redCards * 3;
  return Math.max(40, Math.min(99, Math.round(overall)));
}
