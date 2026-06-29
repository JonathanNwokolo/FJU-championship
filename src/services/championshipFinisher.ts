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
  PlayerHistoryEntry,
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
import { hasAchievement, grantAchievement } from './achievementService';
import { getTokensForChampionship, sendPushNotification } from './notificationService';
import { calculateOverall } from '../utils/playerOverall';
import { isActiveRosterPlayer } from '../utils/teamRules';

interface FinishChampionshipResult {
  success: boolean;
  resultData?: ChampionshipResultData;
  error?: string;
}

const BRACKET_ROUND_RANK: Record<string, number> = {
  grupo: 0,
  fase_32: 1,
  fase_16: 2,
  oitavas: 3,
  quartas: 4,
  semi: 5,
  final: 6,
};

function getFinalizedKnockoutFinal(matches: MatchModel[]): MatchModel | null {
  return [...matches]
    .filter((match) => match.status === 'finalizado' && !!match.winnerId)
    .sort((a, b) => {
      const rankDiff =
        (BRACKET_ROUND_RANK[b.bracketRound ?? ''] ?? 0) -
        (BRACKET_ROUND_RANK[a.bracketRound ?? ''] ?? 0);
      return rankDiff || b.round - a.round;
    })[0] ?? null;
}

/**
 * AUD-01: uma partida está "pendente" se ainda não foi finalizada E já tem os dois
 * times definidos (partidas de mata-mata de rodadas futuras, sem confronto definido,
 * não contam). Cobre agendadas e ao vivo.
 */
function getPendingMatches(matches: MatchModel[]): MatchModel[] {
  return matches.filter(
    (m) => m.status !== 'finalizado' && !!m.homeTeamId && !!m.awayTeamId,
  );
}

export function dedupeRoundAwards(roundAwards: RoundAward[]): RoundAward[] {
  const byRound = new Map<string, RoundAward[]>();
  for (const award of roundAwards) {
    const key = `${award.championshipId}_${award.round}`;
    byRound.set(key, [...(byRound.get(key) ?? []), award]);
  }

  return [...byRound.entries()].map(([key, awards]) => {
    const deterministic = awards.find((award) => award.id === key);
    if (deterministic) return deterministic;

    const winnerIds = new Set(awards.map((award) => award.winnerPlayerId));
    if (winnerIds.size > 1) {
      console.warn(
        `[championshipFinisher] conflicting legacy round_awards for ${key}; using oldest closedAt then id`,
      );
    }

    return [...awards].sort((a, b) => {
      const closedAtDiff = (a.closedAt ?? '').localeCompare(b.closedAt ?? '');
      if (closedAtDiff !== 0) return closedAtDiff;
      return a.id.localeCompare(b.id);
    })[0];
  });
}

export interface FinishChampionshipOptions {
  // Pula a checagem de partidas pendentes. Usado APENAS no encerramento automático
  // do mata-mata (ao finalizar a partida final), onde a conclusão é garantida por
  // ter chegado à final e o write da própria final pode ainda estar propagando.
  skipPendingMatchesCheck?: boolean;
}

