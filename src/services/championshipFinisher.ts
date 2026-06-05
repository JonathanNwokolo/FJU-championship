/**
 * Championship Finisher Service
 * 
 * Handles the complete flow of finishing a championship:
 * - Calculates final standings and stats
 * - Creates championship_results document
 * - Creates player_history for each player
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
} from '../types';
import {
  addDocument,
  setDocument,
  updateDocument,
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

/**
 * Main function to finish a championship
 */
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

    // Filter events that belong to championship matches
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

    // Top scorer
    const topScorer = topScorers[0];
    const topScorerPlayer = players.find((p) => p.id === topScorer?.playerId);

    // Best defense (least goals against)
    const bestDefense = [...standings].sort((a, b) => a.goalsAgainst - b.goalsAgainst)[0];
    const bestDefenseTeam = teams.find((t) => t.id === bestDefense?.teamId);

    // MVP (player with most votes across all round_awards)
    const votesByPlayer: Record<string, { name: string; teamId: string; votes: number }> = {};
    for (const award of roundAwards) {
      const key = award.winnerPlayerId;
      if (!votesByPlayer[key]) {
        votesByPlayer[key] = {
          name: award.winnerName,
          teamId: award.winnerTeamId,
          votes: 0,
        };
      }
      votesByPlayer[key].votes += award.totalVotes;
    }
    const mvpEntry = Object.entries(votesByPlayer).sort((a, b) => b[1].votes - a[1].votes)[0];
    const mvpPlayerId = mvpEntry?.[0];
    const mvpPlayerName = mvpEntry?.[1].name;
    const mvpVotes = mvpEntry?.[1].votes ?? 0;

    // Fair play team (least cards)
    const fairPlayTeam = [...standings].sort((a, b) => a.fairPlayScore - b.fairPlayScore)[0];
    const fairPlayTeamData = teams.find((t) => t.id === fairPlayTeam?.teamId);

    // Total stats
    const totalGoals = champEvents.filter((e) => e.type === 'gol').length;
    const now = new Date().toISOString();
    const season = new Date(championship.createdAt).getFullYear().toString();

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

    // 4. Create player_history for each player and grant achievements
    const achievementStore = useAchievementStore.getState();
    
    for (const player of players) {
      // Calculate individual stats
      const playerGoals = champEvents.filter(
        (e) => e.type === 'gol' && e.playerId === player.id,
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

      // Create player_history entry
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
          yellowCards: playerYellowCards,
          redCards: playerRedCards,
          matchesPlayed: playerMatchesPlayed,
          overall: calculatePlayerOverall(playerGoals, playerMatchesPlayed, playerYellowCards, playerRedCards),
          finishedAt: now,
          position: player.position,
        });
      }

      // Grant achievements
      // Champion achievement
      if (player.teamId === winnerTeam?.id && !achievementStore.hasAchievement(player.id, 'campeao')) {
        achievementStore.grantAchievement({
          achievementId: 'campeao',
          playerId: player.id,
          championshipId,
          unlockedAt: now,
        });
      }

      // Vice-champion achievement
      if (player.teamId === runnerUpTeam?.id && !achievementStore.hasAchievement(player.id, 'vice_campeao')) {
        achievementStore.grantAchievement({
          achievementId: 'vice_campeao',
          playerId: player.id,
          championshipId,
          unlockedAt: now,
        });
      }

      // Top scorer achievement
      if (player.id === topScorerPlayer?.id && !achievementStore.hasAchievement(player.id, 'artilheiro_campeonato')) {
        achievementStore.grantAchievement({
          achievementId: 'artilheiro_campeonato',
          playerId: player.id,
          championshipId,
          unlockedAt: now,
        });
      }

      // Fair play achievement (no cards at all)
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

    // 5. Update championship status
    await updateDocument('championships', championshipId, {
      status: 'finalizado',
      finishedAt: now,
    });

    // 6. Send push notification to all participants
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
      // Don't fail the whole operation if notifications fail
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

/**
 * Simple overall calculation for player history
 */
function calculatePlayerOverall(
  goals: number,
  matchesPlayed: number,
  yellowCards: number,
  redCards: number,
): number {
  // Base overall
  let overall = 50;

  // Goals contribution (max +30)
  overall += Math.min(goals * 3, 30);

  // Matches played bonus (max +15)
  overall += Math.min(matchesPlayed * 1.5, 15);

  // Card penalties
  overall -= yellowCards * 1;
  overall -= redCards * 3;

  // Clamp between 40 and 99
  return Math.max(40, Math.min(99, Math.round(overall)));
}