export async function finishChampionship(
  championshipId: string,
  options: FinishChampionshipOptions = {},
): Promise<FinishChampionshipResult> {
  try {
    // 0. Idempotency guard: if this championship was already finished, return the
    // stored result instead of re-running the whole pipeline (which would create
    // duplicate player_history and inflate career_stats).
    const existingResult = await getDocument<ChampionshipResultData>(
      'championship_results',
      championshipId,
    );
    if (existingResult) {
      return { success: true, resultData: existingResult };
    }

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

    // AUD-01: bloqueia finalização com partidas ainda em aberto (também quando o
    // service é chamado diretamente), exceto no encerramento automático do mata-mata.
    if (!options.skipPendingMatchesCheck) {
      const pending = getPendingMatches(matches);
      if (pending.length > 0) {
        return {
          success: false,
          error: `Existem ${pending.length} partidas ainda não finalizadas. Encerre todas as partidas antes de finalizar o campeonato.`,
        };
      }
    }

    const matchIds = new Set(matches.map((m) => m.id));
    const champEvents = events.filter((e) => matchIds.has(e.matchId));
    const finishedMatches = matches.filter((m) => m.status === 'finalizado');
    const uniqueRoundAwards = dedupeRoundAwards(roundAwards);

    // 2. Calculate final results
    const standings = calculateStandings(finishedMatches, champEvents, teams, championship.rules);
    const topScorers = calculateTopScorers(champEvents, players, teams);

    const winner = standings[0];
    const runnerUp = standings[1];

    const finalMatch =
      championship.format === 'mata_mata' ? getFinalizedKnockoutFinal(finishedMatches) : null;
    const knockoutWinnerTeam = finalMatch?.winnerId
      ? teams.find((t) => t.id === finalMatch.winnerId)
      : undefined;
    const knockoutRunnerUpId = finalMatch?.winnerId
      ? finalMatch.homeTeamId === finalMatch.winnerId
        ? finalMatch.awayTeamId
        : finalMatch.homeTeamId
      : undefined;
    const knockoutRunnerUpTeam = knockoutRunnerUpId
      ? teams.find((t) => t.id === knockoutRunnerUpId)
      : undefined;

    const winnerTeam = knockoutWinnerTeam ?? teams.find((t) => t.id === winner?.teamId);
    const runnerUpTeam = knockoutRunnerUpTeam ?? teams.find((t) => t.id === runnerUp?.teamId);

    const topScorer = topScorers[0];
    const topScorerPlayer = players.find((p) => p.id === topScorer?.playerId);

    const bestDefense = [...standings].sort((a, b) => a.goalsAgainst - b.goalsAgainst)[0];
    const bestDefenseTeam = teams.find((t) => t.id === bestDefense?.teamId);

    // MVP: player with most total votes across all round_awards
    const votesByPlayer: Record<string, { name: string; teamId: string; votes: number }> = {};
    for (const award of uniqueRoundAwards) {
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
      // AUD-04: usa o snapshot do evento como fallback caso o doc do player não exista.
      topScorerId: topScorerPlayer?.id ?? topScorer?.playerId ?? '',
      topScorerName: topScorerPlayer?.name ?? topScorer?.playerName ?? '',
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
    for (const award of uniqueRoundAwards) {
      roundMvpCountByPlayerId[award.winnerPlayerId] =
        (roundMvpCountByPlayerId[award.winnerPlayerId] ?? 0) + 1;
    }

    // 4. Create player_history for each player, grant achievements, recalc career_stats

    // Idempotency: collect which users already have history for this championship
    // so we never create duplicate player_history entries on a partial re-run.
    const existingHistory = await getCollection<PlayerHistoryEntry>('player_history', [
      { field: 'championshipId', operator: '==', value: championshipId },
    ]);
    const userIdsWithHistory = new Set(existingHistory.map((h) => h.userId));

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
      // Título/vice só para o elenco ATIVO no encerramento: docs 'sem_time'
      // (e 'removido') retêm o teamId antigo apenas para fins históricos.
      const isChampion = isActiveRosterPlayer(player) && player.teamId === winnerTeam?.id;
      const roundMvpCount = roundMvpCountByPlayerId[player.id] ?? 0;
      const isMvp = roundMvpCount > 0;
      const playerOverall = calculateOverall(
        playerGoals,
        playerYellowCards,
        playerRedCards,
        playerMatchesPlayed,
      );

      if (player.userId) {
        // Skip duplicate history creation (idempotent), but still recalc career_stats.
        if (!userIdsWithHistory.has(player.userId)) {
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
          userIdsWithHistory.add(player.userId);
        }

        // Recalculate career_stats/{userId} from scratch over ALL player_history.
        await recalcCareerStats(player.userId, player.name, team?.name ?? '', now);
      }

      // Grant end-of-championship achievements (Firestore is the source of truth)
      if (isChampion && !(await hasAchievement(player.id, 'campeao'))) {
        await grantAchievement({
          achievementId: 'campeao',
          playerId: player.id,
          championshipId,
          unlockedAt: now,
        });
      }

      if (
        isActiveRosterPlayer(player) &&
        player.teamId === runnerUpTeam?.id &&
        !(await hasAchievement(player.id, 'vice_campeao'))
      ) {
        await grantAchievement({
          achievementId: 'vice_campeao',
          playerId: player.id,
          championshipId,
          unlockedAt: now,
        });
      }

      if (
        player.id === topScorerPlayer?.id &&
        !(await hasAchievement(player.id, 'artilheiro_campeonato'))
      ) {
        await grantAchievement({
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
        !(await hasAchievement(player.id, 'fair_play_campeonato'))
      ) {
        await grantAchievement({
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

// ── Career Stats (recalculated from scratch → idempotent) ─────────────────────

/**
 * Rebuilds career_stats/{userId} by summing ALL of the user's player_history
 * entries from zero. Because nothing is incremented relative to a previous value,
 * running the finisher more than once produces the same totals (idempotent).
 */
async function recalcCareerStats(
  userId: string,
  name: string,
  lastTeamName: string,
  now: string,
): Promise<void> {
  const history = await getCollection<PlayerHistoryEntry>('player_history', [
    { field: 'userId', operator: '==', value: userId },
  ]);
  if (history.length === 0) return;

  let totalGoals = 0;
  let totalAssists = 0;
  let totalMatches = 0;
  let totalTitles = 0;
  let totalMvps = 0;
  let bestOverall = 0;
  let bestSeasonGoals = 0;
  let bestSeason = history[0].season;
  let firstSeasonYear = history[0].season;

  for (const h of history) {
    totalGoals += h.goals ?? 0;
    totalAssists += h.assists ?? 0;
    totalMatches += h.matchesPlayed ?? 0;
    totalTitles += h.isChampion ? 1 : 0;
    totalMvps += h.roundMvpCount ?? 0;
    bestOverall = Math.max(bestOverall, h.overall ?? 0);
    if ((h.goals ?? 0) > bestSeasonGoals) {
      bestSeasonGoals = h.goals ?? 0;
      bestSeason = h.season;
    }
    if (h.season < firstSeasonYear) firstSeasonYear = h.season;
  }

  await upsertDocument<Omit<CareerStats, 'id'>>('career_stats', userId, {
    userId,
    name,
    lastTeamName,
    totalGoals,
    totalAssists,
    totalMatches,
    totalTitles,
    totalMvps,
    totalChampionships: history.length,
    bestOverall,
    bestSeason,
    bestSeasonGoals,
    firstSeasonYear,
    updatedAt: now,
  });
}

// ── All-Time Rankings rebuild ─────────────────────────────────────────────────

async function rebuildAllTimeRankings(): Promise<void> {
  const [allCareerStats, allResults, allPlayerHistory] = await Promise.all([
    getCollection<CareerStats>('career_stats'),
    getCollection<ChampionshipResultData>('championship_results'),
    getCollection<PlayerHistoryEntry>('player_history'),
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

  const teamParticipationMap: Record<string, Set<string>> = {};
  for (const entry of allPlayerHistory) {
    if (!entry.teamName || !entry.championshipId) continue;
    teamParticipationMap[entry.teamName] ??= new Set<string>();
    teamParticipationMap[entry.teamName].add(entry.championshipId);
  }

  const topTeams: AllTimeRankingTeam[] = Object.values(teamTitleMap)
    .sort((a, b) => b.titles - a.titles)
    .slice(0, 10)
    .map((t) => ({
      teamId: t.teamId,
      name: t.name,
      titles: t.titles,
      participations: teamParticipationMap[t.name]?.size ?? t.titles,
    }));

  // IDs sem prefixo 'top_' para bater com useAllTimeRankings (category → docId)
  await Promise.all([
    upsertDocument('all_time_rankings', 'scorers', { players: topScorers }),
    upsertDocument('all_time_rankings', 'titles', { players: topTitles }),
    upsertDocument('all_time_rankings', 'matches', { players: topMatches }),
    upsertDocument('all_time_rankings', 'mvps', { players: topMvps }),
    upsertDocument('all_time_rankings', 'teams', { teams: topTeams }),
  ]);
}
